from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0121_alter_estimate_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="issue",
            name="estimate_hours",
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="actual_hours",
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="completed_hours",
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name="issue",
            name="remaining_hours",
            field=models.DecimalField(blank=True, decimal_places=1, max_digits=7, null=True),
        ),
    ]
