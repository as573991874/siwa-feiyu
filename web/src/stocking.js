// 单条腿的丝袜：规则网格壳层 + 绑定空间里的 PBD 布料 + 破洞/抽丝生长。
// 模拟全部在「绑定姿态空间」里进行，结果再交给 GPU 蒙皮，所以腿怎么动丝袜都跟着走。
// 两层分辨率：布料在半分辨率网格 (CU × CV) 上求解，位移双线性上采样到渲染网格 (NU × NV)；
// 破洞 / 抽丝 / 褶皱贴图始终是全分辨率。
import * as THREE from 'three';
import { makeStockingMaterial, makeSkinMaterial } from './shaders.js';

const hyp = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c); // Math.hypot 在 V8 里很慢
const SHELL_OFFSET = 0.0011;      // 壳层离皮肤的距离
const PRE_U = 0.88, PRE_V = 0.96; // 预张力：穿在腿上的丝袜本来就是绷着的

let seed = 20261116;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function gridNormals(src, out, NU, NV, sign, j0, j1) {
  for (let j = j0; j <= j1; j++) {
    const ju = Math.max(0, j - 1), jd = Math.min(NV - 1, j + 1);
    for (let i = 0; i < NU; i++) {
      const l = (j * NU + (i === 0 ? NU - 1 : i - 1)) * 3, r = (j * NU + (i === NU - 1 ? 0 : i + 1)) * 3, u = (ju * NU + i) * 3, d = (jd * NU + i) * 3;
      const ax = src[r] - src[l], ay = src[r + 1] - src[l + 1], az = src[r + 2] - src[l + 2];
      const bx = src[d] - src[u], by = src[d + 1] - src[u + 1], bz = src[d + 2] - src[u + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = sign / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1), o = (j * NU + i) * 3;
      out[o] = nx * len; out[o + 1] = ny * len; out[o + 2] = nz * len;
    }
  }
}

export class StockingLeg {
  constructor(fit, refMesh, shared, kneeV, params) {
    this.fit = fit; this.params = params;
    const { NU, NV } = fit; this.NU = NU; this.NV = NV;
    const N = this.N = NU * NV;
    this.skeleton = refMesh.skeleton;

    // ---- 皮肤层法线 → 壳层静止位置（全分辨率）
    const skinN = new Float32Array(N * 3);
    this.sign = 1;
    gridNormals(fit.pos, skinN, NU, NV, 1, 0, NV - 1);
    { // 用第一圈判断朝向：法线应当背离轴心
      let cxm = 0, czm = 0; for (let i = 0; i < NU; i++) { cxm += fit.pos[i * 3]; czm += fit.pos[i * 3 + 2]; } cxm /= NU; czm /= NU;
      if ((fit.pos[0] - cxm) * skinN[0] + (fit.pos[2] - czm) * skinN[2] < 0) { this.sign = -1; for (let k = 0; k < N * 3; k++) skinN[k] = -skinN[k]; }
    }
    const p0 = this.p0 = new Float32Array(N * 3);
    for (let k = 0; k < N * 3; k++) p0[k] = fit.pos[k] + skinN[k] * SHELL_OFFSET;
    const n0 = this.n0 = new Float32Array(N * 3);
    gridNormals(p0, n0, NU, NV, this.sign, 0, NV - 1);
    this.x = p0.slice();           // 全分辨率当前位置（渲染、拾取用）
    this.nrm = n0.slice();
    this.stretch = new Float32Array(N).fill(1);
    this.Pu = new Float32Array(N); this.Pv = new Float32Array(N); // 全分辨率的静止边长，用来算拉伸率
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * NU + i, r = j * NU + ((i + 1) % NU);
      this.Pu[a] = hyp(p0[a * 3] - p0[r * 3], p0[a * 3 + 1] - p0[r * 3 + 1], p0[a * 3 + 2] - p0[r * 3 + 2]);
      if (j < NV - 1) { const d = a + NU; this.Pv[a] = hyp(p0[a * 3] - p0[d * 3], p0[a * 3 + 1] - p0[d * 3 + 1], p0[a * 3 + 2] - p0[d * 3 + 2]); }
    }

