// 无头截图验证：node verify.mjs [关卡号] [场景: run|duel|lose]   （需要 vite 在 5199 端口运行）
import puppeteer from 'puppeteer-core';
const level = process.argv[2] || '1', mode = process.argv[3] || 'run', W = 540, H = 960;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
p.on('console', (m) => { const t = m.text(); if (!/vite|404|deprecated|AudioContext/.test(t)) console.log('[console]', t.slice(0, 400)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:5199/?manual&bot&level=${level}`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.app && (window.app.ready || window.app.error)', { timeout: 180000 });
const err = await p.evaluate(() => window.app.error); if (err) { console.log('APP ERROR', err); await b.close(); process.exit(1); }
await p.evaluate(() => { app.save.sfx = false; });
let i = 0;
const snap = async (n, tag = '') => {
  await p.evaluate((n) => app.step(n), n); await p.screenshot({ path: `shots/${mode}_${String(i++).padStart(2, '0')}.png` });
  console.log(tag, JSON.stringify(await p.evaluate(() => ({ s: app.game.state, ph: app.game.duel.phase, T: +app.game.duel.T.toFixed(2), t: +app.game.time.toFixed(1), gap: +app.game.gap.toFixed(2), broken: +(app.game.broken * 100).toFixed(1), power: +app.game.power.toFixed(2), tears: app.game.tears }))));
};
if (mode === 'run') { for (const n of [30, 60, 60, 60, 60, 60, 60, 60, 80, 80, 80, 80, 100, 100, 100, 100]) await snap(n); }
if (mode === 'duel') {
  await snap(200, 'play'); await p.evaluate(() => { app.game.power = 1; });
  for (const n of [20, 30, 30, 40, 40, 40, 40, 40, 40, 40, 40, 40, 50, 60, 60]) await snap(n, 'duel');
}
if (mode === 'marks') { // 关掉自动玩家，只冲到近身，看左右标记
  await snap(200, 'play'); await p.evaluate(() => { app.game.bot = false; app.input.sprint = true; app.hands.forEach((h) => { h.state = 'idle'; }); });
  await snap(40, 'sprint'); await p.evaluate(() => { app.input.sprint = false; });
  for (const n of [30, 7, 7, 7, 7, 7]) await snap(n, 'near');
}
if (mode === 'win') {
  await snap(260, 'play'); await p.evaluate(() => { app.game.bonus = 1; });
  for (const n of [12, 30, 40, 50, 60, 80]) await snap(n, 'win');
}
if (mode === 'lose') {
  await snap(260, 'play'); await p.evaluate(() => { app.game.time = 0.05; });
  for (const n of [10, 30, 40, 50, 60, 60, 80]) await snap(n, 'lose');
}
await b.close();
