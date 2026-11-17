// 第一人称的糙汉：Rocketbox Construction_Male_04（MIT）。
// 头盔 / 头部 / 工具隐藏，身体挂在相机后下方；两条手臂用解析式两骨 IK 跟随目标，手指做捏取姿势。
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const SCALE = 0.01 * 1.1; // 模型单位是厘米；糙汉稍微放大一点
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _n = V(), _q = Q(), _q2 = Q(), _pq = Q();

/** 在世界空间里给骨骼左乘一个旋转 */
function rotateWorld(bone, dq) {
  bone.parent.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_q2);
  bone.quaternion.copy(_pq.invert()).multiply(dq).multiply(_q2);
  bone.updateMatrixWorld(true);
}
function setWorldQuat(bone, q) {
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert()).multiply(q);
  bone.updateMatrixWorld(true);
}

export async function loadMan() {
  const mgr = new THREE.LoadingManager();
  mgr.setURLModifier((u) => (/\.tga$/i.test(u) ? 'data:,' : u)); // 原始 TGA 没下载，贴图自己挂
  const tl = new THREE.TextureLoader();
  const [fbx, map, nrm] = await Promise.all([
    new FBXLoader(mgr).loadAsync('/models/Construction_Male_04.fbx'),
    tl.loadAsync('/models/m103_body_color.jpg'), tl.loadAsync('/models/m103_body_normal.jpg'),
  ]);
  map.colorSpace = THREE.SRGBColorSpace;
  return new Man(fbx, map, nrm);
}

