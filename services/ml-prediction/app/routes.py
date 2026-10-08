"""Read-only prediction routes. All require a signed-in user's access token."""

import re

import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPBearer

from app.api_errors import ApiError, invalid
from app.api_models import (
    BatchAvailability,
    ConfigurationCatalog,
    ConfigurationsResponse,
    ErrorResponse,
    PredictionResponse,
    PredictionSelection,
    StatusResponse,
)
from app.auth import verify_token
from app.read_repository import batch_summary, configuration, default_key

bearer = HTTPBearer(auto_error=False)


def authenticated(request: Request, credentials=Depends(bearer)):
    if credentials is None:
        raise ApiError(401, "UNAUTHENTICATED", "A valid access token is required.")
    keys = request.app.state.keys
    if keys is None:
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "Authentication is temporarily unavailable.")
    try:
        verify_token(credentials.credentials, keys)
    except (jwt.PyJWTError, ValueError, TypeError, OverflowError):
        raise ApiError(401, "UNAUTHENTICATED", "A valid access token is required.") from None


def snapshot(request: Request):
    repository = request.app.state.repository
    if repository is None:
        raise ApiError(503, "DEPENDENCY_UNAVAILABLE", "Predictions are temporarily unavailable.")
    with repository.snapshot() as reader:
        yield reader


def check_query(request: Request, allowed: set[str]):
    for name in request.query_params:
        if name not in allowed:
            raise invalid(name, "is not a supported query parameter")
        if len(request.query_params.getlist(name)) != 1:
            raise invalid(name, "must be supplied once")


def no_query(request: Request):
    check_query(request, set())


def selection(symbol: str, request: Request, config_key: str | None = None):
    check_query(request, {"config_key"})
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9.-]{0,29}", symbol):
        raise invalid("symbol", "must be an uppercase security symbol of at most 30 characters")
    if config_key is not None:
        try:
            configuration(config_key)
        except ValueError:
            raise invalid("config_key", "must be a supported configuration key") from None
    return symbol, config_key


def prediction_router():
    router = APIRouter()
    errors = {code: {"model": ErrorResponse} for code in (400, 401, 503, 500)}
    # Declare auth before the DB dependency: anonymous requests never touch the DB.
    dependencies = [Depends(authenticated)]

    @router.get(
        "/predictions/configurations",
        summary="List saved prediction configurations",
        response_model=ConfigurationsResponse,
        dependencies=[*dependencies, Depends(no_query)],
        responses=errors,
    )
    def configurations(reader=Depends(snapshot)):
        catalog = reader.catalog(reader.latest_run(completed=True))
        return ConfigurationsResponse(
            data=ConfigurationCatalog(
                configurations=catalog, default_config_key=default_key(catalog)
            )
        )

    @router.get(
        "/predictions/status",
        summary="Read latest attempted and completed batch status",
        response_model=StatusResponse,
        dependencies=[*dependencies, Depends(no_query)],
        responses=errors,
    )
    def status(reader=Depends(snapshot)):
        return StatusResponse(
            data=BatchAvailability(
                latest_run=batch_summary(reader.latest_run(completed=False)),
                latest_completed_run=batch_summary(reader.latest_run(completed=True)),
            )
        )

    @router.get(
        "/predictions/{symbol}",
        summary="Read the latest completed prediction for a security",
        response_model=PredictionResponse,
        dependencies=dependencies,
        responses=errors,
    )
    def prediction(selected_input=Depends(selection), reader=Depends(snapshot)):
        symbol, config_key = selected_input
        run = reader.latest_run(completed=True)
        catalog = reader.catalog(run)
        selected = config_key if config_key is not None else default_key(catalog)
        if catalog and selected not in {item.config_key for item in catalog}:
            raise invalid("config_key", "must be one of the published configuration keys")
        value = reader.prediction(symbol, selected, run["model_id"]) if run else None
        availability = "available" if value else "no_prediction" if run else "no_completed_batch"
        return PredictionResponse(
            data=PredictionSelection(
                symbol=symbol, config_key=selected, prediction=value, availability=availability
            )
        )

    return router
