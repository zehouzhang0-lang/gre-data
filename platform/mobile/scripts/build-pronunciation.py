"""Build free, offline GB/US pronunciation assets; never touches learning data.

Inputs: fetch-pronunciation.py's public Wiktionary bulk extract and official
Kokoro v1.0 ONNX/voices. Binary inputs/outputs stay outside Git. No cloud calls.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, subprocess, tempfile, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import onnxruntime as ort
import espeakng_loader
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT/'platform/mobile/public'
TOOLS = ROOT/'.gre-platform/pronunciation-tools'
SOURCE = ROOT/'.gre-platform/pronunciation-source'
POS = {'v.':'verb','vt.':'verb','vi.':'verb','n.':'noun','adj.':'adj','adv.':'adv','prep.':'prep','conj.':'conj','pron.':'pron','phr.':'phrase'}
ACCENTS = {'gb': {'UK','British','Received-Pronunciation','Southern-England'}, 'us': {'US','General-American'}}
BAD = {'obsolete','archaic','nonstandard','proscribed','dialectal','dated','rare'}
MODEL_HASHES = {
    'kokoro-v1.0.onnx':'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
    'voices-v1.0.bin':'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}

class BuildKokoro(Kokoro):
    def _create_audio(self, phonemes, voice, speed):
        tokens = self.tokenizer.tokenize(phonemes)
        # kokoro-onnx 0.5.0 assumes int32 speed for input_ids exports; the
        # official v1.0 model declares float. Respect the model's actual types.
        ids = np.array([[0, *tokens, 0]], dtype=np.int64)
        inputs = {i.name:i.type for i in self.sess.get_inputs()}
        feed = {'input_ids' if 'input_ids' in inputs else 'tokens':ids,
                'style':np.array(voice[len(tokens)],dtype=np.float32),
                'speed':np.array([speed],dtype=np.float32 if inputs['speed']=='tensor(float)' else np.int32)}
        return self.sess.run(None,feed)[0],24000

def candidates(entries, accent):
    explicit, shared = [], []
    for entry in entries:
        for sound in entry.get('sounds', []):
            tags = set(sound.get('tags', []))
            if 'ipa' not in sound or tags & BAD or sound.get('note'): continue
            if tags & ACCENTS[accent]: explicit.append((entry, sound))
            elif not tags:
                # Unlabelled IPA with a distinctly regional vowel is not proof
                # of both accents. Keep that accent pending instead of guessing.
                if accent=='us' and any(v in sound['ipa'] for v in ['ɒ','əʊ']): continue
                if accent=='gb' and any(v in sound['ipa'] for v in ['ɚ','ɝ']): continue
                shared.append((entry, sound))
    return explicit or shared

def phonemes(ipa, accent='gb'):
    # Preserve the source IPA in the manifest. These are model-input adaptations,
    # not edits to dictionary transcription. Include optional schwa, omit (r)
    # (linking r is not pronounced in an isolated British word).
    value = ipa.strip('/[]')
    if accent=='gb': value=value.replace('(ɹ)', '').replace('(r)', '')
    value = value.replace('(', '').replace(')', '').replace('.', '').replace('͡', '').replace('͜', '').replace('ˑ', '')
    value = re.sub(r'([lmn])̩', r'ə\1', value).replace('̯', '')
    value = value.replace('r', 'ɹ').replace('g', 'ɡ').replace('ɫ', 'l').replace('ɚ', 'əɹ').replace('ɝ', 'ɜɹ')
    # Kokoro's English front end places stress immediately before the vowel,
    # while dictionary IPA puts it before the entire syllable onset.
    return re.sub(r'([ˈˌ])([^aeiouɑæɒɔəɛɜɪʊʌɐᵻ\s]*)', r'\2\1', value)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--limit', type=int)
    parser.add_argument('--only', nargs='*')
    parser.add_argument('--plan-only', action='store_true')
    args = parser.parse_args()
    for name, expected in MODEL_HASHES.items():
        with (TOOLS/name).open('rb') as file:
            if hashlib.file_digest(file,'sha256').hexdigest()!=expected: raise ValueError('Model checksum mismatch: '+name)
    seed = json.loads((PUBLIC/'vocabulary-seed.json').read_text(encoding='utf-8'))['payload']['baseline']
    source = {r['word']: r for r in json.loads((SOURCE/'index.json').read_text(encoding='utf-8'))}
    definitions = {r['word']: r for r in seed.get('definitions', [])}
    corrections = json.loads(Path(__file__).with_name('pronunciation-corrections.json').read_text(encoding='utf-8'))
    words = {w['word']: w for w in seed['vocabulary']}
    for word, definition in definitions.items(): words.setdefault(word, {'word':word, **definition.get('input',{})})
    # The Windows eSpeak DLL cannot read a Unicode data path. A private ASCII
    # temp copy avoids any machine-wide installation or configuration changes.
    data = Path(tempfile.gettempdir())/'gre-pronunciation-espeak-data'
    if not data.exists(): shutil.copytree(espeakng_loader.get_data_path(), data)
    options = ort.SessionOptions(); options.intra_op_num_threads = 2; options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(TOOLS/'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    kokoro = BuildKokoro.from_session(session, str(TOOLS/'voices-v1.0.bin'), espeak_config=EspeakConfig(data_path=str(data)))
    output = PUBLIC/'pronunciation-audio'; output.mkdir(exist_ok=True)
    manifest = {'schema_version':1, 'revision':'2026-10-18', 'source_dump':'2026-09-02', 'words':{}}
    report = {'words':len(words), 'dictionary_ipa':0, 'pending_ipa':[], 'generated':0}
    started = time.time()
    jobs = {}
    selected = sorted(words)
    if args.only: selected = [w for w in selected if w in args.only]
    if args.limit: selected = selected[:args.limit]
    for index, word in enumerate(selected):
        item = words[word]; record = source.get(word, {})
        wanted = [POS.get(g['pos']) for g in definitions.get(word, {}).get('senses', [])] or [POS.get(item.get('pos'))]
        entries = record.get('entries', [])
        matching = next(([e for e in entries if e['pos']==p] for p in wanted if p and any(e['pos']==p for e in entries)), [])
        # Never use a noun's pronunciation for a verb merely because it is first.
        if wanted and wanted[0] and not matching: entries = []
        elif matching: entries = matching
        result = {}
        for accent, voice in [('gb','bf_emma'),('us','af_heart')]:
            choices = candidates(entries, accent)
            ipa = None
            for entry, sound in choices:
                candidate = phonemes(sound['ipa'],accent)
                # Skip abbreviated or ambiguous transcriptions; try a complete
                # alternative from the same POS/accent rather than inventing IPA.
                if any(c not in kokoro.tokenizer.vocab for c in candidate) or any(c in candidate for c in ',/-~'): continue
                ipa = sound['ipa']; phone = candidate
                report['dictionary_ipa'] += 1; break
            correction = corrections.get(word)
            if correction:
                if not ipa: report['dictionary_ipa'] += 1
                ipa = correction[accent]; phone = phonemes(ipa,accent)
            if not ipa:
                phone = kokoro.tokenizer.phonemize(word, 'en-gb' if accent=='gb' else 'en-us')
                report['pending_ipa'].append({'word':word,'accent':accent})
            phone += '.'
            key = hashlib.sha256(f'kokoro-v2|{voice}|{phone}'.encode()).hexdigest()[:24]+'.mp3'
            target = output/key
            if not target.exists():
                jobs[key] = (phone, voice, target, word, accent)
            variant = {'ipa':ipa, 'audio':'pronunciation-audio/'+key, 'kind':'synthetic', 'voice':voice}
            if ipa:
                variant.update({'pos':entry['pos'], 'source':record['url'], 'tags':sound.get('tags',[]), 'license':'CC BY-SA 4.0'})
                if correction:
                    variant.update({'source':correction['source'], 'publisher':correction['publisher'], 'license':'short IPA reference', 'checked_at':correction['checked_at']})
            result[accent] = variant
        manifest['words'][word] = result
    if args.plan_only:
        (SOURCE/'plan.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
        (SOURCE/'planned-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print({k:v if k!='pending_ipa' else len(v) for k,v in report.items()},flush=True)
        return
    def generate(job):
        phone, voice, target, word, accent = job
        audio, sr = kokoro.create(phone, voice, is_phonemes=True)
        if not np.isfinite(audio).all() or len(audio)<2400 or np.max(np.abs(audio))<0.005: raise ValueError(f'Invalid audio: {word} {accent}')
        partial = target.with_suffix('.part.mp3')
        subprocess.run([args.ffmpeg,'-v','error','-f','f32le','-ar',str(sr),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','48k','-y',str(partial)], input=audio.astype('<f4').tobytes(), check=True)
        partial.replace(target)
    print(f'Prepared {len(selected)} words, {len(jobs)} audio files to generate',flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        for future in as_completed([pool.submit(generate,job) for job in jobs.values()]):
            future.result(); report['generated'] += 1
            if report['generated']%100==0: print(f"{report['generated']}/{len(jobs)} audio files; {time.time()-started:.1f}s",flush=True)
    name = 'pronunciation-sample.json' if args.only or args.limit else 'pronunciation.json'
    (PUBLIC/name).write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (SOURCE/'build-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print({k:v if k!='pending_ipa' else len(v) for k,v in report.items()}, flush=True)

if __name__=='__main__': main()
