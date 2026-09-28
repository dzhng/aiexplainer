# Choices ledger

These are the decisions the implementation made where the plan was silent. Each entry
is checked against the shipped code, not against the pass where it first landed. An
entry that a later pass replaced shows only where it ended up. The recorded decisions
(D1–D42, L1 and the human notes) live in the [README](README.md), not here.

Entries are grouped by verdict. Within each group, the ones the human is least likely
to share come first. Each entry stands alone. "When" names the build slice where the
choice was made; the slice files themselves are gone, and this ledger keeps what they
decided. Four named passes also appear: the **polish pass** (a visual pass over every
chapter after all were built), the **whole-spec review** (a behaviour-neutral cleanup of
duplicated code), the **Codex review** (an independent correctness review by a second
agent), the **close** (this final audit), and the **amendments** (the human's
post-release requests, 2026-09-28; see the README).

- **Incidents and post-hoc selections** (7): things the human should know happened.
- **Defaults for the human to confirm** (3): taste or identity calls held
  provisionally.
- **Acceptable, with a known cost** (12): trade-offs that shipped with a limit.
- **Sound** (70): choices the agent stands behind with no reservation.
- **Amendments** (37): choices made while landing the human's post-release requests,
  each with its own verdict (7 defaults to confirm, 5 acceptable with a cost, 25 sound).

## Incidents and post-hoc selections

1. **The first deploy accidentally went to production (2026-09-27).** When the Vercel
   project was first created, it had no git connection, and in that state `vercel deploy`
   targets production by default. The explainer was therefore briefly public at
   `aiexplainer-red.vercel.app` before anyone had approved a release. It was removed
   within minutes, and every later deploy used `--target=preview` until the human
   authorized the real release. Consequence: the site may have been publicly reachable
   for those few minutes. The later real release was a deliberate fast-forward of `main`.
   When: slice 12. Verdict: a mistake, remediated.

2. **Two probe metrics were changed after their first measurement.** A probe is the
   test that decides whether a tiny model really shows its chapter's effect (D25).
   - Chapter 6 (`mlp`): the first metric was the mean of each prompt's relative drop in
     answer probability when neurons are switched off. It measured 0.12 with the 16 most
     active neurons off and −3.8 with the whole MLP off, because prompts where the model
     never knew the answer (p ≈ 0.001) dominated the mean. It was replaced with the drop
     in total answer probability: 94.9% with those 16 neurons off, 99.3% with the whole
     MLP off.
   - Chapter 7 (`residual`): the first metric, the cosine between the embedding and the
     top of the stream, measured 0.064 (`residual`) and 0.0 (`noresidual`). It was
     replaced with the residual-norm trace the model contract actually names (last-layer
     RMS ÷ embedding RMS): 21.5 with the residual, and exactly 0 without.

   The agent stands behind both new metrics as the better measure, but they were picked
   after seeing a number, so the human should know. When: slice 17.

3. **Chapter 4 teaches name recall, not pronouns.** The plan's example was a pronoun
   ("she") looking back at a character. The one-layer `attn` model fails that: its
   attention on the character is 0.58× what an even spread would give. A second prompt
   set was then added, where the next word is a character's name seen earlier, and that
   one passes at 2.98×. Chapter 4's example and copy use name recall and make no pronoun
   claim. Both probe sets and their results are recorded in the `attn` manifest. The
   second set was added after the first failed, so the human should know it was not the
   plan. When: slice 16. See also the README human note.

4. **Chapter 13's loop replays a hand-picked seed.** Chapter 13 (speculative decoding)
   shows three rounds of a junior model guessing words and a senior model checking them.
   Seed 11 out of 1–12 was chosen because its three rounds show all three outcomes: a
   bonus word, a correction and an early reject. The rounds themselves are real model
   output. The stat chips don't use this run; they show averages over 40 held-out stories.
   The code (`SPEC_RUN` in `chapters/data/speculative.ts`) and this entry record the
   pick. When:
   slice 33.

5. **Chapter 8's prompt was chosen to show the effect.** The prompt is "One day, a little
   bird was looking for". On "Once upon a time…", three of layer 0's four attention heads
   look at the same word, which hides the chapter's point that different heads look for
   different things. The output is still real (D25). When: slice 28.

6. **Chapter 10's loop shows a 4-word window, because larger windows change nothing
   here.** At window sizes 8, 6 and 5, this prompt's continuation doesn't change, so
   the loop's demo uses 4, where the model writes "girl named Lily." instead of "boy
   named Tim.". Since the amendments the window is also the chapter's knob (4–8 words or
   all); each stop is a real generation, and at 5–8 the scene says the words stayed the
   same. The caption says a window changes outputs and is not how Llama-3-8B runs.
   When: slice 30 and the amendments.

7. **Chapter 2 shows the best-case word pairs, and its map is fitted to them.** The 3D
   map shows 30 word pairs (the probe pairs whose partners are closest), and the 2D/3D
   projection is fitted to those 60 words, not all 4,096. That keeps pairs visibly tighter
   (pair distance ÷ mean distance: 0.30 versus 0.37 with a projection fitted to all
   4,096 words). The stat chip still reports the honest average (96.7% of partners are
   closer than a random word), and the help panel discloses the fit (`help.notes`).
   When: slice 20.

## Defaults for the human to confirm

1. **The brand is a placeholder, and there is no favicon.** The brand slot shows the
   text wordmark "dzhng" next to a placeholder two-block mark (`BrandMark` in
   `hud/icons.tsx`). The app, the lab and every share page use an empty data-URI icon (`data:,`), which exists
   only to stop the browser's automatic `/favicon.ico` request from logging a 404 (which
   the harness treats as a failure). The plan deferred brand art to the release slice,
   but none was made, so production ships the placeholder. Real brand art is a drop-in
   change to `BrandMark`, the favicon link and the link-preview cards. When: slices 01,
   04 and 04b.

2. **The airsup reference frames are public.** The airsup.ai frames in this folder's
   `assets/reference/` were the visual standard the look was matched against. They
   became public when the human asked for a public GitHub repo. They are small, credited
   design references, but they are someone else's screenshots, so delete them if they
   are unwanted. When: the GitHub link (2026-09-27).

