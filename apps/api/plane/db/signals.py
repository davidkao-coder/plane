# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS signals – Phase 2 / B4.
# Detect when a process-step Issue transitions INTO a completed state and
# notify the next step's assignee(s).

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from plane.db.models import Issue, Project, Workspace


def _state_group(issue):
    try:
        return issue.state.group if issue.state_id and issue.state else None
    except Exception:
        return None


@receiver(pre_save, sender=Issue)
def _stash_old_state_group(sender, instance, **kwargs):
    """Remember the issue's previous state group so post_save can detect a
    transition into 'completed'."""
    if instance._state.adding or instance.pk is None:
        instance._tms_old_state_group = None
        return
    try:
        old = Issue.objects.filter(pk=instance.pk).values_list("state__group", flat=True).first()
    except Exception:
        old = None
    instance._tms_old_state_group = old


@receiver(post_save, sender=Workspace)
def _seed_new_workspace(sender, instance, created, **kwargs):
    """New workspace → seed standard process + project templates."""
    if not created:
        return
    try:
        from plane.utils.tms_seed import seed_workspace_templates

        seed_workspace_templates(instance)
    except Exception:
        pass


@receiver(post_save, sender=Project)
def _seed_new_project(sender, instance, created, **kwargs):
    """New project → seed 7 standard stages (fixed order) + 未分類 chain so
    the TMS hierarchy and feature auto-spawn work out of the box."""
    if not created:
        return
    try:
        from plane.utils.tms_seed import seed_project_scaffold

        seed_project_scaffold(instance)
    except Exception:
        pass


@receiver(post_save, sender=Issue)
def _on_issue_saved(sender, instance, created, **kwargs):
    """Fire process-step completion notification when an issue newly enters a
    completed state. Best-effort: never raise out of a save()."""
    if created:
        return
    if instance.process_step_id is None or instance.feature_id is None:
        return
    try:
        old_group = getattr(instance, "_tms_old_state_group", None)
        new_group = _state_group(instance)
        if new_group == "completed" and old_group != "completed":
            from plane.utils.tms_notify import notify_next_process_step

            notify_next_process_step(instance, triggered_by_id=instance.updated_by_id)
    except Exception:
        # Notifications must never break issue saving.
        pass
