// 室内场景：一条望不到头的长房间。角色原地跑，地板 / 墙面贴图和成组的家具向后滚动来表现前进。
// 三套主题（客厅 / 卧室 / 树屋）× 各两种灯光氛围。
import * as THREE from 'three';

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

// ---------------------------------------------------------------- 家具（全是基础几何体拼的）
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color, fog: false });
function box(g, mat, w, h, d, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
function cyl(g, mat, r1, r2, h, x, y, z, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); m.position.set(x, y, z); g.add(m); return m; }
function ball(g, mat, r, x, y, z) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat); m.position.set(x, y, z); g.add(m); return m; }
function rug(g, color, w, d, z, round) { const m = new THREE.Mesh(round ? new THREE.CircleGeometry(w / 2, 32) : new THREE.PlaneGeometry(w, d), M(color, { roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.006, z); g.add(m); }
function lamp(g, x, z, shade, h = 1.5) { cyl(g, M(0x3a3230, { metalness: 0.4, roughness: 0.5 }), 0.02, 0.03, h, x, h / 2, z); cyl(g, M(0x3a3230), 0.16, 0.18, 0.03, x, 0.015, z); cyl(g, glow(shade), 0.13, 0.22, 0.3, x, h + 0.12, z); }
function sofa(g, s, z, fabric, cushion) {
  const x = s * (HALF_W - 0.5), f = M(fabric);
  box(g, f, 0.85, 0.42, 1.9, x, 0.21, z); box(g, f, 0.22, 0.5, 1.9, x + s * 0.32, 0.67, z);
  box(g, f, 0.85, 0.24, 0.2, x, 0.54, z - 0.95); box(g, f, 0.85, 0.24, 0.2, x, 0.54, z + 0.95);
  for (const dz of [-0.45, 0.45]) box(g, M(cushion), 0.3, 0.32, 0.5, x + s * 0.12, 0.6, z + dz).rotation.z = s * 0.25;
}
function bed(g, s, z, sheet, blanket) {
  const x = s * (HALF_W - 1.1);
  box(g, M(0x6b4a3a), 2.1, 0.3, 1.6, x, 0.15, z); box(g, M(sheet), 2.05, 0.2, 1.55, x, 0.4, z); box(g, M(blanket), 1.3, 0.08, 1.58, x - s * 0.38, 0.53, z);
  box(g, M(0x6b4a3a), 0.1, 0.9, 1.6, x + s * 1.02, 0.55, z);
  for (const dz of [-0.38, 0.38]) box(g, M(0xffffff), 0.42, 0.14, 0.6, x + s * 0.72, 0.57, z + dz);
  const post = M(0xe8d8d0); for (const dx of [-1, 1]) for (const dz of [-0.78, 0.78]) cyl(g, post, 0.025, 0.025, 2.1, x + dx * 1.0, 1.05, z + dz, 6);
  const drape = new THREE.MeshStandardMaterial({ color: blanket, transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 1 });
  box(g, drape, 2.05, 0.02, 1.6, x, 2.1, z); for (const dz of [-0.79, 0.79]) box(g, drape, 0.5, 1.5, 0.02, x - s * 0.75, 1.35, z + dz);
}

const THEMES = {
  living: {
    floor: () => woodFloor(28, 46),
    wall: () => wall('#e9dcc8', '#c9b79c', windowDeco(['#ffd9a0', '#ff9f6a'], '#f6efe4')),
    build(g, k, c) {
      sofa(g, k % 2 ? 1 : -1, -2.2, k % 2 ? 0x7a8fa6 : 0xb5654a, 0xf2d9a0);
      lamp(g, (k % 2 ? 1 : -1) * 2.35, -0.6, c.lamp); rug(g, k % 2 ? 0x9a4f4a : 0x4f6f8a, 1.9, 2.6, -3.2);
      const s = k % 2 ? -1 : 1; box(g, M(0x6b4a3a), 0.5, 0.5, 1.1, s * 2.4, 0.25, -5.6); cyl(g, M(0xb86b4a), 0.14, 0.1, 0.24, s * 2.4, 0.62, -5.9); ball(g, M(0x4f8f4a), 0.24, s * 2.4, 0.95, -5.9);
      box(g, glow(c.lamp), 0.06, 0.2, 0.06, s * 2.4, 0.6, -5.3); // 蜡烛
    },
  },
  bedroom: {
    floor: () => carpet('#b8788a', 'rgba(255,220,230,0.35)'),
    wall: () => wall('#f3d6dd', '#e2b6c2', stripes('rgba(255,255,255,0.22)', windowDeco(['#ffc2d6', '#b98fd8'], '#fff5f8'))),
    build(g, k, c) {
      const s = k % 2 ? 1 : -1; bed(g, s, -3.0, 0xfff0f4, k % 2 ? 0xd98fb0 : 0xa98fd8);
      box(g, M(0xf0e2dc), 0.45, 0.5, 0.45, s * 2.5, 0.25, -1.4); lamp(g, s * 2.5, -1.4, c.lamp, 0.75);
      box(g, M(0xf0e2dc), 0.5, 0.9, 1.2, -s * 2.5, 0.45, -6.2); box(g, M(0xcfe3f0, { metalness: 0.9, roughness: 0.1 }), 0.04, 0.9, 0.8, -s * 2.72, 1.5, -6.2);
      rug(g, 0xfff0f4, 1.7, 1.7, -5.2, true);
      for (let i = 0; i < 16; i++) for (const sx of [-1, 1]) ball(g, glow(i % 2 ? c.lamp : c.lamp2), 0.035, sx * (HALF_W - 0.04), 2.45 - 0.12 * Math.sin((i / 16) * Math.PI), -i * 0.5 - 0.25); // 串灯
    },
  },
  treehouse: {
    floor: () => woodFloor(22, 36),
    wall: () => wall('#5a4030', '#463022', planks(24)),
    build(g, k, c) {
      const bark = M(0x4a3526, { roughness: 1 });
      for (const sx of [-1, 1]) cyl(g, bark, 0.3, 0.38, HEIGHT, sx * 2.45, HEIGHT / 2, -0.8 - (sx > 0 ? 4 : 0), 10);
      for (const [x, z] of [[-1.3, -2], [1.3, -6], [0, -4]]) { cyl(g, M(0x2a2420), 0.006, 0.006, 0.7, x, HEIGHT - 0.35, z, 4); box(g, glow(c.lamp), 0.16, 0.22, 0.16, x, HEIGHT - 0.8, z); box(g, M(0x2a2420), 0.2, 0.03, 0.2, x, HEIGHT - 0.68, z); }
      const s = k % 2 ? 1 : -1; cyl(g, M(0x7a5a3a), 0.3, 0.3, 0.6, s * 2.3, 0.3, -3.2); cyl(g, M(0x7a5a3a), 0.26, 0.26, 0.5, s * 2.2, 0.25, -3.9);
      for (let i = 0; i < 5; i++) ball(g, M(0x3f7f3a), rnd(0.18, 0.3), -s * rnd(2.2, 2.6), rnd(0.3, 0.9), -5.5 + rnd(-0.6, 0.6));
      for (let i = 0; i < 9; i++) ball(g, M(0x4f8f4a), rnd(0.08, 0.16), rnd(-2.6, 2.6), HEIGHT - rnd(0.05, 0.3), -rnd(0, 8)); // 天花板垂下来的叶子
      rug(g, 0x8a5a3a, 1.6, 2.2, -5.5);
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
    for (const g of this.segs) { g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this.scene.remove(g); }
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
