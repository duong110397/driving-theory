from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

PASSWORD = "S3cure-pass-for-tests"


class AuthFlowTests(TestCase):
    def setUp(self) -> None:
        cache.clear()  # reset throttle counters between tests
        self.user = get_user_model().objects.create_user(username="alice", password=PASSWORD)
        self.client = APIClient(enforce_csrf_checks=True)

    def _csrf_token(self) -> str:
        self.client.get(reverse("auth-csrf"))
        return self.client.cookies["csrftoken"].value

    def _login(self, password: str = PASSWORD):
        return self.client.post(
            reverse("auth-login"),
            {"username": "alice", "password": password},
            format="json",
            HTTP_X_CSRFTOKEN=self._csrf_token(),
        )

    def test_csrf_endpoint_sets_cookie(self) -> None:
        response = self.client.get(reverse("auth-csrf"))
        self.assertEqual(response.status_code, 204)
        self.assertIn("csrftoken", response.cookies)

    def test_login_requires_csrf_token(self) -> None:
        response = self.client.post(
            reverse("auth-login"), {"username": "alice", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_login_success_returns_user_and_starts_session(self) -> None:
        response = self._login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "alice")
        self.assertNotIn("password", response.json())
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 200)

    def test_login_wrong_password_returns_generic_error(self) -> None:
        response = self._login(password="wrong")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Tên đăng nhập hoặc mật khẩu không đúng.")

    def test_inactive_user_cannot_login(self) -> None:
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self._login().status_code, 400)

    def test_me_requires_authentication(self) -> None:
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 401)

    def test_logout_ends_session(self) -> None:
        self._login()
        # CSRF token is rotated on login; read the new one.
        token = self.client.cookies["csrftoken"].value
        response = self.client.post(reverse("auth-logout"), HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 401)

    def test_logout_requires_csrf_token(self) -> None:
        self._login()
        self.assertEqual(self.client.post(reverse("auth-logout")).status_code, 403)

    def test_login_is_throttled(self) -> None:
        statuses = [self._login(password="wrong").status_code for _ in range(6)]
        self.assertEqual(statuses[-1], 429)
