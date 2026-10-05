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


class RegisterTests(TestCase):
    def setUp(self) -> None:
        cache.clear()
        get_user_model().objects.create_user(username="alice", email="alice@example.com", password=PASSWORD)
        self.client = APIClient(enforce_csrf_checks=True)

    def _register(self, **overrides: str):
        self.client.get(reverse("auth-csrf"))
        payload = {"username": "bob", "email": "bob@example.com", "password": PASSWORD, **overrides}
        return self.client.post(
            reverse("auth-register"),
            payload,
            format="json",
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )

    def test_register_creates_user_and_starts_session(self) -> None:
        response = self._register()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["username"], "bob")
        self.assertNotIn("password", response.json())
        user = get_user_model().objects.get(username="bob")
        self.assertTrue(user.check_password(PASSWORD))
        self.assertFalse(user.is_staff)
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 200)

    def test_register_requires_csrf_token(self) -> None:
        response = self.client.post(
            reverse("auth-register"),
            {"username": "bob", "email": "bob@example.com", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_duplicate_username_is_rejected_case_insensitively(self) -> None:
        response = self._register(username="ALICE")
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json())

    def test_duplicate_email_is_rejected_case_insensitively(self) -> None:
        response = self._register(email="Alice@Example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_invalid_email_is_rejected(self) -> None:
        response = self._register(email="not-an-email")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_invalid_username_characters_are_rejected(self) -> None:
        response = self._register(username="bob smith!")
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json())

    def test_short_password_is_rejected(self) -> None:
        response = self._register(password="1234567")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertFalse(get_user_model().objects.filter(username="bob").exists())

    def test_any_password_of_eight_chars_is_accepted(self) -> None:
        # Only length is enforced: similarity to username, common or all-numeric passwords are allowed.
        for i, password in enumerate(["bob12345", "12345678", "password"]):
            with self.subTest(password=password):
                response = self._register(username=f"bob{i}", email=f"bob{i}@example.com", password=password)
                self.assertEqual(response.status_code, 201)
                self.client.post(reverse("auth-logout"), HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)

    def test_cannot_escalate_privileges(self) -> None:
        response = self._register(is_staff="true", is_superuser="true")
        self.assertEqual(response.status_code, 201)
        user = get_user_model().objects.get(username="bob")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_registered_user_can_login(self) -> None:
        self._register()
        self.client.post(reverse("auth-logout"), HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value)
        self.client.get(reverse("auth-csrf"))
        response = self.client.post(
            reverse("auth-login"),
            {"username": "bob", "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=self.client.cookies["csrftoken"].value,
        )
        self.assertEqual(response.status_code, 200)
