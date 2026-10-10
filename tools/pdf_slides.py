#!/usr/bin/env python3
"""Extract a slide deck that arrived as a PDF (e.g. exported from an iPad) — step 2 of lecture-to-study-kit.

    python3 tools/pdf_slides.py sources/nurs419/<folder>            # every slides*.pdf in the folder

Writes extracted/<deck>.md with `## Slide N` headings and extracted/images/<deck>-NN.png (one picture per page,
so you can look at any slide). Text comes from the PDF's text layer when it is readable; when it is scrambled
(fonts with a broken character map — common in iPad/Quartz exports) or missing, the page is read with OCR
(tesseract) and marked `[ocr]`. OCR is approximate: check drug names and numbers against the page image.

Needs: pymupdf (pip install pymupdf) and tesseract on PATH.
"""
import glob, os, re, subprocess, sys

def readable(t):
    """True if text looks like real English (enough common words), not a scrambled cmap."""
    words = re.findall(r"[A-Za-z]{3,}", t)
    if len(words) < 3: return False
    common = {'the', 'and', 'for', 'with', 'are', 'pain', 'that', 'from', 'can', 'not', 'may', 'use', 'drug', 'patient',
              'lung', 'air', 'blood', 'cells', 'disease', 'effects', 'increase', 'decrease', 'of', 'to', 'in', 'is'}
    hits = sum(w.lower() in common for w in words)
    vowels = sum(c in 'aeiouAEIOU' for c in ''.join(words)) / max(1, len(''.join(words)))
    return hits >= 1 and 0.25 < vowels < 0.6

def ocr(png):
    r = subprocess.run(['tesseract', png, '-', '--psm', '3'], capture_output=True, text=True)
    return r.stdout

def main():
    import pymupdf
    folder = sys.argv[1]
    out_dir = os.path.join(folder, 'extracted'); img_dir = os.path.join(out_dir, 'images')
    os.makedirs(img_dir, exist_ok=True)
    decks = sorted(glob.glob(os.path.join(folder, 'slides*.pdf')))
    if not decks: sys.exit(f'no slides*.pdf in {folder}')
    for deck in decks:
        name = os.path.splitext(os.path.basename(deck))[0]
        doc = pymupdf.open(deck); lines = [f'# {name} ({len(doc)} pages)', '']
        n_ocr = 0
        for i, page in enumerate(doc, 1):
            png = os.path.join(img_dir, f'{name}-{i:02d}.png')
            page.get_pixmap(dpi=150).save(png)
            text = page.get_text().strip()
            tag = ''
            if not readable(text):
                text = ocr(png).strip(); tag = ' [ocr]'; n_ocr += 1
            text = re.sub(r'\n{3,}', '\n\n', text)
            body = [l.strip() for l in text.split('\n') if l.strip()]
            first = body[0] if body else '(no text found — look at the image)'
            lines += [f'## Slide {i} — {first}{tag}', *[f'- {l}' for l in body[1:]], f'[image: images/{name}-{i:02d}.png]', '']
        with open(os.path.join(out_dir, name + '.md'), 'w') as f: f.write('\n'.join(lines) + '\n')
        print(f'{deck}: {len(doc)} slides, {n_ocr} read with OCR → extracted/{name}.md')

if __name__ == '__main__':
    main()
