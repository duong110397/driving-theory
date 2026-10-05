from rest_framework import authentication
from rest_framework.request import Request


class SessionAuthentication(authentication.SessionAuthentication):
    """Session auth that answers unauthenticated requests with 401 instead of 403.

    DRF returns 401 only when the auth class provides a WWW-Authenticate value; this lets
    the SPA tell "not logged in / session expired" (401) apart from "forbidden" (403).
    """

    def authenticate_header(self, request: Request) -> str:
        return "Session"
