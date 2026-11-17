// 丝袜 / 皮肤 / 原始腿（鞋子）三套着色器。光照手写，三者共用同一组 uniform。
import * as THREE from 'three';

export function makeSharedUniforms() {
  return {
    uKeyDir: { value: new THREE.Vector3(0.4, 0.7, 0.6) }, // 视空间，逐帧更新
    uFillDir: { value: new THREE.Vector3(-0.6, 0.2, 0.5) },
    uUpV: { value: new THREE.Vector3(0, 1, 0) },
    uKeyColor: { value: new THREE.Color(1.0, 0.96, 0.92).multiplyScalar(0.82) },
    uFillColor: { value: new THREE.Color(0.55, 0.7, 0.85).multiplyScalar(0.35) },
    uAmbSky: { value: new THREE.Color(0.62, 0.72, 0.8).multiplyScalar(0.42) },
    uAmbGround: { value: new THREE.Color(0.75, 0.7, 0.72).multiplyScalar(0.4) },
    uSkinColor: { value: new THREE.Color('#ffd9cb') },
    uBlushColor: { value: new THREE.Color('#ff9f98') },
    // 织物
    uFabricColor: { value: new THREE.Color('#1b1310') },
    uDensity: { value: 1.0 },        // 正视时的遮盖（越大越厚，相当于丹数）
    uStretchClear: { value: 1.0 },    // 拉伸变透的指数
    uMaxCover: { value: 0.985 },
    uSheen: { value: 0.42 },
    uSheenPow: { value: 3.2 },
    uSheenColor: { value: new THREE.Color('#8f7b72') },
    uSpec: { value: 0.5 },
    uSpecPow: { value: 46 },
    uWeave: { value: 0.5 },
    uPearl: { value: 0.39 },
    uPearlScale: { value: 572 },
    uPearlDensity: { value: 0.12 },
    uPearlRand: { value: 0.435 },
    uWrinkle: { value: 1.0 },
    uEdgeNoise: { value: 0.22 },
    uNet: { value: 0 },             // 1 = 渔网
    uTime: { value: 0 },
  };
}

const COMMON_FS = /* glsl */ `
uniform vec3 uKeyDir, uFillDir, uUpV;
uniform vec3 uKeyColor, uFillColor, uAmbSky, uAmbGround;
uniform vec3 uSkinColor, uBlushColor, uFabricColor, uSheenColor;
uniform float uDensity, uStretchClear, uMaxCover, uSheen, uSheenPow, uSpec, uSpecPow;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

vec3 ambient(vec3 N){ return mix(uAmbGround, uAmbSky, dot(N, uUpV) * 0.5 + 0.5); }

vec3 skinShade(vec3 N, vec3 V, vec3 base){
  float ndl = dot(N, uKeyDir);
  float wrap = smoothstep(-0.5, 1.0, ndl);
  // 明暗交界处的次表面泛红
  vec3 sss = vec3(1.0, 0.32, 0.22) * smoothstep(-0.55, 0.1, ndl) * smoothstep(0.6, 0.0, ndl) * 0.22;
  float fill = max(dot(N, uFillDir) * 0.5 + 0.5, 0.0);
  vec3 c = base * (ambient(N) * 0.8 + uKeyColor * wrap * 0.7 + uFillColor * fill * 0.8) + base * sss;
  float ndv = max(dot(N, V), 0.0);
  c += pow(1.0 - ndv, 4.0) * 0.16 * vec3(1.0, 0.9, 0.88);
  vec3 H = normalize(uKeyDir + V);
  c += pow(max(dot(N, H), 0.0), 48.0) * 0.14 * uKeyColor;
  return c;
}

// 返回 rgb = 织物自身受光颜色，a = 遮盖率。薄纱规律：视线越斜，穿过的纱线越多 → 越不透明
vec4 fabricShade(vec3 N, vec3 V, vec3 T, float stretch, float densMul){
  float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
  float dens = uDensity * densMul / pow(clamp(stretch, 0.3, 1.9), uStretchClear);
  float cover = clamp(1.0 - exp(-dens / max(ndv, 0.11)), 0.0, uMaxCover);
  float ndl = dot(N, uKeyDir);
  vec3 lit = uFabricColor * (ambient(N) * 1.1 + uKeyColor * smoothstep(-0.3, 1.0, ndl));
  float rim = pow(1.0 - ndv, uSheenPow);
  lit += uSheenColor * rim * uSheen * (0.35 + 0.65 * smoothstep(-0.3, 0.8, ndl));
  // 纤维方向的各向异性高光（Kajiya-Kay）
  vec3 H = normalize(uKeyDir + V);
  float th = dot(T, H);
  float sp = pow(sqrt(max(1.0 - th * th, 0.0)), uSpecPow) * pow(max(dot(N, H), 0.0), 10.0) * smoothstep(-0.15, 0.5, ndl);
  lit += sp * uSpec * uKeyColor * 0.55;
  return vec4(lit, cover);
}
`;