    // ---- 半分辨率的模拟网格
    const CU = this.CU = NU >> 1, CV = this.CV = NV >> 1, CN = this.CN = CU * CV;
    const c0 = this.c0 = new Float32Array(CN * 3), cn = this.cn = new Float32Array(CN * 3);
    for (let j = 0; j < CV; j++) for (let i = 0; i < CU; i++) {
      const c = (j * CU + i) * 3, f = (j * 2 * NU + i * 2) * 3;
      for (let k = 0; k < 3; k++) { c0[c + k] = p0[f + k]; cn[c + k] = n0[f + k]; }
    }
    this.cx = c0.slice(); this.cpx = c0.slice();
    this.cw = new Float32Array(CN).fill(1); this.cwa = new Float32Array(CN);
    this.awake = new Uint8Array(CN); // 只有被扰动过的顶点（及其邻格）才参与求解，其余保持静止
    for (let i = 0; i < CU; i++) { this.cw[i] = 0; this.cw[(CV - 1) * CU + i] = 0; }
    this.cD = new Float32Array(CN);
    this.Lu = new Float32Array(CN); this.Lv = new Float32Array(CN); this.Ld1 = new Float32Array(CN); this.Ld2 = new Float32Array(CN);
    const dist = (a, b) => hyp(c0[a * 3] - c0[b * 3], c0[a * 3 + 1] - c0[b * 3 + 1], c0[a * 3 + 2] - c0[b * 3 + 2]);
    for (let j = 0; j < CV; j++) for (let i = 0; i < CU; i++) {
      const a = j * CU + i, r = j * CU + ((i + 1) % CU);
      this.Lu[a] = dist(a, r) * PRE_U;
      if (j < CV - 1) { const d = a + CU, dr = r + CU; this.Lv[a] = dist(a, d) * PRE_V; this.Ld1[a] = dist(a, dr) * 0.92; this.Ld2[a] = dist(r, d) * 0.92; }
    }

    // ---- 破损场（全分辨率）
    this.D = new Float32Array(N);    // 破洞
    this.Lf = new Float32Array(N);   // 抽丝
    this.S = new Float32Array(N);    // 松弛褶皱
    this.maskData = new Uint8Array(N * 4);
    this.mask = new THREE.DataTexture(this.maskData, NU, NV, THREE.RGBAFormat);
    this.mask.wrapS = THREE.RepeatWrapping; this.mask.wrapT = THREE.ClampToEdgeWrapping;
    this.mask.magFilter = this.mask.minFilter = THREE.LinearFilter; this.mask.needsUpdate = true;
    this.growths = []; this.maskDirty = false; this.slackLive = false; this.cutDirty = false;

    // ---- 渲染网格（接缝处多复制一列）
    const RV = (NU + 1) * NV;
    const uv = new Float32Array(RV * 2), si = new Uint16Array(RV * 4), sw = new Float32Array(RV * 4);
    for (let j = 0; j < NV; j++) for (let i = 0; i <= NU; i++) {
      const r = j * (NU + 1) + i, s = j * NU + (i % NU);
      uv[r * 2] = i / NU; uv[r * 2 + 1] = j / (NV - 1);
      for (let k = 0; k < 4; k++) { si[r * 4 + k] = fit.skinIndex[s * 4 + k]; sw[r * 4 + k] = fit.skinWeight[s * 4 + k]; }
    }
    const idx = new Uint32Array(NU * (NV - 1) * 6);
    let q = 0;
    for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
      if (this.sign > 0) { idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
    }
    const mkGeo = (pos, nor, withStretch) => {
      const g = new THREE.BufferGeometry();
      const rp = new Float32Array(RV * 3), rn = new Float32Array(RV * 3);
      g.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(rn, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      if (withStretch) g.setAttribute('aStretch', new THREE.BufferAttribute(new Float32Array(RV).fill(1), 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      this._toRender(pos, rp, 0, NV - 1); this._toRender(nor, rn, 0, NV - 1);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0.27), 4);
      return g;
    };
    const mkMesh = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(refMesh.skeleton, refMesh.bindMatrix);
      m.frustumCulled = false;
      m.position.copy(refMesh.position); m.quaternion.copy(refMesh.quaternion); m.scale.copy(refMesh.scale);
      return m;
    };
    this.skinMesh = mkMesh(mkGeo(fit.pos, skinN, false), makeSkinMaterial(shared, kneeV));
    this.geo = mkGeo(p0, n0, true);
    this.material = makeStockingMaterial(shared, this.mask, fit, kneeV);
    this.mesh = mkMesh(this.geo, this.material);
    this.mesh.renderOrder = 5;

