"""
AES-256-GCM cryptographic service for EventTruffle QR code encryption/decryption.

Security Standards:
- Algorithm: AES-256-GCM (Galois/Counter Mode)
- IV: 96-bit (12 bytes) random nonce
- Tag: 128-bit (16 bytes) authenticated encryption tag
- Payload format: ticket_id | user_hash | timestamp_ms
"""

import os
import base64
import json
import hmac
import hashlib
from typing import TypedDict
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
from cryptography.exceptions import InvalidTag


class QRPayload(TypedDict):
    """QR code payload structure."""
    ticket_id: str
    user_hash: str
    timestamp_ms: int


class CryptoService:
    """Handles AES-256-GCM encryption and decryption for EventTruffle tickets."""

    def __init__(self, encryption_key: str | None = None):
        """
        Initialize crypto service with encryption key.

        Args:
            encryption_key: 64-character hex string (256 bits). If None, reads from env.

        Raises:
            ValueError: If key is invalid length or not provided.
        """
        if encryption_key is None:
            encryption_key = os.getenv("ENCRYPTION_KEY")

        if not encryption_key:
            raise ValueError(
                "ENCRYPTION_KEY environment variable not set. "
                "Generate with: openssl rand -hex 32"
            )

        if len(encryption_key) != 64:
            raise ValueError(
                f"ENCRYPTION_KEY must be 64 hex characters (256 bits), got {len(encryption_key)}"
            )

        try:
            self.key = bytes.fromhex(encryption_key)
        except ValueError as e:
            raise ValueError(f"ENCRYPTION_KEY must be valid hex: {e}")

    def generate_qr_payload(
        self, ticket_id: str, user_id: str, timestamp_ms: int | None = None
    ) -> QRPayload:
        """
        Generate QR payload with ticket ID, user hash, and timestamp.

        Args:
            ticket_id: UUID of the ticket
            user_id: UUID of the ticket owner
            timestamp_ms: Milliseconds since epoch (auto-generate if None)

        Returns:
            QRPayload dict with ticket_id, user_hash, and timestamp_ms
        """
        if timestamp_ms is None:
            timestamp_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Truncated HMAC-SHA256 of user_id (first 16 chars for brevity)
        user_hash = hmac.new(
            self.key,
            user_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:16]

        return {
            "ticket_id": ticket_id,
            "user_hash": user_hash,
            "timestamp_ms": timestamp_ms,
        }

    def encrypt(self, payload: QRPayload) -> str:
        """
        Encrypt QR payload using AES-256-GCM.

        Returns:
            Base64url string: nonce + ciphertext + tag (concatenated and encoded)

        Raises:
            Exception: If encryption fails.
        """
        # Generate random 96-bit IV
        nonce = os.urandom(12)

        # Serialize payload to JSON
        plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        # Encrypt with GCM
        cipher = AESGCM(self.key)
        ciphertext_and_tag = cipher.encrypt(nonce, plaintext, None)

        # Combine nonce + ciphertext_and_tag
        combined = nonce + ciphertext_and_tag

        # Return as base64url (no padding)
        return base64.urlsafe_b64encode(combined).rstrip(b"=").decode("ascii")

    def decrypt(self, encrypted_payload: str) -> QRPayload:
        """
        Decrypt QR payload using AES-256-GCM.

        Args:
            encrypted_payload: Base64url encoded string (nonce + ciphertext + tag)

        Returns:
            QRPayload dict

        Raises:
            ValueError: If payload format is invalid or too short
            cryptography.exceptions.InvalidTag: If authentication fails
            json.JSONDecodeError: If decrypted payload is not valid JSON
        """
        # Decode base64url (add padding if needed)
        padding = 4 - (len(encrypted_payload) % 4)
        if padding != 4:
            encrypted_payload += "=" * padding

        try:
            combined = base64.urlsafe_b64decode(encrypted_payload)
        except Exception as e:
            raise ValueError(f"Invalid base64url encoding: {e}")

        # Extract nonce (first 12 bytes) and ciphertext_and_tag
        if len(combined) < 12 + 16:  # nonce (12) + tag (16) minimum
            raise ValueError("Payload too short")

        nonce = combined[:12]
        ciphertext_and_tag = combined[12:]

        # Decrypt
        cipher = AESGCM(self.key)
        plaintext = cipher.decrypt(nonce, ciphertext_and_tag, None)

        # Parse JSON
        payload = json.loads(plaintext.decode("utf-8"))

        # Validate structure
        if not isinstance(payload, dict) or not all(
            k in payload for k in ["ticket_id", "user_hash", "timestamp_ms"]
        ):
            raise ValueError("Invalid payload structure")

        return payload

    def verify_timestamp(self, timestamp_ms: int, ttl_seconds: int = 30) -> bool:
        """
        Verify that timestamp is within TTL.

        Args:
            timestamp_ms: Milliseconds since epoch from payload
            ttl_seconds: Time-to-live in seconds (default 30)

        Returns:
            True if timestamp is valid, False otherwise
        """
        current_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        age_ms = current_ms - timestamp_ms
        ttl_ms = ttl_seconds * 1000

        # Allow small negative age (clock skew up to 1 second)
        return -1000 <= age_ms <= ttl_ms
