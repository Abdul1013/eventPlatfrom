"""Constrained greedy seat assignment service.

Algorithm:
  1. Build a row-based seat grid (seats sorted by seat_number within each row).
  2. Cluster attendees via clustering.cluster_attendees (accessible clusters first).
  3. For each cluster:
     a. Accessible cluster → draw from the accessible-seat pool first.
     b. Standard cluster  → find the first row with ≥ cluster_size adjacent free seats.
        Fallback 1: best available row (most free seats, not necessarily adjacent).
        Fallback 2: any free seat individually.
  4. Track used seat IDs in a shared set to prevent double-assignment.

Returns:
  - list[SeatAssignmentSchema]: confirmed assignments
  - list[str]: ticket_ids that could not be assigned (no seats left)
"""

from __future__ import annotations

import logging
from collections import defaultdict

from models.schemas import (
    AllocationRequestSchema,
    AttendeePreferenceSchema,
    SeatAssignmentSchema,
    SeatSchema,
)
from services.clustering import AttendeeCluster, cluster_attendees

logger = logging.getLogger(__name__)


# ─── Seat grid ────────────────────────────────────────────────────────────────


def build_seat_grid(seats: list[SeatSchema]) -> dict[str, list[SeatSchema]]:
    """Group seats by row_label; each row sorted by seat_number ascending."""
    grid: dict[str, list[SeatSchema]] = defaultdict(list)
    for seat in seats:
        grid[seat.row_label].append(seat)
    for row in grid.values():
        try:
            row.sort(key=lambda s: int(s.seat_number))
        except (ValueError, TypeError):
            row.sort(key=lambda s: s.seat_number)
    return dict(grid)


# ─── Adjacent-seat finder ─────────────────────────────────────────────────────


def find_adjacent_seats(
    row_seats: list[SeatSchema],
    used: set[str],
    count: int,
) -> list[SeatSchema] | None:
    """
    Find the first contiguous run of *count* free seats in *row_seats*.
    Contiguous means consecutive integer seat_numbers (e.g. 3, 4, 5).
    Returns None if no such run exists.
    """
    window: list[SeatSchema] = []
    prev_num: int | None = None

    for seat in row_seats:  # already sorted by build_seat_grid
        if seat.id in used:
            window = []
            prev_num = None
            continue

        try:
            num = int(seat.seat_number)
        except (ValueError, TypeError):
            # Non-numeric seat label: treat each seat as a run of 1
            window = [seat]
            prev_num = None
            if len(window) >= count:
                return window[-count:]
            continue

        if prev_num is not None and num != prev_num + 1:
            window = []

        window.append(seat)
        prev_num = num

        if len(window) >= count:
            return window[-count:]

    return None


# ─── Cluster assigner ─────────────────────────────────────────────────────────


def assign_cluster(
    cluster: AttendeeCluster,
    grid: dict[str, list[SeatSchema]],
    accessible_pool: list[SeatSchema],
    used: set[str],
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Assign seats to every attendee in *cluster*.
    Returns (assignments, unassigned_ticket_ids).
    """
    assignments: list[SeatAssignmentSchema] = []
    unassigned: list[str] = []

    if cluster.needs_accessible:
        # Accessible clusters: draw from dedicated pool, fall back to any free seat
        for attendee in cluster.attendees:
            seat = next((s for s in accessible_pool if s.id not in used), None)
            if not seat:
                seat = _any_free(grid, used)
            if seat:
                used.add(seat.id)
                assignments.append(_make_assignment(attendee, seat))
            else:
                unassigned.append(attendee.ticket_id)
        return assignments, unassigned

    # Standard cluster: try to seat everyone together in one row
    cluster_size = len(cluster.attendees)

    # 1. Find a row with enough adjacent free seats
    chosen_seats: list[SeatSchema] | None = None
    for row_seats in grid.values():
        candidate = find_adjacent_seats(row_seats, used, cluster_size)
        if candidate:
            chosen_seats = candidate
            break

    if chosen_seats:
        for attendee, seat in zip(cluster.attendees, chosen_seats):
            used.add(seat.id)
            assignments.append(_make_assignment(attendee, seat))
        return assignments, unassigned

    # 2. Fallback: best row (most free seats) — partial adjacency acceptable
    best_row = max(
        grid.values(),
        key=lambda row: sum(1 for s in row if s.id not in used),
        default=[],
    )
    best_free = [s for s in best_row if s.id not in used]
    for attendee, seat in zip(cluster.attendees, best_free):
        used.add(seat.id)
        assignments.append(_make_assignment(attendee, seat))

    assigned_so_far = len(assignments)

    # 3. Fallback: any free seat for remaining unassigned members
    for attendee in cluster.attendees[assigned_so_far:]:
        seat = _any_free(grid, used)
        if seat:
            used.add(seat.id)
            assignments.append(_make_assignment(attendee, seat))
        else:
            unassigned.append(attendee.ticket_id)

    return assignments, unassigned


# ─── Public entry points ──────────────────────────────────────────────────────


def run_greedy_assignment(
    req: AllocationRequestSchema,
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Cluster attendees then greedily assign seats.
    Returns (assignments, unassigned_ticket_ids).
    """
    if not req.seats or not req.attendees:
        return [], [a.ticket_id for a in req.attendees]

    clusters = cluster_attendees(req.attendees, req.seats)
    grid = build_seat_grid(req.seats)
    accessible_pool = [s for s in req.seats if s.is_accessible]
    used: set[str] = set()

    all_assignments: list[SeatAssignmentSchema] = []
    all_unassigned: list[str] = []

    for cluster in clusters:
        assigned, unassigned = assign_cluster(cluster, grid, accessible_pool, used)
        all_assignments.extend(assigned)
        all_unassigned.extend(unassigned)

    return all_assignments, all_unassigned


def run_manual_baseline(
    req: AllocationRequestSchema,
) -> tuple[list[SeatAssignmentSchema], list[str]]:
    """
    Sequential assignment — control group for H1 validation.
    Assigns seats in the order they appear in req.seats.
    """
    assignments: list[SeatAssignmentSchema] = []
    unassigned: list[str] = []

    seat_iter = iter(req.seats)
    for attendee in req.attendees:
        seat = next(seat_iter, None)
        if seat:
            assignments.append(_make_assignment(attendee, seat))
        else:
            unassigned.append(attendee.ticket_id)

    return assignments, unassigned


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_assignment(
    attendee: AttendeePreferenceSchema,
    seat: SeatSchema,
) -> SeatAssignmentSchema:
    return SeatAssignmentSchema(
        ticket_id=attendee.ticket_id,
        user_id=attendee.user_id,
        seat_id=seat.id,
        row_label=seat.row_label,
        seat_number=seat.seat_number,
        section=seat.section,
    )


def _any_free(grid: dict[str, list[SeatSchema]], used: set[str]) -> SeatSchema | None:
    """Return the first free seat found across all rows."""
    for row_seats in grid.values():
        for seat in row_seats:
            if seat.id not in used:
                return seat
    return None
