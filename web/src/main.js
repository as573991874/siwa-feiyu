// 撕袜大作战 · 肥鱼快跑：竖屏第一人称追逐。
// 按住冲刺追近（高机位、看得到全身）→ 松开进入近身视角 → 她哪条腿后甩，就用哪只手拽住撕破。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { fitLeg } from './legfit.js';
import { StockingLeg } from './stocking.js';
import { Skirt } from './skirt.js';
import { Girl } from './girl.js';
import { loadMan } from './man.js';
import { Interior } from './env.js';
import * as sfx from './audio.js';
import { makeSharedUniforms, makeLegacyLegMaterial, makeBackdrop } from './shaders.js';

const query = new URLSearchParams(location.search);
const MANUAL = query.has('manual'); // 逐帧推进（截图 / 录像）
const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.min(b, Math.max(a, x)), smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// 布料参数
const params = {
  pinchRadius: 0.016, maxPull: 0.24, windowRows: 21, windowCols: 20,
  substeps: 1, iterations: 12, stretchK: 0.85, compressK: 0.05, stick: 0.85, press: 0.00013, damping: 0.8, slackDecay: 7,
  tearDist: 0.085, holeSize: 0.82, runLength: 0.9,
};

// ------------------------------------------------------------ 关卡（心流：教学 → 加码 → 加码 → 喘息 → 高压 → 决战）
const STYLE = {
  black: { color: '#1b1310', sheen: '#8f7b72', dens: 1.0 }, white: { color: '#dcd8e2', sheen: '#ffffff', dens: 1.5 },
  nude: { color: '#a8775c', sheen: '#f0cdb8', dens: 0.75 }, pink: { color: '#d9809f', sheen: '#ffd2e0', dens: 1.1 },
  net: { color: '#120e0d', sheen: '#6f625c', dens: 1.0, net: 1 },
};
// hold: 拽多久才撕得开；win: 后甩到多高才够得着（越大窗口越窄）；escape: 近身后她甩开你的速度
// tap: 拼力气时每点一下涨多少；pullback: 她每秒往回拽多少
const LEVELS = [
  { name: '① 午后客厅', sub: '超薄黑丝 · 慢跑', style: 'black', thick: 0.6, hold: 0.24, run: 'jog', speed: 3.2, win: 0.15, escape: 0.13, time: 30, goal: 0.42, scene: 'living', mood: 'afternoon', gap: 2.2, tap: 0.045, pullback: 0.18 },
  { name: '② 清晨树屋', sub: '白丝 · 蹦跳跑', style: 'white', thick: 1.0, hold: 0.3, run: 'skip', speed: 3.4, win: 0.3, escape: 0.16, time: 30, goal: 0.5, scene: 'treehouse', mood: 'morning', gap: 2.6, tap: 0.043, pullback: 0.2 },
  { name: '③ 黄昏卧室', sub: '渔网 · 蛇形走位', style: 'net', thick: 1.0, hold: 0.32, run: 'zigzag', speed: 3.8, win: 0.4, escape: 0.19, time: 32, goal: 0.55, scene: 'bedroom', mood: 'dusk', gap: 2.8, tap: 0.041, pullback: 0.22 },
  { name: '④ 烛光客厅', sub: '超薄肉丝 · 喘口气', style: 'nude', thick: 0.6, hold: 0.2, run: 'stroll', speed: 2.6, win: 0.1, escape: 0.1, time: 18, goal: 0.48, scene: 'living', mood: 'candle', gap: 2.0, tap: 0.05, pullback: 0.16 },
  { name: '⑤ 萤火树屋', sub: '加厚樱粉 · 全力冲刺', style: 'pink', thick: 1.6, hold: 0.4, run: 'sprint', speed: 4.6, win: 0.5, escape: 0.24, time: 36, goal: 0.62, scene: 'treehouse', mood: 'firefly', gap: 3.0, tap: 0.039, pullback: 0.23 },
  { name: '⑥ 霓虹卧室', sub: '加厚黑丝 · 多动症', style: 'black', thick: 1.7, hold: 0.42, run: 'hyper', speed: 5.0, win: 0.55, escape: 0.28, time: 40, goal: 0.7, scene: 'bedroom', mood: 'neon', gap: 3.2, tap: 0.038, pullback: 0.24 },
];
const GRAB_RANGE = 1.12, GAP_MIN = 0.78, GAP_MAX = 4.2;
const save = { unlocked: 1, sfx: true, shake: 1 };
try { Object.assign(save, JSON.parse(localStorage.getItem('siwa-run') || '{}')); } catch { /* 存储不可用就用默认值 */ }
const persist = () => { try { localStorage.setItem('siwa-run', JSON.stringify(save)); } catch { /* 忽略 */ } };

// ------------------------------------------------------------ 场景
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: MANUAL });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.localClippingEnabled = true;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 9 / 16, 0.02, 400);
const backdrop = makeBackdrop(); scene.add(backdrop);
const keyDirW = new THREE.Vector3(0.5, 0.75, 0.6).normalize(), fillDirW = new THREE.Vector3(-0.7, 0.15, 0.5).normalize();
const key = new THREE.DirectionalLight(0xfff4ea, 1.7); key.position.copy(keyDirW).multiplyScalar(5); scene.add(key);
const hemi = new THREE.HemisphereLight(0xcfe3f0, 0x8d8690, 0.9); scene.add(hemi, new THREE.AmbientLight(0xffffff, 0.35));
const shared = makeSharedUniforms();
const world = new Interior(scene, backdrop, key, hemi);

