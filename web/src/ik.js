// 解析式两骨 IK（世界空间）：肩-肘-腕 这类三关节链，把末端摆到目标点，中间关节朝 pole 方向弯。
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _ab = new THREE.Vector3(), _cb = new THREE.Vector3();
const _n = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion();

/** 在世界空间里给骨骼左乘一个旋转 */
export function rotateWorld(bone, dq) {
  bone.parent.getWorldQuaternion(_pq); bone.getWorldQuaternion(_bq);
  bone.quaternion.copy(_pq.invert()).multiply(dq).multiply(_bq);
  bone.updateMatrixWorld(true);
}

/** @returns 目标超出臂展的距离（> 0 表示够不着） */
export function twoBoneIK(upper, fore, hand, target, pole) {
  const a = upper.getWorldPosition(_a), b = fore.getWorldPosition(_b), c = hand.getWorldPosition(_c);
  const la = a.distanceTo(b), lb = b.distanceTo(c), want = a.distanceTo(target);
  const lt = Math.min(la + lb - 1e-4, Math.max(Math.abs(la - lb) + 1e-4, want));
  // 1) 中间关节：把夹角调到三角形要求的角度
  _ab.subVectors(a, b); _cb.subVectors(c, b);
  const ang0 = _ab.angleTo(_cb), ang1 = Math.acos(THREE.MathUtils.clamp((la * la + lb * lb - lt * lt) / (2 * la * lb), -1, 1));
  _n.crossVectors(_ab, _cb); if (_n.lengthSq() < 1e-10) _n.crossVectors(_ab, pole); _n.normalize();
  rotateWorld(fore, _q.setFromAxisAngle(_n, ang1 - ang0));
  // 2) 根关节：把末端甩到目标方向上
  hand.getWorldPosition(_c);
  rotateWorld(upper, _q.setFromUnitVectors(_u.subVectors(_c, a).normalize(), _v.subVectors(target, a).normalize()));
  // 3) 绕「根 → 目标」轴转动，让中间关节朝 pole 方向
  _n.subVectors(target, a).normalize(); fore.getWorldPosition(_b);
  _e.subVectors(_b, a); _e.addScaledVector(_n, -_e.dot(_n));
  _p.copy(pole); _p.addScaledVector(_n, -_p.dot(_n));
  if (_e.lengthSq() > 1e-8 && _p.lengthSq() > 1e-8) {
    _e.normalize(); _p.normalize();
    rotateWorld(upper, _q.setFromAxisAngle(_n, Math.atan2(_u.crossVectors(_e, _p).dot(_n), _e.dot(_p))));
  }
  return want - (la + lb);
}