3. **"Follow on X" links to https://x.com/dzhng.** The only owner is `X_PROFILE` in
   `look/brand.ts`, used by the HUD and the fallback page. It matches the dzhng brand
   (D23), but no one named the handle explicitly. When: slice 04.

## Acceptable, with a known cost

1. **The left column tightens, then scrolls, in short windows.** Every control lives in
   one left column under the caption (the amendments), so the scene keeps the whole
   right side at any width. The cost is height. Below 920 px the column tightens (no
   series line, a one-line title, snugger panels), and below 840 px the caption and
   chips drop a size. So every chapter fits at 1440×900 and the fullest, chapter 3, at
   1200×800. Shorter windows (1280×720) scroll the column, with a faded bottom edge as
   the cue. The target is a desktop screen (D20). When: the amendments.

2. **Some visual nits shipped.** Each was judged smaller than the cost of fixing it:
   - Chapter 4: thin low-weight pipes cross back-row words at the hero angle (a
     projection effect), and during the word swap the pipes regrow instead of moving.
   - Chapter 5: the last clock dial washes out under bloom.
   - Chapter 2: the noun cluster's pins crowd at the hero angle, because those are the
     words' real positions; only the first word of each crowd is written (see
     Amendments 33), and arrows passing in front of a word hide parts of it.
   - Chapter 3: on one frame, the word "comma" hides behind "period".
   - Chapter 14: some camera sweep angles are blocked by room geometry.
   - At some back angles, labels point at parts that are hidden.
   - Chapter 14's third stat chip overflows the 384 px column (its label and value run
     past the edge). This predates the amendments.
   - Chapter 0's "The only word it looks at" label sits over the bottoms of the last
     few bars. Those bars are the near-zero shares, and the label's placement is
     automatic (it avoids text, not bars).

   When: slices 13, 20, 25, 30 and 34, and the polish pass.

3. **Chapter 14 says "Llama-3-8B is not a mixture of experts" through its chip and help,
   not its caption.** The copy rule asks MoE numbers to name their assumption. The Llama
   chip reads "per word, as 8 experts (hypothetical)", its help source says "if
   Llama-3-8B's MLPs were split into experts (hypothetical)", and chapter 15 states it
   outright. The caption talks only about the tiny model. Adding a caption sentence
   would mean re-recording chapter 14's media for a claim the chip already qualifies.
   When: slice 34, confirmed at close.

4. **The generation and KV-cache chapters' prompt chips cite the model's validation
   loss.** Every prompt chip (scenario) must cite a probe (D25). Chapters 9 and 10
   show rereading and note reuse, which happen for any prompt, so there is no
   prompt-specific effect to measure. Their two prompts cite `full`'s validation loss
   instead of a probe made for them. When: slices 29 and 30, confirmed at close.

5. **Chapter 15's tour gives each station 1.6 s.** The finished-machine chapter tours
   15 stations (one per earlier chapter) in a 29.6 s loop, near the 30 s loop cap (D24). The busiest stations show
   more text than 1.6 s allows. The stack station uses its wide shot instead of the hero
   shot, so the whole assembly line fits. Each 1.6 s is a 0.45 s camera move plus a 1.15 s
   hold. When: slice 35.

6. **`bun run verify` only runs on a Mac and takes about 2 minutes.** It ends with the
   training tests, which train small models on Apple's MPS GPU backend and fail when MPS
   is missing. The alternative, a separate slow-test script, was never needed because
   there is no CI. The Python pins are exact (torch 2.14.0, tokenizers 0.23.2, numpy
   2.5.3, pytest 9.1.1, jsonschema 4.26.0). When: slices 01 and 16.

7. **Some per-frame work was left in place.** The whole-spec review collapsed about 20
   passes' duplicated helpers into single owners. It left alone a few per-frame
   allocations (some kit placement helpers), camera
   matrices computed twice per frame (once by the stage and once by the renderer), and
   shader and orbit constants kept in code (each with one owner). Every frame budget is
   met, and changing these would not have been behaviour-neutral. When: the whole-spec
   review.

8. **Test fixtures cost some repo size.** The nine random-init parity fixtures take
   2.6 MB, because every token table spans the full 4,096-word vocabulary. The chapter-3
   scene fixture is 279 kB, because it stores the full logits that the honesty test
   needs. Both are small against the models. When: slices 15 and 21.

9. **The `moe` model is 4.6 MB, over the early per-model 4 MB guide.** That guide was
   scoped to the first three trained models. The binding limit is the whole ladder's
   25 MB, which a bun test enforces. Slice-17 models use tied embeddings (the input and
   output word tables share weights), apart from `mlp`, to stay inside it. When:
   slice 17.

10. **Two fallback videos trade quality for size.** Every video uses the best quality
    setting between H.264 CRF 18 and 33 that fits 3 MB. The stack and finished chapters
    needed CRF 24 and 27, so they are visibly softer than the rest. When: slice 36.

11. **Chapter 3 writes punctuation as words.** The die shows "period" and "comma"
    instead of "." and ",", because the bare marks were unreadably small. Cost: the long
    words can overlap on one frame (see entry 2 in this group). When: slice 36.

12. **The production `vercel.json` keeps a `/lab/*` rewrite.** Lab pages are only built
    for previews (D40), but one `vercel.json` serves both targets, so in production the
    rewrite points at a file that doesn't exist and `/lab` returns a 404. It is harmless.
    When: slice 12.

## Sound

Each entry carries a subject tag: [data], [arith], [app], [renderer], [scene],
[runtime] or [deploy].

1. **[scene] Chapter 3's temperature has both a live scene note and a moving slider.**
   The loop drives the die's temperature. The HUD slider plays along (`SliderDef.loop`)
   until the reader moves it, and a scene note shows the live value. `snapSlider` removes
   float residue from the displayed value. When: slice 21 and the polish pass.

2. **[scene] The chapter-15 tour waives the five-label cap.** D18 allows at most 5
   labels per chapter. The toured chapter defines one label per station, but only the
   in-view station's label is ever shown, so the reader never sees more than one.
   `validateChapter` skips the cap only when a chapter has a `tour`. When: slice 35.

