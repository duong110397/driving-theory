from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.exams.serializers import ExamAttemptSummarySerializer


class AdminUserSerializer(serializers.ModelSerializer):
    # Annotated by the view's queryset.
    exam_count = serializers.IntegerField(read_only=True)
    passed_count = serializers.IntegerField(read_only=True)
    last_exam_at = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = get_user_model()
        fields = [
            "id",
            "username",
            "email",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
            "exam_count",
            "passed_count",
            "last_exam_at",
        ]
        read_only_fields = fields


class AdminUserDetailSerializer(AdminUserSerializer):
    recent_exams = serializers.SerializerMethodField()

    class Meta(AdminUserSerializer.Meta):
        fields = [*AdminUserSerializer.Meta.fields, "recent_exams"]
        read_only_fields = fields

    def get_recent_exams(self, user) -> list[dict]:
        attempts = user.exam_attempts.order_by("-started_at")[: self.context.get("recent_limit", 10)]
        return ExamAttemptSummarySerializer(attempts, many=True).data
