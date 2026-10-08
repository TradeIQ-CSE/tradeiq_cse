"""Verify the identity service's public-key access-token contract."""

import base64
import hashlib
import math
from uuid import UUID

import jwt
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

DEVELOPMENT_KEY_ID = "0bIZSvQTjmqZAt-FWL3Zd9QGPgReiXdggVETF9pEN6w"


def public_keyring(raw: str, *, production: bool) -> dict[str, RSAPublicKey]:
    keys = {}
    for encoded in raw.split(","):
        pem = base64.b64decode(encoded.strip(), validate=True)
        if not pem.startswith(b"-----BEGIN PUBLIC KEY-----"):
            raise ValueError("Expected an SPKI public key")
        try:
            key = serialization.load_pem_public_key(pem)
        except UnsupportedAlgorithm as exc:
            raise ValueError("Unsupported public key") from exc
        if not isinstance(key, RSAPublicKey) or key.key_size < 2048:
            raise ValueError("Expected an RSA public key of at least 2048 bits")
        der = key.public_bytes(
            serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        kid = base64.urlsafe_b64encode(hashlib.sha256(der).digest()).decode().rstrip("=")
        if kid in keys or (production and kid == DEVELOPMENT_KEY_ID):
            raise ValueError("Duplicate or development public key")
        keys[kid] = key
    return keys


def verify_token(token: str, keys: dict[str, RSAPublicKey]) -> None:
    if len(token) > 8192:
        raise ValueError("Invalid access token")
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if header.get("alg") != "RS256" or not isinstance(kid, str) or kid not in keys:
        raise ValueError("Invalid signing key")
    claims = jwt.decode(
        token,
        keys[kid],
        algorithms=["RS256"],
        issuer="tradeiq-identity-auth",
        audience="tradeiq-spa",
        options={"require": ["exp", "sub", "iss", "aud"]},
    )
    for name in ("exp", "iat", "nbf"):
        value = claims.get(name)
        if name in claims and (type(value) not in (int, float) or not math.isfinite(value)):
            raise ValueError("Invalid token time")
    if not isinstance(claims["sub"], str):
        raise ValueError("Invalid subject")
    UUID(claims["sub"])
