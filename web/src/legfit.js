// 沿腿骨轴线向外发射水平射线，把原始低模腿拟合成规则的 (NU × NV) 柱面网格。
// 输出：平滑后的皮肤表面位置 + 由命中三角形插值得到的蒙皮权重。
// 规则网格是后面布料模拟、破洞贴图、UV 的共同基础。

const EPS = 1e-9;

function rayTri(ox, oy, oz, dx, dz, p, a, b, c, out) {
  // Möller–Trumbore，射线方向 (dx, 0, dz)，双面
  const ax = p[a], ay = p[a + 1], az = p[a + 2];
  const e1x = p[b] - ax, e1y = p[b + 1] - ay, e1z = p[b + 2] - az;
  const e2x = p[c] - ax, e2y = p[c + 1] - ay, e2z = p[c + 2] - az;
  // h = d × e2
  const hx = -dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (det > -EPS && det < EPS) return false;
  const inv = 1 / det;
  const sx = ox - ax, sy = oy - ay, sz = oz - az;
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  if (u < 0 || u > 1) return false;
  // q = s × e1
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t <= 1e-5) return false;
  out.t = t; out.u = u; out.v = v;
  return true;
}

/**
 * @param geo   原始腿部 BufferGeometry（绑定姿态）
 * @param side  +1 = 模型左腿 (x > cx)，-1 = 右腿
 * @param A,K,F 髋、膝、踝关节的绑定姿态坐标 {x,y,z}
 */
