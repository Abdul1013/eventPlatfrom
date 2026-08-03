"""
Metrics service — computes utilisation rate, adjacency score, and
the H1 hypothesis comparison between SAO and manual-baseline results.
"""

from __future__ import annotations

from collections import defaultdict

from models.schemas import (
    AllocationResultSchema,
    BaselineComparisonSchema,
    SeatAssignmentSchema,
    SeatSchema,
)


def calculate_utilization_rate(seats_assigned: int, seats_total: int) -> float:
    """seats_assigned / seats_total, rounded to 4 dp."""
    if seats_total == 0:
        return 0.0
    return round(seats_assigned / seats_total, 4)


def count_accessible_used(
    assignments: list[SeatAssignmentSchema],
    seats: list[SeatSchema],
) -> int:
    """Count how many assigned seats are marked is_accessible."""
    accessible_ids = {s.id for s in seats if s.is_accessible}
    return sum(1 for a in assignments if a.seat_id in accessible_ids)


def calculate_adjacency_score(assignments: list[SeatAssignmentSchema]) -> float:
    """
    Adjacency score = fraction of assigned attendees that sit next to at least
    one other assigned attendee (consecutive seat_number in the same row+section).

    Score = (adjacent_pairs * 2) / total_assigned
    Each adjacent pair contributes +2 (both neighbours counted).
    Capped at 1.0.
    """
    if not assignments:
        return 0.0

    # Group seat numbers by (row_label, section)
    row_map: dict[tuple[str, str | None], list[int]] = defaultdict(list)
    for a in assignments:
        try:
            num = int(a.seat_number)
        except (ValueError, TypeError):
            continue
        row_map[(a.row_label, a.section)].append(num)

    adjacent_count = 0
    for numbers in row_map.values():
        sorted_nums = sorted(numbers)
        for i in range(len(sorted_nums) - 1):
            if sorted_nums[i + 1] == sorted_nums[i] + 1:
                adjacent_count += 2  # both neighbours count

    return round(min(adjacent_count / len(assignments), 1.0), 4)


def build_comparison(
    event_id: str,
    sao_result: AllocationResultSchema,
    baseline_result: AllocationResultSchema,
) -> BaselineComparisonSchema:
    """
    Compare SAO vs baseline and determine whether H1 is satisfied
    (SAO achieves ≥ 15 % improvement in utilisation rate over baseline).
    """
    sao_rate = sao_result.utilization_rate
    base_rate = baseline_result.utilization_rate

    if base_rate == 0.0:
        improvement = 0.0
    else:
        improvement = round((sao_rate - base_rate) / base_rate * 100, 2)

    return BaselineComparisonSchema(
        event_id=event_id,
        sao_utilization_rate=sao_rate,
        baseline_utilization_rate=base_rate,
        sao_adjacency_score=sao_result.adjacency_score,
        baseline_adjacency_score=baseline_result.adjacency_score,
        improvement_percentage=improvement,
        hypothesis_h1_passed=improvement >= 15.0,
    )
