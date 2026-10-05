import json
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Chapter, Option, Question

# 1x1 transparent PNG
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
)


def _question(number: int, chapter: int = 1, *, critical: bool = False, image: str | None = None) -> dict:
    item = {
        "questionNumber": number,
        "chapterId": chapter,
        "chapterName": f"Chương {chapter}",
        "content": f"Câu hỏi {number}?",
        "options": [
            {"id": 1, "text": "Đáp án A.", "isCorrect": True},
            {"id": 2, "text": "Đáp án B.", "isCorrect": False},
        ],
        "isCritical": critical,
        "source": {"page": 1},
    }
    if image:
        item["image"] = {"src": image, "type": "sign"}
    return item


class ImportCommandTests(TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.source = self.tmp / "dataset"
        (self.source / "images").mkdir(parents=True)
        (self.source / "images" / "q-2.png").write_bytes(PNG_BYTES)
        media = override_settings(MEDIA_ROOT=self.tmp / "media")
        media.enable()
        self.addCleanup(media.disable)

    def _write(self, questions: list[dict]) -> None:
        (self.source / "questions.json").write_text(json.dumps(questions), encoding="utf-8")

    def _import(self, **options: bool) -> None:
        call_command("import_questions", source=self.source, stdout=open("/dev/null", "w"), **options)

    def test_imports_questions_options_and_images(self) -> None:
        self._write([_question(1), _question(2, chapter=2, critical=True, image="q-2.png")])
        self._import()

        self.assertEqual(Chapter.objects.count(), 2)
        self.assertEqual(Question.objects.count(), 2)
        q2 = Question.objects.get(number=2)
        self.assertTrue(q2.is_critical)
        self.assertEqual(q2.image.name, "questions/q-2.png")
        self.assertTrue((self.tmp / "media" / "questions" / "q-2.png").is_file())
        self.assertEqual(q2.options.get(is_correct=True).text, "Đáp án A.")

    def test_import_is_idempotent(self) -> None:
        self._write([_question(1), _question(2, image="q-2.png")])
        self._import()
        self._import()
        self.assertEqual(Question.objects.count(), 2)
        self.assertEqual(Option.objects.count(), 4)

    def test_if_empty_skips_when_questions_exist(self) -> None:
        self._write([_question(1)])
        self._import()
        self._write([_question(1), _question(2)])
        self._import(if_empty=True)
        self.assertEqual(Question.objects.count(), 1)

    def test_if_empty_imports_into_empty_database(self) -> None:
        self._write([_question(1)])
        self._import(if_empty=True)
        self.assertEqual(Question.objects.count(), 1)

    def test_invalid_dataset_is_rejected_without_writing(self) -> None:
        bad = _question(2)
        bad["options"][1]["isCorrect"] = True  # two correct answers
        self._write([_question(1), bad])
        with self.assertRaisesMessage(CommandError, "Question 2: expected exactly 1 correct option"):
            self._import()
        self.assertEqual(Question.objects.count(), 0)

    def test_missing_image_is_rejected(self) -> None:
        self._write([_question(1, image="missing.png")])
        with self.assertRaisesMessage(CommandError, "image file not found"):
            self._import()

    def test_image_path_traversal_is_rejected(self) -> None:
        self._write([_question(1, image="../questions.json")])
        with self.assertRaisesMessage(CommandError, "image file not found"):
            self._import()


class OptionConstraintTests(TestCase):
    def test_only_one_correct_option_per_question(self) -> None:
        chapter = Chapter.objects.create(number=1, name="C1")
        q = Question.objects.create(number=1, chapter=chapter, content="?")
        Option.objects.create(question=q, position=1, text="A", is_correct=True)
        with self.assertRaises(IntegrityError):
            Option.objects.create(question=q, position=2, text="B", is_correct=True)


class QuestionApiTests(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        # Created out of order on purpose: the API must still return chapters sorted by number.
        c2 = Chapter.objects.create(number=2, name="C2")
        c1 = Chapter.objects.create(number=1, name="C1")
        for number, chapter, critical in [(1, c1, False), (2, c1, True), (3, c2, False)]:
            q = Question.objects.create(number=number, chapter=chapter, content=f"Q{number}", is_critical=critical)
            Option.objects.create(question=q, position=1, text="A", is_correct=True)
            Option.objects.create(question=q, position=2, text="B")
        cls.user = get_user_model().objects.create_user(username="u", password="S3cure-pass-for-tests")

    def setUp(self) -> None:
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_requires_authentication(self) -> None:
        self.assertEqual(APIClient().get("/api/questions/").status_code, 401)

    def test_list_questions_paginated_with_options(self) -> None:
        data = self.client.get("/api/questions/").json()
        self.assertEqual(data["count"], 3)
        first = data["results"][0]
        self.assertEqual(first["number"], 1)
        self.assertEqual(first["chapter"], 1)
        self.assertIsNone(first["image"])
        self.assertEqual([o["position"] for o in first["options"]], [1, 2])

    def test_filter_by_chapter_and_critical(self) -> None:
        self.assertEqual(self.client.get("/api/questions/?chapter=2").json()["count"], 1)
        self.assertEqual(self.client.get("/api/questions/?critical=true").json()["count"], 1)
        self.assertEqual(self.client.get("/api/questions/?chapter=1&critical=false").json()["count"], 1)

    def test_filter_by_license_class(self) -> None:
        Question.objects.filter(number=1).update(in_set_a=True)
        self.assertEqual(self.client.get("/api/questions/?license_class=A1").json()["count"], 1)
        self.assertEqual(self.client.get("/api/questions/?license_class=B").json()["count"], 3)
        self.assertEqual(self.client.get("/api/questions/?license_class=Z").status_code, 400)

    def test_invalid_filters_return_400(self) -> None:
        self.assertEqual(self.client.get("/api/questions/?chapter=abc").status_code, 400)
        self.assertEqual(self.client.get("/api/questions/?critical=yes").status_code, 400)

    def test_retrieve_by_number(self) -> None:
        self.assertEqual(self.client.get("/api/questions/3/").json()["content"], "Q3")
        self.assertEqual(self.client.get("/api/questions/999/").status_code, 404)

    def test_chapters_with_counts(self) -> None:
        data = self.client.get("/api/chapters/").json()
        self.assertEqual([(c["number"], c["question_count"]) for c in data], [(1, 2), (2, 1)])
