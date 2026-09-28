# The story (draft copy, for the human's read)

Slice 01 puts this copy into chapter data and renders it end to end at `/lab/story`. Every
sentence follows the archived copy rules (storyteller voice, ≤25 words). Numbers and claims
must still match what each chapter's scene really shows. Edit freely; this file is the
source of truth until slice 01 moves it into `ChapterDef`.

## The spine

You watch a finished machine write a sentence (the intro). Then you build that machine from
an empty bench, one part at a time, each part added because the last version failed
somewhere you could see (Acts I–II). Then you make it write whole stories and make that fast
(Act III). The finale is the lab itself: every part you built, standing in one room, and a
tour that follows one word through them all.

## The lab: first five seconds

- **Camera:** high at the intro end, looking down the hall. The intro's alcove is nearest
  and warm-lit; its board already shows a sentence. Acts I–III recede, dimmer, their names on
  the floor.
- **One motion:** a pulsing ring and a **Start here** plate on the intro machine.
- **Left column:** brand, series title, "A lab of machines that together make a real
  language model, one part at a time.", a big **Start here · What is an LLM?** button, and
  the acts list.
- **Hint** (fades after the first orbit): "Drag to look around · click any machine".
- **Hover a machine:** it brightens, and a pill reads "4 · Attention — Act II · Reading the
  whole sentence".
- **Returning visitor:** the button reads **Continue · 5 Word order**, the plate reads
  **Next**, and ✓s show on the floor and in the list.
- **Everything done:** "You built the whole machine." and **Tour the whole machine**, with
  "Follow one word through every part, in the order it meets them."

## Act blurbs

| Zone                                    | Blurb                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Intro · What is an LLM?                 | See a real one write a sentence, one word at a time.                                |
| Act I · A machine that can guess at all | Turn text into numbers, give words a place, and roll for the next one.              |
| Act II · Reading the whole sentence     | Let every word look back, keep order, think, and stack up into the intro's machine. |
| Act III · Making it talk, and fast      | Write whole stories, then make every word cheaper, lighter and quicker.             |

## Intro: What is an LLM?

**Loop** (about 26 s; the lesson ends near 24 s). The words are the model's real greedy
picks, found by the intro probe (slice 02).

1. The opening text lands on the rail as cards.
2. Bars rise: the real chances of each next word after the whole text.
3. The tallest bar lights, and its word flies onto the end of the rail.
4. The same rule, five more times, a little faster each time; the sentence grows.
5. The header plate prints "An LLM guesses the next word, over and over —" and then "— let's
   build one."

- **Brief.** What it is: "This is a real language model, built like the big chatbots but
  tiny, running right here in your browser." Watch: "Watch it guess the next word, add it,
  and guess again until a sentence grows."
- **Caption:** "Give it the start of a story and it scores every word it knows for what
  comes next, then takes the likeliest. It adds that word to the end and guesses again: that
  is all an LLM does, over and over."
- **Technical:** "Chapter 8's 4-block transformer, trained on TinyStories. It predicts
  tokens (word pieces); the bars are its real next-token probabilities after the whole text,
  and here it always takes the top one."
- **Labels:** bars "How likely each next word is" / "Next-token probabilities"; rail "The
  whole text so far" / "Context".
- **Stats:** tokens read while training (TinyStories); weights inside it (this tiny model);
  weights inside it (Llama-3-8B).
- **Your turn:** "Type the start of your own story: it guesses what comes next."

## Act I · A machine that can guess at all

**1 Tokenizer**

- So far: You saw a finished machine write a sentence; now we build one from an empty bench.
- Still broken: A machine can only do arithmetic, and text isn't numbers yet.
- This lesson: Watch text snap into bricks from a fixed box, each stamped with a number.
- But: To the machine, "cat" and "kitten" are just two unrelated numbers.

**2 Embeddings**

- So far: Text now arrives as a row of numbered bricks.
- Still broken: Brick numbers are arbitrary, so "cat" and "kitten" look completely unrelated.
- This lesson: Every brick gets a pin on a map, placed so words used alike land close together.
- But: A pin is a place, not a guess, and "it" lands on the same pin whatever came before.

**3 Output and sampling**

- So far: Every word has a place on a map, near words used like it.
- Still broken: A map is not a guess: nothing yet picks the next word.
- This lesson: The last word scores every word it knows, and the scores load a die that rolls the next one.
- But: Only the last word counts: two different stories ending in "it" roll the very same die.

