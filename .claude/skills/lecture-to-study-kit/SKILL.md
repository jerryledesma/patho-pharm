---
name: lecture-to-study-kit
description: Converts a NURS 419 lecture (slide deck + class transcript + any handouts) into a new lecture on Angelina's Patho-Pharm study site — notebook-style notes, tiered practice quiz, unfolding clinical cases, flashcards, "Asked in Class" questions and a concept map — validated and opened as a pull request. Use whenever Jerry says there's a new lecture, new slides or a transcript in the inbox, wants to "convert", "add", or "build" a lecture or study kit, mentions the sources/inbox folder, or wants a handout/supplement added to an existing lecture, even if he doesn't name the skill.
---

# Lecture → study kit

Turns one class meeting's source files into a lecture on the Patho-Pharm site (`github.com/jerryledesma/patho-pharm`,
hosted on Netlify behind a password). The site, data format and rules already exist; this skill's job is to fill
them in the same way every time, with Jerry approving at three gates.

Design of record: `~/dev/obs_vault/patho-pharm/design/2026-09-25-patho-pharm-design.md` (§3 naming, §5 conversion).
Worked example of a finished lecture: `public/lectures/2026-09-10-acid-base/` — read its `lecture.json` and
`notes.html` before generating anything; matching its depth and voice is the quality bar.

## Where things are

| What | Path on Jerry's Mac |
|---|---|
| Repo (code + lecture data) | `~/dev/patho-pharm` |
| Inbox for new lecture files | `~/dev/patho-pharm/sources/inbox/` |
| Organized source folders | `~/dev/patho-pharm/sources/nurs419/<YYYY-MM-DD>_<slug>/` |
| Tools | `~/dev/patho-pharm/tools/` (Node, no install needed except `npm install` once for the map renderer) |

