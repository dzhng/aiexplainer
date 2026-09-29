# The story (draft copy, for the human's read)

**Who it's for:** a curious adult with no tech background who uses AI chatbots and finds
them a black box. **The goal:** they leave knowing what's actually inside, with no magic, no
database and no mind, and with the common myths answered. It is **not** a technical deep
dive; the Technical toggle holds the precise terms for anyone curious. It covers how an LLM
runs (inference); training is a separate project.

Slice 01 moves this copy into chapter data and renders it end to end at `/lab/story`. Every
sentence: storyteller voice, ≤ 25 words, no jargon without its plain version first. Claims
must match what each scene really shows. Edit freely; this file is the source of truth until
slice 01.

## The spine: the questions people ask

Each machine answers one question people actually ask about chatbots. You watch a finished
machine write a sentence (the intro), then you meet its parts one at a time, each added
because the machine couldn't yet do something you'd expect. The last machine writes a whole
answer, and the finale answers the big one: _so, is it magic?_

## The hall

- **Intro section** (its own alcove): What is it?
- **Act I · Making a guess:** 1 How does it read? · 2 How does it know "cat" is like "kitten"? · 3 How does it pick a word?
- **Act II · Following what you said:** 4 How does it follow what I said? · 5 Does word order matter? · 6 Where does its knowledge live? · 7 How does it get good enough?
- **Act III · Writing an answer:** 8 How does it write a whole answer, and does it remember me?
- **Behind the scenes** (a side room, optional, clearly marked): running it for millions of people: sticky notes (KV cache), the bus (batching), smaller numbers (quantization), a fast helper (speculative decoding), specialists (mixture of experts).

## The lab: first five seconds

- **Camera:** high at the intro end, looking down the hall. The intro alcove is nearest and
  warm-lit; its board already shows a sentence. Acts I–III recede, their names on the floor;
  the side room is off to one side, dimmer, signed "Behind the scenes".
- **One motion:** a pulsing ring and a **Start here** plate on the intro machine.
- **Left column:** brand, "How AI chatbots actually work", "Nine small machines that
  together make a real (tiny) chatbot brain. No magic inside, just parts you can watch.",
  a big **Start here · What is it?** button, and the acts list, with the side room listed
  last as optional.
- **Hint** (fades after the first orbit): "Drag to look around · click any machine".
- **Hover a machine:** it brightens, and a pill shows its question, e.g. "4 · How does it
  follow what I said?"
- **Returning visitor:** **Continue · 5 Does word order matter?**, the plate reads **Next**,
  ✓s on the floor and in the list.
- **Main path done:** "You've seen every part." and **Tour the whole machine**, plus "or
  step behind the scenes" pointing at the side room.

## Act blurbs

| Zone                             | Blurb                                                                |
| -------------------------------- | -------------------------------------------------------------------- |
| Intro · What is it?              | Watch a real one write, one word at a time.                          |
| Act I · Making a guess           | Turn your words into numbers, then pick the next word.               |
| Act II · Following what you said | Let it weigh every word you wrote, in order, and use what it knows.  |
| Act III · Writing an answer      | Put it all together and watch it write, one word after another.      |
| Behind the scenes                | Optional: the tricks that let one machine answer millions of people. |

## Intro · What is it?

**Loop** (about 26 s; the lesson ends near 24 s). The words are the model's real top picks.

1. The opening text lands on the board as cards.
2. Bars rise: how likely each next word is, after reading the whole text.
3. The tallest bar lights, and its word joins the end of the text.
4. The same thing, five more times; a sentence grows.
5. The header prints "It guesses the next word, over and over. That's the whole trick."

- **Brief.** What it is: "This is a real AI language model, the same kind as the big
  chatbots, just tiny, running right here on your computer." Watch: "Watch it guess the next
  word, add it, and guess again."
- **Caption:** "Every chatbot answer is written one word at a time: the model guesses the
  likeliest next word, adds it, and guesses again. Let's open it up and see how it guesses."
- **Technical:** "Chapter 7's 4-block transformer trained on children's stories. It predicts
  tokens (word pieces); the bars are its real next-token probabilities, and here it always
  takes the top one."
- **Labels:** bars "How likely each next word is" / "Next-token probabilities"; rail "Your
  text so far" / "Context".
- **Your turn:** "Type the start of a story and watch it guess what comes next."

## Act I · Making a guess

**1 · How does it read?**

