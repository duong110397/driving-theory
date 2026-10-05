from django.db.models import Prefetch, QuerySet
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services
from .models import ExamAttempt, ExamItem
from .serializers import (
    AnswerSerializer,
    ExamAttemptSerializer,
    ExamAttemptSummarySerializer,
    ExamCreateSerializer,
    ExamRuleSerializer,
    SubmitSerializer,
)


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


def _raise_api_error(exc: services.ExamError) -> None:
    if isinstance(exc, services.ExamClosedError):
        raise Conflict(str(exc)) from exc
    raise ValidationError({"detail": str(exc)}) from exc


class ExamRuleListView(APIView):
    def get(self, request: Request) -> Response:
        return Response(ExamRuleSerializer.all_rules())


class ExamViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    - `POST /exams/` `{license_class}`: tạo đề thi ngẫu nhiên theo hạng
    - `GET /exams/`: lịch sử thi của người dùng
    - `GET /exams/{id}/`: đề thi; đáp án chỉ trả về sau khi đã nộp bài
    - `PUT /exams/{id}/answers/` `{question, position}`: lưu một đáp án (tự động lưu)
    - `POST /exams/{id}/submit/` `{answers?: [{question, position}]}`: nộp bài và chấm điểm
    """

    lookup_value_regex = r"[0-9a-f-]{36}"
    pagination_class = PageNumberPagination

    def get_queryset(self) -> QuerySet[ExamAttempt]:
        # Scoped to the current user: other users' attempts are a plain 404.
        return ExamAttempt.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == "list":
            return ExamAttemptSummarySerializer
        if self.action == "create":
            return ExamCreateSerializer
        return ExamAttemptSerializer

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "exam_create"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def list(self, request: Request, *args, **kwargs) -> Response:
        services.finalize_expired_for_user(request.user)
        return super().list(request, *args, **kwargs)

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ExamCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attempt = services.create_attempt(request.user, serializer.validated_data["license_class"])
        return Response(self._detail(attempt.pk), status=status.HTTP_201_CREATED)

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        attempt = services.finalize_if_expired(self.get_object())
        return Response(self._detail(attempt.pk))

    @action(detail=True, methods=["put"])
    def answers(self, request: Request, pk: str | None = None) -> Response:
        serializer = AnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.save_answers(
                self.get_object(), {serializer.validated_data["question"]: serializer.validated_data["position"]}
            )
        except services.ExamError as exc:
            _raise_api_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def submit(self, request: Request, pk: str | None = None) -> Response:
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            attempt = services.submit(self.get_object(), serializer.as_dict())
        except services.ExamError as exc:
            _raise_api_error(exc)
        return Response(self._detail(attempt.pk))

    def _detail(self, pk) -> dict:
        attempt = self.get_queryset().prefetch_related(
            Prefetch("items", queryset=ExamItem.objects.select_related("question").prefetch_related("question__options"))
        ).get(pk=pk)
        return ExamAttemptSerializer(attempt).data
