# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.utils import timezone

from rest_framework import serializers

from plane.db.models import Stage
from plane.utils.tms_health import stage_health, completion_ratio
from .base import BaseSerializer


class StageSerializer(BaseSerializer):
    total_issues = serializers.IntegerField(read_only=True)
    completed_issues = serializers.IntegerField(read_only=True)
    health = serializers.SerializerMethodField()
    completion_ratio = serializers.SerializerMethodField()

    class Meta:
        model = Stage
        fields = [
            "id",
            "key",
            "name",
            "description",
            "sort_order",
            "start_date",
            "target_date",
            "archived_at",
            "logo_props",
            "external_source",
            "external_id",
            "project",
            "workspace",
            "process_template",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "total_issues",
            "completed_issues",
            "health",
            "completion_ratio",
        ]
        read_only_fields = [
            "id",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "total_issues",
            "completed_issues",
            "health",
            "completion_ratio",
        ]

    def get_health(self, obj) -> str:
        total = getattr(obj, "total_issues", 0) or 0
        completed = getattr(obj, "completed_issues", 0) or 0
        return stage_health(
            target_date=obj.target_date,
            total_issues=total,
            completed_issues=completed,
            today=timezone.now().date(),
        )

    def get_completion_ratio(self, obj) -> float:
        total = getattr(obj, "total_issues", 0) or 0
        completed = getattr(obj, "completed_issues", 0) or 0
        return round(completion_ratio(total, completed), 4)
