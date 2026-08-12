from pathlib import Path

from app.services.sectioning import (
    MAX_CHUNKS,
    normalize,
    split_sections,
)

FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "fixtures" / "resumes"


def fixture(name: str) -> str:
    return (FIXTURES / f"{name}.txt").read_text()


def test_normalize_keeps_newlines():
    # Section detection depends on them.
    assert "\n" in normalize("EXPERIENCE\nDid things")


def test_normalize_strips_zero_width_and_collapses_spaces():
    # Escapes, not literals - invisible characters in a test are unreviewable.
    assert normalize("a\u200b\u200b   b") == "a b"


def test_normalize_strips_control_characters():
    assert normalize("Java\x00\x07 developer") == "Java developer"


def test_normalize_handles_crlf():
    assert normalize("EXPERIENCE\r\nStuff") == "EXPERIENCE\nStuff"


def test_splits_on_headings():
    chunks = split_sections(fixture("strong-backend"))
    assert len(chunks) > 1
    joined = " ".join(chunks).lower()
    assert "experience" in joined
    assert "education" in joined


def test_text_before_first_heading_is_kept():
    # The name/contact block carries the candidate's name.
    chunks = split_sections(fixture("strong-backend"))
    assert any("Omar Khalil" in c for c in chunks)


def test_falls_back_to_windowing_without_headings():
    prose = " ".join(f"word{i}" for i in range(600))
    chunks = split_sections(prose)
    assert len(chunks) > 1


def test_windowed_chunks_overlap():
    prose = " ".join(f"w{i}" for i in range(400))
    chunks = split_sections(prose)
    first_tail = set(chunks[0].split()[-30:])
    second_head = set(chunks[1].split()[:30])
    assert first_tail & second_head


# A short resume can lose every chunk to the minimum-length filter. Returning
# nothing would score it 0 for the wrong reason.
def test_short_resume_still_produces_a_chunk():
    chunks = split_sections(fixture("minimal"))
    assert len(chunks) >= 1
    assert "Sami" in " ".join(chunks)


def test_very_short_text_produces_a_chunk():
    assert split_sections("Java developer.") == ["Java developer."]


def test_heading_only_input_produces_a_chunk():
    assert len(split_sections("EXPERIENCE\nEDUCATION\nSKILLS")) >= 1


def test_empty_input_produces_nothing():
    assert split_sections("") == []
    assert split_sections("   \n\n  ") == []


def test_chunk_count_is_capped():
    huge = "\n\n".join("EXPERIENCE\n" + " ".join(["word"] * 200) for _ in range(60))
    assert len(split_sections(huge)) <= MAX_CHUNKS


def test_longer_heading_wins_over_shorter():
    # "work experience" should not be split as "experience".
    chunks = split_sections("WORK EXPERIENCE\n" + " ".join(["x"] * 40))
    assert len(chunks) == 1
    assert chunks[0].lower().startswith("work experience")


def test_all_fixtures_produce_chunks():
    for name in [
        "strong-backend",
        "partial-backend",
        "career-changer",
        "unrelated-designer",
        "minimal",
    ]:
        assert split_sections(fixture(name)), name


# Short sections merge into a neighbour rather than being discarded. For a
# career-changer, a two-line EDUCATION block is the whole signal.
def test_short_section_is_merged_not_dropped():
    chunks = split_sections(fixture("strong-backend"))
    joined = " ".join(chunks)
    assert "University of Jordan" in joined


def test_lone_headings_do_not_become_their_own_chunk():
    chunks = split_sections("SKILLS\n\nEXPERIENCE\n\n" + " ".join(["x"] * 40))
    assert all(len(c.split()) >= 3 for c in chunks)


def test_no_content_is_lost_when_merging():
    text = "Jane Doe\n\nEDUCATION\nBSc 2020\n\nEXPERIENCE\n" + " ".join(["x"] * 40)
    joined = " ".join(split_sections(text))
    for token in ["Jane Doe", "EDUCATION", "BSc 2020", "EXPERIENCE"]:
        assert token in joined, token
