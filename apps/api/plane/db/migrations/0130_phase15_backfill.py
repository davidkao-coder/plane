"""
TMS Phase 1.5 – Per-project backfill.

For every existing Project:
  * Rekey the legacy "未分類階段" Stage to key='unsorted' (if any)
  * Create 7 standard Stages (req_analysis ~ maintenance), each FK to the
    workspace's ProcessTemplate by stage_key
  * Ensure an "未分類" Module / Requirement / Feature exists (default chain)
  * Backfill existing Requirements (module=None) → "未分類" Module
  * Backfill existing Features (requirement=None) → first M:N-linked
    Requirement, else "未分類" Requirement (preserving original link list
    in description as "[原連: REQ-001, REQ-005]")
  * Backfill existing Issues (feature=None) → "未分類" Feature

Idempotent — safe to re-run.
"""

from django.db import migrations


STANDARD_STAGES = [
    ("req_analysis", "需求分析", 100),
    ("design", "設計與規劃", 200),
    ("poc", "技術 POC", 300),
    ("dev", "開發", 400),
    ("testing", "測試與驗收", 500),
    ("deployment", "上線部署", 600),
    ("maintenance", "維護", 700),
]

UNSORTED_LABEL = "未分類"


def backfill(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    Stage = apps.get_model("db", "Stage")
    Module = apps.get_model("db", "Module")
    Requirement = apps.get_model("db", "Requirement")
    Feature = apps.get_model("db", "Feature")
    Issue = apps.get_model("db", "Issue")
    RequirementFeature = apps.get_model("db", "RequirementFeature")
    ProcessTemplate = apps.get_model("db", "ProcessTemplate")

    for proj in Project.objects.all():
        ws = proj.workspace

        # ── 1. Stages ────────────────────────────────────────────────────
        # Rekey legacy "未分類階段" → key='unsorted' (or rename to "未分類")
        legacy_unsorted = Stage.objects.filter(
            project=proj, name="未分類階段", deleted_at__isnull=True
        ).first()
        if legacy_unsorted:
            legacy_unsorted.key = "unsorted"
            legacy_unsorted.name = UNSORTED_LABEL
            legacy_unsorted.sort_order = 9999
            legacy_unsorted.save(update_fields=["key", "name", "sort_order"])
        else:
            legacy_unsorted = Stage.objects.filter(
                project=proj, key="unsorted", deleted_at__isnull=True
            ).first()
            if legacy_unsorted is None:
                legacy_unsorted = Stage.objects.create(
                    project=proj,
                    workspace=ws,
                    key="unsorted",
                    name=UNSORTED_LABEL,
                    sort_order=9999,
                )

        # 7 standard stages — match by key first, fallback by name (so
        # admin-created stages get adopted instead of duplicated)
        for key, name, sort_order in STANDARD_STAGES:
            tpl = ProcessTemplate.objects.filter(
                workspace=ws, stage_key=key, deleted_at__isnull=True
            ).first()
            existing = Stage.objects.filter(
                project=proj, key=key, deleted_at__isnull=True
            ).first()
            if existing is None:
                existing = Stage.objects.filter(
                    project=proj, name=name, deleted_at__isnull=True
                ).first()
            if existing is None:
                Stage.objects.create(
                    project=proj,
                    workspace=ws,
                    key=key,
                    name=name,
                    sort_order=sort_order,
                    process_template=tpl,
                )
            else:
                changed = False
                if existing.key != key:
                    existing.key = key
                    changed = True
                if existing.process_template_id is None and tpl:
                    existing.process_template = tpl
                    changed = True
                if changed:
                    existing.save(update_fields=["key", "process_template"])

        # ── 2. Default Module / Requirement / Feature chain ──────────────
        unsorted_module = Module.objects.filter(
            project=proj, name=UNSORTED_LABEL, deleted_at__isnull=True
        ).first()
        if unsorted_module is None:
            unsorted_module = Module.objects.create(
                project=proj, workspace=ws, name=UNSORTED_LABEL, sort_order=9999
            )

        unsorted_req = Requirement.objects.filter(
            project=proj, module=unsorted_module, deleted_at__isnull=True
        ).order_by("sequence_id").first()
        if unsorted_req is None:
            unsorted_req = Requirement.objects.create(
                project=proj,
                workspace=ws,
                module=unsorted_module,
                description=UNSORTED_LABEL,
                priority="none",
            )

        unsorted_feature = Feature.objects.filter(
            project=proj, requirement=unsorted_req, deleted_at__isnull=True
        ).order_by("sequence_id").first()
        if unsorted_feature is None:
            unsorted_feature = Feature.objects.create(
                project=proj,
                workspace=ws,
                requirement=unsorted_req,
                name=UNSORTED_LABEL,
            )

        # ── 3. Backfill Requirements without module ──────────────────────
        Requirement.objects.filter(
            project=proj, module__isnull=True, deleted_at__isnull=True
        ).update(module=unsorted_module)

        # ── 4. Backfill Features without requirement ─────────────────────
        for feat in Feature.objects.filter(
            project=proj, requirement__isnull=True, deleted_at__isnull=True
        ):
            links = list(
                RequirementFeature.objects.filter(
                    feature=feat, deleted_at__isnull=True
                ).order_by("created_at")
            )
            if links:
                first_req_id = links[0].requirement_id
                # Annotate description with original M:N record (preserves info)
                if len(links) > 1:
                    others = ", ".join(
                        f"REQ-{Requirement.objects.get(pk=l.requirement_id).sequence_id:03d}"
                        for l in links[1:]
                    )
                    note = f"\n\n[原 M:N 連結: {others}]"
                    feat.description = (feat.description or "") + note
                feat.requirement_id = first_req_id
                feat.save(update_fields=["requirement", "description"])
            else:
                feat.requirement = unsorted_req
                feat.save(update_fields=["requirement"])

        # ── 5. Backfill Issues without feature (raw SQL — Issue model in
        # migration context doesn't expose Plane's custom IssueManager) ──
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE issues SET feature_id = %s "
                " WHERE project_id = %s AND feature_id IS NULL",
                [str(unsorted_feature.id), str(proj.id)],
            )


class Migration(migrations.Migration):
    dependencies = [("db", "0129_phase15_seed_templates")]
    operations = [
        migrations.RunPython(backfill, reverse_code=migrations.RunPython.noop),
    ]
