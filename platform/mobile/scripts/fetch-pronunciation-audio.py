"""Opt-in Wikimedia lookup. Sends only public filenames, word and accent metadata.
User authorization is required before running this script against a personal list.
Checks each file's license and attribution; unverified files stay synthetic.
"""
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, hashlib, json, re, subprocess, time, threading
import requests
from bs4 import BeautifulSoup
import runpy

BUILD = runpy.run_path(str(Path(__file__).with_name('build-pronunciation.py')))
ROOT, SOURCE, PUBLIC = BUILD['ROOT'], BUILD['SOURCE'], BUILD['PUBLIC']
HEADERS = {'User-Agent':'GREVocabulary/0.1.9 (personal offline pronunciation; license attribution lookup)'}
ALLOWED = {'cc0','pd','pd-self','cc-by-4.0','cc-by-sa-4.0','cc-by-3.0','cc-by-sa-3.0','cc-by-2.0','cc-by-sa-2.0','cc-by-2.5','cc-by-sa-2.5'}
limited=threading.Event()

def request(url, **kwargs):
    if limited.is_set(): raise RuntimeError('Wikimedia rate limited; no further requests this run')
    for attempt in range(3):
        try:
            response = requests.get(url, headers=HEADERS,timeout=30, **kwargs)
            if response.status_code==429:
                limited.set()
                raise RuntimeError('HTTP 429; stopped further requests; Retry-After='+response.headers.get('Retry-After','unspecified'))
            response.raise_for_status(); return response
        except requests.RequestException:
            if attempt==2: raise
            time.sleep(2)
    raise RuntimeError('rate limited')

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--ffmpeg',required=True); parser.add_argument('--authorized',action='store_true')
    parser.add_argument('--cached-metadata',action='store_true',help='Use already downloaded license responses; no metadata requests')
    args=parser.parse_args()
    if not args.authorized: raise SystemExit('Explicit authorization required: --authorized')
    seed=json.loads((PUBLIC/'vocabulary-seed.json').read_text(encoding='utf-8'))['payload']['baseline']
    definitions={d['word']:d for d in seed['definitions']}; words={w['word']:w for w in seed['vocabulary']}
    for word,d in definitions.items(): words.setdefault(word,{'word':word,**d.get('input',{})})
    records=json.loads((SOURCE/'index.json').read_text(encoding='utf-8'))
    candidates={}; references={}
    for record in records:
        word=record['word']; item=words[word]
        positions=[BUILD['POS'].get(g['pos']) for g in definitions.get(word,{}).get('senses',[])] or [BUILD['POS'].get(item.get('pos'))]
        entries=record['entries']
        matching=next(([e for e in entries if e['pos']==p] for p in positions if p and any(e['pos']==p for e in entries)),[])
        if positions and positions[0] and not matching: continue
        if matching: entries=matching
        for accent in ['gb','us']:
            options=BUILD['candidates'](entries,accent)
            if not options: continue
            entry,ipa=options[0]
            # A generic recording cannot safely resolve an ambiguous heteronym.
            if len({s['ipa'] for _,s in options})!=1: continue
            for sound in entry['sounds']:
                tags=set(sound.get('tags',[]))
                if not sound.get('audio') or not tags & BUILD['ACCENTS'][accent] or tags & BUILD['BAD']: continue
                filename=sound['audio']; candidates[filename]=sound
                references.setdefault(filename,[]).append((word,accent,ipa['ipa']))
                break
    cache=SOURCE/'commons'; cache.mkdir(exist_ok=True)
    files=sorted(candidates); metadata={}; failures=[]
    def collect(result):
        normalization={n['to']:n['from'] for n in result.get('query',{}).get('normalized',[])}
        for page in result.get('query',{}).get('pages',{}).values():
            title=normalization.get(page['title'],page['title'])[5:]
            if page.get('imageinfo'): metadata[title]=page['imageinfo'][0]
    if args.cached_metadata:
        for cached in cache.glob('*.json'): collect(json.loads(cached.read_text(encoding='utf-8')))
    for start in range(0,len(files),40):
        if args.cached_metadata: break
        batch=files[start:start+40]; key=hashlib.sha256('|'.join(batch).encode()).hexdigest()[:24]
        target=cache/(key+'.json')
        try:
            if target.exists(): result=json.loads(target.read_text(encoding='utf-8'))
            else:
                if args.cached_metadata: continue
                result=request('https://commons.wikimedia.org/w/api.php',params={'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','titles':'|'.join('File:'+f for f in batch)}).json()
                target.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
            collect(result)
        except Exception as error: failures.append({'batch':start,'error':str(error)[:160]})
        if start%200==0: print(f'license metadata {min(start+40,len(files))}/{len(files)}',flush=True)
    output=PUBLIC/'pronunciation-audio'; output.mkdir(exist_ok=True)
    def download(filename, info):
        meta=info.get('extmetadata',{})
        def val(key): return BeautifulSoup(str(meta.get(key,{}).get('value','')),'html.parser').get_text(' ',strip=True)
        license=val('License').lower()
        if license not in ALLOWED or not val('Artist') or val('Restrictions'): return None
        # Do not call a machine-generated file a human voice.
        description=val('ImageDescription').lower()
        if re.search(r'text.to.speech|synthe[st]|computer.generated|ai.generated',description): return None
        if not (filename.lower().startswith(('en-us-','en-uk-','en-gb-','ll-q1860')) or 'recording' in description): return None
        url=info['url'].split('?')[0]
        if urlparse(url).hostname!='upload.wikimedia.org': return None
        key=hashlib.sha256(('commons-v1|'+url).encode()).hexdigest()[:24]
        dest=output/(key+'.mp3'); raw=cache/(key+Path(urlparse(url).path).suffix)
        if not dest.exists():
            if not raw.exists(): raw.write_bytes(request(url).content)
            partial=dest.with_suffix('.part.mp3')
            subprocess.run([args.ffmpeg,'-v','error','-i',str(raw),'-ac','1','-ar','24000','-codec:a','libmp3lame','-b:a','48k','-y',str(partial)],check=True)
            if partial.stat().st_size<1000: raise ValueError('audio too short')
            partial.replace(dest)
        return {'audio':'pronunciation-audio/'+dest.name,'kind':'human','author':val('Artist'),'credit':val('Credit'),'license':val('LicenseShortName'),'license_url':val('LicenseUrl'),'source':info['descriptionurl'],'original':url,'adaptation':'Converted to mono 24 kHz MP3; pronunciation unchanged','checked_at':'2026-10-18'}
    overlay={}; done=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(download,f,metadata[f]):f for f in files if f in metadata}
        for future in as_completed(futures):
            filename=futures[future]; done+=1
            try:
                result=future.result()
                if result:
                    for word,accent,ipa in references[filename]: overlay.setdefault(word,{})[accent]={**result,'ipa_match':ipa}
            except Exception as error: failures.append({'file':filename,'error':str(error)[:160]})
            if done%100==0: print(f'audio checked {done}/{len(futures)}',flush=True)
    (SOURCE/'human-overlay.json').write_text(json.dumps(overlay,ensure_ascii=False),encoding='utf-8')
    (SOURCE/'human-report.json').write_text(json.dumps({'candidates':len(files),'accepted':sum(len(v) for v in overlay.values()),'rate_limited':limited.is_set(),'failure_count':len(failures),'failures':failures[:50]},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Accepted human recordings:',sum(len(v) for v in overlay.values()),'failures:',len(failures),flush=True)

if __name__=='__main__': main()
