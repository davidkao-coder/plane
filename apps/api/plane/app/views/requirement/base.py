# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Requirement ViewSet – TMS customization.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import RequirementSerializer
from plane.db.models import Requirement

from .. import BaseViewSet


class RequirementViewSet(BaseViewSet):
    serializer_class = RequirementSerializer
    model = Requirement

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
            .select_related("project", "workspace")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        qs = self.get_queryset().order_by("sequence_id")
        return Response(RequirementSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        serializer = RequirementSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        try:
            req = Requirement.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
            serializer = RequirementSerializer(req, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Requirement.DoesNotExist:
            return Response({"error": "Requirement not found"}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        req = Requirement.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        req.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
