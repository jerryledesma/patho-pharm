---
name: lecture-to-study-kit
description: Converts a NURS 419 lecture (slide deck + class transcript + any handouts) into a new lecture on Angelina's Patho-Pharm study site — notebook-style notes, tiered practice quiz, unfolding clinical cases, flashcards, "Asked in Class" questions and a concept map — and runs unattended by default (autopilot), looping on its own checks until everything passes, then opening a pull request. Use whenever Jerry says there's a new lecture, new slides or a transcript in the inbox, wants to "convert", "add", or "build" a lecture or study kit, mentions the sources/inbox folder, asks to "run the autopilot", or wants a handout/supplement added to an existing lecture, even if he doesn't name the skill.
---

# Lecture → study kit

Turns one class meeting's source files into a lecture on the Patho-Pharm site (`github.com/jerryledesma/patho-pharm`,
hosted on Netlify behind a password). The site, data format and rules already exist; this skill's job is to fill
them in the same way every time.

Design of record: `obs_vault/patho-pharm/design/2026-09-25-patho-pharm-design.md` (§3 naming, §5 conversion).
Worked example of a finished lecture: `public/lectures/2026-10-08-pulmonary-disorders/` (NGN-era) and
`public/lectures/2026-09-10-acid-base/` (voice and depth) — read a `lecture.json` and `notes.html` before generating
anything; matching their depth and voice is the quality bar.

## Modes

- **Autopilot (default).** No questions to Jerry. Every former gate is replaced by a self-check plus the decision
  policy in `tools/reference/autopilot.md`; the run loops on `tools/autopilot.mjs verify` until every check passes,
  then opens a pull request. Read `tools/reference/autopilot.md` before starting — it holds the decision policy, the
  stop conditions, and the formats of `mining.json`, `outline.json` and `review.json`.
- **Interactive** — only when Jerry asks to be consulted ("walk me through it", "check with me first"). Same steps;
  stop after intake (show the plan), after the outline, and before shipping.

**Do not ask Jerry anything in autopilot.** When you would have asked, decide by the policy, record the decision with
`node tools/autopilot.mjs note <id> "<what you decided and why>"`, and keep going. The only reasons to stop early are
the hard blockers listed in the reference; anything that fails after the attempt limit ships as a **draft** PR
listing what's open. Merging the PR is what publishes — never merge.

## Where things are

| What | Path (relative to the repo root) |
|---|---|
| Inbox for new lecture files | `sources/inbox/` — one folder per lecture |
| Organized source folders | `sources/nurs419/<YYYY-MM-DD>_<slug>/` (working files in its `extracted/`) |
| Tools | `tools/` — `autopilot.mjs` drives the run, `quality-gate.mjs` is the review checklist as code |
| Improvement log (vault) | `$PATHO_VAULT/improvement-log.md`, else `~/_dev/obs_vault/patho-pharm/` or `~/dev/obs_vault/patho-pharm/` |

The repo is `~/_dev/patho-pharm` on the MacBook Pro (`~/dev/patho-pharm` on older setups). **In Cowork:** use the
device shell; the repo is under `$HOME/mnt/<folder>/`, and that shell can't push — `ship` will report the push
command.

Source files are UIC course material. They live in `sources/`, which is git-ignored: never `git add -f` them, never
move them into `public/`, and never run `git clean -x`/`-X` (it would delete them — they have no other copy).

## Workflow

Create a task list with these steps. Every `autopilot.mjs` command prints JSON with a `next` field; follow it.
If you're resuming, run `node tools/autopilot.mjs status <id>` first and continue from the stage it names.

### 0. Preflight (replaces the improvement gate)

```bash
node tools/autopilot.mjs preflight
```

Fetches `origin`, clears stale git locks, refuses a dirty working tree, installs missing npm deps and Playwright,
checks `gh`, lists inbox folders and the improvement-log items still marked *before the next lecture*. Settle each
open item by the policy (apply it if it's a content rule you can follow while generating; otherwise defer it and
mark the deferral in the log). `ok: false` is a hard blocker — stop and report it.

