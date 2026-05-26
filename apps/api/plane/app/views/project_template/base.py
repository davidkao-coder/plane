# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# ProjectTemplate CRUD + apply-template endpoint – TMS Phase 1.5.

from django.db import transaction
from django.db.models import Count, Q

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    ProjectTemplateSerializer,
    ProjectTemplateModuleSerializer,
    ProjectTemplateRequirementSerializer,
)
from plane.db.models import (
    Module,
    Project,
    ProjectTemplate,
    ProjectTemplateModule,
    ProjectTemplateRequirement,
    Requirement,
)

from .. import BaseAPIView, BaseViewSet


class ProjectTemplateViewSet(BaseViewSet):
    serializer_class = ProjectTemplateSerializer
    model = ProjectTemplate

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .annotate(
                modules_count=Count(
                    "modules", filter=Q(modules__deleted_at__isnull=True)
                )
            )
            .prefetch_related("modules", "modules__requirements")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        qs = self.get_queryset().order_by("sort_order", "name")
        return Response(
            ProjectTemplateSerializer(qs, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        from plane.db.models import Workspace
        try:
            ws = Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(workspace=ws)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        pt = self.get_queryset().filter(pk=pk).first()
        if pt is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectTemplateSerializer(pt).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        pt = self.get_queryset().filter(pk=pk).first()
        if pt is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateSerializer(pt, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        pt = self.get_queryset().filter(pk=pk).first()
        if pt is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        pt.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateModuleEndpoint(BaseAPIView):
    """CRUD modules inside a ProjectTemplate.

    GET    /workspaces/<slug>/project-templates/<tpl>/modules/
    POST   /workspaces/<slug>/project-templates/<tpl>/modules/
    PATCH  /workspaces/<slug>/project-templates/<tpl>/modules/<mid>/
    DELETE /workspaces/<slug>/project-templates/<tpl>/modules/<mid>/
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id, module_id=None):
        if module_id:
            m = ProjectTemplateModule.objects.filter(
                pk=module_id,
                template_id=template_id,
                template__workspace__slug=slug,
                deleted_at__isnull=True,
            ).first()
            if m is None:
                return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(ProjectTemplateModuleSerializer(m).data)
        qs = ProjectTemplateModule.objects.filter(
            template_id=template_id,
            template__workspace__slug=slug,
            deleted_at__isnull=True,
        ).order_by("sort_order")
        return Response(ProjectTemplateModuleSerializer(qs, many=True).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id, module_id=None):
        if module_id:
            return Response({"error": "Use PATCH for update"}, status=status.HTTP_400_BAD_REQUEST)
        payload = {**request.data, "template": template_id}
        serializer = ProjectTemplateModuleSerializer(data=payload)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id, module_id):
        m = ProjectTemplateModule.objects.filter(
            pk=module_id,
            template_id=template_id,
            template__workspace__slug=slug,
            deleted_at__isnull=True,
        ).first()
        if m is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateModuleSerializer(m, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, template_id, module_id):
        ProjectTemplateModule.objects.filter(
            pk=module_id,
            template_id=template_id,
            template__workspace__slug=slug,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateRequirementEndpoint(BaseAPIView):
    """CRUD requirements inside a ProjectTemplateModule."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, template_id, module_id, requirement_id=None):
        if requirement_id:
            r = ProjectTemplateRequirement.objects.filter(
                pk=requirement_id,
                template_module_id=module_id,
                template_module__template__workspace__slug=slug,
                deleted_at__isnull=True,
            ).first()
            if r is None:
                return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(ProjectTemplateRequirementSerializer(r).data)
        qs = ProjectTemplateRequirement.objects.filter(
            template_module_id=module_id,
            template_module__template__workspace__slug=slug,
            deleted_at__isnull=True,
        ).order_by("sort_order")
        return Response(ProjectTemplateRequirementSerializer(qs, many=True).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id, module_id, requirement_id=None):
        payload = {**request.data, "template_module": module_id}
        serializer = ProjectTemplateRequirementSerializer(data=payload)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id, module_id, requirement_id):
        r = ProjectTemplateRequirement.objects.filter(
            pk=requirement_id,
            template_module_id=module_id,
            template_module__template__workspace__slug=slug,
            deleted_at__isnull=True,
        ).first()
        if r is None:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectTemplateRequirementSerializer(r, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, template_id, module_id, requirement_id):
        ProjectTemplateRequirement.objects.filter(
            pk=requirement_id,
            template_module_id=module_id,
            template_module__template__workspace__slug=slug,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApplyProjectTemplateEndpoint(BaseAPIView):
    """Apply a ProjectTemplate's modules + requirements onto an EXISTING
    Project. Used both when:
      * a brand-new project picks a template via the create-project modal
      * an admin retroactively applies a template to an existing project
        ("import" missing modules / requirements; never deletes anything)

    POST body: { "template_id": "<uuid>" }
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, project_id):
        template_id = request.data.get("template_id")
        if not template_id:
            return Response(
                {"error": "template_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            project = Project.objects.get(pk=project_id, workspace__slug=slug)
        except Project.DoesNotExist:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            tpl = ProjectTemplate.objects.get(
                pk=template_id, workspace__slug=slug, deleted_at__isnull=True
            )
        except ProjectTemplate.DoesNotExist:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        report = apply_template_to_project(tpl, project, request.user)
        return Response(
            {"applied": True, "template": tpl.name, **report},
            status=status.HTTP_200_OK,
        )


def apply_template_to_project(template: ProjectTemplate, project: Project, user=None):
    """Idempotent — clone the template's modules + requirements into the
    project. Existing modules with the same name are left alone (we only
    add; we never overwrite or delete user data).

    Returns: {"modules_created": N, "requirements_created": M}
    """
    modules_created = 0
    requirements_created = 0

    with transaction.atomic():
        for tpl_module in template.modules.filter(deleted_at__isnull=True).order_by(
            "sort_order"
        ):
            module, created = Module.objects.get_or_create(
                project=project,
                workspace=project.workspace,
                name=tpl_module.name,
                deleted_at__isnull=True,
                defaults={
                    "description": tpl_module.description or "",
                    "sort_order": tpl_module.sort_order,
                },
            )
            if created:
                modules_created += 1

            for tpl_req in tpl_module.requirements.filter(
                deleted_at__isnull=True
            ).order_by("sort_order"):
                # Look for an existing requirement with same description in this module
                existing = Requirement.objects.filter(
                    project=project,
                    module=module,
                    description=tpl_req.description,
                    deleted_at__isnull=True,
                ).first()
                if existing is None:
                    Requirement.objects.create(
                        project=project,
                        workspace=project.workspace,
                        module=module,
                        description=tpl_req.description,
                        source=tpl_req.source or "",
                        priority=tpl_req.priority or "medium",
                        created_by=user,
                    )
                    requirements_created += 1

        # Record which template was applied (informational)
        if project.template_applied_id != template.id:
            project.template_applied = template
            project.save(update_fields=["template_applied"])

    return {
        "modules_created": modules_created,
        "requirements_created": requirements_created,
    }
