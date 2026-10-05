import json
import unicodedata
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Chapter, Option, Question
from .tips import heuristic_stats, load_tip_book, parse_tip_book

DATASET = Path(settings.BASE_DIR) / "data" / "gplx600" / "questions.json"


def _normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text).casefold().split())


class TipContentTests(SimpleTestCase):
    """Every question a tip cites must exist and its correct answer must match the tip's claim."""

    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        with DATASET.open(encoding="utf-8") as f:
            cls.dataset = {q["questionNumber"]: q for q in json.load(f)}
        cls.book = load_tip_book()

    def _assert_claims(self, owner: str, questions) -> None:
        for claim in questions:
            with self.subTest(item=owner, question=claim.number):
                question = self.dataset.get(claim.number)
                self.assertIsNotNone(question, f"{owner}: question {claim.number} does not exist")
                correct = next(o["text"] for o in question["options"] if o["isCorrect"])
                self.assertIn(
                    _normalize(claim.answer),
                    _normalize(correct),
                    f"{owner}: Q{claim.number} correct answer is {correct!r}",
                )
                if _normalize(claim.answer) == _normalize(correct):
                    continue  # the whole answer, quoted verbatim, is unambiguous by definition
                # A partial fragment must single out the correct option, not also match a wrong one.
                wrong_matches = [
                    o["text"]
                    for o in question["options"]
                    if not o["isCorrect"] and _normalize(claim.answer) in _normalize(o["text"])
                ]
                self.assertEqual(wrong_matches, [], f"{owner}: Q{claim.number} answer fragment is ambiguous")

    def test_tip_answers_match_dataset(self) -> None:
        for tip in self.book.tips:
            self._assert_claims(tip.id, tip.questions)

    def test_myth_answers_match_dataset(self) -> None:
        for myth in self.book.myths:
            self._assert_claims(myth.id, myth.questions)

    def test_tip_questions_belong_to_tip_chapter(self) -> None:
        for tip in self.book.tips:
            for claim in tip.questions:
                with self.subTest(tip=tip.id, question=claim.number):
                    self.assertEqual(self.dataset[claim.number]["chapterId"], tip.chapter)

    def test_ids_are_unique(self) -> None:
        ids = [t.id for t in self.book.tips] + [m.id for m in self.book.myths]
        self.assertEqual(len(ids), len(set(ids)))

    def test_unknown_heuristic_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_tip_book({"tips": [], "myths": [{"id": "x", "claim": "c", "truth": "t", "heuristic": "nope"}]})


class HeuristicStatsTests(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        chapter = Chapter.objects.create(number=1, name="C1")

        def add(number: int, options: list[tuple[str, bool]]) -> None:
            q = Question.objects.create(number=number, chapter=chapter, content=f"Q{number}")
            for position, (text, correct) in enumerate(options, start=1):
                Option.objects.create(question=q, position=position, text=text, is_correct=correct)

        add(1, [("Ngắn.", False), ("Đáp án dài nhất ở đây.", True)])  # longest is right
        add(2, [("Đáp án dài nhưng sai.", False), ("Đúng.", True)])  # longest is wrong
        add(3, [("Bằng.", True), ("Nhau.", False)])  # tie: heuristic abstains
        add(4, [("Ý một.", False), ("Cả hai ý trên.", True)])
        add(5, [("Ý một.", True), ("Cả hai ý trên.", False)])

    def test_longest_option(self) -> None:
        stats = heuristic_stats("longest_option")
        self.assertEqual((stats.applicable, stats.correct), (4, 2))

    def test_all_of_the_above(self) -> None:
        stats = heuristic_stats("all_of_the_above")
        self.assertEqual((stats.applicable, stats.correct), (2, 1))


class TipsApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_requires_authentication(self) -> None:
        self.assertEqual(self.client.get(reverse("tips")).status_code, 401)

    def test_returns_tips_and_myths_without_answer_fragments(self) -> None:
        cited = load_tip_book().tips[0].questions[0].number
        chapter = Chapter.objects.create(number=9, name="C9")
        Question.objects.create(number=cited, chapter=chapter, content="?")
        user = get_user_model().objects.create_user(username="u", password="x" * 12)
        self.client.force_authenticate(user)
        response = self.client.get(reverse("tips"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreater(len(data["tips"]), 0)
        tip = data["tips"][0]
        self.assertEqual(set(tip), {"id", "chapter", "title", "points", "questions"})
        # Only questions present in the DB are linked, each with its chapter.
        self.assertEqual(tip["questions"], [{"number": cited, "chapter": 9}])
        heuristic_myth = next(m for m in data["myths"] if m["heuristic"])
        self.assertEqual(set(heuristic_myth["stats"]), {"applicable", "correct"})