### 1. Intake

```bash
node tools/autopilot.mjs intake                 # one lecture in the inbox
node tools/autopilot.mjs intake --only "<inbox folder>"   # several: one at a time, oldest first
```

Converts `.key`/`.ppt`/`.doc`, runs `tools/intake.mjs --auto` (long titles shortened, extra transcripts → supplements,
missing date from file dates, name clashes → next supp number) and applies it. Read `decisions` and `warnings`. If the
shortened title reads badly, fix `title` in `intake.json` (≤ 45 characters; the id and folder keep the slug) and
`note` it. A plan in **add-only** mode is a supplement: see "Adding a supplement" below.

### 2. Start: branch and extract

```bash
node tools/autopilot.mjs start sources/nurs419/<folder>
```

Creates `lecture/<id>` from a fresh `origin/main` (never from another unmerged branch), transcribes audio if there's
no transcript, and extracts: `extracted/slides.md` (`## Slide N` headings, tables, SmartArt lines marked `[diagram]`,
image and chart markers), `extracted/images/slide-NN-k.*`, `extracted/transcript.md` (timestamps kept, words-per-speaker
line at the top) and one file per supplement. PDF decks go through `tools/pdf_slides.py` (OCR pages are marked
`[ocr]` — check drug names and numbers against the page image). Other PDFs: read them page by page.

Look at the saved image for any slide marked "no text found", any chart, and any slide whose picture seems to carry
content (a diagram, an ABG table as a picture). Don't guess what an image showed — if it's illegible, leave the fact
out and list it in `review.json` `uncertain`.

Read all of it before writing anything. The transcript is long (often 2+ hours); read it in chunks and take notes as you go.

### 3. Mine the transcript

Write `extracted/mining.md` (free-form working notes) **and** `extracted/mining.json` (the structured part — format in
the reference). Capture:

- **Who is who.** Speakers are usually unlabeled ("Speaker 1"). The words-per-speaker line helps: the lead instructor
  talks most. There may also be a co-instructor (teaches segments, answers questions) — treat both as instructors;
  "she" in this skill means whichever instructor was speaking. If `intake.json` has no instructor, fill it in now (in
  `intake.json`) by the policy, and `note` it.
- **Every content question an instructor asks the class**, in order, with timestamp, their words (lightly cleaned), and
  what happened next: a student's answer and the instructor's reaction, the instructor's own answer, or a discussion.
  Include quick checks like "What does pH stand for?" — Angelina said these questions *are* the outline. Skip logistics
  and rhetorical fillers ("can everyone hear me?", "are you guys okay?", "does that make sense?").
- **On-screen quiz items** (Kahoot, polls): the question text is often only on the projector. Reconstruct it from what
  was said, mark it `(Kahoot)`, and list it under `kahoot` — the PR asks Angelina to confirm.
- **Content questions students asked** that the instructor answered: include them too, marked `(student asked)`.
- **Exam scope**: anything either instructor says will or won't be on the exam ("you will be tested on…", "I won't ask
  you…", "know this", "FYI only"). These decide what gets questions. Note who said it.
- **Missing materials**: handouts, case sheets, websites or videos the class used that aren't in the inbox. List them
  under `missing` and carry on without them.
- **Her tricks**: mnemonics, memory hooks, analogies, stories, "every time I hear X I think Y". Keep her wording.
- **Emphasis**: things she repeats or says are important, and the clinical scenarios she describes.
- **Mismatches**: where she corrects or contradicts a slide. The spoken correction wins; list both under `mismatches`.

### 4. Outline + self-check (replaces gate 2)

Write `extracted/outline.json` (format in the reference):

1. **Note sections** (7–12 pages): each banner heading, the slides it covers, and which mined questions land there.
   Order follows her lecture flow; her in-class questions shape the headings.
2. **Color roles**: which two themes get blue (`resp`) and peach (`met`) — see the components reference.
3. **Exam scope**: what's in, what's FYI-only.
4. **Practice tiers**: Tier 1 recall, Tier 2 application, Tier 3 = the lecture's hardest applied skill, named for this
   topic (Acid–Base used "ABG interpretation"; a pharm lecture might use "dosing & monitoring" or "drug selection").
