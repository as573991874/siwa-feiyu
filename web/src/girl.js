// 肥鱼的动作：程序化奔跑循环（左右腿交替、蹬地后小腿向后甩起）+ 欠阻尼弹簧叠加的小动作。
// 所有定时都走游戏时间（later），这样逐帧推进录像时也是确定的。

import * as THREE from 'three';
import { twoBoneIK } from './ik.js';

const _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _dir = new THREE.Vector3(), _fw = new THREE.Vector3(), _sd = new THREE.Vector3(), _tg = new THREE.Vector3(), _pole = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

class Spring {
  constructor(v = 0, k = 70, z = 0.5) { this.x = v; this.v = 0; this.t = v; this.k = k; this.z = z; }
  step(dt) { const a = (this.t - this.x) * this.k - this.v * 2 * this.z * Math.sqrt(this.k); this.v += a * dt; this.x += this.v * dt; return this.x; }
}

const LINES = {
  tear: ['呀！', '我的新丝袜！', '讨厌啦～', '又破了！', '哼，赔我！', '咿呀——', '别拽啦！'],
  taunt: ['抓不到～', '略略略', '就这？', '来呀来呀～', '太慢啦！'],
  miss: ['嘿嘿，空了～', '没抓到～'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const KICK_PHASE = 5.3; // 小腿向后甩到最高时的相位

/** 跑姿：stride 摆腿幅度，kick 后踢幅度，bounce 起伏，lean 前倾，cadence 每秒步数，zig 蛇形幅度，skip 蹦跳感，look 回头频率 */
export const STYLES = {
  jog:    { stride: 0.5, kick: 1.25, bounce: 0.03, lean: 0.14, cadence: 2.7, zig: 0, skip: 0, look: 0.25, arm: 0.6 },
  skip:   { stride: 0.45, kick: 1.45, bounce: 0.075, lean: 0.08, cadence: 2.4, zig: 0.05, skip: 1, look: 0.3, arm: 0.9 },
  zigzag: { stride: 0.55, kick: 1.3, bounce: 0.035, lean: 0.16, cadence: 3.0, zig: 0.2, skip: 0, look: 0.2, arm: 0.7 },
  stroll: { stride: 0.38, kick: 1.05, bounce: 0.022, lean: 0.06, cadence: 2.2, zig: 0.03, skip: 0, look: 0.6, arm: 0.45 },
  sprint: { stride: 0.72, kick: 1.5, bounce: 0.04, lean: 0.26, cadence: 3.5, zig: 0.04, skip: 0, look: 0.1, arm: 0.95 },
  hyper:  { stride: 0.66, kick: 1.5, bounce: 0.06, lean: 0.2, cadence: 3.6, zig: 0.17, skip: 0.5, look: 0.25, arm: 1.0 },
};

export class Girl {
  constructor(vrm, root) {
    this.vrm = vrm; this.root = root;
    const H = vrm.humanoid, b = this.b = {};
    for (const n of ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand'])
      b[n] = H.getNormalizedBoneNode(n);
    this.hipsRest = b.hips.position.clone();
    const S = (v, k, z) => new Spring(v, k, z);
    this.c = { x: S(0, 30, 0.6), hop: S(0, 120, 0.35), yaw: S(0, 26, 0.7), run: S(0, 14, 1), headYaw: S(0, 45, 0.5), headTilt: S(0, 50, 0.35), armsUp: S(0, 80, 0.4), stumble: S(0, 60, 0.4), wave: S(0, 40, 0.5),
      duel: S(0, 40, 0.75), tug: S(0, 90, 0.4), sit: S(0, 38, 0.6), scorn: S(0, 30, 0.8) };
    this.style = { ...STYLES.jog }; this.styleT = STYLES.jog;
    this.phase = 0; this.t = 0; this.timers = []; this.nextLook = 3; this.blinkT = 2; this.blink = 0;
    this.face = { happy: 0.4, surprised: 0, angry: 0, sad: 0 }; this.faceT = { happy: 0.4, surprised: 0, angry: 0, sad: 0 }; this.lids = 0;
    this.say = null; this.running = false;
  }
  later(sec, fn) { this.timers.push({ at: this.t + sec, fn }); }
  setStyle(name) { this.styleT = STYLES[name] || STYLES.jog; }
  /** 面向镜头站着（入场）或转身开跑 */
  setRunning(on) { this.running = on; this.c.run.t = on ? 1 : 0; this.c.yaw.t = on ? Math.PI : 0; }
  /** 第 i 条腿（0 = 她的左腿）后甩的程度：-1..1，越接近 1 小腿越靠近身后的人 */
  kick(i) { return Math.cos(this.phase + (i ? Math.PI : 0) - KICK_PHASE); }

  react(kind) {
    const c = this.c;
    if (kind === 'tear') {
      this.faceT.surprised = 1; this.faceT.happy = 0;
      this.later(0.55, () => { this.faceT.surprised = 0; this.faceT.angry = 0.5; this.faceT.happy = 0.1; });
      this.later(1.4, () => { this.faceT.angry = 0; this.faceT.happy = 0.4; });
      c.hop.v += 1.4; c.stumble.v += 5; c.armsUp.t = 1; this.later(0.5, () => { c.armsUp.t = 0; });
      c.headYaw.t = (Math.random() < 0.5 ? -1 : 1) * 1.15; this.later(0.7, () => { c.headYaw.t = 0; });
      if (Math.random() < 0.7) this.say?.(pick(LINES.tear));
    } else if (kind === 'miss') { if (Math.random() < 0.35) this.say?.(pick(LINES.miss)); }
    else if (kind === 'taunt') { c.headYaw.t = (Math.random() < 0.5 ? -1 : 1) * 1.25; c.headTilt.t = 0.2; this.later(1.0, () => { c.headYaw.t = 0; c.headTilt.t = 0; }); this.say?.(pick(LINES.taunt)); }
  }

  update(dt) {
    this.t += dt; const t = this.t, c = this.c, b = this.b, s = this.style;
    this.timers = this.timers.filter((x) => { if (t >= x.at) { x.fn(); return false; } return true; });
    for (const k in s) s[k] += (this.styleT[k] - s[k]) * (1 - Math.exp(-dt * 3));
    for (const k in c) c[k].step(dt);
    const run = Math.max(0, Math.min(1, c.run.x));
    this.phase = (this.phase + dt * Math.PI * s.cadence * run) % (Math.PI * 2);
    if (this.running && t > this.nextLook) { this.react('taunt'); this.nextLook = t + (2.5 + Math.random() * 3) / Math.max(0.1, s.look * 4); }
    c.x.t = this.running ? Math.sin(t * 1.15) * s.zig + Math.sin(t * 0.53 + 1) * s.zig * 0.4 : 0;

    const ph = this.phase, sw = Math.sin(ph), idle = 1 - run, sway = Math.sin(t * 1.6);
    const du = Math.max(0, c.duel.x), tg = c.tug.x, sit = Math.max(0, Math.min(1.1, c.sit.x)), sc = Math.max(0, c.scorn.x);
    // --- 根：朝向 + 横移
    this.root.rotation.y = c.yaw.x; this.root.position.x = c.x.x;
    // --- 腿：大腿前后摆；蹬地之后小腿折起向后甩（从身后看就是脚跟朝镜头踢过来）
    const legPose = (pre, p, sgn) => {
      const k = Math.pow(Math.max(0, Math.cos(p - KICK_PHASE)), 1.4);
      const thigh = (-0.1 - s.stride * Math.sin(p)) * run, knee = (0.22 + s.kick * k) * run + idle * Math.max(0, -sgn * sway) * 0.12;
      b[pre + 'UpperLeg'].rotation.set(thigh, 0, sgn * 0.03 - sway * 0.02 * idle);
      b[pre + 'LowerLeg'].rotation.set(knee, 0, 0);
      b[pre + 'Foot'].rotation.set((0.55 * k - 0.15 * Math.max(0, Math.sin(p))) * run, 0, 0);
    };
    legPose('left', ph, -1); legPose('right', ph + Math.PI, 1);
    if (du > 0.001) { // 拔河：左腿朝前伸出去蹬住，右腿在后面撑着
      b.leftUpperLeg.rotation.x += (-0.62 + 0.1 * tg) * du; b.leftLowerLeg.rotation.x += 0.12 * du; b.leftFoot.rotation.x += 0.35 * du;
      b.rightUpperLeg.rotation.x += (0.3 - 0.1 * tg) * du; b.rightLowerLeg.rotation.x += 0.45 * du; b.rightFoot.rotation.x += -0.3 * du;
    }
    if (sit > 0.001) { // 认输：鸭子坐，小腿折在身体两侧
      for (const [pre, sg] of [['left', -1], ['right', 1]]) { b[pre + 'UpperLeg'].rotation.set(-1.42 * sit, 0, sg * 0.2 * sit); b[pre + 'LowerLeg'].rotation.set(2.45 * sit, 0, 0); b[pre + 'Foot'].rotation.set(0.7 * sit, 0, 0); }
    }
    if (sc > 0.001) { b.leftUpperLeg.rotation.x += -0.22 * sc; b.leftFoot.rotation.x += 0.2 * sc; b.rightUpperLeg.rotation.z += 0.06 * sc; }
    // --- 躯干：每步落地时下沉，蹦跳跑时腾空更高
    const bounce = Math.abs(Math.sin(ph)) * s.bounce * (1 + s.skip * 0.8 * (0.5 + 0.5 * Math.sin(ph * 0.5 + 1))) * run;
    b.hips.position.set(this.hipsRest.x + sway * 0.012 * idle, this.hipsRest.y - 0.03 * run + bounce + Math.max(0, c.hop.x) * 0.08 - Math.abs(c.stumble.x) * 0.02, this.hipsRest.z);
    b.hips.rotation.set(s.lean * run + c.stumble.x * 0.12, 0.14 * sw * run + sway * 0.05 * idle, 0.05 * Math.cos(ph) * run + sway * 0.025 * idle);
    b.hips.position.y -= 0.07 * du + 0.8 * sit; b.hips.position.z += (-0.1 - 0.07 * tg) * du - 0.12 * sit;
    b.hips.rotation.x += (0.16 - 0.16 * tg) * du + 0.1 * sit - 0.04 * sc; b.hips.rotation.z += 0.06 * sc;
    b.spine.rotation.set(s.lean * 0.5 * run + 0.14 * du + 0.12 * sit, -0.2 * sw * run, -0.04 * Math.cos(ph) * run - sway * 0.03 * idle);
    b.chest.rotation.set(0, -0.1 * sw * run, 0);
    b.neck.rotation.set(-s.lean * 0.6 * run, c.headYaw.x * 0.45, c.headTilt.x * 0.4);
    b.head.rotation.set(-s.lean * 0.5 * run + 0.06 * idle - 0.3 * du - 0.25 * sit + 0.42 * sc, c.headYaw.x * 0.55 + sway * 0.04 * idle, c.headTilt.x * 0.6 + sway * 0.05 * idle);
    // --- 手臂：与同侧腿反向摆臂；受惊时举起；入场时右手挥手
    const up = Math.max(0, Math.min(1.2, c.armsUp.x)), wave = Math.max(0, c.wave.x), sa = s.arm * run;
    b.leftUpperArm.rotation.set(0.1 + 0.85 * sw * sa + up * 0.4, up * 0.3, -1.12 + up * 0.3);
    b.rightUpperArm.rotation.set(0.1 - 0.85 * sw * sa + up * 0.4, -up * 0.3, 1.12 - up * 0.3 - wave * 1.9);
    b.leftLowerArm.rotation.set(0, -0.3 - 1.15 * sa - up * 1.2, 0);
    b.rightLowerArm.rotation.set(0, 0.3 + 1.15 * sa + up * 1.2 + wave * (0.9 + 0.5 * Math.sin(t * 11)), 0);
    b.leftHand.rotation.set(0, 0, -0.2); b.rightHand.rotation.set(0, 0, 0.2);
    if (sit > 0.001) { // 坐地上，两手撑在身前
      b.leftUpperArm.rotation.x += -0.35 * sit; b.rightUpperArm.rotation.x += -0.35 * sit; b.leftUpperArm.rotation.z += 0.2 * sit; b.rightUpperArm.rotation.z += -0.2 * sit;
    }


    if (du > 0.25) { // 拔河：两只手真的伸下去攥住左大腿上的袜口
      const w = Math.min(1, (du - 0.25) / 0.55), ww = w * w * (3 - 2 * w);
      b.hips.updateWorldMatrix(true, true);
      this.root.getWorldQuaternion(_rq); _fw.set(0, 0, 1).applyQuaternion(_rq); _sd.set(1, 0, 0).applyQuaternion(_rq);
      b.leftUpperLeg.getWorldPosition(_hip); b.leftLowerLeg.getWorldPosition(_knee); _dir.subVectors(_knee, _hip).normalize();
      for (const [pre, along, side, sgn] of [['left', 0.13, 0.075, 1], ['right', 0.2, -0.045, -1]]) {
        const up = b[pre + 'UpperArm'], lo = b[pre + 'LowerArm'], hand = b[pre + 'Hand'];
        _q0.copy(up.quaternion); _q1.copy(lo.quaternion);
        _tg.copy(_hip).addScaledVector(_dir, along + 0.02 * tg).addScaledVector(_fw, 0.1).addScaledVector(_sd, side); _tg.y += 0.035;
        twoBoneIK(up, lo, hand, _tg, _pole.copy(_sd).multiplyScalar(sgn * 0.8).addScaledVector(_fw, -0.5));
        _q2.copy(up.quaternion); _q3.copy(lo.quaternion);
        up.quaternion.copy(_q0).slerp(_q2, ww); lo.quaternion.copy(_q1).slerp(_q3, ww);
        hand.rotation.set(0.5 * ww, 0, sgn * -0.2);
      }
    }
    const em = this.vrm.expressionManager;
    if (em) {
      this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 1; this.blinkT = 1.8 + Math.random() * 3; }
      this.blink = Math.max(0, this.blink - dt * 7);
      for (const k in this.face) { this.face[k] += (this.faceT[k] - this.face[k]) * (1 - Math.exp(-dt * 14)); em.setValue(k, this.face[k]); }
      em.setValue('blink', this.face.surprised > 0.3 ? 0 : Math.max(this.lids, Math.sin(Math.min(1, this.blink) * Math.PI)));
    }
  }
}
