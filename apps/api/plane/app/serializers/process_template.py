# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Serializers for ProcessTemplate + ProcessStep – TMS Phase 1.5.

from rest_framework import serializers

from plane.db.models import ProcessStep, ProcessTemplate
from .base import BaseSerializer


class ProcessStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessStep
        fields = [
            "id",
            "template",
            "name",
            "sort_order",
            "default_role",
            "default_estimated_hours",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_default_estimated_hours(self, value):
        if value is None:
            return value
        # ≤ 8 hours, 0.5h step (per project decision)
        if value <= 0:
            raise serializers.ValidationError("Hours must be > 0")
        if value > 8:
            raise serializers.ValidationError("A single step must be ≤ 8h")
        # 0.5 step check
        if (value * 2) % 1 != 0:
            raise serializers.ValidationError("Hours must be in 0.5 steps")
        return value


class ProcessTemplateSerializer(BaseSerializer):
    steps = ProcessStepSerializer(many=True, read_only=True)

    class Meta:
        model = ProcessTemplate
        fields = [
            "id",
            "workspace",
            "name",
            "stage_key",
            "description",
            "steps",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]
