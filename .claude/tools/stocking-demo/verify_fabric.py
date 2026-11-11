#!/usr/bin/env python3
"""Accept the preserved showcase and modest, non-bouncing fabric release from Unity capture data."""
import argparse,csv,json,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('metrics',type=Path);args=p.parse_args()
rows=list(csv.DictReader(args.metrics.open()))
assert len(rows) in (1920,2640), f'Expected full 64- or 88-second showcase; got {len(rows)}'
for i,r in enumerate(rows):
    assert abs(float(r['time'])-i/30)<.0001
    for field in ['grab_separation','max_separation']:
        assert math.isfinite(float(r[field])) and 0<=float(r[field])<.4,(i,field,r[field])
def section(start,end):return [r for r in rows if start<=float(r['time'])<end]
assert max(float(r['knee_bend']) for r in section(16,24))>25,'Original knee motion is missing'
assert max(float(r['knee_bend']) for r in section(24,32))>7,'Original ankle/leg motion is missing'
assert all(r['comparison']=='1' for r in section(32,40)),'Original side-by-side material comparison is missing'
assert max(float(r['fabric_red']) for r in section(40,48))>.6,'Original light-colour material transition is missing'
assert all(r['held']=='0' for r in section(0,48)),'The original sections must not be replaced by the pull demonstration'
zoom=section(6,8.1)
assert float(zoom[0]['camera_z'])>4 and float(zoom[-1]['camera_z'])<2.6,'Full-body-to-leg camera advance is missing'
results=[]
for start,minimum in [(48,.12),(56,.085)]:
    held=section(start+.7,start+3.1)
    assert max(float(r['grab_separation']) for r in held)>=minimum,'Pull did not leave the skin'
    free=section(start+3.12,start+8)
    assert all(r['held']=='0' for r in free),'A hidden grab must not remain after release'
    late=section(start+4.0,start+7.9)
    assert max(float(r['max_separation']) for r in late)<.03,'Cloth should not repeatedly spring far away after release'
    settled=section(start+6,start+7.9)
    assert max(float(r['max_separation']) for r in settled)<.008,'Cloth should settle back against the leg'
    results.append({'chapter_start':start,'held_max_m':max(float(r['max_separation']) for r in held),'after_one_second_max_m':max(float(r['max_separation']) for r in late),'settled_max_m':max(float(r['max_separation']) for r in settled)})
if len(rows)==2640:
    assert all(r['net_gallery']=='1' for r in section(64,72)), 'Three fishnet variants are missing'
    assert all(r['decorative_gallery']=='1' for r in section(72,80)), 'Decorative variants are missing'
    assert all(float(r['pattern_type'])==1 for r in section(80,88)), 'Fishnet pull is missing'
    assert max(float(r['grab_separation']) for r in section(80.7,83.1))>.12, 'Fishnet must visibly leave the leg'
    assert max(float(r['max_separation']) for r in section(84,87.9))<.03, 'Fishnet should settle like fabric'
result={'passed':True,'frames':len(rows),'preserved_sections':['full-body-to-leg camera advance','knee motion','ankle detail and motion','three-style comparison','black-to-light transition'],'added_fabric_sections':results}
(args.metrics.parent/'fabric-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
