# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# WorkLog serializer – TMS customization.

from rest_framework import serializers

from plane.db.models import WorkLog
from .base import BaseSerializer


class WorkLogSerializer(BaseSerializer):
    class Meta:
        model = WorkLog
        fields = [
            "id",
            "issue",
            "user",
            "log_date",
            "hours",
            "note",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def validate_hours(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("hours must be > 0")
        if value > 24:
            raise serializers.ValidationError("hours must be ≤ 24 per entry")
        return value
