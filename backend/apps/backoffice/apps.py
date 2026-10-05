from django.apps import AppConfig


class BackofficeConfig(AppConfig):
    """Read-only admin API used by the SPA's "Quản trị" page (staff users only)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backoffice"