**Running in Claude Code on the Mac:** run commands directly from the repo root.
**Running in Cowork:** use the device shell; the repo is under `$HOME/mnt/<folder>/` (connect `~/dev` if it isn't).
That shell can't push to GitHub — at step 7, give Jerry the push command.

Source files are UIC course material. They live in `sources/`, which is git-ignored: never `git add -f` them, never
move them into `public/`, and never run `git clean -x`/`-X` (it would delete them — they have no other copy).

## Workflow

Create a task list with these steps. Stop at each **GATE** and wait for Jerry's answer.

### 0. Improvement gate (before intake)

Read `~/dev/obs_vault/patho-pharm/improvement-log.md`. If any item marked *before the next lecture* is still open
and not deferred by Jerry, list those items and ask whether to do them first or defer them (record a deferral in the
log). Also run `git fetch && git branch --no-merged origin/main`: start from a fresh `origin/main`, never from another
unmerged branch.

### 1. Intake — GATE 1

```bash
node tools/intake.mjs            # defaults to sources/inbox → sources/nurs419
```

Dry run: prints a JSON plan — each file's role (slides / transcript / supplemental), the derived date and where it
came from (`dateSource`), title, instructor, slug and lecture id, and warnings. Show Jerry a short table (file → new name, plus id, title, instructor,
date) and any warnings. Title rules are applied by the tool; if a title reads badly or runs over 45 characters, suggest
a fix. Unsupported formats (`.key`, `.ppt`, `.doc`) must be exported first.

On approval, re-run with `--apply` plus any overrides (`--date`, `--title`, `--slug`, `--instructor`). It moves the files
into the class folder and writes `intake.json`.

If a folder for that date already exists the plan says **add-only** — see "Adding a supplement" below.

### 2. Extract

```bash
node tools/extract.mjs sources/nurs419/<folder>
```

Writes `extracted/slides.md` (`## Slide N` headings, tables, SmartArt lines marked `[diagram]`, image and chart
markers), `extracted/images/slide-NN-k.*` (every picture in the deck), `extracted/transcript.md` (timestamps kept,
with a words-per-speaker line at the top) and one file per supplement. PDFs are skipped by the tool. A slide deck
that arrived as a PDF (`slides.pdf` — iPad/Keynote exports) goes through `python3 tools/pdf_slides.py <class folder>`:
it writes the same `extracted/slides.md` plus one image per page, reading the text layer or, when that is scrambled,
OCR (marked `[ocr]` — check drug names and numbers against the page image). Other PDFs: read them page by page.

Look at the saved image for any slide marked "no text found", any chart, and any slide whose picture seems to carry
content (a diagram, an ABG table as a picture). Don't guess what an image showed.

Read all of it before writing anything. The transcript is long (often 2+ hours); read it in chunks and take notes as you go.

### 3. Mine the transcript

Write `extracted/mining.md` in the class folder — your working notes, not published. Capture:

- **Who is who.** Speakers are usually unlabeled ("Speaker 1"). The words-per-speaker line helps: the lead instructor
  talks most. There may also be a co-instructor (teaches segments, answers questions) — treat both as instructors;
  "she" in this skill means whichever instructor was speaking. Note which label is which.
- **Every content question an instructor asks the class**, in order, with timestamp, their words (lightly cleaned), and
  what happened next: a student's answer and the instructor's reaction, the instructor's own answer, or a discussion.
  Include quick checks like "What does pH stand for?" — Angelina said these questions *are* the outline. Skip logistics
  and rhetorical fillers ("can everyone hear me?", "are you guys okay?", "does that make sense?").
- **On-screen quiz items** (Kahoot, polls): the question text is often only on the projector. Reconstruct it from what
  was said, mark it `(Kahoot)`, and list these for Jerry — Angelina may have screenshots.
- **Content questions students asked** that the instructor answered: include them too, marked `(student asked)`.
- **Exam scope**: anything either instructor says will or won't be on the exam ("you will be tested on…", "I won't ask
  you…", "know this", "FYI only"). These decide what gets questions. Note who said it.
- **Missing materials**: handouts, case sheets, websites or videos the class used that aren't in the inbox. List them —
  they go to Jerry at gate 2 so Angelina can add them before generation.
- **Her tricks**: mnemonics, memory hooks, analogies, stories, "every time I hear X I think Y". Keep her wording.
- **Emphasis**: things she repeats or says are important, and the clinical scenarios she describes.
- **Mismatches**: where she corrects or contradicts a slide. The spoken correction wins; note both.

### 4. Outline — GATE 2

Draft and show Jerry:

1. **Note sections** (7–12 pages): each banner heading, the slides it covers, and which asked-in-class items land there.
   Order follows her lecture flow; her in-class questions shape the headings.
2. **Color roles**: which two themes get blue (`resp`) and peach (`met`) — see the components reference.
3. **Exam scope**: what's in, what's FYI-only.
4. **Practice tiers**: Tier 1 recall, Tier 2 application, Tier 3 = the lecture's hardest applied skill, named for this
   topic (Acid–Base used "ABG interpretation"; a pharm lecture might use "dosing & monitoring" or "drug selection").
5. **Clinical cases**: planned settings and what each case tests.
6. **Counts** planned, against the guides below.
7. Missing materials, Kahoot items, and anything unclear in the sources that Jerry or Angelina should confirm.

Revise until approved. Don't generate content before this gate — changing an outline is cheap; regenerating 200 items isn't.

### 5. Generate

Create `public/lectures/<id>/` in the repo and write three files. Read `tools/reference/notes-components.md` first.

**`lecture.json`** — copy `id`, `date`, `title`, `instructor` and `sources` from `intake.json`:

```json
{ "id": "<id>", "date": "YYYY-MM-DD", "title": "…", "instructor": "…", "course": "NURS 419 · Patho/Pharm I",
  "sources": ["<from intake.json>"],
  "tiers": { "1": "recall", "2": "application", "3": "<topic-specific>" },
  "practice": [], "clinical": [], "cards": [], "qa": [] }
```

Leave `id` off every item — step 6 assigns them. Put a `src` on **every** item.

**`notes.html`** — the notebook pages. **`map.dot`** — the concept map, from `tools/reference/map-template.dot`.

The content rules are in the next section. Work section by section in outline order so notes, questions and cards
stay consistent with each other.

### 6. Assign ids, render, validate

```bash
node tools/assign-ids.mjs public/lectures/<id>/lecture.json
node tools/render-map.mjs public/lectures/<id>/map.dot          # needs `npm install` once
npm run build                                                   # validate + rebuild the lecture list
```

Fix every validation error (it also rejects note classes that aren't in the stylesheet). Then go through the review
checklist at the end of this file.

To preview, run `node tests/harness.mjs 8888` with `SITE_PASSWORD_HASH` and `SESSION_SECRET` set (Jerry's `.env`;
wrap the hash in single quotes) and open `http://localhost:8888/#/<id>/notes`, or take a screenshot with Playwright if
there's no browser.

### 7. Publish for review — GATE 3

```bash
node scripts/validate.mjs --update-ledger       # records the new ids as permanent
git checkout -b lecture/<id>
git add public/lectures/<id> id-ledger.json
git commit -m "Add lecture <id>: <title>"
git push -u origin lecture/<id>
```

Before handing over, run `npm run smoke` (local build, every lecture × tab at phone and iPad width) and
`npm run release-check` (nothing unpushed, nothing stacked). One branch per batch, created from a fresh
`origin/main` — never build a branch on another unmerged branch. If you work on a cloud copy, take it with
`git archive origin/main` for this task and bring changes back as a patch, never by copying whole files.

Then Jerry opens a pull request on GitHub; Netlify posts a Deploy Preview link (send it to Angelina for a look
before merging). Give Jerry:

- counts (practice by tier, cases / clinical questions, cards, in-class questions) and the exam-scope summary;
- a **spot-check list**: ~10 items worth verifying, each with its `src`, favoring dosages, numbers, and anything from a
  mismatch or an image;
- anything you weren't sure about.

**Merging the pull request is what publishes the lecture.** Don't merge for him.

### 8. Post-deployment review (after Jerry says it's live)

Continuous-improvement step — design doc §7.1. Run it after every deploy to `main`, lecture or site change:

1. **Verify live:** `SMOKE_URL=<site> SMOKE_PASSWORD=… npm run smoke` (Jerry runs it — the password stays on his Mac), or
   Jerry opens the site if he prefers.
2. **Nothing stranded:** `npm run release-check` passes; IMP items in the deploy marked done.
3. **Measure on `main`:** validator warnings; correct-answer letter share per lecture (flag > 40%); option-length
   stats; counts vs the quantity guide; notes length; items without `src`.
4. **Feedback:** Angelina's flagged items and comments since the last review.
5. **Retro:** what broke, slowed down or needed rework during the conversion.
6. **Log:** write `~/dev/obs_vault/patho-pharm/reviews/YYYY-MM-DD-post-deployment-review.md` (findings `F-##`,
   content checks for Angelina) and add `IMP-##` items to the improvement log, each marked *before the next lecture*
   or *backlog*, plus a row in its "Post-deployment reviews" table.
7. **Gate:** the next intake waits on the *before the next lecture* items (step 0).

## Content rules

The bar is the Acid–Base lecture. Read a few of its items of each kind before writing yours.

### Accuracy (this is clinical material)

- Every fact comes from the slides, the transcript or a supplement. Don't add outside facts, doses or guidelines —
  Angelina is studying for *this* instructor's exam. If the sources are silent, leave it out.
- If sources disagree or something looks wrong, don't pick silently: use the instructor's spoken version, and list it
  for Jerry at gate 3.
- `src` says where to check: `"slide 12"`, `"slides 20–21"`, `"00:41:10"`, `"slide 30 + 01:12:05"`, `"supp-01 p2"`.

### Notes (`notes.html`)

- Summary notes that keep the detail: every slide's substance lands somewhere, compressed into the notebook components.
  Angelina asked for "emphasizing the main points, but also keeping the detail in, and easily retainable".
- Put each in-class question in an `asked` callout (`he asked:` / `she asked:` to match the instructor, `student asked:` for students) in the section where it was asked.
- Numbers to memorize go on yellow stickies; mnemonics get the `mnem` block with her hint; not-tested material goes in
  `fyi` boxes.
- Her voice matters: short quotes in `tiny` or `pearl` ("every time I hear COPD…") make it stick.
- Only classes from the components reference (the build checks). No new CSS, scripts, or images from the deck, and
  no inline styles beyond the pink banner.

### Practice questions (`practice`)

Target 30–45. Mix roughly ⅓ per tier; Tier 3 can be smaller if the lecture has less to apply.

- Tier 1 recall (Bloom: remember/understand) — facts, values, definitions she emphasized.
- Tier 2 application (apply) — a short situation; the learner picks the consequence, cause or action.
- Tier 3 topic-specific interpretation (analyze) — the lecture's core skill on raw data (ABG sets, EKG findings, lab
  panels, a med order). Stems can be terse, like the ABG items.
- `type: "mc"`, 4 options, exactly one best answer, `answer` is a letter.
- Distractors are real misconceptions (the reversed direction, the neighboring disorder, the similar drug) — never joke options, never
  "all/none of the above".
- The rationale says why the answer is right **and** why the tempting wrong ones are wrong, in a sentence or two, and
  uses her words or trick when she had one.
- Don't let length give the answer away: write distractors as specific as the correct option. The correct option
  should be the strictly longest in no more than about a third of items, and never much longer than every distractor
  (the build warns when more than 10% are > 1.3× the longest distractor).
- No questions on FYI-only topics.

### Clinical cases (`clinical`) — Next-Gen NCLEX (NGN) style

Angelina sits the NCLEX-RN in 2028, so cases follow the NGN case-study shape (IMP-03). Target 7–9 NGN cases of
exactly 6 questions, plus one closing "Rapid rounds" scenario of 4–6 standalone items (no `step`). Fewer cases for a
short lecture — say so at gate 2.

- Write scenarios in the order they should appear; `assign-ids` numbers them `c01, c02…` by position, so N in the
  title must match the position.
- `title` "Scenario N — Setting"; `setting` = unit + time span (the app adds the question count); `text` = the client chart in NCLEX
  layout: `<b>Nurses' Notes — Day 1, 1400</b>` narrative, then `<b>Vital Signs</b>`, `<b>Laboratory Results</b>`,
  `<b>Orders</b>` lines (`\n` between). Say "the client". Include a few irrelevant or normal findings (cues must be
  discriminated, not handed over).
- The 6 questions follow the clinical-judgment steps in order, each with a `step` field:
  `recognize` (which findings are relevant / need follow-up / are risk factors) → `analyze` (what the findings are
  consistent with; which drugs/causes fit) → `prioritize` (the client is most likely experiencing… / highest priority)
  → `generate` (which interventions/plan items to anticipate) → `act` (what the nurse does first / now; order items fit
  here) → `evaluate` (which findings show the plan is working vs need follow-up).
- The case unfolds: new data goes at the start of a later stem, bold and time-stamped (`<b>Day 3, 0800.</b> …`).
- Types: `mc` (4 options); `sata` (5–6 options, 2–4 correct — stands in for NGN highlight/matrix items); `order`
  (4 options, full sequence). At least 2 SATA per case.
- Nursing actions must match what the instructor or slides said to do; no facts beyond the sources.

### Flashcards (`cards`)

Target 50–80. One fact per card; front ≤ ~15 words; back is the answer plus the hook. Tag each card with a short
kebab-case topic tag (`values`, `basics`, `drug-classes`, `nursing`…); 6–12 distinct tags per lecture so the tag filter is useful.

### Asked in Class (`qa`)

Every question from the mining notes, in lecture order. `q` in the instructor's words (prefix `(Kahoot)` or
`(student asked)` where that applies). `a` is what happened: the student answer and whether it was accepted, or the
instructor's explanation. If nobody answered, or the answer wasn't audible, give the answer from the slides and say
"(from slide N)". HTML like `<b>` is fine.

