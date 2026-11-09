# Brief: write items for a graduate-format unit exam

A unit exam is one fixed-form summative practice exam across a block of lectures. It differs from the NCLEX-style
Practice Exams (`exam-brief.md`): content is weighted by a blueprint, the form runs in a set order, case-based item sets
stay together, and the learner can move back and forth and flag items. Engine: `format: "graduate"` in `app.js`.
Assembler: `tools/build-unit-exam.py`.

The method follows conventional graduate-program test construction: a table of specifications, cognitive levels
weighted above recall, single-best-answer items written to NBME-style item-writing rules, and an independent item
review before release.

## Cardiovascular Unit Exam blueprint (exam-4)

75 questions · 120 minutes · one sitting · 1 point each · select-all items are all-or-nothing · 80% study benchmark
(a site target, not a course cut score).

| Lecture | Section 1 single best answer | Section 2 multiple response | Section 3 case sets | Total | Share |
|---|---:|---:|---:|---:|---:|
| I Hemodynamics & Lipids | 7 | 2 | 4 | 13 | 17% |
| II Hypertension & Rhythms | 8 | 2 | 7 | 17 | 23% |
| III Angina, ACS & MI | 7 | 2 | 6 | 15 | 20% |
| IV Heart Failure | 7 | 2 | 6 | 15 | 20% |
| V Antithrombotic Drugs | 6 | 2 | 7 | 15 | 20% |
| **Total** | **35** | **10** | **30** | **75** | |

Lecture II carries the extra weight because it covers two tested areas (hypertension and rhythms).

| Cognitive level (`kind`) | Section 1 | Section 2 | Section 3 | Total | Share |
|---|---:|---:|---:|---:|---:|
| Remember / understand (`recall`) | 13 | 2 | 0 | 15 | 20% |
| Apply (`application`) | 12 | 5 | 21 | 38 | 51% |
| Analyze / evaluate (`concept`) | 10 | 3 | 9 | 22 | 29% |

`skill` comes from the course's own study-guide wording ("explain mechanisms, predict consequences, compare drug
classes, and recognize important safety issues"): `explain`, `predict`, `compare`, `safety`. Aim for at least 15 of each.

### Case sets (Section 3): 5 cases × 6 items

| Case | Setting | Items by lecture |
|---|---|---|
| A | Primary-care clinic: hypertension with dyslipidemia | I 3, II 3 |
| B | Telemetry unit: a rhythm disorder needing drug therapy and anticoagulation | II 4, V 2 |
| C | Emergency department → cath lab: acute coronary syndrome | III 4, V 2 |
| D | Cardiac step-down: heart failure after MI | III 2, IV 4 |
| E | Medical unit: chronic heart failure on multiple interacting drugs, with a bleeding concern | I 1, IV 2, V 3 |

Each case's data must fit what the sources teach; adjust details, not the blueprint, if a planned link isn't in them.

## Item rules

Item shape: `{ "section", "case" (Section 3 only), "lecture", "kind", "skill", "topic", "type": "mc"|"sata", "stem",
"options", "answer", "rationale", "src" }`

- **Sources.** Facts only from the lecture (`notes.html`, `lecture.json` items and their `src`, and, where they exist,
  `sources/nurs419/<folder>/extracted/`). No outside facts, doses or guidelines. Never quiz `fyi` content. Don't build an
  item on a recorded slide-versus-instructor mismatch.
- **Match the instructor's stated exam habits** (Cardiovascular V, 00:44:22 and 01:26:54). Give generic and trade names
  together wherever the lecture gives both, e.g. "dabigatran (Pradaxa)". No rhythm strips; describe a rhythm in words.
- **Graduate level.** Application and analysis items need reasoning from data: a client's findings, labs or a med
  list leading to a mechanism, a consequence, a comparison or a decision. Recall items test what the instructor flagged,
  in short stems. Prefer items that join ideas across the lecture.
- **New.** Don't reuse or lightly reword a stem from the lecture's practice or clinical items or a flashcard front.
  A new angle on the same fact is fine. Run a similarity check and fix anything close.
- **Stem.** A complete, focused question answerable before reading the options. Say "the client". Avoid negative stems;
  if one is unavoidable, use bold <b>NOT</b> or <b>needs further teaching</b>.
- **Options.** `mc`: 4 options, one best answer. `sata`: 5–6 options, 2–4 correct, stem ends "Select all that apply."
  Options are parallel in form, length and specificity. Every distractor is a real misconception (the reversed direction,
  the neighboring drug or disorder). Never "all/none of the above", joke options, or absolutes that cue the answer.
- **Length tell.** Across `mc` items the correct option is strictly longest in ≤ 35%, more than 1.3× the longest distractor
  in ≤ 10%, and strictly shortest in ≤ 35%.
- **Rationale.** Why the answer is right and why each tempting wrong option is wrong, in 1–3 sentences, using the
  instructor's words or hooks. Refer to options by content, **never by letter**: the assembler shuffles them.
- **`topic`** must be one of that lecture's flashcard `tag` values. **`src`** copies the lecture's real style and values
  (`"slide 12 + 00:41:10"`). `lecture` is the lecture id that owns the tested fact.
- **Item independence.** No item may give away another's answer. In a case set, new data goes at the start of the stem,
  bold and time-stamped, and every item must be answerable without having got the earlier ones right.
