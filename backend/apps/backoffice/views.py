from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, F, Max, Q, QuerySet
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.exams.models import ExamAttempt

from .serializers import AdminUserDetailSerializer, AdminUserSerializer

User = get_user_model()

# Public sort keys -> ORM fields. Whitelisted so clients cannot order by arbitrary columns.
ORDERINGS = {
    "date_joined": "date_joined",
    "last_login": "last_login",
    "username": "username",
    "exam_count": "exam_count",
}
DEFAULT_ORDERING = "-date_joined"
SEARCH_MAX_LENGTH = 100


class AdminUserPagination(PageNumberPagination):
    page_size = 20


class AdminUserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Query params:
    - `search`: tìm theo username hoặc email (không phân biệt hoa thường)
    - `ordering`: `date_joined`, `last_login`, `username`, `exam_count`; thêm `-` để sắp giảm dần
    - `role`: `staff` (chỉ quản trị viên) hoặc `user` (chỉ người dùng thường)
    """

    permission_classes = [IsAdminUser]
    pagination_class = AdminUserPagination

    def get_serializer_class(self):
        return AdminUserDetailSerializer if self.action == "retrieve" else AdminUserSerializer

    def get_queryset(self) -> QuerySet:
        qs = User.objects.annotate(
            exam_count=Count("exam_attempts", distinct=True),
            passed_count=Count("exam_attempts", filter=Q(exam_attempts__passed=True), distinct=True),
            last_exam_at=Max("exam_attempts__started_at"),
        )
        if self.action != "list":
            return qs

        params = self.request.query_params
        if search := params.get("search", "").strip():
            if len(search) > SEARCH_MAX_LENGTH:
                raise ValidationError({"search": f"Tối đa {SEARCH_MAX_LENGTH} ký tự."})
            qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search))

        if (role := params.get("role")) is not None:
            if role not in {"staff", "user"}:
                raise ValidationError({"role": "Chỉ nhận 'staff' hoặc 'user'."})
            qs = qs.filter(is_staff=role == "staff")

        ordering = params.get("ordering", DEFAULT_ORDERING)
        field = ORDERINGS.get(ordering.removeprefix("-"))
        if field is None:
            raise ValidationError({"ordering": f"Chỉ nhận: {', '.join(ORDERINGS)} (thêm '-' để giảm dần)."})
        descending = ordering.startswith("-")
        # Users who never logged in (last_login NULL) stay last either way; `id` keeps pages stable.
        primary = F(field).desc(nulls_last=True) if descending else F(field).asc(nulls_last=True)
        return qs.order_by(primary, "-id" if descending else "id")

    def get_serializer_context(self) -> dict:
        return {**super().get_serializer_context(), "recent_limit": 10}


class AdminStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request: Request) -> Response:
        week_ago = timezone.now() - timedelta(days=7)
        users = User.objects.aggregate(
            total=Count("id"),
            staff=Count("id", filter=Q(is_staff=True)),
            new_7d=Count("id", filter=Q(date_joined__gte=week_ago)),
            active_7d=Count("id", filter=Q(last_login__gte=week_ago)),
        )
        exams = ExamAttempt.objects.aggregate(
            total=Count("id"),
            submitted=Count("id", filter=Q(status=ExamAttempt.Status.SUBMITTED)),
            passed=Count("id", filter=Q(passed=True)),
            last_7d=Count("id", filter=Q(started_at__gte=week_ago)),
        )
        return Response({"users": users, "exams": exams})
