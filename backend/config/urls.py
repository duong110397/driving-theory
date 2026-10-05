from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import FileResponse, HttpRequest
from django.urls import include, path, re_path
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.questions.urls")),
    path("api/", include("apps.exams.urls")),
    path("api/admin/", include("apps.backoffice.urls")),
]

if settings.DEBUG:
    # Dev only; in production media must be served by nginx / object storage.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.FRONTEND_DIST:

    @require_safe
    @never_cache
    def spa_index(request: HttpRequest) -> FileResponse:
        """Serve the SPA shell for client-side routes (e.g. /history, /exams/1)."""
        return FileResponse((settings.FRONTEND_DIST / "index.html").open("rb"), content_type="text/html")

    # Must stay last; API/admin/asset paths never fall through to the SPA.
    urlpatterns += [re_path(r"^(?!api/|admin/|static/|media/|assets/).*$", spa_index)]
