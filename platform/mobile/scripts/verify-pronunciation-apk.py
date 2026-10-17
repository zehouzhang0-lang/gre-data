"""Verify the actual APK, not just the source asset directory."""
from pathlib import Path
import hashlib, json, sys, zipfile
root=Path(__file__).resolve().parents[1]
apk=Path(sys.argv[1])
with zipfile.ZipFile(apk) as archive:
    assert len(archive.namelist())==len(set(archive.namelist())), 'Duplicate ZIP entries'
    assert archive.testzip() is None, 'Bad ZIP CRC'
    prefix='assets/public/'
    raw=archive.read(prefix+'pronunciation.json')
    assert raw==(root/'public/pronunciation.json').read_bytes(), 'Manifest differs from verified source'
    assert archive.read(prefix+'vocabulary-seed.json')==(root/'public/vocabulary-seed.json').read_bytes(), 'Seed differs from verified export'
    assert archive.read(prefix+'pronunciation-licenses.txt')==(root/'public/pronunciation-licenses.txt').read_bytes(), 'Missing attribution'
    manifest=json.loads(raw)
    for name,expected in manifest['assets'].items():
        data=archive.read(prefix+name)
        assert len(data)==expected['bytes'] and hashlib.sha256(data).hexdigest()==expected['sha256'], name
    assert not any(name.startswith(prefix) and name.endswith(('.onnx','.bin','.part.mp3')) for name in archive.namelist()), 'Build-only asset leaked into APK'
print(json.dumps({'result':'passed','apk':apk.name,'bytes':apk.stat().st_size,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'audio_assets':len(manifest['assets']),**manifest['coverage']},indent=2))
