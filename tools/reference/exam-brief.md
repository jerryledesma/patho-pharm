# Brief: write practice-exam questions for one lecture (IMP-15)

Angelina (MSN student, NURS 419 Patho/Pharm I; sits the NCLEX-RN in 2028) asked for three 60-question NCLEX-style
practice exams, 10 questions from each of six lectures per exam. You write the 30 questions for ONE lecture
(10 per exam form). They must be NEW — she has already worked through the lecture's practice quiz and clinical
cases many times.

## Inputs
- Lecture (content source of truth, already source-verified): `public/lectures/<id>/notes.html`
  and `lecture.json` (its practice, clinical, cards and qa items, each with a `src`).
- Class folder `sources/nurs419/<folder>/` — `extracted/mining.md` (exam scope, FYI-only list, her emphasis),
  `extracted/outline.md`, slides and transcript, if you need to confirm a fact.
- Style references: the lecture's own practice items (voice, rationale depth) and the NGN items in its clinical cases
  (NCLEX wording: "the client", "which action should the nurse take first", "which statement indicates teaching was
  effective", "select all that apply").

## What to write — 30 items, 10 per form (`"form": 1 | 2 | 3`)
Per form, exactly:
- **3 `recall`** — specific memorization she needs: drug class ↔ prototype ↔ mechanism, key adverse effect,
  antidote, numbers/limits/timings the instructor flagged, definitions. Short stems.
- **4 `application`** — clinical, NCLEX-style: a 1–3 sentence client situation (age, key finding, med) → priority,
  first action, expected finding, what to report, or teaching response. Include at least one "teaching was effective"
  or "needs further teaching" item per form across the lecture.
- **3 `concept`** — key concepts: why/mechanism, compare-contrast, cause → consequence.
- Types: **at least 2 `sata` per form** (5–6 options, 2–4 correct, stem ends "Select all that apply."); the rest
  `mc` with 4 options and one best answer. No `order` items.
- Each form covers **at least 6 different topics**; together the 30 items cover the lecture's tested content broadly,
  weighted to what the instructor stressed. Forms are equal in difficulty.

## Fields per item
`{ "form", "kind": "recall|application|concept", "topic", "type": "mc|sata", "stem", "options", "answer",
   "rationale", "src" }`
- `topic` MUST be one of this lecture's flashcard tags (the `tag` values in its `cards`) — results tell her which
  flashcard decks and notes to review, so pick the tag that best matches what the item tests.
- `answer`: a letter (`"B"`) for mc; letters for sata (`"A, C, D"`). Write the correct option anywhere — the
  assembler shuffles.
- `rationale`: why the answer is right AND why the tempting wrong options are wrong (1–3 sentences), using the
  instructor's words or hooks when she had one.
- `src`: where to check (`"slide 12 + 00:41:10"`, copying the style and real values from the lecture's items).

## Rules
- Facts only from the lecture (notes, items, sources). No outside facts, doses or guidelines. Never quiz FYI-only
  material (see mining.md / fyi boxes). Where the lecture recorded a slide-vs-instructor mismatch, follow how the
  lecture's notes resolved it and don't build an item on the disputed point.
- New items: don't reuse or lightly reword an existing practice/clinical stem. Testing the same fact from a new angle
  is fine (that's the point), copying is not. Script a similarity check against the lecture's existing stems and fix
  anything too close.
- Distractors are real misconceptions (the neighboring drug, the reversed direction, the wrong receptor), never joke
  options, never "all/none of the above". Drug names may appear as the answer only if the lecture tests names (the
  Pulmonary lecture does NOT — there, quiz categories, mechanisms and effects; names only as examples).
- Option length must not give the answer away: across your mc items, the correct option is strictly longest in
  ≤ 35%, > 1.3× the longest distractor in ≤ 10%, strictly shortest in ≤ 35%.

## Output
Write `<items-dir>/<lecture-id>.json` (outside the repo or in a git-ignored folder) — a JSON array of the 30 items (ensure_ascii=False, indent=1).
Validate it with a script: 30 items, 10 per form, per form 3/4/3 by kind and ≥ 2 sata, every topic in the tag list,
answers valid letters, sata 2–4 correct of 5–6, option-length stats above, similarity check. Don't edit anything
else.

## Final message (under 20 lines)
Topic coverage per form, kind/type counts, option-length stats, the 3 items you're least sure of (form, stem start,
why, src), and anything in the lecture you deliberately left out.
