"""Transcribe class recordings into the timestamped transcript format the converter reads.

    python3 tools/transcribe.py sources/nurs419/<folder> [--model small.en] [--slides]
    python3 tools/transcribe.py --check          exit 0 if everything transcription needs is installed

Reads audio-NN.* in the folder (in name order), writes transcript.txt: one block per ~30 s,
"HH:MM:SS" on its own line, then the text. Timestamps run continuously across the files, and a
"=== audio-NN ===" marker shows where each recording starts.

Needs `python3 -m pip install --user faster-whisper` and network access to huggingface.co (model download, once).
Audio is decoded with PyAV, which faster-whisper installs with its own copy of the FFmpeg libraries, so the
`ffmpeg`/`ffprobe` commands are not needed (they were, and a Mac without them couldn't transcribe).
--slides seeds the recognizer with terms from slides*.pptx and supp-*.docx so drug and disease names come out right.
Whisper doesn't tell speakers apart; the transcript has no speaker labels.
"""
import argparse, glob, os, re, sys, zipfile

RATE = 16000
CHUNK = 20 * 60  # seconds per piece handed to Whisper; long recordings decoded whole were OOM-killed

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

def duration(path):
    import av
    with av.open(path, metadata_errors='ignore') as c:
        return c.duration / av.time_base if c.duration else 0.0

def pieces(path):
    """Yield (start_seconds, float32 mono 16 kHz samples) for each CHUNK of the file, decoding in one pass."""
    import av, numpy as np
    resampler = av.audio.resampler.AudioResampler(format='s16', layout='mono', rate=RATE)
    size, buf, have, start = CHUNK * RATE, [], 0, 0
    def flush():
        a = np.concatenate(buf).astype(np.float32) / 32768.0
        buf.clear()
        return a
    with av.open(path, metadata_errors='ignore') as c:
        for frame in c.decode(audio=0):
            frame.pts = None  # let the resampler run its own clock; container timestamps can jump
            try: out = resampler.resample(frame)
            except av.error.InvalidDataError: continue  # skip a corrupt frame rather than lose the recording
            for f in (out if isinstance(out, list) else [out]):
                a = f.to_ndarray().reshape(-1)
                buf.append(a); have += len(a)
                if have >= size:
                    yield start, flush(); start += have / RATE; have = 0
        for f in resampler.resample(None) or []:
            buf.append(f.to_ndarray().reshape(-1)); have += f.samples
    if have: yield start, flush()

def check():
    missing = []
    for mod, pkg in (('faster_whisper', 'faster-whisper'), ('av', 'faster-whisper'), ('numpy', 'faster-whisper')):
        try: __import__(mod)
        except ImportError: missing.append(pkg)
    if missing: sys.exit('transcription needs: python3 -m pip install --user ' + ' '.join(sorted(set(missing))))
    print('transcription ready')

def main():
    if sys.argv[1:] == ['--check']: return check()
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
        dur, decoded = duration(f), 0.0
        marker = len(out); out.append(None)
        block_start, block = None, []
        for c0, audio in pieces(f):
            decoded = c0 + len(audio) / RATE
            segs, _ = model.transcribe(audio, language='en', initial_prompt=prompt, vad_filter=True, beam_size=5,
                                       condition_on_previous_text=True)
            for s in segs:
                st, en = c0 + s.start, c0 + s.end
                if block_start is None: block_start = st
                block.append(s.text.strip())
                if en - block_start >= 30:
                    out += [hms(offset + block_start), ' '.join(block)]; block_start, block = None, []
                print(f'\r{os.path.basename(f)} {hms(en)} / {hms(dur or decoded)}', end='', file=sys.stderr, flush=True)
        if block: out += [hms(offset + block_start), ' '.join(block)]
        dur = decoded or dur  # the decoded length is exact; the header's can be missing or rounded
        out[marker] = f'=== {os.path.basename(f)} (starts {hms(offset)}, {dur / 60:.1f} min) ==='
        offset += dur
        print(file=sys.stderr)
    dest = os.path.join(a.folder, 'transcript.txt')
    open(dest, 'w').write(f'{os.path.basename(a.folder)} — transcript (Whisper {a.model}, no speaker labels)\n\n' + '\n'.join(out) + '\n')
    print('wrote', dest)

if __name__ == '__main__':
    main()
