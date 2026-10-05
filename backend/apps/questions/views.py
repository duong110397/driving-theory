from django.db.models import Count, QuerySet
from rest_framework import viewsets
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination

from apps.exams.rules import EXAM_RULES

from .models import Chapter, Question
from .serializers import ChapterSerializer, QuestionSerializer
from .tips import tip_book_payload


class QuestionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChapterSerializer
    lookup_field = "number"
    pagination_class = None

    def get_queryset(self) -> QuerySet[Chapter]:
        # Meta.ordering is ignored in aggregate (GROUP BY) queries, so order explicitly.
        return Chapter.objects.annotate(question_count=Count("questions")).order_by("number")


class QuestionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Query params:
    - `chapter`: chapter number
    - `critical`: `true` / `false` (câu điểm liệt trong bộ 600 câu)
    - `license_class`: chỉ lấy các câu thuộc bộ đề của hạng đó (A1/A: 250 câu, B1: 300 câu)
    """

    serializer_class = QuestionSerializer
    pagination_class = QuestionPagination
    lookup_field = "number"

    def get_queryset(self) -> QuerySet[Question]:
        qs = Question.objects.select_related("chapter").prefetch_related("options")
        params = self.request.query_params

        if (chapter := params.get("chapter")) is not None:
            if not chapter.isdigit():
                raise ValidationError({"chapter": "Phải là số nguyên dương."})
            qs = qs.filter(chapter__number=int(chapter))

        if (critical := params.get("critical")) is not None:
            if critical not in {"true", "false"}:
                raise ValidationError({"critical": "Chỉ nhận 'true' hoặc 'false'."})
            qs = qs.filter(is_critical=critical == "true")

        if (license_class := params.get("license_class")) is not None:
            rule = EXAM_RULES.get(license_class)
            if rule is None:
                raise ValidationError({"license_class": "Hạng giấy phép lái xe không hợp lệ."})
            qs = qs.filter(rule.question_set.pool())

        return qs


class TipsView(APIView):
    """Study tips per chapter, plus popular tips that don't hold for the 2025 bank."""

    def get(self, request: Request) -> Response:
        return Response(tip_book_payload())
