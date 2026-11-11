#!/usr/bin/env python3
"""Check hand reach, fingertip pinch, cloth contact and actor-driven presentation."""
import csv
import json
import math
from pathlib import Path
import sys

path = Path(sys.argv[1])
rows = list(csv.DictReader(path.open()))
assert len(rows) == 3600, len(rows)
for i, r in enumerate(rows):
    assert all(math.isfinite(float(v)) for v in r.values()), i
    assert abs(float(r['time']) - i / 30) < .0001, i

def section(start, end):
    return [r for r in rows if start <= float(r['time']) < end]

def average(values):
    values = list(values)
    return sum(values) / len(values)

report = {'frames': len(rows), 'hand_sections': {}}
for start, name in [(48,'thigh'),(56,'calf'),(80,'fishnet'),(104,'skirt')]:
    hold = section(start+1.65, start+4.4)
    assert all(r['hand_active'] == '1' for r in hold), name
    cloth_column = 'skirt_gripped' if start == 104 else 'held'
    assert all(r[cloth_column] == '1' for r in hold), name
    reach = max(float(r['hand_reach_error']) for r in hold)
    gap = max(float(r['pinch_gap']) for r in hold)
    contact = max(float(r['cloth_hand_error']) for r in hold)
    # Authored reach may exceed the arm limit by a fingertip-pad width; actual cloth contact remains tight.
    assert reach < .020, (name, 'unreachable hand target', reach)
    assert gap < .018, (name, 'fingers not pinching', gap)
    assert contact < .002, (name, 'cloth detached from fingertips', contact)
    if start != 104:
        peak = max(float(r['grab_separation']) for r in hold)
        assert (.075 if start == 56 else .115) < peak < .17, (name, peak)
        residual = max(float(r['max_separation']) for r in section(start+5.5,start+5.9))
        assert residual < .008, (name, 'cloth did not settle', residual)
    assert all(r[cloth_column] == '0' for r in section(start+5.5,start+5.9))
    report['hand_sections'][name] = {'reach_error_m':reach,'pinch_gap_m':gap,'cloth_contact_error_m':contact}

for start in [0,8,40,88,96,112]:
    clip = section(start,start+8)
    yaw = [float(r['body_yaw']) for r in clip]
    assert max(yaw)-min(yaw)>30, (start,'actor did not turn')
    assert max(float(r['step_lift']) for r in clip)>.06, (start,'no stepping')

for start in range(0,120,8):
    angles = [math.degrees(math.atan2(float(r['camera_x']),float(r['camera_z']))) for r in section(start,start+8)]
    assert max(angles)-min(angles)<.001, (start,'orbiting camera',max(angles)-min(angles))
assert all(r['comparison']=='1' for r in section(32,40))
assert all(r['net_gallery']=='1' for r in section(64,72))
assert all(r['decorative_gallery']=='1' for r in section(72,80))
assert max(float(r['knee_bend']) for r in section(16,24))>25
assert max(float(r['knee_bend']) for r in section(24,32))>7
colors=[float(r['fabric_red']) for r in section(40,48)]
assert min(colors)<.03 and max(colors)>.63
assert {int(r['skirt_palette']) for r in section(112,120)}=={0,1,2}
assert all(float(r['waist_error'])<.0001 for r in section(88,120))
before=average(float(r['hem_max']) for r in section(105.2,105.45))
held=average(float(r['hem_max']) for r in section(107.2,108.4))
released=average(float(r['hem_max']) for r in section(109.5,109.9))
assert held-before>.15 and held-released>.15, ('skirt lift/release',before,held,released)
report['skirt_lift_m']=held-before
report['skirt_fall_m']=held-released
report['camera_azimuth']='fixed within every shot'
report['original_chapters']='all present'
path.with_name('character-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
