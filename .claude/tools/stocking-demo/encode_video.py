#!/usr/bin/env python3
"""Add explanatory captions to actual Unity renders and encode an H.264 review video."""
import argparse
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

CHAPTERS = [
    ('01 / 项目角色改装', '观相堂女弟子 · 原头部 / 上衣 / 骨架，裁短长袍并补齐蒙皮腿部'),
    ('02 / 黑色薄丝袜', '透肤与掠射角深浅 · 纤维方向高光 · 距离过滤的细密织纹'),
    ('03 / 屈膝动态', '沿用角色原骨架 · 姿势驱动膝后压缩褶皱'),
    ('04 / 脚踝近景', '织物堆积细节 · 细微轮廓位移 · 加密脚尖区域'),
    ('05 / 同光照材质对比', '左：皮肤基准   /   中：薄黑丝   /   右：厚黑丝'),
    ('06 / 黑丝 → 浅色丝袜', '同一模型连续调整织物颜色与光学密度'),
]

ELASTIC = False
FABRIC = False
STYLES = False
SKIRT = False
CHARACTER = False
ELASTIC_CHAPTERS = [
    ('01 / 项目角色 · 拉扯回弹版', '观相堂女弟子 · 独立皮肤层与丝袜层 · 局部弹性网格'),
    ('02 / 抓住 → 拉开 → 松手', '大腿丝袜向外拉伸约 30 cm · 释放后连续回弹'),
    ('03 / 回弹近景 · 0.5 倍速度', '观察布面脱离皮肤、张力传播与逐渐衰减的颤动'),
    ('04 / 小腿拉扯', '换一个抓取位置 · 网格独立形变，腿部保持原位'),
    ('05 / 连续弹弹弹', '连续三次抓取释放 · 弹性恢复与皮肤接触反弹'),
    ('06 / 浅色丝袜拉扯回弹', '相同弹性网格 · 拉伸处织纹展开、光学密度降低'),
]

FABRIC_CHAPTERS = CHAPTERS + [
    ('07 / 追加 · 大腿布料拉扯', '独立皮肤与织物表面 · 小范围拉开、保持、松手回贴'),
    ('08 / 追加 · 浅色丝袜小腿拉扯', '布面张力与弱弯曲约束 · 松手后快速衰减并贴回腿面'),
]

STYLE_CHAPTERS = FABRIC_CHAPTERS + [
    ('09 / 新增 · 三种渔网', '左：细网   /   中：经典中网   /   右：大菱形网'),
    ('10 / 新增 · 装饰花纹', '左：花卉蕾丝   /   中：波点薄纱   /   右：后缝款背面'),
    ('11 / 新增 · 渔网拉扯近景', '网眼随布面撑开，菱形被拉长 · 松手后收拢贴回腿面'),
]

SKIRT_CHAPTERS = [
    ('12 / 百褶裙 · 重心与转身', '轻盈步态、腰部转动与裙褶的自然滞后'),
    ('13 / 格纹褶皱 · 轻风近景', '重力下垂与轻风摆动 · 观察格纹和褶边的光泽'),
    ('14 / 轻提裙角 → 松手落下', '局部抓取带动周围布面 · 释放后自然落回'),
    ('15 / 裙摆配色与动态', '玫瑰格纹 / 海军蓝 / 酒红细格 · 保留同一布面运动'),
]

