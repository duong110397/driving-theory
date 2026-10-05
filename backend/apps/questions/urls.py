from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ChapterViewSet, QuestionViewSet, TipsView

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("chapters", ChapterViewSet, basename="chapter")
router.register("questions", QuestionViewSet, basename="question")

urlpatterns = [path("tips/", TipsView.as_view(), name="tips"), *router.urls]
