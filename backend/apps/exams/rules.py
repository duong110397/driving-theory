"""Theory exam rules per license class.

Sources:
- Number of questions, time limit, pass score: Thông tư 12/2025/TT-BCA, Phụ lục II-VI
  (in force until the replacement circular takes effect; its draft schedules new rules from 01/03/2027).
- Exam structure and question pools: Công văn 2262/CSGT-P5 ngày 07/05/2025 (mục II, Phụ lục I-III).
"""

from dataclasses import dataclass
from enum import Enum

from django.db import models
from django.db.models import Q


class LicenseClass(models.TextChoices):
    A1 = "A1", "A1"
    A = "A", "A"
    B1 = "B1", "B1"
    B = "B", "B"
    C1 = "C1", "C1"
    C = "C", "C"
    D1 = "D1", "D1"
    D2 = "D2", "D2"
    D = "D", "D"
    BE = "BE", "BE"
    C1E = "C1E", "C1E"
    CE = "CE", "CE"
    D1E = "D1E", "D1E"
    D2E = "D2E", "D2E"
    DE = "DE", "DE"


class QuestionSet(Enum):
    """Which pool an exam draws from and which questions count as critical in it."""

    ALL_600 = ("is_critical", None)
    MOTORCYCLE_A = ("is_critical_a", "in_set_a")  # 250 câu, Phụ lục I
    MOTORCYCLE_B1 = ("is_critical_b1", "in_set_b1")  # 300 câu, Phụ lục II

    def __init__(self, critical_field: str, membership_field: str | None) -> None:
        self.critical_field = critical_field
        self.membership_field = membership_field

    def pool(self) -> Q:
        return Q(**{self.membership_field: True}) if self.membership_field else Q()

    def critical(self) -> Q:
        return Q(**{self.critical_field: True})


@dataclass(frozen=True)
class Section:
    label: str
    count: int
    chapters: tuple[int, ...] = ()
    critical: bool = False


@dataclass(frozen=True)
class ExamRule:
    question_set: QuestionSet
    duration_minutes: int
    pass_score: int
    sections: tuple[Section, ...]

    @property
    def total_questions(self) -> int:
        return sum(s.count for s in self.sections)


def _sections(rules: int, culture: int, technique: int, structure: int, signs: int, scenario: int) -> tuple[Section, ...]:
    return (
        Section("Quy định chung và quy tắc giao thông", rules, chapters=(1,)),
        Section("Tình huống mất an toàn giao thông nghiêm trọng (điểm liệt)", 1, critical=True),
        Section("Văn hóa giao thông, đạo đức người lái xe", culture, chapters=(2,)),
        Section("Kỹ thuật lái xe", technique, chapters=(3,)),
        Section("Cấu tạo và sửa chữa", structure, chapters=(4,)),
        Section("Báo hiệu đường bộ", signs, chapters=(5,)),
        Section("Giải thế sa hình và xử lý tình huống", scenario, chapters=(6,)),
    )


_MOTORCYCLE_SECTIONS = (
    Section("Quy định chung và quy tắc giao thông", 8, chapters=(1,)),
    Section("Tình huống mất an toàn giao thông nghiêm trọng (điểm liệt)", 1, critical=True),
    Section("Văn hóa giao thông, đạo đức người lái xe", 1, chapters=(2,)),
    Section("Kỹ thuật lái xe hoặc cấu tạo sửa chữa", 1, chapters=(3, 4)),
    Section("Báo hiệu đường bộ", 8, chapters=(5,)),
    Section("Giải thế sa hình và xử lý tình huống", 6, chapters=(6,)),
)
_HEAVY = _sections(rules=10, culture=1, technique=2, structure=1, signs=16, scenario=14)

EXAM_RULES: dict[str, ExamRule] = {
    LicenseClass.A1: ExamRule(QuestionSet.MOTORCYCLE_A, 19, 21, _MOTORCYCLE_SECTIONS),
    LicenseClass.A: ExamRule(QuestionSet.MOTORCYCLE_A, 19, 23, _MOTORCYCLE_SECTIONS),
    LicenseClass.B1: ExamRule(QuestionSet.MOTORCYCLE_B1, 19, 23, _MOTORCYCLE_SECTIONS),
    LicenseClass.B: ExamRule(QuestionSet.ALL_600, 20, 27, _sections(8, 1, 1, 1, 9, 9)),
    LicenseClass.C1: ExamRule(QuestionSet.ALL_600, 22, 32, _sections(10, 1, 2, 1, 10, 10)),
    LicenseClass.C: ExamRule(QuestionSet.ALL_600, 24, 36, _sections(10, 1, 2, 1, 14, 11)),
    **{
        cls: ExamRule(QuestionSet.ALL_600, 26, 41, _HEAVY)
        for cls in (
            LicenseClass.D1, LicenseClass.D2, LicenseClass.D, LicenseClass.BE, LicenseClass.C1E,
            LicenseClass.CE, LicenseClass.D1E, LicenseClass.D2E, LicenseClass.DE,
        )
    },
}

_EXPECTED_TOTALS = {"A1": 25, "A": 25, "B1": 25, "B": 30, "C1": 35, "C": 40}
for _cls, _rule in EXAM_RULES.items():
    _expected = _EXPECTED_TOTALS.get(_cls, 45)
    if _rule.total_questions != _expected or _rule.pass_score > _expected:
        raise AssertionError(f"Invalid exam rule for {_cls}: {_rule.total_questions} questions")
if set(EXAM_RULES) != set(LicenseClass.values):
    raise AssertionError("Every license class needs an exam rule")