def make_caption(chapter, width, height):
    scale = width / 1920
    canvas = Image.new('RGBA', (width, height))
    d = ImageDraw.Draw(canvas)
    font_path = '/System/Library/Fonts/STHeiti Medium.ttc'
    title = ImageFont.truetype(font_path, round(39 * scale))
    body = ImageFont.truetype(font_path, round(24 * scale))
    tiny = ImageFont.truetype(font_path, round(20 * scale))
    xy = lambda values: tuple(round(v * scale) for v in values)
    d.rectangle(xy((0, 0, 1920, 150)), fill=(9, 14, 23, 210))
    d.rectangle(xy((55, 40, 61, 107)), fill=(194, 158, 105, 255))
    d.text(xy((82, 35)), CHAPTERS[chapter][0], font=title, fill=(239, 232, 221))
    d.text(xy((83, 91)), CHAPTERS[chapter][1], font=body, fill=(174, 185, 201))
    d.rectangle(xy((0, 1005, 1920, 1080)), fill=(9, 14, 23, 225))
    d.text(xy((56, 1025)), 'XXD2025  /  UNITY 2022.3 · URP  /  项目内实际渲染', font=tiny, fill=(194, 204, 218))
    footer = ('布面张力 · 伸长/剪切约束 / 阻尼贴合' if chapter >= 6 else '材质 / 多样式 / 腿部动作') if FABRIC else ('弹性网格 · 弹簧阻尼 / 皮肤接触约束' if ELASTIC else '材质与姿势形变演示 · 未使用真实布料解算')
    if SKIRT or (CHARACTER and chapter>=11):
        footer = "百褶布面 / 重力与风载 / 腰部约束"
    if STYLES and chapter in (8,9):
        footer = "款式对比 / 网眼密度 / 网线宽度"
    d.text(xy((1105, 1025)), footer, font=tiny, fill=(164, 175, 191))
    if STYLES and chapter in (8,9):
        names = ['细渔网','经典中网','大菱形网'] if chapter == 8 else ['花卉蕾丝','波点薄纱','后缝款（背面）']
        for x,label in zip([470,960,1450],names):
            d.text(xy((x-70,950)),label,font=body,fill=(238,230,219),stroke_width=1,stroke_fill=(0,0,0,255))
    if chapter == 4 and not ELASTIC:
        for x, label in [(470, '皮肤基准'), (960, '薄黑丝'), (1450, '厚黑丝')]:
            d.text(xy((x - 55, 950)), label, font=body, fill=(238, 230, 219), stroke_width=1, stroke_fill=(0,0,0,255))
    return canvas

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--frames', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--elastic', action='store_true')
    p.add_argument('--fabric', action='store_true')
    p.add_argument('--styles', action='store_true')
    p.add_argument('--skirt', action='store_true')
    p.add_argument('--character', action='store_true')
    args = p.parse_args()
    global ELASTIC, FABRIC, STYLES, SKIRT, CHARACTER, CHAPTERS
    SKIRT = args.skirt
    STYLES = args.styles
    FABRIC = args.fabric or STYLES
    ELASTIC = args.elastic
    if ELASTIC:
        CHAPTERS = ELASTIC_CHAPTERS
    if FABRIC:
        ELASTIC = False
        CHAPTERS = FABRIC_CHAPTERS
    if STYLES:
        CHAPTERS = STYLE_CHAPTERS
    if SKIRT:
        ELASTIC = FABRIC = STYLES = False
        CHAPTERS = SKIRT_CHAPTERS
    CHARACTER=args.character
    if CHARACTER:
        SKIRT=ELASTIC=False
        STYLES=FABRIC=True
        CHAPTERS=STYLE_CHAPTERS+SKIRT_CHAPTERS
        CHAPTERS[0]=('01 / 人物动作 · 完整服装演示','人物踏步转身 / 手指捏合抓取 / 丝袜与裙摆布面响应')
        CHAPTERS[6]=('07 / 亲手拉扯 · 大腿丝袜','伸手捏住 → 拉开并保持 → 松开收手 · 布面随指尖移动')
        CHAPTERS[7]=('08 / 抬腿够取 · 浅色丝袜','单腿支撑与手部抓取 · 松手后布面自然回贴')
        CHAPTERS[10]=('11 / 亲手拉扯 · 经典渔网','网眼随手指拉开 · 松手后布面收拢')
        CHAPTERS[13]=('14 / 亲手轻提裙角 → 松手落下','手臂与手指完成抓取动作 · 褶皱随手部位置展开')
    frames = sorted(args.frames.glob('frame_*.jpg'))
    expected = 3600 if CHARACTER else 960 if SKIRT else 2640 if STYLES else 1920 if FABRIC else 1440
    if len(frames) != expected:
        raise SystemExit(f'Expected {expected} real Unity frames, found {len(frames)}')
    for i, path in enumerate(frames):
        if path.name != f'frame_{i:05d}.jpg':
            raise SystemExit(f'Missing or out-of-order frame {i}')
    size = Image.open(frames[0]).size
    overlays = [make_caption(i, *size) for i in range(len(CHAPTERS))]
    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'warning', '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', f'{size[0]}x{size[1]}', '-framerate', '30', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast' if CHARACTER else 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(args.output)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i, path in enumerate(frames):
            frame = Image.open(path).convert('RGBA')
            chapter = min(len(CHAPTERS) - 1, i // 240)
            frame.alpha_composite(overlays[chapter])
            if ELASTIC and chapter > 0:
                time = i / 30
                period = 8 if chapter == 2 else 2.6666667 if chapter == 4 else 4
                phase = ((time - chapter * 8) % period) / period
                label = '抓取并拉伸' if .08 <= phase < .36 else '保持拉伸' if .36 <= phase < .48 else '松手 · 弹弹弹' if phase >= .48 else '准备抓取'
                font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 29)
                draw = ImageDraw.Draw(frame)
                draw.rounded_rectangle((1510, 42, 1850, 108), radius=12, fill=(26, 36, 47, 235))
                draw.text((1542, 59), label, font=font, fill=(241, 185, 100) if phase < .48 else (127, 225, 203))
            if FABRIC and chapter in (6,7,10):
                local = i / 30 - chapter * 8
                label = ('捏住并拉开' if 1.5 <= local < 3 else '手指保持抓取' if 3 <= local < 4.6 else '松手 · 布面回贴' if local >= 4.6 else '伸手准备抓取') if CHARACTER else ('局部抓取并拉开' if .7 <= local < 2 else '保持布面张力' if 2 <= local < 3.1 else '松手 · 布面回贴' if local >= 3.1 else '准备抓取')
                font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 29)
                draw = ImageDraw.Draw(frame)
                draw.rounded_rectangle((1485, 42, 1850, 108), radius=12, fill=(26, 36, 47, 235))
                draw.text((1510, 59), label, font=font, fill=(241, 185, 100) if local < 3.1 else (127, 225, 203))
            if (SKIRT and chapter in (2,3)) or (CHARACTER and chapter in (13,14)):
                local = i / 30 - chapter * 8
                if chapter == 2 or (CHARACTER and chapter==13):
                    label = ('亲手提起裙角' if 1.5 <= local < 3 else '捏住裙角保持' if 3 <= local < 4.6 else '松手 · 自然落下' if local >= 4.6 else '伸手准备抓取') if CHARACTER else ('轻提裙角' if .8 <= local < 2.2 else '保持布面' if 2.2 <= local < 3.6 else '松手 · 自然落下' if local >= 3.6 else '准备抓取')
                else:
                    label = ['玫瑰格纹','海军蓝','酒红细格'][min(2,int(local/2.6666667))]
                font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 29)
                draw = ImageDraw.Draw(frame)
                draw.rounded_rectangle((1485,42,1850,108),radius=12,fill=(26,36,47,235))
                draw.text((1510,59),label,font=font,fill=(234,194,147))
            process.stdin.write(frame.convert('RGB').tobytes())
            if i % 240 == 0:
                print(f'Encoded chapter {i // 240 + 1}/{len(CHAPTERS)}', flush=True)
        process.stdin.close()
        result = process.wait()
        if result:
            raise SystemExit(result)
    finally:
        if process.poll() is None:
            process.terminate()
    verification = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate,nb_frames', '-of', 'json', str(args.output)], text=True)
    args.output.with_suffix('.json').write_text(verification)
    print(verification)

if __name__ == '__main__':
    main()
