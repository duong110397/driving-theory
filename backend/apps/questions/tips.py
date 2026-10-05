"""Study tips ("mẹo") for the question bank.

Tips are curated content in data/tips.json. Each tip lists the questions it explains together with
a fragment of the correct answer; tests check those claims against the dataset so a wrong tip
cannot ship. Myths are popular tips that do not hold for the 2025 bank; for guessing heuristics the
accuracy is computed from the live data instead of being written down.
"""
import json
import re
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from django.conf import settings

from .models import Option, Question

TIPS_FILE = Path(settings.BASE_DIR) / "data" / "tips.json"

ALL_OF_THE_ABOVE = re.compile(r"cả (hai |ba )?ý|tất cả các ý|ý \d và ý \d", re.IGNORECASE)


@dataclass(frozen=True)
class TipQuestion:
    number: int
    # Fragment of the correct option's text; verified by tests, not sent to clients.
    answer: str


@dataclass(frozen=True)
class Tip:
    id: str
    chapter: int
    title: str
    points: list[str]
    questions: list[TipQuestion] = field(default_factory=list)


@dataclass(frozen=True)
class Myth:
    id: str
    claim: str
    truth: str
    heuristic: str | None = None
    questions: list[TipQuestion] = field(default_factory=list)


@dataclass(frozen=True)
class TipBook:
    tips: list[Tip]
    myths: list[Myth]


def _questions(raw: Iterable[dict[str, Any]]) -> list[TipQuestion]:
    return [TipQuestion(number=int(q["number"]), answer=str(q["answer"])) for q in raw]


def parse_tip_book(data: dict[str, Any]) -> TipBook:
    """Build a TipBook from JSON data; raises KeyError/TypeError/ValueError on malformed input."""
    tips = [
        Tip(
            id=str(t["id"]),
            chapter=int(t["chapter"]),
            title=str(t["title"]),
            points=[str(p) for p in t["points"]],
            questions=_questions(t.get("questions", [])),
        )
        for t in data["tips"]
    ]
    myths = [
        Myth(
            id=str(m["id"]),
            claim=str(m["claim"]),
            truth=str(m["truth"]),
            heuristic=m.get("heuristic"),
            questions=_questions(m.get("questions", [])),
        )
        for m in data["myths"]
    ]
    unknown = {m.heuristic for m in myths if m.heuristic} - HEURISTICS.keys()
    if unknown:
        raise ValueError(f"Unknown heuristics in tips: {sorted(unknown)}")
    return TipBook(tips=tips, myths=myths)


@cache
def load_tip_book() -> TipBook:
    with TIPS_FILE.open(encoding="utf-8") as f:
        return parse_tip_book(json.load(f))


# --- guessing heuristics -------------------------------------------------------------------------

# A heuristic picks one option, or None when it cannot decide (e.g. a tie for the longest).
Heuristic = Callable[[list[Option]], Option | None]


def _longest_option(options: list[Option]) -> Option | None:
    ranked = sorted(options, key=lambda o: len(o.text), reverse=True)
    if len(ranked) < 2 or len(ranked[0].text) == len(ranked[1].text):
        return None
    return ranked[0]


def _all_of_the_above(options: list[Option]) -> Option | None:
    return next((o for o in options if ALL_OF_THE_ABOVE.search(o.text)), None)


HEURISTICS: dict[str, Heuristic] = {
    "longest_option": _longest_option,
    "all_of_the_above": _all_of_the_above,
}


@dataclass(frozen=True)
class HeuristicStats:
    applicable: int
    correct: int


def heuristic_stats(name: str) -> HeuristicStats:
    """How often the heuristic's pick is right, over the questions where it picks something."""
    pick = HEURISTICS[name]
    applicable = correct = 0
    for question in Question.objects.prefetch_related("options"):
        choice = pick(list(question.options.all()))
        if choice is not None:
            applicable += 1
            correct += choice.is_correct
    return HeuristicStats(applicable=applicable, correct=correct)


def tip_book_payload() -> dict[str, Any]:
    """Public representation: answer fragments are omitted so tips don't leak answers on their own."""
    book = load_tip_book()
    cited = {q.number for item in [*book.tips, *book.myths] for q in item.questions}
    chapter_of = dict(Question.objects.filter(number__in=cited).values_list("number", "chapter__number"))

    def public_questions(questions: list[TipQuestion]) -> list[dict[str, int]]:
        # Questions missing from the DB (dataset not imported yet) are left out rather than linked.
        return [{"number": q.number, "chapter": chapter_of[q.number]} for q in questions if q.number in chapter_of]

    stats = {name: heuristic_stats(name) for name in {m.heuristic for m in book.myths if m.heuristic}}
    return {
        "tips": [{**asdict(t), "questions": public_questions(t.questions)} for t in book.tips],
        "myths": [
            {
                **asdict(m),
                "questions": public_questions(m.questions),
                "stats": asdict(stats[m.heuristic]) if m.heuristic else None,
            }
            for m in book.myths
        ],
    }