function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const blobTex = radialTexture([[0, 'rgba(20,12,10,0.6)'], [0.5, 'rgba(20,12,10,0.25)'], [1, 'rgba(20,12,10,0)']]);
const blobs = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = -4; scene.add(m); return m;
});
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// 撕下来的碎片
const SHREDS = 60;
const shredMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.016, 0.007), new THREE.MeshBasicMaterial({ color: 0x1b1310, side: THREE.DoubleSide }), SHREDS);
shredMesh.frustumCulled = false; scene.add(shredMesh);
const shreds = Array.from({ length: SHREDS }, () => ({ p: new THREE.Vector3(0, -9, 0), v: new THREE.Vector3(), life: 0, rot: new THREE.Euler(), spin: new THREE.Vector3() }));
let shredNext = 0;
function burst(pos, n, toward) {
  for (let k = 0; k < n; k++) {
    const s = shreds[shredNext++ % SHREDS]; s.p.copy(pos); s.life = 0.5 + Math.random() * 0.5;
    s.v.set((Math.random() - 0.5) * 2.2, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 1.2).addScaledVector(toward, 1 + Math.random() * 1.5);
    s.spin.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10); s.rot.set(Math.random() * 6, Math.random() * 6, 0);
  }
}
const _sm = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();
function updateShreds(dt) {
  shreds.forEach((s, i) => {
    if (s.life > 0) { s.life -= dt; s.v.y -= 6 * dt; s.v.multiplyScalar(Math.exp(-dt * 2.5)); s.p.addScaledVector(s.v, dt); s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt; }
    const k = s.life > 0 ? Math.min(1, s.life * 3) * 1.4 : 0;
    _sm.compose(s.p, _sq.setFromEuler(s.rot), _ss.set(k, k, k)); shredMesh.setMatrixAt(i, _sm);
  });
  shredMesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------ 角色
let vrm, girl, girlRoot, man, legs = [], skirt, legRefMesh, joints = [];
const tailParts = []; // 尾巴和丝带垂在身后，近身视角会把腿全挡住，所以贴近时藏起来
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
const raw = (n) => vrm.humanoid.getRawBoneNode(n);

async function load() {
  const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
  const [gltf, m] = await Promise.all([loader.loadAsync('/models/DeepSeek-chan.vrm'), loadMan()]);
  vrm = gltf.userData.vrm; man = m;
  scene.add(vrm.scene, man.root);
  vrm.scene.traverse((o) => { o.frustumCulled = false; });
  scene.updateMatrixWorld(true);

  // 原模型的长裙挡住了整条腿：隐藏，换成程序化百褶短裙
  let oldSkirt = null;
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (/skirt/i.test(o.name)) oldSkirt = o;
    else if (mat.name === 'Material_lower_body' && !/^Spring/i.test(o.name)) legRefMesh = o;
  });
  if (!legRefMesh) throw new Error('没找到腿部网格 (Material_lower_body)');
  if (oldSkirt) oldSkirt.visible = false;

  // 腿部拟合必须在绑定姿态、模型还没挪动之前做
  const wp = (n) => raw(n).getWorldPosition(new THREE.Vector3());
  const toLocal = new THREE.Matrix4().copy(legRefMesh.matrixWorld).invert();
  const J = (n) => wp(n).applyMatrix4(toLocal);
  const cx = J('hips').x, yTop = 0.88, yBot = 0.115;
  for (const [side, pre] of [[1, 'left'], [-1, 'right']]) {
    const A = J(pre + 'UpperLeg'), K = J(pre + 'LowerLeg'), F = J(pre + 'Foot');
    const fit = fitLeg(legRefMesh.geometry, side, cx, A, K, F, { NU: 128, NV: 240, yTop, yBot });
    const leg = new StockingLeg(fit, legRefMesh, shared, (yTop - K.y) / (yTop - yBot) + 0.015, params);
    legRefMesh.parent.add(leg.skinMesh, leg.mesh);
    legs.push(leg);
  }
  const oldMat = Array.isArray(legRefMesh.material) ? legRefMesh.material[0] : legRefMesh.material;
  legRefMesh.material = makeLegacyLegMaterial(shared, oldMat.map || oldMat.uniforms?.map?.value, yTop, yBot);

  // 把髋部挪到原点，外面套一层根节点负责转身和横移
  const hp = wp('hips');
  girlRoot = new THREE.Group(); scene.add(girlRoot); scene.remove(vrm.scene); girlRoot.add(vrm.scene);
  vrm.scene.position.set(-hp.x, 0, -hp.z);
  scene.updateMatrixWorld(true);
  skirt = new Skirt(raw('hips'), wp('hips'));
  scene.add(skirt.mesh);
  girl = new Girl(vrm, girlRoot); girl.say = say;
  legs[0].material.uniforms.uHotColor.value.set('#3fd0ff'); legs[1].material.uniforms.uHotColor.value.set('#ff5d8f');
  vrm.scene.traverse((o) => { if (/whale_tail|ribbon_(left|right)_tail/i.test(o.name)) tailParts.push(o); });
  joints = [...(vrm.springBoneManager?.joints || [])].map((j) => ({ j, g: j.settings.gravityPower, d: j.settings.gravityDir.clone() }));
  girl.update(0);
  for (let i = 0; i < 40; i++) { vrm.update(1 / 60); scene.updateMatrixWorld(true); updateSkirt(1 / 60, 0); }
  $('loading').remove();
}

const cap = () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), ra: 0, rb: 0 });
const colliders = [cap(), cap(), cap()];
const calf = [new THREE.Vector3(), new THREE.Vector3()];
function updateSkirt(dt, wind) {
  ['left', 'right'].forEach((pre, i) => {
    raw(pre + 'UpperLeg').getWorldPosition(colliders[i].a); raw(pre + 'LowerLeg').getWorldPosition(colliders[i].b);
    colliders[i].ra = 0.094; colliders[i].rb = 0.07;
    raw(pre + 'Foot').getWorldPosition(tmpV); blobs[i].position.set(tmpV.x, 0.004, tmpV.z);
    blobs[i].material.opacity = clamp(1.2 - tmpV.y * 3, 0.15, 1);
    calf[i].copy(colliders[i].b).lerp(tmpV, 0.42);
  });
  raw('hips').getWorldPosition(tmpV);
  const back = girlRoot ? Math.cos(girlRoot.rotation.y) : 1; // 臀部碰撞体放在身后
  colliders[2].a.set(tmpV.x, tmpV.y - 0.02, tmpV.z - 0.035 * back); colliders[2].b.set(tmpV.x, tmpV.y - 0.08, tmpV.z - 0.03 * back); colliders[2].ra = colliders[2].rb = 0.135;
  skirt.update(dt, colliders, wind);
}
/** 跑起来以后头发、尾巴、丝带被风往后带 */
function setWind(run) {
  for (const { j, g, d } of joints) { j.settings.gravityPower = g + 0.5 * run; j.settings.gravityDir.copy(d).lerp(tmpV.set(0, -0.25, 1).normalize(), 0.75 * run).normalize(); }
}

// ------------------------------------------------------------ 输入
const input = { sprint: false, hand: [false, false] };
const KEYS = { Space: 'sprint', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyW: 'sprint', ArrowUp: 'sprint', KeyA: 0, ArrowLeft: 0, KeyJ: 0, KeyD: 1, ArrowRight: 1, KeyL: 1 };
function setInput(k, on) {
  if (game.bot) return;
  if (game.state === 'duel') { if (on) duelTap(); return; }
  if (k === 'sprint') input.sprint = on; else { if (on && !input.hand[k]) pressHand(k); input.hand[k] = on; }
}
addEventListener('keydown', (e) => { if (e.code in KEYS) { e.preventDefault(); if (!e.repeat) setInput(KEYS[e.code], true); } else if (e.code === 'Escape') game.pause(); });
addEventListener('keyup', (e) => { if (e.code in KEYS) setInput(KEYS[e.code], false); });
for (const [id, k] of [['bL', 0], ['bR', 1], ['bSprint', 'sprint']]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); setInput(k, true); });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, () => setInput(k, false));
}
addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', () => { if (game.state === 'duel' && !game.bot) duelTap(); });

