"""Transcribe class recordings into the timestamped transcript format the converter reads.

    python3 tools/transcribe.py sources/nurs419/<folder> [--model small.en] [--slides]

Reads audio-NN.* in the folder (in name order), writes transcript.txt: one block per ~30 s,
"HH:MM:SS" on its own line, then the text. Timestamps run continuously across the files, and a
"=== audio-NN ===" marker shows where each recording starts.

Needs `pip install faster-whisper` and network access to huggingface.co (model download, once).
--slides seeds the recognizer with terms from slides*.pptx and supp-*.docx so drug and disease names come out right.
Whisper doesn't tell speakers apart; the transcript has no speaker labels.
"""
import argparse, glob, os, re, subprocess, sys, json, tempfile, zipfile

def slide_terms(paths, limit=180):
    words = {}
    for path in paths:
      if not zipfile.is_zipfile(path): continue
      with zipfile.ZipFile(path) as z:
        for n in z.namelist():
            if re.match(r'(ppt/(slides/slide|diagrams/data)\d+|word/document)\.xml$', n):
                for t in re.findall(r'<(?:a|w):t(?: [^>]*)?>([^<]+)</(?:a|w):t>', z.read(n).decode('utf8', 'ignore')):
                    for w in re.findall(r"[A-Za-z][A-Za-z\-]{5,}", t):
                        words[w.lower()] = words.get(w.lower(), 0) + 1
    # Decks that arrived as PDFs are extracted to markdown first (tools/pdf_slides.py); use that text too.
    for path in glob.glob(os.path.join(os.path.dirname(paths[0]) if paths else '.', 'extracted', 'slides*.md')) if paths else []:
        for w in re.findall(r"[A-Za-z][A-Za-z\-]{5,}", re.sub(r'\[image:[^\]]*\]', '', open(path, encoding='utf8').read())):
            words[w.lower()] = words.get(w.lower(), 0) + 1
    common = set('because between patient patients clinical process response cells important different through during'.split())
    top = [w for w, c in sorted(words.items(), key=lambda x: -x[1]) if w not in common][:limit]
    return ', '.join(top)

def hms(s):
    s = int(s); return f'{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder'); ap.add_argument('--model', default='small.en')
    ap.add_argument('--slides', action='store_true'); ap.add_argument('--threads', type=int, default=os.cpu_count())
    a = ap.parse_args()
    from faster_whisper import WhisperModel
    files = sorted(f for f in glob.glob(os.path.join(a.folder, 'audio-*')) if not f.endswith('.txt'))
    if not files: sys.exit('no audio-NN files in ' + a.folder)
    prompt = None
    docs = sorted(glob.glob(os.path.join(a.folder, 'slides*.pptx')) + glob.glob(os.path.join(a.folder, 'supp-*.docx')) +
                  glob.glob(os.path.join(a.folder, 'slides*.pdf')))
    if a.slides and docs:
        prompt = 'Nursing pathophysiology and pharmacology lecture. Terms: ' + slide_terms(docs)
    model = WhisperModel(a.model, device='cpu', compute_type='int8', cpu_threads=a.threads)
    out, offset = [], 0.0
    for f in files:
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                   capture_output=True, text=True).stdout.strip() or 0)
        out.append(f'=== {os.path.basename(f)} (starts {hms(offset)}, {dur / 60:.1f} min) ===')
        # Long recordings are decoded in 20-minute pieces so memory stays small (2-hour files were OOM-killed).
        CHUNK = 20 * 60
        block_start, block = None, []
        with tempfile.TemporaryDirectory() as tmp:
            for c0 in range(0, int(dur) + 1, CHUNK):
                piece = os.path.join(tmp, f'{c0}.wav')
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(c0), '-t', str(CHUNK), '-i', f,
                                '-ac', '1', '-ar', '16000', piece], check=True)
                segs, _ = model.transcribe(piece, language='en', initial_prompt=prompt, vad_filter=True, beam_size=5,
                                           condition_on_previous_text=True)
                for s in segs:
                    st, en = c0 + s.start, c0 + s.end
                    if block_start is None: block_start = st
                    block.append(s.text.strip())
                    if en - block_start >= 30:
                        out += [hms(offset + block_start), ' '.join(block)]; block_start, block = None, []
                    print(f'\r{os.path.basename(f)} {hms(en)} / {hms(dur)}', end='', file=sys.stderr, flush=True)
                os.remove(piece)
        if block: out += [hms(offset + block_start), ' '.join(block)]
        offset += dur
        print(file=sys.stderr)
    dest = os.path.join(a.folder, 'transcript.txt')
    open(dest, 'w').write(f'{os.path.basename(a.folder)} — transcript (Whisper {a.model}, no speaker labels)\n\n' + '\n'.join(out) + '\n')
    print('wrote', dest)

if __name__ == '__main__':
    main()
