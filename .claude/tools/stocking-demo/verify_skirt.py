#!/usr/bin/env python3
"""Validate recorded skirt anchors, bounded motion, grip/release and palettes."""
import csv
import math
import sys
from pathlib import Path

rows = list(csv.DictReader(Path(sys.argv[1]).open()))
assert len(rows) == 960, f'Expected 960 frames, got {len(rows)}'
for i, row in enumerate(rows):
    assert all(math.isfinite(float(value)) for value in row.values())
    assert abs(float(row['time']) - (88 + i / 30)) < .0001
    assert row['skirt_visible'] == '1'
    assert float(row['waist_error']) < .0001
    assert .5 < float(row['hem_min']) <= float(row['hem_max']) < 1.6

def section(start, end):
    return [r for r in rows if start <= float(r['time']) < end]

def mean(values):
    values = list(values)
    return sum(values) / len(values)

before = mean(float(r['hem_max']) for r in section(103, 104))
held = section(106.3, 107.5)
released = section(109, 111)
lift = mean(float(r['hem_max']) for r in held) - before
fall = mean(float(r['hem_max']) for r in held) - mean(float(r['hem_max']) for r in released)
assert all(r['skirt_gripped'] == '1' for r in held)
assert all(r['skirt_gripped'] == '0' for r in released)
assert lift > .15, f'Insufficient hem lift: {lift}'
assert fall > .15, f'Hem did not fall after release: {fall}'
assert {int(r['skirt_palette']) for r in section(112, 120)} == {0, 1, 2}
assert max(float(r['knee_bend']) for r in section(88, 96)) > 15
print(f'PASS: 960 frames; fixed waist; finite bounded cloth; hem lift {lift:.3f} m; release fall {fall:.3f} m; 3 palettes; leg movement preserved.')