export function fitLeg(geo, side, cx, A, K, F, { NU = 128, NV = 240, yTop, yBot, maxR = 0.125 }) {
  const P = geo.attributes.position.array;
  const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const index = geo.index.array;
  const triCount = index.length / 3;

  // 按高度分桶，水平射线只需检查跨过该高度的三角形
  const BIN = 0.004, y0 = yBot - 0.02, nb = Math.ceil((yTop + 0.02 - y0) / BIN);
  const bins = Array.from({ length: nb }, () => []);
  for (let t = 0; t < triCount; t++) {
    const a = index[t * 3] * 3, b = index[t * 3 + 1] * 3, c = index[t * 3 + 2] * 3;
    const mx = (P[a] + P[b] + P[c]) / 3;
    if (side * (mx - cx) < -0.012) continue; // 另一条腿
    const lo = Math.min(P[a + 1], P[b + 1], P[c + 1]), hi = Math.max(P[a + 1], P[b + 1], P[c + 1]);
    const b0 = Math.max(0, Math.floor((lo - y0) / BIN)), b1 = Math.min(nb - 1, Math.floor((hi - y0) / BIN));
    for (let k = b0; k <= b1; k++) bins[k].push(t);
  }

  const N = NU * NV;
  const rad = new Float32Array(N).fill(NaN);
  const hitTri = new Int32Array(N).fill(-1);
  const hitU = new Float32Array(N), hitV = new Float32Array(N);
  const ax = new Float32Array(NV), az = new Float32Array(NV), ys = new Float32Array(NV);
  const hit = { t: 0, u: 0, v: 0 };

  for (let j = 0; j < NV; j++) {
    const y = yTop + (yBot - yTop) * (j / (NV - 1));
    ys[j] = y;
    let ox, oz;
    if (y >= K.y) {
      const t = Math.max(0, (A.y - y) / (A.y - K.y));
      ox = A.x + (K.x - A.x) * t; oz = A.z + (K.z - A.z) * t;
    } else {
      const t = (K.y - y) / (K.y - F.y);
      ox = K.x + (F.x - K.x) * t; oz = K.z + (F.z - K.z) * t;
    }
    ax[j] = ox; az[j] = oz;
    const list = bins[Math.min(nb - 1, Math.max(0, Math.floor((y - y0) / BIN)))];
    for (let i = 0; i < NU; i++) {
      const th = (i / NU) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
      let best = -1, bt = 0, bu = 0, bv = 0;
      for (let k = 0; k < list.length; k++) {
        const t = list[k];
        if (rayTri(ox, y, oz, dx, dz, P, index[t * 3] * 3, index[t * 3 + 1] * 3, index[t * 3 + 2] * 3, hit)) {
          if (hit.t < maxR && hit.t > bt) { bt = hit.t; best = t; bu = hit.u; bv = hit.v; }
        }
      }
      if (best >= 0) { const n = j * NU + i; rad[n] = bt; hitTri[n] = best; hitU[n] = bu; hitV[n] = bv; }
    }
  }

  // 补洞：环向找最近的有效样本
  let lastGoodRow = -1;
  for (let j = 0; j < NV; j++) {
    let any = false;
    for (let i = 0; i < NU; i++) if (!Number.isNaN(rad[j * NU + i])) { any = true; break; }
    if (!any) {
      if (lastGoodRow >= 0) for (let i = 0; i < NU; i++) { rad[j * NU + i] = rad[lastGoodRow * NU + i]; hitTri[j * NU + i] = hitTri[lastGoodRow * NU + i]; hitU[j * NU + i] = hitU[lastGoodRow * NU + i]; hitV[j * NU + i] = hitV[lastGoodRow * NU + i]; }
      continue;
    }
    for (let i = 0; i < NU; i++) {
      const n = j * NU + i;
      if (!Number.isNaN(rad[n])) continue;
      let l = 1, r = 1;
      while (Number.isNaN(rad[j * NU + ((i - l + NU) % NU)])) l++;
      while (Number.isNaN(rad[j * NU + ((i + r) % NU)]) || hitTri[j * NU + ((i + r) % NU)] === -2) r++;
      const nl = j * NU + ((i - l + NU) % NU), nr = j * NU + ((i + r) % NU);
      rad[n] = (rad[nl] * r + rad[nr] * l) / (l + r);
      const src = l <= r ? nl : nr;
      hitTri[n] = hitTri[src]; hitU[n] = hitU[src]; hitV[n] = hitV[src];
    }
    lastGoodRow = j;
  }

  const clampCenter = (arr) => {
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const dx = Math.cos((i / NU) * Math.PI * 2);
      if (side * dx < -0.05) {
        const lim = (cx + side * 0.002 - ax[j]) / dx; // 到中线的距离
        if (arr[j * NU + i] > lim) arr[j * NU + i] = Math.max(0.01, lim);
      }
    }
  };
  clampCenter(rad);

  // 可分离高斯平滑（环向循环、纵向夹取），抹掉低模的棱面
  const ker = [0.07, 0.24, 0.38, 0.24, 0.07];
  let cur = rad, tmp = new Float32Array(N);
  for (let pass = 0; pass < 3; pass++) {
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += cur[j * NU + ((i + k + NU) % NU)] * ker[k + 2];
      tmp[j * NU + i] = s;
    }
    const out = new Float32Array(N);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += tmp[Math.min(NV - 1, Math.max(0, j + k)) * NU + i] * ker[k + 2];
      out[j * NU + i] = s;
    }
    cur = out;
  }
  clampCenter(cur);

  const pos = new Float32Array(N * 3);
  const skinIndex = new Uint16Array(N * 4), skinWeight = new Float32Array(N * 4);
  const circ = new Float32Array(NV);
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const n = j * NU + i, th = (i / NU) * Math.PI * 2;
      const r = cur[n];
      pos[n * 3] = ax[j] + Math.cos(th) * r;
      pos[n * 3 + 1] = ys[j];
      pos[n * 3 + 2] = az[j] + Math.sin(th) * r;
      // 权重：命中三角形三个顶点的重心插值，合并后取最大的四个
      const t = hitTri[n];
      const acc = new Map();
      if (t >= 0) {
        const w3 = [1 - hitU[n] - hitV[n], hitU[n], hitV[n]];
        for (let c = 0; c < 3; c++) {
          const vi = index[t * 3 + c];
          for (let k = 0; k < 4; k++) {
            const w = SW.getComponent(vi, k) * w3[c];
            if (w > 0) { const b = SI.getComponent(vi, k); acc.set(b, (acc.get(b) || 0) + w); }
          }
        }
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      let sum = 0; for (const e of top) sum += e[1];
      for (let k = 0; k < 4; k++) {
        skinIndex[n * 4 + k] = top[k] ? top[k][0] : 0;
        skinWeight[n * 4 + k] = top[k] ? top[k][1] / (sum || 1) : 0;
      }
    }
    let c = 0;
    for (let i = 0; i < NU; i++) {
      const a = (j * NU + i) * 3, b = (j * NU + ((i + 1) % NU)) * 3;
      c += Math.hypot(pos[a] - pos[b], pos[a + 2] - pos[b + 2]);
    }
    circ[j] = c;
  }

  return { NU, NV, pos, skinIndex, skinWeight, circ, yTop, yBot, dv: (yTop - yBot) / (NV - 1) };
}
