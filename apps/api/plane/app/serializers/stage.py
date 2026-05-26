# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Stage
from .base import BaseSerializer


class StageSerializer(BaseSerializer):
    total_issues = serializers.IntegerField(read_only=True)

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
        ]