// ------------------------------------------------------------ 界面小部件（全部按游戏时间驱动，方便逐帧录像）
const ui = { popT: 9, bubbleT: 9, bigT: 9, bigDur: 1, tipT: 9, flash: 0 };
function say(text) { $('bubble').textContent = text; ui.bubbleT = 0; }
function pop(text) { $('pop').textContent = text; ui.popT = 0; }
function big(title, sub = '', dur = 1.2) { const b = $('big'); b.firstElementChild.textContent = title; b.lastElementChild.textContent = sub; b.lastElementChild.style.display = sub ? '' : 'none'; ui.bigT = 0; ui.bigDur = dur; }
function tip(text) { $('tip').textContent = text; ui.tipT = 0; }
function updateUI(dt) {
  ui.popT += dt; ui.bubbleT += dt; ui.bigT += dt; ui.tipT += dt; ui.flash = Math.max(0, ui.flash - dt * 5);
  const p = $('pop'), a = ui.popT / 0.7;
  p.style.opacity = a < 1 ? Math.min(1, a * 5) * (1 - smooth((a - 0.6) / 0.4)) : 0;
  p.style.transform = `translate(-50%, ${-50 - a * 60}%) scale(${a < 0.2 ? 0.6 + a * 3 : 1.2 - (a - 0.2) * 0.25})`;
  const b = $('bubble'), ba = ui.bubbleT / 1.2;
  b.style.opacity = ba < 1 ? Math.min(1, ba * 8) * (1 - smooth((ba - 0.8) / 0.2)) : 0;
  if (ba < 1 && vrm) {
    raw('head').getWorldPosition(tmpV); tmpV.y += 0.2; tmpV.project(camera);
    const w = view.clientWidth, h = view.clientHeight;
    b.style.left = clamp((tmpV.x * 0.5 + 0.5) * w + 70, 80, w - 80) + 'px'; b.style.top = clamp((-tmpV.y * 0.5 + 0.5) * h, 130, h * 0.5) + 'px';
  }
  const g = $('big'), ga = ui.bigT / ui.bigDur;
  g.style.opacity = ga < 1 ? Math.min(1, ga * 8) * (1 - smooth((ga - 0.75) / 0.25)) : 0;
  g.style.transform = `scale(${ga < 0.12 ? 1.6 - ga * 5 : 1 + ga * 0.06})`;
  $('tip').style.opacity = ui.tipT < 2.4 ? Math.min(1, ui.tipT * 5) * (1 - smooth((ui.tipT - 2) / 0.4)) * (0.75 + 0.25 * Math.sin(ui.tipT * 9)) : 0;
  $('flash').style.opacity = ui.flash * 0.5;
}

// ------------------------------------------------------------ 双手
// state: idle（跟着腿 / 摆臂）| grab（拽住）| miss（抓空）| recoil（撕完往回扯）
const hands = [0, 1].map((i) => ({ i, state: 'idle', t: 0, tension: 0, pos: new THREE.Vector3(), from: new THREE.Vector3(), pinch: 0, snap: 16 }));

