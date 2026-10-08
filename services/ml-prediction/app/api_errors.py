"""Consistent, non-disclosing error responses and request correlation IDs."""

import logging
from uuid import uuid4

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields=None):
        self.status, self.code, self.message, self.fields = status, code, message, fields


def invalid(field: str, reason: str):
    return ApiError(
        400, "VALIDATION_FAILED", "Request validation failed.", [{"field": field, "reason": reason}]
    )


def install_errors(application):
    @application.middleware("http")
    async def response_headers(request: Request, call_next):
        request.state.trace_id = uuid4().hex
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("Unexpected ML API failure trace_id=%s", request.state.trace_id)
            response = error_response(
                request, ApiError(500, "INTERNAL", "An internal error occurred.")
            )
        response.headers["X-Request-Id"] = request.state.trace_id
        response.headers["Cache-Control"] = "private, no-store"
        return response

    def error_response(request: Request, exc: ApiError):
        payload = {"code": exc.code, "message": exc.message, "trace_id": request.state.trace_id}
        if exc.fields:
            payload["fields"] = exc.fields
        logger.warning("ML API response trace_id=%s code=%s", request.state.trace_id, exc.code)
        return JSONResponse(
            {"error": payload},
            status_code=exc.status,
            headers={"WWW-Authenticate": "Bearer"} if exc.status == 401 else {},
        )

    @application.exception_handler(ApiError)
    async def api_error(request, exc):
        return error_response(request, exc)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        fields = [
            {"field": str(item["loc"][-1]), "reason": "must match the documented input format"}
            for item in exc.errors()
        ]
        return error_response(
            request, ApiError(400, "VALIDATION_FAILED", "Request validation failed.", fields)
        )

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        code = "METHOD_NOT_ALLOWED" if exc.status_code == 405 else "NOT_FOUND"
        response = error_response(
            request,
            ApiError(
                exc.status_code,
                code,
                "Method not allowed." if exc.status_code == 405 else "Resource not found.",
            ),
        )

        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @application.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        logger.error(
            "ML database read failed trace_id=%s type=%s",
            request.state.trace_id,
            type(exc).__name__,
        )
        return error_response(
            request,
            ApiError(503, "DEPENDENCY_UNAVAILABLE", "Predictions are temporarily unavailable."),
        )
