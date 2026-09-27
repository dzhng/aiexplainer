"""Builds the committed probe prompt sets (probes/prompts/*.json) from the validation split.

    uv run python -m probes.curate

Deterministic (fixed seed). Each set has at least `MIN_PROMPTS` prompts (slice 16).
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

import tokenizer

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"
MIN_PROMPTS = 30
SEED = 16

# Chapter 2: word pairs a reader expects to be close. Hand-written; only pairs whose
# words are each one token are used.
NEIGHBOUR_PAIRS = [
    ("cat", "kitten"), ("dog", "puppy"), ("mom", "dad"), ("happy", "glad"),
    ("sad", "upset"), ("big", "large"), ("small", "little"), ("boy", "girl"),
    ("run", "walk"), ("jump", "hop"), ("mother", "father"), ("brother", "sister"),
    ("red", "blue"), ("green", "yellow"), ("apple", "banana"), ("cake", "cookie"),
    ("car", "truck"), ("bird", "duck"), ("tree", "flower"), ("sun", "moon"),
    ("day", "night"), ("king", "queen"), ("hat", "coat"), ("cup", "bowl"),
    ("rain", "snow"), ("fast", "quick"), ("scared", "afraid"), ("angry", "mad"),
    ("pretty", "beautiful"), ("said", "asked"), ("park", "garden"), ("toy", "ball"),
    ("friend", "friends"), ("one", "two"), ("he", "she"), ("eat", "drink"),
]  # fmt: skip

# Chapter 5: the spec's example, then pairs drawn from validation sentences.
ORDER_EXAMPLES = [
    ("The dog chased the cat. Then the", "The cat chased the dog. Then the"),
    ("Then Tom gave Lily a ball and", "Then Lily gave Tom a ball and"),
]


def valid_stories() -> list[str]:
    return list(tokenizer.read_stories(tokenizer.VALID_FILE))


def first_sentences(stories: list[str]) -> list[str]:
    out = []
    for story in stories:
        sentence = re.split(r"(?<=[.!?])\s", story, maxsplit=1)[0].strip()
        if 6 <= len(sentence.split()) <= 20 and '"' not in sentence:
            out.append(sentence)
    return out


def sampling_prompts(stories: list[str], rng: random.Random) -> list[str]:
    """Sentence openings cut after 3+ words: common contexts for a next-token guess."""
    prompts: list[str] = []
    for sentence in rng.sample(first_sentences(stories), 200):
        words = sentence.rstrip(".!?").split()
        prompt = " ".join(words[: rng.randint(3, len(words) - 1)])
        if prompt not in prompts:
            prompts.append(prompt)
        if len(prompts) == 40:
            break
    return prompts


def pronoun_prompts(stories: list[str], rng: random.Random) -> list[dict[str, str]]:
    """Text up to the first "She"/"He" after the one character introduced by name, with
    at least one other sentence in between, so the pronoun has to reach back."""
    found: dict[str, dict[str, str]] = {}
    for story in stories:
        names = re.findall(r"named (\w+)\.", story)
        if len(names) != 1:
            continue
        name = names[0]
        after = story.index(f"named {name}.") + len(f"named {name}.")
        pronoun = re.search(r"(?<=[.!?] )(She|He)(?= )", story[after:])
        if not pronoun or pronoun.start() < 20:
            continue
        text = story[: after + pronoun.end()]
        if len(text) <= 400 and "\n" not in text:
            found[text] = {"text": text, "referent": name, "focus": pronoun.group(1)}
    return rng.sample(sorted(found.values(), key=lambda p: p["text"]), 40)


def recall_prompts(stories: list[str], rng: random.Random) -> list[dict[str, str]]:
    """Text up to (not including) the named character's next mention, at least one
    sentence later: the next word refers back to the name."""
    found: dict[str, dict[str, str]] = {}
    for story in stories:
        names = re.findall(r"named (\w+)\.", story)
        if len(names) != 1:
            continue
        name = names[0]
        after = story.index(f"named {name}.") + len(f"named {name}.")
        mention = re.search(rf"(?<=[a-z,] )(?={name}\b)", story[after:])
        if not mention or mention.start() < 20:
            continue
        text = story[: after + mention.start()].rstrip()
        if len(text) <= 400 and "\n" not in text:
            found[text] = {"text": text, "referent": name}
    return rng.sample(sorted(found.values(), key=lambda p: p["text"]), 40)


def order_pairs(stories: list[str], rng: random.Random) -> list[list[str]]:
    """Two earlier words swapped, the last word kept. Each swapped word follows a space,
    so both prompts hold exactly the same tokens in a different order."""
    pairs = [list(pair) for pair in ORDER_EXAMPLES]
    for sentence in rng.sample(first_sentences(stories), 200):
        words = sentence.rstrip(".!?").split()
        choices = [i for i in range(1, len(words) - 1) if words[i].isalpha()]
        if len(choices) < 2:
            continue
        i, j = sorted(rng.sample(choices, 2))
        if words[i].lower() == words[j].lower():
            continue
        swapped = words.copy()
        swapped[i], swapped[j] = swapped[j], swapped[i]
        pairs.append([" ".join(words), " ".join(swapped)])
        if len(pairs) == 40:
            break
    return pairs


def main() -> None:
    rng = random.Random(SEED)
    stories = valid_stories()
    PROMPTS_DIR.mkdir(exist_ok=True)
    sets = {
        "neighbours": [list(pair) for pair in NEIGHBOUR_PAIRS],
        "sampling": sampling_prompts(stories, rng),
        "pronoun": pronoun_prompts(stories, rng),
        "recall": recall_prompts(stories, rng),
        "order": order_pairs(stories, rng),
    }
    for name, prompts in sets.items():
        assert len(prompts) >= MIN_PROMPTS, name
        (PROMPTS_DIR / f"{name}.json").write_text(json.dumps(prompts, indent=2, ensure_ascii=False) + "\n")
        print(f"{name}: {len(prompts)} prompts")


def load(name: str):
    return json.loads((PROMPTS_DIR / f"{name}.json").read_text())


if __name__ == "__main__":
    main()
