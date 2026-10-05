from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.exams.models import ExamAttempt

User = get_user_model()


def _attempt(user, *, passed: bool | None, days_ago: int = 0) -> ExamAttempt:
    started = timezone.now() - timedelta(days=days_ago)
    return ExamAttempt.objects.create(
        user=user,
        license_class="B",
        total_questions=30,
        pass_score=27,
        duration_seconds=1200,
        started_at=started,
        expires_at=started + timedelta(minutes=20),
        status=ExamAttempt.Status.SUBMITTED if passed is not None else ExamAttempt.Status.IN_PROGRESS,
        passed=passed,
    )


class AdminApiTests(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.admin = User.objects.create_user(username="admin", email="admin@example.com", password="x" * 12, is_staff=True)
        cls.alice = User.objects.create_user(username="alice", email="alice@example.com", password="x" * 12)
        cls.bob = User.objects.create_user(username="bob", email="bob@sabi.example", password="x" * 12)
        User.objects.filter(pk=cls.bob.pk).update(date_joined=timezone.now() - timedelta(days=30))
        User.objects.filter(pk=cls.alice.pk).update(last_login=timezone.now())
        _attempt(cls.alice, passed=True)
        _attempt(cls.alice, passed=False, days_ago=1)
        _attempt(cls.alice, passed=None)  # still in progress
        _attempt(cls.bob, passed=True, days_ago=20)

    def setUp(self) -> None:
        self.client = APIClient()

    def _as(self, user) -> APIClient:
        self.client.force_authenticate(user)
        return self.client

    def _list(self, **params):
        return self._as(self.admin).get(reverse("admin-user-list"), params)

    # --- permissions ---

    def test_anonymous_gets_401(self) -> None:
        self.assertEqual(self.client.get(reverse("admin-user-list")).status_code, 401)
        self.assertEqual(self.client.get(reverse("admin-stats")).status_code, 401)

    def test_regular_user_gets_403(self) -> None:
        client = self._as(self.alice)
        self.assertEqual(client.get(reverse("admin-user-list")).status_code, 403)
        self.assertEqual(client.get(reverse("admin-user-detail", args=[self.bob.pk])).status_code, 403)
        self.assertEqual(client.get(reverse("admin-stats")).status_code, 403)

    def test_api_is_read_only(self) -> None:
        client = self._as(self.admin)
        detail = reverse("admin-user-detail", args=[self.alice.pk])
        self.assertEqual(client.delete(detail).status_code, 405)
        self.assertEqual(client.patch(detail, {"is_staff": True}, format="json").status_code, 405)
        self.assertEqual(client.post(reverse("admin-user-list"), {}, format="json").status_code, 405)

    # --- list ---

    def test_list_returns_counts_and_no_password(self) -> None:
        response = self._list()
        self.assertEqual(response.status_code, 200)
        rows = {u["username"]: u for u in response.json()["results"]}
        self.assertEqual(set(rows), {"admin", "alice", "bob"})
        self.assertEqual((rows["alice"]["exam_count"], rows["alice"]["passed_count"]), (3, 1))
        self.assertNotIn("password", rows["alice"])

    def test_default_ordering_is_newest_first(self) -> None:
        usernames = [u["username"] for u in self._list().json()["results"]]
        self.assertEqual(usernames[-1], "bob")

    def test_ordering_by_exam_count_and_last_login_nulls_last(self) -> None:
        self.assertEqual(self._list(ordering="-exam_count").json()["results"][0]["username"], "alice")
        by_login = [u["username"] for u in self._list(ordering="-last_login").json()["results"]]
        self.assertEqual(by_login[0], "alice")

    def test_search_by_username_or_email(self) -> None:
        self.assertEqual([u["username"] for u in self._list(search="ALI").json()["results"]], ["alice"])
        self.assertEqual([u["username"] for u in self._list(search="sabi").json()["results"]], ["bob"])

    def test_filter_by_role(self) -> None:
        self.assertEqual([u["username"] for u in self._list(role="staff").json()["results"]], ["admin"])

    def test_invalid_params_return_400(self) -> None:
        self.assertEqual(self._list(ordering="password").status_code, 400)
        self.assertEqual(self._list(role="root").status_code, 400)
        self.assertEqual(self._list(search="x" * 101).status_code, 400)

    # --- detail & stats ---

    def test_detail_includes_recent_exams(self) -> None:
        response = self._as(self.admin).get(reverse("admin-user-detail", args=[self.alice.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["recent_exams"]), 3)

    def test_stats(self) -> None:
        data = self._as(self.admin).get(reverse("admin-stats")).json()
        self.assertEqual(data["users"], {"total": 3, "staff": 1, "new_7d": 2, "active_7d": 1})
        self.assertEqual(data["exams"], {"total": 4, "submitted": 3, "passed": 2, "last_7d": 3})


class SetStaffCommandTests(TestCase):
    def test_grant_and_revoke(self) -> None:
        user = User.objects.create_user(username="carol", password="x" * 12)
        call_command("set_staff", "CAROL", stdout=StringIO())
        user.refresh_from_db()
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)  # only staff, never superuser

        call_command("set_staff", "carol", "--revoke", stdout=StringIO())
        user.refresh_from_db()
        self.assertFalse(user.is_staff)

    def test_unknown_user_fails(self) -> None:
        with self.assertRaises(CommandError):
            call_command("set_staff", "nobody")