class Arm {
  constructor(root, side) { // side: 'R' | 'L'
    const b = (n) => root.getObjectByName(`Bip01_${side}_${n}`);
    this.side = side; this.sgn = side === 'R' ? 1 : -1;
    this.upper = b('UpperArm'); this.fore = b('Forearm'); this.hand = b('Hand'); this.clav = b('Clavicle');
    this.fingers = [0, 1, 2, 3, 4].map((f) => [b(`Finger${f}`), b(`Finger${f}1`), b(`Finger${f}2`)]);
    this.curl = 0; this.target = V(); this.ready = false; this.corr = V(); this.aim = V();
  }
  /** 在绑定姿态下分析手的朝向和每节指骨的弯曲轴（世界矩阵必须是最新的） */
  analyse() {
    const h = this.hand, wp = (o) => o.getWorldPosition(V());
    const inv = h.getWorldQuaternion(Q()).invert(), wrist = wp(h);
    const toLocal = (v) => v.clone().applyQuaternion(inv).normalize();
    const vi = wp(this.fingers[1][0]).sub(wrist), vp = wp(this.fingers[4][0]).sub(wrist);
    const palmW = V().crossVectors(vi, vp).normalize().multiplyScalar(this.sgn); // 掌心朝向
    const fwdW = wp(this.fingers[2][0]).sub(wrist).normalize();                   // 手腕 → 中指根
    this.fwdL = toLocal(fwdW); this.palmL = toLocal(palmW);
    // 每节指骨：在 6 个局部轴向里挑一个，使指尖朝掌心（拇指则朝食指根）移动得最多
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => V().fromArray(a));
    this.bend = this.fingers.map((chain, f) => {
      const tip = chain[2], aim = f === 0 ? wp(this.fingers[1][0]).sub(wp(chain[2])).normalize().addScaledVector(palmW, 0.6).normalize() : palmW;
      let prev = null;
      return chain.map((bone, k) => {
        const rest = bone.quaternion.clone();
        if (k === 2) return { bone, rest, axis: prev }; // 末节没有子骨骼可测，沿用上一节的轴
        const p0 = wp(tip); let best = null, bs = -1e9;
        for (const ax of axes) {
          bone.quaternion.copy(rest).multiply(_q.setFromAxisAngle(ax, 0.35)); bone.updateMatrixWorld(true);
          const s = wp(tip).sub(p0).dot(aim); if (s > bs) { bs = s; best = ax; }
        }
        bone.quaternion.copy(rest); bone.updateMatrixWorld(true);
        prev = best; return { bone, rest, axis: best };
      });
    });
    this.restUpper = this.upper.quaternion.clone(); this.restFore = this.fore.quaternion.clone(); this.restHand = this.hand.quaternion.clone();
    this.lenA = wp(this.fore).distanceTo(wp(this.upper)); this.lenB = wp(this.hand).distanceTo(wp(this.fore));
    this.setFingers(1); // 捏合状态下拇指尖与食指尖的中点 = 抓取点
    const grip = wp(this.fingers[0][2]).lerp(wp(this.fingers[1][2]), 0.5).addScaledVector(fwdW, 0.012 / 1).sub(wrist);
    this.gripL = grip.applyQuaternion(inv); // 世界尺度、手部局部朝向
    this.setFingers(0);
  }
  /** g: 0 = 自然张开，1 = 拇指食指捏紧、其余手指握起 */
  /** 拳头里攥住布的那一点：拇指尖与食指中节的中点（世界坐标） */
  pinchPoint(out) { return out.copy(this.fingers[0][2].getWorldPosition(V())).lerp(this.fingers[1][1].getWorldPosition(V()), 0.5); }
  setFingers(g) {
    const open = [[0.1, 0.1, 0.1], [0.25, 0.25, 0.2], [0.3, 0.3, 0.2], [0.35, 0.35, 0.25], [0.4, 0.4, 0.3]];
    const shut = [[0.7, 0.45, 0.5], [1.25, 1.35, 0.95], [1.35, 1.45, 1.0], [1.4, 1.5, 1.0], [1.4, 1.5, 1.0]]; // 攥成拳：一把抓住布料
    this.bend.forEach((chain, f) => chain.forEach(({ bone, rest, axis }, k) => {
      bone.quaternion.copy(rest).multiply(_q.setFromAxisAngle(axis, open[f][k] + (shut[f][k] - open[f][k]) * g));
    }));
    this.hand.updateMatrixWorld(true);
  }
  /** grip: 抓取点的世界坐标；dir: 手指指向；palm: 掌心朝向；pole: 肘部偏向 */
  solve(grip, dir, palm, pole, pinch) {
    this.upper.quaternion.copy(this.restUpper); this.fore.quaternion.copy(this.restFore); this.hand.quaternion.copy(this.restHand);
    this.clav.updateMatrixWorld(true);
    // 目标手部朝向：局部 (fwd, palm) → 世界 (dir, palm⊥)
    const d = _d.copy(dir).normalize(), p = _e.copy(palm).addScaledVector(d, -palm.dot(d)).normalize();
    const mW = new THREE.Matrix4().makeBasis(d, p, V().crossVectors(d, p));
    const pl = this.palmL.clone().addScaledVector(this.fwdL, -this.palmL.dot(this.fwdL)).normalize();
    const mL = new THREE.Matrix4().makeBasis(this.fwdL, pl, V().crossVectors(this.fwdL, pl));
    const handQ = Q().setFromRotationMatrix(mW.multiply(mL.invert()));
    const t = V().copy(grip).sub(V().copy(this.gripL).applyQuaternion(handQ)); // 手腕应该到的位置

    const a = this.upper.getWorldPosition(_a), b = this.fore.getWorldPosition(_b), c = this.hand.getWorldPosition(_c);
    const la = a.distanceTo(b), lb = b.distanceTo(c);
    const lt = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, a.distanceTo(t)));
    // 1) 肘：把夹角调到三角形要求的角度
    const ab = V().subVectors(a, b), cb = V().subVectors(c, b);
    const ang0 = ab.angleTo(cb), ang1 = Math.acos(THREE.MathUtils.clamp((la * la + lb * lb - lt * lt) / (2 * la * lb), -1, 1));
    const axis = _n.crossVectors(ab, cb); if (axis.lengthSq() < 1e-10) axis.crossVectors(ab, pole); axis.normalize();
    rotateWorld(this.fore, _q.setFromAxisAngle(axis, ang1 - ang0));
    // 2) 肩：把手腕甩到目标方向上
    this.hand.getWorldPosition(_c);
    rotateWorld(this.upper, _q.setFromUnitVectors(V().subVectors(_c, a).normalize(), V().subVectors(t, a).normalize()));
    // 3) 绕「肩 → 目标」轴转动，让肘部朝 pole 方向
    const n = V().subVectors(t, a).normalize(); this.fore.getWorldPosition(_b);
    const e = V().subVectors(_b, a); e.addScaledVector(n, -e.dot(n));
    const pp = V().copy(pole); pp.addScaledVector(n, -pp.dot(n));
    if (e.lengthSq() > 1e-8 && pp.lengthSq() > 1e-8) {
      e.normalize(); pp.normalize();
      const ang = Math.atan2(V().crossVectors(e, pp).dot(n), e.dot(pp));
      rotateWorld(this.upper, _q.setFromAxisAngle(n, ang));
    }
    setWorldQuat(this.hand, handQ);
    this.setFingers(pinch);
    return a.distanceTo(t) - (la + lb); // > 0 表示够不着
  }
}

