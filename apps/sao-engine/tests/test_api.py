"""Integration tests for the SAO Engine FastAPI endpoints.

Uses httpx.AsyncClient + ASGITransport to exercise the full HTTP stack
(routing, auth dependency, serialisation) without a real server.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

# ─── Constants ────────────────────────────────────────────────────────────────

VALID_SECRET = "test-secret-for-pytest"
BASE = "/api/v1"

# Minimal valid request body
MINIMAL_REQUEST = {
    "event_id": "evt-test-001",
    "seats": [
        {"id": f"s{i}", "row_label": "A", "seat_number": str(i + 1),
         "x_coord": float(i), "y_coord": 0.0, "is_accessible": False}
        for i in range(5)
    ],
    "attendees": [
        {"user_id": f"u{i}", "ticket_id": f"t{i}", "group_size": 1, "needs_accessible": False}
        for i in range(3)
    ],
    "algorithm": "kmeans_greedy",
}


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
async def client():
    """AsyncClient bound to the FastAPI app via ASGI transport."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def patched_secret():
    """Patch the module-level _API_SECRET to a known test value."""
    with patch("routers.allocation._API_SECRET", VALID_SECRET):
        yield VALID_SECRET


# ─── GET /health ──────────────────────────────────────────────────────────────


async def test_health_returns_ok(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "service": "sao-engine"}


# ─── POST /api/v1/run — auth ──────────────────────────────────────────────────


async def test_run_missing_header_returns_401(client: AsyncClient, patched_secret: str):
    res = await client.post(f"{BASE}/run", json=MINIMAL_REQUEST)
    assert res.status_code == 401


async def test_run_wrong_secret_returns_401(client: AsyncClient, patched_secret: str):
    res = await client.post(
        f"{BASE}/run",
        json=MINIMAL_REQUEST,
        headers={"X-Api-Secret": "wrong-secret"},
    )
    assert res.status_code == 401


async def test_run_unconfigured_secret_returns_503(client: AsyncClient):
    """When _API_SECRET is empty the service must return 503."""
    with patch("routers.allocation._API_SECRET", ""):
        res = await client.post(
            f"{BASE}/run",
            json=MINIMAL_REQUEST,
            headers={"X-Api-Secret": "anything"},
        )
    assert res.status_code == 503


# ─── POST /api/v1/run — happy path ────────────────────────────────────────────


async def test_run_returns_allocation_result(client: AsyncClient, patched_secret: str):
    res = await client.post(
        f"{BASE}/run",
        json=MINIMAL_REQUEST,
        headers={"X-Api-Secret": patched_secret},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["event_id"] == "evt-test-001"
    assert body["algorithm_used"] == "kmeans_greedy"
    assert isinstance(body["assignments"], list)
    assert isinstance(body["utilization_rate"], float)
    assert 0.0 <= body["utilization_rate"] <= 1.0
    assert isinstance(body["duration_ms"], float)


async def test_run_manual_baseline_algorithm(client: AsyncClient, patched_secret: str):
    req = {**MINIMAL_REQUEST, "algorithm": "manual_baseline"}
    res = await client.post(
        f"{BASE}/run",
        json=req,
        headers={"X-Api-Secret": patched_secret},
    )
    assert res.status_code == 200
    assert res.json()["algorithm_used"] == "manual_baseline"


async def test_run_no_seats_returns_all_unassigned(client: AsyncClient, patched_secret: str):
    req = {**MINIMAL_REQUEST, "seats": []}
    res = await client.post(
        f"{BASE}/run",
        json=req,
        headers={"X-Api-Secret": patched_secret},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["seats_assigned"] == 0
    assert len(body["unassigned_ticket_ids"]) == len(MINIMAL_REQUEST["attendees"])


async def test_run_invalid_body_returns_422(client: AsyncClient, patched_secret: str):
    res = await client.post(
        f"{BASE}/run",
        json={"event_id": "missing-fields"},
        headers={"X-Api-Secret": patched_secret},
    )
    assert res.status_code == 422


# ─── POST /api/v1/compare ─────────────────────────────────────────────────────


async def test_compare_missing_header_returns_401(client: AsyncClient, patched_secret: str):
    res = await client.post(f"{BASE}/compare", json=MINIMAL_REQUEST)
    assert res.status_code == 401


async def test_compare_returns_comparison_schema(client: AsyncClient, patched_secret: str):
    res = await client.post(
        f"{BASE}/compare",
        json=MINIMAL_REQUEST,
        headers={"X-Api-Secret": patched_secret},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["event_id"] == "evt-test-001"
    assert "hypothesis_h1_passed" in body
    assert "improvement_percentage" in body
    assert "sao_adjacency_score" in body
    assert "baseline_adjacency_score" in body


async def test_compare_improvement_is_numeric(client: AsyncClient, patched_secret: str):
    res = await client.post(
        f"{BASE}/compare",
        json=MINIMAL_REQUEST,
        headers={"X-Api-Secret": patched_secret},
    )
    body = res.json()
    assert isinstance(body["improvement_percentage"], float)
    assert body["improvement_percentage"] >= 0.0
