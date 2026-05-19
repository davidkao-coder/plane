# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Stage ViewSet – TMS customization.

from django.db.models import Count, Q
from django.db.utils import IntegrityError

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import StageSerializer
from plane.db.models import Stage

from .. import BaseViewSet


class StageViewSet(BaseViewSet):
    serializer_class = StageSerializer
    model = Stage

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .annotate(
                total_modules=Count(
                    "stage_modules",
                    filter=Q(stage_modules__deleted_at__isnull=True),
                )
            )
            .select_related("project", "workspace")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        stages = self.get_queryset().order_by("sort_order", "-created_at")
        return Response(StageSerializer(stages, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        try:
            serializer = StageSerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "Stage name already exists in this project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        try:
            stage = Stage.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
            serializer = StageSerializer(stage, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Stage.DoesNotExist:
            return Response({"error": "Stage not found"}, status=status.HTTP_404_NOT_FOUND)
        except IntegrityError as e:
            if "already exists" in str(e):
                return Response(
                    {"name": "Stage name already exists in this project"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        stage = Stage.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        # SET_NULL FKs on Module.stage – orphaned modules just become "uncategorised"
        stage.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
