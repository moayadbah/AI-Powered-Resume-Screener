from app.services.skills import match_skills, skill_score


def test_matches_plain_skill():
    matched, missing = match_skills("Four years of Java and Spring Boot.", ["java"])
    assert matched == ["java"]
    assert missing == []


def test_union_always_equals_required():
    required = ["java", "rust", "docker"]
    matched, missing = match_skills("Java and Docker.", required)
    assert sorted(matched + missing) == sorted(required)


# The classic bug: substring matching finds "r" in "experience".
def test_does_not_match_inside_a_longer_word():
    text = "Five years of experience with algorithms and management."
    matched, missing = match_skills(text, ["r", "go", "age", "rime"])
    assert matched == []
    assert sorted(missing) == ["age", "go", "r", "rime"]


def test_matches_single_letter_skill_when_standalone():
    matched, _ = match_skills("Statistical work in R and Python.", ["r"])
    assert matched == ["r"]


def test_multi_word_skill_matches_as_a_phrase():
    matched, missing = match_skills("Built services with Spring Boot.", ["spring boot"])
    assert matched == ["spring boot"]

    # The words apart should not count.
    matched, missing = match_skills("Spring cleaning and a boot sequence.", ["spring boot"])
    assert matched == []


def test_multi_word_skill_tolerates_hyphen_and_extra_space():
    for text in ["spring-boot", "Spring  Boot", "spring_boot"]:
        matched, _ = match_skills(f"Worked on {text} services.", ["spring boot"])
        assert matched == ["spring boot"], text


# Punctuation-bearing skills need escaping, and \b does not work at their edges.
def test_skills_with_punctuation():
    text = "Wrote C++ and C# services, plus a .NET backend and Node.js tooling."
    matched, missing = match_skills(text, ["c++", "c#", ".net", "node.js"])
    assert sorted(matched) == sorted(["c++", "c#", ".net", "node.js"])
    assert missing == []


def test_c_plus_plus_does_not_match_bare_c():
    matched, _ = match_skills("Experienced in C++ only.", ["c"])
    assert matched == []


def test_aliases_resolve_both_directions():
    matched, _ = match_skills("Strong JS and K8s experience.", ["javascript", "kubernetes"])
    assert sorted(matched) == ["javascript", "kubernetes"]

    # And the canonical name matches when the alias is what was required.
    matched, _ = match_skills("Strong JavaScript experience.", ["js"])
    assert matched == ["js"]


def test_matching_is_case_insensitive():
    matched, _ = match_skills("JAVA, mongodb, DoCkEr", ["java", "MongoDB", "docker"])
    assert sorted(matched) == ["docker", "java", "mongodb"]


def test_empty_required_skills_scores_zero_not_one():
    matched, missing = match_skills("Anything at all.", [])
    assert matched == []
    assert missing == []
    assert skill_score(matched, []) == 0.0


def test_skill_score_is_a_fraction():
    assert skill_score(["java", "docker"], ["java", "docker", "rust", "go"]) == 0.5
    assert skill_score([], ["java"]) == 0.0
    assert skill_score(["java"], ["java"]) == 1.0
