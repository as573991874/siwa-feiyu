#!/usr/bin/env python3
"""Decode the full character video and archive chapter-level visual checks."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from PIL import Image,ImageDraw,ImageFont

p=argparse.ArgumentParser()
p.add_argument('video',type=Path)
a=p.parse_args()
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames','-of','json',str(a.video)],text=True))
s=probe['streams'][0]
assert (s['codec_name'],s['width'],s['height'],s['r_frame_rate'],int(s['nb_frames']))==('h264',1920,1080,'30/1',3600),s
assert abs(float(probe['format']['duration'])-120)<.01
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(a.video),'-f','null','-'],check=True)
probe['validation']={'full_decode':'passed','sha256':hashlib.sha256(a.video.read_bytes()).hexdigest()}
a.video.with_suffix('.validation.json').write_text(json.dumps(probe,indent=2))
items=[(2.3,'人物踏步转身'),(12,'薄丝袜细节'),(20,'屈膝动作'),(27,'脚踝细节'),(35,'材质对比'),(44,'浅色丝袜'),(51.5,'亲手拉扯大腿'),(59.5,'抬腿抓取小腿'),(68,'三款渔网'),(76,'装饰花纹'),(83.5,'亲手拉扯渔网'),(91,'百褶裙转身'),(100,'轻风褶皱'),(107.5,'亲手提裙角'),(109.5,'松手落下'),(118,'酒红款动态')]
canvas=Image.new('RGB',(1920,1200),(12,18,27))
font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',22)
base=a.video.parent
for i,(time,label) in enumerate(items):
    file=base/f'character-v6-check-{i:02d}.jpg'
    subprocess.run(['ffmpeg','-y','-v','error','-ss',str(time),'-i',str(a.video),'-frames:v','1',str(file)],check=True)
    im=Image.open(file).resize((480,270))
    x=i%4*480;y=i//4*300
    canvas.paste(im,(x,y+30))
    ImageDraw.Draw(canvas).text((x+15,y+3),f'{time:g}s · {label}',font=font,fill=(235,222,205))
canvas.save(base/'character-v6-contact-sheet.jpg',quality=94)
print(json.dumps(probe,indent=2))
