#!/usr/bin/env python3
"""Append the new skirt sequence and verify every original decoded frame is retained."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

p = argparse.ArgumentParser()
p.add_argument('--original', type=Path, required=True)
p.add_argument('--skirt', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
for path in (a.original, a.skirt):
    assert path.is_file(), path

def run(args):
    return subprocess.check_output(args, text=True)

def hashes(path, frames=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:v:0']
    if frames:
        cmd += ['-frames:v', str(frames)]
    cmd += ['-f', 'framemd5', '-']
    return [line.rsplit(',', 1)[-1].strip() for line in run(cmd).splitlines() if line and not line.startswith('#')]

with tempfile.TemporaryDirectory() as temp:
    manifest = Path(temp) / 'concat.txt'
    def quote(path):
        return str(path.resolve()).replace("'", "'\\''")
    manifest.write_text(''.join(f"file '{quote(path)}'\n" for path in (a.original, a.skirt)))
    subprocess.run(['ffmpeg', '-y', '-v', 'warning', '-f', 'concat', '-safe', '0', '-i', str(manifest), '-c', 'copy', '-movflags', '+faststart', str(a.output)], check=True)
probe = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', str(a.output)]))
stream = probe['streams'][0]
assert stream['codec_name'] == 'h264'
assert (stream['width'], stream['height']) == (1920, 1080)
assert stream['r_frame_rate'] == '30/1'
assert int(stream['nb_frames']) == 3600
assert abs(float(probe['format']['duration']) - 120) < .01
subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(a.output), '-f', 'null', '-'], check=True)
old = hashes(a.original)
combined = hashes(a.output)
new = hashes(a.skirt)
assert len(old) == 2640 and old == combined[:2640], 'Original video frames changed'
assert len(new) == 960 and new == combined[2640:], 'Skirt video frames changed'
probe['validation'] = {'full_decode': 'passed', 'original_2640_frame_hashes': 'identical', 'new_960_frame_hashes': 'identical', 'sha256': hashlib.sha256(a.output.read_bytes()).hexdigest()}
a.output.with_suffix('.validation.json').write_text(json.dumps(probe, indent=2))
print(json.dumps(probe, indent=2))
