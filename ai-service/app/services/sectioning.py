"""Split resume text into embeddable chunks.

all-MiniLM-L6-v2 truncates at 256 word-pieces (~200 words). A two-page resume is
far longer, so embedding it whole throws most of it away. Splitting is what makes
the score mean anything, not an optimisation.

See docs/04-AI-SERVICE.md section 2.
"""

import re
import unicodedata

# Headings we split on, at the start of a line, case-insensitive.
SECTION_HEADINGS = [
    "professional experience",
    "work experience",
    "experience",
    "employment",
    "academic background",
    "education",
    "technical skills",
    "core competencies",
    "skills",
    "personal projects",
    "projects",
    "certifications",
    "licenses",
    "summary",
    "profile",
    "objective",
    "about",
    "publications",
    "awards",
    "achievements",
    "languages",
    "interests",
]

# Longest first, so "work experience" wins over "experience".
_HEADING_RE = re.compile(
    r"^[\s\-\*•]*("
    + "|".join(sorted(map(re.escape, SECTION_HEADINGS), key=len, reverse=True))
    + r")\s*:?\s*$",
    re.IGNORECASE | re.MULTILINE,
)

TARGET_CHUNK_WORDS = 180
CHUNK_OVERLAP_WORDS = 30
MIN_CHUNK_WORDS = 20
MAX_CHUNKS = 30

# Control chars and zero-width junk that PDF extraction leaves behind.
# Written as escapes on purpose - literal control bytes in a source file
# are invisible and break the parser.
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\ufeff]")
_SPACE_RE = re.compile(r"[^\S\n]+")
_BLANKS_RE = re.compile(r"\n{3,}")


def normalize(text: str) -> str:
    """NFKC, strip control/zero-width junk, collapse spaces - but keep newlines.

    Newlines survive because section detection depends on them. Case is left
    alone: the model was trained on cased text. Lowercasing happens only in
    skill matching.
    """
    text = unicodedata.normalize("NFKC", text)
    text = _CONTROL_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _SPACE_RE.sub(" ", text)
    text = _BLANKS_RE.sub("\n\n", text)
    return text.strip()


def _window(words: list[str]) -> list[str]:
    """Fixed-size chunks with overlap."""
    if len(words) <= TARGET_CHUNK_WORDS:
        return [" ".join(words)]

    step = TARGET_CHUNK_WORDS - CHUNK_OVERLAP_WORDS
    out: list[str] = []
    for start in range(0, len(words), step):
        piece = words[start : start + TARGET_CHUNK_WORDS]
        if not piece:
            break
        out.append(" ".join(piece))
        if start + TARGET_CHUNK_WORDS >= len(words):
            break
    return out


def split_sections(text: str) -> list[str]:
    """Return the chunks to embed. Never returns an empty list for non-empty input."""
    text = normalize(text)
    if not text:
        return []

    matches = list(_HEADING_RE.finditer(text))

    if matches:
        blocks: list[str] = []
        # Text before the first heading: the name/contact block.
        head = text[: matches[0].start()].strip()
        if head:
            blocks.append(head)
        for i, m in enumerate(matches):
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            # Include the heading itself - "EXPERIENCE" is signal.
            block = text[m.start() : end].strip()
            if block:
                blocks.append(block)
    else:
        # Plenty of resumes are formatted as prose with no recognisable headings.
        blocks = [text]

    blocks = _merge_short(blocks)

    chunks: list[str] = []
    for block in blocks:
        chunks.extend(_window(block.split()))

    # A resume that somehow produced nothing still needs one chunk, or it scores
    # 0 for the wrong reason.
    if not chunks:
        chunks = [text]

    return chunks[:MAX_CHUNKS]


def _merge_short(blocks: list[str]) -> list[str]:
    """Fold blocks under MIN_CHUNK_WORDS into their neighbour.

    A lone "SKILLS" heading is noise in the max-pool, but a short EDUCATION
    section is not - for a career-changer it is the whole signal. So short
    blocks merge forward rather than being discarded. Nothing is thrown away.
    """
    if not blocks:
        return []

    merged: list[str] = []
    carry = ""

    for block in blocks:
        candidate = f"{carry}\n\n{block}".strip() if carry else block
        if len(candidate.split()) < MIN_CHUNK_WORDS:
            carry = candidate
            continue
        merged.append(candidate)
        carry = ""

    # Trailing short block: attach to the previous one, or stand alone if it is
    # the only thing we have.
    if carry:
        if merged:
            merged[-1] = f"{merged[-1]}\n\n{carry}"
        else:
            merged.append(carry)

    return merged
