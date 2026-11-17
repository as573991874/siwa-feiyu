# 程序合成一段原创的卡哇伊芯片风 BGM（150 BPM，C 大调 I–V–vi–IV）和几个音效。
# 用法：python trailer/bgm.py [秒数]  → trailer/out/bgm.wav、sfx_*.wav
import os, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), 'out')
BPM = 150
BEAT = 60 / BPM
rng = np.random.default_rng(7)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def env(n, a=0.005, d=0.08, s=0.6, r=0.05, length=None):
    length = length or n
    t = np.arange(n) / SR; e = np.ones(n) * s
    ai = int(a * SR); di = int(d * SR); ri = int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if di: e[ai:ai + di] = np.linspace(1, s, min(di, max(0, n - ai)))[: max(0, min(di, n - ai))]
    if ri and n > ri: e[-ri:] *= np.linspace(1, 0, ri)
    return e
def osc(kind, f, n, duty=0.5, vib=0.0):
    t = np.arange(n) / SR
    ph = np.cumsum(np.full(n, f) * (1 + vib * np.sin(2 * np.pi * 5.5 * t)) / SR)
    x = ph % 1.0
    if kind == 'sq': return np.where(x < duty, 1.0, -1.0)
    if kind == 'tri': return 4 * np.abs(x - 0.5) - 1
    if kind == 'sin': return np.sin(2 * np.pi * ph)
    raise ValueError(kind)

