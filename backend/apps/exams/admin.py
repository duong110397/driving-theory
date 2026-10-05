from django.contrib import admin

from .models import ExamAttempt, ExamItem


class ExamItemInline(admin.TabularInline):
    model = ExamItem
    extra = 0
    can_delete = False
    readonly_fields = ["order", "question", "is_critical", "selected_position", "is_correct"]

    def has_add_permission(self, request, obj=None) -> bool:
        return False


@admin.register(ExamAttempt)
class ExamAttemptAdmin(admin.ModelAdmin):
    list_display = ["started_at", "user", "license_class", "status", "score", "passed"]
    list_filter = ["license_class", "status", "passed"]
    search_fields = ["user__username"]
    list_select_related = ["user"]
    inlines = [ExamItemInline]

    def has_change_permission(self, request, obj=None) -> bool:
        return False
