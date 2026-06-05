# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import Risk
from .base import BaseSerializer


class RiskSerializer(BaseSerializer):
    class Meta:
        model = Risk
        fields = [
            "id",
            "title",
            "description",
            "severity",
            "likelihood",
            "status",
            "mitigation",
            "owner",
            "due_date",
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
