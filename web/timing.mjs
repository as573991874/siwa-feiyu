// 用自动玩家测每一关的通关用时（校准难度曲线）：node timing.mjs
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=180,320'] });
const p = await b.newPage(); await p.setViewport({ width: 180, height: 320 });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5199/?manual&bot', { waitUntil: 'load' });
await p.waitForFunction('window.app && (window.app.ready || window.app.error)', { timeout: 180000 });
for (let lv = 0; lv < 6; lv++) {
  const r = await p.evaluate((lv) => { app.save.sfx = false; const g = app.game; g.startLevel(lv); let n = 0, sprints = 0, was = false, duelFrames = 0, fails = 0, lastPh = '';
    while (g.state !== 'win' && g.state !== 'lose' && n < 9000) { app.step(6); n += 6; if (g.sprinting && !was) sprints++; was = g.sprinting; if (g.state === 'duel') duelFrames += 6; if (g.duel.phase === 'fail' && lastPh !== 'fail') fails++; lastPh = g.duel.phase; }
    return { level: lv + 1, state: g.state, clockUsed: +(g.lv.time - g.time).toFixed(1), limit: g.lv.time, realSec: +(n / 60).toFixed(0), duelSec: +(duelFrames / 60).toFixed(1), duels: g.duels, duelFails: fails, broken: +(g.broken * 100).toFixed(0), goal: Math.round(g.lv.goal * 100), tears: g.tears, sprints }; }, lv);
  console.log(JSON.stringify(r));
}
await b.close();
