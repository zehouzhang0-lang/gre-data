"""Collect only pronunciation fields from Wiktionary/Kaikki; no paid API.
Run with requests installed. Caches are local build inputs, not learning data.
"""
from pathlib import Path
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, json, hashlib, time, gzip, sys

ROOT=Path(__file__).resolve().parents[3]
CACHE=ROOT/'.gre-platform/pronunciation-source'
CACHE.mkdir(parents=True,exist_ok=True)
seed=json.loads((ROOT/'platform/mobile/public/vocabulary-seed.json').read_text(encoding='utf-8'))['payload']
words=sorted({w['word'] for w in seed['baseline']['vocabulary']} | {d['word'] for d in seed['baseline'].get('definitions',[])})
HEADERS={'User-Agent':'GREVocabulary/0.1.9 (personal offline dictionary; pronunciation metadata)'}

def fetch(word):
    target=CACHE/(hashlib.sha256(word.encode()).hexdigest()[:24]+'.json')
    if target.exists(): return json.loads(target.read_text(encoding='utf-8'))
    url='https://kaikki.org/dictionary/English/meaning/'+quote(word[:1],safe='')+'/'+quote(word[:2],safe='')+'/'+quote(word,safe='')+'.jsonl'
    result={'word':word,'url':url,'source':'English Wiktionary via Kaikki','license':'CC BY-SA 4.0','fetched_at':'2026-10-18','entries':[]}
    for attempt in range(3):
        try:
            response=requests.get(url,headers=HEADERS,timeout=35)
            if response.status_code==404: result['status']='not_found'; break
            if response.status_code in (429,503): time.sleep(3*(attempt+1)); continue
            response.raise_for_status()
            entries=[json.loads(line) for line in response.text.splitlines() if line.strip()]
            result['entries']=[{'pos':e.get('pos'),'sounds':e.get('sounds',[])} for e in entries if e.get('word')==word and e.get('lang_code')=='en']
            result['status']='ok'; break
        except Exception as e: result['error']=str(e)[:200]; time.sleep(attempt+1)
    target.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    return result

if __name__=='__main__':
    if '--per-word' not in sys.argv:
        # Default: inbound public bulk download, then entirely local filtering.
        bulk=CACHE/'english.jsonl.gz'
        url='https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz'
        if not bulk.exists():
            with requests.get(url,headers=HEADERS,stream=True,timeout=120) as r:
                r.raise_for_status()
                with bulk.with_suffix('.partial').open('wb') as f:
                    count=0
                    for chunk in r.iter_content(1024*1024):
                        f.write(chunk); count+=len(chunk)
                        if count%(50*1024*1024)<1024*1024: print('public dictionary download MB',count//1024//1024,flush=True)
            bulk.with_suffix('.partial').replace(bulk)
        wanted=set(words)
        with bulk.open('rb') as f: bulk_hash=hashlib.file_digest(f,'sha256').hexdigest()
        if bulk_hash!='6d40e0067718aeb3321db30297761ca803838390627111a29a5426fee4557faf':
            raise ValueError('Public dump changed: review its date/license before rebuilding this release')
        results={word:{'word':word,'url':'https://en.wiktionary.org/wiki/'+quote(word,safe=''),'source':'English Wiktionary via Kaikki','license':'CC BY-SA 4.0','dump':'2026-09-02','fetched_at':'2026-10-18','entries':[],'status':'not_found'} for word in words}
        with gzip.open(bulk,'rt',encoding='utf-8') as f:
            for line in f:
                e=json.loads(line)
                if e.get('word') in wanted and e.get('lang_code')=='en':
                    r=results[e['word']]; r['status']='ok'
                    r['entries'].append({'pos':e.get('pos'),'sounds':e.get('sounds',[])})
        (CACHE/'index.json').write_text(json.dumps(list(results.values()),ensure_ascii=False),encoding='utf-8')
        (CACHE/'bulk-provenance.json').write_text(json.dumps({'url':url,'sha256':bulk_hash,'dump':'2026-09-02'}),encoding='utf-8')
        print('complete',len(results),'with sounds',sum(any(e['sounds'] for e in r['entries']) for r in results.values()),flush=True)
        sys.exit(0)
    results=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for f in as_completed([pool.submit(fetch,w) for w in words]):
            results.append(f.result())
            if len(results)%100==0: print('pronunciation sources',len(results),'/',len(words),flush=True)
    (CACHE/'index.json').write_text(json.dumps(sorted(results,key=lambda x:x['word']),ensure_ascii=False),encoding='utf-8')
    print('complete',len(results),'with sounds',sum(any(e['sounds'] for e in r['entries']) for r in results),flush=True)
