"""Health and authenticated access to saved ML results."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from sqlalchemy.exc import SQLAlchemyError

from app.api_errors import install_errors
from app.auth import public_keyring
from app.read_repository import ReadRepository
from app.routes import prediction_router

logger = logging.getLogger(__name__)


def create_app(environment=None, *, repository=None) -> FastAPI:
    environment = dict(os.environ if environment is None else environment)

    @asynccontextmanager
    async def lifespan(application):
        try:
            yield
        finally:
            if application.state.repository is not None:
                application.state.repository.dispose()

    application = FastAPI(title="TradeIQ ML predictions", version="1.0.0", lifespan=lifespan)
    application.state.repository = repository
    application.state.keys = None
    try:
        mode = environment.get("NODE_ENV", "development")
        if mode not in {"development", "test", "production"}:
            raise ValueError("Invalid environment mode")
        raw = environment.get("AUTH_JWT_PUBLIC_KEYS", "")
        if raw:
            application.state.keys = public_keyring(raw, production=mode == "production")
        if repository is None and environment.get("ML_DATABASE_URL"):
            application.state.repository = ReadRepository(environment["ML_DATABASE_URL"])
    except (ValueError, TypeError, SQLAlchemyError):
        # Health remains available; protected reads fail closed until settings are fixed.
        logger.error("ML read API configuration is unavailable")
        application.state.keys = None
        application.state.repository = None

    origins = [
        v.strip()
        for v in environment.get("ML_PREDICTION_CORS_ORIGINS", "").split(",")
        if v.strip() and v.strip() != "*"
    ]
    install_errors(application)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ml-prediction"}

    application.include_router(prediction_router())

    def openapi():
        if application.openapi_schema is None:
            schema = get_openapi(
                title=application.title, version=application.version, routes=application.routes
            )
            for path in schema["paths"].values():
                for operation in path.values():
                    operation.get("responses", {}).pop("422", None)
            application.openapi_schema = schema
        return application.openapi_schema

    application.openapi = openapi
    return application


app = create_app()
