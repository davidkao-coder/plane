# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS scaffolding seeders – Phase 2 fix.
#
# Make the TMS structure self-sustaining: every NEW workspace gets the
# standard process/project templates, and every NEW project gets the 7
# standard stages (in fixed order) + an "未分類" fallback chain. Previously
# this only happened via one-off backfill migrations (0129/0130), so any
# workspace/project created afterwards was missing the structure.
#
# All functions are idempotent.

# (name, [(step_name, default_role, default_estimated_hours), ...])  hours ≤ 8
PROCESS_TEMPLATES = {
    "req_analysis": ("需求分析工序", [
        ("訪談", "系統分析師", 8.0), ("逐字稿整理", "系統分析師", 4.0),
        ("SRS 撰寫", "系統分析師", 8.0), ("客戶評審", "PM", 4.0), ("修改簽核", "系統分析師", 4.0),
    ]),
    "design": ("設計與規劃工序", [
        ("SA", "系統分析師", 8.0), ("系統架構圖", "技術 Lead", 8.0), ("規格簽核", "PM", 4.0),
    ]),
    "poc": ("技術 POC 工序", [
        ("UI 高保真", "UI 設計師", 8.0), ("SD 系統設計", "技術 Lead", 8.0),
        ("技術選型", "技術 Lead", 8.0), ("雛形驗證", "技術 Lead", 8.0),
    ]),
    "dev": ("開發工序", [("前端", "前端工程師", 8.0), ("後端", "後端工程師", 8.0)]),
    "testing": ("測試與驗收工序", [
        ("QA", "QA", 8.0), ("CI/CD（測試環境）", "DevOps", 4.0), ("UAT", "PM", 8.0),
    ]),
    "deployment": ("上線部署工序", [
        ("CI/CD（生產環境）", "DevOps", 4.0), ("DNS/SSL", "DevOps", 2.0),
        ("教育訓練", "PM", 4.0), ("上線監控", "DevOps", 4.0),
    ]),
    "maintenance": ("維護工序", [
        ("問題複現", "工程師", 2.0), ("修正", "工程師", 8.0),
        ("回歸測試", "QA", 4.0), ("發版", "DevOps", 2.0),
    ]),
}

PROJECT_TEMPLATES = [
    ("軟體客製化", "ERP / CRM 客製化專案", True,
     ["登入/權限", "會計", "訂單", "庫存", "HR", "採購", "報表"]),
    ("網站建置", "品牌官網、Landing Page", False,
     ["首頁", "產品介紹", "最新消息", "聯絡我們", "SEO", "後台 CMS"]),
    ("電商網站", "B2C / B2B 電子商務", False,
     ["商品", "購物車", "結帳/金流", "會員", "物流", "客服"]),
    ("APP 開發", "iOS / Android 行動應用", False,
     ["註冊登入", "主畫面", "個人頁", "推播", "IAP"]),
    ("維運合約", "固定維護 / SLA 維運", False,
     ["Bug 追蹤", "效能優化", "監控告警", "備份還原"]),
]

# (key, display name, sort_order) – fixed big→small order
STANDARD_STAGES = [
    ("req_analysis", "需求分析", 100),
    ("design", "設計與規劃", 200),
    ("poc", "技術 POC", 300),
    ("dev", "開發", 400),
    ("testing", "測試與驗收", 500),
    ("deployment", "上線部署", 600),
    ("maintenance", "維護", 700),
]

UNSORTED = "未分類"


def seed_workspace_templates(workspace):
    """Idempotently ensure a workspace has the 7 process templates (+steps)
    and 5 project templates (+modules)."""
    from plane.db.models import (
        ProcessTemplate, ProcessStep, ProjectTemplate, ProjectTemplateModule,
    )

    for stage_key, (tpl_name, steps) in PROCESS_TEMPLATES.items():
        tpl = ProcessTemplate.objects.filter(
            workspace=workspace, stage_key=stage_key, deleted_at__isnull=True
        ).first()
        if tpl is None:
            tpl = ProcessTemplate.objects.create(
                workspace=workspace, stage_key=stage_key, name=tpl_name
            )
        if not tpl.steps.filter(deleted_at__isnull=True).exists():
            for i, (sn, role, hours) in enumerate(steps):
                ProcessStep.objects.create(
                    template=tpl, name=sn, sort_order=(i + 1) * 100,
                    default_role=role, default_estimated_hours=hours,
                )

    for i, (name, desc, is_default, modules) in enumerate(PROJECT_TEMPLATES):
        pt = ProjectTemplate.objects.filter(
            workspace=workspace, name=name, deleted_at__isnull=True
        ).first()
        if pt is None:
            pt = ProjectTemplate.objects.create(
                workspace=workspace, name=name, description=desc,
                is_default=is_default, sort_order=(i + 1) * 100,
            )
        if not pt.modules.filter(deleted_at__isnull=True).exists():
            for j, mname in enumerate(modules):
                ProjectTemplateModule.objects.create(
                    template=pt, name=mname, sort_order=(j + 1) * 100
                )


def seed_project_scaffold(project):
    """Idempotently ensure a project has the 7 standard stages (fixed order,
    each linked to the workspace process template) + an 未分類 fallback stage
    and Module→Requirement→Feature chain."""
    from plane.db.models import (
        Stage, Module, Requirement, Feature, ProcessTemplate,
    )

    ws = project.workspace
    # Make sure the workspace templates exist (covers freshly-created ws too)
    seed_workspace_templates(ws)

    for key, name, sort_order in STANDARD_STAGES:
        if Stage.objects.filter(project=project, key=key, deleted_at__isnull=True).exists():
            continue
        tpl = ProcessTemplate.objects.filter(
            workspace=ws, stage_key=key, deleted_at__isnull=True
        ).first()
        Stage.objects.create(
            project=project, workspace=ws, key=key, name=name,
            sort_order=sort_order, process_template=tpl,
        )

    # Unsorted fallback stage
    if not Stage.objects.filter(project=project, key="unsorted", deleted_at__isnull=True).exists():
        Stage.objects.create(
            project=project, workspace=ws, key="unsorted", name=UNSORTED, sort_order=9999
        )

    # Default Module → Requirement → Feature chain
    module = Module.objects.filter(project=project, name=UNSORTED, deleted_at__isnull=True).first()
    if module is None:
        module = Module.objects.create(project=project, workspace=ws, name=UNSORTED, sort_order=9999)

    req = Requirement.objects.filter(
        project=project, module=module, deleted_at__isnull=True
    ).order_by("sequence_id").first()
    if req is None:
        req = Requirement.objects.create(
            project=project, workspace=ws, module=module, description=UNSORTED, priority="none"
        )

    feat = Feature.objects.filter(
        project=project, requirement=req, deleted_at__isnull=True
    ).order_by("sequence_id").first()
    if feat is None:
        Feature.objects.create(project=project, workspace=ws, requirement=req, name=UNSORTED)
