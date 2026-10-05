from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ExamRuleListView, ExamViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("exams", ExamViewSet, basename="exam")

urlpatterns = [
    path("exams/rules/", ExamRuleListView.as_view(), name="exam-rules"),
    *router.urls,
]
