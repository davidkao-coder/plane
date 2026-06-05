"""
TMS Phase 2 – Project client / contract metadata fields.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("db", "0132_phase15_fix_workspace_base")]

    operations = [
        migrations.AddField(
            model_name="project",
            name="client_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="project",
            name="contract_no",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="project",
            name="client_pic",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="project",
            name="client_contact",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
