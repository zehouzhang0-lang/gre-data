"""Merge individually licensed recordings into the offline pronunciation manifest."""
from pathlib import Path
import hashlib, json
ROOT=Path(__file__).resolve().parents[3]
PUBLIC=ROOT/'platform/mobile/public'
SOURCE=ROOT/'.gre-platform/pronunciation-source'
manifest=json.loads((PUBLIC/'pronunciation.json').read_text(encoding='utf-8'))
overlay=json.loads((SOURCE/'human-overlay.json').read_text(encoding='utf-8')) if (SOURCE/'human-overlay.json').exists() else {}
counts={'words':len(manifest['words']),'dictionary_ipa':0,'human':0,'synthetic':0,'pending_ipa':0}
for word, accents in manifest['words'].items():
    for accent,item in accents.items():
        human=overlay.get(word,{}).get(accent)
        if human and human['ipa_match']==item['ipa']:
            item['fallback']=item.get('fallback',item['audio']);item['audio']=human['audio'];item['kind']='human'
            item['recording']={k:v for k,v in human.items() if k not in ('audio','kind','ipa_match')}
        counts[item['kind']]+=1
        counts['dictionary_ipa' if item['ipa'] else 'pending_ipa']+=1
manifest['coverage']=counts
manifest['assets']={}
for accents in manifest['words'].values():
    for item in accents.values():
        for name in [item.get('audio'),item.get('fallback')]:
            if name and name not in manifest['assets']:
                data=(PUBLIC/name).read_bytes()
                if len(data)<1000: raise ValueError('Truncated audio: '+name)
                manifest['assets'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
(PUBLIC/'pronunciation.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(SOURCE/'coverage.json').write_text(json.dumps(counts,indent=2),encoding='utf-8')
audio_root=(PUBLIC/'pronunciation-audio').resolve()
used={Path(name).name for name in manifest['assets']}
for path in audio_root.iterdir():
    # Remove only obsolete generated MP3s inside this exact build output folder.
    if path.resolve().parent==audio_root and path.is_file() and path.suffix=='.mp3' and path.name not in used: path.unlink()
print(counts)
