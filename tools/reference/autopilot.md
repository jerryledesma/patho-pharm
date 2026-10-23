# Autopilot contract

How lecture-to-study-kit runs from inbox to pull request without stopping for Jerry. `tools/autopilot.mjs`
owns everything deterministic, and Claude owns the reading and writing. The two hand off through the files below.
The pull request is the single human checkpoint, because **merging is what publishes**.

## The loop

```
preflight ─► intake ─► start ─► mine ─► outline ⟲ self-check ─► generate ─► review ⟲ fix ─► verify ⟲ fix ─► ship
                                                                              (≤ 3 rounds)    (≤ 8 attempts)
```

`node tools/autopilot.mjs status <id>` always names the next stage, so a run that was interrupted (context limit,
crash, laptop closed) resumes from the files on disk. It never starts over.

## Stopping conditions

The run stops early **only** for a hard blocker, which is something no amount of retrying can fix:

| Hard blocker | What the run does |
|---|---|
| Inbox empty | Exit, saying "nothing to do". |
| Uncommitted changes in the working tree | Exit. Never stash or discard someone else's work. |
| `git fetch` / `npm ci` fails (offline) | Exit with the error. |
| No usable source: no deck, no transcript, no audio, or every file unreadable after conversion | Exit, naming the files. |
| Audio but no transcript, and `transcribe.py` fails | Exit with its error. A slides-only kit has no in-class questions or exam-scope statements, so don't ship one. `python3 tools/transcribe.py --check` says what is missing. |
| Secret scan hits the staged diff | Unstage, exit, and name the lines. |
| `git push` fails | The commit stays local. Print the push command. |

Everything else is an **open item** that the run settles by itself, using the policy below, and records with
`autopilot.mjs note`. Each note becomes a line in the PR's "Decisions the autopilot made instead of asking".

When a loop runs out of attempts with errors still open, the run doesn't stop. It ships a **draft** PR that lists
the blockers (`ship --draft`), and that draft is how Jerry hears about it.

## Decision policy (in place of the old gates)

| Used to ask Jerry | Autopilot decides |
|---|---|
| **Gate 0:** improvement items marked *before the next lecture* | An item that is a content rule this skill already enforces (or one you can apply while generating) gets applied, with a note saying so. Anything that changes site code, tools or process is deferred: record it with `note`, and add "deferred by autopilot <date>" to that line of the improvement log when the vault is reachable. Never start unrelated engineering work mid-run. |
| **Gate 0:** unmerged branches | Leave them alone. The new branch always starts from `origin/main`. |
| **Gate 1:** several lectures in the inbox | One run per lecture, oldest date first, each on its own branch and PR. |
| **Gate 1:** title over 45 characters or reads badly | `intake --auto` drops the subtitle or parenthetical, then trailing words. If the result still reads badly, re-run with `--title`. |
| **Gate 1:** no date | Folder name, then transcript header, then file names, then the recording's or transcript's file date. |
| **Gate 1:** no instructor on the slides | Get it from the transcript while mining (self-introduction, how students address them). If it's still unknown, use the instructor of the most recent lecture with the same deck template; if nothing matches, use `NURS 419 Faculty`. Note it either way. |
| **Gate 1:** two transcripts | Keep the longest one as the transcript, and treat the others as supplements. |
| **Gate 1:** `.key` / `.ppt` / `.doc` | Convert with Keynote, LibreOffice or `textutil`, and keep the original in `sources/originals/`. A file that can't be converted gets skipped and noted. |
| **Gate 1:** audio but no transcript | `start` runs `tools/transcribe.py --slides`. It needs only faster-whisper (preflight installs it); audio is decoded by the PyAV it ships, so no `ffmpeg`. |
| **Gate 2:** outline approval | Self-check (step 4 in SKILL.md), then `quality-gate` checks slide coverage and question placement during verify. |
| **Gate 2:** fewer cases or counts outside the guides | This is allowed when the lecture is short. Say why in a note, because the gate turns out-of-range counts into warnings, and the PR shows them. |
| Missing handouts and on-screen Kahoot items | Generate without the missing handout. Rebuild the Kahoot question from what was said, mark it `(Kahoot)`, and list both in `mining.json` (`missing`, `kahoot`), which puts them in the PR for Angelina. |
| Slide and speech disagree | The spoken version wins. List the conflict in `mining.json` `mismatches`. |
| Unsure whether a fact is in the sources | Leave it out. If it matters, list it in `review.json` `uncertain`. |
| **Gate 3:** push and open the PR | `ship` does both. Merging stays with Jerry. |