- So far: You watched a finished machine write; now let's see what's inside, part by part.
- Still missing: A computer can only work with numbers, and your words aren't numbers.
- This lesson: Watch your text snap into small pieces from a fixed box, each stamped with a number.
- But: To the machine, "cat" and "kitten" are just two unrelated numbers.

**2 · How does it know "cat" is like "kitten"?**

- So far: Your text arrives as a row of numbered pieces.
- Still missing: The numbers are arbitrary: nothing says "cat" and "kitten" are alike.
- This lesson: Every piece gets a spot on a map, and words used in similar ways end up close together.
- But: A spot on a map isn't a guess; nothing picks the next word yet.

**3 · How does it pick a word?**

- So far: Every word has a spot on a map, near words used like it.
- Still missing: Nothing chooses the next word.
- This lesson: Each possible next word gets a score, and the scores load a die that rolls the next word.
- Myth, answered: "That's why the same question can get different answers, and why it can sound sure and still be wrong: the die always lands on something."
- But: It only looks at your last word, so two different sentences ending in "it" roll the same die.

## Act II · Following what you said

**4 · How does it follow what I said?**

- So far: It can guess a next word, but only from the last one.
- Still missing: It forgets everything you wrote before that.
- This lesson: Every earlier word gets a pipe into the last one, wider the more that word matters for what comes next.
- Myth, answered: "It isn't looking anything up or reading your mind; it's weighing the words you gave it."
- But: Swap "dog" and "cat" and the pipes just trade places: it can't tell who chased whom.

**5 · Does word order matter?**

- So far: It weighs every earlier word.
- Still missing: It can't tell "the dog chased the cat" from "the cat chased the dog".
- This lesson: Each word carries a clock hand, turned further the later it sits in the sentence.
- But: It gathers the right words, but does nothing with what it gathered yet.

**6 · Where does its knowledge live?**

- So far: It gathers the words that matter, in order.
- Still missing: Gathering isn't knowing: it needs somewhere to keep what it learned about words.
- This lesson: A panel of thousands of yes/no questions lights up for the words it sees, and each "yes" nudges the guess.
- Myth, answered: "There's no database of facts inside: what it knows is stored as patterns in these numbers, and they can be wrong."
- But: One panel, one pass, is still a shaky guess.

**7 · How does it get good enough?**

- So far: It reads, follows your words and uses what it knows, once.
- Still missing: One pass isn't enough to write sensible sentences.
- This lesson: Stack the same block again and again, each adding a little to the last, until the guesses get good: this is the intro's machine.
- Technical (river): each block adds to a running total instead of replacing it, which is what lets many blocks stack.
- But: One pass through the whole stack still only guesses one word.

## Act III · Writing an answer

**8 · How does it write a whole answer, and does it remember me?**

- So far: You've built the intro's machine: one pass gives one next word.
- Still missing: An answer needs hundreds of words.
- This lesson: Watch it add each word to the end and read the whole text again: exactly how the intro's sentence grew.
- Myth, answered: "It only sees the text in front of it; a chat app resends your conversation every time, and there's a limit to how much fits."
- Closing line: That's every part. Head back to the lab and watch one word travel through them all.

## Behind the scenes (optional side room)

Short, plain versions of today's chapters, each framed as "how do they serve millions of
people?". They keep their scenes; their briefs are re-voiced:

- **Sticky notes:** it keeps notes about words it has read, so it doesn't reread everything for every new word.
- **The bus:** one trip through the machine can carry many people's conversations for about the price of one.
- **Smaller numbers:** store each number more roughly, like a lower-resolution photo: half the size, nearly the same answers.
- **A fast helper:** a small helper drafts a few words, and the big model checks them all at once.
- **Specialists:** a much bigger model where each word only visits a few specialist parts, like a hospital's triage desk.

## Finale · So, is it magic?

After the tour: "No database. No mind reading. No magic. A very good next-word guesser,
built from parts you've now seen, and it can be confidently wrong." Then Share, and "step
behind the scenes".

## Inside a machine (left column)

- **Breadcrumb:** "Lab › Act II › 4 · How does it follow what I said?", and "← Back to the lab (Esc)".
- **Brief rows:** "So far", "Still missing", "This lesson", then **Start the lesson** (Enter).
- **Locked note:** "Your turn comes when the lesson ends." with the steps this machine has.
- **Your turn:** the controls appear; a "But…" card above Next shows the hand-off.
- **After machine 8:** Next becomes **Back to the lab · Tour the whole machine**.

## Share

`/c/N/` share pages follow the new numbering; old numbers above 8 redirect to `/`.
