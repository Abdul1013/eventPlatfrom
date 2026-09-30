from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ─── Input schemas ────────────────────────────────────────────────────────────


class SeatSchema(BaseModel):
    id: str
    row_label: str
    seat_number: str       # String to match Prisma schema (e.g. "1", "2", "10A")
    section: Optional[str] = None
    x_coord: float
    y_coord: float
    is_accessible: bool = False


class AttendeePreferenceSchema(BaseModel):
    user_id: str
    ticket_id: str
    group_id: Optional[str] = None      # attendees sharing a group_id are seated together
    group_size: int = Field(default=1, ge=1, le=20)
    needs_accessible: bool = False


class AllocationRequestSchema(BaseModel):
    event_id: str
    seats: list[SeatSchema]
    attendees: list[AttendeePreferenceSchema]
    algorithm: str = Field(
        default="kmeans_greedy",
        pattern="^(kmeans_greedy|manual_baseline)$",
    )


# ─── Output schemas ───────────────────────────────────────────────────────────


class SeatAssignmentSchema(BaseModel):
    ticket_id: str
    user_id: str
    seat_id: str
    row_label: str
    seat_number: str
    section: Optional[str] = None


class AllocationResultSchema(BaseModel):
    event_id: str
    algorithm_used: str
    assignments: list[SeatAssignmentSchema]
    utilization_rate: float         # 0.0–1.0
    adjacency_score: float          # fraction of assigned attendees seated adjacent to a group member
    seats_assigned: int
    seats_total: int
    seats_accessible_used: int
    unassigned_ticket_ids: list[str]
    duration_ms: float


class BaselineComparisonSchema(BaseModel):
    event_id: str
    sao_utilization_rate: float
    baseline_utilization_rate: float
    sao_adjacency_score: float
    baseline_adjacency_score: float
    improvement_percentage: float   # (sao_rate - baseline_rate) / baseline_rate * 100
    hypothesis_h1_passed: bool      # improvement >= 15 %
