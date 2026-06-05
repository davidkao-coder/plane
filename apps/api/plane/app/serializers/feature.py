# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Feature, RequirementFeature
from .base import BaseSerializer


class FeatureSerializer(BaseSerializer):
    feature_id = serializers.CharField(read_only=True)
    depends_on_ids = serializers.SerializerMethodField()

    class Meta:
        model = Feature
        fields = [
            "id",
            "sequence_id",
            "feature_id",  # "FEA-001"
            "name",
            "description",
            "requirement",  # FK – parent Requirement (required after Phase 1.5)
            "estimated_hours",
            "sort_order",
            "project",
            "workspace",
            "depends_on_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "sequence_id",
            "feature_id",
            "project",
            "workspace",
            "depends_on_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_depends_on_ids(self, obj):
        # Prerequisite feature ids this feature is blocked by
        deps = getattr(obj, "dependencies", None)
        if deps is None:
            return []
        return [
            str(d.depends_on_id)
            for d in deps.filter(deleted_at__isnull=True)
        ]


class RequirementFeatureSerializer(BaseSerializer):
    """Legacy M:N pivot serializer (Phase 1.5 — kept for back-compat only;
    pivot table is no longer written to, but kept on disk for historical
    queries)."""

    class Meta:
        model = RequirementFeature
        fields = ["id", "requirement", "feature", "project", "workspace", "created_at"]
        read_only_fields = fields