## Act II · Reading the whole sentence

**4 Attention**

- So far: The machine can guess the next word, but only from the last one.
- Still broken: It forgets everything earlier, so it loses a name from the start of the story.
- This lesson: Every earlier word gets a pipe into the last word, wider the more that word is drawn on.
- But: Swap "dog" and "cat" and the pipes just trade places: the guess is exactly the same.

**5 Word order**

- So far: Every word can now draw on the words before it.
- Still broken: Order is invisible: "the dog chased the cat" and "the cat chased the dog" get the same guess.
- This lesson: Each word carries a clock hand, turned further for each place it sits along the sentence.
- But: The mix is still just a weighted average: nothing works anything out from it yet.

**6 A panel of yes/no questions**

- So far: Words gather clues from earlier words, in order.
- Still broken: Gathering isn't thinking: nothing yet works anything out from the clues.
- This lesson: Each word's clues pass a panel of yes/no questions, and every yes pushes toward the next word.
- But: Chain four panels in a row and the word's arrow dies after the first.

**7 A river and a volume knob**

- So far: A block can gather clues and work something out from them.
- Still broken: Chain blocks one after another and the word's arrow fades out by the second.
- This lesson: A river runs past every station, and each pours in what it worked out instead of replacing it.
- But: One pass through four stations is still a shaky guess.

**8 Many readers, one assembly line**

- So far: Signal now survives a whole line of stations.
- Still broken: One reader looking once still leaves the machine unsure.
- This lesson: Each block gets four readers looking for different things, and blocks stack into an assembly line: the intro's machine.
- But: One pass down the line writes one word, so how did the intro write a whole sentence?

## Act III · Making it talk, and fast

**9 Write a word, read it all again**

- So far: You've built the intro's machine, and one pass writes one next word.
- Still broken: A story needs hundreds of words, not one.
- This lesson: Watch it add each word to the end and start over: exactly how the intro's sentence grew.
- But: Every new word rereads the whole text from the first word, so the cost keeps climbing.

**10 Sticky notes**

- So far: The machine writes whole stories, one word at a time.
- Still broken: Every new word rereads the whole text from the very first word.
- This lesson: It pins sticky notes about each word to a rack, and later words read the notes instead.
- But: Every new word still waits on a trip through all the weights.

**11 Batching**

- So far: With its notes, each new word costs just one word's work.
- Still broken: That word still hauls every weight to the GPU's arithmetic, which sits mostly idle.
- This lesson: Like a bus, one trip carries a hundred riders for about the price of one.
- But: Every trip still hauls all the weights, and at 16 bits each the cargo is heavy.

**12 Quantization**

- So far: Many conversations now share each haul of the weights.
- Still broken: Every weight still rides at 16 bits, and the cargo is heavy.
- This lesson: Like a lower-resolution photo, rounding each weight to 8 bits keeps the picture in half the space.
- But: Lighter cargo or not, every trip still brings back just one word.

**13 Speculative decoding**

- So far: The cargo is half as heavy.
- Still broken: Each slow trip through the machine still brings back just one word.
- This lesson: A small junior drafts a few words, and the senior checks the whole draft in one read.
- But: Every check runs the whole senior, and a smarter senior means a slower one.

**14 Mixture of experts**

- So far: Words come back several at a time, on lighter cargo, in shared trips.
- Still broken: A smarter machine needs more knowledge, but every extra weight slows each word.
- This lesson: Like a hospital's triage desk, a router sends each word to just 2 of 8 expert bays.
- Closing line: That's every part: head back to the lab and watch one word run through them all.

## Inside a machine (left column)

- **Breadcrumb:** "Lab › Act II › 4 Attention", and "← Back to the lab (Esc)".
- **Brief rows:** "So far", "Still broken", "This lesson", then **Start the lesson** (Enter).
- **Locked note** (no controls drawn): before Start, "Your turn unlocks when the lesson ends.
  Then you can type your own text, try an example or turn the knob." (only the steps this
  chapter has). While playing: "Watching · 4 Attention", the progress bar, Pause and Skip.
- **Your turn:** the controls fade in; a "But…" card above Next shows the hand-off; Next
  reads "Next · 5 · Word order".
- **After chapter 14:** Next becomes **Back to the lab · Tour the whole machine**.

## Share

`/c/15/` redirects to `/`, with a lab card: "The lab: every part of an LLM, one machine at a
time".
