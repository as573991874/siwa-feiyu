# 用 edge-tts 合成宣传片里的台词：肥鱼（可爱少女音）和糙汉（粗嗓门）。
# 用法：python trailer/voices.py   → 输出到 trailer/out/voice_*.mp3
import asyncio, os
import edge_tts

OUT = os.path.join(os.path.dirname(__file__), 'out')
GIRL = dict(voice='zh-CN-XiaoyiNeural', rate='+12%', pitch='+18Hz')
MAN = dict(voice='zh-CN-YunjianNeural', rate='+5%', pitch='-12Hz')

LINES = {
    # 肥鱼
    'g_come':   (GIRL, '来抓我呀～'),
    'g_catch':  (GIRL, '略略略，抓不到～'),
    'g_ya':     (GIRL, '呀！'),
    'g_new':    (GIRL, '我的新丝袜！'),
    'g_hate':   (GIRL, '讨厌啦！'),
    'g_no':     (GIRL, '想得美！'),
    'g_waa':    (GIRL, '哇啊啊——！'),
    'g_pout':   (GIRL, '哼！不跟你玩了！'),
    'g_ten':    (GIRL, '赔我十双！'),
    'g_lol':    (GIRL, '就这？'),
    # 糙汉
    'm_stop':   (MAN, '给我站住！'),
    'm_go':     (MAN, '冲啊！'),
    'm_got':    (MAN, '抓到你了！'),
    'm_heave':  (MAN, '嘿——咻！给我过来！'),
    'm_done':   (MAN, '哈哈！撕完收工！'),
    'm_tired':  (MAN, '跑……跑不动了……'),
    'm_title':  (MAN, '撕袜大作战！现在开撕！'),
}

async def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (v, text) in LINES.items():
        await edge_tts.Communicate(text, **v).save(os.path.join(OUT, f'voice_{name}.mp3'))
        print('ok', name)

asyncio.run(main())
