"""Import the 600-question dataset (questions.json + images) into the DB.

Idempotent: questions are upserted by `number`, options are replaced, images are only
written when missing (or with --overwrite-images).
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from apps.questions.models import Chapter, Option, Question

DEFAULT_SOURCE = Path(settings.BASE_DIR) / "data" / "gplx600"
IMAGE_UPLOAD_DIR = "questions"
VALID_IMAGE_TYPES = {choice.value for choice in Question.ImageType}


@dataclass(frozen=True)
class OptionData:
    position: int
    text: str
    is_correct: bool


@dataclass(frozen=True)
class QuestionData:
    number: int
    chapter_number: int
    chapter_name: str
    content: str
    is_critical: bool
    in_set_a: bool
    is_critical_a: bool
    in_set_b1: bool
    is_critical_b1: bool
    source_page: int | None
    image_src: str | None
    image_type: str
    options: tuple[OptionData, ...]


def _load_json(path: Path) -> Any:
    try:
        with path.open(encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise CommandError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CommandError(f"Invalid JSON in {path}: {exc}") from exc


def _parse_question(item: dict[str, Any], images_dir: Path) -> tuple[QuestionData | None, list[str]]:
    """Validate one raw record. Returns (data, errors); data is None when errors exist."""
    number = item.get("questionNumber")
    prefix = f"Question {number!r}"
    errors: list[str] = []

    if not isinstance(number, int) or number < 1:
        return None, [f"{prefix}: invalid questionNumber"]

    content = str(item.get("content") or "").strip()
    if not content:
        errors.append(f"{prefix}: empty content")

    raw_options = item.get("options") or []
    options = tuple(
        OptionData(position=int(o["id"]), text=str(o["text"]).strip(), is_correct=bool(o["isCorrect"]))
        for o in raw_options
    )
    if len(options) < 2:
        errors.append(f"{prefix}: expected at least 2 options, got {len(options)}")
    if sum(o.is_correct for o in options) != 1:
        errors.append(f"{prefix}: expected exactly 1 correct option")
    if len({o.position for o in options}) != len(options):
        errors.append(f"{prefix}: duplicate option ids")
    if any(not o.text for o in options):
        errors.append(f"{prefix}: empty option text")

    in_set_a, is_critical_a = bool(item.get("inSetA")), bool(item.get("isCriticalA"))
    in_set_b1, is_critical_b1 = bool(item.get("inSetB1")), bool(item.get("isCriticalB1"))
    if (is_critical_a and not in_set_a) or (is_critical_b1 and not in_set_b1):
        errors.append(f"{prefix}: critical in a motorcycle set it does not belong to")
    if (is_critical_a or is_critical_b1) and not item.get("isCritical"):
        errors.append(f"{prefix}: set-critical question must be one of the 60 critical questions")

    image = item.get("image") or {}
    image_src = image.get("src")
    image_type = image.get("type", "") if image_src else ""
    if image_src:
        # Reject path traversal; images must be plain file names inside images_dir.
        if Path(image_src).name != image_src or not (images_dir / image_src).is_file():
            errors.append(f"{prefix}: image file not found: {image_src}")
        if image_type not in VALID_IMAGE_TYPES:
            errors.append(f"{prefix}: unknown image type {image_type!r}")

    if errors:
        return None, errors

    return (
        QuestionData(
            number=number,
            chapter_number=int(item["chapterId"]),
            chapter_name=str(item["chapterName"]).strip(),
            content=content,
            is_critical=bool(item.get("isCritical", False)),
            in_set_a=in_set_a,
            is_critical_a=is_critical_a,
            in_set_b1=in_set_b1,
            is_critical_b1=is_critical_b1,
            source_page=(item.get("source") or {}).get("page"),
            image_src=image_src,
            image_type=image_type,
            options=options,
        ),
        [],
    )


class Command(BaseCommand):
    help = "Import the GPLX 600-question dataset (questions, options, images)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--source",
            type=Path,
            default=DEFAULT_SOURCE,
            help=f"Dataset directory (default: {DEFAULT_SOURCE})",
        )
        parser.add_argument(
            "--overwrite-images",
            action="store_true",
            help="Re-upload images even if they already exist in storage.",
        )

    def handle(self, *args: Any, source: Path, overwrite_images: bool, **options: Any) -> None:
        images_dir = source / "images"
        raw = _load_json(source / "questions.json")
        if not isinstance(raw, list):
            raise CommandError("questions.json must contain a JSON array")

        parsed: list[QuestionData] = []
        errors: list[str] = []
        for item in raw:
            data, item_errors = _parse_question(item, images_dir)
            errors.extend(item_errors)
            if data:
                parsed.append(data)

        numbers = [q.number for q in parsed]
        if len(numbers) != len(set(numbers)):
            errors.append("Duplicate questionNumber values in dataset")
        if errors:
            raise CommandError("Dataset validation failed:\n  " + "\n  ".join(errors))

        # Upload images first (storage is not transactional); DB changes are all-or-nothing.
        image_names = {q.number: self._store_image(images_dir, q.image_src, overwrite_images) for q in parsed}

        with transaction.atomic():
            chapters = self._upsert_chapters(parsed)
            created = updated = 0
            for q in parsed:
                question, was_created = Question.objects.update_or_create(
                    number=q.number,
                    defaults={
                        "chapter": chapters[q.chapter_number],
                        "content": q.content,
                        "image": image_names[q.number] or "",
                        "image_type": q.image_type,
                        "is_critical": q.is_critical,
                        "in_set_a": q.in_set_a,
                        "is_critical_a": q.is_critical_a,
                        "in_set_b1": q.in_set_b1,
                        "is_critical_b1": q.is_critical_b1,
                        "source_page": q.source_page,
                    },
                )
                question.options.all().delete()
                Option.objects.bulk_create(
                    Option(question=question, position=o.position, text=o.text, is_correct=o.is_correct)
                    for o in q.options
                )
                created += was_created
                updated += not was_created

        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {len(parsed)} questions ({created} created, {updated} updated) "
                f"in {len(chapters)} chapters, {sum(1 for n in image_names.values() if n)} with images."
            )
        )

    @staticmethod
    def _upsert_chapters(parsed: list[QuestionData]) -> dict[int, Chapter]:
        names = {q.chapter_number: q.chapter_name for q in parsed}
        return {
            number: Chapter.objects.update_or_create(number=number, defaults={"name": name})[0]
            for number, name in sorted(names.items())
        }

    @staticmethod
    def _store_image(images_dir: Path, src: str | None, overwrite: bool) -> str | None:
        if not src:
            return None
        name = f"{IMAGE_UPLOAD_DIR}/{src}"
        if default_storage.exists(name):
            if not overwrite:
                return name
            default_storage.delete(name)
        with (images_dir / src).open("rb") as f:
            stored = default_storage.save(name, File(f))
        if stored != name:
            raise CommandError(f"Storage renamed {name} to {stored}; refusing to continue")
        return stored
