"""The shared error envelope from docs/03-API-CONTRACT.md.

Every failure leaves this service in the same shape. No route builds an error
body by hand - raise ServiceError, or let the handlers in main.py catch it.
"""

import secrets
from enum import StrEnum


class ErrorCode(StrEnum):
    """Mirrors the error-code table in the contract.

    Adding a value here is a contract change: update docs/03-API-CONTRACT.md and
    docs/contracts/ai-service.openapi.yaml in the same PR.
    """

    VALIDATION_FAILED = "VALIDATION_FAILED"
    MALFORMED_JSON = "MALFORMED_JSON"
    INVALID_SERVICE_TOKEN = "INVALID_SERVICE_TOKEN"
    MODEL_NOT_READY = "MODEL_NOT_READY"
    INTERNAL_ERROR = "INTERNAL_ERROR"


_STATUS = {
    ErrorCode.VALIDATION_FAILED: 400,
    ErrorCode.MALFORMED_JSON: 400,
    ErrorCode.INVALID_SERVICE_TOKEN: 401,
    ErrorCode.MODEL_NOT_READY: 503,
    ErrorCode.INTERNAL_ERROR: 500,
}


class ServiceError(Exception):
    """Raise this instead of HTTPException so the envelope stays consistent."""

    def __init__(
        self,
        code: ErrorCode,
        message: str,
        details: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    @property
    def status_code(self) -> int:
        return _STATUS[self.code]


def new_trace_id() -> str:
    """16 hex chars, generated per request and echoed in the envelope.

    Also goes on the log line, so a screenshot of an error is enough to find it.
    """
    return secrets.token_hex(8)


def envelope(
    code: ErrorCode,
    message: str,
    trace_id: str,
    details: dict[str, str] | None = None,
) -> dict:
    return {
        "error": {
            "code": str(code),
            "message": message,
            "traceId": trace_id,
            "details": details,
        }
    }
