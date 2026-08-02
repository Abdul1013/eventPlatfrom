"""
Pydantic schemas for EventTruffle Security Engine API.

All endpoints use these schemas for request/response validation.
"""

from pydantic import BaseModel, Field, field_validator


class EncryptRequest(BaseModel):
    """Request schema for POST /encrypt endpoint."""

    ticket_id: str = Field(
        ...,
        description="UUID of the ticket",
        min_length=1,
        max_length=36,
        json_schema_extra={"example": "123e4567-e89b-12d3-a456-426614174000"},
    )
    user_id: str = Field(
        ...,
        description="UUID of the ticket owner",
        min_length=1,
        max_length=36,
        json_schema_extra={"example": "user-uuid-here"},
    )
    timestamp_ms: int | None = Field(
        default=None,
        description="Optional: milliseconds since epoch. Auto-generated if omitted.",
        gt=0,
    )

    @field_validator("ticket_id", "user_id")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("Cannot be empty")
        return v


class EncryptResponse(BaseModel):
    """Response schema for POST /encrypt endpoint."""

    success: bool = Field(..., description="Whether encryption succeeded")
    encrypted_qr: str | None = Field(
        default=None,
        description="Base64url encoded QR payload (nonce + ciphertext + tag)",
    )
    error: str | None = Field(default=None, description="Error message if encryption failed")
    timestamp_ms: int | None = Field(
        default=None,
        description="Timestamp used for encryption (milliseconds since epoch)",
    )


class ValidateRequest(BaseModel):
    """Request schema for POST /validate endpoint."""

    encrypted_qr: str = Field(
        ...,
        description="Base64url encoded QR payload to validate",
        min_length=1,
    )
    ttl_seconds: int = Field(
        default=30,
        description="Time-to-live in seconds (default 30)",
        ge=1,
        le=3600,
    )

    @field_validator("encrypted_qr")
    @classmethod
    def validate_qr_format(cls, v: str) -> str:
        if not v:
            raise ValueError("QR payload cannot be empty")
        return v


class ValidateResponse(BaseModel):
    """Response schema for POST /validate endpoint."""

    valid: bool = Field(..., description="Whether the QR code is valid and authentic")
    reason: str = Field(..., description="Reason for validity/invalidity")
    ticket_id: str | None = Field(default=None, description="Ticket ID from valid QR (null if invalid)")
    user_hash: str | None = Field(default=None, description="User hash from valid QR (null if invalid)")
    timestamp_ms: int | None = Field(default=None, description="Timestamp from valid QR (null if invalid)")
