from django.contrib.auth import get_user_model
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    # Upper bound guards against hashing very large payloads (CPU DoS).
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ["id", "username", "email", "first_name", "last_name", "is_staff"]
        read_only_fields = fields
