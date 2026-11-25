"""
Contract-shaped error responses: {"error": {"code": "...", "message": "..."}}.
"""

from fastapi import HTTPException
from fastapi.responses import JSONResponse


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Return a contract-shaped error JSONResponse."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


class ContractError(HTTPException):
    """HTTPException that serializes to the contract error shape."""

    def __init__(self, status_code: int, code: str, message: str):
        self.error_code = code
        self.error_message = message
        super().__init__(
            status_code=status_code,
            detail={"error": {"code": code, "message": message}},
        )
