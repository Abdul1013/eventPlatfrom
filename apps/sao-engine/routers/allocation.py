"""Allocation router — /api/v1/run and /api/v1/compare endpoints.

Security: every request must include an X-Api-Secret header matching
the API_SECRET environment variable (shared secret with the Node API).
"""

from __future__ import annotations

import logging
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException

from models.schemas import (
    AllocationRequestSchema,
    AllocationResultSchema,
    BaselineComparisonSchema,
)
from services.greedy import run_greedy_assignment, run_manual_baseline
from services.metrics import (
    build_comparison,
    calculate_adjacency_score,
    calculate_utilization_rate,
    count_accessible_used,
)

router = APIRouter()
logger = logging.getLogger(__name__)

_API_SECRET = os.getenv("API_SECRET", "")


# ─── Auth dependency ──────────────────────────────────────────────────────────


def verify_api_secret(x_api_secret: str | None = Header(None, alias="X-Api-Secret")) -> None:
    """Validate the shared secret sent by the Node API."""
    if x_api_secret is None:
        raise HTTPException(status_code=401, detail="X-Api-Secret header required")
    if not _API_SECRET:
        logger.warning("API_SECRET is not configured — rejecting all allocation requests")
        raise HTTPException(status_code=503, detail="Service not configured")
    if x_api_secret != _API_SECRET:
        raise HTTPException(status_code=401, detail="Invalid API secret")


# ─── Internal builder ─────────────────────────────────────────────────────────


def _build_result(
    req: AllocationRequestSchema,
    algorithm: str,
) -> AllocationResultSchema:
    t0 = time.monotonic()

    if algorithm == "kmeans_greedy":
        assignments, unassigned = run_greedy_assignment(req)
    else:
        assignments, unassigned = run_manual_baseline(req)

    seats_total = len(req.seats)
    seats_assigned = len(assignments)

    return AllocationResultSchema(
        event_id=req.event_id,
        algorithm_used=algorithm,
        assignments=assignments,
        utilization_rate=calculate_utilization_rate(seats_assigned, seats_total),
        adjacency_score=calculate_adjacency_score(assignments),
        seats_assigned=seats_assigned,
        seats_total=seats_total,
        seats_accessible_used=count_accessible_used(assignments, req.seats),
        unassigned_ticket_ids=unassigned,
        duration_ms=round((time.monotonic() - t0) * 1000, 2),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post(
    "/run",
    response_model=AllocationResultSchema,
    dependencies=[Depends(verify_api_secret)],
)
def run_allocation(req: AllocationRequestSchema) -> AllocationResultSchema:
    """
    Run seat allocation for an event.
    Algorithm is selected via req.algorithm:
      - kmeans_greedy:   K-means clustering + constrained greedy assignment
      - manual_baseline: sequential assignment (control group)
    """
    logger.info(
        "run_allocation event=%s algo=%s attendees=%d seats=%d",
        req.event_id,
        req.algorithm,
        len(req.attendees),
        len(req.seats),
    )
    return _build_result(req, req.algorithm)


@router.post(
    "/compare",
    response_model=BaselineComparisonSchema,
    dependencies=[Depends(verify_api_secret)],
)
def compare_allocation(req: AllocationRequestSchema) -> BaselineComparisonSchema:
    """
    Run both kmeans_greedy and manual_baseline on the same input and return
    comparison metrics for H1 validation (SAO ≥ 15 % better than baseline).
    """
    logger.info(
        "compare_allocation event=%s attendees=%d seats=%d",
        req.event_id,
        len(req.attendees),
        len(req.seats),
    )
    sao_result = _build_result(req, "kmeans_greedy")
    baseline_result = _build_result(req, "manual_baseline")
    return build_comparison(req.event_id, sao_result, baseline_result)
