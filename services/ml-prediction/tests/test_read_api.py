"""Boundary, authentication and failure behavior without a running database."""

import base64
import time
from contextlib import contextmanager

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.auth import public_keyring
from app.main import create_app
from app.read_repository import PRESENTATION_DEFAULT
from tests.api_helpers import key_env, token


class EmptyRepository:
    calls = 0
    disposed = False

    @contextmanager
    def snapshot(self):
        self.calls += 1
        yield self

    def latest_run(self, *, completed):
        return None

    def catalog(self, run):
        return []

    def dispose(self):
        self.disposed = True


@pytest.fixture
def api(signing_key):
    repo = EmptyRepository()
    with TestClient(create_app(key_env(signing_key), repository=repo)) as client:
        client.headers["Authorization"] = "Bearer " + token(signing_key)
        yield client, repo
    assert repo.disposed


@pytest.mark.parametrize(
    "path", ["/predictions/status", "/predictions/configurations", "/predictions/COMB.N0000"]
)
def test_anonymous_requests_do_not_open_database(api, path):
    client, repo = api
    client.headers.pop("Authorization")
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert repo.calls == 0


@pytest.mark.parametrize(
    "claims",
    [
        {"exp": 1},
        {"exp": "9999999999"},
        {"exp": True},
        {"exp": float("inf")},
        {"sub": "not-a-uuid"},
        {"sub": 42},
        {"iss": "other"},
        {"aud": "other"},
        {"nbf": int(time.time()) + 300},
        {"iat": "1"},
    ],
)
def test_reject_invalid_claims_before_database(api, signing_key, claims):
    client, repo = api
    response = client.get(
        "/predictions/status",
        headers={"Authorization": "Bearer " + token(signing_key, claims=claims)},
    )
    assert response.status_code == 401
    assert repo.calls == 0


@pytest.mark.parametrize("authorization", ["Basic abc", "Bearer garbage", "Bearer", ""])
def test_malformed_authorization(api, authorization):
    client, repo = api
    assert (
        client.get("/predictions/status", headers={"Authorization": authorization}).status_code
        == 401
    )
    assert repo.calls == 0


def test_unknown_key_and_signature(api, signing_key):
    client, repo = api
    second_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    for value in (
        token(signing_key, headers={"kid": "unknown"}),
        token(second_key),
        jwt.encode({"exp": time.time() + 100}, "s" * 32, algorithm="HS256"),
    ):
        assert (
            client.get(
                "/predictions/status", headers={"Authorization": "Bearer " + value}
            ).status_code
            == 401
        )
    assert repo.calls == 0


def test_missing_kid_and_required_claims(api, signing_key):
    client, _ = api
    for missing in ("exp", "sub", "iss", "aud", "kid"):
        encoded = token(signing_key)
        payload = jwt.decode(encoded, options={"verify_signature": False})
        headers = jwt.get_unverified_header(encoded)
        if missing == "kid":
            headers.pop("kid")
        else:
            payload.pop(missing)
        encoded = jwt.encode(payload, signing_key, algorithm="RS256", headers=headers)
        assert (
            client.get(
                "/predictions/status", headers={"Authorization": "Bearer " + encoded}
            ).status_code
            == 401
        )


def test_rotated_keys_are_accepted(signing_key):
    second = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    env = key_env(signing_key)
    env["AUTH_JWT_PUBLIC_KEYS"] += "," + key_env(second)["AUTH_JWT_PUBLIC_KEYS"]
    with TestClient(create_app(env, repository=EmptyRepository())) as client:
        for key in (signing_key, second):
            assert (
                client.get(
                    "/predictions/status", headers={"Authorization": "Bearer " + token(key)}
                ).status_code
                == 200
            )


@pytest.mark.parametrize(
    "path,field",
    [
        ("/predictions/comb.n0000", "symbol"),
        ("/predictions/" + "A" * 31, "symbol"),
        ("/predictions/COMB.N0000?config_key=bad", "config_key"),
        ("/predictions/COMB.N0000?config_key=pt0.0000_sl0.01_H24_T30", "config_key"),
        (
            f"/predictions/COMB.N0000?config_key={PRESENTATION_DEFAULT}&config_key={PRESENTATION_DEFAULT}",
            "config_key",
        ),
        ("/predictions/status?limit=1", "limit"),
        ("/predictions/configurations?limit=1", "limit"),
    ],
)
def test_input_rejected_before_database(api, path, field):
    client, repo = api
    response = client.get(path)
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_FAILED"
    assert error["fields"][0]["field"] == field
    assert error["trace_id"] == response.headers["X-Request-Id"]
    assert repo.calls == 0