def song(seconds):
    n = int(seconds * SR); L = np.zeros(n); R = np.zeros(n)
    def add(sig, start, pan=0.0, gain=1.0):
        i = int(start * SR); j = min(n, i + len(sig))
        if i >= n: return
        s = sig[: j - i] * gain
        L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))
    chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
    roots = [36, 43, 45, 41]
    # 两段旋律（每段 4 小节 × 8 个八分音符），None = 休止
    melA = [72, 74, 76, None, 79, 76, 74, 72,  74, None, 74, 76, 79, None, 81, 79,
            76, None, 76, 77, 79, 77, 76, 74,  72, None, 72, 74, 76, 74, 72, None]
    melB = [84, None, 83, 81, 79, None, 81, 83,  84, 86, 84, 83, 81, None, 79, None,
            81, 83, 84, None, 88, 86, 84, 81,  79, None, 77, 79, 81, 79, 77, 76]
    bar = BEAT * 4; t = 0.0; bars = int(seconds / bar) + 1
    for b in range(bars):
        c = b % 4; sec = b // 8
        intro = b < 2
        # 鼓
        for k in range(4):
            bt = t + k * BEAT
            if not intro or k % 2 == 0:
                kn = int(0.18 * SR); tt = np.arange(kn) / SR
                kick = np.sin(2 * np.pi * np.cumsum(60 + 140 * np.exp(-tt * 30)) / SR) * np.exp(-tt * 18)
                add(kick, bt, gain=0.9)
            if not intro and k % 2 == 1:
                sn = int(0.16 * SR); tt = np.arange(sn) / SR
                snare = (rng.standard_normal(sn) * 0.7 + np.sin(2 * np.pi * 190 * tt) * 0.5) * np.exp(-tt * 22)
                add(snare, bt, gain=0.3)
            for h in range(2):
                hn = int(0.04 * SR); hat = rng.standard_normal(hn) * np.exp(-np.arange(hn) / SR * 90)
                hat = lfilter(*butter(2, 7000 / (SR / 2), 'high'), hat)
                add(hat, bt + h * BEAT / 2, pan=0.3, gain=0.07 if h else 0.045)
        # 贝斯（八分音符跳八度）
        for k in range(8):
            f = midi(roots[c] + (12 if k % 2 else 0)); bn = int(BEAT / 2 * SR * 0.9)
            add(osc('tri', f, bn) * env(bn, d=0.05, s=0.7), t + k * BEAT / 2, gain=0.35)
        # 琶音（十六分音符，方波 25%）
        if not intro:
            for k in range(16):
                notes = chords[c] + [chords[c][0] + 12]
                f = midi(notes[k % 4] + 12); an = int(BEAT / 4 * SR * 0.8)
                add(osc('sq', f, an, duty=0.25) * env(an, d=0.04, s=0.3), t + k * BEAT / 4, pan=-0.35, gain=0.07)
        # 和弦垫（方波 50%，长音）
        pn = int(bar * SR)
        pad = sum(osc('sq', midi(m), pn, duty=0.5) for m in chords[c]) / 3
        pad = lfilter(*butter(2, 2200 / (SR / 2)), pad)
        add(pad * env(pn, a=0.02, d=0.3, s=0.5, r=0.1), t, pan=0.25, gain=0.05)
        # 主旋律
        if not intro:
            mel = melA if sec % 2 == 0 else melB
            for k in range(8):
                m = mel[(b % 4) * 8 + k]
                if m is None: continue
                mn = int(BEAT / 2 * SR * 0.92)
                lead = osc('sq', midi(m), mn, duty=0.5 if sec % 2 == 0 else 0.25, vib=0.004)
                bell = osc('sin', midi(m + 12), mn) * np.exp(-np.arange(mn) / SR * 9)
                add((lead * 0.6 + bell * 0.5) * env(mn, d=0.06, s=0.55), t + k * BEAT / 2, gain=0.22)
        t += bar
    # 简单的“侧链”：每拍压一下，节奏更跳
    beat_n = int(BEAT * SR); pump = 1 - 0.35 * np.exp(-np.arange(beat_n) / SR * 14)
    pumpall = np.tile(pump, n // beat_n + 1)[:n]
    L *= pumpall; R *= pumpall
    st = np.stack([L, R], 1); st /= np.max(np.abs(st)) * 1.12
    fade = int(1.5 * SR); st[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return st

def sfx():
    out = {}
    # 撕裂：带通噪声从高往低扫，带颗粒感
    n = int(0.45 * SR); tt = np.arange(n) / SR
    noise = rng.standard_normal(n) * (0.6 + 0.4 * (np.sin(2 * np.pi * 70 * tt) > 0))
    seg = []
    for i in range(0, n, 512):
        f = 5200 * (900 / 5200) ** (i / n)
        b, a = butter(2, [max(200, f * 0.6) / (SR / 2), min(SR / 2 - 100, f * 1.4) / (SR / 2)], 'band')
        seg.append(lfilter(b, a, noise[i:i + 512]))
    out['rip'] = np.concatenate(seg)[:n] * np.exp(-tt * 5) * 1.6
    # 冲刺呼啸
    n = int(0.6 * SR); tt = np.arange(n) / SR
    w = lfilter(*butter(2, 1200 / (SR / 2)), rng.standard_normal(n)) * np.sin(np.pi * tt / tt[-1]) ** 2
    out['whoosh'] = w * 3
    # 叮（大成功 / 连击）
    n = int(0.5 * SR); tt = np.arange(n) / SR
    out['ding'] = (np.sin(2 * np.pi * 1568 * tt) + 0.5 * np.sin(2 * np.pi * 2352 * tt)) * np.exp(-tt * 7) * 0.5
    # 胜利小号角
    seq = [(72, 0.12), (76, 0.12), (79, 0.12), (84, 0.45)]; parts = []
    for m, d in seq:
        k = int(d * SR); parts.append(osc('sq', midi(m), k) * env(k, d=0.05, s=0.6) * 0.3)
    out['win'] = np.concatenate(parts)
    # 失败下滑
    k = int(0.9 * SR); tt = np.arange(k) / SR
    out['lose'] = np.sin(2 * np.pi * np.cumsum(440 * 2 ** (-tt * 1.5)) / SR) * np.exp(-tt * 2) * 0.4
    return out

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    secs = float(sys.argv[1]) if len(sys.argv) > 1 else 75
    wavfile.write(os.path.join(OUT, 'bgm.wav'), SR, (song(secs) * 32000).astype(np.int16))
    for k, v in sfx().items():
        v = v / max(1e-6, np.max(np.abs(v))) * 0.9
        wavfile.write(os.path.join(OUT, f'sfx_{k}.wav'), SR, (v * 32000).astype(np.int16))
    print('ok')
