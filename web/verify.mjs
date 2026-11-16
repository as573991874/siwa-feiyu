// 无头截图验证：node verify.mjs [关卡号] [帧数序列]   （需要 vite 在 5199 端口运行）
import puppeteer from 'puppeteer-core';
const level = process.argv[2] || '1', W = 540, H = 960;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
p.on('console', (m) => { const t = m.text(); if (!/vite|404|deprecated|AudioContext/.test(t)) console.log('[console]', t.slice(0, 400)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:5199/?manual&bot&level=${level}`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.app && (window.app.ready || window.app.error)', { timeout: 180000 });
const err = await p.evaluate(() => window.app.error); if (err) { console.log('APP ERROR', err); await b.close(); process.exit(1); }
await p.evaluate(() => { app.save.sfx = false; });
const marks = (process.argv[3] || '20,60,100,130,170,215,260,300,340,380,430,500,600,700,900,1200').split(',').map(Number);
let f = 0, i = 0;
for (const m of marks) {
  await p.evaluate((n) => app.step(n), m - f); f = m;
  await p.screenshot({ path: `shots/v_${String(i++).padStart(2, '0')}.png` });
  console.log(m, JSON.stringify(await p.evaluate(() => ({ s: app.game.state, t: +app.game.time.toFixed(1), gap: +app.game.gap.toFixed(2), view: +app.game.view.toFixed(2), broken: +(app.game.broken * 100).toFixed(1), tears: app.game.tears, stam: +app.game.stamina.toFixed(2), hands: app.hands.map((h) => h.state).join('/') }))));
}
await b.close();
