# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# ProcessTemplate ViewSet + bulk step editor – TMS Phase 1.5.

from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    ProcessStepSerializer,
    ProcessTemplateSerializer,
)
from plane.db.models import ProcessStep, ProcessTemplate

from .. import BaseAPIView, BaseViewSet


class ProcessTemplateViewSet(BaseViewSet):
    serializer_class = ProcessTemplateSerializer
    model = ProcessTemplate

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .prefetch_related("steps")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        qs = self.get_queryset().order_by("stage_key", "name")
        return Response(
            ProcessTemplateSerializer(qs, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        from plane.db.models import Workspace
        try:
            ws = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProcessTemplateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=ws)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        tpl = self.get_queryset().filter(pk=pk).first()
        if tpl is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProcessTemplateSerializer(tpl).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        tpl = self.get_queryset().filter(pk=pk).first()
        if tpl is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProcessTemplateSerializer(tpl, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        tpl = self.get_queryset().filter(pk=pk).first()
        if tpl is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        tpl.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProcessStepBulkEndpoint(BaseAPIView):
    """Bulk replace all steps for a template in one request.

    GET  → list steps
    POST → body: { "steps": [{name, sort_order, default_role, default_estimated_hours}, ...] }
           Replaces the template's step list entirely (soft-deletes removed
           ones, updates existing by id, creates new without id).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id):
        tpl = ProcessTemplate.objects.filter(
            pk=template_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()
        if tpl is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        steps = tpl.steps.filter(deleted_at__isnull=True).order_by("sort_order")
        return Response(ProcessStepSerializer(steps, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id):
        tpl = ProcessTemplate.objects.filter(
            pk=template_id, workspace__slug=slug, deleted_at__isnull=True
        ).first()
        if tpl is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        incoming = request.data.get("steps", [])
        if not isinstance(incoming, list):
            return Response(
                {"error": "steps must be a list"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Soft-delete any current step not present in incoming list
        incoming_ids = {s.get("id") for s in incoming if s.get("id")}
        ProcessStep.objects.filter(template=tpl, deleted_at__isnull=True).exclude(
            id__in=incoming_ids
        ).update(deleted_at=timezone.now())

        # Upsert
        for s in incoming:
            sid = s.get("id")
            payload = {
                "name": s.get("name", ""),
                "sort_order": s.get("sort_order", 65535),
                "default_role": s.get("default_role", ""),
                "default_estimated_hours": s.get("default_estimated_hours"),
            }
            if sid:
                ProcessStep.objects.filter(pk=sid, template=tpl).update(**payload)
            else:
                ProcessStep.objects.create(template=tpl, **payload)

        steps = tpl.steps.filter(deleted_at__isnull=True).order_by("sort_order")
        return Response(ProcessStepSerializer(steps, many=True).data, status=status.HTTP_200_OK)