function pressHand(h) {
  if (game.state !== 'play') return;
  const H = hands[h], lv = game.lv;
  if (H.state !== 'idle') return;
  const near = game.view > 0.55, open = girl.kick(h) > lv.win - 0.12;
  if (near && open) {
    const spot = legs[h].pickSpot();
    if (spot && legs[h].grab(spot.i, spot.j)) { H.state = 'grab'; H.t = 0; H.tension = 0; sfx.tone(300 + h * 60, 0.05, 'triangle', 0.08); return; }
  }
  H.state = 'miss'; H.t = 0; H.from.copy(calf[h]); game.combo = 0; sfx.tone(180, 0.08, 'sine', 0.07);
  if (near) { girl.react('miss'); const other = girl.kick(1 - h) > lv.win - 0.12; pop(other ? `错手！这是${h ? '左' : '右'}腿` : '早了！等腿亮起来'); } else tip(game.gap > GRAB_RANGE ? '太远了，先按住冲刺追上去' : '松开冲刺再伸手');
}
function doTear(h) {
  const H = hands[h], leg = legs[h], g = leg.grabbed;
  const chain = leg.damagedNear(g.ci, g.cj);
  game.combo = game.lastHand !== h && game.clock - game.lastTear < 1.4 ? game.combo + 1 : 1; game.lastHand = h; game.lastTear = game.clock;
  const energy = (1.05 + Math.random() * 0.4) * (chain ? 1.25 : 1) * (1 + Math.min(6, game.combo - 1) * 0.07);
  leg.restToWorld(g.c, g.target, H.from);
  leg.tearAt(g.ci, g.cj, energy); leg.release();
  H.state = 'recoil'; H.t = 0;
  shredMesh.material.color.copy(shared.uFabricColor.value);
  burst(H.from, 7 + Math.floor(energy * 4), tmpV.subVectors(camera.position, H.from).normalize());
  sfx.rip(Math.min(1.4, energy)); game.shake = 0.03; game.slow = 0.09; ui.flash = 0.5;
  game.tears++;
  game.power = Math.min(1, game.power + 0.1 * (1 + 0.08 * Math.min(6, game.combo - 1)));
  if (!game.duels && game.broken > game.lv.goal * 0.55) game.power = 1; // 进度过半还没触发过，就直接给一次
  girl.react('tear');
  pop(game.combo >= 3 ? `左右开弓 ×${game.combo}！` : chain ? '顺着撕！' : '嘶啦！');
}
function dropHand(h, snapSound) {
  const H = hands[h]; if (H.state === 'grab') { legs[h].release(); if (snapSound) sfx.snap(); }
  H.state = 'idle'; H.t = 0; H.tension = 0;
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _toCam = new THREE.Vector3();
function updateHands(dt, time) {
  const fwd = camera.getWorldDirection(_fwd), right = _right.crossVectors(fwd, camera.up).normalize();
  const up = camera.up, lv = game.lv, playing = game.state === 'play';
  if (game.state === 'duel' || game.state === 'win' || game.state === 'lose') { // 演出：双手不再各追各的腿
    const L = hands[0], R = hands[1], d = game.duel;
    if (game.state === 'duel' && (d.phase === 'in' || d.phase === 'tug')) {
      const leg = legs[0], g = leg.grabbed, cell = (a, out) => { const a3 = a * 3; return leg.restToWorld(a, tmpV3.set(leg.p0[a3], leg.p0[a3 + 1], leg.p0[a3 + 2]), out); };
      if (g) { leg.restToWorld(g.c, g.target, R.pos); R.snap = 40; R.pinch = 1; }
      else { cell(d.cell, R.pos); R.pos.y += 0.1 * (1 - smooth(d.t / 0.9)); R.snap = 10; R.pinch = 0.4; }
      cell(d.ankle, L.pos); L.pos.y += 0.02; L.pinch = 0.85; L.snap = g ? 30 : 8;
    } else if (game.state === 'lose') { // 力竭趴地：两只手摊在地板上
      R.pos.set(camera.position.x + 0.1, 0.1 + Math.sin(time * 1.3) * 0.012, camera.position.z - 0.62); L.pos.set(camera.position.x - 0.26, 0.05, camera.position.z - 0.42); // 右手还不死心地朝她的鞋尖够
      R.pinch = L.pinch = 0.12; R.snap = L.snap = 5;
    } else { // 撕完了：手收回来
      for (const H of hands) { const sg = H.i ? 1 : -1; H.pos.copy(camera.position).addScaledVector(right, sg * 0.24).addScaledVector(fwd, 0.3); H.pos.y -= 0.42 - 0.02 * Math.sin(time * 2 + H.i); H.pinch = 0.6; H.snap = 6; }
      // 撕开时右手往右下方甩开，不挡镜头
      if (game.state === 'duel' && d.phase === 'rip') { { const k = smooth(d.t / 0.5); R.pos.copy(d.from).addScaledVector(fwd, -0.12 * k).addScaledVector(right, 0.18 * k).addScaledVector(up, 0.06 * k); } R.pinch = 1; R.snap = 20; }
    }
    man.update(dt, camera, hands[0], hands[1], time);
    return;
  }
  for (const H of hands) {
    const h = H.i, sgn = h ? 1 : -1, leg = legs[h];
    H.t += dt;
    if (H.state === 'grab') {
      const g = leg.grabbed;
      if (!g || !playing || game.gap > GRAB_RANGE + 0.3) { dropHand(h, true); }
      else if (!input.hand[h] && H.tension < 1) { dropHand(h, true); pop('没撕动…'); }
      else {
        H.tension += dt / (lv.hold * (1 - Math.min(0.3, (game.combo - 1) * 0.05)));
        const T = Math.min(1.05, H.tension), yank = Math.sin(H.t * 34) * 0.012 * T; // 一下一下地往回拽
        const c3 = g.c * 3, d = 0.03 + 0.17 * smooth(T) + yank, n0 = leg.n0;
        leg.drag(tmpV.set(g.origin.x + n0[c3] * d, g.origin.y + n0[c3 + 1] * d + d * 0.3, g.origin.z + n0[c3 + 2] * d));
        leg.restToWorld(g.c, g.target, H.pos); H.pinch = 1; H.snap = 40;
        if (H.tension >= 1) doTear(h);
        continue;
      }
    }
    if (H.state === 'recoil') {
      const k = H.t / 0.32; if (k >= 1) { H.state = 'idle'; H.t = 0; }
      const e = Math.sin(Math.min(1, k * 1.6) * Math.PI / 2); // 撕开的一瞬间整条胳膊往后甩出去，再慢慢收回
      H.pos.copy(H.from).addScaledVector(fwd, -0.3 * e).addScaledVector(up, 0.14 * e - 0.1 * k * k).addScaledVector(right, sgn * 0.2 * e); H.pinch = 1 - k * 0.6; H.snap = 34; continue;
    }
    if (H.state === 'miss') {
      const k = H.t / 0.26; if (k >= 1) { H.state = 'idle'; H.t = 0; }
      H.pos.copy(H.from).addScaledVector(fwd, 0.1 * Math.sin(k * Math.PI)); H.pos.y += 0.04; H.pinch = Math.sin(k * Math.PI); H.snap = 30; continue;
    }
    // idle：近身时追着自己那条腿的小腿，手指不停地抓；跑动时摆臂，快追上了就往前够
    const ph = game.pPhase + (h ? 0 : Math.PI), swing = Math.sin(ph), s = game.sprintK;
    tmpV.copy(camera.position).addScaledVector(right, sgn * (0.2 + 0.03 * s)).addScaledVector(up, -0.36 + 0.07 * swing).addScaledVector(fwd, 0.34 + (0.11 + 0.05 * s) * swing);
    let pinch = 0.55 + 0.2 * swing;
    const reach = playing ? smooth((2.1 - game.gap) / 0.9) * (1 - game.view) : 0; // 快追上了：两只手往前伸、抓空气
    if (reach > 0) {
      tmpV2.copy(camera.position).addScaledVector(right, sgn * 0.17).addScaledVector(up, -0.24 + 0.05 * Math.sin(time * 13 + h * 2)).addScaledVector(fwd, 0.5 + 0.07 * Math.sin(time * 9 + h * 3));
      tmpV.lerp(tmpV2, reach * (0.55 + 0.25 * swing)); pinch = lerp(pinch, 0.5 + 0.5 * Math.sin(time * 15 + h * 2.4), reach);
    }
    if (game.view > 0.02 && playing) {
      tmpV2.copy(calf[h]); tmpV2.addScaledVector(_toCam.subVectors(camera.position, tmpV2).normalize(), 0.085);
      tmpV2.x += Math.sin(time * 12 + h * 2) * 0.018; tmpV2.y += Math.sin(time * 16 + h) * 0.014 + (girl.kick(h) < lv.win ? 0.05 : 0);
      tmpV.lerp(tmpV2, smooth(game.view)); pinch = lerp(pinch, 0.3 + 0.3 * Math.sin(time * 17 + h * 2.6), game.view);
    }
    if (game.state === 'intro' && game.t < 1.9) { tmpV.copy(camera.position).addScaledVector(right, sgn * 0.3).addScaledVector(fwd, 0.25); tmpV.y -= 0.6; }
    H.pos.copy(tmpV); H.pinch = pinch; H.snap = 14 + 14 * game.view;
  }
  man.update(dt, camera, hands[0], hands[1], time);
}

// ------------------------------------------------------------ 相机：冲刺时高机位看全身，近身时压低看腿；全程带奔跑晃动
const camState = { fov: 66, look: new THREE.Vector3(0, 0.9, 0), pos: new THREE.Vector3(0, 1.5, 3), n: 0 };
function gameplayCam(outPos, outLook, time) {
  const m = smooth(game.view), s = game.sprintK, gx = girlRoot.position.x, sh = save.shake;
  const step = Math.sin(game.pPhase), amp = lerp(0.022, 0.011, m) + 0.02 * s;
  const noise = Math.sin(time * 7.3) * 0.5 + Math.sin(time * 12.7 + 1) * 0.3 + Math.sin(time * 19.1 + 2) * 0.2;
  outPos.set(gx * lerp(0.5, 0.85, m) + step * (0.022 + 0.014 * s) * sh + noise * 0.006 * sh,
    lerp(1.5, 0.82, m) + 0.05 * s + Math.abs(Math.cos(game.pPhase)) * amp * 2 * sh,
    game.gap + 0.08 * m); // 贴近时别再往前凑：后甩的小腿会直接怼到镜头上
  outLook.set(gx * 0.9 + noise * 0.012 * sh, lerp(0.9, 0.42, m) + Math.sin(game.pPhase * 2 + 0.6) * 0.012 * sh, -0.05);
  return { fov: 66 + 9 * s - 3 * m, roll: (step * (0.012 + 0.014 * s) + noise * 0.005) * sh };
}
const _gp = new THREE.Vector3(), _gl = new THREE.Vector3(), _ip = new THREE.Vector3(), _il = new THREE.Vector3();
function updateCamera(dt, time) {
  const g = gameplayCam(_gp, _gl, time);
  let pos = _gp, look = _gl, fov = g.fov, roll = g.roll;
  if (game.state === 'intro') { // 入场：从脚边贴着丝袜摇上去 → 她转身开跑 → 镜头甩到追逐位
    const t = game.t, a = smooth(t / 1.7), b = smooth((t - 1.75) / 1.0);
    _ip.set(lerp(0.34, -0.12, a), lerp(0.3, 1.22, a), lerp(1.0, 1.55, a)); _il.set(0, lerp(0.35, 1.05, a), 0);
    pos = _ip.lerp(_gp, b); look = _il.lerp(_gl, b); fov = lerp(52, g.fov, b); roll = lerp(Math.sin(t * 2.2) * 0.02, g.roll, b);
  }
  let rate = 14;
  const gx = girlRoot.position.x, br = Math.sin(time * 1.7);
  if (game.state === 'duel') { // 拼力气：越绷越贴近小腿；撕开的一瞬间怼上去；认输时拉远
    const d = game.duel, T = smooth((d.T - 0.45) / 0.5); rate = 7;
    if (d.phase === 'in') { _ip.set(gx + 0.55, 1.0, 1.55); _il.set(gx + 0.05, 0.35, 0.05); fov = 62; rate = 4; }
    else if (d.phase === 'tug') { _ip.set(gx + lerp(0.72, 0.62, T) + br * 0.008, lerp(0.8, 0.68, T), lerp(1.1, 1.0, T)); _il.set(gx + 0.06, lerp(0.2, 0.16, T), lerp(0.08, 0.14, T)); fov = lerp(60, 52, T); }
    else if (d.phase === 'rip') { _ip.set(gx + 0.62, 0.66, 0.98); _il.set(gx + 0.06, 0.15, 0.14); fov = 50; rate = 10; }
    else if (d.phase === 'sit') { _ip.set(gx + 0.35, 0.9, 1.45); _il.set(gx, 0.3, -0.15); fov = 56; rate = 4; }
    else { _ip.copy(_gp); _il.copy(_gl); rate = 5; }
    pos = _ip; look = _il; roll = br * 0.006;
  } else if (game.state === 'win') { _ip.set(gx + 0.35 + br * 0.01, 0.9, 1.45); _il.set(gx, 0.3, -0.15); pos = _ip; look = _il; fov = 54; roll = br * 0.004; rate = 4; }
  else if (game.state === 'lose') { // 趴在地上，视线从她的鞋尖慢慢抬到脸上
    const a = smooth((game.resT - 0.5) / 1.6);
    _ip.set(0.1, lerp(0.9, 0.25, smooth(game.resT / 0.5)) + br * 0.006, 1.16); _il.set(0.02, lerp(0.0, 0.64, a), 0.05);
    pos = _ip; look = _il; fov = 80; roll = lerp(0.1, 0.02, a) + br * 0.004; rate = 6;
  }
  const k = 1 - Math.exp(-dt * rate);
  camState.pos.lerp(pos, camState.n ? k : 1); camState.look.lerp(look, camState.n ? k : 1); camState.fov += (fov - camState.fov) * (camState.n ? k : 1); camState.n++;
  camera.position.copy(camState.pos);
  camera.position.x += (Math.random() - 0.5) * game.shake * save.shake; camera.position.y += (Math.random() - 0.5) * game.shake * save.shake;
  camera.up.set(0, 1, 0); camera.lookAt(camState.look); camera.rotateZ(roll);
  camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (Math.abs(camera.fov - camState.fov) > 0.05) { camera.fov = camState.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  game.shake *= Math.exp(-dt * 10);
}

// ------------------------------------------------------------ 游戏状态
const game = {
  state: 'load', level: 0, lv: LEVELS[0], t: 0, clock: 0, time: 0, broken: 0, gap: 2.4, stamina: 1, sprintK: 0, sprinting: false, winded: false, view: 0, pPhase: 0, dist: 0,
  combo: 0, lastHand: -1, lastTear: -9, tears: 0, shake: 0, slow: 0, bot: query.has('bot'), tipDone: {}, paused: false, tick: 0, resT: 0, power: 0, bonus: 0, scale: 1,
  duel: { phase: 'none', t: 0, T: 0, cell: 0, ankle: 0, from: new THREE.Vector3(), ladder: 0, botTap: 0, botLazy: false },

  startLevel(i, fullIntro = false) {
    this.level = clamp(i, 0, LEVELS.length - 1); const lv = this.lv = LEVELS[this.level], st = STYLE[lv.style];
    shared.uFabricColor.value.set(st.color); shared.uSheenColor.value.set(st.sheen); shared.uDensity.value = st.dens * lv.thick; shared.uNet.value = st.net ? 1 : 0;
    world.setTheme(lv.scene, lv.mood, shared); sfx.sound.on = save.sfx;
    legs.forEach((l) => l.reset()); hands.forEach((H) => { H.state = 'idle'; H.tension = 0; });
    girl.setStyle(lv.run); girl.setRunning(false); girl.c.yaw.x = girl.c.yaw.t = 0; girl.c.run.x = 0; girl.c.x.x = 0; girl.c.wave.t = 1;
    girl.faceT.angry = 0; girl.faceT.happy = 0.4; girl.faceT.sad = 0; girl.faceT.surprised = 0; girl.lids = 0;
    for (const ch of ['duel', 'sit', 'scorn', 'tug']) { girl.c[ch].t = 0; girl.c[ch].x = 0; girl.c[ch].v = 0; }
    girl.c.yaw.k = 26; girl.c.duel.k = 40;
    this.power = 0; this.bonus = 0; this.duels = 0; this.duel.phase = 'none'; this.scale = 1; params.pinchRadius = 0.016;
    this.time = lv.time; this.broken = 0; this.gap = 1.6; this.stamina = 1; this.combo = 0; this.lastHand = -1; this.lastTear = -9; this.tears = 0; this.view = 0; this.sprintK = 0; this.winded = false;
    input.sprint = false; input.hand = [false, false];
    this.state = 'intro'; this.t = fullIntro ? 0 : 1.0; this.paused = false; camState.n = 0;
    girl.update(0); vrm.update(0); scene.updateMatrixWorld(true); skirt.reset();
    for (const id of ['result', 'menu']) $(id).classList.add('hidden');
    for (const id of ['hud', 'pad', 'stam']) $(id).classList.remove('hidden');
    $('tug').classList.add('hidden');
    $('lvname').textContent = `${lv.name}　${lv.sub}`; $('prog').querySelector('.goal').style.left = lv.goal * 100 + '%';
    if (fullIntro) big('撕袜大作战', '肥鱼快跑', 1.7); else big(lv.name, lv.sub, 1.0);
    girl.later(0.35, () => say('来抓我呀～'));
    this.hud();
  },
  hud() {
    $('time').textContent = Math.max(0, this.time).toFixed(1); $('time').classList.toggle('low', this.time < 10);
    $('prog').querySelector('.fill').style.width = Math.min(100, this.broken * 100) + '%';
    $('prog').querySelector('.txt').textContent = `破碎 ${(this.broken * 100).toFixed(0)}% / 目标 ${Math.round(this.lv.goal * 100)}%`;
    $('gap').textContent = this.gap <= GRAB_RANGE ? '够得着！松开冲刺，伸手！' : `距离 ${this.gap.toFixed(1)} m`;
    $('combo').textContent = this.combo >= 2 ? `连撕 ×${this.combo}` : '';
    $('stam').firstElementChild.style.width = this.stamina * 100 + '%'; $('stam').classList.toggle('low', this.stamina < 0.2);
    $('fx-lines').style.opacity = this.sprintK * 0.9;
    $('power').firstElementChild.style.width = this.power * 100 + '%'; $('power').classList.toggle('full', this.power >= 1);
    const inTug = this.state === 'duel' && this.duel.phase === 'tug'; $('tug').classList.toggle('hidden', !inTug);
    if (inTug) $('tug').querySelector('i').style.width = clamp(this.duel.T, 0, 1) * 100 + '%';
    const near = this.view > 0.55 && this.state === 'play';
    [$('bL'), $('bR')].forEach((el, h) => { el.classList.toggle('hot', near && hands[h].state === 'idle' && girl.kick(h) > this.lv.win); el.classList.toggle('down', input.hand[h]); });
    $('bSprint').classList.toggle('down', this.sprinting);
  },
  end(won) {
    this.state = won ? 'win' : 'lose'; hands.forEach((H) => dropHand(H.i, false)); input.sprint = false; this.resT = 0;
    const last = this.level === LEVELS.length - 1, stars = !won ? 0 : this.time / this.lv.time > 0.4 ? 3 : this.time / this.lv.time > 0.15 ? 2 : 1;
    if (won && save.unlocked < this.level + 2) { save.unlocked = Math.min(LEVELS.length, this.level + 2); persist(); }
    $('resTitle').textContent = won ? (last ? '全部通关！' : '撕完收工！') : '让她跑了…';
    $('resStars').innerHTML = '★★★'.split('').map((s, i) => (i < stars ? s : `<i>${s}</i>`)).join('');
    $('resText').textContent = won ? `破碎 ${(this.broken * 100).toFixed(0)}%，还剩 ${this.time.toFixed(1)} 秒，一共撕了 ${this.tears} 下。` : `只撕到 ${(this.broken * 100).toFixed(0)}%，目标是 ${Math.round(this.lv.goal * 100)}%。`;
    $('resNext').textContent = won ? (last ? '从头再来' : '下 一 关') : '再 追 一 次';
    $('resNext').onclick = () => this.startLevel(won ? (last ? 0 : this.level + 1) : this.level);
    this.scale = 1; this.duel.phase = 'none';
    for (const id of ['pad', 'stam']) $(id).classList.add('hidden'); ui.tipT = 9;
    girl.setRunning(false);
    if (won) { // 认输：一屁股坐地上，气鼓鼓
      sfx.win(); big('撕完收工！', '', 1.3); girl.c.duel.t = 0; girl.c.sit.t = 1; girl.faceT.angry = 0.7; girl.faceT.happy = 0; girl.faceT.surprised = 0; say('哼，不跟你玩了！');
    } else { // 你力竭趴下，她侧过身叉着腰，低头斜你一眼
      sfx.lose(); girl.c.yaw.t = 0.75; girl.c.scorn.t = 1; girl.c.headYaw.t = -0.55; girl.faceT.angry = 0.35; girl.faceT.happy = 0; girl.lids = 0.5;
      girl.later(1.3, () => say('就这？'));
    }
  },
  // ---------- 大成功：气力槽攒满 → 慢放 → 她回身拽住袜口跟你拔河，狂点屏幕拼力气
  startDuel() {
    const d = this.duel, leg = legs[0];
    this.duels++; this.state = 'duel'; d.phase = 'in'; d.t = 0; d.T = 0.42; d.ladder = 0; d.botTap = 0; this.power = 1; input.sprint = false; input.hand = [false, false];
    d.cell = Math.round((leg.NV - 1) * 0.58) * leg.NU + Math.round(leg.NU * 0.25); // 左小腿正面（坐下伸腿后朝上）
    d.ankle = Math.round((leg.NV - 1) * 0.5) * leg.NU + Math.round(leg.NU * 0.06); // 左手按在膝盖外侧的丝袜上，离镜头远，不挡视线
    girl.setRunning(false); girl.c.duel.t = 1; girl.faceT.angry = 0.5; girl.faceT.happy = 0.25;
    girl.c.yaw.k = 190; girl.c.duel.k = 150; // 慢放里弹簧也跟着变慢，转身和摆姿势要加快才来得及
    big('大成功！', '狂点屏幕 · 拼力气', 1.3); ui.tipT = 9; sfx.win(); ui.flash = 0.6; say('想得美！');
  },
  duelUpdate(rdt) {
    const d = this.duel, leg = legs[0], lv = this.lv; d.t += rdt;
    this.scale = d.phase === 'rip' ? 0.22 : d.phase === 'in' || d.phase === 'tug' ? 0.42 : 1;
    if (d.phase === 'in' && d.t > 0.9) {
      params.pinchRadius = 0.024;
      d.phase = leg.grab(d.cell % leg.NU, Math.floor(d.cell / leg.NU)) ? 'tug' : 'fail'; d.t = 0;
    } else if (d.phase === 'tug') {
      if (this.bot) { d.botTap -= rdt; if (d.botTap <= 0) { duelTap(); d.botTap = (d.botLazy ? 0.42 : 0.115) * (0.7 + Math.random() * 0.6); } }
      d.T -= lv.pullback * (0.75 + 0.5 * Math.sin(d.t * 3.1)) * rdt;         // 她一阵一阵地往回拽
      girl.c.tug.t = (0.5 - d.T) * 2;
      const g = leg.grabbed, c3 = g.c * 3, n0 = leg.n0, dist = 0.025 + clamp(d.T, 0, 1.05) * 0.15;
      leg.drag(tmpV.set(g.origin.x + n0[c3] * dist, g.origin.y + n0[c3 + 1] * dist + dist * 0.15, g.origin.z + n0[c3 + 2] * dist));
      d.ladder -= rdt; if (d.T > 0.45 && d.ladder <= 0) { leg.ladderAt(g.ci + Math.round((Math.random() - 0.5) * 22), g.cj + Math.round((Math.random() - 0.5) * 40), 0.04 + 0.08 * d.T); d.ladder = 0.18; sfx.tone(900 + Math.random() * 500, 0.03, 'square', 0.03); }
      const losing = d.T > 0.68; girl.faceT.surprised = losing ? 0.7 : 0; girl.faceT.angry = losing ? 0.1 : 0.5; // 快输了就慌，占上风就得意
      if (d.T >= 1) { // 撕开了：沿小腿一路崩开
        leg.restToWorld(g.c, g.target, d.from);
        const ci = g.ci, cj = g.cj, keep = [params.holeSize, params.runLength]; params.holeSize = 1.7; params.runLength = 2.6;
        leg.tearAt(ci, cj, 2.0); leg.release();
        for (const [k, off] of [[1, -46], [2, 38], [3, -86]]) girl.later(0.05 * k, () => { params.holeSize = 1.3; params.runLength = 2.0; leg.tearAt(ci + Math.round((Math.random() - 0.5) * 14), cj + off, 1.5); params.holeSize = keep[0]; params.runLength = keep[1]; });
        params.holeSize = keep[0]; params.runLength = keep[1]; params.pinchRadius = 0.016;
        shredMesh.material.color.copy(shared.uFabricColor.value); burst(d.from, 28, tmpV.subVectors(camera.position, d.from).normalize());
        sfx.rip(1.4); this.shake = 0.05; ui.flash = 1; pop('嘶——啦！！'); this.bonus += 0.14; this.tears++;
        girl.faceT.surprised = 1; girl.faceT.angry = 0; girl.c.tug.t = -1; d.phase = 'rip'; d.t = 0;
      } else if (d.T <= 0 || d.t > 9) { // 被她拽回去了
        leg.release(); params.pinchRadius = 0.016; sfx.snap(); pop('被拽回去了…'); girl.faceT.happy = 1; girl.faceT.angry = 0; girl.faceT.surprised = 0; say('略略略～');
        girl.c.duel.t = 0; girl.c.tug.t = 0; d.phase = 'fail'; d.t = 0;
      }
    } else if (d.phase === 'rip' && d.t > 1.5) {
      d.phase = 'sit'; d.t = 0; girl.c.duel.t = 0; girl.c.tug.t = 0; girl.c.sit.t = 1; girl.faceT.surprised = 0; girl.faceT.angry = 0.7; girl.faceT.happy = 0; say('哼！赔我十双！');
      this.broken = (legs[0].zoneRatio() + legs[1].zoneRatio()) / 2 + this.bonus;
    } else if (d.phase === 'sit' && d.t > 1.9) {
      if (this.broken >= lv.goal) { this.end(true); return; }
      girl.c.sit.t = 0; girl.faceT.angry = 0; girl.faceT.happy = 0.4; d.phase = 'out'; d.t = 0; say('再来！抓不到～');
    } else if ((d.phase === 'out' && d.t > 0.55) || (d.phase === 'fail' && d.t > 0.8)) {
      this.power = d.phase === 'fail' ? 0.3 : 0; this.gap = d.phase === 'fail' ? 2.3 : 1.9; d.phase = 'none'; this.scale = 1;
      girl.c.yaw.k = 26; girl.c.duel.k = 40;
      girl.setRunning(true); this.state = 'play'; this.view = 0; camState.n = 1;
    }
  },
  pause() {
    if (this.state === 'load') return;
    this.paused = !this.paused; $('menu').classList.toggle('hidden', !this.paused);
    if (this.paused) buildMenu();
  },

  update(dt, rdt) {
    this.clock += dt; this.t += dt; this.tick++;
    const lv = this.lv;
    if (this.state === 'duel') this.duelUpdate(rdt);
    if (this.state === 'intro') {
      if (this.t > 1.7 && !girl.running) { girl.setRunning(true); girl.c.wave.t = 0; big('追！', '', 0.8); sfx.tick(); }
      if (this.t > 1.7) this.gap = lerp(1.6, lv.gap, smooth((this.t - 1.7) / 1.2));
      if (this.t > 3.0) { this.state = 'play'; if (!this.tipDone.sprint) { this.tipDone.sprint = 1; tip('按住【冲刺】追上去！'); } }
    }
    const run = clamp(girl.c.run.x, 0, 1);
    if (this.state === 'win' || this.state === 'lose') { // 结算：镜头留在身后
      this.resT += dt; this.gap += (2.4 - this.gap) * (1 - Math.exp(-dt * 2));
      if (this.resT > (this.state === 'lose' ? 3.6 : 2.2)) $('result').classList.remove('hidden');
      if (this.bot && this.resT > 4.2 && this.state === 'win' && this.level < LEVELS.length - 1) this.startLevel(this.level + 1);
    }
    if (this.state === 'play') {
      if (this.bot) botPlay(dt);
      // 冲刺：耗体力、快速拉近；体力见底要缓一下
      if (this.stamina <= 0) this.winded = true;
      if (this.stamina > 0.25) this.winded = false;
      this.sprinting = input.sprint && !this.winded && this.gap > GAP_MIN + 0.01;
      const holding = hands.some((H) => H.state === 'grab');
      let rate;
      if (this.sprinting) { rate = -1.55; this.stamina -= dt * 0.42; }
      else { rate = this.gap > GRAB_RANGE ? 0.34 : lv.escape * (holding ? 0.7 : 1); this.stamina += dt * (this.gap <= GRAB_RANGE ? 0.32 : 0.24); }
      this.stamina = clamp(this.stamina, 0, 1);
      this.gap = clamp(this.gap + rate * dt, GAP_MIN, GAP_MAX);
      if (this.gap <= GRAB_RANGE && !this.tipDone.grab) { this.tipDone.grab = 1; tip('松开冲刺！看她哪条腿后甩，就按哪只手'); }
      if (this.tick % 6 === 0) this.broken = (legs[0].zoneRatio() + legs[1].zoneRatio()) / 2 + this.bonus;
      this.time -= dt;
      if (this.broken >= lv.goal) this.end(true); else if (this.time <= 0) this.end(false);
      else if (this.power >= 1 && hands.every((H) => H.state === 'idle')) this.startDuel();
    } else this.sprinting = false;
    this.sprintK += ((this.sprinting ? 1 : 0) - this.sprintK) * (1 - Math.exp(-dt * 7));
    const near = this.state === 'play' && !this.sprinting && this.gap <= GRAB_RANGE + 0.12;
    this.view += ((near ? 1 : 0) - this.view) * (1 - Math.exp(-dt * (near ? 9 : 6)));
    this.pPhase += dt * Math.PI * lerp(2.7, 3.6, this.sprintK) * (this.state === 'intro' ? run : 1);
    this.dist += dt * lv.speed * run * (1 + 0.25 * this.sprintK);
    for (let h = 0; h < 2; h++) { const u = legs[h].material.uniforms.uHot, on = near && hands[h].state === 'idle' && girl.kick(h) > lv.win; u.value += ((on ? 1 : 0) - u.value) * (1 - Math.exp(-dt * 18)); }
    for (const o of tailParts) o.visible = false;
    girl.pace = 1 - 0.32 * this.view; // 贴近以后她的步子放慢一点，左右腿看得清
    this.hud();
  },
};

function duelTap() {
  const d = game.duel; if (game.state !== 'duel' || d.phase !== 'tug') return;
  d.T += game.lv.tap; game.shake = Math.max(game.shake, 0.006); sfx.tone(240 + d.T * 500, 0.04, 'triangle', 0.07);
  $('tug').classList.remove('hit'); void $('tug').offsetWidth; $('tug').classList.add('hit');
}

/** 自动游玩（录像 / 演示用）：远了就冲刺，够得着就左右开弓 */
const bot = { wait: [0, 0] };
function botPlay(dt) {
  if (game.gap > GRAB_RANGE * 0.98 && game.stamina > 0.3) input.sprint = true;
  if (game.gap < 0.86 || game.stamina < 0.03) input.sprint = false;
  for (let h = 0; h < 2; h++) {
    const H = hands[h]; bot.wait[h] -= dt;
    if (H.state === 'grab') { input.hand[h] = true; continue; }
    input.hand[h] = false;
    if (H.state === 'idle' && game.view > 0.75 && bot.wait[h] <= 0 && girl.kick(h) > game.lv.win + 0.08) { input.hand[h] = true; pressHand(h); bot.wait[h] = 0.35 + Math.random() * 0.55; }
  }
}

function buildMenu() {
  const box = $('levels'); box.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button'), open = i < save.unlocked;
    b.className = 'lv' + (open ? '' : ' lock') + (i === game.level ? ' cur' : '');
    b.innerHTML = `<b>${lv.name}</b><small>${open ? `${lv.sub} · ${lv.time}s / ${Math.round(lv.goal * 100)}%` : '未解锁'}</small>`;
    if (open) b.onclick = () => game.startLevel(i);
    box.appendChild(b);
  });
  $('optSfx').textContent = '音效：' + (save.sfx ? '开' : '关'); $('optShake').textContent = '镜头晃动：' + ['关', '正常', '猛'][save.shake];
}
$('optSfx').onclick = () => { save.sfx = !save.sfx; sfx.sound.on = save.sfx; persist(); buildMenu(); };
$('optShake').onclick = () => { save.shake = (save.shake + 1) % 3; persist(); buildMenu(); };
$('resume').onclick = () => game.pause(); $('gear').onclick = () => game.pause();
$('resRetry').onclick = () => game.startLevel(game.level); $('resMenu').onclick = () => { $('result').classList.add('hidden'); game.pause(); };

