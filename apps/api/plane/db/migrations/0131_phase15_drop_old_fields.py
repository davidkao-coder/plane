"""
TMS Phase 1.5 – Drop fields obsoleted by the hierarchy refactor.

  * Module.stage_id   – Modules no longer belong to a Stage
  * Feature.stage_id  – Features no longer belong to a Stage; Stage now lives
                        as a tag on each spawned Issue
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("db", "0130_phase15_backfill")]
    operations = [
        migrations.RemoveField(model_name="module", name="stage"),
        migrations.RemoveField(model_name="feature", name="stage"),
    ]