def test_empty_results_and_openapi_contract(api):
    client, _ = api
    assert client.get("/predictions/configurations").json() == {
        "data": {"configurations": [], "default_config_key": None}
    }
    assert client.get("/predictions/status").json() == {
        "data": {"latest_run": None, "latest_completed_run": None}
    }
    response = client.get("/predictions/COMB.N0000")
    assert response.json() == {
        "data": {
            "symbol": "COMB.N0000",
            "config_key": None,
            "prediction": None,
            "availability": "no_completed_batch",
        }
    }
    assert response.headers["Cache-Control"] == "private, no-store"
    schema = client.get("/openapi.json").json()
    assert schema["paths"]["/predictions/{symbol}"]["get"]["security"] == [{"HTTPBearer": []}]
    assert set(schema["paths"]["/predictions/{symbol}"]["get"]["responses"]) >= {
        "200",
        "400",
        "401",
        "503",
        "500",
    }


def test_errors_do_not_leak_database_or_internal_details(api):
    client, repo = api

    def fail(*, completed):
        raise OperationalError("SELECT private SQL", {}, Exception("password=secret"))

    repo.latest_run = fail
    response = client.get("/predictions/status")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DEPENDENCY_UNAVAILABLE"
    assert "secret" not in response.text and "SQL" not in response.text

    def crash(*, completed):
        raise RuntimeError("private path /internal/model")

    repo.latest_run = crash
    response = client.get("/predictions/status", headers={"Origin": "https://ui.example"})
    assert response.headers["Access-Control-Allow-Origin"] == "https://ui.example"
    assert response.status_code == 500
    assert "internal/model" not in response.text
    assert response.json()["error"]["code"] == "INTERNAL"


def test_health_survives_missing_settings_and_database():
    with TestClient(create_app({})) as client:
        assert client.get("/health").json() == {"status": "ok", "service": "ml-prediction"}
        assert (
            client.get(
                "/predictions/status", headers={"Authorization": "Bearer anything"}
            ).status_code
            == 503
        )
        method = client.post("/predictions/status")
        assert method.json()["error"]["code"] == "METHOD_NOT_ALLOWED"
        assert method.headers["Allow"] == "GET"
        assert client.get("/does-not-exist").json()["error"]["code"] == "NOT_FOUND"


def test_explicit_cors_preflight_and_errors(api):
    client, _ = api
    response = client.options(
        "/predictions/status",
        headers={
            "Origin": "https://ui.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "https://ui.example"
    assert "Access-Control-Allow-Credentials" not in response.headers
    response = client.get("/predictions/status", headers={"Origin": "https://unknown.example"})
    assert "Access-Control-Allow-Origin" not in response.headers
    client.headers.pop("Authorization")
    response = client.get("/predictions/status", headers={"Origin": "https://ui.example"})
    assert response.headers["Access-Control-Allow-Origin"] == "https://ui.example"


@pytest.mark.parametrize("raw", ["", "bad-base64", "IA=="])
def test_invalid_key_material_is_rejected(raw):
    with pytest.raises(ValueError):
        public_keyring(raw, production=False)


def test_reject_private_weak_non_rsa_duplicate_and_production_dev_keys(signing_key):
    from pathlib import Path

    private = signing_key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    weak = rsa.generate_private_key(public_exponent=65537, key_size=1024)
    non_rsa = ec.generate_private_key(ec.SECP256R1())
    valid = key_env(signing_key)["AUTH_JWT_PUBLIC_KEYS"]
    for raw in (
        base64.b64encode(private).decode(),
        key_env(weak)["AUTH_JWT_PUBLIC_KEYS"],
        key_env(non_rsa)["AUTH_JWT_PUBLIC_KEYS"],
        valid + "," + valid,
    ):
        with pytest.raises(ValueError):
            public_keyring(raw, production=False)
    root_env = (Path(__file__).parents[3] / ".env.example").read_text()
    dev_key = next(
        line.split("=", 1)[1]
        for line in root_env.splitlines()
        if line.startswith("AUTH_JWT_PUBLIC_KEYS=")
    )
    assert public_keyring(dev_key, production=False)
    with pytest.raises(ValueError):
        public_keyring(dev_key, production=True)
    assert public_keyring(valid, production=True)


def test_bad_settings_fail_closed_and_database_unavailable(signing_key):
    env = key_env(signing_key)
    env["ML_DATABASE_URL"] = "postgresql://ml:test@127.0.0.1:1/ml"
    with TestClient(create_app(env)) as client:
        assert client.get("/health").status_code == 200
        response = client.get(
            "/predictions/status", headers={"Authorization": "Bearer " + token(signing_key)}
        )
        assert response.status_code == 503
    env["AUTH_JWT_PUBLIC_KEYS"] = "broken"
    with TestClient(create_app(env)) as client:
        assert client.get("/health").status_code == 200
        assert (
            client.get(
                "/predictions/status", headers={"Authorization": "Bearer " + token(signing_key)}
            ).status_code
            == 503
        )
