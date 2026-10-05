from rest_framework import serializers

from .models import Chapter, Option, Question


class ChapterSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Chapter
        fields = ["number", "name", "question_count"]


class OptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Option
        fields = ["position", "text", "is_correct"]


class QuestionSerializer(serializers.ModelSerializer):
    chapter = serializers.IntegerField(source="chapter.number", read_only=True)
    # Relative URL so it resolves through the frontend's /media proxy.
    image = serializers.SerializerMethodField()
    options = OptionSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ["number", "chapter", "content", "image", "image_type", "is_critical", "options"]

    def get_image(self, obj: Question) -> str | None:
        return obj.image.url if obj.image else None
