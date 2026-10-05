"""Exam generation and grading. All answer checking happens server-side."""

import random
from datetime import timedelta

from django.contrib.auth.base_user import AbstractBaseUser
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from apps.questions.models import Option, Question

from .models import ExamAttempt, ExamItem
from .rules import EXAM_RULES

# Tolerance for network latency when the client auto-submits at the deadline.
SUBMIT_GRACE = timedelta(seconds=30)

_rng = random.SystemRandom()


class ExamError(Exception):
    """Business rule violation that should be reported to the client."""


class ExamClosedError(ExamError):
    pass


class ExamConfigurationError(RuntimeError):
    """The question bank cannot satisfy an exam rule (e.g. dataset not imported)."""


def create_attempt(user: AbstractBaseUser, license_class: str) -> ExamAttempt:
    rule = EXAM_RULES[license_class]
    question_set = rule.question_set
    base = Question.objects.filter(question_set.pool())

    picked: list[tuple[int, bool]] = []  # (question_id, is_critical)
    for section in rule.sections:
        if section.critical:
            qs = base.filter(question_set.critical())
        else:
            # Set-critical questions only appear in the dedicated critical slot.
            qs = base.filter(chapter__number__in=section.chapters).exclude(question_set.critical())
        ids = list(qs.values_list("id", flat=True))
        if len(ids) < section.count:
            raise ExamConfigurationError(
                f"{license_class}: section '{section.label}' needs {section.count} questions, only {len(ids)} available"
            )
        picked.extend((qid, section.critical) for qid in _rng.sample(ids, section.count))

    # Present in question-number order so the critical question's position gives nothing away.
    numbers = dict(Question.objects.filter(id__in=[qid for qid, _ in picked]).values_list("id", "number"))
    picked.sort(key=lambda p: numbers[p[0]])

    now = timezone.now()
    duration = timedelta(minutes=rule.duration_minutes)
    with transaction.atomic():
        attempt = ExamAttempt.objects.create(
            user=user,
            license_class=license_class,
            total_questions=rule.total_questions,
            pass_score=rule.pass_score,
            duration_seconds=int(duration.total_seconds()),
            started_at=now,
            expires_at=now + duration,
        )
        ExamItem.objects.bulk_create(
            ExamItem(attempt=attempt, order=i, question_id=qid, is_critical=critical)
            for i, (qid, critical) in enumerate(picked, start=1)
        )
    return attempt


def _accepts_answers(attempt: ExamAttempt) -> bool:
    return attempt.status == ExamAttempt.Status.IN_PROGRESS and timezone.now() <= attempt.expires_at + SUBMIT_GRACE


def _lock(attempt_id) -> ExamAttempt:
    return ExamAttempt.objects.select_for_update().get(pk=attempt_id)


def save_answers(attempt: ExamAttempt, answers: dict[int, int | None]) -> None:
    """Store answers keyed by question number. Raises ExamError on invalid input or closed exam."""
    with transaction.atomic():
        attempt = _lock(attempt.pk)
        if not _accepts_answers(attempt):
            raise ExamClosedError("Bài thi đã kết thúc, không thể lưu đáp án.")
        _apply_answers(attempt, answers)


def _apply_answers(attempt: ExamAttempt, answers: dict[int, int | None]) -> None:
    if not answers:
        return
    items = {
        item.question.number: item
        for item in attempt.items.select_related("question").filter(question__number__in=answers.keys())
    }
    unknown = sorted(set(answers) - set(items))
    if unknown:
        raise ExamError(f"Câu hỏi không thuộc đề thi: {unknown}")

    valid_positions: dict[int, set[int]] = {}
    for question_id, position in Option.objects.filter(
        question_id__in=[i.question_id for i in items.values()]
    ).values_list("question_id", "position"):
        valid_positions.setdefault(question_id, set()).add(position)

    for number, position in answers.items():
        item = items[number]
        if position is not None and position not in valid_positions.get(item.question_id, set()):
            raise ExamError(f"Đáp án {position} không hợp lệ cho câu {number}.")
        item.selected_position = position
    ExamItem.objects.bulk_update(items.values(), ["selected_position"])


def submit(attempt: ExamAttempt, answers: dict[int, int | None]) -> ExamAttempt:
    """Save final answers (if still within time) and grade. Late answers are ignored, as at a real exam."""
    with transaction.atomic():
        attempt = _lock(attempt.pk)
        if attempt.status != ExamAttempt.Status.IN_PROGRESS:
            raise ExamClosedError("Bài thi đã được nộp.")
        if _accepts_answers(attempt):
            _apply_answers(attempt, answers)
        _grade(attempt)
    return attempt


def finalize_if_expired(attempt: ExamAttempt) -> ExamAttempt:
    """Auto-grade an attempt whose time ran out (answers saved so far count, the rest are wrong)."""
    if attempt.status != ExamAttempt.Status.IN_PROGRESS or _accepts_answers(attempt):
        return attempt
    with transaction.atomic():
        locked = _lock(attempt.pk)
        if locked.status == ExamAttempt.Status.IN_PROGRESS:
            _grade(locked)
        return locked


def finalize_expired_for_user(user: AbstractBaseUser) -> None:
    deadline = timezone.now() - SUBMIT_GRACE
    for attempt in ExamAttempt.objects.filter(
        user=user, status=ExamAttempt.Status.IN_PROGRESS, expires_at__lt=deadline
    ):
        finalize_if_expired(attempt)


def _grade(attempt: ExamAttempt) -> None:
    items = list(
        attempt.items.select_related("question").prefetch_related(
            Prefetch("question__options", queryset=Option.objects.filter(is_correct=True), to_attr="correct_options")
        )
    )
    for item in items:
        correct = item.question.correct_options[0].position
        item.is_correct = item.selected_position == correct
    ExamItem.objects.bulk_update(items, ["is_correct"])

    attempt.score = sum(item.is_correct for item in items)
    attempt.failed_critical = any(item.is_critical and not item.is_correct for item in items)
    attempt.passed = not attempt.failed_critical and attempt.score >= attempt.pass_score
    attempt.status = ExamAttempt.Status.SUBMITTED
    attempt.submitted_at = timezone.now()
    attempt.save(update_fields=["score", "failed_critical", "passed", "status", "submitted_at"])
