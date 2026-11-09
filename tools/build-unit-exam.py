#!/usr/bin/env python3
"""Assemble a graduate-format unit exam from one spec file.

    python3 tools/build-unit-exam.py <spec.json> [--seed 20261108]

The spec holds the exam's fixed fields (number, title, lectures, minutes, benchmark, sections, cases, skills, kinds)
and "items" (brief: tools/reference/unit-exam-brief.md). Items keep their written order, which is the form's order.
Options are shuffled, with mc answers dealt evenly across A–D. Writes public/exams/exam-<number>.json and updates
exams.json. Never rebuild a published exam: its ids are in id-ledger.json, so add a new number instead.
"""
import argparse, collections, json, os, random

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
L = 'ABCDEF'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('spec'); ap.add_argument('--seed', type=int, default=20261108)
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding='utf8'))
    rng = random.Random(a.seed); slots = []
    n = spec['number']; items = []

    def shuffle(q):
        nonlocal slots
        o = q['options']
        if q['type'] == 'mc':
            if not slots: slots = list('ABCD'); rng.shuffle(slots)
            t = L.index(slots.pop()); i = L.index(q['answer'].strip())
            rest = [x for k, x in enumerate(o) if k != i]; rng.shuffle(rest); rest.insert(t, o[i])
            return rest, L[t]
        perm = list(range(len(o))); rng.shuffle(perm); new = {p: k for k, p in enumerate(perm)}
        return [o[p] for p in perm], ', '.join(sorted(L[new[L.index(x.strip())]] for x in q['answer'].split(',')))

    text = lambda opts, ans: sorted(opts[L.index(x.strip())] for x in ans.split(','))
    for i, q in enumerate(spec['items'], 1):
        opts, ans = shuffle(q)
        assert text(opts, ans) == text(q['options'], q['answer']), q['stem']
        it = {'id': f'x{n}-q{i:02d}', 'section': q['section']}
        if q.get('case'): it['case'] = q['case']
        items.append({**it, 'lecture': q['lecture'], 'kind': q['kind'], 'skill': q['skill'], 'topic': q['topic'], 'type': q['type'],
                      'stem': q['stem'], 'options': opts, 'answer': ans, 'rationale': q['rationale'], 'src': q['src']})
    keys = ['title', 'lectures', 'minutes', 'benchmark', 'sections', 'cases', 'skills', 'kinds']
    ex = {'id': f'exam-{n}', 'format': 'graduate', **{k: spec[k] for k in keys}, 'items': items}
    out = os.path.join(ROOT, 'public/exams')
    json.dump(ex, open(os.path.join(out, f'exam-{n}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    man = os.path.join(out, 'exams.json'); exams = json.load(open(man, encoding='utf8'))['exams']
    exams = [e for e in exams if e['id'] != ex['id']] + [{'id': ex['id'], 'title': ex['title'], 'format': 'graduate', 'questions': len(items), 'lectures': ex['lectures'], 'minutes': ex['minutes']}]
    exams.sort(key=lambda e: int(e['id'].split('-')[1]))
    json.dump({'exams': exams}, open(man, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    c = lambda k: dict(sorted(collections.Counter(q[k] for q in items).items()))
    print(f"exam-{n}: {len(items)} questions · sections {c('section')} · {c('kind')} · {c('skill')} · {c('type')}")
    print(f"lectures {c('lecture')}")
    print(f"mc answers {dict(sorted(collections.Counter(q['answer'] for q in items if q['type']=='mc').items()))}")

if __name__ == '__main__':
    main()
