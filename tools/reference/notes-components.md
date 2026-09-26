# Notebook components for `notes.html`

Every class below already exists in `public/assets/css/notebook.css` (a few, like `cover-title`, are plain wrappers). `npm run build` rejects any other class. Build notes **only** from these —
never add CSS, `<style>`, or `style=` color values, so every lecture looks like one notebook.
The full working example is `public/lectures/2026-09-10-acid-base/notes.html`; open it when unsure how a piece looks.

Pages are `<section class="page">` blocks, one after another. Aim for 7–12 pages; each page is roughly one letter-size sheet (2 banners max).

## Color roles (reuse by meaning)

The palette has two "system" colors inherited from Acid–Base. In a new lecture, assign them to the lecture's two main
contrasting systems/themes and say so in the cover's color key.

| Class suffix | Color | Role in a new lecture |
|---|---|---|
| `resp` / `blue` / `hl-blue` | blue | theme A (e.g. sympathetic, left heart, type 1) |
| `met` | peach | theme B (e.g. parasympathetic, right heart, type 2) |
| `mint` | green | basics, definitions, normal physiology |
| `lav` | lavender | related systems (electrolytes, other organs, drug classes) |
| `yel` / `hl` | yellow | memorize — numbers, must-know facts |
| `pink` / `hl-pink` | pink | **asked in class**, exam warnings |

## Cover (page 1)

```html
<section class="page cover">
  <div class="tape t1"></div>
  <div class="cover-title">
    <div class="course">NURS 419 · Patho/Pharm I · UIC MSN</div>
    <h1>Topic<br>Title</h1>
    <div class="sub">lecture notes · Instructor, CREDS · Mon D, YYYY</div>
  </div>
  <div class="cover-grid">
    <div class="sticky yellow rot-l"><div class="sticky-title">know these cold ✎</div><div class="big">Value <b>range</b></div>…</div>
    <div class="box pink"><div class="box-title">what she said about the exam</div><ul><li>…</li></ul></div>
    <div class="box blue"><div class="box-title">the big picture</div>…</div>
    <div class="box mint"><div class="box-title">objectives (slides 2–3)</div><ul class="check"><li>…</li></ul></div>
  </div>
  <div class="color-key">
    <span><i class="k resp"></i>theme A</span><span><i class="k met"></i>theme B</span><span><i class="k yel"></i>memorize</span>
    <span><i class="k pink"></i>asked in class</span><span><i class="k lav"></i>related</span><span><i class="k mint"></i>basics</span>
  </div>
</section>
```

## Section banner

```html
<h2 class="banner mint">1 · short lowercase heading</h2>        <!-- mint | lav | resp | met | yel -->
<h2 class="banner" style="background:var(--pink);color:var(--pink-d)">…</h2>  <!-- the one allowed inline style: pink banner -->
```
Number banners in order (`1 ·`, `2 ·` …). Headings are short, lowercase, in her words where possible.

## Layout

`<div class="two">`, `<div class="three">`, `<div class="four">` — grids that stack on phones.

## Callouts

| Component | Use for | Markup |
|---|---|---|
| asked in class | every in-class question tied to this section | `<div class="asked"><b>she asked:</b> "question?" → <span class="hl">answer</span></div>` — use `he asked:` / `she asked:` to match the instructor who asked (`student asked:` for student questions) |
| sticky note | must-memorize facts, her tricks | `<div class="sticky yellow rot-r small"><div class="sticky-title">title</div>…</div>` (colors: default yellow, `pink`, `blue`, `peach`, `red`; `rot-l`/`rot-r`; `small`; `inline`) |
| box | grouped content | `<div class="box mint"><div class="box-title">title</div>…</div>` (`pink`, `blue`, `mint`, `resp`) |
| pearl | a single clinical pearl / her quote | `<div class="pearl">✎ her pearl: <span class="hl">…</span></div>` |
| FYI | content she said is **not tested** | `<div class="fyi">FYI only — she will not test: …</div>` |
| definition | paired definitions | `<div class="def resp-bg">…</div>` — `resp-bg`, `met-bg`, `acid-bg` (red), `base-bg` (blue) |

## Structures

| Component | Use for | Markup |
|---|---|---|
| mnemonic | any acronym she taught | `<div class="mnem resp"><div class="mnem-h">WORD <span class="tiny">"her hint"</span></div><ul><li><b class="letter">W</b><span>meaning</span></li>…</ul></div>` (`resp` or `met`) |
| numbered steps | procedures, interpretation methods | `<div class="steps"><div class="step"><span class="n">1</span>text</div>…</div>` |
| flow | cause → effect chains | `<div class="flow"><span>cause</span> → <span>effect</span> → <span>result</span></div>` |
| ladder | graded levels / stages (up to 4) | `<div class="ladder"><div class="rung"><b>stage</b><br>…</div>…</div>` (4th may be `rung mixed`) |
| compare | two sides side by side | `<div class="comp"><div class="comp-side"><div class="comp-h">side A</div>…</div><div class="comp-side">…</div></div>` |
| concept cards | 3 key terms | `<div class="three"><div class="card"><div class="card-h">TERM</div>meaning<br><span class="tiny">examples</span></div>…</div>` |
| equation box | a formula or key relationship | `<div class="eq-box"><div class="eq-title">title <span class="tiny">note</span></div><div class="eq"><span class="eq-t">A ⇌ B</span></div></div>` |
| table | values, drug comparisons | `<table class="hand"><tr><th>col</th>…</tr><tr><td>…</td></tr></table>` (`hand small` for dense tables) |
| mini case | short worked examples | `<div class="case resp-bg"><b>A · patient</b><br>findings<br>→ <b>answer</b><br><span class="tiny">why</span></div>` |
| sub-heading | inside a column | `<div class="sub-h">signs &amp; symptoms</div>` |
| recap | end-of-lecture summary | `<div class="divider">✦ &nbsp; ✦ &nbsp; ✦</div><div class="recap"><div class="recap-h">at a glance</div><div class="four">…</div></div>` |
| end mark | last line of the last page | `<div class="end">✦ end of lecture M/D ✦</div>` |

## Inline

- Highlighters: `<span class="hl">`, `<span class="hl-pink">`, `<span class="hl-blue">`
- Direction arrows: `<span class="up">↑</span>`, `<span class="dn">↓</span>`
- Theme text: `<span class="resp-t">`, `<span class="met-t">`
- Small print: `<span class="tiny">`, lead line: `<p class="lead">`, big numbers: `<div class="big">… <b>7.35 – 7.45</b></div>`
- Lists: `<ul class="dots">` (bullets), `<ul class="check">` (checkbox list)
- Use real symbols: ₂ ₃ ⁺ ⁻ → ↑ ↓ ≥ ≤ · –

Acid–Base-specific pieces (`scale`, `swap`, `cell`, `ion`, `rome`, `abg-line`, `quad`, `acid`/`base` text) may be reused only
when they genuinely fit; don't force them.

Doodles: small inline `<svg class="doodle" viewBox="…">` line drawings in banners are optional. Keep them simple (a few paths,
stroke `#4f4f4f` or a theme color, `stroke-width="3"`, round caps). Skip them rather than draw something inaccurate.
