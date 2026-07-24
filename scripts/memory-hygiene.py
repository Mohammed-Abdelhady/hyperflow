#!/usr/bin/env python3
"""Detect conflicts and prune candidates in .hyperflow/memory (read-only by default).

Conflict quality (beyond duplicate headings):
  - duplicate / near-duplicate decision headings
  - affirmative vs negative pairs (Use X vs Avoid/Don't use X)
  - titles shared across decisions.md and project-decisions.md
  - decisions that reappear under pitfalls with opposing polarity

Prune suggestions (never auto-delete):
  - files over compaction line threshold
  - cold-tier dated entries (age > warm window)
  - empty bodies / stub-only sections
  - missing type-tag on dated entries
  - archive candidates already summarized

Exit 0 always unless --strict (then exit 1 when conflicts exist).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path

DEFAULT_COMPACTION_THRESHOLD = 300
HOT_DAYS = 7
WARM_DAYS = 30

CATEGORY_FILES = (
    "decisions.md",
    "project-decisions.md",
    "learnings.md",
    "pitfalls.md",
    "anti-patterns.md",
    "patterns.md",
    "conventions.md",
)

HEADING_RE = re.compile(r"^(#{2,3})\s+(.+)$")
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
TAGS_RE = re.compile(r"`?\[([a-z0-9,\s-]+)\]`?", re.IGNORECASE)
TYPE_TAGS = frozenset(
    {"pattern", "gotcha", "decision", "pitfall", "convention", "dependency-quirk"}
)

# Affirmative / negative polarity cues for conflict detection.
AFFIRM_PREFIX = re.compile(
    r"^(?:use|prefer|adopt|choose|chose|lock(?:ed)?\s+on|standardize\s+on|switch\s+to)\s+",
    re.IGNORECASE,
)
NEG_PREFIX = re.compile(
    r"^(?:(?:do\s+not|don't|dont|never|avoid|ban|reject|drop|remove|deprecate|no)\s+)"
    r"(?:use\s+)?",
    re.IGNORECASE,
)
STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "to",
        "for",
        "and",
        "or",
        "of",
        "in",
        "on",
        "with",
        "our",
        "we",
        "as",
        "is",
        "be",
    }
)


@dataclass
class Entry:
    file: str
    level: int
    raw_title: str
    norm_title: str
    topic: str
    polarity: str  # affirm | neg | neutral
    day: date | None
    tags: list[str]
    body_lines: list[str] = field(default_factory=list)

    @property
    def age_days(self) -> int | None:
        if self.day is None:
            return None
        return (date.today() - self.day).days

    @property
    def tier(self) -> str:
        if self.file == "anti-patterns.md":
            return "hot"
        age = self.age_days
        if age is None:
            return "warm"
        if age <= HOT_DAYS:
            return "hot"
        if age <= WARM_DAYS:
            return "warm"
        return "cold"

    @property
    def body_text(self) -> str:
        return "\n".join(self.body_lines).strip()


@dataclass
class HygieneReport:
    memory_dir: str
    exists: bool
    conflicts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    prune: list[str] = field(default_factory=list)
    files: list[dict] = field(default_factory=list)
    entry_count: int = 0
    cold_count: int = 0
    ok: bool = True


def _to_date(raw: str) -> date | None:
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return None


def normalize_title(title: str) -> str:
    t = title.strip().lower()
    t = DATE_RE.sub(" ", t)
    t = TAGS_RE.sub(" ", t)
    t = re.sub(r"[`*_~\[\](){}:.,;!?/\\|+\"']", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -—")
    return t


def extract_topic_and_polarity(norm_title: str) -> tuple[str, str]:
    """Strip polarity cues so 'Use Hono' and 'Avoid Hono' share topic 'hono'."""
    polarity = "neutral"
    rest = norm_title
    m = NEG_PREFIX.match(rest)
    if m:
        polarity = "neg"
        rest = rest[m.end() :]
    else:
        m = AFFIRM_PREFIX.match(rest)
        if m:
            polarity = "affirm"
            rest = rest[m.end() :]
    tokens = [tok for tok in rest.split() if tok and tok not in STOPWORDS]
    topic = " ".join(tokens).strip()
    return topic or norm_title, polarity


def parse_tags(title: str) -> list[str]:
    tags: list[str] = []
    for match in TAGS_RE.finditer(title):
        inner = match.group(1)
        if DATE_RE.search(inner):
            continue
        tags = [t.strip().lower() for t in inner.split(",") if t.strip()]
        break
    return tags


def parse_entries(path: Path, rel_name: str) -> list[Entry]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    entries: list[Entry] = []
    current: Entry | None = None
    for line in text.splitlines():
        hm = HEADING_RE.match(line.strip())
        if hm:
            if current is not None:
                entries.append(current)
            raw = hm.group(2).strip()
            norm = normalize_title(raw)
            topic, polarity = extract_topic_and_polarity(norm)
            day = None
            dm = DATE_RE.search(raw)
            if dm:
                day = _to_date(dm.group(1))
            current = Entry(
                file=rel_name,
                level=len(hm.group(1)),
                raw_title=raw,
                norm_title=norm,
                topic=topic,
                polarity=polarity,
                day=day,
                tags=parse_tags(raw),
            )
            continue
        if current is not None:
            current.body_lines.append(line)
    if current is not None:
        entries.append(current)
    return entries


def find_heading_duplicates(entries: list[Entry], file_filter: str | None = None) -> list[str]:
    titles: dict[str, list[Entry]] = {}
    for e in entries:
        if file_filter and e.file != file_filter:
            continue
        if e.file not in {"decisions.md", "project-decisions.md"} and file_filter is None:
            # Duplicate headings matter most in decision locks; still check all category files.
            pass
        titles.setdefault(e.norm_title, []).append(e)
    conflicts: list[str] = []
    for title, group in sorted(titles.items()):
        if len(group) < 2:
            continue
        # Same-file duplicates are hard conflicts; cross-file handled separately.
        by_file: dict[str, int] = {}
        for e in group:
            by_file[e.file] = by_file.get(e.file, 0) + 1
        for fname, n in by_file.items():
            if n > 1:
                conflicts.append(
                    f"duplicate heading ({n}x) in {fname}: {title}"
                )
    return conflicts


def find_polarity_conflicts(entries: list[Entry]) -> list[str]:
    """Same topic with both affirm and neg polarity → conflict."""
    by_topic: dict[str, list[Entry]] = {}
    for e in entries:
        if not e.topic or e.polarity == "neutral":
            continue
        # Prefer decision-class files + pitfalls for polarity fights.
        if e.file not in {
            "decisions.md",
            "project-decisions.md",
            "pitfalls.md",
            "anti-patterns.md",
            "learnings.md",
            "conventions.md",
        }:
            continue
        by_topic.setdefault(e.topic, []).append(e)

    conflicts: list[str] = []
    for topic, group in sorted(by_topic.items()):
        pols = {e.polarity for e in group}
        if "affirm" in pols and "neg" in pols:
            samples = "; ".join(
                f"{e.file}: «{e.raw_title[:60]}» ({e.polarity})" for e in group[:4]
            )
            conflicts.append(f"polarity clash on «{topic}»: {samples}")
    return conflicts


def find_cross_decision_titles(entries: list[Entry]) -> list[str]:
    d = {e.norm_title for e in entries if e.file == "decisions.md"}
    p = {e.norm_title for e in entries if e.file == "project-decisions.md"}
    both = sorted(d.intersection(p))
    return [f"title in both decisions.md and project-decisions.md: {t}" for t in both]


def find_near_duplicate_topics(entries: list[Entry]) -> list[str]:
    """Near-duplicate decision topics (same topic, multiple affirm entries, different wording)."""
    by_topic: dict[str, list[Entry]] = {}
    for e in entries:
        if e.file not in {"decisions.md", "project-decisions.md"}:
            continue
        if len(e.topic.split()) < 1:
            continue
        by_topic.setdefault(e.topic, []).append(e)
    warnings: list[str] = []
    for topic, group in sorted(by_topic.items()):
        uniq_titles = {e.norm_title for e in group}
        if len(group) > 1 and len(uniq_titles) > 1:
            warnings.append(
                f"near-duplicate decision topic «{topic}» ({len(uniq_titles)} wordings) — merge or supersede"
            )
    return warnings


def build_prune_suggestions(
    mem: Path,
    entries: list[Entry],
    files_meta: list[dict],
    threshold: int,
) -> list[str]:
    prune: list[str] = []

    for meta in files_meta:
        if meta.get("exists") and int(meta.get("lines", 0)) >= threshold:
            prune.append(
                f"compact {meta['name']}: {meta['lines']} lines >= threshold {threshold} "
                f"(/hyperflow:cache compact)"
            )

    cold = [e for e in entries if e.tier == "cold"]
    if cold:
        # Cap listing noise
        shown = cold[:8]
        for e in shown:
            age = e.age_days if e.age_days is not None else "?"
            prune.append(
                f"cold entry ({age}d) in {e.file}: {e.raw_title[:70]} — stub+archive candidate"
            )
        if len(cold) > len(shown):
            prune.append(f"... and {len(cold) - len(shown)} more cold entries")

    for e in entries:
        body = e.body_text
        if not body or body in {"...", "…", "(empty)", "TBD", "todo"}:
            prune.append(f"empty body under {e.file}: {e.raw_title[:70]}")
            continue
        if "— summarized" in e.raw_title.lower() or "— summarized" in body.lower():
            # already compacted; fine
            continue
        # dated entry without a type tag (advisory)
        if e.day is not None and e.file not in {"project-decisions.md"}:
            if not any(t in TYPE_TAGS for t in e.tags):
                prune.append(
                    f"missing type tag on dated entry in {e.file}: {e.raw_title[:70]}"
                )

    # orphan checksums / index without category content
    index = mem / "index.md"
    if index.is_file() and not any(
        (mem / n).is_file() and (mem / n).stat().st_size > 20 for n in CATEGORY_FILES
    ):
        prune.append("index.md present but category files empty/missing — rebuild or delete index")

    # de-dupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for p in prune:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def scan_memory(
    mem: Path,
    *,
    compaction_threshold: int = DEFAULT_COMPACTION_THRESHOLD,
) -> HygieneReport:
    report = HygieneReport(memory_dir=str(mem), exists=mem.is_dir())
    if not mem.is_dir():
        report.warnings.append("memory dir missing (ok if project not scaffolded)")
        return report

    entries: list[Entry] = []
    for name in CATEGORY_FILES:
        p = mem / name
        exists = p.is_file()
        lines = 0
        nbytes = 0
        if exists:
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
                lines = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
                nbytes = p.stat().st_size
            except OSError:
                exists = False
            if exists:
                entries.extend(parse_entries(p, name))
        report.files.append(
            {"name": name, "exists": exists, "bytes": nbytes, "lines": lines}
        )

    report.entry_count = len(entries)
    report.cold_count = sum(1 for e in entries if e.tier == "cold")

    report.conflicts.extend(find_heading_duplicates(entries))
    report.conflicts.extend(find_polarity_conflicts(entries))
    # cross-file title overlap is warning-level unless exact same lock text conflicts via polarity
    report.warnings.extend(find_cross_decision_titles(entries))
    report.warnings.extend(find_near_duplicate_topics(entries))

    report.prune = build_prune_suggestions(
        mem, entries, report.files, compaction_threshold
    )

    # de-dupe conflicts
    seen_c: set[str] = set()
    uniq_c: list[str] = []
    for c in report.conflicts:
        if c not in seen_c:
            seen_c.add(c)
            uniq_c.append(c)
    report.conflicts = uniq_c
    report.ok = not report.conflicts
    return report


def memory_ok_summary(mem: Path) -> str:
    """Compact status line for DISPATCH_RESUME / status.py."""
    if not mem.is_dir():
        return "review decisions.md (missing dir)"
    report = scan_memory(mem)
    if report.conflicts:
        first = report.conflicts[0]
        extra = f" (+{len(report.conflicts) - 1} more)" if len(report.conflicts) > 1 else ""
        return f"review memory ({first[:80]}{extra})"
    if not (mem / "decisions.md").is_file():
        return "review decisions.md (missing)"
    if report.prune:
        # prune is advisory — still ok
        return "yes"
    return "yes"


def format_text(report: HygieneReport) -> str:
    lines: list[str] = []
    lines.append(f"memory_dir={report.memory_dir} exists={report.exists}")
    lines.append(
        f"entries={report.entry_count} cold={report.cold_count} "
        f"conflicts={len(report.conflicts)} warnings={len(report.warnings)} "
        f"prune={len(report.prune)}"
    )
    for c in report.conflicts:
        lines.append(f"CONFLICT {c}")
    for w in report.warnings:
        lines.append(f"WARN {w}")
    for p in report.prune:
        lines.append(f"PRUNE {p}")
    if report.ok and not report.conflicts:
        lines.append("PASS no decision conflicts")
    elif not report.ok:
        lines.append("FAIL decision conflicts present (re-run without --strict to inspect)")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Read-only Hyperflow memory conflict + prune scan"
    )
    ap.add_argument(
        "--memory-dir",
        type=Path,
        default=Path(".hyperflow/memory"),
        help="Path to project memory dir",
    )
    ap.add_argument("--json", action="store_true", help="Machine-readable JSON")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="Exit 1 when CONFLICT rows exist",
    )
    ap.add_argument(
        "--threshold",
        type=int,
        default=DEFAULT_COMPACTION_THRESHOLD,
        help=f"Compaction line threshold for PRUNE hints (default {DEFAULT_COMPACTION_THRESHOLD})",
    )
    args = ap.parse_args(argv)

    report = scan_memory(args.memory_dir, compaction_threshold=args.threshold)
    if args.json:
        payload = asdict(report)
        print(json.dumps(payload, indent=2))
    else:
        sys.stdout.write(format_text(report))

    if args.strict and report.conflicts:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
