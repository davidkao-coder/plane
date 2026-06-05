# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.apps import AppConfig


class DbConfig(AppConfig):
    name = "plane.db"

    def ready(self):
        # Register TMS signals (process-step completion notifications) – Phase 2.
        try:
            import plane.db.signals  # noqa: F401
        except Exception:
            # Never block app startup on optional signal wiring.
            pass
