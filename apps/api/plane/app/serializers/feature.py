# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Feature, RequirementFeature
from .base import BaseSerializer


class FeatureSerializer(BaseSerializer):
    feature_id = serializers.CharField(read_only=True)
    requirement_ids = serializers.SerializerMethodField()

    class Meta:
        model = Feature
        fields = [
            "id",
            "sequence_id",
            "feature_id",  # "FEA-001"
            "name",
            "description",
            "stage",
            "estimated_hours",
            "sort_order",
            "project",
            "workspace",
            "requirement_ids",
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
            "requirement_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_requirement_ids(self, obj):
        return [
            str(link.requirement_id)
            for link in obj.requirement_links.filter(deleted_at__isnull=True)
        ]


class RequirementFeatureSerializer(BaseSerializer):
    class Meta:
        model = RequirementFeature
        fields = ["id", "requirement", "feature", "project", "workspace", "created_at"]
        read_only_fields = ["id", "project", "workspace", "created_at"]