### Concept map (`map.dot`)

8–14 nodes, each a bold heading and 2–5 short lines; edges labeled with the relationship. Title line names the topic
and date; second line holds the must-know numbers or rule. Use the template's palette by meaning.

## Practice exams (course level)

Angelina's NCLEX-style practice exams live in `public/exams/` (home page → Practice Exam N; IMP-15). Each exam is
10 questions from each of six lectures — per lecture 3 `recall`, 4 `application`, 3 `concept`, ≥ 2 SATA — and the
results page groups misses by lecture, kind and topic (`topic` = one of that lecture's flashcard tags).

To add exams (e.g. for the next block of lectures): write the questions per `tools/reference/exam-brief.md` (one
subagent per lecture works well), then `python3 tools/build-exams.py <items-dir> --first <next exam number>`,
`npm run build`, `npm run smoke`. Never rebuild a published exam — its ids are in the ledger; add new exams instead.
Questions must be new (not reworded practice/clinical items) and follow every content rule above.

## Adding a supplement to an existing lecture

When intake reports **add-only**:

- Extract the new file only; read the existing `lecture.json` and `notes.html`.
- **Never change or remove existing item ids**, and don't rewrite existing items unless the supplement corrects them
  (then keep the id and note the change for Jerry). Her progress is stored against those ids; the build fails if one disappears.
- Append new practice, clinical, cards and qa items without ids and run `assign-ids`.
- `notes.html` can be edited or regenerated freely — progress isn't tied to it.
- Add the file to `sources`. Branch name `lecture/<id>-supp-NN`.

## Review checklist (before gate 3)

- [ ] `npm run build` passes, and the "items have no src" warning doesn't mention this lecture.
- [ ] Counts within the guides, or the difference explained.
- [ ] Every in-class question from the mining notes appears in `qa` and in an `asked` callout.
- [ ] Nothing FYI-only is quizzed.
- [ ] Every `mc` has one defensible answer; every SATA answer set is complete; every order item has one right sequence.
- [ ] Rationales explain the wrong options too.
- [ ] Notes use only classes from the components reference; the cover's color key matches the themes used.
- [ ] Map renders and reads top-down.
- [ ] `git status` shows only `public/lectures/<id>/` and `id-ledger.json` — nothing from `sources/`.
