"""
Integration test for Security Engine API endpoints.
"""

from starlette.testclient import TestClient
from main import app
from schemas import EncryptRequest, ValidateRequest


def test_encrypt_endpoint():
    """Test the /encrypt endpoint."""
    client = TestClient(app)
    payload = EncryptRequest(
        ticket_id="test-ticket-123",
        user_id="test-user-456"
    )

    response = client.post(
        "/security/api/v1/encrypt",
        json=payload.model_dump()
    )

    print(f"Encrypt Status: {response.status_code}")
    print(f"Encrypt Response: {response.json()}")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["encrypted_qr"] is not None
    assert data["timestamp_ms"] is not None


def _get_encrypted_qr() -> str:
    """Helper — encrypt a ticket and return the QR string."""
    client = TestClient(app)
    response = client.post(
        "/security/api/v1/encrypt",
        json=EncryptRequest(ticket_id="test-ticket-123", user_id="test-user-456").model_dump(),
    )
    return response.json()["encrypted_qr"]


def test_validate_endpoint():
    """Test the /validate endpoint."""
    client = TestClient(app)

    enc_resp = client.post(
        "/security/api/v1/encrypt",
        json=EncryptRequest(ticket_id="test-ticket-123", user_id="test-user-456").model_dump(),
    )
    assert enc_resp.status_code == 200
    encrypted_qr = enc_resp.json()["encrypted_qr"]

    payload = ValidateRequest(encrypted_qr=encrypted_qr, ttl_seconds=30)
    response = client.post(
        "/security/api/v1/validate",
        json=payload.model_dump()
    )

    print(f"Validate Status: {response.status_code}")
    print(f"Validate Response: {response.json()}")

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["ticket_id"] == "test-ticket-123"
    assert data["user_hash"] is not None


def test_validate_tampered_qr():
    """Test that tampered QR is rejected."""
    client = TestClient(app)
    # Tamper with a QR code
    tampered_qr = "YQ=="  # Invalid base64url
    
    payload = ValidateRequest(
        encrypted_qr=tampered_qr,
        ttl_seconds=30
    )
    
    response = client.post(
        "/security/api/v1/validate",
        json=payload.model_dump()
    )
    
    print(f"Tampered QR Status: {response.status_code}")
    print(f"Tampered QR Response: {response.json()}")
    
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False


def main():
    """Run all tests."""
    print("🔐 Testing Security Engine API...\n")
    
    # Test encryption
    print("1️⃣ Testing /encrypt endpoint...")
    test_encrypt_endpoint()
    encrypted_qr = _get_encrypted_qr()
    print("✅ /encrypt endpoint works\n")
    
    # Test validation with valid QR
    print("2️⃣ Testing /validate endpoint with valid QR...")
    test_validate_endpoint(encrypted_qr)
    print("✅ /validate endpoint works\n")
    
    # Test validation with tampered QR
    print("3️⃣ Testing /validate endpoint with tampered QR...")
    test_validate_tampered_qr()
    print("✅ Tampered QR rejection works\n")
    
    print("✅ All API tests passed!")


if __name__ == "__main__":
    main()