## Files the autopilot reads and writes

All of these live in `sources/nurs419/<folder>/extracted/`. That folder is git-ignored, so none of them is ever
committed.

### `mining.json`

```json
{
  "instructors": [{ "label": "Speaker 1", "name": "Nisa Lalani, DNP, RN", "pronoun": "she", "role": "lead" }],
  "questions": [
    { "t": "00:12:30", "kind": "instructor", "q": "What does pH stand for?", "a": "student: potential of hydrogen — accepted" },
    { "t": "00:40:05", "kind": "kahoot", "q": "(Kahoot) …", "a": "…" },
    { "t": "01:02:11", "kind": "student", "q": "(student asked) …", "a": "…" }
  ],
  "scope": { "tested": ["…"], "fyi": ["…"] },
  "missing": ["case sheet used at 01:10:00 — not in the inbox"],
  "kahoot": ["00:40:05 — reconstructed from discussion"],
  "mismatches": [{ "slide": 14, "t": "00:52:10", "slide_says": "…", "spoken": "…" }],
  "tricks": ["…"]
}
```

`questions` is in lecture order. Its index is what `outline.json` refers to, and every entry needs a `qa` item.

### `outline.json`

```json
{
  "sections": [
    { "n": 1, "heading": "what pain is", "theme": "mint", "slides": "1-8", "asked": [0, 1, 2] },
    { "n": 2, "heading": "opioids", "theme": "resp", "slides": "9-20, 2:1-4", "asked": [3, 4] }
  ],
  "skippedSlides": ["21"],
  "themes": { "resp": "opioids", "met": "non-opioids" },
  "tiers": { "1": "recall", "2": "application", "3": "dosing & monitoring" },
  "cases": [{ "setting": "Orthopedic unit", "tests": "opioid monitoring" }],
  "counts": { "practice": 42, "ngnCases": 8, "cards": 70, "qa": 52 }
}
```

`slides` takes `N`, `N-M`, comma lists, and `D:N-M` for deck D when the lecture has more than one deck. Every slide
in `extracted/slides*.md` belongs either to some section or to `skippedSlides` (title, objectives, references,
"questions?").

### `review.json`

This file comes from the independent content review (SKILL.md step 6b).

```json
{
  "findings": [
    { "item": "p-014", "severity": "blocking", "issue": "two defensible answers (B and D)", "status": "fixed" },
    { "item": "c03-q02", "severity": "minor", "issue": "rationale skips option C", "status": "fixed" }
  ],
  "spotCheck": [{ "item": "p-022", "src": "slide 31", "why": "dose" }],
  "uncertain": ["slide 18 image: table partly illegible — values taken from the transcript at 00:58:40"]
}
```

`quality-gate` fails while any `blocking` finding isn't `fixed`. A `minor` finding that is still open goes into the
PR under "Unsure".

### `autopilot.json`

This file belongs to `autopilot.mjs`, so don't edit it by hand. It holds the branch, attempt counters, decisions, and
the event log.

## Running unattended

From a terminal, in the repo:

```bash
tools/autopilot-run.sh            # one lecture per inbox folder, then exits
```

It starts `claude -p` in `dontAsk` permission mode with the project's allowlist (`.claude/settings.json`). An
action that isn't on the allowlist gets denied, never prompted, so the run can't hang waiting for a click. The
transcript goes to `sources/autopilot-logs/`.