3. **[app] Scene anchor ids are declared in `chapters/scenes.ts`, not beside each
   builder.** An anchor is a named point on a part that a label or the camera can target.
   Declaring the ids in the chapter layer lets `validateChapter` check a chapter's anchors
   without loading renderer code; each builder must place a part at every anchor listed
   there. Moving the list into the builders was considered and declined, because the
   list then has no single owner the validator can read. When: slice 03.

4. **[deploy] The browser harness runs against the Vite dev server.** It starts in
   seconds instead of needing a production build per run. It binds to 127.0.0.1 on a
   random free port, because a fixed port was once silently served by another local
   project. Loopback is a secure context, so WebGPU is still exposed. `--base` runs cover
   the deployed build. When: slice 01.

5. **[scene] Chapter 0's loop runs 20 s: the rule twice, then the failure.** It walks
   once → upon → a, where each word is the previous word's top successor, and then
   "onse", a misspelling the counts table never saw, so no bars appear and a "never seen"
   note explains why. A `barsWord` channel lets the bars lag the card. A test checks the
   successor chain and that "onse" is not in the vocabulary. When: slices 10 and 11.

6. **[scene] Chapter 11 shows the batching knee at batch 329, not the ridge of about
   295 FLOP/byte.** The knee is the batch size at which a decode step's arithmetic time
   equals its memory time (`ARITH.computeBoundBatch`). It is the point where "the bus
   seats fill", which a reader can compare with the seats; FLOP/byte has no seat meaning.
   Prefill is a loop beat, not a scenario, because a chapter with no model has no probe
   for a scenario to cite. When: slice 31.

7. **[scene] Chapter 5's clock hands turn at pair 5's real RoPE angle.** RoPE rotates
   pairs of numbers by position, and each pair turns at its own speed. Pair 5 turns about
   22° per word, which is visible without scaling. The slowest pair would have needed a
   disclosed visibility boost. The shown difference between word orders (7.45%) equals
   the probe value to 1e-12. At the loop seam, the hands shrink with their words instead
   of unwinding. When: slice 25 and the polish pass.

8. **[scene] Chapter 4's needle shows the real angle change of the focus word's vector
   toward "Mia" (90.1° → 74.2°).** It is a measured value, not an illustration.
   When: slice 24.

9. **[scene] Chapter 12's fp16/int8 switch is the slider ("Bytes per weight").** Its
   drift chip reads "how far its guesses drift" (its Technical line and the help name it
   as the KL divergence). Its two prompt chips are the `full-q8` prompts picked by measured KL. The
   weight strip reads raw tensor slices through one `weights` request (`weightSlice`).
   When: slice 32.

