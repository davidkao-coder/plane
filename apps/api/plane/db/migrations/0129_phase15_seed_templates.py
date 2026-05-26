"""
TMS Phase 1.5 – Seed default Process & Project templates per Workspace.

For every existing Workspace, create:
  * 7 ProcessTemplates (one per stage_key, with its default ProcessSteps)
  * 5 ProjectTemplates (軟體客製 / 網站建置 / 電商 / APP / 維運) + default modules
"""

from django.db import migrations


# (name, default_role, default_estimated_hours)  – hours ≤ 8, step 0.5
PROCESS_TEMPLATES = {
    "req_analysis": (
        "需求分析工序",
        [
            ("訪談", "系統分析師", 8.0),
            ("逐字稿整理", "系統分析師", 4.0),
            ("SRS 撰寫", "系統分析師", 8.0),
            ("客戶評審", "PM", 4.0),
            ("修改簽核", "系統分析師", 4.0),
        ],
    ),
    "design": (
        "設計與規劃工序",
        [
            ("SA", "系統分析師", 8.0),
            ("系統架構圖", "技術 Lead", 8.0),
            ("規格簽核", "PM", 4.0),
        ],
    ),
    "poc": (
        "技術 POC 工序",
        [
            ("UI 高保真", "UI 設計師", 8.0),
            ("SD 系統設計", "技術 Lead", 8.0),
            ("技術選型", "技術 Lead", 8.0),
            ("雛形驗證", "技術 Lead", 8.0),
        ],
    ),
    "dev": (
        "開發工序",
        [
            ("前端", "前端工程師", 8.0),
            ("後端", "後端工程師", 8.0),
        ],
    ),
    "testing": (
        "測試與驗收工序",
        [
            ("QA", "QA", 8.0),
            ("CI/CD（測試環境）", "DevOps", 4.0),
            ("UAT", "PM", 8.0),
        ],
    ),
    "deployment": (
        "上線部署工序",
        [
            ("CI/CD（生產環境）", "DevOps", 4.0),
            ("DNS/SSL", "DevOps", 2.0),
            ("教育訓練", "PM", 4.0),
            ("上線監控", "DevOps", 4.0),
        ],
    ),
    "maintenance": (
        "維護工序",
        [
            ("問題複現", "工程師", 2.0),
            ("修正", "工程師", 8.0),
            ("回歸測試", "QA", 4.0),
            ("發版", "DevOps", 2.0),
        ],
    ),
}


PROJECT_TEMPLATES = [
    (
        "軟體客製化",
        "ERP / CRM 客製化專案",
        True,  # is_default
        ["登入/權限", "會計", "訂單", "庫存", "HR", "採購", "報表"],
    ),
    (
        "網站建置",
        "品牌官網、Landing Page",
        False,
        ["首頁", "產品介紹", "最新消息", "聯絡我們", "SEO", "後台 CMS"],
    ),
    (
        "電商網站",
        "B2C / B2B 電子商務",
        False,
        ["商品", "購物車", "結帳/金流", "會員", "物流", "客服"],
    ),
    (
        "APP 開發",
        "iOS / Android 行動應用",
        False,
        ["註冊登入", "主畫面", "個人頁", "推播", "IAP"],
    ),
    (
        "維運合約",
        "固定維護 / SLA 維運",
        False,
        ["Bug 追蹤", "效能優化", "監控告警", "備份還原"],
    ),
]


def seed_workspace_templates(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    ProcessTemplate = apps.get_model("db", "ProcessTemplate")
    ProcessStep = apps.get_model("db", "ProcessStep")
    ProjectTemplate = apps.get_model("db", "ProjectTemplate")
    ProjectTemplateModule = apps.get_model("db", "ProjectTemplateModule")

    for ws in Workspace.objects.all():
        # 1) Process templates
        for stage_key, (tpl_name, steps) in PROCESS_TEMPLATES.items():
            tpl = ProcessTemplate.objects.filter(
                workspace=ws, stage_key=stage_key, deleted_at__isnull=True
            ).first()
            if tpl is None:
                tpl = ProcessTemplate.objects.create(
                    workspace=ws, stage_key=stage_key, name=tpl_name
                )
            if not tpl.steps.filter(deleted_at__isnull=True).exists():
                for i, (step_name, role, hours) in enumerate(steps):
                    ProcessStep.objects.create(
                        template=tpl,
                        name=step_name,
                        sort_order=(i + 1) * 100,
                        default_role=role,
                        default_estimated_hours=hours,
                    )

        # 2) Project templates
        for i, (tpl_name, desc, is_default, modules) in enumerate(PROJECT_TEMPLATES):
            pt = ProjectTemplate.objects.filter(
                workspace=ws, name=tpl_name, deleted_at__isnull=True
            ).first()
            if pt is None:
                pt = ProjectTemplate.objects.create(
                    workspace=ws,
                    name=tpl_name,
                    description=desc,
                    is_default=is_default,
                    sort_order=(i + 1) * 100,
                )
            if not pt.modules.filter(deleted_at__isnull=True).exists():
                for j, module_name in enumerate(modules):
                    ProjectTemplateModule.objects.create(
                        template=pt,
                        name=module_name,
                        sort_order=(j + 1) * 100,
                    )


class Migration(migrations.Migration):
    dependencies = [("db", "0128_phase15_schema")]
    operations = [
        migrations.RunPython(seed_workspace_templates, reverse_code=migrations.RunPython.noop),
    ]
