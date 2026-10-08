"""Identity-compatible access tokens for API tests."""

import base64
import time
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives import serialization

from app.auth import public_keyring


def key_env(key):
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return {
        "AUTH_JWT_PUBLIC_KEYS": base64.b64encode(pem).decode(),
        "NODE_ENV": "test",
        "ML_PREDICTION_CORS_ORIGINS": "https://ui.example",
    }


def token(key, *, claims=None, headers=None):
    kid = next(iter(public_keyring(key_env(key)["AUTH_JWT_PUBLIC_KEYS"], production=False)))
    payload = {
        "sub": str(uuid4()),
        "exp": int(time.time()) + 120,
        "iat": int(time.time()),
        "iss": "tradeiq-identity-auth",
        "aud": "tradeiq-spa",
    }
    payload.update(claims or {})
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": kid, **(headers or {})})