5. **Clinical cases**: planned settings and what each case tests.
6. **Counts** planned, against the guides below.

Then check it yourself before generating — changing an outline is cheap; regenerating 200 items isn't:

- Every slide is in a section or in `skippedSlides`; every mined question index is in some section's `asked`.
- Sections follow her order; no section is a grab-bag; each is about one page.
- Tier 3 is the skill she spent the most time applying; cases cover the main disorders/drug classes, not one repeated.
- Nothing FYI-only is planned as a question; counts are in the guides (or the reason is `note`d).

Fix and re-check until all hold. The quality gate re-checks coverage mechanically at verify.

### 5. Generate

Create `public/lectures/<id>/` in the repo and write three files. Read `tools/reference/notes-components.md` first.

**`lecture.json`** — copy `id`, `date`, `title`, `instructor` and `sources` from `intake.json`:

```json
{ "id": "<id>", "date": "YYYY-MM-DD", "title": "…", "instructor": "…", "course": "NURS 419 · Patho/Pharm I",
  "sources": ["<from intake.json>"],
  "tiers": { "1": "recall", "2": "application", "3": "<topic-specific>" },
  "practice": [], "clinical": [], "cards": [], "qa": [] }
```

Leave `id` off every item — verify assigns them. Put a `src` on **every** item.

**`notes.html`** — the notebook pages. **`map.dot`** — the concept map, from `tools/reference/map-template.dot`.

The content rules are in the next section. Work section by section in outline order so notes, questions and cards
stay consistent with each other. For a long lecture, generating practice, clinical and cards in parallel subagents
works — give each the outline, mining notes, extracted sources and the content rules, and merge their JSON yourself.

### 6. Verify loop

```bash
node tools/autopilot.mjs verify <id>
```

Runs assign-ids → render-map → `npm run build` → `tools/quality-gate.mjs` (the review checklist as code: counts,
item shapes, NGN case structure, answer-letter share and length tells, `src` everywhere, notes/map shape, slide and
question coverage, open review findings). Fix **every** `error` finding and failed step, then run it again. Warnings
are allowed but should be fixed when cheap; the rest go into the PR. When `pass` is true, run it once more with
`--smoke` (every lecture × tab at phone and iPad width).

Up to 8 attempts. If `escalate` comes back true, stop fixing and go to step 7 with `--draft`.

### 6b. Independent content review (judgment checks)

The quality gate can't tell whether an answer is *defensible*. After the first passing verify (before `--smoke`),
run `node tools/autopilot.mjs review <id>` to count the round, then spawn **one fresh subagent** (it must not see your
reasoning — give it files, not conclusions) with this brief:

> Review `public/lectures/<id>/lecture.json` and `notes.html` against the sources in
> `sources/nurs419/<folder>/extracted/` (slides*.md, transcript.md, supplements, images) and `mining.json`. Content
> rules: `.claude/skills/lecture-to-study-kit/SKILL.md` § "Content rules". For every practice and clinical item check:
> exactly one defensible answer (mc) / the complete answer set (sata) / one right sequence (order); the fact is in the
> sources at its `src`; the rationale explains the tempting wrong options; nothing FYI-only is quizzed; NGN steps fit
> the stems. Check cards and qa against the sources too. Write `extracted/review.json` per
> `tools/reference/autopilot.md`: each problem as a finding with severity `blocking` (wrong, unsourced, two answers,
> FYI quizzed) or `minor`, plus a `spotCheck` list of ~10 items worth a human look (doses, numbers, mismatches,
> images) and `uncertain` for anything you couldn't confirm. Don't edit the lecture.

Fix every blocking finding (and minors when cheap), set each fixed finding's `status` to `"fixed"`, and verify
again. For a second round, give a new subagent only the changed items. At most 3 rounds; findings still open after
that stay in `review.json` and the PR lists them.

### 7. Ship

