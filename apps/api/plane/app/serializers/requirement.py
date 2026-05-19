# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Requirement
from .base import BaseSerializer


class RequirementSerializer(BaseSerializer):
    requirement_id = serializers.CharField(read_only=True)

    class Meta:
        model = Requirement
        fields = [
            "id",
            "sequence_id",
            "requirement_id",  # display: "REQ-001"
            "description",
            "source",
            "priority",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "sequence_id",
            "requirement_id",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
