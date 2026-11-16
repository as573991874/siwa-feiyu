// 逐帧录制一段自动游玩的完整视频：node record.mjs [输出文件] [最多秒数]
// 模拟按 60Hz 推进、每两步截一帧（30fps），截图通过管道直接喂给 ffmpeg。
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
const out = process.argv[2] || 'preview/gameplay.mp4', maxSec = +(process.argv[3] || 150), W = 720, H = 1280;
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5199/?manual&bot', { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.app && (window.app.ready || window.app.error)', { timeout: 180000 });
await p.evaluate(() => { app.save.sfx = false; });
const t0 = Date.now(); let tail = 0, f = 0;
for (; f < maxSec * 30; f++) {
  const st = await p.evaluate(() => { app.step(2); const g = app.game; return { s: g.state, lv: g.level, last: g.level === app.LEVELS.length - 1 }; });
  const shot = await p.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f} (${(f / 30).toFixed(0)}s) level ${st.lv + 1} ${st.s}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  if ((st.s === 'win' && st.last) || st.s === 'lose') { if (++tail > 120) break; } // 结算画面多留 4 秒
}
ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close();
console.log(`done: ${out}, ${f} frames, ${(f / 30).toFixed(1)}s of video, took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
