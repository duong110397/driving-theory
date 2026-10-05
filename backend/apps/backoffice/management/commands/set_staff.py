from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError, CommandParser


class Command(BaseCommand):
    help = "Grant (or revoke with --revoke) access to the in-app admin page for an existing user."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username")
        parser.add_argument("--revoke", action="store_true", help="Remove staff access instead of granting it.")

    def handle(self, *args: Any, username: str, revoke: bool, **options: Any) -> None:
        User = get_user_model()
        try:
            user = User.objects.get(username__iexact=username)
        except User.DoesNotExist as exc:
            raise CommandError(f"User {username!r} does not exist.") from exc

        user.is_staff = not revoke
        user.save(update_fields=["is_staff"])
        action = "revoked from" if revoke else "granted to"
        self.stdout.write(self.style.SUCCESS(f"Staff access {action} {user.username}."))