```bash
node tools/autopilot.mjs ship <id>            # or --draft after the attempt limit
```

Re-verifies, updates the id ledger (ids become permanent), checks only `public/lectures/<id>/` and `id-ledger.json`
changed (nothing from `sources/`), scans the staged diff for secrets, commits (author set per command,
`Co-Authored-By` trailer; set `CLAUDE_SESSION_URL` to add the session link), pushes, writes `extracted/report.md`
and opens the PR with it as the body (if `gh` isn't logged in it prints the compare URL instead), then runs
`release-check`. The report carries counts, exam scope, the spot-check list, every autopilot decision, items for
Angelina to confirm, source conflicts and anything unsure.

Netlify posts a Deploy Preview on the PR; Jerry sends it to Angelina and merges. **Merging is what publishes the
lecture — don't merge.** Finish with a short summary: PR link, counts, number of decisions, anything open.

### 8. Post-deployment review (after Jerry says it's live)

Continuous-improvement step — design doc §7.1. Run it after every deploy to `main`, lecture or site change:

1. **Verify live:** `SMOKE_URL=<site> SMOKE_PASSWORD=… npm run smoke` (Jerry runs it — the password stays on his Mac), or
   Jerry opens the site if he prefers.
2. **Nothing stranded:** `npm run release-check` passes; IMP items in the deploy marked done.
3. **Measure on `main`:** `node tools/quality-gate.mjs <id>` for each new lecture; validator warnings; counts vs the
   quantity guide; notes length.
4. **Feedback:** Angelina's flagged items and comments since the last review.
5. **Retro:** what broke, slowed down or needed rework during the conversion — including every autopilot decision
   Jerry overrode in review (each one is a candidate policy fix in `tools/reference/autopilot.md`).
6. **Log:** write `obs_vault/patho-pharm/reviews/YYYY-MM-DD-post-deployment-review.md` (findings `F-##`,
   content checks for Angelina) and add `IMP-##` items to the improvement log, each marked *before the next lecture*
   or *backlog*, plus a row in its "Post-deployment reviews" table.
7. **Gate:** the next run's preflight surfaces the *before the next lecture* items (step 0).

## Content rules

The bar is the Acid–Base lecture. Read a few of its items of each kind before writing yours.

### Accuracy (this is clinical material)

- Every fact comes from the slides, the transcript or a supplement. Don't add outside facts, doses or guidelines —
  Angelina is studying for *this* instructor's exam. If the sources are silent, leave it out.
- If sources disagree or something looks wrong, don't pick silently: use the instructor's spoken version, and list it
  under `mismatches` in `mining.json` (the PR shows it).
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
  (then keep the id and `note` the change — the PR lists it). Her progress is stored against those ids; the build fails if one disappears.
- Append new practice, clinical, cards and qa items without ids and run `assign-ids`.
- `notes.html` can be edited or regenerated freely — progress isn't tied to it.
- Add the file to `sources`. `start` names the branch `lecture/<id>-supp-NN`.
- `mining.json` and `outline.json` aren't needed; the quality gate checks only the new items (`--new-only`) and the
  content review covers only them. Everything else — verify loop, review, ship — is the same.

## Review checklist (what verify and the review enforce)

Each line is checked mechanically by `tools/quality-gate.mjs` or by the independent review (6b). Read it as the
definition of done, not as a list to tick by hand.

- [ ] `npm run build` passes, and the "items have no src" warning doesn't mention this lecture.
- [ ] Counts within the guides, or the difference explained.
- [ ] Every in-class question from the mining notes appears in `qa` and in an `asked` callout.
- [ ] Nothing FYI-only is quizzed.
- [ ] Every `mc` has one defensible answer; every SATA answer set is complete; every order item has one right sequence.
- [ ] Rationales explain the wrong options too.
- [ ] Notes use only classes from the components reference; the cover's color key matches the themes used.
- [ ] Map renders and reads top-down.
- [ ] `git status` shows only `public/lectures/<id>/` and `id-ledger.json` — nothing from `sources/`.
