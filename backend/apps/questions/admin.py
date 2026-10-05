from django.contrib import admin

from .models import Chapter, Option, Question


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    list_display = ["number", "name"]


class OptionInline(admin.TabularInline):
    model = Option
    extra = 0


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ["number", "short_content", "chapter", "is_critical", "image_type"]
    list_filter = ["chapter", "is_critical", "image_type"]
    search_fields = ["content", "=number"]
    list_select_related = ["chapter"]
    inlines = [OptionInline]

    @admin.display(description="Nội dung")
    def short_content(self, obj: Question) -> str:
        return obj.content if len(obj.content) <= 80 else f"{obj.content[:80]}…"
