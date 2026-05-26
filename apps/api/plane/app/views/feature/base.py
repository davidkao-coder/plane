# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Feature ViewSet + Requirement↔Feature pivot endpoint – TMS customization.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import FeatureSerializer, RequirementSerializer
from plane.db.models import Feature, Requirement, RequirementFeature

from .. import BaseAPIView, BaseViewSet


class FeatureViewSet(BaseViewSet):
    serializer_class = FeatureSerializer
    model = Feature

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
            .select_related("project", "workspace", "requirement")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        qs = self.get_queryset().order_by("sort_order", "-created_at")
        return Response(FeatureSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        serializer = FeatureSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(project_id=project_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, pk):
        try:
            feature = Feature.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
            serializer = FeatureSerializer(feature, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Feature.DoesNotExist:
            return Response({"error": "Feature not found"}, status=status.HTTP_404_NOT_FOUND)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        feature = Feature.objects.get(pk=pk, project_id=project_id, workspace__slug=slug)
        feature.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementFeatureLinkEndpoint(BaseAPIView):
    """Attach / detach Features under a Requirement (and the reverse listing)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, requirement_id):
        """List Features attached to a Requirement."""
        feature_ids = RequirementFeature.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            requirement_id=requirement_id,
            deleted_at__isnull=True,
        ).values_list("feature_id", flat=True)
        features = Feature.objects.filter(id__in=feature_ids)
        return Response(FeatureSerializer(features, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, requirement_id):
        """Attach a Feature to a Requirement.

        Body: { "feature_id": "<uuid>" }
        """
        feature_id = request.data.get("feature_id")
        if not feature_id:
            return Response({"error": "feature_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            Requirement.objects.get(pk=requirement_id, project_id=project_id, workspace__slug=slug)
            Feature.objects.get(pk=feature_id, project_id=project_id, workspace__slug=slug)
        except (Requirement.DoesNotExist, Feature.DoesNotExist):
            return Response({"error": "Requirement or Feature not found"}, status=status.HTTP_404_NOT_FOUND)

        link, created = RequirementFeature.objects.get_or_create(
            requirement_id=requirement_id,
            feature_id=feature_id,
            defaults={"project_id": project_id},
        )
        return Response(
            {"linked": True, "created": created, "id": str(link.id)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, requirement_id, feature_id=None):
        """Detach a Feature from a Requirement."""
        fid = feature_id or request.data.get("feature_id")
        if not fid:
            return Response({"error": "feature_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        RequirementFeature.objects.filter(
            requirement_id=requirement_id,
            feature_id=fid,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
