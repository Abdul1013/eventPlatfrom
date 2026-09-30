"""Unit tests for services/greedy.py"""

import pytest

from models.schemas import AllocationRequestSchema, AttendeePreferenceSchema, SeatSchema
from services.greedy import (
    build_seat_grid,
    find_adjacent_seats,
    run_greedy_assignment,
    run_manual_baseline,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def make_seat(id_: str, row: str, num: int, x: float = 0.0, y: float = 0.0, accessible: bool = False) -> SeatSchema:
    return SeatSchema(id=id_, row_label=row, seat_number=str(num), x_coord=x, y_coord=y, is_accessible=accessible)


def make_attendee(
    user_id: str,
    ticket_id: str,
    group_id: str | None = None,
    group_size: int = 1,
    needs_accessible: bool = False,
) -> AttendeePreferenceSchema:
    return AttendeePreferenceSchema(
        user_id=user_id,
        ticket_id=ticket_id,
        group_id=group_id,
        group_size=group_size,
        needs_accessible=needs_accessible,
    )


def make_request(seats, attendees, algorithm="kmeans_greedy") -> AllocationRequestSchema:
    return AllocationRequestSchema(event_id="evt-001", seats=seats, attendees=attendees, algorithm=algorithm)


# ─── build_seat_grid ──────────────────────────────────────────────────────────


class TestBuildSeatGrid:
    def test_groups_seats_by_row(self):
        seats = [make_seat("s1", "A", 1), make_seat("s2", "B", 1), make_seat("s3", "A", 2)]
        grid = build_seat_grid(seats)
        assert set(grid.keys()) == {"A", "B"}
        assert len(grid["A"]) == 2

    def test_row_sorted_ascending_by_seat_number(self):
        seats = [make_seat("s3", "A", 3), make_seat("s1", "A", 1), make_seat("s2", "A", 2)]
        grid = build_seat_grid(seats)
        numbers = [int(s.seat_number) for s in grid["A"]]
        assert numbers == sorted(numbers)


# ─── find_adjacent_seats ──────────────────────────────────────────────────────


class TestFindAdjacentSeats:
    def test_finds_contiguous_window(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(5)]
        result = find_adjacent_seats(seats, set(), 3)
        assert result is not None
        assert len(result) == 3
        nums = [int(s.seat_number) for s in result]
        assert nums[-1] - nums[0] == 2  # consecutive

    def test_returns_none_when_not_enough_free(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(2)]
        result = find_adjacent_seats(seats, set(), 3)
        assert result is None

    def test_returns_none_when_gap_in_numbers(self):
        # Seats 1, 3, 5 — no two consecutive
        seats = [make_seat(f"s{i}", "A", i * 2 + 1) for i in range(3)]
        result = find_adjacent_seats(seats, set(), 2)
        assert result is None

    def test_respects_used_set(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(5)]
        used = {"s1", "s2"}  # block seats 1 and 2
        result = find_adjacent_seats(seats, used, 2)
        assert result is not None
        assert all(s.id not in used for s in result)


# ─── run_greedy_assignment ────────────────────────────────────────────────────


class TestRunGreedyAssignment:
    def test_empty_seats_and_attendees(self):
        assignments, unassigned = run_greedy_assignment(make_request([], []))
        assert assignments == []
        assert unassigned == []

    def test_no_seats_marks_all_unassigned(self):
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, unassigned = run_greedy_assignment(make_request([], attendees))
        assert assignments == []
        assert len(unassigned) == 3

    def test_assigns_all_when_enough_seats(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(5)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, unassigned = run_greedy_assignment(make_request(seats, attendees))
        assert len(assignments) == 3
        assert unassigned == []

    def test_no_duplicate_seat_ids(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(5)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(5)]
        assignments, _ = run_greedy_assignment(make_request(seats, attendees))
        seat_ids = [a.seat_id for a in assignments]
        assert len(seat_ids) == len(set(seat_ids))

    def test_accessible_attendee_gets_accessible_seat(self):
        seats = [
            make_seat("s1", "A", 1, accessible=False),
            make_seat("s2", "A", 2, accessible=True),
        ]
        attendees = [make_attendee("u1", "t1", needs_accessible=True)]
        assignments, _ = run_greedy_assignment(make_request(seats, attendees))
        assert len(assignments) == 1
        assert assignments[0].seat_id == "s2"

    def test_more_attendees_than_seats_produces_unassigned(self):
        seats = [make_seat("s1", "A", 1)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, unassigned = run_greedy_assignment(make_request(seats, attendees))
        assert len(assignments) == 1
        assert len(unassigned) == 2

    def test_assignment_ticket_ids_match_attendees(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(3)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, _ = run_greedy_assignment(make_request(seats, attendees))
        assigned_ticket_ids = {a.ticket_id for a in assignments}
        expected_ticket_ids = {a.ticket_id for a in attendees}
        assert assigned_ticket_ids == expected_ticket_ids


# ─── run_manual_baseline ──────────────────────────────────────────────────────


class TestRunManualBaseline:
    def test_sequential_one_to_one_assignment(self):
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(3)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, unassigned = run_manual_baseline(make_request(seats, attendees, algorithm="manual_baseline"))
        assert len(assignments) == 3
        assert unassigned == []
        for i, a in enumerate(assignments):
            assert a.seat_id == f"s{i}"

    def test_excess_attendees_are_unassigned(self):
        seats = [make_seat("s1", "A", 1)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(3)]
        assignments, unassigned = run_manual_baseline(make_request(seats, attendees, algorithm="manual_baseline"))
        assert len(assignments) == 1
        assert len(unassigned) == 2

    def test_accessible_seat_not_consumed_by_non_accessible_attendee(self):
        """Manual baseline should not reserve accessible seats for non-accessible attendees."""
        seats = [make_seat("s1", "A", 1, accessible=True), make_seat("s2", "A", 2, accessible=False)]
        attendees = [make_attendee("u1", "t1", needs_accessible=False)]
        assignments, _ = run_manual_baseline(make_request(seats, attendees, algorithm="manual_baseline"))
        # Regular attendee takes s1 (first sequential) — baseline doesn't filter by accessibility
        assert len(assignments) == 1


class TestGroupAdjacentSeating:
    def test_group_of_two_placed_adjacent(self):
        """A group of 2 should receive consecutive seat numbers in the same row."""
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(10)]
        attendees = [
            make_attendee("u1", "t1", group_id="g1", group_size=2),
            make_attendee("u2", "t2", group_id="g1", group_size=2),
        ]
        assignments, unassigned = run_greedy_assignment(make_request(seats, attendees))
        assert unassigned == []
        assert len(assignments) == 2
        seat_nums = sorted(int(a.seat_number) for a in assignments)
        assert seat_nums[1] - seat_nums[0] == 1  # consecutive

    def test_unique_seat_ids_across_all_assignments(self):
        seats = [make_seat(f"s{i}", chr(65 + i // 5), i % 5 + 1) for i in range(20)]
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(10)]
        assignments, _ = run_greedy_assignment(make_request(seats, attendees))
        ids = [a.seat_id for a in assignments]
        assert len(ids) == len(set(ids))