// ------------------------------------------------------------ 主循环
let time = 0, frameNo = 0;
function frame(rawDt, draw = true) {
  frameNo++;
  if (vrm && !game.paused) {
    game.slow = Math.max(0, game.slow - rawDt);
    const dt = rawDt * (game.slow > 0 ? 0.3 : 1) * game.scale; // 撕破瞬间的顿帧 + 拼力气时的慢放
    time += dt; shared.uTime.value = time;
    game.update(dt, rawDt);
    const run = clamp(girl.c.run.x, 0, 1);
    setWind(run);
    girl.update(dt);
    vrm.update(dt);
    scene.updateMatrixWorld(true);
    legRefMesh.skeleton.update();
    skirt.shapeMul = 1 - 0.85 * clamp(Math.max(girl.c.duel.x, girl.c.sit.x), 0, 1);
    updateSkirt(dt, 9 * run);
    updateCamera(dt, time);
    updateHands(dt, time);
    for (const leg of legs) leg.update(dt);
    world.update(game.dist);
    updateShreds(dt); updateUI(rawDt);
  }
  shared.uKeyDir.value.copy(keyDirW).transformDirection(camera.matrixWorldInverse);
  shared.uFillDir.value.copy(fillDirW).transformDirection(camera.matrixWorldInverse);
  shared.uUpV.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  if (draw) renderer.render(scene, camera);
}

let last = performance.now();
load().then(() => {
  window.app = {
    legs, params, shared, game, save, camera, hands, input, LEVELS, get girl() { return girl; }, get man() { return man; },
    step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt, i === n - 1); }, ready: true,
  };
  game.startLevel(query.has('level') ? +query.get('level') - 1 : 0, true); // 一进来就播入场动画，直接开玩
  if (!MANUAL) renderer.setAnimationLoop(() => { const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 30); last = now; frame(dt); });
  else frame(1 / 60);
}).catch((err) => { console.error(err); const l = $('loading'); if (l) l.textContent = '加载失败：' + err.message; window.app = { error: String(err.stack || err) }; });
