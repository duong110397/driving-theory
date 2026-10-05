from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AdminStatsView, AdminUserViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("users", AdminUserViewSet, basename="admin-user")

urlpatterns = [path("stats/", AdminStatsView.as_view(), name="admin-stats"), *router.urls]
