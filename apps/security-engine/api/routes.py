from fastapi import APIRouter, HTTPException, status
from cryptography.exceptions import InvalidTag

from crypto_service import CryptoService
from schemas import EncryptRequest, EncryptResponse, ValidateRequest, ValidateResponse


security_router = APIRouter()

# Initialize crypto service (in production, this would be instantiated with env variables)
try:
    crypto_service = CryptoService()
except ValueError as e:
    raise RuntimeError(f"Failed to initialize crypto service: {e}")


@security_router.get("/", tags=["Health"])
async def root():
    """Root endpoint for security API."""
    return {"message": "EventTruffle Security Engine v1.0", "status": "ready"}


@security_router.post(
    "/encrypt",
    response_model=EncryptResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate encrypted QR payload",
    description="Encrypts ticket and user information into a Base64url QR payload using AES-256-GCM.",
    tags=["Encryption"]
)
async def encrypt(request: EncryptRequest) -> EncryptResponse:
    """
    Encrypt a QR payload.

    Takes ticket_id, user_id, and optional timestamp_ms.
    Returns Base64url encoded (nonce + ciphertext + tag).

    Raises:
        HTTPException: If encryption fails (500 status code)
    """
    try:
        # Generate QR payload
        qr_payload = crypto_service.generate_qr_payload(
            ticket_id=request.ticket_id,
            user_id=request.user_id,
            timestamp_ms=request.timestamp_ms
        )

        # Encrypt
        encrypted_qr = crypto_service.encrypt(qr_payload)

        return EncryptResponse(
            success=True,
            encrypted_qr=encrypted_qr,
            timestamp_ms=qr_payload["timestamp_ms"]
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Encryption failed: {str(type(e).__name__)}"
        )


@security_router.post(
    "/validate",
    response_model=ValidateResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate encrypted QR payload",
    description="Decrypts and validates an encrypted QR payload. Checks authentication tag and TTL.",
    tags=["Validation"]
)
async def validate(request: ValidateRequest) -> ValidateResponse:
    """
    Validate an encrypted QR payload.

    Decrypts, verifies the authentication tag, and checks 30-second TTL.
    Returns validation result with extracted ticket info (if valid).

    Returns:
        ValidateResponse with:
        - valid: True if QR is authentic and within TTL
        - reason: Human-readable validation status
        - ticket_id, user_hash, timestamp_ms: Extracted from valid QR (null if invalid)
    """
    try:
        # Attempt decryption
        payload = crypto_service.decrypt(request.encrypted_qr)

        # Check TTL
        if not crypto_service.verify_timestamp(payload["timestamp_ms"], ttl_seconds=request.ttl_seconds):
            return ValidateResponse(
                valid=False,
                reason=f"QR expired (outside {request.ttl_seconds}s TTL)"
            )

        # All checks passed
        return ValidateResponse(
            valid=True,
            reason="Valid QR within TTL",
            ticket_id=payload["ticket_id"],
            user_hash=payload["user_hash"],
            timestamp_ms=payload["timestamp_ms"]
        )

    except InvalidTag:
        # Cryptographic authentication failed (tampering detected)
        return ValidateResponse(
            valid=False,
            reason="Invalid authentication tag - QR has been tampered with"
        )

    except ValueError as e:
        # Payload format or decoding error
        return ValidateResponse(
            valid=False,
            reason=f"Invalid QR format: {str(e)}"
        )

    except Exception as e:
        # Unexpected error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(type(e).__name__)}"
        )
