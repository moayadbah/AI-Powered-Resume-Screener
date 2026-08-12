"""Literal skill matching against a job's required-skills list.

Word boundaries matter here. Naive substring matching finds "r" inside
"experience" and "go" inside "algorithm" - that is the classic way this feature
goes wrong, and there are tests for exactly it.

See docs/04-AI-SERVICE.md section 5.
"""

import re

# Obvious equivalents only. Resolves both directions. Keep this small - an
# ever-growing table is a sign this should be embedding-based instead.
ALIASES: dict[str, list[str]] = {
    "javascript": ["js", "ecmascript"],
    "typescript": ["ts"],
    "postgresql": ["postgres"],
    "kubernetes": ["k8s"],
    "amazon web services": ["aws"],
    "continuous integration": ["ci"],
    "natural language processing": ["nlp"],
    "spring boot": ["springboot"],
    "node.js": ["nodejs", "node js"],
    "c#": ["csharp", "c sharp"],
    "rest api": ["rest apis", "restful api", "restful apis", "rest"],
    "machine learning": ["ml"],
}


def _variants(skill: str) -> list[str]:
    """A skill plus its aliases, in both directions."""
    s = skill.strip().lower()
    out = {s}
    out.update(ALIASES.get(s, []))
    for canonical, aliases in ALIASES.items():
        if s in aliases:
            out.add(canonical)
            out.update(aliases)
    return sorted(out)


def _pattern(term: str) -> re.Pattern[str]:
    r"""Word-boundary regex for one term.

    \b does not work after punctuation - "c++" ends on a non-word char, so \b
    would demand a word char next. Use lookarounds keyed on the actual edges.
    """
    parts = [re.escape(w) for w in term.split()]
    # Flexible whitespace between words of a multi-word skill.
    body = r"[\s\-_]+".join(parts)

    left = r"(?<![\w+#.])" if term[0].isalnum() else r"(?<!\S)"
    right = r"(?![\w+#])" if term[-1].isalnum() else r"(?!\S)"
    return re.compile(left + body + right, re.IGNORECASE)


def match_skills(text: str, required: list[str]) -> tuple[list[str], list[str]]:
    """Return (matched, missing). Their union always equals `required`.

    Matching is done on the lowercased full resume text, not per section - a
    skill named anywhere counts.
    """
    if not required:
        return [], []

    haystack = text.lower()
    matched: list[str] = []
    missing: list[str] = []

    for skill in required:
        canonical = skill.strip().lower()
        if not canonical:
            continue
        if any(_pattern(v).search(haystack) for v in _variants(canonical)):
            matched.append(canonical)
        else:
            missing.append(canonical)

    return matched, missing


def skill_score(matched: list[str], required: list[str]) -> float:
    """Fraction of required skills found.

    No required skills means 0.0, not 1.0: an empty list gives everyone a purely
    semantic ranking with lower absolute numbers, which is the documented
    behaviour.
    """
    if not required:
        return 0.0
    return len(matched) / len(required)
