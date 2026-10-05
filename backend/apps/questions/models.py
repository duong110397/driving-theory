from django.db import models
from django.db.models import Q


class Chapter(models.Model):
    number = models.PositiveSmallIntegerField(unique=True)
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["number"]

    def __str__(self) -> str:
        return f"Chương {self.number}. {self.name}"


class Question(models.Model):
    class ImageType(models.TextChoices):
        SIGN = "sign", "Biển báo"
        SCENARIO = "scenario", "Sa hình / tình huống"
        DIAGRAM = "diagram", "Hình minh hoạ"

    number = models.PositiveSmallIntegerField(unique=True, help_text="Số thứ tự trong bộ 600 câu.")
    chapter = models.ForeignKey(Chapter, on_delete=models.PROTECT, related_name="questions")
    content = models.TextField()
    image = models.ImageField(upload_to="questions/", blank=True)
    image_type = models.CharField(max_length=16, choices=ImageType.choices, blank=True)
    is_critical = models.BooleanField(default=False, db_index=True, help_text="Câu điểm liệt.")
    # Bộ câu hỏi riêng cho mô tô theo Công văn 2262/CSGT-P5 (Phụ lục I, II). Câu điểm liệt được
    # xác định theo từng bộ: trong đề A1/A, B1 chỉ các câu thuộc nhóm điểm liệt của bộ đó mới là điểm liệt.
    in_set_a = models.BooleanField(default=False, db_index=True, help_text="Thuộc bộ 250 câu hạng A1, A.")
    is_critical_a = models.BooleanField(default=False, help_text="Câu điểm liệt trong đề hạng A1, A.")
    in_set_b1 = models.BooleanField(default=False, db_index=True, help_text="Thuộc bộ 300 câu hạng B1.")
    is_critical_b1 = models.BooleanField(default=False, help_text="Câu điểm liệt trong đề hạng B1.")
    source_page = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["number"]

    def __str__(self) -> str:
        return f"Câu {self.number}"


class Option(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    position = models.PositiveSmallIntegerField()
    text = models.TextField()
    is_correct = models.BooleanField(default=False)

    class Meta:
        ordering = ["question", "position"]
        constraints = [
            models.UniqueConstraint(fields=["question", "position"], name="unique_option_position"),
            models.UniqueConstraint(
                fields=["question"],
                condition=Q(is_correct=True),
                name="one_correct_option_per_question",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.question} - {self.position}"
