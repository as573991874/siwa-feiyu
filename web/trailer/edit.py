# 按录屏的事件时间轴剪一段竖屏游戏宣传片：挑片段、对齐台词与音效、混 BGM、加片头字和片尾卡。
# 用法：python trailer/edit.py preview/full.mp4 preview/trailer.mp4
import json, os, subprocess, sys

src, dst = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__)); AUD = os.path.join(HERE, 'out')
ev = json.load(open(src.replace('.mp4', '.events.json'), encoding='utf8'))
FONT = 'C\\:/Windows/Fonts/msyhbd.ttc'
TXT = os.path.join(HERE, 'out', 'txt'); os.makedirs(TXT, exist_ok=True)
def T(name, text):  # 中文走 textfile，避免 Windows 命令行编码把字弄乱
    p = os.path.join(TXT, name + '.txt'); open(p, 'w', encoding='utf8').write(text)
    return "textfile='" + p.replace('\\', '/').replace(':', '\\:') + "'"

def find(type_, v=None, after=0.0, before=1e9):
    for e in ev:
        if e['type'] == type_ and (v is None or e['v'] == v) and after <= e['t'] < before: return e['t']
    return None
def level_start(i): return find('lv', i) if i else 0.0

# ---------------- 挑片段（源视频时间）
segs, cues = [], []  # segs: (a, b, 标签)；cues: (源时间, 音频文件, 音量)
L0, L1, L2, L5 = level_start(0), level_start(1), level_start(2), level_start(5)
p0 = find('s', 'play', L0); d0 = find('ph', 'in', p0); o0 = find('ph', 'out', d0)
segs.append((0.0, p0 + 0.3, 'intro'))
segs.append((p0 + 0.3, min(d0 - 0.15, p0 + 7.5), 'chase'))
segs.append((d0 - 0.15, o0 + 0.2, 'duel1'))
if L1 is not None:
    p1 = find('s', 'play', L1); segs.append((p1 + 0.6, p1 + 5.6, 'level2'))
if L2 is not None:
    p2 = find('s', 'play', L2)
    f2 = find('ph', 'fail', p2)
    if f2 is not None:
        i2 = max(t for t in [e['t'] for e in ev if e['type'] == 'ph' and e['v'] == 'in'] if t < f2)
        segs.append((i2 - 0.1, f2 + 1.1, 'duel_fail'))
        i3 = find('ph', 'in', f2); r3 = find('ph', 'rip', i3)
        if i3 and r3: segs.append((i3 + 0.4, r3 + 1.4, 'duel_win'))
    w2 = find('s', 'win', p2)
    if w2: segs.append((w2 + 0.1, w2 + 3.0, 'win'))
lo = find('s', 'lose')
if lo: segs.append((lo, lo + 4.4, 'lose'))

# ---------------- 台词与音效（源时间）
V = lambda n: os.path.join(AUD, f'voice_{n}.mp3'); S = lambda n: os.path.join(AUD, f'sfx_{n}.wav')
cues += [(0.5, V('g_come'), 1.0), (2.1, V('m_stop'), 1.0)]
spr = find('sprint', True, p0)
if spr: cues += [(spr, S('whoosh'), 0.7), (spr + 0.1, V('m_go'), 1.0)]
girl_cycle = ['g_ya', 'g_new', 'g_hate', 'g_ya', 'g_catch']; gi = 0; last_g = -9
for e in ev:
    if e['type'] == 'tear':
        cues.append((e['t'], S('rip'), 0.75))
        if e['t'] - last_g > 1.6: cues.append((e['t'] + 0.08, V(girl_cycle[gi % len(girl_cycle)]), 0.95)); gi += 1; last_g = e['t']
for e in ev:
    if e['type'] == 'ph' and e['v'] == 'in': cues += [(e['t'], S('ding'), 0.6), (e['t'] + 0.3, V('g_no'), 1.0)]
    if e['type'] == 'ph' and e['v'] == 'tug': cues.append((e['t'] + 0.2, V('m_heave'), 1.0))
    if e['type'] == 'ph' and e['v'] == 'rip': cues += [(e['t'], S('rip'), 1.0), (e['t'] + 0.15, V('g_waa'), 1.0)]
    if e['type'] == 'ph' and e['v'] == 'sit': cues.append((e['t'] + 0.2, V('g_ten'), 1.0))
    if e['type'] == 'ph' and e['v'] == 'fail': cues.append((e['t'] + 0.1, V('g_catch'), 1.0))
    if e['type'] == 's' and e['v'] == 'win': cues += [(e['t'] + 0.1, S('win'), 0.7), (e['t'] + 0.35, V('m_done'), 1.0), (e['t'] + 1.5, V('g_pout'), 1.0)]
    if e['type'] == 's' and e['v'] == 'lose': cues += [(e['t'], S('lose'), 0.7), (e['t'] + 0.3, V('m_tired'), 1.0), (e['t'] + 1.9, V('g_lol'), 1.0)]

