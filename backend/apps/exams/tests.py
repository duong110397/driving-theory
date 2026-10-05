import shutil
import tempfile
from collections import Counter
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.questions.models import Option, Question

from .models import ExamAttempt
from .rules import EXAM_RULES, LicenseClass
from .services import SUBMIT_GRACE

_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=_MEDIA)
class ExamApiTests(TestCase):
    """Runs against the real 600-question dataset so exam rules are checked against actual data."""

    @classmethod
    def setUpTestData(cls) -> None:
        call_command("import_questions", stdout=StringIO())
        cls.correct = dict(Option.objects.filter(is_correct=True).values_list("question__number", "position"))
        cls.option_counts = Counter(Option.objects.values_list("question__number", flat=True))
        cls.user = get_user_model().objects.create_user(username="u", password="S3cure-pass-for-tests")
        cls.other = get_user_model().objects.create_user(username="o", password="S3cure-pass-for-tests")

    @classmethod
    def tearDownClass(cls) -> None:
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def setUp(self) -> None:
        cache.clear()  # reset throttle counters
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _create(self, license_class: str = "B") -> dict:
        response = self.client.post("/api/exams/", {"license_class": license_class}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def _wrong(self, number: int) -> int:
        return next(p for p in range(1, self.option_counts[number] + 1) if p != self.correct[number])

    def _submit(self, exam: dict, answers: dict[int, int]) -> dict:
        payload = {"answers": [{"question": n, "position": p} for n, p in answers.items()]}
        response = self.client.post(f"/api/exams/{exam['id']}/submit/", payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def _critical_number(self, exam: dict) -> int:
        return ExamAttempt.objects.get(pk=exam["id"]).items.get(is_critical=True).question.number

    # --- generation ---------------------------------------------------------------------------

    def test_every_license_class_generates_a_valid_exam(self) -> None:
        for license_class in LicenseClass.values:
            with self.subTest(license_class=license_class):
                rule = EXAM_RULES[license_class]
                exam = self._create(license_class)
                self.assertEqual(len(exam["items"]), rule.total_questions)
                self.assertEqual(exam["duration_seconds"], rule.duration_minutes * 60)
                self.assertEqual(exam["pass_score"], rule.pass_score)
                self.assertAlmostEqual(exam["remaining_seconds"], rule.duration_minutes * 60, delta=2)

                attempt = ExamAttempt.objects.get(pk=exam["id"])
                items = list(attempt.items.select_related("question__chapter"))
                questions = [i.question for i in items]
                qs = rule.question_set
                self.assertEqual(len({q.number for q in questions}), rule.total_questions)
                if qs.membership_field:
                    self.assertTrue(all(getattr(q, qs.membership_field) for q in questions))

                critical = [i for i in items if i.is_critical]
                self.assertEqual(len(critical), 1)
                self.assertTrue(getattr(critical[0].question, qs.critical_field))
                regular = [i.question for i in items if not i.is_critical]
                self.assertFalse(any(getattr(q, qs.critical_field) for q in regular))

                per_chapter = Counter(q.chapter.number for q in regular)
                for section in rule.sections:
                    if not section.critical:
                        self.assertEqual(sum(per_chapter[c] for c in section.chapters), section.count, section.label)

    def test_motorcycle_exam_uses_only_the_250_question_set(self) -> None:
        exam = self._create("A1")
        numbers = {i["number"] for i in exam["items"]}
        self.assertTrue(numbers <= set(Question.objects.filter(in_set_a=True).values_list("number", flat=True)))

    def test_questions_are_ordered_by_number(self) -> None:
        numbers = [i["number"] for i in self._create("C")["items"]]
        self.assertEqual(numbers, sorted(numbers))

    def test_in_progress_exam_hides_answers(self) -> None:
        exam = self._create()
        for payload in (exam, self.client.get(f"/api/exams/{exam['id']}/").json()):
            item = payload["items"][0]
            self.assertNotIn("correct_position", item)
            self.assertNotIn("is_correct", item)
            self.assertNotIn("is_critical", item)
            self.assertNotIn("is_correct", item["options"][0])

    def test_invalid_license_class(self) -> None:
        response = self.client.post("/api/exams/", {"license_class": "Z"}, format="json")
        self.assertEqual(response.status_code, 400)

    # --- grading ------------------------------------------------------------------------------

    def test_all_correct_passes(self) -> None:
        exam = self._create("B")
        result = self._submit(exam, {i["number"]: self.correct[i["number"]] for i in exam["items"]})
        self.assertEqual((result["status"], result["score"], result["passed"]), ("submitted", 30, True))
        self.assertFalse(result["failed_critical"])
        self.assertIn("correct_position", result["items"][0])

    def test_score_below_threshold_fails(self) -> None:
        exam = self._create("B")  # pass score 27/30
        critical = self._critical_number(exam)
        regular = [i["number"] for i in exam["items"] if i["number"] != critical]
        answers = {n: self.correct[n] for n in [i["number"] for i in exam["items"]]}
        for n in regular[:3]:
            answers[n] = self._wrong(n)
        self.assertEqual(self._submit(exam, answers)["passed"], True)  # 27/30

        exam = self._create("B")
        critical = self._critical_number(exam)
        answers = {i["number"]: self.correct[i["number"]] for i in exam["items"]}
        for n in [n for n in answers if n != critical][:4]:
            answers[n] = self._wrong(n)
        result = self._submit(exam, answers)  # 26/30
        self.assertEqual((result["score"], result["passed"]), (26, False))

    def test_wrong_critical_answer_fails_regardless_of_score(self) -> None:
        exam = self._create("B")
        critical = self._critical_number(exam)
        answers = {i["number"]: self.correct[i["number"]] for i in exam["items"]}
        answers[critical] = self._wrong(critical)
        result = self._submit(exam, answers)
        self.assertEqual((result["score"], result["failed_critical"], result["passed"]), (29, True, False))

    def test_unanswered_questions_count_as_wrong(self) -> None:
        result = self._submit(self._create("A1"), {})
        self.assertEqual((result["score"], result["passed"]), (0, False))

    def test_autosaved_answers_are_graded(self) -> None:
        exam = self._create("B")
        for item in exam["items"]:
            response = self.client.put(
                f"/api/exams/{exam['id']}/answers/",
                {"question": item["number"], "position": self.correct[item["number"]]},
                format="json",
            )
            self.assertEqual(response.status_code, 204)
        detail = self.client.get(f"/api/exams/{exam['id']}/").json()
        self.assertEqual(detail["items"][0]["selected_position"], self.correct[detail["items"][0]["number"]])
        self.assertEqual(self._submit(exam, {})["score"], 30)

    # --- validation & lifecycle ---------------------------------------------------------------

    def test_rejects_question_not_in_exam_and_invalid_position(self) -> None:
        exam = self._create("B")
        in_exam = {i["number"] for i in exam["items"]}
        outside = next(n for n in range(1, 601) if n not in in_exam)
        url = f"/api/exams/{exam['id']}/answers/"
        self.assertEqual(self.client.put(url, {"question": outside, "position": 1}, format="json").status_code, 400)
        number = exam["items"][0]["number"]
        self.assertEqual(self.client.put(url, {"question": number, "position": 9}, format="json").status_code, 400)

    def test_submit_twice_conflicts(self) -> None:
        exam = self._create()
        self._submit(exam, {})
        response = self.client.post(f"/api/exams/{exam['id']}/submit/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_expired_exam_rejects_answers_and_is_auto_graded(self) -> None:
        exam = self._create("B")
        first = exam["items"][0]["number"]
        self.client.put(
            f"/api/exams/{exam['id']}/answers/", {"question": first, "position": self.correct[first]}, format="json"
        )
        ExamAttempt.objects.filter(pk=exam["id"]).update(expires_at=timezone.now() - SUBMIT_GRACE - timedelta(seconds=1))

        late = self.client.put(
            f"/api/exams/{exam['id']}/answers/", {"question": first, "position": 1}, format="json"
        )
        self.assertEqual(late.status_code, 409)
        detail = self.client.get(f"/api/exams/{exam['id']}/").json()
        self.assertEqual((detail["status"], detail["score"], detail["passed"]), ("submitted", 1, False))

    def test_late_submit_ignores_answers(self) -> None:
        exam = self._create("B")
        ExamAttempt.objects.filter(pk=exam["id"]).update(expires_at=timezone.now() - SUBMIT_GRACE - timedelta(seconds=1))
        result = self._submit(exam, {i["number"]: self.correct[i["number"]] for i in exam["items"]})
        self.assertEqual(result["score"], 0)

    def test_list_returns_own_history_and_finalizes_expired(self) -> None:
        exam = self._create("B")
        ExamAttempt.objects.filter(pk=exam["id"]).update(expires_at=timezone.now() - SUBMIT_GRACE - timedelta(seconds=1))
        data = self.client.get("/api/exams/").json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["status"], "submitted")
        self.assertNotIn("items", data["results"][0])

    def test_other_users_cannot_access_attempt(self) -> None:
        exam = self._create()
        other = APIClient()
        other.force_authenticate(self.other)
        self.assertEqual(other.get(f"/api/exams/{exam['id']}/").status_code, 404)
        self.assertEqual(other.post(f"/api/exams/{exam['id']}/submit/", {}, format="json").status_code, 404)

    def test_exam_creation_is_throttled(self) -> None:
        statuses = [
            self.client.post("/api/exams/", {"license_class": "B"}, format="json").status_code for _ in range(31)
        ]
        self.assertEqual(statuses[-1], 429)

    def test_requires_authentication(self) -> None:
        self.assertEqual(APIClient().post("/api/exams/", {"license_class": "B"}, format="json").status_code, 401)

    def test_rules_endpoint(self) -> None:
        rules = {r["license_class"]: r for r in self.client.get("/api/exams/rules/").json()}
        self.assertEqual(len(rules), 15)
        self.assertEqual(
            [(rules[c]["total_questions"], rules[c]["duration_minutes"], rules[c]["pass_score"]) for c in ("A1", "A", "B1", "B", "C1", "C", "D")],
            [(25, 19, 21), (25, 19, 23), (25, 19, 23), (30, 20, 27), (35, 22, 32), (40, 24, 36), (45, 26, 41)],
        )
