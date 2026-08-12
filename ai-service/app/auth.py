"""Shared-secret auth.

This service has no user auth - api-service is the only caller, and it proves
itself with a token both services read from the same env var.
"""

import secrets

from fastapi import Header

from app.config import get_settings
from app.errors import ErrorCode, ServiceError


async def require_service_token(
    x_service_token: str | None = Header(default=None, alias="X-Service-Token"),
) -> None:
    """FastAPI dependency. Add to every route except /health."""
    expected = get_settings().service_token

    # Constant-time compare. The window is tiny over a local network, but a
    # timing-safe compare costs nothing.
    if x_service_token is None or not secrets.compare_digest(x_service_token, expected):
        raise ServiceError(
            ErrorCode.INVALID_SERVICE_TOKEN,
            "Missing or invalid X-Service-Token header.",
        )
