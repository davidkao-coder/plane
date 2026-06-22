# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS #8 – end-of-day daily report generator (Celery beat).

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from celery import shared_task

TZ = ZoneInfo("Asia/Taipei")
logger = logging.getLogger("plane")


@shared_task
def generate_daily_reports():
    """Generate + persist the end-of-day snapshot for every workspace, for the
    current Asia/Taipei date (the day that is ending). Idempotent."""
    from plane.db.models import Workspace
    from plane.utils.tms_daily_report import upsert_daily_report

    report_date = datetime.now(TZ).date()
    count = 0
    for ws in Workspace.objects.filter(deleted_at__isnull=True):
        try:
            upsert_daily_report(ws, report_date)
            count += 1
        except Exception:
            logger.exception("daily report generation failed for workspace %s", ws.id)
    return f"generated daily reports for {count} workspace(s) on {report_date}"
