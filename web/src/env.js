// 室内场景：一条望不到头的长房间。角色原地跑，地板 / 墙面贴图和成组的家具向后滚动来表现前进。
// 三套主题（客厅 / 卧室 / 树屋）× 各两种灯光氛围。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const HALF_W = 2.8, HEIGHT = 3.0, LEN = 120, SEG = 8, SEGS = 8;

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(rx, ry); return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

function woodFloor(hue, light) {
  return canvasTex(512, 512, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsl(${hue + rnd(-3, 3)}, ${rnd(28, 40)}%, ${light + rnd(-5, 5)}%)`; g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = 'rgba(30,16,8,0.5)'; g.fillRect(0, i * 64, 512, 2);
      for (let k = 0; k < 22; k++) { g.fillStyle = `rgba(40,22,10,${rnd(0.04, 0.12)})`; g.fillRect(rnd(0, 512), i * 64 + rnd(4, 60), rnd(30, 180), 1); }
      g.fillStyle = 'rgba(30,16,8,0.45)'; g.fillRect(rnd(0, 512), i * 64, 2, 64);
    }
  }, 1.4, LEN / 2);
}
function carpet(color, dot) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 2600; k++) { g.fillStyle = `rgba(255,255,255,${rnd(0.02, 0.07)})`; g.fillRect(rnd(0, 256), rnd(0, 256), 2, 2); }
    g.fillStyle = dot; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(x * 64 + (y % 2) * 32 + 16, y * 64 + 32, 5, 0, 7); g.fill(); }
  }, 2.8, LEN / 2);
}
/** 墙面：一张贴图 = 4 米长 × 3 米高。deco 负责在上面画窗 / 画框 */
function wall(base, trim, deco) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    deco(g, w, h);
    g.fillStyle = trim; g.fillRect(0, h * 0.7, w, h * 0.3); // 墙裙
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h * 0.7, w, 4); g.fillRect(0, h - 14, w, 14);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, h * 0.72, 2, h * 0.24); }
  }, LEN / 4, 1);
}
const windowDeco = (glow, frame) => (g, w, h) => {
  const gr = g.createLinearGradient(0, 40, 0, 230); gr.addColorStop(0, glow[0]); gr.addColorStop(1, glow[1]);
  g.fillStyle = frame; g.fillRect(150, 36, 212, 206); g.fillStyle = gr; g.fillRect(160, 46, 192, 186);
  g.fillStyle = frame; g.fillRect(252, 46, 8, 186); g.fillRect(160, 135, 192, 8);
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(120, 30, 34, 220); g.fillRect(358, 30, 34, 220); // 窗帘
};
const stripes = (a, inner) => (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = a; g.fillRect(x, 0, 14, h); } inner(g, w, h); };
const planks = (hue) => (g, w, h) => { for (let x = 0; x < w; x += 48) { g.fillStyle = `hsl(${hue + rnd(-4, 4)}, 30%, ${rnd(30, 40)}%)`; g.fillRect(x, 0, 46, h); } g.fillStyle = '#20301c'; g.beginPath(); g.arc(256, 130, 78, 0, 7); g.fill(); const gr = g.createRadialGradient(256, 130, 5, 256, 130, 70); gr.addColorStop(0, '#d8ffb0'); gr.addColorStop(1, '#3f8f4a'); g.fillStyle = gr; g.beginPath(); g.arc(256, 130, 66, 0, 7); g.fill(); g.fillStyle = '#20301c'; g.fillRect(252, 64, 8, 132); g.fillRect(190, 126, 132, 8); };

// ---------------------------------------------------------------- 家具（圆角体 + 基础几何体拼装，带灯晕和地面光斑）
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
let glowTex = null;
function softTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowTex = new THREE.CanvasTexture(c); return glowTex;
}
function add(g, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; }
const box = (g, mat, w, h, d, x, y, z) => add(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const rbox = (g, mat, w, h, d, x, y, z, r = 0.06) => add(g, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), mat, x, y, z);
const cyl = (g, mat, r1, r2, h, x, y, z, seg = 14) => add(g, new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z);
const ball = (g, mat, r, x, y, z) => add(g, new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
/** 灯晕：一张朝向镜头的柔光片 */
function halo(g, color, x, y, z, size = 0.9, op = 0.55) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.position.set(x, y, z); sp.scale.setScalar(size); g.add(sp); }
/** 灯打在地板 / 墙上的光斑 */
function pool(g, color, x, z, size = 2.2, op = 0.3) { const m = add(g, new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: softTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), x, 0.012, z); m.rotation.x = -Math.PI / 2; }
function wallPool(g, color, s, y, z, size = 2.0, op = 0.25) { const m = add(g, new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: softTex(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), s * (HALF_W - 0.012), y, z); m.rotation.y = -s * Math.PI / 2; }
function rug(g, color, w, d, z, round, border) {
  const mk = (col, ww, dd, y) => { const m = add(g, round ? new THREE.CircleGeometry(ww / 2, 40) : new THREE.PlaneGeometry(ww, dd), M(col, { roughness: 1 }), 0, y, z); m.rotation.x = -Math.PI / 2; };
  if (border) mk(border, w + 0.16, d + 0.16, 0.005); mk(color, w, d, 0.007);
}
function lamp(g, x, z, shade, h = 1.5) {
  const metal = M(0x3a3230, { metalness: 0.5, roughness: 0.4 });
  cyl(g, metal, 0.018, 0.018, h, x, h / 2, z, 8); cyl(g, metal, 0.17, 0.19, 0.03, x, 0.015, z);
  cyl(g, glow(shade), 0.13, 0.23, 0.3, x, h + 0.12, z, 18); halo(g, shade, x, h + 0.12, z, 1.3); pool(g, shade, x, z, 2.6, 0.32);
}
function plant(g, x, z, h = 1) {
  cyl(g, M(0xb86b4a), 0.17, 0.12, 0.3, x, 0.15, z); cyl(g, M(0x3a2a1e), 0.15, 0.15, 0.02, x, 0.3, z);
  const leaf = M(0x3f8a45, { roughness: 0.7 });
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.1 + 0.12 * Math.random(); const m = add(g, new THREE.ConeGeometry(0.07, 0.5 * h + 0.25 * Math.random(), 6), leaf, x + Math.cos(a) * r, 0.5 + 0.25 * h * Math.random() + 0.1, z + Math.sin(a) * r); m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
}
/** 墙上的画框 */
function frame(g, s, y, z, w, h, art) {
  const x = s * (HALF_W - 0.03);
  box(g, M(0x5a4030), 0.04, h + 0.08, w + 0.08, x, y, z); box(g, M(art, { roughness: 0.6 }), 0.045, h, w, x - s * 0.004, y, z);
  box(g, M(new THREE.Color(art).offsetHSL(0.08, 0, 0.15)), 0.05, h * 0.4, w * 0.5, x - s * 0.006, y - h * 0.12, z + w * 0.1);
}
function shelf(g, s, z) {
  const x = s * (HALF_W - 0.2), wood = M(0x7a5a40);
  box(g, wood, 0.36, 1.9, 1.3, x, 0.95, z);
  for (let row = 0; row < 4; row++) {
    box(g, M(0x2a1c14), 0.3, 0.38, 1.2, x - s * 0.04, 0.33 + row * 0.45, z);
    let zz = z - 0.55; while (zz < z + 0.5) { const w = 0.04 + Math.random() * 0.06, hh = 0.24 + Math.random() * 0.1; box(g, M(new THREE.Color().setHSL(Math.random(), 0.45, 0.5)), 0.2, hh, w, x - s * 0.1, 0.16 + row * 0.45 + hh / 2, zz + w / 2); zz += w + 0.008; }
  }
}
function sofa(g, s, z, fabric, cushion) {
  const x = s * (HALF_W - 0.55), f = M(fabric, { roughness: 0.95 }), leg = M(0x3a2a20);
  rbox(g, f, 0.9, 0.3, 2.0, x, 0.3, z, 0.08); rbox(g, f, 0.26, 0.62, 2.0, x + s * 0.36, 0.6, z, 0.1);
  for (const dz of [-0.92, 0.92]) rbox(g, f, 0.9, 0.34, 0.22, x, 0.52, z + dz, 0.09);
  for (const dz of [-0.47, 0.47]) rbox(g, f, 0.62, 0.16, 0.88, x - s * 0.08, 0.5, z + dz, 0.07); // 坐垫
  for (const dz of [-0.55, 0.05, 0.6]) rbox(g, M(dz === 0.05 ? cushion : new THREE.Color(cushion).offsetHSL(0.05, 0, -0.08)), 0.16, 0.36, 0.4, x + s * 0.16, 0.76, z + dz, 0.07).rotation.z = s * 0.3;
  for (const dx of [-0.36, 0.36]) for (const dz of [-0.9, 0.9]) cyl(g, leg, 0.025, 0.02, 0.15, x + dx, 0.075, z + dz, 8);
}
function coffeeTable(g, s, z) {
  const x = s * 1.45, wood = M(0x8a6444, { roughness: 0.5 });
  rbox(g, wood, 0.6, 0.05, 1.0, x, 0.4, z, 0.02); for (const dx of [-0.24, 0.24]) for (const dz of [-0.42, 0.42]) cyl(g, wood, 0.02, 0.02, 0.38, x + dx, 0.19, z + dz, 8);
  cyl(g, M(0xffffff, { roughness: 0.3 }), 0.04, 0.03, 0.07, x, 0.46, z - 0.2); rbox(g, M(0xb5654a), 0.22, 0.03, 0.3, x + 0.05, 0.44, z + 0.2, 0.01);
}
function bed(g, s, z, sheet, blanket, c) {
  const x = s * (HALF_W - 1.15), wood = M(0x7a5a48);
  rbox(g, wood, 2.15, 0.26, 1.7, x, 0.16, z, 0.04); rbox(g, M(sheet), 2.05, 0.24, 1.6, x, 0.4, z, 0.1);
  rbox(g, M(blanket, { roughness: 1 }), 1.35, 0.13, 1.66, x - s * 0.36, 0.5, z, 0.06); rbox(g, M(new THREE.Color(blanket).offsetHSL(0, 0, 0.12)), 0.22, 0.14, 1.66, x + s * 0.3, 0.51, z, 0.06); // 被子翻边
  rbox(g, wood, 0.12, 1.0, 1.7, x + s * 1.02, 0.6, z, 0.05);
  for (const dz of [-0.4, 0.4]) rbox(g, M(0xffffff, { roughness: 1 }), 0.4, 0.16, 0.62, x + s * 0.74, 0.6, z + dz, 0.08);
  ball(g, M(0x7fb5e6, { roughness: 1 }), 0.16, x + s * 0.2, 0.7, z + 0.3).scale.set(1.4, 0.85, 1); ball(g, M(0xf4f8ff), 0.07, x + s * 0.2, 0.66, z + 0.3).scale.set(1.5, 0.7, 1.2); // 床上的鲸鱼抱枕
  const post = M(0xf0e2da); for (const dx of [-1, 1]) for (const dz of [-0.82, 0.82]) cyl(g, post, 0.025, 0.025, 2.15, x + dx * 1.02, 1.08, z + dz, 8);
  const drape = new THREE.MeshStandardMaterial({ color: blanket, transparent: true, opacity: 0.42, side: THREE.DoubleSide, roughness: 1 });
  box(g, drape, 2.08, 0.02, 1.66, x, 2.15, z);
  for (const dz of [-0.83, 0.83]) for (const dx of [-0.8, 0.8]) { const d = add(g, new THREE.CylinderGeometry(0.16, 0.05, 1.5, 10, 1, true), drape, x + dx, 1.4, z + dz); d.scale.z = 0.5; } // 四角收起来的纱帘
}
function vanity(g, s, z, c) {
  const x = s * (HALF_W - 0.28), white = M(0xf4e8e2);
  rbox(g, white, 0.5, 0.06, 1.1, x, 0.76, z, 0.02); for (const dz of [-0.48, 0.48]) box(g, white, 0.44, 0.74, 0.05, x, 0.37, z + dz);
  rbox(g, white, 0.4, 0.2, 0.9, x, 0.62, z, 0.02);
  const mir = add(g, new THREE.CircleGeometry(0.34, 32), M(0xdfeefa, { metalness: 1, roughness: 0.08 }), x + s * 0.2, 1.3, z); mir.rotation.y = -s * Math.PI / 2;
  const rim = add(g, new THREE.TorusGeometry(0.35, 0.025, 8, 32), M(0xe8c8a0, { metalness: 0.6, roughness: 0.3 }), x + s * 0.2, 1.3, z); rim.rotation.y = Math.PI / 2;
  cyl(g, M(0xe2b6c2), 0.17, 0.17, 0.08, x - s * 0.55, 0.42, z, 18); cyl(g, white, 0.025, 0.025, 0.4, x - s * 0.55, 0.2, z, 8); // 小圆凳
  for (const dz of [-0.3, 0, 0.28]) cyl(g, glow(dz ? c.lamp : c.lamp2), 0.03, 0.035, 0.1, x, 0.84, z + dz, 10);
}
function barrel(g, x, z, h = 0.7) { const wood = M(0x7a5636); cyl(g, wood, 0.26, 0.26, h, x, h / 2, z, 16).scale.set(1, 1, 1); for (const y of [0.12, h - 0.12]) { const t = add(g, new THREE.TorusGeometry(0.265, 0.014, 6, 20), M(0x3a3230, { metalness: 0.6, roughness: 0.4 }), x, y, z); t.rotation.x = Math.PI / 2; } }
function crate(g, x, z, sz = 0.5) { const wood = M(0x9a7248); box(g, wood, sz, sz, sz, x, sz / 2, z); const dark = M(0x5a3e26); for (const dy of [0.06, sz - 0.06]) { box(g, dark, sz + 0.02, 0.05, 0.05, x, dy, z + sz / 2); box(g, dark, 0.05, 0.05, sz + 0.02, x + sz / 2, dy, z); } }
function lantern(g, x, z, color) {
  const iron = M(0x2a2420, { metalness: 0.5, roughness: 0.5 });
  cyl(g, iron, 0.006, 0.006, 0.7, x, HEIGHT - 0.35, z, 4); cyl(g, iron, 0.11, 0.08, 0.04, x, HEIGHT - 0.7, z, 6); cyl(g, glow(color), 0.08, 0.08, 0.2, x, HEIGHT - 0.82, z, 6); cyl(g, iron, 0.09, 0.09, 0.025, x, HEIGHT - 0.935, z, 6);
  halo(g, color, x, HEIGHT - 0.82, z, 1.5, 0.6); pool(g, color, x, z, 3.0, 0.3);
}
function vine(g, x, z, len) { const leaf = M(0x4f9a4a, { roughness: 0.7 }); for (let i = 0; i < len; i++) ball(g, leaf, 0.05 + 0.03 * Math.random(), x + Math.sin(i * 1.3) * 0.05, HEIGHT - 0.06 - i * 0.11, z + Math.cos(i * 1.7) * 0.05).scale.y = 0.6; }

const THEMES = {
  living: {
    floor: () => woodFloor(28, 46),
    wall: () => wall('#e9dcc8', '#c9b79c', windowDeco(['#ffd9a0', '#ff9f6a'], '#f6efe4')),
    build(g, k, c) {
      const s = k % 2 ? 1 : -1;
      sofa(g, s, -2.3, k % 2 ? 0x7a8fa6 : 0xb5654a, 0xf2d9a0); coffeeTable(g, s, -2.3);
      lamp(g, s * 2.4, -0.7, c.lamp); rug(g, k % 2 ? 0x9a4f4a : 0x4f6f8a, 1.9, 2.8, -3.0, false, 0xe8dcc0);
      shelf(g, -s, -1.6); plant(g, -s * 2.4, -3.0, 1.2);
      rbox(g, M(0x6b4a3a), 0.45, 0.5, 1.5, -s * 2.5, 0.25, -5.6, 0.03); rbox(g, M(0x111418, { roughness: 0.2, metalness: 0.4 }), 0.04, 0.7, 1.2, -s * 2.68, 1.2, -5.6, 0.01); // 电视柜 + 电视
      for (const dz of [-0.5, 0.5]) { cyl(g, M(0xfff8ec), 0.025, 0.025, 0.16, -s * 2.45, 0.58, -5.6 + dz, 8); ball(g, glow(c.lamp), 0.022, -s * 2.45, 0.68, -5.6 + dz); halo(g, c.lamp, -s * 2.45, 0.7, -5.6 + dz, 0.5, 0.5); } // 蜡烛
      frame(g, s, 1.75, -4.6, 0.7, 0.5, 0x7fa8c8); frame(g, s, 1.7, -5.6, 0.45, 0.6, 0xd8a070); frame(g, -s, 1.9, -3.4, 0.5, 0.4, 0xb8c890);
      wallPool(g, c.lamp, s, 1.4, -0.7, 2.6, 0.22);
    },
  },
  bedroom: {
    floor: () => carpet('#b8788a', 'rgba(255,220,230,0.35)'),
    wall: () => wall('#f3d6dd', '#e2b6c2', stripes('rgba(255,255,255,0.22)', windowDeco(['#ffc2d6', '#b98fd8'], '#fff5f8'))),
    build(g, k, c) {
      const s = k % 2 ? 1 : -1; bed(g, s, -3.0, 0xfff0f4, k % 2 ? 0xd98fb0 : 0xa98fd8, c);
      rbox(g, M(0xf0e2dc), 0.45, 0.5, 0.45, s * 2.5, 0.25, -1.5, 0.04); lamp(g, s * 2.5, -1.5, c.lamp, 0.78); wallPool(g, c.lamp, s, 1.2, -1.5, 2.4, 0.25);
      vanity(g, -s, -6.0, c); rug(g, 0xfff0f4, 1.8, 1.8, -5.4, true, 0xe2b6c2);
      frame(g, -s, 1.8, -2.4, 0.5, 0.5, 0xf2a0b8); frame(g, -s, 1.75, -3.3, 0.36, 0.5, 0xb8a0e8); plant(g, -s * 2.45, -0.9, 0.8);
      for (let i = 0; i < 16; i++) for (const sx of [-1, 1]) { const col = i % 2 ? c.lamp : c.lamp2, y = 2.45 - 0.14 * Math.sin((i / 16) * Math.PI), z = -i * 0.5 - 0.25; ball(g, glow(col), 0.035, sx * (HALF_W - 0.05), y, z); if (i % 4 === 1) halo(g, col, sx * (HALF_W - 0.08), y, z, 0.7, 0.4); } // 串灯
    },
  },
  treehouse: {
    floor: () => woodFloor(22, 36),
    wall: () => wall('#5a4030', '#463022', planks(24)),
    build(g, k, c) {
      const bark = M(0x4a3526, { roughness: 1 }), s = k % 2 ? 1 : -1;
      for (const sx of [-1, 1]) { const z = -0.8 - (sx > 0 ? 4 : 0); cyl(g, bark, 0.3, 0.4, HEIGHT, sx * 2.45, HEIGHT / 2, z, 12); for (let i = 0; i < 4; i++) cyl(g, bark, 0.06, 0.1, 0.5, sx * 2.45 + Math.cos(i * 1.6) * 0.3, 0.15, z + Math.sin(i * 1.6) * 0.3, 6).rotation.z = Math.cos(i * 1.6) * 0.9; } // 树干 + 板根
      lantern(g, -1.3, -2, c.lamp); lantern(g, 1.3, -6, c.lamp2); lantern(g, 0, -4, c.lamp);
      barrel(g, s * 2.3, -3.2); barrel(g, s * 2.25, -3.85, 0.55); crate(g, -s * 2.35, -2.2, 0.55); crate(g, -s * 2.3, -2.2 - 0.6, 0.42);
      const ham = add(g, new THREE.TorusGeometry(1.5, 0.28, 6, 20, 1.3), M(0xd8c8a8, { roughness: 1, side: THREE.DoubleSide }), -s * 2.2, 2.2, -6.2); ham.rotation.set(0, Math.PI / 2, Math.PI + 0.92); ham.scale.set(1, 1, 0.35); // 吊床
      for (let i = 0; i < 6; i++) { const m = add(g, new THREE.ConeGeometry(0.1, 0.6 + 0.3 * Math.random(), 5), M(0x3f7f3a), -s * (2.3 + 0.3 * Math.random()), 0.3, -5.2 - i * 0.22); m.rotation.set(Math.random() - 0.5, 0, (Math.random() - 0.5) * 1.2); } // 蕨
      for (let i = 0; i < 7; i++) vine(g, (Math.random() - 0.5) * 5, -Math.random() * 8, 3 + Math.floor(Math.random() * 6));
      rug(g, 0x8a5a3a, 1.6, 2.2, -5.5, false, 0x5a3a24);
    },
  },
};

// 灯光氛围：墙面亮度、雾色、主光
export const MOODS = {
  afternoon: { fog: '#e8c9a0', key: '#ffe2bd', keyI: 1.7, amb: '#f0d2b0', lamp: '#ffd98a', lamp2: '#ffb0c0', dim: 1.0 },
  morning:   { fog: '#bfdcae', key: '#f4ffe0', keyI: 1.6, amb: '#cfe8c0', lamp: '#fff2b0', lamp2: '#c8ffb0', dim: 1.0 },
  dusk:      { fog: '#e0a0b8', key: '#ffc4d4', keyI: 1.5, amb: '#e8b0c8', lamp: '#ffd0e0', lamp2: '#d0b0ff', dim: 0.85 },
  candle:    { fog: '#3a2218', key: '#ffb070', keyI: 1.15, amb: '#7a4a30', lamp: '#ffb050', lamp2: '#ff8040', dim: 0.42 },
  firefly:   { fog: '#14261c', key: '#c8ffd0', keyI: 1.0, amb: '#35604a', lamp: '#d8ff90', lamp2: '#90ffd0', dim: 0.4 },
  neon:      { fog: '#2a1440', key: '#ff9fe0', keyI: 1.15, amb: '#6a3a9a', lamp: '#ff6fd0', lamp2: '#6fd0ff', dim: 0.45 },
};

export class Interior {
  constructor(scene, backdrop, keyLight, hemi) {
    this.scene = scene; this.backdrop = backdrop; this.keyLight = keyLight; this.hemi = hemi;
    const mk = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
    this.floor = mk(HALF_W * 2, LEN); this.floor.rotation.x = -Math.PI / 2; this.floor.position.z = -LEN / 2 + 15;
    this.ceil = mk(HALF_W * 2, LEN); this.ceil.rotation.x = Math.PI / 2; this.ceil.position.set(0, HEIGHT, -LEN / 2 + 15);
    this.wallL = mk(LEN, HEIGHT); this.wallL.rotation.y = Math.PI / 2; this.wallL.position.set(-HALF_W, HEIGHT / 2, -LEN / 2 + 15);
    this.wallR = mk(LEN, HEIGHT); this.wallR.rotation.y = -Math.PI / 2; this.wallR.position.set(HALF_W, HEIGHT / 2, -LEN / 2 + 15);
    scene.add(this.floor, this.ceil, this.wallL, this.wallR);
    this.segs = []; scene.fog = new THREE.Fog(0xe8c9a0, 9, 52);
  }
  setTheme(theme, moodName, shared) {
    const T = THEMES[theme] || THEMES.living, c = MOODS[moodName] || MOODS.afternoon;
    for (const m of [this.floor, this.wallL, this.wallR]) m.material.map?.dispose();
    this.floor.material.map = T.floor(); this.wallL.material.map = T.wall(); this.wallR.material.map = this.wallL.material.map.clone(); this.wallR.material.map.needsUpdate = true;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(c.dim);
    for (const m of [this.floor, this.wallL, this.wallR]) { m.material.color.copy(tint); m.material.emissive.set(c.amb).multiplyScalar(0.12); m.material.needsUpdate = true; }
    this.ceil.material.color.set(c.amb).multiplyScalar(0.6 * c.dim + 0.1);
    for (const g of this.segs) { g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } else if (o.isSprite) o.material.dispose(); }); this.scene.remove(g); }
    this.segs = Array.from({ length: SEGS }, (_, k) => { const g = new THREE.Group(); T.build(g, k, c); g.traverse((o) => { if (o.isMesh && o.material.isMeshStandardMaterial && !o.material.transparent) o.material.color.multiplyScalar(0.55 + 0.45 * c.dim); }); this.scene.add(g); return g; });
    this.scene.fog.color.set(c.fog);
    const u = this.backdrop.material.uniforms; u.uTop.value.set(c.fog); u.uMid.value.set(c.fog); u.uHor.value.set(c.fog);
    this.keyLight.color.set(c.key); this.keyLight.intensity = c.keyI; this.hemi.color.set(c.amb); this.hemi.intensity = 0.5 + 0.5 * c.dim;
    shared.uKeyColor.value.set(c.key).multiplyScalar(0.5 * c.keyI);
    shared.uAmbSky.value.set(c.amb).multiplyScalar(0.3 + 0.2 * c.dim); shared.uAmbGround.value.set(c.amb).multiplyScalar(0.18 + 0.14 * c.dim);
    this.update(this.dist || 0);
  }
  /** dist: 已经跑过的总距离（米） */
  update(dist) {
    this.dist = dist;
    if (this.floor.material.map) this.floor.material.map.offset.y = dist / 2;
    if (this.wallL.material.map) { this.wallL.material.map.offset.x = dist / 4; this.wallR.material.map.offset.x = -dist / 4; }
    const total = SEGS * SEG;
    this.segs.forEach((g, k) => { g.position.z = 10 - ((((k * SEG - dist) % total) + total) % total); });
  }
}
