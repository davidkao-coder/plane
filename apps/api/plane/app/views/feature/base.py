# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Feature ViewSet + auto-spawn workflow – TMS Phase 1.5.

from django.db import transaction
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import FeatureSerializer, RequirementSerializer
from plane.db.models import (
    Feature,
    FeatureDependency,
    Issue,
    Requirement,
    RequirementFeature,
    Stage,
    State,
)
from plane.utils.tms_health import is_issue_overdue

from .. import BaseAPIView, BaseViewSet


def spawn_default_issues_for_feature(feature, user=None):
    """Phase 1.5 — when a Feature is created, auto-create one Issue per
    ProcessStep defined on each Stage's ProcessTemplate for that project.

    The Issues are placed in the project's default state (lowest priority
    backlog / first state). Stage tag + process_step FK are populated.
    """
    project = feature.project
    # Pick a sensible default state (first one in default group "backlog" /
    # else first by sequence).
    default_state = (
        State.objects.filter(project=project, group="backlog").first()
        or State.objects.filter(project=project).order_by("sequence").first()
    )
    if default_state is None:
        # No states – fall back without state (Plane allows null state)
        default_state = None

    created_count = 0
    stages = (
        Stage.objects.filter(project=project, deleted_at__isnull=True)
        .exclude(key="unsorted")
        .exclude(key__isnull=True)
        .select_related("process_template")
        .order_by("sort_order")
    )
    for stage in stages:
        if stage.process_template_id is None:
            continue
        steps = stage.process_template.steps.filter(
            deleted_at__isnull=True
        ).order_by("sort_order")
        for step in steps:
            issue = Issue.objects.create(
                project=project,
                workspace=project.workspace,
                feature=feature,
                stage=stage,
                process_step=step,
                name=f"{step.name} — {feature.name}",
                estimate_hours=step.default_estimated_hours,
                state=default_state,
                created_by=user,
                updated_by=user,
            )
            created_count += 1
    return created_count


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
            .prefetch_related("dependencies")
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
            with transaction.atomic():
                feature = serializer.save(project_id=project_id)
                # Phase 1.5: auto-spawn Issues for the standard stages
                spawned = spawn_default_issues_for_feature(feature, user=request.user)
            data = serializer.data
            data["spawned_issues"] = spawned
            return Response(data, status=status.HTTP_201_CREATED)
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


class FeatureIssuesEndpoint(BaseAPIView):
    """List all Issues spawned from a Feature, grouped by Stage.

    GET /workspaces/<slug>/projects/<pid>/features/<fid>/issues/
    Returns a flat list with stage_key / stage_name / process_step_name
    expanded so the front-end can group without N+1.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, feature_id):
        qs = (
            Issue.issue_objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                feature_id=feature_id,
            )
            .select_related(
                "stage",
                "process_step",
                "state",
                "feature",
                "feature__requirement",
                "feature__requirement__module",
            )
            .order_by("stage__sort_order", "process_step__sort_order", "created_at")
        )
        today = timezone.now().date()
        data = []
        for i in qs:
            feat = i.feature
            req = feat.requirement if feat else None
            mod = req.module if req else None
            data.append(
                {
                    "id": str(i.id),
                    "name": i.name,
                    "sequence_id": i.sequence_id,
                    "estimate_hours": float(i.estimate_hours) if i.estimate_hours is not None else None,
                    "actual_hours": float(i.actual_hours) if i.actual_hours is not None else None,
                    "start_date": i.start_date.isoformat() if i.start_date else None,
                    "target_date": i.target_date.isoformat() if i.target_date else None,
                    "is_overdue": is_issue_overdue(
                        i.target_date, i.state.group if i.state else None, today
                    ),
                    "stage_id": str(i.stage_id) if i.stage_id else None,
                    "stage_key": i.stage.key if i.stage else None,
                    "stage_name": i.stage.name if i.stage else None,
                    "stage_sort_order": i.stage.sort_order if i.stage else None,
                    "process_step_id": str(i.process_step_id) if i.process_step_id else None,
                    "process_step_name": i.process_step.name if i.process_step else None,
                    "state_id": str(i.state_id) if i.state_id else None,
                    "state_name": i.state.name if i.state else None,
                    "state_group": i.state.group if i.state else None,
                    # parent breadcrumb (workboard flat views need this)
                    "feature_id": str(feat.id) if feat else None,
                    "feature_display_id": feat.feature_id if feat else None,
                    "feature_name": feat.name if feat else None,
                    "requirement_id": str(req.id) if req else None,
                    "requirement_display_id": req.requirement_id if req else None,
                    "module_id": str(mod.id) if mod else None,
                    "module_name": mod.name if mod else None,
                    "created_at": i.created_at.isoformat(),
                }
            )
        return Response(data, status=status.HTTP_200_OK)


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


class FeatureDependencyEndpoint(BaseAPIView):
    """Manage Feature → Feature dependencies (B3).

    GET    /features/<fid>/dependencies/                 list prerequisites
    POST   /features/<fid>/dependencies/  {depends_on_id}  add prerequisite
    DELETE /features/<fid>/dependencies/<depends_on_id>/   remove prerequisite
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, feature_id):
        ids = FeatureDependency.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            feature_id=feature_id,
            deleted_at__isnull=True,
        ).values_list("depends_on_id", flat=True)
        features = Feature.objects.filter(id__in=ids)
        return Response(FeatureSerializer(features, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, feature_id):
        depends_on_id = request.data.get("depends_on_id")
        if not depends_on_id:
            return Response({"error": "depends_on_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if str(depends_on_id) == str(feature_id):
            return Response({"error": "A feature cannot depend on itself"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            Feature.objects.get(pk=feature_id, project_id=project_id, workspace__slug=slug)
            Feature.objects.get(pk=depends_on_id, project_id=project_id, workspace__slug=slug)
        except Feature.DoesNotExist:
            return Response({"error": "Feature not found"}, status=status.HTTP_404_NOT_FOUND)

        # Prevent a direct 2-cycle (A depends on B while B depends on A)
        reverse_exists = FeatureDependency.objects.filter(
            feature_id=depends_on_id,
            depends_on_id=feature_id,
            deleted_at__isnull=True,
        ).exists()
        if reverse_exists:
            return Response(
                {"error": "Circular dependency: the other feature already depends on this one"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        link, created = FeatureDependency.objects.get_or_create(
            feature_id=feature_id,
            depends_on_id=depends_on_id,
            defaults={"project_id": project_id},
        )
        return Response(
            {"linked": True, "created": created, "id": str(link.id)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, feature_id, depends_on_id=None):
        dep_id = depends_on_id or request.data.get("depends_on_id")
        if not dep_id:
            return Response({"error": "depends_on_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        FeatureDependency.objects.filter(
            feature_id=feature_id,
            depends_on_id=dep_id,
            project_id=project_id,
            workspace__slug=slug,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
