# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Risk register ViewSet – TMS Phase 2 / B4.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import RiskSerializer
from plane.db.models import Risk

from .. import BaseViewSet


class RiskViewSet(BaseViewSet):
    serializer_class = RiskSerializer
    model = Risk

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
            .select_related("project", "workspace", "owner")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        qs = self.get_queryset().order_by("status", "-created_at")
        return Response(RiskSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        serializer = RiskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        try:
            risk = Risk.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        except Risk.DoesNotExist:
            return Response({"error": "Risk not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = RiskSerializer(risk, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, pk):
        try:
            risk = Risk.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        except Risk.DoesNotExist:
            return Response({"error": "Risk not found"}, status=status.HTTP_404_NOT_FOUND)
        risk.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
