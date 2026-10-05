import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.questions.models import Question

from .rules import LicenseClass


class ExamAttempt(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "Đang làm"
        SUBMITTED = "submitted", "Đã nộp"

    # UUID so attempt ids cannot be enumerated.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exam_attempts")
    license_class = models.CharField(max_length=4, choices=LicenseClass.choices)
    # Rule values are snapshotted so history stays correct if regulations change.
    total_questions = models.PositiveSmallIntegerField()
    pass_score = models.PositiveSmallIntegerField()
    duration_seconds = models.PositiveIntegerField()
    started_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_PROGRESS)
    submitted_at = models.DateTimeField(null=True, blank=True)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    failed_critical = models.BooleanField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [models.Index(fields=["user", "-started_at"])]

    def __str__(self) -> str:
        return f"{self.user} - {self.license_class} - {self.started_at:%Y-%m-%d %H:%M}"


class ExamItem(models.Model):
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="items")
    order = models.PositiveSmallIntegerField()
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="+")
    is_critical = models.BooleanField(default=False)
    # Option position (not FK): options are recreated when the dataset is re-imported.
    selected_position = models.PositiveSmallIntegerField(null=True, blank=True)
    is_correct = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ["attempt", "order"]
        constraints = [
            models.UniqueConstraint(fields=["attempt", "order"], name="unique_exam_item_order"),
            models.UniqueConstraint(fields=["attempt", "question"], name="unique_exam_item_question"),
        ]
