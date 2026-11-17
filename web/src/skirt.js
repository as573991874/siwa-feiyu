// 程序化百褶短裙：低分辨率质点（腰部钉在髋骨上）+ 大腿胶囊碰撞，渲染时再叠加刀褶。
import * as THREE from 'three';
const hyp = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c); // Math.hypot 在 V8 里很慢

const SC = 48, SR = 10;          // 控制质点：列 × 行
const SUB = 5, RC = SC * SUB;    // 渲染列数
const PLEATS = 24;

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#20232f'); grad.addColorStop(1, '#161821');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  g.fillStyle = '#d9dbe2';
  g.fillRect(0, 512 * 0.775, 64, 512 * 0.042);
  g.fillRect(0, 512 * 0.865, 64, 512 * 0.042);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

export class Skirt {
  constructor(hipsBone, center, { waistY = 1.108, hemY = 0.735 } = {}) {
    this.hips = hipsBone;
    const n = SC * SR;
    this.p = new Float32Array(n * 3); this.pp = new Float32Array(n * 3);
    this.local = new Float32Array(n * 3); this.target = new Float32Array(n * 3);
    this.colLen = new Float32Array(n); this.ringLen = new Float32Array(n);
    const inv = new THREE.Matrix4().copy(hipsBone.matrixWorld).invert(), v = new THREE.Vector3();
    for (let r = 0; r < SR; r++) {
      const t = r / (SR - 1), f = 1 - Math.pow(1 - t, 1.9);
      const rx = 0.096 + (0.262 - 0.096) * f, rz = 0.084 + (0.245 - 0.084) * f;
      for (let c = 0; c < SC; c++) {
        const th = (c / SC) * Math.PI * 2, o = (r * SC + c) * 3;
        v.set(center.x + Math.cos(th) * rx, waistY + (hemY - waistY) * t, center.z + Math.sin(th) * rz);
        this.p[o] = this.pp[o] = v.x; this.p[o + 1] = this.pp[o + 1] = v.y; this.p[o + 2] = this.pp[o + 2] = v.z;
        v.applyMatrix4(inv); this.local[o] = v.x; this.local[o + 1] = v.y; this.local[o + 2] = v.z;
      }
    }
    const d = (a, b) => hyp(this.p[a * 3] - this.p[b * 3], this.p[a * 3 + 1] - this.p[b * 3 + 1], this.p[a * 3 + 2] - this.p[b * 3 + 2]);
    for (let r = 0; r < SR; r++) for (let c = 0; c < SC; c++) {
      const a = r * SC + c;
      this.ringLen[a] = d(a, r * SC + ((c + 1) % SC));
      if (r < SR - 1) this.colLen[a] = d(a, a + SC);
    }

    const RV = (RC + 1) * SR;
    this.rpos = new Float32Array(RV * 3);
    const uv = new Float32Array(RV * 2), idx = [];
    for (let r = 0; r < SR; r++) for (let c = 0; c <= RC; c++) { const k = r * (RC + 1) + c; uv[k * 2] = (c / RC) * PLEATS; uv[k * 2 + 1] = 1 - r / (SR - 1); }
    for (let r = 0; r < SR - 1; r++) for (let c = 0; c < RC; c++) { const a = r * (RC + 1) + c, b = a + 1, e = a + RC + 1, f = e + 1; idx.push(a, b, e, b, f, e); }
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rpos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = stripeTexture(); tex.flipY = true;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.colliders = [];
    this._v = new THREE.Vector3();
    this._build();
  }

