from typing import Any

from django.contrib.auth import get_user_model, password_validation
from django.contrib.auth.base_user import AbstractBaseUser
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()

USERNAME_TAKEN_MESSAGE = "Tên đăng nhập đã được sử dụng."
EMAIL_TAKEN_MESSAGE = "Email đã được sử dụng."


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    # Upper bound guards against hashing very large payloads (CPU DoS).
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class RegisterSerializer(serializers.Serializer):
    # Reuse the model field's validators (allowed characters: letters, digits and @.+-_).
    username = serializers.CharField(
        max_length=150,
        trim_whitespace=True,
        validators=User._meta.get_field("username").validators,
    )
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(USERNAME_TAKEN_MESSAGE)
        return value

    def validate_email(self, value: str) -> str:
        email = User.objects.normalize_email(value)
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(EMAIL_TAKEN_MESSAGE)
        return email

    def validate_password(self, value: str) -> str:
        try:
            password_validation.validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data: dict[str, Any]) -> AbstractBaseUser:
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "is_staff"]
        read_only_fields = fields
