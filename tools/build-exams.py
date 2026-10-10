#!/usr/bin/env python3
"""Assemble practice exams (IMP-15) from per-lecture question files.

    python3 tools/build-exams.py <items-dir> --first 1 [--minutes 90] [--seed 20261009]

<items-dir> holds one <lecture-id>.json per lecture: a list of questions written to
tools/reference/exam-brief.md, each with "form": 1..N. Form k of every lecture becomes exam (first + k - 1):
public/exams/exam-<n>.json, with ids x<n>-q01…, options shuffled (mc answers dealt evenly across A–D) and
public/exams/exams.json updated. Existing exams with other numbers are kept; never rebuild a published exam
(its ids are in id-ledger.json) — add new exams with a higher --first instead.
"""
import argparse, collections, copy, glob, json, os, random

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
L = 'ABCDEF'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('items_dir'); ap.add_argument('--first', type=int, required=True)
    ap.add_argument('--minutes', type=int, default=90); ap.add_argument('--seed', type=int, default=20261009)
    a = ap.parse_args()
    rng = random.Random(a.seed); slots = []
    lectures = json.load(open(os.path.join(ROOT, 'public/lectures/index.json')))['lectures']
    order = {l['id']: l['num'] for l in lectures}
    files = sorted(glob.glob(os.path.join(a.items_dir, '*.json')), key=lambda f: order[os.path.basename(f)[:-5]])
    data = {os.path.basename(f)[:-5]: json.load(open(f)) for f in files}
    lecs = list(data)
    forms = sorted({q['form'] for qs in data.values() for q in qs})

    def shuffle(q):
        nonlocal slots
        q = copy.deepcopy(q)
        if q['type'] == 'mc':
            if not slots: slots = list('ABCD'); rng.shuffle(slots)
            t = L.index(slots.pop()); i = L.index(q['answer'].strip())
            rest = [o for k, o in enumerate(q['options']) if k != i]; rng.shuffle(rest)
            rest.insert(t, q['options'][i]); q['options'] = rest; q['answer'] = L[t]; return q
        perm = list(range(len(q['options']))); rng.shuffle(perm); new = {o: k for k, o in enumerate(perm)}
        q['answer'] = ', '.join(sorted(L[new[L.index(x.strip())]] for x in q['answer'].split(',')))
        q['options'] = [q['options'][o] for o in perm]; return q

    text = lambda q: sorted(q['options'][L.index(x.strip())] for x in q['answer'].split(','))
    out_dir = os.path.join(ROOT, 'public/exams'); os.makedirs(out_dir, exist_ok=True)
    man_path = os.path.join(out_dir, 'exams.json')
    manifest = json.load(open(man_path))['exams'] if os.path.exists(man_path) else []
    for k, form in enumerate(forms):
        n = a.first + k; items = []
        for lid in lecs:
            for q in [q for q in data[lid] if q['form'] == form]:
                s = shuffle(q); assert text(s) == text(q), q['stem']
                items.append({'lecture': lid, 'kind': q['kind'], 'topic': q['topic'], 'type': q['type'], 'stem': q['stem'],
                              'options': s['options'], 'answer': s['answer'], 'rationale': q['rationale'], 'src': q['src']})
        items = [{'id': f'x{n}-q{i:02d}', **q} for i, q in enumerate(items, 1)]
        ex = {'id': f'exam-{n}', 'title': f'Practice Exam {n}', 'lectures': lecs, 'minutes': a.minutes, 'items': items}
        json.dump(ex, open(os.path.join(out_dir, f'exam-{n}.json'), 'w'), ensure_ascii=False, indent=1)
        manifest = [m for m in manifest if m['id'] != ex['id']] + [{'id': ex['id'], 'title': ex['title'], 'questions': len(items), 'lectures': lecs, 'minutes': a.minutes}]
        mc = [q for q in items if q['type'] == 'mc']
        print(f"exam-{n}: {len(items)} questions · mc answers {dict(sorted(collections.Counter(q['answer'] for q in mc).items()))} · "
              f"{dict(collections.Counter(q['kind'] for q in items))}")
    manifest.sort(key=lambda m: int(m['id'].split('-')[1]))
    json.dump({'exams': manifest}, open(man_path, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