# ---------------- 映射到成片时间轴
END = 3.2  # 片尾卡
out_cues, off, layout = [], 0.0, []
for a, b, tag in segs:
    layout.append((off, tag))
    for t, f, vol in cues:
        if a <= t < b - 0.15: out_cues.append((off + t - a, f, vol))
    off += b - a
total = off + END
out_cues.append((off + 0.2, V('m_title'), 1.0)); out_cues.append((off, S('ding'), 0.6))
# 同一时刻附近的人声去重：0.5 秒内只留第一条
out_cues.sort(); dedup = []
for c in out_cues:
    if 'voice_' in c[1] and any('voice_' in d[1] and abs(d[0] - c[0]) < 0.9 for d in dedup): continue
    dedup.append(c)
out_cues = dedup

# ---------------- ffmpeg 滤镜图
vf, inputs = [], ['-i', src]
for i, (a, b, tag) in enumerate(segs):
    vf.append(f'[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS,fps=30[v{i}]')
last_a, last_b, _ = segs[-2] if segs[-1][2] == 'lose' and len(segs) > 1 else segs[-1]
card_t = (segs[[s[2] for s in segs].index('win')][0] + 1.1) if any(s[2] == 'win' for s in segs) else last_a
vf.append(f"[0:v]trim=start={card_t:.3f},setpts=PTS-STARTPTS,trim=end_frame=1,loop=loop={int(END*30)}:size=1:start=0,setpts=N/30/TB,fps=30,"
          f"boxblur=10:2,eq=brightness=-0.18,"
          f"drawtext=fontfile='{FONT}':{T('t1', '撕袜大作战')}:fontsize=104:fontcolor=white:borderw=8:bordercolor=0xff4d86:x=(w-text_w)/2:y=h*0.36,"
          f"drawtext=fontfile='{FONT}':{T('t2', '肥鱼快跑 · 六关等你来撕')}:fontsize=40:fontcolor=white:x=(w-text_w)/2:y=h*0.36+140,"
          f"drawtext=fontfile='{FONT}':{T('t3', '现在开撕！')}:fontsize=54:fontcolor=0xffe27a:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.62:alpha='if(lt(t,0.6),t/0.6,1)'[vend]")
cat = ''.join(f'[v{i}]' for i in range(len(segs))) + '[vend]'
vf.append(f'{cat}concat=n={len(segs) + 1}:v=1:a=0[vcat]')
# 片头大字（前 2.6 秒）+ 全片左上角小标
vf.append(f"[vcat]drawtext=fontfile='{FONT}':{T('t4', '第一视角 · 追着撕')}:fontsize=42:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.58:enable='between(t,0.3,2.8)'[vout]")

af = []
inputs += ['-i', os.path.join(AUD, 'bgm.wav')]
bgm_idx = 1
for k, (t, f, vol) in enumerate(out_cues):
    inputs += ['-i', f]
    ms = int(t * 1000)
    af.append(f'[{k + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={vol * (1.9 if "voice_" in f else 1.0):.2f},adelay={ms}|{ms}[c{k}]')
af.append(f'[{bgm_idx}:a]atrim=0:{total:.2f},volume=0.5,afade=t=out:st={total - 1.2:.2f}:d=1.2[bg]')
mix = '[bg]' + ''.join(f'[c{k}]' for k in range(len(out_cues)))
af.append(f'{mix}amix=inputs={len(out_cues) + 1}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=9,aresample=44100[aout]')

cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(vf + af), '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{total:.2f}', dst]
subprocess.run(cmd, check=True)
print('segments:', [(round(a, 1), round(b, 1), t) for a, b, t in segs])
print('cues:', len(out_cues), 'total', round(total, 1), 's ->', dst)
