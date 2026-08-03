"""Clustering service for SAO Engine.

Clusters attendees into spatial groups so that the greedy seat assigner
can seat each group in the same area of the venue.

Algorithm selection:
  - n_attendees >= 50  →  KMeans              (fast, scales well)
  - n_attendees <  50  →  AgglomerativeClustering  (better quality for small sets)

Group integrity: attendees that share a group_id are always assigned the same
cluster label, regardless of the algorithm's output for individual members.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
from sklearn.cluster import AgglomerativeClustering, KMeans

from models.schemas import AttendeePreferenceSchema, SeatSchema

logger = logging.getLogger(__name__)


@dataclass
class AttendeeCluster:
    cluster_id: int
    attendees: list[AttendeePreferenceSchema] = field(default_factory=list)
    needs_accessible: bool = False      # true if ANY member needs an accessible seat
    priority: int = 0                   # higher = assigned first (accessible groups first)


# ─── Feature matrix ───────────────────────────────────────────────────────────


def build_feature_matrix(attendees: list[AttendeePreferenceSchema]) -> np.ndarray:
    """
    Build a (n, 2) feature matrix for clustering.
    Features: [group_size, needs_accessible (0/1)].
    """
    return np.array(
        [[a.group_size, int(a.needs_accessible)] for a in attendees],
        dtype=float,
    )


# ─── Main clustering function ─────────────────────────────────────────────────


def cluster_attendees(
    attendees: list[AttendeePreferenceSchema],
    seats: list[SeatSchema],
    max_cluster_size: int = 20,
) -> list[AttendeeCluster]:
    """
    Cluster *attendees* into groups that will be seated together.
    Returns AttendeeCluster objects sorted by priority (accessible first,
    then largest group first).
    """
    if not attendees:
        return []

    n = len(attendees)

    # Number of clusters: roughly one per max_cluster_size, bounded by [1, n]
    n_clusters = max(1, min(n, len(seats) // max(1, max_cluster_size)))
    n_clusters = min(n_clusters, n)

    # Short-circuit: skip sklearn when clustering is trivial.
    # AgglomerativeClustering requires >= 2 samples, and KMeans/Agglomerative
    # produce no useful labels when n_clusters == 1 anyway. Either way, the
    # answer is "one cluster containing everyone".
    if n < 2 or n_clusters <= 1:
        needs_acc = any(a.needs_accessible for a in attendees)
        return [
            AttendeeCluster(
                cluster_id=0,
                attendees=list(attendees),
                needs_accessible=needs_acc,
                priority=10 if needs_acc else 0,
            )
        ]

    X = build_feature_matrix(attendees)

    if n >= 50:
        model: KMeans | AgglomerativeClustering = KMeans(
            n_clusters=n_clusters, random_state=42, n_init="auto"
        )
    else:
        model = AgglomerativeClustering(n_clusters=n_clusters)

    raw_labels: np.ndarray = model.fit_predict(X)

    # ── Group integrity ────────────────────────────────────────────────────────
    # Attendees that share a group_id must land in the same cluster.
    # Strategy: determine the "canonical" cluster for each group_id from the
    # first member encountered, then re-assign all others to that cluster.
    group_to_cluster: dict[str, int] = {}
    for attendee, label in zip(attendees, raw_labels):
        if attendee.group_id and attendee.group_id not in group_to_cluster:
            group_to_cluster[attendee.group_id] = int(label)

    corrected: dict[int, list[AttendeePreferenceSchema]] = {
        i: [] for i in range(n_clusters)
    }
    for attendee, label in zip(attendees, raw_labels):
        if attendee.group_id and attendee.group_id in group_to_cluster:
            corrected[group_to_cluster[attendee.group_id]].append(attendee)
        else:
            corrected[int(label)].append(attendee)

    # Build AttendeeCluster objects (skip empty clusters)
    clusters: list[AttendeeCluster] = []
    for cluster_id, members in corrected.items():
        if not members:
            continue
        needs_acc = any(m.needs_accessible for m in members)
        clusters.append(
            AttendeeCluster(
                cluster_id=cluster_id,
                attendees=members,
                needs_accessible=needs_acc,
                priority=10 if needs_acc else 0,
            )
        )

    return sort_clusters_by_priority(clusters)


def sort_clusters_by_priority(clusters: list[AttendeeCluster]) -> list[AttendeeCluster]:
    """Return clusters sorted: accessible first, then by descending group size."""
    return sorted(clusters, key=lambda c: (-c.priority, -len(c.attendees)))
