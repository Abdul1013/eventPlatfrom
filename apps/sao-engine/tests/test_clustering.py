"""Unit tests for services/clustering.py"""

import pytest

from models.schemas import AttendeePreferenceSchema, SeatSchema
from services.clustering import (
    AttendeeCluster,
    build_feature_matrix,
    cluster_attendees,
    sort_clusters_by_priority,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


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


def make_seat(id_: str, row: str, num: int, x: float = 0.0, y: float = 0.0, accessible: bool = False) -> SeatSchema:
    return SeatSchema(id=id_, row_label=row, seat_number=str(num), x_coord=x, y_coord=y, is_accessible=accessible)


# ─── build_feature_matrix ─────────────────────────────────────────────────────


class TestBuildFeatureMatrix:
    def test_shape_matches_attendee_count(self):
        attendees = [make_attendee("u1", "t1", group_size=2), make_attendee("u2", "t2")]
        X = build_feature_matrix(attendees)
        assert X.shape == (2, 2)

    def test_group_size_column(self):
        attendees = [make_attendee("u1", "t1", group_size=5)]
        X = build_feature_matrix(attendees)
        assert X[0, 0] == 5.0

    def test_accessible_flag_encoded(self):
        attendees = [make_attendee("u1", "t1", needs_accessible=True)]
        X = build_feature_matrix(attendees)
        assert X[0, 1] == 1.0

    def test_non_accessible_flag_zero(self):
        attendees = [make_attendee("u1", "t1", needs_accessible=False)]
        X = build_feature_matrix(attendees)
        assert X[0, 1] == 0.0


# ─── cluster_attendees ────────────────────────────────────────────────────────


class TestClusterAttendees:
    def test_empty_input_returns_empty(self):
        assert cluster_attendees([], []) == []

    def test_single_attendee_produces_one_cluster(self):
        attendees = [make_attendee("u1", "t1")]
        seats = [make_seat("s1", "A", 1)]
        clusters = cluster_attendees(attendees, seats)
        assert len(clusters) == 1
        assert clusters[0].attendees[0].ticket_id == "t1"

    def test_all_attendees_accounted_for(self):
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(10)]
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(20)]
        clusters = cluster_attendees(attendees, seats)
        total = sum(len(c.attendees) for c in clusters)
        assert total == 10

    def test_accessible_cluster_sorted_first(self):
        attendees = [
            make_attendee("u1", "t1"),
            make_attendee("u2", "t2", needs_accessible=True),
        ]
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(5)]
        clusters = cluster_attendees(attendees, seats)
        assert clusters[0].needs_accessible is True

    def test_group_integrity_same_group_same_cluster(self):
        """Attendees sharing a group_id must end up in the same cluster."""
        attendees = [
            make_attendee("u1", "t1", group_id="g1"),
            make_attendee("u2", "t2", group_id="g1"),
            make_attendee("u3", "t3", group_id="g2"),
        ]
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(10)]
        clusters = cluster_attendees(attendees, seats)

        def find_cluster(ticket_id: str) -> int:
            for c in clusters:
                if any(a.ticket_id == ticket_id for a in c.attendees):
                    return c.cluster_id
            raise ValueError(ticket_id)

        assert find_cluster("t1") == find_cluster("t2")

    def test_large_input_uses_kmeans_without_error(self):
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(60)]
        seats = [make_seat(f"s{i}", chr(65 + i % 10), i % 20 + 1) for i in range(100)]
        clusters = cluster_attendees(attendees, seats)
        total = sum(len(c.attendees) for c in clusters)
        assert total == 60


# ─── sort_clusters_by_priority ────────────────────────────────────────────────


class TestSortClustersByPriority:
    def test_accessible_cluster_first(self):
        c_standard = AttendeeCluster(cluster_id=0, needs_accessible=False, priority=0)
        c_accessible = AttendeeCluster(cluster_id=1, needs_accessible=True, priority=10)
        result = sort_clusters_by_priority([c_standard, c_accessible])
        assert result[0].cluster_id == 1

    def test_larger_cluster_before_smaller_same_priority(self):
        big = AttendeeCluster(cluster_id=0, attendees=[object()] * 5, priority=0)  # type: ignore[list-item]
        small = AttendeeCluster(cluster_id=1, attendees=[object()] * 2, priority=0)  # type: ignore[list-item]
        result = sort_clusters_by_priority([small, big])
        assert result[0].cluster_id == 0

    def test_result_is_new_list_not_mutated_in_place(self):
        c1 = AttendeeCluster(cluster_id=0, needs_accessible=False, priority=0)
        c2 = AttendeeCluster(cluster_id=1, needs_accessible=True, priority=5)
        original = [c1, c2]
        result = sort_clusters_by_priority(original)
        # The input list order must not change
        assert original[0].cluster_id == 0
        assert result[0].cluster_id == 1


class TestClusterAttendeesEdgeCases:
    def test_more_attendees_than_seats_still_returns_clusters(self):
        """cluster_attendees must succeed even when seats < attendees."""
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(5)]
        seats = [make_seat("s1", "A", 1)]  # Only 1 seat for 5 attendees
        clusters = cluster_attendees(attendees, seats)
        total = sum(len(c.attendees) for c in clusters)
        assert total == 5

    def test_no_duplicates_across_clusters(self):
        attendees = [make_attendee(f"u{i}", f"t{i}") for i in range(8)]
        seats = [make_seat(f"s{i}", "A", i + 1) for i in range(15)]
        clusters = cluster_attendees(attendees, seats)
        all_ticket_ids = [a.ticket_id for c in clusters for a in c.attendees]
        assert len(all_ticket_ids) == len(set(all_ticket_ids))
