# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import (
    ProjectTemplate,
    ProjectTemplateModule,
    ProjectTemplateRequirement,
)
from .base import BaseSerializer


class ProjectTemplateRequirementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplateRequirement
        fields = [
            "id",
            "template_module",
            "description",
            "source",
            "priority",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProjectTemplateModuleSerializer(serializers.ModelSerializer):
    requirements = ProjectTemplateRequirementSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectTemplateModule
        fields = [
            "id",
            "template",
            "name",
            "description",
            "sort_order",
            "requirements",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ProjectTemplateSerializer(BaseSerializer):
    modules = ProjectTemplateModuleSerializer(many=True, read_only=True)
    modules_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProjectTemplate
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "icon",
            "is_default",
            "sort_order",
            "modules",
            "modules_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]


class ProjectTemplateLiteSerializer(BaseSerializer):
    """Lite version – no nested modules, used in dropdowns / list."""

    modules_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ProjectTemplate
        fields = [
            "id",
            "name",
            "description",
            "icon",
            "is_default",
            "sort_order",
            "modules_count",
        ]
        read_only_fields = fields
