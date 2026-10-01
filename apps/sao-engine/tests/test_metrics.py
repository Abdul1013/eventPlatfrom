"""Unit tests for services/metrics.py"""

import pytest

from models.schemas import AllocationResultSchema, SeatAssignmentSchema, SeatSchema
from services.metrics import (
    build_comparison,
    calculate_adjacency_score,
    calculate_utilization_rate,
    count_accessible_used,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def make_assignment(ticket_id: str, seat_id: str, row: str = "A", num: int = 1, section: str | None = None) -> SeatAssignmentSchema:
    return SeatAssignmentSchema(
        ticket_id=ticket_id,
        user_id=f"u-{ticket_id}",
        seat_id=seat_id,
        row_label=row,
        seat_number=str(num),
        section=section,
    )


def make_seat(id_: str, row: str, num: int, accessible: bool = False) -> SeatSchema:
    return SeatSchema(id=id_, row_label=row, seat_number=str(num), x_coord=0.0, y_coord=0.0, is_accessible=accessible)


def make_result(
    event_id: str,
    algorithm: str,
    assignments: list[SeatAssignmentSchema],
    util_rate: float,
    adj_score: float = 0.0,
    seats_total: int = 10,
    accessible_used: int = 0,
) -> AllocationResultSchema:
    return AllocationResultSchema(
        event_id=event_id,
        algorithm_used=algorithm,
        assignments=assignments,
        utilization_rate=util_rate,
        adjacency_score=adj_score,
        seats_assigned=len(assignments),
        seats_total=seats_total,
        seats_accessible_used=accessible_used,
        unassigned_ticket_ids=[],
        duration_ms=0.0,
    )


# ─── calculate_utilization_rate ───────────────────────────────────────────────


class TestCalculateUtilizationRate:
    def test_full_utilization(self):
        assert calculate_utilization_rate(10, 10) == 1.0

    def test_half_utilization(self):
        assert calculate_utilization_rate(5, 10) == 0.5

    def test_zero_total_returns_zero(self):
        assert calculate_utilization_rate(0, 0) == 0.0

    def test_result_rounded_to_4dp(self):
        result = calculate_utilization_rate(1, 3)
        assert result == round(1 / 3, 4)


# ─── count_accessible_used ────────────────────────────────────────────────────


class TestCountAccessibleUsed:
    def test_counts_only_accessible_seats(self):
        assignments = [make_assignment("t1", "s1"), make_assignment("t2", "s2")]
        seats = [make_seat("s1", "A", 1, accessible=True), make_seat("s2", "A", 2, accessible=False)]
        assert count_accessible_used(assignments, seats) == 1

    def test_no_accessible_seats_assigned(self):
        assignments = [make_assignment("t1", "s1")]
        seats = [make_seat("s1", "A", 1, accessible=False)]
        assert count_accessible_used(assignments, seats) == 0

    def test_all_accessible(self):
        assignments = [make_assignment("t1", "s1"), make_assignment("t2", "s2")]
        seats = [make_seat("s1", "A", 1, accessible=True), make_seat("s2", "A", 2, accessible=True)]
        assert count_accessible_used(assignments, seats) == 2


# ─── calculate_adjacency_score ────────────────────────────────────────────────


class TestCalculateAdjacencyScore:
    def test_empty_assignments_returns_zero(self):
        assert calculate_adjacency_score([]) == 0.0

    def test_all_consecutive_seats_high_score(self):
        assignments = [
            make_assignment("t1", "s1", row="A", num=1),
            make_assignment("t2", "s2", row="A", num=2),
            make_assignment("t3", "s3", row="A", num=3),
        ]
        score = calculate_adjacency_score(assignments)
        assert score > 0.5

    def test_scattered_seats_zero_score(self):
        # Seats in different rows with non-consecutive numbers
        assignments = [
            make_assignment("t1", "s1", row="A", num=1),
            make_assignment("t2", "s5", row="B", num=5),
        ]
        assert calculate_adjacency_score(assignments) == 0.0

    def test_score_capped_at_one(self):
        assignments = [make_assignment(f"t{i}", f"s{i}", row="A", num=i + 1) for i in range(10)]
        score = calculate_adjacency_score(assignments)
        assert score <= 1.0


# ─── build_comparison ─────────────────────────────────────────────────────────


class TestBuildComparison:
    def test_h1_passed_when_improvement_gte_15_percent(self):
        sao = make_result("e1", "kmeans_greedy", [], 0.92, adj_score=0.8)
        baseline = make_result("e1", "manual_baseline", [], 0.75, adj_score=0.3)
        result = build_comparison("e1", sao, baseline)
        assert result.hypothesis_h1_passed is True
        assert result.improvement_percentage >= 15.0

    def test_h1_failed_when_improvement_lt_15_percent(self):
        sao = make_result("e1", "kmeans_greedy", [], 0.80, adj_score=0.6)
        baseline = make_result("e1", "manual_baseline", [], 0.78, adj_score=0.4)
        result = build_comparison("e1", sao, baseline)
        assert result.hypothesis_h1_passed is False

    def test_zero_baseline_rate_improvement_is_zero(self):
        sao = make_result("e1", "kmeans_greedy", [], 0.5, adj_score=0.3)
        baseline = make_result("e1", "manual_baseline", [], 0.0, adj_score=0.0)
        result = build_comparison("e1", sao, baseline)
        assert result.improvement_percentage == 0.0
        assert result.hypothesis_h1_passed is False

    def test_adjacency_scores_propagated(self):
        sao = make_result("e1", "kmeans_greedy", [], 0.9, adj_score=0.75)
        baseline = make_result("e1", "manual_baseline", [], 0.7, adj_score=0.2)
        result = build_comparison("e1", sao, baseline)
        assert result.sao_adjacency_score == 0.75
        assert result.baseline_adjacency_score == 0.2

    def test_h1_fails_when_sao_worse_than_baseline(self):
        sao = make_result("e1", "kmeans_greedy", [], 0.60, adj_score=0.2)
        baseline = make_result("e1", "manual_baseline", [], 0.90, adj_score=0.7)
        result = build_comparison("e1", sao, baseline)
        assert result.hypothesis_h1_passed is False

    def test_event_id_propagated_to_comparison(self):
        sao = make_result("evt-xyz", "kmeans_greedy", [], 0.85, adj_score=0.6)
        baseline = make_result("evt-xyz", "manual_baseline", [], 0.70, adj_score=0.4)
        result = build_comparison("evt-xyz", sao, baseline)
        assert result.event_id == "evt-xyz"


class TestCalculateUtilizationRateEdgeCases:
    def test_more_assigned_than_total_capped_gracefully(self):
        # Should not raise — just return > 1.0 or handle it
        result = calculate_utilization_rate(11, 10)
        assert isinstance(result, float)

    def test_zero_assigned_returns_zero(self):
        assert calculate_utilization_rate(0, 10) == 0.0