10. **[arith] Chapter 13's speedup chip is computed live from the slider's k.** It uses
    the held-out acceptance rate α and the drafter/full cost ratio (the `draft-cost` probe,
    the models' weight ratio) in Leviathan et al.'s Theorem 3.8 (`specSpeedup`). The label is "speed vs no junior, drafting included",
    so values below 1× read correctly (0.912× at k = 8). When: slice 33, the Codex
    review, and the final /review (which replaced a hand-typed ratio with the probe).

11. **[scene] Chapter 14's router choices come from layer 1 of 4.** The usage
    histogram comes from `expert-usage-<e>` evidence measured on held-out text. The chips
    make no claim that experts specialise, because none was measured. When: slice 34.

12. **[scene] The finished machine owns no chapter parts.** Each station is its own
    chapter's builder and run, copied into one scene (prefixed, offset and scaled) on a
    5-wide serpentine floor. Its only own part is the floor route. A test pins "union of
    stations, nothing twice". The tour follows one word's path through the machine, then
    the serving tricks. Stage `update` can steer the camera, and orbiting hands control
    back to the reader. When: slice 35.

13. **[scene] Chapter 9's work counter adds each step's real fed token count (+10,
    +11, …).** The failure beat spells out the sum, and the Llama chips come from
    `rereadTokens` (32,896 tokens reread to write 256) and `maxContext`. It counts
    operations, not time (D27). The loop writes all six words (its slider was removed in
    the amendments). The text-line
    helpers are exported from `builders/generation.ts` for chapter 10. When: slice 29.

14. **[scene] Chapter 10 shows GQA as unshared notes that then drop away.** GQA
    (grouped-query attention) lets 4 query heads share 2 key/value heads. The scene first
    shows what unshared readers would store, then drops the extra. The memory chips pair
    the tiny model's measured 2.05 kB per token with Llama-3-8B's 131 kB. When: slice 30.

15. **[scene] Chapter 13's correction takes the first rejected slot, and rejected tiles
    drop out of the row.** The slider is k (1–8), and the run holds seeded rounds for
    every k. When: slice 33.

16. **[scene] Chapter 4's pipe width is linear in the attention weight.** With pipe
    area proportional to weight, an unprimed reviewer couldn't tell 22% from 7%. A CPU
    test pins radius × width scale to the weights. The focus word's pipe to itself is
    kept, so the widths sum to 1. `<bos>` shows as "start". Flow pulse brightness
    follows each pipe's weight relative to the widest, at 1.4 cycles per second. When:
    slices 22–24.

17. **[scene] Chapter 4's sealed future words are the model's own greedy
    continuation.** Their attention weights are exactly 0. The failure beat swaps "cat"
    and "dog" and gets bit-identical logits ("cat", 35%) (D35). When: slices 23–24.

18. **[scene] Chapter 3's die is a barrel whose faces are exactly as wide as their
    probabilities.** It shows the top six words plus "every other word" at the current
    temperature. The stop angle comes from the seeded generator, so the landed face
    equals `sample()`, which a test checks. The failure beat rolls the identical die for
    two stories that both end in "it", because the model sees only one word. When:
    slice 21.

19. **[scene] Chapter 2's map uses PCA directions 1–3, with height as the third.**
    Arrows start at the zero vector's projection. Typed words are looked up with a
    leading space (as if mid-sentence), up to 8. Chapters 1–3 share one table builder.
    When: slice 20.

20. **[scene] Chapter 1's brick colour encodes merge order.** Pale is a single byte,
    yellow is an id below 1024 (an early merge), and coral is a later merge. A test proves
    ids follow merge order. When: slice 19.

21. **[scene] Chapter 7's two val-loss chips use a `nats` format and dedicated
    evidence.** `val-loss-residual` and `val-loss-noresidual` were written by re-running
    the probes (`--probe-only`), not by retraining. `noresidual` never learns (val loss
    8.3 = ln 4096, a uniform guess), which is the chapter's intended visible failure.
    The river gets flowing currents. When: slices 17 and 27, and the polish pass.

22. **[scene] Chapter 8's zoom-out is `ChapterDef.pullBack`.** D5 allows one brief
    zoom-out ("this repeats 32 times"). It blends a shot into the arrival pose, so the one
    camera-tween owner is reused. The head pipes use the shared pipes kit. Its bloom was
    measured at 0.52–0.58% near-white pixels (about 1.05% elsewhere) and judged dense,
    not hot. The title is "Many readers, one assembly line". When: slice 28 and the
    polish pass.

23. **[data] The counts model keeps 20 successors for each of 8,192 words (1.84 MB).**
    99.9% of held-out words are in its vocabulary, and 71.9% of held-out next words are
    in the table; bigger tables gain little. Its probabilities are shares among the kept
    successors, not true corpus shares, because the contract requires probabilities that
    sum to 1; the chapter-0 copy says "kept counts". When: slice 02.

24. **[data] Chapter 0's word splitter lives in the counts manifest.** The regex
    `[a-z]+(?:'[a-z]+)*|[.!?]` after lowercasing is stored as `tokenizer.pattern` and
    `replace`, and a shared fixture pins that Python and TypeScript split alike. Commas
    and quotes are dropped. The chapter-0 probe prompt is the single word "upon" (p("a")
    = 0.999), because the counts model reads one word. When: slices 02 and 10.

25. **[data] The shared vocabulary is 4,096 tokens.** Chapters 4–8 draw a pipe or
    clock per token, so tokens should mostly be whole words. At 4,096, 99.3% of the 2,000
    most common words are one token; at 2,048 only 48.5% are. llama2.c also uses 4,096.
    When the trainer compares vocabulary sizes, it trains byte-level BPE once at
    the largest size and truncates it for each smaller one, instead of retraining per
    size (`choose_vocab_size`; a test checks truncation keeps the first merges). When: slice 14.

26. **[data] The drafter is `drafter-64`.** Acceptance is Leviathan's β averaged over
    teacher-forced held-out positions, and its cost is the ratio of parameter counts.
    On 40 held-out stories disjoint from selection, drafter-64 gets α 0.601 and an
    expected 1.24× speedup; drafter-96 accepts more (α 0.643) but its cost leaves 1.03×.
    drafter-96 was removed from the ladder (1.0 MB) and its parity fixture removed at
    close; its numbers stay here. When: slices 17, 33 and 36.

27. **[data] The attention sum runs in a fixed order, highest score first.**
    Floating-point addition depends on order, and D35's "shuffling earlier words changes
    nothing" must hold bit for bit. When: slice 15.

28. **[data] Every probe measures the shipped weights.** Probes run on the exported f16
    weights, and the D35 order probe runs on the TypeScript runtime, so what is measured
    is what ships. When: slice 17.

29. **[data] Embeddings start from N(0, 0.02), GPT-2's initialisation.** With N(0, 1)
    and tied embeddings, training starts at a loss of about 30. The random-init fixtures
    were regenerated. When: slice 16.

30. **[data] The trace records each layer's attention, MLP, router and both residual
    additions separately.** Each layer adds to the residual twice, and one record per
    layer would blur them. When: slice 15.

31. **[data] The KV cache has its own module, and a cache smaller than the context is a
    ring.** `packages/llm/src/kvcache.ts` evicts the oldest positions. Tests check that
    cached equals uncached and that the ring equals a windowed reference. When: slice 30.

32. **[data] `q8_0` is an f16 scale plus 32 int8 values per group.** TypeScript
    dequantization matches Python bit for bit. When: slice 17.

33. **[data] Chapter-1 evidence lives in its own `evidence.json`.** `tokenizer.json` has
    no manifest, and adding evidence to it would change its frozen hash. For the same
    reason, the frozen generated JSON (models, schemas, training fixtures, probe prompts)
    is excluded from the formatter.
    When: slices 02 and 14.

34. **[data] Special tokens are added by id only.** `encode` never turns literal
    "<bos>" or "<eos>" text into special tokens, and every prompt starts with `<bos>`
    (`promptTokens`). When: slices 14 and 15.

35. **[data] Model tensors are 64-byte aligned and little-endian.** The word vocabulary is
    a zero-padded u32 code-point tensor, so it fits the contract's dtypes. `loadModel` is
    async, because browsers only offer SHA-256 through the async `crypto.subtle`. When:
    slice 02.

36. **[data] Training on MPS is checked to 1e-5, not bit for bit.** Apple's MPS backend
    is not bit-deterministic across processes; CPU runs are. Trained parity fixtures keep
    every 16th logit plus the top 8 (about 100 kB each). When: slice 16.

37. **[data] The forward pass is plain JavaScript loops.** A benchmark at twice
    `full`'s width (d = 256, random weights) measured 2.9 ms per prompt token and 3.9 ms
    per cached token, far under the 50 ms budget, so no GPU or WASM path was needed.
    When: slice 15.

38. **[data] `rng.ts` (mulberry32) is the one source of seeded randomness.** It is
    injected everywhere. When: slice 14.

39. **[arith] Every production speed is a roofline ceiling.** A step costs
    max(bytes ÷ bandwidth, FLOPs ÷ dense FLOP/s). FLOPs per token are 2 × matmul
    parameters plus attention (4 × layers × heads × head size × context), following
    kipply's inference arithmetic. Decode has a per-sequence and a whole-batch number,
    both with an optional precision. When: slice 18.

40. **[arith] The MoE counterfactual is a named assumption, `llamaAsMoe()`.** Attention
    and embeddings are shared, and each expert is a full copy of the MLPs. It is labelled
    hypothetical everywhere it appears. When: slice 18.

41. **[arith] Units are branded types (`Bytes`, `Seconds`, `TokensPerSec`).**
    Compile-time tests check that they cannot mix. When: slice 18.

42. **[app] Chip numbers show 3 significant figures, with decimal SI bytes.**
    Examples: "131 kB", "16.1 GB", "99.9%"; whole counts under a million are written in
    full with grouping. Decimal matches the H100 spec sheet's "80 GB". Seconds and nats
    are their own formats. Shares written in the scene never round to a false 0% or
    100%; they show "<1%" or ">99%". When: slices 04, 11, 18 and 27.

43. **[app] Stat chips bind to the slider or a probe (`ArithArg`).** A chip can feed the
    slider's value or a probe's value into a formula, so no number is typed in by hand
    (D25). `MODEL_METRICS` is the one owner of model metrics, and `validateChapter`
    rejects a model stat on a chapter with no model. When: slices 04 and 31.

44. **[app] The loop plays the slider until the reader moves it.** `SliderDef.loop`
    plus `AppState.sliderSet`: the HUD samples the loop channel at 10 Hz, and the first
    reader input takes over, as D32 requires. Used by chapters 3, 10, 11 and 12. When:
    slice 31 and the amendments.

45. **[app] Only scene controls pause the loop.** The slider, a scenario and
    typed text pause it. Reading aids (Analogy/Technical, the Technical line, help) only
    change text. Arriving at a chapter resets its slider, scenario, Technical and typed
    text; the label reading and help stay as the reader left them. A `loopEpoch` counter
    restarts the loop, so the reducer stays pure. Keys: ←/→ step chapters, Space plays or pauses, ? toggles help, Esc closes it. When: slice 04.

46. **[app] Chapter validation is hand-written, not zod.** Chapters are TypeScript, so
    the compiler checks shapes. `validateChapter` checks what types cannot: loop length,
    caption budget, and unknown anchors, shots, colours, kit primitives and scales. It
    returns a list of problems. Timelines are cyclic: after the last keyframe, a value
    blends back to the first, so the loop seam is invisible (D24). When: slices 03 and 13.

47. **[app] The tokenizer counts as a chapter "model".** A `LoadedTokenizer` is a
    `ModelSource`, so stats, the HUD text box and runs treat chapter 1 like any other
    model chapter. The app hands the HUD only the model that matches the current chapter,
    which fixed a page error on ←/→. When: slice 19.

48. **[app] The HUD is the holo-tactical game UI, taken whole (the human's pick).** Its
    cyan is a HUD-only `hud.accent`, so restyling the HUD can never change the scene.
    Chakra Petch (600 and 700 only) is used for headings, controls, chips and labels;
    body copy stays in Inter for legibility; numbers use JetBrains Mono. All are
    self-hosted, latin subset (plus Inter Greek for Σ), OFL-1.1. When: slices 04 and 04b.

49. **[app] Labels are sentence case, not the mock's all caps.** Caps overflowed the
    renderer's 220 px label box. When: slice 04b.

50. **[app] HUD motion is brief and skippable.** Stat chips count up over 400 ms and
    then show the exact settled text. Panels slide in over 360 ms on arrival. A held
    or stepped clock, or a reader who asked for reduced motion, skips both. The help panel plate is opaque. When:
    slice 04b.

51. **[app] TinyStories is credited once, in the help panel.** It covers every chapter,
    so it isn't repeated per chapter. The help panel also gives each chip's source, and
    `help.notes` holds per-chapter disclosures. When: slices 04 and 20.

52. **[app] Share copies the chapter's `/c/N/` link.** That page has per-chapter
    link-preview metadata (D34). Both copy buttons (the HUD's Share and the fallback page's
    "Copy link") go through `copyOrShow`, which shows the link to copy by hand when there
    is no clipboard or access is refused. When: slice 12, the Codex review, and the close
    (the HUD had its own direct clipboard call until then).

53. **[app] The harness drives the UI with real key presses.** The probe
    (`window.__explainer`) also exposes `goto` and `setUi` for the app, and `verify.ts`
    offers `--press` and `--ui`. When: slice 04.

54. **[runtime] Each model chapter's run is one file, `runtime/runs/<scene>.ts`.**
    `computeRun` dispatches through the `RUNS` table in `scene-run.ts`. The worker and
    the in-process session share one inference core, `createInference`. When: slices
    26–28.

55. **[runtime] Every inference request names its model.** The worker keeps each loaded
    model by id and has no "current" model. `session.run` takes an options object
    (trace, window, model, mlpOff). Each run's calls are wrapped in `sessionScope`, so a
    superseded chapter's late replies are dropped. Cancel messages go only to
    generations. When: slices 26–28 and the Codex review.

56. **[runtime] Speculative decoding stops at an accepted `<eos>` and checks context
    room before each round.** `speculativeStep` throws `RangeError` when the context is
    full. When: the Codex review.

57. **[runtime] A GPU failure after a successful adapter probe shows the video
    fallback.** `withGpu` destroys the partial GPU root, and `App.onUnsupported` switches
    to the fallback. When: the Codex review.

58. **[runtime] The arrival move is a 2.5 s smoothstep from `room-wide` to the hero
    shot.** The loop clock is paused until landing (D42). `?clock=step` lets the recorder
    advance frame by frame; `clockIsDriven` (held or stepped) skips HUD motion and the
    arrival move, because a looping video must not open with a one-off camera move. When:
    slices 11c and 12.

59. **[renderer] Shaders are WGSL templates resolved by TypeGPU; pipelines are raw
    WebGPU with every bind-group index pinned.** Structs come from the TypeGPU schemas,
    and frame encoding stays allocation-free. This departs from the renderer skill's "pin
    only group 0", which assumes TypeGPU-managed pipelines. Group 0 carries the frame and
    look uniforms, and `setLook()` swaps a look without recreating the renderer.
    `LookConfig` is linear numbers only; the app's `look.ts` converts tokens. When:
    slices 05–09.

60. **[renderer] Part transforms are per-frame data.** The renderer repacks instances
    every frame without allocating, and `revision` signals only a change in structure.
    GPU packing, labels, occluders and crops all read each part's own `transform`. When:
    slices 05, 10 and the amendments.

61. **[renderer] Label occlusion is re-tested when a scene's layout changes.** A builder
    bumps `SceneDesc.layout` when parts move, and the stage rebuilds occluders on a
    revision or layout change. Translucent parts never occlude, meshes are tested
    per triangle (node boxes were too coarse), and tube
    occluders ignore stretch along the path (a stretched unit tube had occluded the
    whole scene). When: slices 09, 10, 19 and 26–28.

62. **[renderer] Labels try up-right, up-left, down-right, then down-left.** They take
    the first side that avoids other labels, the scene's written text, HUD panel rects
    and the screen edge. The written text is drawn in the world (Amendments 29), and the
    renderer hands labels its screen boxes (`Renderer.textRects`), so D18's label cap
    still holds. Labels snap to whole pixels, so captures are deterministic. When:
    slices 09, 10, 11 and 36, and the amendments.

63. **[renderer] The room is lit by baked vertex colours.** R is ambient occlusion,
    and G/B are baked warm and cool practical light tinted by
    `look.room.practicals.*.spill`, because the renderer has no local lights and AO alone
    left the room black. The environment is drawn in its own slot, never as a part, so it
    never occludes labels. Its depth is read-only. `OrbitLimits.bounds` keeps the camera
    in the room. When: slices 07 and 11b.

64. **[renderer] Specular reflects the room gradient analytically, and lights have an
    apparent size.** Metal and glass didn't read with direct light alone; this is a
    lightweight stand-in for image-based lighting. Glass has no diffuse term, and its
    absorption rises toward grazing angles. AgX tonemapping gets a saturation knob (1.25)
    so glows keep their colour. The human approved the look. When: slices 07–08.

65. **[renderer] The floor light pool is a long soft falloff stretched 1.6× along the
    ceiling tubes (`lights.pool.stretch`).** It replaced a disc that read as a stage
    spotlight. The room's back wall left of the window stays plain, because the HUD title
    sits over it. When: the polish pass.

66. **[renderer] Contact shadows are per foot for subjects on legs.** Solid-bodied
    subjects keep one soft blob. The shadow material's specular is 0, so it only
    darkens. When: slice 11c and the polish pass.

67. **[renderer] Bloom starts at half resolution, with the mip count computed from the
    frame size.** GPU timing is opt-in (`timing: true`, `receipt.gpuMs`). When: slices 08
    and 09.

68. **[renderer] Tubes carry a per-vertex axis and flow coordinate, and identical tubes
    share one geometry.** Vertices are 48 bytes. The GPU scales the radius by
    `widthScale`, and a content-keyed cache lets repeated tubes (such as brick studs)
    instance. When: slices 19 and 22.

69. **[renderer] Props export without UVs, and mesh materials bind by node name.** No
    UVs keeps Blender builds byte-reproducible. A mesh's material is the preset named by
    a dotted segment of its node name (the last segment first), else the glTF material
    name. The counter board
    became a tally board on two posts, because the first design read as a monitor. When:
    slice 06.

70. **[deploy] Media is recorded locally and committed.** Vercel's builders have no
    WebGPU Chrome, so `bun run --cwd apps/explainer media` records under `public/media/`,
    and a test fails when a chapter has no media. The fallback video shows the scene only
    (the HUD is hidden but laid out), cropped to the safe rect, because at phone width
    the whole app repeated the title as unreadable text. The link-preview card is the
    whole app, laid out at 1440×756 and scaled to 1200×630, because an uncrowded scene
    beats larger text. The poster is the first frame, and repeat recordings are
    byte-identical. Share pages redirect with both a meta refresh and
    `location.replace`, and their image origin is `SITE_URL`, else `https://$VERCEL_URL`.
    Small screens (under 900 px, or a touch-only pointer) and missing WebGPU get the
    fallback, with a device line that differs by reason. `main` is Vercel's production
    branch, and a release is a merge into `main`; the lab entry is left out when
    `VERCEL_ENV=production` (D40). When: slices 01, 12 and 36.

## Amendments

The human's ten post-release requests (README, "Amendments after release") left these
choices to the implementation. Each names its verdict.

1. **The story panel sits under the caption in the left column, not in a right-hand
   column.** Every shot frames its machine centre-right, so a tall right column would
   cover half of most scenes (chapter 0's board runs to x ≈ 1330 at 1440 px). The left
   column already held the reading panels, so the story reads on straight after the
   caption. Cost: height (see "The left column scrolls in short windows"). Verdict: a
   default for the human to confirm.

2. **The LIVE light is green, the room's own status-light colour.** A new HUD token,
   `hud.live` (#4dff9a), is used only for the light and its word. Cyan was already
   every control's colour, and amber marks scales and numbers. It pulses only when HUD
   motion is allowed, so held-clock captures stay still. Verdict: a default for the
   human to confirm.

3. **Chapter 5's Try chips are the two orders of the dog/cat pair; the olive and pilot
   pairs are no longer chips.** Each chip is one order of the measured pair, so flipping
   between them shows different pipes and a different guess. The olive and pilot pairs
   were only useful with the order slider, which is gone: as chips they showed their
   first order only. They remain in the `rope` model's measured probe set. Verdict:
   acceptable, with a known cost (two fewer examples).

4. **The receipt never shows time.** The request allowed the browser's wall time "on
   your device". It was left out: only `runtime/clock.ts` may read the wall clock, and a
   number in milliseconds next to a model name reads as speed (D27). The receipt names
   the model with numbers read off it: the words or pieces it knows, or its layers and
   weights. Chapters 0 and 1 are never called language models. Verdict: sound.

5. **Chapter 0's loop inputs are whole texts, like the reader's.** "once", "once upon",
   "once upon a", then "onse" on its own as a fresh text. A test pins that each text
   adds the model's own top pick for the last word (O2). The earlier words sit fixed on
   the rail, so while the card slides out and back the text stays readable. Verdict:
   sound.

6. **Chapter 15's first station now shows chapter 0's bars label.** The finished
   machine reuses each station's own label, and "The tally board" was deleted. The bars
   label ("How often each word came next") names what the station does. Verdict: sound.

7. **Scene text has a style per text.** Each `SceneText` names a look text token
   (`chalk`, `ink`, `muted`, `sign` in `look.json`), so the muted earlier words and the
   glowing header each have one owner, the look. The overlay's per-tag style that
   first did this went with the overlay (29). Verdict: sound.

8. **Where a display slider went, the scene shows its former default.** Chapters 0, 1,
   2, 6, 9 and 10 show all their content (10 bars, 16 bricks, 60 pins, 24 lamps, every
   written word). Chapter 4 writes the 3 widest shares. Chapter 7 writes the river and
   knob numbers at station 3. Chapter 8 lights block 1, the one the hero shot frames.
   Chapters 14 and 15 step through their loops. Verdict: sound.

9. **Chapter 10's knob is the window, 4–8 words or "all".** `SliderDef.maxLabel` writes
   "all" at the top stop (no window). The run generates once per stop through the
   ring-cache path, and the scene says whether that window changed the words (at 5–8 it
   did not). The loop plays the knob (`keep`: all, then 4, then all), so the HUD slider
   moves with the loop's window beat. Verdict: sound.

10. **Every knob carries a one-sentence hint.** `SliderDef.hint`, at most 12 words, is
    written under the slider in the story panel. The validator checks it, and it also
    rejects a chip bound to a slider in a chapter without one. Verdict: sound.

11. **The label toggle moved into the story panel's foot.** Its caption reads "Labels"
    and its tooltip reads "the everyday analogy or the technical term". The corner keeps
    only Share and Follow on X, which are not scene controls. Verdict: sound.

12. **The deleted view machinery took its GPU layout with it.** The frame uniform lost
    its cut plane (192 → 176 bytes), the instance its `cut` (still 128 bytes, padded),
    and the look uniform its cap colour (256 → 240 bytes). The packing tests hold the
    new sizes. `partWorld` became each part's own `transform`, read directly. Verdict:
    sound.

13. **The per-part captions went with Follow, and only binding text was kept.** Each
    chapter had up to three extra captions, one per part, with their own Technical
    lines. They were deleted with Follow. Two pieces moved into default captions:
    chapter 10's qualifier (the sliding window changes outputs and is not how
    Llama-3-8B runs) and its grouped-query line, and the intro's one-word context
    (an unseen word has no counts, so no prediction). The rest of the per-part
    technical detail is gone. Verdict: acceptable, with a known cost (less technical
    depth per part).

14. **Keys 1–4 are free, and nothing took them.** `actionForKey` no longer needs the
    chapter. Rebinding the keys (to chapters, say) was not asked for. Verdict: sound.

15. **The intro's earlier words sit on dim cards in a new `cardDim` material.** It is
    the palette's `metal` colour, matte, with no glow, so the pale lit card stays the
    one word the machine reads. The word is written on its card in the `muted` text
    style. Each card's width follows its word's length at that text's size. The word
    sits a little above each card's middle, because the rail's lip hides the card's
    lower edge. Verdict: sound.

16. **A long text keeps its end, and its first card reads "…".** The rail holds at most
    12 dim cards, and fewer if they run past its left end. Whole cards are dropped
    rather than faded, so every visible word stays readable. Verdict: sound.

17. **In the loop, the word the text just gained unfolds on its dim card.** The lit card
    still slides out and back in. As the new last word slides in, the word it replaced
    grows onto its dim card beside it, so "once" becomes "once upon" on the rail. A
    fresh text ("onse") clears the dim cards while the lit card is away. Verdict: sound.

18. **"Intro" is only a label: addresses keep the display number.** `chapterBadge` and
    `chapterName` in `ladder.ts` own the on-screen name. `/#0` and `/c/0/` are
    unchanged, and so are chapters 1–15, because posted links are permanent (D31). The
    fallback video's accessible name and the share card's image alt text now name the
    chapter's title instead of a number. Verdict: sound.

19. **The intro's copy names chapter 1 as where the deep dive starts.** The caption's
    second sentence reads "It stalls on any word it never saw, like the misspelt “onse”,
    and the deep dive starts in chapter 1 by fixing that." Chapter 1's why-line now says
    "The intro's tally" instead of "Chapter 0". The phone-keyboard analogy (the chapters
    table) stays in the first sentence. Verdict: a default for the human to confirm
    (copy taste).

20. **The lesson ends at `Timeline.endSec`, not at the loop's end.** A loop wraps, so its
    last frame is its first; holding it would show an empty scene. Each chapter names the
    last moment its point is fully on screen, where its reset tail begins (the intro holds
    “onse” with no bars; chapter 4 holds the swapped sentence with the same guess). The
    pass plays 0 → `endSec`, then the scene holds it. Captures still see the whole loop.
    Verdict: sound.

21. **Controls are locked in the reducer, not only greyed in the HUD.** Before the
    reader's turn, `setText`, `setScenario` and `setSlider` are no-ops, and the HUD wraps
    the numbered steps in one disabled `fieldset`. The reading aids (label wording,
    Technical, help) and the ladder work in every phase. Verdict: sound.

22. **→ follows the Next rule; ← and the ladder are always open.** → steps on only once
    the chapter is complete, like the Next button, so the key never skips a lesson the
    button wouldn't. ← and the ladder jump freely, as the request kept. Verdict: a default
    for the human to confirm.

23. **Replay plays the lesson as written: the reader's text, example and knob reset.** The
    brief and caption describe the loop's own inputs, so replaying with the reader's text
    would narrate the wrong story. Replay cuts the camera back to the chapter's shot and
    keeps the chapter complete. Verdict: a default for the human to confirm.

24. **Every arrival shows the brief, even for a completed chapter.** Completion (in
    `localStorage`, key `aiexplainer.completed`) only opens Next at once; the lesson still
    opens with its brief, and Skip is one click away. Storage that throws or holds junk
    reads as nothing completed. Captures never read or write it. Verdict: a default for
    the human to confirm.

25. **Space pauses the pass; there is no ▶ after it.** The play/pause icon moved into the
    lesson bar and exists only while the lesson plays. On the reader's turn the scene
    holds still, so there is nothing to play; Replay lesson takes its place. Enter or
    Space presses Start on the brief, which also takes focus. Verdict: sound.

26. **Decorative motion keeps running on the reader's turn; the lesson holds.** Builders
    get an ambient clock, `SceneFrame.ambientSec`: the stage's `FrameInput.timeSec` from
    the one clock, so it holds or steps with a held or stepped capture. Flow pulses
    (chapters 4, 5 and 7, and the finished machine's route) run on it, so they keep
    moving while the scene holds `endSec`. Everything the lesson shows stays on loop
    time, and so does a station's breathing in chapter 15, because it starts when the
    tour arrives. Verdict: sound.

27. **Next is pinned under the column; the panels above it scroll.** In a short window
    (chapters with a knob at 1200×800) the title and story panels scroll behind the faded
    edge, and Next stays in view; below 840 px tall the notes under the lesson bar and
    Next are dropped. The last chapter's Next reads "Back to the intro".
    Verdict: sound.

28. **Captures open straight into the pass and never end it.** Under `?clock=held|step`
    the lesson starts in `playing` at the clock's time and the loop wraps as before, so
    hero shots, strips, cards and the recorded video keep their timing. The card and the
    video now show the lesson bar with Skip, so media needs re-recording. `?lesson=brief`
    and `?lesson=done` shoot the other states; the harness's `--lesson <phase>` waits for
    a phase in real time, and `--ui` skips to the reader's turn first, as a reader must.
    Verdict: sound.

29. **Words are drawn by the renderer from one signed distance field atlas.** The atlas is
    built from the self-hosted fonts with Canvas2D once `document.fonts` has loaded them.
    It rasterises printable ASCII up front and any other character on first use, 40 px
    to the em with an 8 px field, into one 2048×1024 `r8unorm` texture from the
    registry. A Felzenszwalb distance transform was written by hand (`text/sdf.ts`, with
    a bun test on a disc) rather than adding `@mapbox/tiny-sdf`: it is 60 lines and
    needs no new dependency. Letters are instanced quads in the colour pass after the
    translucent geometry. They read depth, never write it, sit 3 mm off their face, and
    their edges are one screen pixel wide (`fwidth`). A text follows its part's rotation
    but not its scale, so a word on a growing bar never stretches. The text pass costs
    at most ~0.5 ms of GPU time (interleaved on/off on the busiest scenes; whole frames
    1.2–3.9 ms at 1440×900 on the dev Mac). Verdict: sound.

30. **Glare never covers letters.** Dark ink on a glowing block was washed out by that
    block's own bloom, which the HTML overlay never had. The text pass leaves 1 −
    coverage in the HDR target's alpha, and the tonemap scales the added bloom by it.
    Nearby glows no longer bleed over the letters, and a glowing sign's own light still
    blooms around them. This is not physical (a real lens would flare over them); it is
    chosen for reading. Verdict: sound.

31. **Text is unlit ink.** A style's colour is its radiance: the scene's lights do not
    shade it, so a word reads the same on a lit face and on one in shadow. Styles are
    look tokens: `chalk` (light letters with a thin dark rim, for dark surfaces and
    notes), `ink` (dark, for pale or glowing parts), `muted` (dim parts) and `sign`
    (the display face, glowing, for a title plate). Verdict: acceptable, with a known cost
    (printed words never darken in shadow).

32. **No scene text is HTML any more; a note with no surface faces the eye.** Every word
    that names a part is on that part. A note is printed on the surface of the thing it
    talks about where one exists: a table edge, a plate, a housing, a map strip, a floor
    or a new plate. Otherwise it stands in the world as a billboard facing the eye, still
    in perspective and hidden by what stands in front. The billboards are chapter 2's
    pin words (a pin head is too small to write on), chapter 4's guess and needle
    angle, chapter 5's dial pair note, chapter 6's prompt (the arrow is a thin tube) and
    teaser notes, chapter 7's prompt and river and knob notes (the stations' faces are
    about 85 px wide at 1280×720), and chapter 12's "same word" note (it compares both
    machines). With no exceptions left, the overlay was deleted. Verdict: acceptable,
    with a known cost (a few notes float beside their machine rather than on it).

33. **Crowded words yield in the renderer.** The overlay hid a tag that would overlap an
    earlier one. That rule moved into the text pass as `SceneText.yields`: it tests exact
    text boxes through the one camera, and the scene lists the most important words
    first. A first cut inside chapter 2's builder had estimated boxes with its own
    projection; it was replaced, because that was a second camera. Chapter 2's pins and
    chapter 3's die faces yield. Verdict: sound.

34. **A few props changed so their words have somewhere to sit.** Chapter 8's page is propped at 60° toward the camera, in `card` material, because
    flat on the floor its text was unreadable. Chapter 10's note rack has a new header
    plate for its arithmetic. Chapter 11's stop sign is larger (0.62×0.42 m) and stands
    in front of its post. Verdict: a default for the human to confirm (they change the
    props' look).

35. **Some notes gained line breaks so they fit their surface; no numbers changed.**
    Line breaks were added to chapter 1's box note, chapter 6's plinth title, chapter
    11's crate and stop notes, chapter 12's crate ratio, and chapter 14's desk route.
    Chapter 3's die words are one line. Chapter 12's joint "16-bit: … / 8-bit: …" note
    became each machine's own story end, printed on that machine (`storyTail`). Tile and
    brick words are trimmed of their leading space so they sit centred. Verdict: sound.

36. **Occlusion is honest, even when it costs a word.** The request was for text that parts
    in front can hide, and they do. Chapter 2's arrows cross some pin words at the hero
    angle. Two nearby limits were left alone because they belong to other owners. A label's
    dot can land on written text: the placer keeps pills clear of text but not dots
    (chapter 2's "happy", chapter 7's prompt). Some hero cameras put scene words under
    the left column, which grew with the lesson flow (chapters 5, 9, 10, 13 and 14;
    chapter 11's stop sign). Chapter 8's tile words and chapter 12's machine stories are
    about 7 px tall at 1280×720, because their parts are small at the hero distance.
    Verdict: acceptable, with a known cost.

37. **The intro prints each slot's word above it and its share on the bar.** The word is
    printed on the panel strip above each slot, where a gauge's label would be, so it
    never moves. A short bar's share rides just above its top, in the plane of the bar's
    face so the slot's walls never cut it. A bar taller than a fifth of its slot wears
    its share just inside its top in dark ink: light letters above it drowned in its
    glow. The rail's words are on their cards, and the header is on its plate in the
    glowing display face. Verdict: sound.
