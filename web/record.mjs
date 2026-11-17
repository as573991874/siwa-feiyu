// 逐帧录制一段自动游玩的视频：node record.mjs [输出文件] [最多秒数]
// 模拟按 60Hz 推进、每两步截一帧（30fps），截图通过管道直接喂给 ffmpeg。
// 剧本：前三关正常打（第三关的第一次拼力气故意输给她），然后跳到最后一关、把时限压到几秒，演示失败演出。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] || 'preview/gameplay.mp4', maxSec = +(process.argv[3] || 170), W = 720, H = 1280;
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5199/?manual&bot', { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.app && (window.app.ready || window.app.error)', { timeout: 180000 });
await p.evaluate(() => { app.save.sfx = false; window.__rec = { lazyDone: false, jumped: false, squeezed: false }; });
const t0 = Date.now(); let tail = 0, f = 0;
for (; f < maxSec * 30; f++) {
  const st = await p.evaluate(() => {
    const g = app.game, r = window.__rec;
    if (g.level === 2 && g.state === 'duel' && g.duel.phase === 'in' && !r.lazyDone) { g.duel.botLazy = true; r.lazyDone = true; }
    if (g.duel.phase === 'fail') g.duel.botLazy = false;
    if (g.level === 2 && g.state === 'win' && g.resT > 3.9 && !r.jumped) { r.jumped = true; g.startLevel(5); }
    if (r.jumped && g.state === 'play' && !r.squeezed) { r.squeezed = true; g.time = 7; }
    app.step(2);
    return { s: g.state, lv: g.level, ph: g.duel.phase };
  });
  const shot = await p.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f} (${(f / 30).toFixed(0)}s) level ${st.lv + 1} ${st.s} ${st.ph}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  if (st.s === 'lose') { if (++tail > 190) break; } // 失败演出 + 结算留够 6 秒多
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close();
console.log(`done: ${out}, ${f} frames, ${(f / 30).toFixed(1)}s of video, took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
