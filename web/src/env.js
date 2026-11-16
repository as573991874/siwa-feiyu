// 海边栈道：角色原地跑，靠地面贴图和两侧栏杆 / 路灯向后滚动来表现前进。
import * as THREE from 'three';

function plankTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { // 八条横向木板，每条颜色略有差别
    const l = 52 + Math.random() * 12;
    g.fillStyle = `hsl(${26 + Math.random() * 8}, ${24 + Math.random() * 10}%, ${l}%)`; g.fillRect(0, i * 64, 512, 64);
    g.fillStyle = 'rgba(40,24,12,0.55)'; g.fillRect(0, i * 64, 512, 3);
    for (let k = 0; k < 26; k++) { g.fillStyle = `rgba(60,36,18,${0.05 + Math.random() * 0.1})`; g.fillRect(Math.random() * 512, i * 64 + 4 + Math.random() * 58, 30 + Math.random() * 160, 1); }
    const sx = Math.random() * 512; g.fillStyle = 'rgba(40,24,12,0.5)'; g.fillRect(sx, i * 64, 3, 64); // 接缝
    for (const x of [sx + 10, sx - 10]) { g.beginPath(); g.arc(x, i * 64 + 32, 2.5, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

export const PALETTES = {
  morning: { top: '#4f9fd0', mid: '#a8d8ea', hor: '#fff0d6', sea: '#3b8fb0', fog: '#cfe6ee', key: '#fff1dc', keyI: 1.7 },
  noon:    { top: '#2f7fd0', mid: '#8fc8f0', hor: '#eaf6ff', sea: '#2a86b8', fog: '#d8ecf6', key: '#ffffff', keyI: 1.9 },
  cloudy:  { top: '#6d8799', mid: '#a9bcc6', hor: '#dfe6e8', sea: '#4f7486', fog: '#c6d2d6', key: '#eef2f4', keyI: 1.4 },
  sunset:  { top: '#3d4f8f', mid: '#f08a6a', hor: '#ffd9a0', sea: '#b0607a', fog: '#f0b79a', key: '#ffc79a', keyI: 1.7 },
  dusk:    { top: '#27295f', mid: '#b05a9a', hor: '#ff9fb0', sea: '#5a3a78', fog: '#a878a8', key: '#ffb0c8', keyI: 1.5 },
  night:   { top: '#070b1f', mid: '#1b2a55', hor: '#3d5a8f', sea: '#0f1c38', fog: '#1d2c4c', key: '#b9cfff', keyI: 1.25 },
};

export class Boardwalk {
  constructor(scene, backdrop, keyLight) {
    this.scene = scene; this.backdrop = backdrop; this.keyLight = keyLight;
    this.planks = plankTexture(); this.planks.repeat.set(1.75, 80);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(7, 160), new THREE.MeshStandardMaterial({ map: this.planks, roughness: 0.9 }));
    deck.rotation.x = -Math.PI / 2; deck.position.z = -62; scene.add(deck);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: 0x3b8fb0 }));
    this.sea.rotation.x = -Math.PI / 2; this.sea.position.set(0, -1.2, -200); scene.add(this.sea);
    const wood = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.8 });
    for (const sx of [-1, 1]) for (const [y, h] of [[1.0, 0.07], [0.55, 0.05]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 160), wood); rail.position.set(sx * 3.4, y, -62); scene.add(rail);
    }
    this.N = 70;
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), wood, this.N * 2); this.posts.frustumCulled = false; scene.add(this.posts);
    this.LN = 12;
    this.lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.05, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x2c3540, roughness: 0.5, metalness: 0.4 }), this.LN * 2);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 12, 8), this.bulbMat, this.LN * 2);
    this.lamps.frustumCulled = this.bulbs.frustumCulled = false; scene.add(this.lamps, this.bulbs);
    this._m = new THREE.Matrix4();
    scene.fog = new THREE.Fog(0xcfe6ee, 16, 95);
    this.update(0);
  }
  /** dist: 已经跑过的总距离（米） */
  update(dist) {
    this.planks.offset.y = dist / 2; // 贴图每 2 米重复一次
    const m = this._m, o = dist % 2, lo = dist % 12;
    for (let k = 0; k < this.N; k++) for (const s of [0, 1]) { m.makeTranslation(s ? 3.4 : -3.4, 0.52, 10 - k * 2 + o); this.posts.setMatrixAt(k * 2 + s, m); }
    for (let k = 0; k < this.LN; k++) for (const s of [0, 1]) {
      const z = 14 - k * 12 + lo - (s ? 6 : 0);
      m.makeTranslation(s ? 3.55 : -3.55, 1.6, z); this.lamps.setMatrixAt(k * 2 + s, m);
      m.makeTranslation(s ? 3.55 : -3.55, 3.25, z); this.bulbs.setMatrixAt(k * 2 + s, m);
    }
    this.posts.instanceMatrix.needsUpdate = this.lamps.instanceMatrix.needsUpdate = this.bulbs.instanceMatrix.needsUpdate = true;
  }
  setPalette(name, shared) {
    const p = PALETTES[name] || PALETTES.morning, u = this.backdrop.material.uniforms;
    u.uTop.value.set(p.top); u.uMid.value.set(p.mid); u.uHor.value.set(p.hor);
    this.sea.material.color.set(p.sea); this.scene.fog.color.set(p.fog);
    this.keyLight.color.set(p.key); this.keyLight.intensity = p.keyI;
    shared.uKeyColor.value.set(p.key).multiplyScalar(0.48 * p.keyI);
    shared.uAmbSky.value.set(p.mid).multiplyScalar(0.42); shared.uAmbGround.value.set(p.hor).multiplyScalar(0.3);
    this.bulbMat.color.set(name === 'night' || name === 'dusk' ? '#fff2c0' : '#d8d8d0');
  }
}
