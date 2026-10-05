from rest_framework.routers import DefaultRouter

from .views import ChapterViewSet, QuestionViewSet

router = DefaultRouter(trailing_slash=True)
router.include_root_view = False
router.register("chapters", ChapterViewSet, basename="chapter")
router.register("questions", QuestionViewSet, basename="question")

urlpatterns = router.urls