export class Man {
  constructor(fbx, map, nrm) {
    this.root = fbx;
    fbx.scale.setScalar(SCALE); fbx.rotation.y = Math.PI; // 面朝 -Z（朝向肥鱼）
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    fbx.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        if (!/body/i.test(m.name)) { const hid = new THREE.MeshBasicMaterial(); hid.visible = false; return hid; }
        return new THREE.MeshStandardMaterial({ map, normalMap: nrm, roughness: 0.62, metalness: 0, clippingPlanes: [this.floor] });
      });
      if (!Array.isArray(o.material) || mats.length === 1) o.material = o.material[0];
    });
    fbx.updateMatrixWorld(true);
    this.head = fbx.getObjectByName('Bip01_Head');
    this.right = new Arm(fbx, 'R'); this.left = new Arm(fbx, 'L');
    // 上身前倾（蹲在她面前的姿势），再分析手部
    const lean = Q().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.2);
    for (const n of ['Bip01_Spine', 'Bip01_Spine1']) rotateWorld(fbx.getObjectByName(n), lean);
    rotateWorld(fbx.getObjectByName('Bip01_Neck'), Q().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3));
    fbx.updateMatrixWorld(true);
    this.right.analyse(); this.left.analyse();
    this.headOff = this.head.getWorldPosition(V()).sub(fbx.position); // 根节点 → 头部
    this.rGrip = V(); this.lGrip = V(); this.pinch = 0; this.leanOff = V(); this.first = true;
  }
  /**
   * @param L, R  { pos: 抓取点要去的世界坐标, pinch: 0..1 捏合程度, snap: 跟随速度 }
   */
  update(dt, camera, L, R, time) {
    const fwd = camera.getWorldDirection(V()), right = V().crossVectors(fwd, V().set(0, 1, 0)).normalize(), up = V().crossVectors(right, fwd);
    const flat = V().set(fwd.x, 0, fwd.z).normalize();
    // 眼睛在头骨前上方；身体跟着相机，但不跟俯仰
    const eye = V().copy(camera.position).addScaledVector(flat, -0.2).addScaledVector(V().set(0, 1, 0), -0.1); // 身体整体靠后，低头时才看得到胸口
    this.root.position.copy(eye).sub(this.headOff).add(this.leanOff);
    this.root.updateMatrixWorld(true);
    let worst = -1, pull = V();
    for (const [arm, tg, sgn] of [[this.right, R, 1], [this.left, L, -1]]) {
      const k = this.first ? 1 : 1 - Math.exp(-dt * (tg.snap || 16));
      arm.target.lerp(tg.pos, k); arm.curl += (tg.pinch - arm.curl) * (1 - Math.exp(-dt * 24));
      const sh = arm.upper.getWorldPosition(V());
      const dir = V().subVectors(arm.target, sh).normalize().lerp(fwd, 0.35).normalize();
      // 掌心朝内下方，肘部朝外下方
      arm.aim.copy(arm.target).add(arm.corr);
      const over = arm.solve(arm.aim, dir, V().copy(right).multiplyScalar(-0.55 * sgn).addScaledVector(up, -0.8), V().copy(right).multiplyScalar(0.7 * sgn).addScaledVector(up, -0.7), arm.curl);
      if (over > worst) { worst = over; pull.subVectors(arm.target, sh).normalize(); }
      // 实际的捏合点 = 拇指尖和食指尖的中点；把它和目标的差慢慢补回去
      const pinchPt = arm.pinchPoint(V());
      arm.corr.add(V().subVectors(arm.target, pinchPt).multiplyScalar(0.6)).clampLength(0, 0.2); arm.err = pinchPt.distanceTo(arm.target);
    }
    this.first = false;
    // 够不着就探身
    const want = pull.multiplyScalar(Math.min(0.3, Math.max(0, worst + 0.03)));
    this.leanOff.lerp(want.add(this.leanOff), 1 - Math.exp(-dt * 10)).multiplyScalar(worst < -0.05 ? 0.92 : 1).clampLength(0, 0.34); // 探太多上衣会怼到镜头前
  }
}