    // 活动窗口（半分辨率网格的行列范围）
    this.active = false; this.settle = false; this.settleT = 0; this.freeT = 0;
    this.j0 = 0; this.j1 = CV - 1; this.i0 = 0; this.iN = CU;
    this.grabbed = null;
    this.world = new Float32Array(N * 3); // 拾取用的蒙皮后世界坐标
    this._m = new THREE.Matrix4(); this._g = new THREE.Matrix4();
  }

  _toRender(src, dst, j0, j1) {
    const { NU } = this;
    for (let j = j0; j <= j1; j++) {
      const so = j * NU * 3, ro = j * (NU + 1) * 3;
      for (let k = 0; k < NU * 3; k++) dst[ro + k] = src[so + k];
      dst[ro + NU * 3] = src[so]; dst[ro + NU * 3 + 1] = src[so + 1]; dst[ro + NU * 3 + 2] = src[so + 2];
    }
  }

  // ---------- CPU 蒙皮（拾取、把鼠标位置换算回绑定空间） ----------
  /** a 是全分辨率顶点下标 */
  skinMatrix(a, out) {
    const bm = this.skeleton.boneMatrices, si = this.fit.skinIndex, sw = this.fit.skinWeight, e = out.elements;
    for (let k = 0; k < 16; k++) e[k] = 0;
    for (let b = 0; b < 4; b++) { const w = sw[a * 4 + b]; if (w === 0) continue; const o = si[a * 4 + b] * 16; for (let k = 0; k < 16; k++) e[k] += bm[o + k] * w; }
    // 世界 = matrixWorld · bindInv · Σ(w·bone) · bind
    out.multiply(this.mesh.bindMatrix).premultiply(this.mesh.bindMatrixInverse).premultiply(this.mesh.matrixWorld);
    return out;
  }
  skinAll() {
    const { N, x, world } = this, bm = this.skeleton.boneMatrices, si = this.fit.skinIndex, sw = this.fit.skinWeight;
    const B = this.mesh.bindMatrix.elements, Q = this._m.multiplyMatrices(this.mesh.matrixWorld, this.mesh.bindMatrixInverse).elements;
    for (let a = 0; a < N; a++) {
      const a3 = a * 3, X = x[a3], Y = x[a3 + 1], Z = x[a3 + 2];
      const bx = B[0] * X + B[4] * Y + B[8] * Z + B[12], by = B[1] * X + B[5] * Y + B[9] * Z + B[13], bz = B[2] * X + B[6] * Y + B[10] * Z + B[14];
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < 4; k++) {
        const wt = sw[a * 4 + k]; if (wt === 0) continue; const o = si[a * 4 + k] * 16;
        sx += wt * (bm[o] * bx + bm[o + 4] * by + bm[o + 8] * bz + bm[o + 12]);
        sy += wt * (bm[o + 1] * bx + bm[o + 5] * by + bm[o + 9] * bz + bm[o + 13]);
        sz += wt * (bm[o + 2] * bx + bm[o + 6] * by + bm[o + 10] * bz + bm[o + 14]);
      }
      world[a3] = Q[0] * sx + Q[4] * sy + Q[8] * sz + Q[12]; world[a3 + 1] = Q[1] * sx + Q[5] * sy + Q[9] * sz + Q[13]; world[a3 + 2] = Q[2] * sx + Q[6] * sy + Q[10] * sz + Q[14];
    }
  }
  /** 射线拾取（世界空间）。返回 { t, i, j, leg } 或 null */
  pick(ray) {
    this.skinAll();
    const { NU, NV, world: P, D } = this, o = ray.origin, d = ray.direction;
    let bt = Infinity, ba = -1;
    const test = (a, b, c) => {
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (det > -1e-12 && det < 1e-12) return;
      const inv = 1 / det, sx = o.x - ax, sy = o.y - ay, sz = o.z - az;
      const u = (sx * hx + sy * hy + sz * hz) * inv; if (u < 0 || u > 1) return;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (d.x * qx + d.y * qy + d.z * qz) * inv; if (v < 0 || u + v > 1) return;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-4 && t < bt) { bt = t; ba = u + v < 0.6 ? a : (u > v ? b : c); }
    };
    for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU; i++) {
      const a = j * NU + i, b = j * NU + (i === NU - 1 ? 0 : i + 1), c = a + NU, e = b + NU;
      if (D[a] > 0.5 && D[e] > 0.5) continue; // 洞里抓不到东西
      test(a, b, c); test(b, e, c);
    }
    if (ba < 0) return null;
    return { t: bt, i: ba % NU, j: Math.floor(ba / NU), leg: this };
  }
  worldToRest(a, v, out) { return out.copy(v).applyMatrix4(this._g.copy(this.skinMatrix(a, this._m)).invert()); }
  restToWorld(a, v, out) { return out.copy(v).applyMatrix4(this.skinMatrix(a, this._m)); }

  // ---------- 抓取 ----------
  /** (ci, cj) 为全分辨率网格坐标 */
  grab(ci, cj) {
    const { NU, CU, CV, c0, cD } = this;
    const ic = (ci >> 1) % CU, jc = Math.min(CV - 3, Math.max(2, cj >> 1)), cc = jc * CU + ic;
    const R = this.params.pinchRadius, ids = [], offs = [];
    for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
      const j = jc + dj; if (j < 1 || j > CV - 2) continue;
      const a = j * CU + ((ic + di + CU) % CU);
      const dx = c0[a * 3] - c0[cc * 3], dy = c0[a * 3 + 1] - c0[cc * 3 + 1], dz = c0[a * 3 + 2] - c0[cc * 3 + 2];
      if (hyp(dx, dy, dz) < R && cD[a] < 0.5) { ids.push(a); offs.push(dx * 0.35, dy * 0.35, dz * 0.35); }
    }
    if (!ids.length) return false;
    for (const a of ids) this.cw[a] = 0;
    const o = new THREE.Vector3(c0[cc * 3], c0[cc * 3 + 1], c0[cc * 3 + 2]);
    // c = 全分辨率下标（给蒙皮矩阵和外部使用），ci/cj = 全分辨率网格坐标
    this.grabbed = { ci: ic * 2, cj: jc * 2, c: jc * 2 * NU + ic * 2, ids, offs, origin: o, target: o.clone(), goal: o.clone() };
    this._activate(ic, jc);
    return true;
  }
  /** 把抓取点拖到绑定空间里的 goal，返回实际拉开的距离 */
  drag(goalRest) {
    const g = this.grabbed; if (!g) return 0;
    const n0 = this.n0, c3 = g.c * 3, o = g.origin;
    const dx = goalRest.x - o.x, dy = goalRest.y - o.y, dz = goalRest.z - o.z;
    // 不允许把布按进腿里：法向分量夹到 >= 0
    const h = dx * n0[c3] + dy * n0[c3 + 1] + dz * n0[c3 + 2];
    g.goal.copy(goalRest);
    if (h < 0) g.goal.set(goalRest.x - h * n0[c3], goalRest.y - h * n0[c3 + 1], goalRest.z - h * n0[c3 + 2]);
    const len = g.goal.distanceTo(o), maxLen = this.params.maxPull;
    if (len > maxLen) g.goal.sub(o).multiplyScalar(maxLen / len).add(o);
    return Math.min(len, maxLen);
  }
  pullDistance() { const g = this.grabbed; return g ? g.target.distanceTo(g.origin) : 0; }
  release() {
    const g = this.grabbed; if (!g) return;
    for (const a of g.ids) this.cw[a] = 1;
    this.grabbed = null;
    if (this.active) this._buildActive();
  }
  _activate(ic, jc) {
    const { CU, CV } = this, half = this.params.windowRows, halfU = this.params.windowCols;
    const j0 = Math.max(0, jc - half), j1 = Math.min(CV - 1, jc + half);
    if (this.active) { this.j0 = Math.min(this.j0, j0); this.j1 = Math.max(this.j1, j1); this.i0 = 0; this.iN = CU; } // 两处同时活动 → 整圈
    else { this.j0 = j0; this.j1 = j1; this.active = true; if (halfU * 2 + 1 >= CU) { this.i0 = 0; this.iN = CU; } else { this.i0 = (ic - halfU + CU) % CU; this.iN = halfU * 2 + 1; } }
    this.settle = false; this.freeT = 0;
    this._buildActive();
  }
  /** 活动窗口内的有效逆质量：窗口外、窗口边界、被捏住的点都是 0 */
  _buildActive() {
    const { CU, cw, cwa, j0, j1, i0, iN } = this, full = iN === CU;
    cwa.fill(0);
    for (let j = j0 + 1; j < j1; j++) for (let ii = full ? 0 : 1; ii < (full ? iN : iN - 1); ii++) { const a = j * CU + (i0 + ii) % CU; cwa[a] = cw[a]; }
  }

  // ---------- PBD ----------
  _solve() {
    const { CU, cx: x, c0: p0, cn: n0, cD: D, Lu, Lv, Ld1, Ld2, j0, j1, i0, iN } = this, w = this.cwa;
    const P = this.params, kS = P.stretchK, kC = P.compressK, stick = P.stick, press = P.press, hc = 0.0006, aw = this.awake;
    for (let it = 0; it < P.iterations; it++) {
      const fwd = (it & 1) === 0;
      for (let jj = j0; jj < j1; jj++) {
        const row = (fwd ? jj : j0 + j1 - 1 - jj) * CU;
        for (let ii = 0; ii < iN; ii++) {
          const i = (i0 + (fwd ? ii : iN - 1 - ii)) % CU;
          const a = row + i, r = row + (i + 1 === CU ? 0 : i + 1), d = a + CU, dr = r + CU;
          if ((aw[a] | aw[r] | aw[d] | aw[dr]) === 0) continue;
          const wA = w[a], wR = w[r], wD = w[d], wDR = w[dr];
          if (wA + wR + wD + wDR === 0) continue;
          // 四条约束：横、竖、两条对角。手工内联（函数调用在这个热循环里要慢好几倍）
          for (let e = 0; e < 4; e++) {
            let p, q, L;
            if (e === 0) { p = a; q = r; L = Lu[a]; } else if (e === 1) { p = a; q = d; L = Lv[a]; } else if (e === 2) { p = a; q = dr; L = Ld1[a]; } else { p = r; q = d; L = Ld2[a]; }
            const wp = w[p], wq = w[q], ws = wp + wq;
            if (ws === 0) continue;
            const dp = D[p], dq = D[q];
            if (dp > 0.5 || dq > 0.5) continue; // 破洞处的约束已经断开
            const p3 = p * 3, q3 = q * 3;
            const ex = x[q3] - x[p3], ey = x[q3 + 1] - x[p3 + 1], ez = x[q3 + 2] - x[p3 + 2];
            const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (len < 1e-9) continue;
            const k = (len > L ? kS : kC) * (1 - 0.8 * (dp > dq ? dp : dq)) * (len - L) / (len * ws), kp = k * wp, kq = k * wq;
            x[p3] += ex * kp; x[p3 + 1] += ey * kp; x[p3 + 2] += ez * kp;
            x[q3] -= ex * kq; x[q3 + 1] -= ey * kq; x[q3 + 2] -= ez * kq;
          }
        }
      }
      // 与腿的接触：不能穿入；贴着腿时有摩擦（切向粘住）；离开腿面时受到环向张力的回压
      for (let j = j0 + 1; j < j1; j++) for (let ii = 0; ii < iN; ii++) {
        const a = j * CU + (i0 + ii) % CU;
        if (w[a] === 0) continue;
        const a3 = a * 3;
        const dx = x[a3] - p0[a3], dy = x[a3 + 1] - p0[a3 + 1], dz = x[a3 + 2] - p0[a3 + 2];
        const nx = n0[a3], ny = n0[a3 + 1], nz = n0[a3 + 2];
        const h = dx * nx + dy * ny + dz * nz;
        aw[a] = dx * dx + dy * dy + dz * dz > 1e-9 ? 1 : 0; // 位移超过约 30 微米才算被扰动
        if (h < hc) {
          const hh = h < 0 ? 0 : h, pen = h < 0 ? h * (1 - stick) : 0;
          x[a3] -= (dx - hh * nx) * stick + pen * nx;
          x[a3 + 1] -= (dy - hh * ny) * stick + pen * ny;
          x[a3 + 2] -= (dz - hh * nz) * stick + pen * nz;
        } else {
          const q = h < press ? h : press;
          x[a3] -= nx * q; x[a3 + 1] -= ny * q; x[a3 + 2] -= nz * q;
        }
      }
    }
  }

  update(dt) {
    this._growTears(dt);
    if (this.active) this._simulate(dt);
    if (this.slackLive && !this.active) {
      const k = Math.exp(-dt / this.params.slackDecay); let any = false;
      for (let a = 0; a < this.N; a++) if (this.S[a] > 0.004) { this.S[a] *= k; any = true; } else this.S[a] = 0;
      this.slackLive = any; this.maskDirty = true;
    }
    if (this.maskDirty) this._uploadMask();
  }

  _simulate(dt) {
    const { CU, cx: x, cpx: px, c0: p0, j0, j1, i0, iN } = this, w = this.cwa, P = this.params, g = this.grabbed;
    if (g) {
      this.settle = false; this.freeT = 0;
      g.target.lerp(g.goal, 1 - Math.exp(-dt * 22));
      for (let k = 0; k < g.ids.length; k++) {
        const a3 = g.ids[k] * 3;
        x[a3] = px[a3] = g.target.x + g.offs[k * 3]; x[a3 + 1] = px[a3 + 1] = g.target.y + g.offs[k * 3 + 1]; x[a3 + 2] = px[a3 + 2] = g.target.z + g.offs[k * 3 + 2];
        this.awake[g.ids[k]] = 1;
      }
    } else this.freeT += dt;
    if (this.settle) this.settleT += dt;
    const settle = this.settle ? Math.min(1, 0.15 + this.settleT / 0.4) : 0;
    for (let s = 0; s < P.substeps; s++) {
      for (let j = j0 + 1; j < j1; j++) for (let ii = 0; ii < iN; ii++) {
        const a = j * CU + (i0 + ii) % CU;
        if (w[a] === 0 || this.awake[a] === 0) continue;
        const a3 = a * 3;
        for (let k = 0; k < 3; k++) { const v = (x[a3 + k] - px[a3 + k]) * P.damping; px[a3 + k] = x[a3 + k]; x[a3 + k] += v; }
      }
      this._solve();
    }
    let maxV = 0;
    for (let j = j0 + 1; j < j1; j++) for (let ii = 0; ii < iN; ii++) {
      const a3 = (j * CU + (i0 + ii) % CU) * 3;
      if (settle) for (let k = 0; k < 3; k++) { x[a3 + k] += (p0[a3 + k] - x[a3 + k]) * settle; px[a3 + k] = x[a3 + k]; }
      const v = Math.abs(x[a3] - px[a3]) + Math.abs(x[a3 + 1] - px[a3 + 1]) + Math.abs(x[a3 + 2] - px[a3 + 2]); if (v > maxV) maxV = v;
    }
    // 松手后速度降下来（或超过 0.9 秒）→ 把残余偏移（预张力在凹面处的架空）柔和地并回静止形状，然后休眠
    if (!g && !this.settle && (maxV < 4e-5 || this.freeT > 0.9)) { this.settle = true; this.settleT = 0; }
    const sleeping = !g && this.settle && settle >= 1;
    if (sleeping) for (let j = j0; j <= j1; j++) for (let k = j * CU * 3; k < (j + 1) * CU * 3; k++) { x[k] = p0[k]; px[k] = p0[k]; }
    this._refresh();
    if (sleeping) { this.active = false; this.settle = false; this.awake.fill(0); }
  }

  /** 把半分辨率位移上采样到渲染网格，并更新法线、拉伸率、松弛量 */
  _refresh(all = false) {
    const { NU, NV, CU, CV, cx, c0, x, p0, n0, Pu, Pv, stretch, S } = this;
    const fj0 = all ? 0 : this.j0 * 2, fj1 = all ? NV - 1 : Math.min(NV - 1, this.j1 * 2 + 1);
    for (let j = fj0; j <= fj1; j++) {
      const ja = Math.min(CV - 1, j >> 1), jb = Math.min(CV - 1, ja + (j & 1));
      for (let i = 0; i < NU; i++) {
        const ia = i >> 1, ib = (i & 1) ? (ia + 1 === CU ? 0 : ia + 1) : ia;
        const A = (ja * CU + ia) * 3, B = (ja * CU + ib) * 3, C = (jb * CU + ia) * 3, E = (jb * CU + ib) * 3, o = (j * NU + i) * 3;
        const dx = (cx[A] - c0[A] + cx[B] - c0[B] + cx[C] - c0[C] + cx[E] - c0[E]) * 0.25;
        const dy = (cx[A + 1] - c0[A + 1] + cx[B + 1] - c0[B + 1] + cx[C + 1] - c0[C + 1] + cx[E + 1] - c0[E + 1]) * 0.25;
        const dz = (cx[A + 2] - c0[A + 2] + cx[B + 2] - c0[B + 2] + cx[C + 2] - c0[C + 2] + cx[E + 2] - c0[E + 2]) * 0.25;
        x[o] = p0[o] + dx; x[o + 1] = p0[o + 1] + dy; x[o + 2] = p0[o + 2] + dz;
        const h = dx * n0[o] + dy * n0[o + 1] + dz * n0[o + 2];
        if (h > 0.008) { const sl = Math.min(0.8, (h - 0.006) / 0.05), a = j * NU + i; if (sl > S[a]) { S[a] = sl; this.slackLive = true; this.maskDirty = true; } }
      }
    }
    gridNormals(x, this.nrm, NU, NV, this.sign, fj0, fj1);
    for (let j = fj0; j <= fj1; j++) for (let i = 0; i < NU; i++) {
      const a = j * NU + i, r = j * NU + (i === NU - 1 ? 0 : i + 1), l = j * NU + (i === 0 ? NU - 1 : i - 1), a3 = a * 3;
      const su = (hyp(x[r * 3] - x[a3], x[r * 3 + 1] - x[a3 + 1], x[r * 3 + 2] - x[a3 + 2]) + hyp(x[l * 3] - x[a3], x[l * 3 + 1] - x[a3 + 1], x[l * 3 + 2] - x[a3 + 2])) / (Pu[a] + Pu[l]);
      let sv = 1;
      if (j > 0 && j < NV - 1) { const u = a - NU, d = a + NU; sv = (hyp(x[u * 3] - x[a3], x[u * 3 + 1] - x[a3 + 1], x[u * 3 + 2] - x[a3 + 2]) + hyp(x[d * 3] - x[a3], x[d * 3 + 1] - x[a3 + 1], x[d * 3 + 2] - x[a3 + 2])) / (Pv[u] + Pv[a]); }
      stretch[a] = Math.min(5, Math.max(0.4, su * sv));
    }
    const pa = this.geo.attributes.position, na = this.geo.attributes.normal, sa = this.geo.attributes.aStretch;
    this._toRender(x, pa.array, fj0, fj1); this._toRender(this.nrm, na.array, fj0, fj1);
    for (let j = fj0; j <= fj1; j++) { const so = j * NU, ro = j * (NU + 1); for (let i = 0; i < NU; i++) sa.array[ro + i] = stretch[so + i]; sa.array[ro + NU] = stretch[so]; }
    pa.needsUpdate = na.needsUpdate = sa.needsUpdate = true;
  }

  // ---------- 撕裂 ----------
  /** 在全分辨率网格 (ci, cj) 处撕开。energy ≈ 0.6–1.6，决定洞的大小和抽丝长度 */
  tearAt(ci, cj, energy = 1) {
    const { NU, NV, fit } = this, P = this.params;
    cj = Math.min(NV - 6, Math.max(5, cj));
    const dv = fit.dv, du = fit.circ[cj] / NU, E = energy;
    const run = {
      kind: 'run', ci, cj,
      up: (0.03 + 0.10 * rand()) * E * P.runLength / dv, down: (0.03 + 0.12 * rand()) * E * P.runLength / dv,
      wHalf: (0.0035 + 0.0035 * rand()) / du, amp: (0.002 + 0.004 * rand()) / du, freq: 0.05 + 0.08 * rand(), ph: rand() * 6.28,
      t: 0, T: 0.55 + 0.5 * rand(),
    };
    this.growths.push(run);
    const center = (j) => run.ci + run.amp * (Math.sin(j * run.freq + run.ph) - Math.sin(run.cj * run.freq + run.ph));
    const hole = (jj, scale, delay) => this.growths.push({
      kind: 'hole', ci: center(jj) + (rand() - 0.5) * 0.004 / du, cj: jj,
      au: (0.007 + 0.009 * rand()) * scale * P.holeSize / du, av: (0.013 + 0.02 * rand()) * scale * P.holeSize / dv,
      ph1: rand() * 6.28, ph2: rand() * 6.28, tilt: (rand() - 0.5) * 0.5, t: -delay, T: 0.28 + 0.3 * rand(),
    });
    hole(cj, Math.sqrt(E), 0);
    const n = Math.round(1 + rand() * 2.4 * E);
    for (let k = 0; k < n; k++) {
      const jj = cj + (rand() < 0.5 ? -run.up : run.down) * (0.25 + 0.6 * rand());
      if (jj > 6 && jj < NV - 7) hole(jj, (0.45 + 0.6 * rand()) * Math.sqrt(E), 0.1 + rand() * 0.45);
    }
  }
  _growTears(dt) {
    if (!this.growths.length) return;
    const { NU, NV, D, Lf } = this;
    for (const g of this.growths) {
      g.t += dt; if (g.t <= 0) continue;
      const s = 1 - Math.pow(1 - Math.min(1, g.t / g.T), 3); // easeOutCubic：先猛地崩开再慢慢停住
      if (g.kind === 'hole') {
        const au = g.au * s + 0.4, av = g.av * s + 0.4, ext = 2.1; // 洞的上下带一圈抽丝晕
        const ru = Math.ceil(au * 1.4) + 1, rv = Math.ceil(av * ext * 1.2) + 1;
        const ct = Math.cos(g.tilt), st = Math.sin(g.tilt), ic = Math.round(g.ci), jc = Math.round(g.cj);
        for (let dj = -rv; dj <= rv; dj++) {
          const j = jc + dj; if (j < 2 || j > NV - 3) continue;
          for (let di = -ru; di <= ru; di++) {
            const a = j * NU + (((ic + di) % NU) + NU) % NU;
            const fu = ic + di - g.ci, fv = j - g.cj;
            const eu = (fu * ct - fv * st * 0.3) / au, ev = (fv * ct + fu * st * 0.3) / av;
            const ang = Math.atan2(ev, eu);
            const q = hyp(eu, ev) * (1 + 0.16 * Math.sin(3 * ang + g.ph1) + 0.09 * Math.sin(5 * ang + g.ph2));
            const d = sstep(1.2, 0.8, q); if (d > D[a]) D[a] = d;
            const l = sstep(1.1, 0.55, hyp(eu * 1.15, ev / ext)) * 0.9; if (l > Lf[a]) Lf[a] = l;
          }
        }
      } else {
        const jA = Math.max(2, Math.floor(g.cj - g.up * s)), jB = Math.min(NV - 3, Math.ceil(g.cj + g.down * s));
        const base = Math.sin(g.cj * g.freq + g.ph);
        for (let j = jA; j <= jB; j++) {
          const rel = j < g.cj ? (g.cj - j) / (g.up * s + 1e-3) : (j - g.cj) / (g.down * s + 1e-3);
          const wd = g.wHalf * Math.sqrt(Math.max(0, 1 - Math.pow(rel, 1.6))) + 0.35;
          const c = g.ci + g.amp * (Math.sin(j * g.freq + g.ph) - base), ic = Math.round(c), r = Math.ceil(wd) + 1;
          for (let di = -r; di <= r; di++) {
            const a = j * NU + (((ic + di) % NU) + NU) % NU;
            const l = sstep(1.25, 0.5, Math.abs(ic + di - c) / wd); if (l > Lf[a]) Lf[a] = l;
          }
        }
      }
      this.maskDirty = true; this.cutDirty = true;
    }
    this.growths = this.growths.filter((g) => g.t < g.T);
    if (this.cutDirty) { // 破洞同步到模拟网格：2×2 块里最严重的那个
      const { CU, CV, cD } = this;
      for (let j = 0; j < CV; j++) for (let i = 0; i < CU; i++) {
        const f = j * 2 * NU + i * 2, f2 = Math.min(NV - 1, j * 2 + 1) * NU + i * 2;
        cD[j * CU + i] = Math.max(D[f], D[f + 1], D[f2], D[f2 + 1]);
      }
      this.cutDirty = false;
    }
  }
  _uploadMask() {
    const { N, D, Lf, S, maskData } = this;
    for (let a = 0; a < N; a++) { const o = a * 4; maskData[o] = D[a] * 255; maskData[o + 1] = Lf[a] * 255; maskData[o + 2] = S[a] * 255; maskData[o + 3] = 255; }
    this.mask.needsUpdate = true; this.maskDirty = false;
  }
  /** 破碎比例：破洞 + 抽丝都算破损（游戏计分用） */
  brokenRatio() { let c = 0; const { N, D, Lf } = this; for (let a = 0; a < N; a++) if (D[a] > 0.5 || Lf[a] > 0.35) c++; return c / N; }
  /** 身后能看到、能够着的那半圈（u 0.5–1.0）的破碎比例——追逐玩法的计分口径 */
  zoneRatio() {
    const { NU, NV, D, Lf } = this; let c = 0, n = 0;
    for (let j = 14; j < NV - 8; j++) for (let i = NU >> 1; i < NU; i++) { const a = j * NU + i; n++; if (D[a] > 0.5 || Lf[a] > 0.35) c++; }
    return c / n;
  }
  /** 在背面挑一个破损最少的下手点（全分辨率网格坐标） */
  pickSpot(vMin = 0.2, vMax = 0.93) {
    const { NU, NV, D, Lf } = this; let best = null, bs = 1e9;
    for (let k = 0; k < 10; k++) {
      const i = Math.floor(NU * (0.56 + 0.38 * Math.random())) % NU, j = Math.floor((NV - 1) * (vMin + (vMax - vMin) * Math.random()));
      let sc = Math.random() * 0.3;
      for (let dj = -10; dj <= 10; dj += 5) for (let di = -8; di <= 8; di += 4) { const jj = Math.min(NV - 1, Math.max(0, j + dj)), a = jj * NU + ((i + di + NU) % NU); sc += D[a] + Lf[a] * 0.5; }
      if (sc < bs) { bs = sc; best = { i, j }; }
    }
    return best;
  }
  /** (ci, cj) 附近是否已有破损——用来判定「连撕」 */
  damagedNear(ci, cj, r = 7) {
    const { NU, NV, D, Lf } = this;
    for (let dj = -r; dj <= r; dj += 2) for (let di = -r; di <= r; di += 2) { const j = cj + dj; if (j < 0 || j >= NV) continue; const a = j * NU + ((ci + di + NU) % NU); if (D[a] > 0.5 || Lf[a] > 0.5) return true; }
    return false;
  }
  damageRatio() { let c = 0; for (let a = 0; a < this.N; a++) if (this.D[a] > 0.5) c++; return c / this.N; }

  reset() {
    this.release();
    this.D.fill(0); this.Lf.fill(0); this.S.fill(0); this.cD.fill(0); this.growths.length = 0;
    this.cx.set(this.c0); this.cpx.set(this.c0); this.awake.fill(0);
    this._refresh(true);
    this.active = false; this.settle = false; this.maskDirty = true; this.slackLive = false;
  }
}
