"""
TMS Phase 1.5 – Fix WorkspaceBaseModel descendants.

ProcessTemplate / ProjectTemplate inherit from WorkspaceBaseModel which adds
a nullable `project` FK. Migration 0128 missed this column; this migration
adds it.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("db", "0131_phase15_drop_old_fields")]

    operations = [
        migrations.AddField(
            model_name="processtemplate",
            name="project",
            field=models.ForeignKey(
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="project_processtemplate",
                to="db.project",
            ),
        ),
        migrations.AddField(
            model_name="projecttemplate",
            name="project",
            field=models.ForeignKey(
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="project_projecttemplate",
                to="db.project",
            ),
        ),
    ]