const SKIN_VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
attribute float aStretch;
varying vec3 vViewPos; varying vec3 vN; varying vec2 vUv; varying vec3 vRest; varying float vStretch;
void main(){
  vUv = uv; vRest = position;
  #ifdef HAS_STRETCH
    vStretch = aStretch;
  #else
    vStretch = 1.0;
  #endif
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vViewPos = mvPosition.xyz;
  vN = normalize(transformedNormal);
}
`;

// ---------- 丝袜壳层 ----------
const STOCKING_FS = /* glsl */ `
precision highp float;
varying vec3 vViewPos; varying vec3 vN; varying vec2 vUv; varying vec3 vRest; varying float vStretch;
uniform sampler2D uMask;       // R = 破损, G = 抽丝, B = 松弛褶皱
uniform vec2 uGrid;            // (NU, NV)
uniform vec2 uMetric;          // 近似的 (周长, 长度)，单位米
uniform float uKneeV, uHot;
uniform vec3 uHotColor;
uniform float uWeave, uPearl, uPearlScale, uPearlDensity, uPearlRand, uWrinkle, uEdgeNoise, uTime, uNet;
${COMMON_FS}
void main(){
  vec2 muv = vec2(vUv.x + 0.5 / uGrid.x, (vUv.y * (uGrid.y - 1.0) + 0.5) / uGrid.y);
  vec4 m = texture2D(uMask, muv);
  vec2 met = vUv * uMetric;                      // 米制坐标，用于各向同性的噪声
  float n1 = fbm(met * 260.0), n2 = fbm(met * vec2(900.0, 140.0) + 3.7);

  // --- 破洞：阈值 + 噪声得到毛糙的不规则边缘
  float D = m.r + (n1 - 0.5) * uEdgeNoise * smoothstep(0.05, 0.4, m.r) + (n2 - 0.5) * 0.12 * smoothstep(0.2, 0.5, m.r);
  if (D > 0.5) discard;
  float edge = smoothstep(0.22, 0.5, D);         // 洞口卷边：纱线回缩堆积，更密更暗

  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vViewPos);
  // 由屏幕导数重建切线：T 沿环向（纬向纱线），B 沿腿长方向
  vec3 dpx = dFdx(vViewPos), dpy = dFdy(vViewPos);
  vec2 dux = dFdx(vUv), duy = dFdy(vUv);
  vec3 T = normalize(dpx * duy.y - dpy * dux.y + 1e-8);
  T = normalize(T - N * dot(N, T));
  vec3 B = cross(N, T);

  // --- 褶皱：拉扯后留下的松弛 + 脚踝处的常驻堆褶
  float ankle = smoothstep(0.90, 1.0, vUv.y) * 0.55;
  float slack = clamp(m.b + ankle, 0.0, 1.0);
  float wph = met.y * 520.0 + 9.0 * fbm(met * vec2(38.0, 16.0));
  float wr = sin(wph);
  float wmask = smoothstep(0.3, 0.7, fbm(met * vec2(45.0, 110.0) + 9.1));   // 褶皱成簇出现，而不是整片斑马纹
  slack *= mix(0.25, 1.0, wmask) * smoothstep(1.45, 1.05, vStretch);   // 绷紧的布面上没有褶
  N = normalize(N + B * cos(wph) * slack * 0.4 * uWrinkle + T * (n1 - 0.5) * slack * 0.35 * uWrinkle);

  // --- 织纹：只在近景出现，远处用导数淡出以免摩尔纹
  vec2 wv = met * vec2(2600.0, 2100.0);
  float wfade = (1.0 - smoothstep(0.25, 0.7, max(fwidth(wv.x), fwidth(wv.y)))) * smoothstep(1.6, 1.1, vStretch);
  float weave = sin(wv.x * 6.2832) * sin(wv.y * 6.2832);
  N = normalize(N + (T * cos(wv.x * 6.2832) + B * cos(wv.y * 6.2832)) * 0.12 * uWeave * wfade);

  // --- 密度：膝盖被撑开更透，洞边更密，抽丝处纵向纱线脱散只剩横档
  float kneeAng = cos((vUv.x - 0.25) * 6.2832) * 0.5 + 0.5;
  float knee = exp(-pow((vUv.y - uKneeV) / 0.055, 2.0)) * kneeAng * kneeAng;
  float densMul = (1.0 - 0.3 * knee) * (1.0 + edge * 2.6) * (1.0 + slack * 0.22 * wr);
  densMul *= 1.0 + 0.16 * uWeave * weave * wfade + (n1 - 0.5) * 0.12;
  float L = smoothstep(0.08, 0.6, m.g + (n2 - 0.5) * 0.25 * step(0.02, m.g));
  float rung = smoothstep(0.55, 0.8, sin(met.y * 6.2832 / 0.0022 + 2.0 * n1) * 0.5 + 0.5);
  float runEdge = smoothstep(0.15, 0.4, m.g) * (1.0 - smoothstep(0.45, 0.75, m.g)); // 脱线两侧被挤在一起的纱线
  densMul *= mix(1.0, mix(0.08, 1.6, rung), L * (1.0 - edge));
  densMul *= 1.0 + runEdge * 1.4;

  if (uNet > 0.5) { // 渔网：45° 菱形网格，线上很密、网眼里几乎全透
    vec2 nq = vec2(met.x + met.y, met.x - met.y) / (0.4 / 36.0);
    vec2 nf = abs(fract(nq) - 0.5);
    densMul *= mix(0.015, 7.0, smoothstep(0.40, 0.46, max(nf.x, nf.y)));
  }
  vec4 fab = fabricShade(N, V, T, vStretch, densMul);
  vec3 col = fab.rgb;
  col *= 1.0 - edge * 0.35;

  // --- 珠光闪点
  vec2 g = met * uPearlScale * 4.0;
  vec2 id = floor(g);
  float h = hash21(id);
  vec3 jit = (vec3(h, hash21(id + 7.3), hash21(id + 3.1)) - 0.5) * uPearlRand * 2.0;
  vec3 Hh = normalize(uKeyDir + V);
  float glint = pow(max(dot(normalize(N + jit), Hh), 0.0), 90.0);
  float sparkle = step(1.0 - uPearlDensity, hash21(id + 11.7)) * smoothstep(0.7, 0.2, length(fract(g) - 0.5));
  float pfade = 1.0 - smoothstep(0.6, 1.6, max(fwidth(g.x), fwidth(g.y)));
  col += uKeyColor * glint * sparkle * uPearl * 5.0 * mix(0.25, 1.0, pfade);

  // 这条腿现在够得着：边缘泛一圈暖光
  float hot = uHot * pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);
  col += uHotColor * hot * 0.7;
  gl_FragColor = vec4(col, min(1.0, fab.a + hot * 0.25));
  #include <colorspace_fragment>
}
`;

export function makeStockingMaterial(shared, maskTex, fit, kneeV) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uMask: { value: maskTex },
      uGrid: { value: new THREE.Vector2(fit.NU, fit.NV) },
      uMetric: { value: new THREE.Vector2(0.4, fit.yTop - fit.yBot) },
      uKneeV: { value: kneeV },
      uHot: { value: 0 },
      uHotColor: { value: new THREE.Color(1.0, 0.45, 0.6) },
    },
    defines: { HAS_STRETCH: 1 },
    vertexShader: SKIN_VS,
    fragmentShader: STOCKING_FS,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false, // 拉起的薄片正反面几乎重合，写深度会产生条纹状的深度冲突
  });
}

// ---------- 丝袜下面的皮肤（平滑柱面） ----------
const SKIN_FS = /* glsl */ `
precision highp float;
varying vec3 vViewPos; varying vec3 vN; varying vec2 vUv; varying vec3 vRest;
uniform float uKneeV;
${COMMON_FS}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(-vViewPos);
  float front = cos((vUv.x - 0.25) * 6.2832) * 0.5 + 0.5;
  float knee = exp(-pow((vUv.y - uKneeV) / 0.05, 2.0)) * front * front;
  float shin = smoothstep(uKneeV, 1.0, vUv.y) * 0.12;
  vec3 base = mix(uSkinColor, uBlushColor, clamp(knee * 0.55 + shin + 0.06 * fbm(vUv * vec2(9.0, 24.0)), 0.0, 1.0));
  gl_FragColor = vec4(skinShade(N, V, base), 1.0);
  #include <colorspace_fragment>
}
`;

export function makeSkinMaterial(shared, kneeV) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uKneeV: { value: kneeV } },
    vertexShader: SKIN_VS, fragmentShader: SKIN_FS,
  });
}

// ---------- 原始腿网格：只保留鞋子与袜口以上，袜色与壳层保持一致 ----------
const LEGACY_FS = /* glsl */ `
precision highp float;
varying vec3 vViewPos; varying vec3 vN; varying vec2 vUv; varying vec3 vRest;
uniform sampler2D map; uniform float uYTop, uYBot;
${COMMON_FS}
void main(){
  if (vRest.y > uYBot + 0.004 && vRest.y < uYTop - 0.004) discard; // 这一段由拟合的皮肤 + 丝袜接管
  vec3 tex = texture2D(map, vUv).rgb;
  float white = smoothstep(0.3, 0.55, min(tex.r, min(tex.g, tex.b)));   // 贴图里的白袜区域
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vViewPos);
  vec3 skin = skinShade(N, V, uSkinColor);
  float upper = smoothstep(uYTop - 0.02, uYTop + 0.05, vRest.y);        // 裙底的加厚裆部
  vec4 fab = fabricShade(N, V, normalize(cross(N, uUpV) + 1e-5), 1.0, mix(1.0, 4.0, upper));
  vec3 stock = mix(skin, fab.rgb, fab.a);
  float ndl = dot(N, uKeyDir);
  vec3 H = normalize(uKeyDir + V);
  vec3 shoe = tex * (ambient(N) * 1.3 + uKeyColor * smoothstep(-0.2, 1.0, ndl)) + pow(max(dot(N, H), 0.0), 60.0) * 0.5 * uKeyColor;
  gl_FragColor = vec4(mix(shoe, stock, white), 1.0);
  #include <colorspace_fragment>
}
`;

export function makeLegacyLegMaterial(shared, map, yTop, yBot) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, map: { value: map }, uYTop: { value: yTop }, uYBot: { value: yBot } },
    vertexShader: SKIN_VS, fragmentShader: LEGACY_FS, side: THREE.DoubleSide,
  });
}

// ---------- 背景渐变球 ----------
export function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color('#4f9fd0') }, uMid: { value: new THREE.Color('#a8d8ea') }, uHor: { value: new THREE.Color('#fff0d6') } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 uTop, uMid, uHor;
      void main(){ vec3 d = normalize(vP);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.22, h));
        c = mix(c, uTop, smoothstep(0.18, 0.75, h));
        c = mix(c, uHor * 0.9, smoothstep(0.0, -0.12, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}
