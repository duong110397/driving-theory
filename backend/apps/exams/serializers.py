from django.utils import timezone
from rest_framework import serializers

from .models import ExamAttempt, ExamItem
from .rules import EXAM_RULES, LicenseClass


class ExamRuleSerializer(serializers.Serializer):
    license_class = serializers.CharField()
    total_questions = serializers.IntegerField()
    duration_minutes = serializers.IntegerField()
    pass_score = serializers.IntegerField()
    sections = serializers.ListField(child=serializers.DictField())

    @staticmethod
    def all_rules() -> list[dict]:
        return [
            {
                "license_class": cls,
                "total_questions": rule.total_questions,
                "duration_minutes": rule.duration_minutes,
                "pass_score": rule.pass_score,
                "sections": [{"label": s.label, "count": s.count} for s in rule.sections],
            }
            for cls, rule in EXAM_RULES.items()
        ]


class ExamCreateSerializer(serializers.Serializer):
    license_class = serializers.ChoiceField(choices=LicenseClass.choices)


class AnswerSerializer(serializers.Serializer):
    question = serializers.IntegerField(min_value=1, help_text="Số thứ tự câu hỏi (1-600).")
    position = serializers.IntegerField(min_value=1, allow_null=True, help_text="Vị trí đáp án; null = bỏ chọn.")


class SubmitSerializer(serializers.Serializer):
    answers = AnswerSerializer(many=True, required=False, default=list)

    def validate_answers(self, value: list[dict]) -> list[dict]:
        numbers = [a["question"] for a in value]
        if len(numbers) != len(set(numbers)):
            raise serializers.ValidationError("Mỗi câu hỏi chỉ được gửi một đáp án.")
        return value

    def as_dict(self) -> dict[int, int | None]:
        return {a["question"]: a["position"] for a in self.validated_data["answers"]}


class ExamItemSerializer(serializers.ModelSerializer):
    """Question as shown during the exam: no hint about correctness or criticality."""

    number = serializers.IntegerField(source="question.number")
    content = serializers.CharField(source="question.content")
    image = serializers.SerializerMethodField()
    image_type = serializers.CharField(source="question.image_type")
    options = serializers.SerializerMethodField()

    class Meta:
        model = ExamItem
        fields = ["order", "number", "content", "image", "image_type", "options", "selected_position"]

    def get_image(self, item: ExamItem) -> str | None:
        return item.question.image.url if item.question.image else None

    def get_options(self, item: ExamItem) -> list[dict]:
        return [{"position": o.position, "text": o.text} for o in item.question.options.all()]


class ExamItemResultSerializer(ExamItemSerializer):
    correct_position = serializers.SerializerMethodField()

    class Meta(ExamItemSerializer.Meta):
        fields = [*ExamItemSerializer.Meta.fields, "correct_position", "is_correct", "is_critical"]

    def get_correct_position(self, item: ExamItem) -> int:
        return next(o.position for o in item.question.options.all() if o.is_correct)


class ExamAttemptSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamAttempt
        fields = [
            "id", "license_class", "status", "total_questions", "pass_score", "duration_seconds",
            "started_at", "expires_at", "submitted_at", "score", "failed_critical", "passed",
        ]
        read_only_fields = fields


class ExamAttemptSerializer(ExamAttemptSummarySerializer):
    items = serializers.SerializerMethodField()
    # Lets the client run its countdown from server time, independent of its own clock.
    remaining_seconds = serializers.SerializerMethodField()

    class Meta(ExamAttemptSummarySerializer.Meta):
        fields = [*ExamAttemptSummarySerializer.Meta.fields, "remaining_seconds", "items"]
        read_only_fields = fields

    def get_remaining_seconds(self, attempt: ExamAttempt) -> int:
        if attempt.status != ExamAttempt.Status.IN_PROGRESS:
            return 0
        return max(0, int((attempt.expires_at - timezone.now()).total_seconds()))

    def get_items(self, attempt: ExamAttempt) -> list[dict]:
        # Answers are revealed only after the attempt is graded.
        serializer_class = (
            ExamItemResultSerializer if attempt.status == ExamAttempt.Status.SUBMITTED else ExamItemSerializer
        )
        return serializer_class(attempt.items.all(), many=True).data