  /** colliders: [{ a:Vector3, b:Vector3, ra, rb }] 世界空间胶囊 */
  update(dt, colliders, wind = 0) {
    const { p, pp, local, target } = this, m = this.hips.matrixWorld.elements, n = SC * SR;
    for (let k = 0; k < n; k++) {
      const o = k * 3, x = local[o], y = local[o + 1], z = local[o + 2];
      target[o] = m[0] * x + m[4] * y + m[8] * z + m[12]; target[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; target[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const g = -9.8 * dt * dt * 0.35, wz = wind * dt * dt; this.gust = (this.gust || 0) + dt * 9; // 跑起来时裙摆被风往后带
    for (let k = SC; k < n; k++) {
      const o = k * 3;
      for (let c = 0; c < 3; c++) { const vel = (p[o + c] - pp[o + c]) * 0.93; pp[o + c] = p[o + c]; p[o + c] += vel; }
      p[o + 1] += g; p[o + 2] += wz * (0.6 + 0.4 * Math.sin(k * 1.7 + this.gust));
    }
    for (let k = 0; k < SC * 3; k++) p[k] = pp[k] = target[k]; // 腰线钉死
    for (let it = 0; it < 4; it++) {
      for (let r = 1; r < SR; r++) {
        const shape = 0.10 + 0.18 * (1 - r / (SR - 1)); // 越靠近腰越硬，下摆更自由
        for (let c = 0; c < SC; c++) {
          const a = r * SC + c, o = a * 3;
          for (let q = 0; q < 3; q++) p[o + q] += (target[o + q] - p[o + q]) * shape;
          this._link(a - SC, a, this.colLen[a - SC], r === 1 ? 0 : 0.5, true);
          this._link(a, r * SC + ((c + 1) % SC), this.ringLen[a], 0.5, false);
        }
      }
      for (const col of colliders) this._collide(col);
    }
    this._build();
  }
  /** 角色瞬移（换关、从坐姿复位）后把裙子直接摆回静止形状，否则会被拉成一条长裙 */
  reset() {
    const { p, pp, local } = this, m = this.hips.matrixWorld.elements;
    for (let k = 0; k < SC * SR; k++) { const o = k * 3, x = local[o], y = local[o + 1], z = local[o + 2];
      p[o] = pp[o] = m[0] * x + m[4] * y + m[8] * z + m[12]; p[o + 1] = pp[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; p[o + 2] = pp[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
    this._build();
  }
  _link(a, b, L, wa, both) {
    const p = this.p, a3 = a * 3, b3 = b * 3;
    const dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2];
    const len = hyp(dx, dy, dz) || 1e-6;
    if (!both && len < L) return; // 环向只防拉长，允许收拢成褶
    const k = (len - L) / len, wb = 1 - wa;
    p[a3] += dx * k * wa; p[a3 + 1] += dy * k * wa; p[a3 + 2] += dz * k * wa;
    p[b3] -= dx * k * wb; p[b3 + 1] -= dy * k * wb; p[b3 + 2] -= dz * k * wb;
  }
  _collide({ a, b, ra, rb }) {
    const p = this.p, abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
    for (let k = SC; k < SC * SR; k++) {
      const o = k * 3;
      let t = ((p[o] - a.x) * abx + (p[o + 1] - a.y) * aby + (p[o + 2] - a.z) * abz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t, rad = ra + (rb - ra) * t;
      const dx = p[o] - cx, dy = p[o + 1] - cy, dz = p[o + 2] - cz, d = hyp(dx, dy, dz);
      if (d < rad && d > 1e-6) { const s = rad / d; p[o] = cx + dx * s; p[o + 1] = cy + dy * s; p[o + 2] = cz + dz * s; }
    }
  }
  _build() {
    const { p, rpos } = this;
    const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    for (let r = 0; r < SR; r++) {
      let mx = 0, mz = 0;
      for (let c = 0; c < SC; c++) { mx += p[(r * SC + c) * 3]; mz += p[(r * SC + c) * 3 + 2]; }
      mx /= SC; mz /= SC;
      const tr = r / (SR - 1), depth = 0.0015 + 0.02 * Math.pow(tr, 0.8);
      for (let c = 0; c <= RC; c++) {
        const cc = c % RC, c1 = Math.floor(cc / SUB), t = (cc % SUB) / SUB;
        const i0 = (r * SC + ((c1 + SC - 1) % SC)) * 3, i1 = (r * SC + c1) * 3, i2 = (r * SC + ((c1 + 1) % SC)) * 3, i3 = (r * SC + ((c1 + 2) % SC)) * 3;
        let x = cr(p[i0], p[i1], p[i2], p[i3], t), y = cr(p[i0 + 1], p[i1 + 1], p[i2 + 1], p[i3 + 1], t), z = cr(p[i0 + 2], p[i1 + 2], p[i2 + 2], p[i3 + 2], t);
        // 刀褶：锯齿形的径向偏移
        const s = ((cc / RC) * PLEATS) % 1, saw = s < 0.82 ? s / 0.82 : (1 - s) / 0.18;
        let ox = x - mx, oz = z - mz; const ol = hyp(ox, oz) || 1; ox /= ol; oz /= ol;
        const off = depth * (saw - 0.5);
        const k = (r * (RC + 1) + c) * 3;
        rpos[k] = x + ox * off; rpos[k + 1] = y; rpos[k + 2] = z + oz * off;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
