// 「おひさまのかけら」の案内役：光の妖精（3D モデルは使わない。three.js のコードだけ）
// 使い方（くわしくは sun_fairy.md）：
//   import { createFairy } from './sun_fairy.js';
//   const fairy = createFairy({ scale: 1 }); scene.add(fairy.group);      // group は原点に置いたまま（動かさない・回さない）
//   毎フレーム：fairy.setPosition(p)（または fairy.moveTo(p, 秒)）→ fairy.update(dt, camera)
//   fairy.setTalking(true / false)、fairy.play('joy' | 'surprise' | 'point', { to })、fairy.setDark(0〜1)、fairy.setAlpha(0〜1)、fairy.dispose()
// 描くもの（4 回）：光の輪（板 1 枚）・体（1 つにまとめた形。手足と頭はシェーダーで動かす）・羽 4 枚（1 つ）・光の粉（点 72 個）。光（PointLight）は light: true のときだけ 1 つ
// 色の重ね方：「前もって掛けた色 ＋ かくす度合い」（ONE, 1 − α）。暗い世界では光として足し、昼は少しかくして形が読めるようにする（白飛びしない）
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angd = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

// ---- 形を 1 つにまとめる（part ＝ 0 胴・1 左うで・2 右うで・3 左足・4 右足・5 頭・6 目、pivot ＝ 回る中心）
function bake(list) {
  const pos = [], nor = [], part = [], piv = [], loc = [];
  for (const it of list) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo; if (g !== it.geo) it.geo.dispose();
    if (it.m) g.applyMatrix4(it.m);
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, pv = it.pivot || [0, 0, 0];
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); part.push(it.part || 0); piv.push(pv[0], pv[1], pv[2]);
      if (it.part === 6 && UV) loc.push(UV.getX(i) * 2 - 1, UV.getY(i) * 2 - 1); else loc.push(it.hair ? 2 : 0, 0);
    }
    it._n = P.count;      // この部品の頂点の数（あとで しるしを入れなおすとき用）
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); out.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3)); out.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 2));
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.03, 0), 0.3);
  return out;
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// 体：頭が大きめの小さな人の形（高さ 約 0.28。足先 −0.10 〜 おだんご 0.18）。前は +z
const NECK = [0, 0.066, 0], SHOULDER = 0.027, HIP = 0.013;
function bodyGeo() {
  const V2 = (x, y) => new THREE.Vector2(x, y), list = [];
  // 胴とスカート（回転体）：肩 → 胸 → 腰 → 花びらのように広がるすそ
  list.push({ geo: new THREE.LatheGeometry([V2(0, -0.043), V2(0.03, -0.047), V2(0.053, -0.052), V2(0.038, -0.028), V2(0.024, -0.004), V2(0.021, 0.014), V2(0.026, 0.034), V2(0.023, 0.05), V2(0.013, 0.061), V2(0, 0.064)], 14), part: 0 });
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 1;
    // うで（肩からまっすぐ下げた形で作り、シェーダーで回す）と手
    list.push({ geo: new THREE.CapsuleGeometry(0.0075, 0.046, 3, 8), m: M(s * SHOULDER, 0.046 - 0.03, 0), part: 1 + i, pivot: [s * SHOULDER, 0.046, 0] });
    list.push({ geo: new THREE.SphereGeometry(0.0098, 8, 6), m: M(s * SHOULDER, 0.046 - 0.062, 0), part: 1 + i, pivot: [s * SHOULDER, 0.046, 0] });
    // 足と足先
    list.push({ geo: new THREE.CapsuleGeometry(0.0085, 0.05, 3, 8), m: M(s * HIP, -0.038 - 0.03, 0), part: 3 + i, pivot: [s * HIP, -0.038, 0] });
    list.push({ geo: new THREE.SphereGeometry(0.0105, 8, 6), m: M(s * HIP, -0.038 - 0.064, 0.005, 0, 0, 0, 1, 0.8, 1.5), part: 3 + i, pivot: [s * HIP, -0.038, 0] });
    // とがった耳
    list.push({ geo: new THREE.ConeGeometry(0.011, 0.042, 8), m: M(s * 0.052, 0.116, -0.004, 0, 0, -s * 1.2), part: 5 });
  }
  list.push({ geo: new THREE.SphereGeometry(0.046, 18, 13), m: M(0, 0.108, 0, 0, 0, 0, 1, 0.96, 0.98), part: 5 });      // 頭
  list.push({ geo: new THREE.SphereGeometry(0.021, 10, 8), m: M(0, 0.158, -0.014), part: 5, hair: true });                       // おだんご
  // 目（顔の丸みにそわせた小さな板。光の中に、少しこい光がにじむ。顔のあとに描くので、いちばん最後に入れる）
  // （2026-11-10：顔のパーツは無し。目の板は作らない。シェーダーの目・まばたきの所は残してあるが、何も描かない）
  return bake(list);
}

// 羽 4 枚（上 2 枚が大きく、下 2 枚が小さい）。付け根を原点にした しずく形の板。はばたきはシェーダー
function wingGeo() {
  const SEG = 9, pos = [], uv = [], info = [], idx = [];
  for (const side of [1, -1]) for (const up of [1, 0]) {
    const L = up ? 0.165 : 0.1, W = up ? 0.052 : 0.034, tilt = up ? 0.62 : -0.66, base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 0.8);
      for (let j = -1; j <= 1; j++) {
        const x = L * u, y = j * w + w * (up ? 0.3 : -0.25), c = Math.cos(tilt), s = Math.sin(tilt);
        pos.push(side * (x * c - y * s), x * s + y * c, 0); uv.push(u, j); info.push(side, up);
      }
      if (i < SEG) for (let j = 0; j < 2; j++) { const a = base + i * 3 + j; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(info, 2));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.04, 0), 0.3);
  return g;
}

const ROT = `
  mat3 rX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 rY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }`;

export function createFairy(opts = {}) {
  const S = opts.scale ?? 1, RO = opts.renderOrder ?? 20, xray = !!opts.xray, DUST = opts.dust ?? 72, lightMax = opts.lightIntensity ?? 2.4;
  const premul = { transparent: true, fog: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const C = (h) => new THREE.Color(h);
  // 色（昼 → 真っ暗）。あたたかい白〜うす金 ＝ 太陽のかけらの仲間
  const COL = { core: [C('#fffdf2'), C('#fffdf2')], rim: [C('#ffcf62'), C('#ffe09a')], wing: [C('#fff0c4'), C('#fff8e6')], hair: [C('#fffdf2'), C('#fffdf2')], eye: [C('#e39a36'), C('#f0ae4c')] };
  const U = {
    uT: { value: 0 }, uA: { value: 1 }, uDark: { value: 0 }, uPos: { value: new THREE.Vector3() },
    cCore: { value: C('#ffe3a0') }, cRim: { value: C('#d98a2a') }, cEye: { value: C('#6a3408') }, cHair: { value: C('#f2a53a') }, cWing: { value: C('#ffeec6') }, cGlow: { value: C('#ffe29a') }, cOrb: { value: C('#fff3d2') },
    uLimb: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uHead: { value: new THREE.Vector3() }, uBlink: { value: 0 }, uEye: { value: 1 }, uSquash: { value: new THREE.Vector3(1, 1, 1) },
    uFlap: { value: new THREE.Vector2() }, uSweep: { value: 0.5 }, uAmp: { value: 0.55 }, uSize: { value: 0.42 * S }, uPx: { value: 800 }, uPR: { value: 1 }, uScale: { value: S },
  };

  // ---- 体
  const bodyMat = new THREE.ShaderMaterial({ ...premul, uniforms: U, depthWrite: true,
    vertexShader: `attribute float aPart; attribute vec3 aPivot; attribute vec2 aLocal;
      uniform vec2 uLimb[4]; uniform vec3 uHead, uSquash; uniform float uBlink, uEye;
      varying vec3 vN, vV; varying vec2 vLocal; varying float vPart, vUp, vHair; ${ROT}
      void main(){
        vec3 p = position, n = normal;
        if (aPart > 0.5 && aPart < 4.5) { vec2 r = uLimb[int(aPart + 0.5) - 1]; mat3 R = rZ(r.y) * rX(r.x); p = aPivot + R * (p - aPivot); n = R * n; }
        else if (aPart > 4.5) {
          if (aPart > 5.5) { vec3 l = p - aPivot; l.y *= 1.0 - 0.9 * uBlink; l *= uEye; p = aPivot + l; }
          mat3 R = rY(uHead.y) * rX(uHead.x) * rZ(uHead.z); vec3 neck = vec3(${NECK.map((v) => v.toFixed(4)).join(', ')}); p = neck + R * (p - neck); n = R * n;
        }
        vHair = aPart > 4.5 && aPart < 5.5 ? (aLocal.x > 1.5 ? 1.0 : smoothstep(0.1, 0.42, normal.y * 0.85 - normal.z * 0.75)) : 0.0;      // 頭の上とうしろ ＝ 髪
        p *= uSquash; vUp = n.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalMatrix * n; vV = -mv.xyz; vLocal = aLocal; vPart = aPart; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 cCore, cRim, cEye, cHair; uniform float uA, uDark; varying vec3 vN, vV; varying vec2 vLocal; varying float vPart, vUp, vHair;
      void main(){
        // 光そのものの体：影やかげりは付けない。まん中は白く明るく、ふちへ向かって金色になり、やわらかくすけてにじむ
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV))), fr = pow(f, 1.7);
        vec3 col = mix(mix(cCore, cHair, vHair * 0.35), cRim, fr);
        float a = mix(1.0, mix(0.55, 0.3, uDark), pow(f, 2.4));      // 昼はふちを少し残す ＝ 明るい背景でも形が消えない
        if (vPart > 5.5) {                                           // 目：光の中に、少しこい光が 2 つ（ふちはにじむ）
          float e = smoothstep(1.0, 0.3, length(vLocal)); col = mix(cCore, cEye, e * 0.92); a = 1.0; }
        a *= uA;
        // 強く光る体：色を白とびするまで足し、うしろの光のにじみも半分すかす ＝ 光のかたまりの中に、形がうっすら分かる
        gl_FragColor = vec4(col * a * 1.4, a * 0.55);
        #include <colorspace_fragment>
      }` });
  const bodyGeom = bodyGeo(), bodyMesh = new THREE.Mesh(bodyGeom, bodyMat); bodyMesh.renderOrder = RO + 1; bodyMesh.name = 'sun_fairy_body';

  // ---- 羽
  const wingMat = new THREE.ShaderMaterial({ ...premul, uniforms: U, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aUv, aWing; uniform vec2 uFlap; uniform float uSweep, uAmp; varying vec2 vUv; varying vec3 vN, vV; varying float vSide; ${ROT}
      void main(){
        float fl = mix(uFlap.y, uFlap.x, aWing.y), a = aWing.x * (uSweep + uAmp * fl * (0.5 + 0.5 * aUv.x));      // 付け根を軸に前後へはばたく。先のほうが大きくしなる
        mat3 R = rY(a); vec3 p = R * position + vec3(aWing.x * 0.007, mix(0.03, 0.044, aWing.y), -0.024);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalMatrix * (R * vec3(0.0, 0.0, 1.0)); vV = -mv.xyz; vUv = aUv; vSide = aWing.x; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 cWing; uniform float uA, uDark, uT; uniform vec2 uFlap; varying vec2 vUv; varying vec3 vN, vV; varying float vSide;
      void main(){
        float u = vUv.x, v = vUv.y, ndv = abs(dot(normalize(vN), normalize(vV)));
        float edge = smoothstep(0.5, 1.0, abs(v)) + smoothstep(0.8, 1.0, u) * 0.6;
        float vein = pow(1.0 - abs(sin(v * 2.6 + u * 4.2)), 7.0) * (1.0 - 0.6 * u);                 // 付け根から広がる すじ
        float hue = u * 0.6 + v * 0.14 * vSide + (1.0 - ndv) * 0.8 + uT * 0.05 + uFlap.x * 0.06;      // 見る角度とはばたきで色が流れる ＝ 虹色のきらめき
        vec3 rb = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.33, 0.67)));
        float sp = pow(max(sin(u * 21.0 + uT * 6.0) * sin(v * 4.0 - uT * 4.4 + u * 9.0), 0.0), 14.0);
        // 光ですきとおる羽：色はほぼ白金。虹色は、ななめから見た所とふちに うっすら。ふちとすじが光り、ところどころ きらめく
        vec3 col = mix(cWing, rb, mix(0.3, 0.2, uDark) + 0.22 * (1.0 - ndv)) + sp * 0.9;
        float a = (mix(0.22, 0.13, uDark) + mix(0.55, 0.45, uDark) * min(edge, 1.0) + 0.2 * vein + sp * 0.85) * smoothstep(0.0, 0.1, u);
        a = min(a, 1.0) * uA;
        gl_FragColor = vec4(col * a * 1.3, a * mix(0.4, 0.15, uDark));
        #include <colorspace_fragment>
      }` });
  const wingGeom = wingGeo(), wingMesh = new THREE.Mesh(wingGeom, wingMat); wingMesh.renderOrder = RO + 2; wingMesh.name = 'sun_fairy_wings';

  // ---- 光の輪（カメラを向く板。遠くでは、板を見かけの大きさで保ち、光の玉 ＋ 羽のきらめきを足す ＝ 遠くの目印）
  const haloMat = new THREE.ShaderMaterial({ ...premul, uniforms: U, depthWrite: false, depthTest: !xray,
    vertexShader: `uniform vec3 uPos; uniform float uSize; varying vec2 vP; varying float vFar;
      void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); float d = -mv.z; vFar = smoothstep(4.5, 13.0, d);
        mv.xy += position.xy * max(uSize, d * 0.058); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 cGlow, cOrb; uniform float uA, uDark, uT; uniform vec2 uFlap; varying vec2 vP; varying float vFar;
      void main(){
        float d = length(vP); if (d >= 1.0) discard;
        float g = (pow(1.0 - d, 3.0) * 0.78 + pow(1.0 - d, 1.6) * 0.2) * (0.94 + 0.06 * sin(uT * 2.3));      // 以前の光の玉と同じくらいの広さ・強さのにじみ
        float core = smoothstep(0.25, 0.03, d) * vFar, fl = 0.5 + 0.5 * uFlap.x;
        vec2 q = vec2(abs(vP.x), vP.y);
        vec2 w1 = vec2((q.x - 0.15 - 0.2 * fl) / (0.1 + 0.22 * fl), (q.y - 0.17 - 0.35 * (q.x - 0.2)) / 0.27);
        vec2 w2 = vec2((q.x - 0.11 - 0.12 * fl) / (0.07 + 0.14 * fl), (q.y + 0.15 + 0.35 * (q.x - 0.15)) / 0.17);
        float wing = (smoothstep(1.0, 0.45, length(w1)) + 0.75 * smoothstep(1.0, 0.45, length(w2))) * vFar;
        vec3 irid = 0.5 + 0.5 * cos(6.2832 * (q.x * 1.4 + q.y * 0.6 + uT * 0.2 + vec3(0.0, 0.33, 0.67)));
        vec3 orb = mix(mix(cGlow, cOrb, smoothstep(0.2, 0.0, d)), cOrb, uDark);      // 昼の玉は、ふちを金色に（明るい空の前でも白にまぎれない）
        float bloom = exp(-d * d * 9.0) * (1.0 - vFar);                                  // 体のすぐまわりの強いにじみ（体が光を出して見える）
        // 昼は金色のにじみにとどめる（白い体が、金色の光の中にうっすら分かる）。真っ暗では、まん中が白くとぶ
        vec3 col = cGlow * g * mix(0.85, 1.0, uDark) + mix(cGlow, vec3(1.0, 1.0, 0.96), 0.6 * uDark) * bloom * mix(0.45, 1.15, uDark) + orb * core * 1.25 + mix(cOrb, irid, mix(0.6, 0.45, uDark)) * wing * mix(0.8, 0.62, uDark);
        // 昼は、にじみで背景を少しかくして金色にそめる ＝ 白い空や雲の前でも、白飛びせずに金色の光として見える。真っ暗では足すだけ
        float occ = (clamp(core * 0.9 + wing * 0.4, 0.0, 1.0) * (1.0 - 0.85 * uDark) + (g * 0.9 + bloom * 0.55) * 0.62 * (1.0 - uDark));
        occ = clamp(occ, 0.0, 1.0);
        gl_FragColor = vec4(col * uA, occ * uA);
        #include <colorspace_fragment>
      }` });
  const haloGeom = new THREE.PlaneGeometry(2, 2), halo = new THREE.Mesh(haloGeom, haloMat); halo.frustumCulled = false; halo.renderOrder = RO; halo.name = 'sun_fairy_halo';

  // ---- 光の粉（動いたあとに残り、ゆっくり落ちて消える）
  const dPos = new Float32Array(DUST * 3), dVel = new Float32Array(DUST * 3), dBirth = new Float32Array(DUST * 2).fill(-100);
  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dustGeom.setAttribute('aVel', new THREE.BufferAttribute(dVel, 3)); dustGeom.setAttribute('aBirth', new THREE.BufferAttribute(dBirth, 2));
  const dustMat = new THREE.ShaderMaterial({ ...premul, uniforms: U, depthWrite: false, depthTest: !xray,
    vertexShader: `attribute vec3 aVel; attribute vec2 aBirth; uniform float uT, uPx, uPR, uScale; varying float vK, vSeed;
      void main(){
        float age = uT - aBirth.x, life = 1.3 + 0.9 * aBirth.y, k = age / life; vK = k; vSeed = aBirth.y;
        vec3 p = position + aVel * (1.0 - exp(-age * 2.2)) / 2.2;
        p.y -= (0.09 * age + 0.07 * age * age) * uScale; p.x += sin(age * 3.0 + aBirth.y * 40.0) * 0.022 * uScale; p.z += cos(age * 2.6 + aBirth.y * 17.0) * 0.022 * uScale;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float s = (0.03 + 0.03 * aBirth.y) * uScale * (1.0 - 0.55 * k) * uPx / max(-mv.z, 0.05);
        gl_PointSize = clamp(s, 2.5 * uPR, 0.045 * uPx);
        // 寿命の外（まだ出ていない・消えたあと）の粒は、画面の外へ出して描かない。大きさ 0 だけだと、機種によって 1 px の点として残る
        if (!(k >= 0.0 && k < 1.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vK = 1.0; } }`,
    fragmentShader: `uniform float uT, uDark; varying float vK, vSeed;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0; if (d >= 1.0 || vK < 0.0 || vK >= 1.0) discard;      // 寿命の外は描かない（負の数の pow で黒い点になるのも防ぐ）
        float a = (pow(1.0 - d, 2.2) + smoothstep(0.35, 0.0, d) * 0.6) * pow(clamp(1.0 - vK, 0.0, 1.0), 1.3) * (0.62 + 0.38 * sin(uT * 9.0 + vSeed * 50.0));
        vec3 col = mix(vec3(1.0, 0.97, 0.84), vec3(1.0, 0.76, 0.34), fract(vSeed * 7.3) * mix(1.0, 0.7, uDark));
        gl_FragColor = vec4(col * a, a * 0.55 * (1.0 - uDark));
        #include <colorspace_fragment>
      }` });
  const dust = new THREE.Points(dustGeom, dustMat); dust.frustumCulled = false; dust.renderOrder = RO + 3; dust.name = 'sun_fairy_dust';
  const _sz = new THREE.Vector2();
  dust.onBeforeRender = (renderer, _s, cam) => {      // 粒の大きさを、今描いている画面の高さに合わせる
    const rt = renderer.getRenderTarget(), h = rt ? rt.height : renderer.getDrawingBufferSize(_sz).y;
    U.uPx.value = h * cam.projectionMatrix.elements[5] * 0.5; U.uPR.value = h / 800;
  };
  let dI = 0, dAcc = 0;
  function spawn(x, y, z, vx, vy, vz) {
    const i = dI; dI = (dI + 1) % DUST;
    dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z; dVel[i * 3] = vx; dVel[i * 3 + 1] = vy; dVel[i * 3 + 2] = vz; dBirth[i * 2] = T; dBirth[i * 2 + 1] = Math.random();
    dustGeom.attributes.position.needsUpdate = true; dustGeom.attributes.aVel.needsUpdate = true; dustGeom.attributes.aBirth.needsUpdate = true;
  }

  // ---- 組み立て：group（原点のまま）＞ mover（場所）＞ body（ふわふわ・向き・しぐさ）＞ 体・羽。光の輪と粉は group の直下（世界の座標で描く）
  const group = new THREE.Group(); group.name = 'sun_fairy';
  const mover = new THREE.Group(), body = new THREE.Group(); body.rotation.order = 'YXZ'; body.scale.setScalar(S);
  body.add(bodyMesh, wingMesh); mover.add(body); group.add(halo, mover, dust);
  let light = null;
  function setLight(on) {      // 光は 1 つだけ。切るときは強さ 0（シーンから外さない ＝ ほかの材質の作りなおしが起きない）
    if (on && !light) { light = new THREE.PointLight(0xffdfa0, 0, 7 * Math.max(S, 0.6), 2); light.name = 'sun_fairy_light'; body.add(light); }
    lightOn = !!on;
  }

  // ---- 状態
  let T = 0, alpha = 1, dark = -1, lightOn = false, talking = false, talkK = 0, yaw = 0, yawInit = false, flap = 0, blinkAt = 2.5, blinkT = -1, mv = null, ges = null, warp = true, arcSide = 1;
  const anchor = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3(), ofs = new THREE.Vector3(), world = new THREE.Vector3(), lean = new THREE.Vector2(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();

  function setDark(v) {
    v = clamp(v, 0, 1); if (v === dark) return; dark = v; U.uDark.value = v;
    U.cCore.value.lerpColors(COL.core[0], COL.core[1], v); U.cRim.value.lerpColors(COL.rim[0], COL.rim[1], v); U.cWing.value.lerpColors(COL.wing[0], COL.wing[1], v); U.cHair.value.lerpColors(COL.hair[0], COL.hair[1], v); U.cEye.value.lerpColors(COL.eye[0], COL.eye[1], v);
  }
  function setAlpha(a) { alpha = clamp(a, 0, 1); U.uA.value = alpha; }
  // 場所をそのまま決める（毎フレーム呼んでよい。動いた速さから、向き・かたむき・光の粉が決まる）。warpTo ＝ 尾を引かずに、その場所へ飛ぶ
  function setPosition(p) { mv = null; anchor.copy(p); }
  function warpTo(p) { mv = null; anchor.copy(p); warp = true; }
  // 曲線をえがいて p へ飛ぶ。止まるときに少し行きすぎて、もどる。sec を省くと、遠さから決める
  function moveTo(p, sec, o = {}) {
    const dist = anchor.distanceTo(p), arc = o.arc ?? 1; if (dist < 1e-4) { mv = null; return api; }
    arcSide = o.side ?? -arcSide;
    _d.subVectors(p, anchor); const side = _v.set(-_d.z, 0, _d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const p1 = anchor.clone().lerp(p, 0.5).addScaledVector(side, Math.min(dist * 0.24, 1.6) * arcSide * arc); p1.y += Math.min(dist * 0.14, 1.0) * arc;
    const over = Math.min(0.1, 0.32 * S / dist) * (o.overshoot ?? 1);      // 行きすぎる量（道のりの 10% まで、長い道では 約 0.3 m）
    mv = { p0: anchor.clone(), p1, p2: p.clone ? p.clone() : new THREE.Vector3().copy(p), t: 0, sec: sec ?? clamp(0.55 + dist / 3.4, 0.6, 4.5), c: 1.70158 * Math.pow(over / 0.1, 0.6), done: o.onArrive || null };
    return api;
  }
  function setTalking(b) { talking = !!b; }
  // しぐさ：'joy'（くるっと回る）/ 'surprise'（びくっと下がる）/ 'point'（o.to ＝ 行き先。そのほうへ少し飛んで、もどる）
  function play(name, o = {}) {
    const dur = { joy: 1.15, surprise: 1.05, point: 1.6 }[name]; if (!dur) return api;
    ges = { name, t: 0, dur, dir: null };
    if (name === 'point') { ges.dir = new THREE.Vector3(); if (o.to) ges.dir.subVectors(o.to, anchor); ges.to = !!o.to; }
    if (name === 'joy') burst(16, 0.55);
    return api;
  }
  function burst(n, sp) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.4, r = sp * S * (0.6 + 0.6 * Math.random()); spawn(world.x, world.y + 0.03 * S, world.z, Math.cos(a) * r, (0.25 + Math.random() * 0.5) * S, Math.sin(a) * r); } }

  function update(dt, camera) {
    dt = clamp(dt || 0, 0, 0.1); T += dt; U.uT.value = T;
    if (dark < 0) setDark(opts.dark ?? 0);
    // 移動（曲線 ＋ 行きすぎてもどる）
    if (mv) {
      mv.t += dt; const u = Math.min(mv.t / mv.sec, 1), v = u * u * (3 - 2 * u), e = 1 + (mv.c + 1) * Math.pow(v - 1, 3) + mv.c * Math.pow(v - 1, 2), k = 1 - e;
      anchor.set(0, 0, 0).addScaledVector(mv.p0, k * k).addScaledVector(mv.p1, 2 * k * e).addScaledVector(mv.p2, e * e);
      if (u >= 1) { anchor.copy(mv.p2); const f = mv.done; mv = null; if (f) f(); }
    }
    if (warp || dt <= 0) { prev.copy(anchor); vel.set(0, 0, 0); if (dt > 0) warp = false; }
    else { _v.subVectors(anchor, prev).divideScalar(dt); if (_v.lengthSq() > 900) _v.set(0, 0, 0); vel.lerp(_v, 1 - Math.exp(-dt * 12)); prev.copy(anchor); }
    mover.position.copy(anchor);
    if (!group.visible) return;
    const speed = vel.length(), cam = camera ? camera.getWorldPosition(_c) : _c.set(anchor.x, anchor.y, anchor.z + 1);
    talkK += ((talking ? 1 : 0) - talkK) * (1 - Math.exp(-dt * 9));

    // しぐさ
    let spin = 0, armUp = 0, armOut = 0, pointK = 0, eye = 1, squint = 0, sqY = 1, flapAdd = 0, sweep = 0.5, gy = 0, gBack = 0, shake = 0;
    if (ges) {
      ges.t += dt; const t = ges.t, u = Math.min(t / ges.dur, 1);
      if (ges.name === 'joy') { spin = TAU * ease(Math.min(t / 0.8, 1)); gy = Math.sin(Math.PI * u) * 0.09; armUp = Math.pow(Math.sin(Math.PI * u), 0.6); squint = sstep(t, 0.05, 0.2) * (1 - sstep(t, 0.85, 1.05)) * 0.72; flapAdd = 7 * (1 - u);
        if (t - dt < 0.45 && t >= 0.45) burst(10, 0.4); }
      else if (ges.name === 'surprise') { const env = (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 3.6)) * (1 - sstep(t, 0.75, 1.05));
        gBack = 0.19 * env; gy = 0.045 * env; shake = Math.sin(t * 58) * 0.007 * env * (1 - sstep(t, 0.15, 0.5)); sqY = 1 + 0.17 * env; armOut = env; eye = 1 + 0.42 * env; flapAdd = 9 * env; sweep = 0.5 - 0.42 * env; }
      else { pointK = t < 0.45 ? ease(t / 0.45) : t < 1.0 ? 1 : 1 - ease(Math.min((t - 1.0) / 0.6, 1)); if (t >= 0.45 && t < 1.0) gy = Math.abs(Math.sin((t - 0.45) * Math.PI / 0.275)) * 0.035; flapAdd = 4 * pointK;
        if (!ges.to) { ges.dir.subVectors(anchor, cam); ges.to = true; } }
      if (ges.t >= ges.dur) ges = null;
    }

    // 向き：ふだんはプレイヤー（カメラ）のほう。速く飛ぶ間は進むほうへ、指す間は行き先のほうへ
    let yawT = Math.atan2(cam.x - anchor.x, cam.z - anchor.z), free = 1;
    if (speed > 0.5) { const w = sstep(speed, 0.8, 3.0) * 0.8; yawT += angd(Math.atan2(vel.x, vel.z) - yawT) * w; free -= w; }
    if (pointK > 0 && ges && ges.dir.lengthSq() > 1e-6) { yawT += angd(Math.atan2(ges.dir.x, ges.dir.z) - yawT) * pointK * 0.85; free *= 1 - pointK; }
    if (!yawInit) { yaw = yawT; yawInit = true; } else yaw += angd(yawT - yaw) * (1 - Math.exp(-dt * 7));
    const fx = Math.sin(yaw), fz = Math.cos(yaw);

    // ふわふわ（待機）・ぴょこぴょこ（話す）・しぐさのずれ
    const hop = Math.abs(Math.sin(T * 8.2)) * 0.034 * talkK;
    ofs.set(Math.sin(T * 0.9) * 0.012, Math.sin(T * 2.1) * 0.02 + Math.sin(T * 1.3 + 1) * 0.009 + hop + gy, Math.cos(T * 0.7) * 0.008).multiplyScalar(S);
    ofs.x += (-fx * gBack + fz * shake) * S; ofs.z += (-fz * gBack - fx * shake) * S;
    if (pointK > 0 && ges) { _d.copy(ges.dir); _d.y = clamp(_d.y, -0.4 * _d.length(), 0.4 * _d.length()); if (_d.lengthSq() > 1e-6) ofs.addScaledVector(_d.normalize(), 0.42 * S * pointK); }
    body.position.copy(ofs); world.addVectors(anchor, ofs); U.uPos.value.copy(world);

    // 体のかたむき（進むほうへ前のめり、横へ動くとかたむく）
    const fwd = vel.x * fx + vel.z * fz, sd = vel.x * fz - vel.z * fx, kL = 1 - Math.exp(-dt * 8);
    lean.x += (clamp(fwd * 0.16, -0.45, 0.6) - lean.x) * kL; lean.y += (clamp(-sd * 0.14, -0.4, 0.4) - lean.y) * kL;
    body.rotation.set(lean.x + 0.1 * pointK - 0.9 * (sqY - 1), yaw + spin, lean.y);
    U.uSquash.value.set(1 - (sqY - 1) * 0.45, sqY, 1 - (sqY - 1) * 0.45);

    // 手足・頭
    const L = U.uLimb.value, tk = talkK, trail = clamp(fwd * 0.22, -0.3, 0.75);
    const aIdle = 0.46 + 0.07 * Math.sin(T * 1.7), aL = aIdle + tk * (0.4 + 0.34 * Math.sin(T * 6.1)) + 1.95 * armUp + 1.15 * armOut, aR = aIdle + tk * (0.4 + 0.34 * Math.sin(T * 6.1 + 2.2)) + 1.95 * armUp + 1.15 * armOut;
    L[0].set((0.1 * Math.sin(T * 1.3) + trail * 0.8 - 0.55 * tk) * (1 - pointK) - 1.45 * pointK, aL * (1 - pointK) + 0.12 * pointK);
    L[1].set(0.1 * Math.sin(T * 1.3 + 1.2) + trail * 0.8 - 0.55 * tk, -aR);
    L[2].set(0.16 * Math.sin(T * 1.9) + trail + 0.25 * armUp, 0.07 + 0.2 * armOut);
    L[3].set(0.16 * Math.sin(T * 1.9 + 2.0) + trail + 0.5 * armUp, -0.07 - 0.2 * armOut);
    const dxz = Math.hypot(cam.x - world.x, cam.z - world.z), up = Math.atan2(cam.y - (world.y + 0.1 * S), Math.max(dxz, 0.05));
    U.uHead.value.set(clamp(-up * 0.6, -0.45, 0.45) * free + 0.1 * Math.sin(T * 8.2) * tk - 0.12 * armUp - 0.1 * armOut, 0.06 * Math.sin(T * 0.8), 0.1 * Math.sin(T * 2.7) * tk + 0.05 * Math.sin(T * 1.1));

    // まばたき
    if (blinkT < 0 && T >= blinkAt) blinkT = 0;
    let bl = 0; if (blinkT >= 0) { blinkT += dt; bl = Math.sin(Math.PI * Math.min(blinkT / 0.16, 1)); if (blinkT >= 0.16) { blinkT = -1; blinkAt = T + 2.2 + Math.random() * 3 - (Math.random() < 0.2 ? 2 : 0); } }
    U.uBlink.value = eye > 1.02 ? 0 : Math.max(bl, squint); U.uEye.value = eye;

    // 羽ばたき（話す・飛ぶ・しぐさで速くなる）
    flap += dt * TAU * (9.5 + 7.5 * talkK + Math.min(speed, 4) * 1.2 + flapAdd);
    U.uFlap.value.set(Math.sin(flap), Math.sin(flap - 0.7)); U.uSweep.value = sweep; U.uAmp.value = 0.55 + 0.1 * talkK;

    // 光の粉：動くほど多く出る。止まっていても、ときどきこぼれる
    if (alpha > 0.25) {
      dAcc += (Math.min(speed * 16, 46) + 2.5 + 10 * talkK * 0.3) * dt;
      while (dAcc >= 1) { dAcc -= 1; const r = () => (Math.random() - 0.5) * 2;
        spawn(world.x + r() * 0.045 * S, world.y + (r() * 0.05 - 0.01) * S, world.z + r() * 0.045 * S, -vel.x * 0.12 + r() * 0.07 * S, -vel.y * 0.12 + r() * 0.05 * S, -vel.z * 0.12 + r() * 0.07 * S); }
    }
    if (light) light.intensity = lightOn ? lightMax * alpha * (0.12 + 0.88 * dark) * (0.95 + 0.05 * Math.sin(T * 2.3)) : 0;
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    [bodyGeom, wingGeom, haloGeom, dustGeom].forEach((g) => g.dispose()); [bodyMat, wingMat, haloMat, dustMat].forEach((m) => m.dispose());
    if (light) { body.remove(light); light.dispose(); light = null; }
  }

  const api = { group, update, setPosition, warpTo, moveTo, setTalking, play, setDark, setAlpha, setLight, dispose,
    get position() { return anchor; }, get worldPosition() { return world; }, get moving() { return !!mv; }, get gesture() { return ges ? ges.name : null; }, get talking() { return talking; }, get light() { return light; },
    uniforms: U };
  setDark(opts.dark ?? 0); setLight(!!opts.light);
  return api;
}

// ================================================================================================
// 光の玉の妖精（人の形にしない案。2026-11-10）。どれも「カメラを向く板 1 枚（形はシェーダー）＋ 光の粉」＝ 描く回数 2
//   createOrbClassic   … A 今のゲームの光の玉（sun_game.js の妖精と同じシェーダー。くらべる用）
//   createOrbDragonfly … B トンボの羽：小さな芯 ＋ 細い胴 ＋ 細長い羽 4 枚（光のふちとすじ）。細かくはばたく
//   createOrbButterfly … C 蝶の羽：芯 ＋ 細い胴と触角 ＋ 羽 2 対（光のふちとすじ）。ゆっくり羽をとじてひらく
//   createOrbSeed      … D 綿毛：芯から細い光の糸が かさのように広がり、ゆっくり回る。下に小さな種
//   createOrbRings     … E 光の輪：芯のまわりを、細い光の輪 2 本と光の粒が ゆっくり回る
//   createOrb(style, opts) … 名前（'A'〜'E'）で作る
// 呼び方は createFairy と同じ：{ group, update(dt, camera), setPosition, warpTo, moveTo, setTalking, play('joy'|'surprise'|'point'), setDark, setAlpha, setLight, dispose }
// 色の重ね方：A は今のゲームと同じ足し算。B〜E は「前もって掛けた色 ＋ かくす度合い」＝ 真っ暗では光として足し、昼は金色の線が背景を少しかくす（白いかたまりにならない）
const ORB_VS = `uniform vec3 uPos; uniform float uSize, uMinK; varying vec2 vP; varying float vFar;
  void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); float d = -mv.z, h = max(uSize, d * uMinK);
    vFar = clamp(h / uSize - 1.0, 0.0, 1.0); mv.xy += position.xy * h; gl_Position = projectionMatrix * mv; }`;      // 遠くでも見かけの大きさを保つ（目印）
const ORB_HEAD = `uniform float uA, uDark, uT, uFlap, uSpin, uRoll, uPulse, uTalk, uBreath; uniform vec3 cCore, cLine, cGlow; varying vec2 vP; varying float vFar;
  vec3 E; float O, PX, WK;
  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  float ell(vec2 q, vec2 ab){ vec2 k = q / ab; float l = length(k); vec2 g = k / (ab * max(l, 1e-4)); return (l - 1.0) / max(length(g), 1e-4); }
  float ellM(vec2 qs, mat2 M, vec2 c, vec2 ab){ vec2 q = M * qs - c, k = q / ab; float l = length(k); vec2 g = transpose(M) * (k / (ab * max(l, 1e-4))); return (l - 1.0) / max(length(g), 1e-4); }      // 形をゆがめた楕円の、画面での距離
  float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0); return length(pa - ba * h); }
  float ln(float d, float w){ float ww = max(w, PX * 0.7); return (1.0 - smoothstep(ww, ww + PX * 1.3, abs(d))) * min(1.0, 0.4 + 1.2 * w / ww); }      // 光の線（1 画素より細くしない）
  float dotc(float r, float rr){ return 1.0 - smoothstep(rr, rr + PX * 1.4, r); }
  void put(float cov, vec3 col, float occ){ E += col * cov; O = max(O, cov * occ); }
`;
const ORB_MAIN = `
  void main(){
    float d = length(vP); if (d >= 1.0) discard;
    PX = fwidth(vP.x); WK = 1.0 + 1.3 * vFar;      // 遠いほど線を太く（形が消えない） E = vec3(0.0); O = 0.0;
    vec2 p = rot(uRoll) * vP;
    float occL = mix(0.9, 0.06, uDark);
    float g = pow(1.0 - d, 2.6), g2 = exp(-d * d * 14.0);      // まわりのにじみ（広く・うすく）＋ 芯のまわり
    E += cGlow * (g * mix(0.16, 0.42, uDark) + g2 * mix(0.05, 0.3, uDark)) * (1.0 + 0.7 * uPulse); O = max(O, g * 0.16 * (1.0 - uDark));
    shape(p, occL);
    float r = length(p - CORE);
    E += cCore * (exp(-r * r / 0.0035) * mix(0.6, 1.25, uDark) + exp(-r * r / 0.018) * mix(0.1, 0.22, uDark)) * (1.0 + 0.6 * uPulse + 0.25 * uTalk);      // 昼は、芯のまわりを白くとばしすぎない
    put(dotc(r, 0.03 * (1.0 + 0.25 * uPulse)), mix(cCore, cLine, smoothstep(0.012, 0.03, r) * (1.0 - uDark) * 0.75), mix(1.0, 0.25, uDark));      // 芯（昼はふちを金色に）
    gl_FragColor = vec4(E * uA, clamp(O, 0.0, 1.0) * uA);
    #include <colorspace_fragment>
  }`;

const ORB_STYLES = {
  // ---- B トンボの羽
  B: { name: 'dragonfly', size: 0.5, flap: [7, 10.5], spin: 0, roll: 0.2, glsl: `
  const vec2 CORE = vec2(0.0, 0.055);
  void wing(vec2 p, float s, float up, float occL){
    float ph = up > 0.5 ? uFlap : uFlap - 1.7, sw = sin(ph);
    float ang = (up > 0.5 ? 0.2 : -0.2) + 0.3 * sw, f = 0.88 + 0.12 * cos(ph);      // 付け根を軸に上下にはばたく（手前・奥へのかたむきで少し短く見える）
    float L = up > 0.5 ? 0.62 : 0.55, W = up > 0.5 ? 0.07 : 0.064;
    vec2 qs = p - vec2(s * 0.02, up > 0.5 ? 0.075 : 0.05);
    mat2 M = rot(-ang) * mat2(s / f, 0.0, 0.0, 1.0);
    vec2 q = M * qs; float t = clamp(q.x / L, 0.0, 1.0);
    float dd = ellM(qs, M, vec2(L * 0.52, -W * 0.12), vec2(L * 0.5, W));
    float ins = 1.0 - smoothstep(-PX, PX, dd);
    vec3 iri = 0.62 + 0.38 * cos(6.2832 * (t * 0.8 + uT * 0.05 + s * 0.13 + vec3(0.0, 0.33, 0.67)));
    vec3 lc = mix(cLine, iri, 0.16 * uDark + 0.08);
    float sheen = exp(-pow((t - fract(uT * 0.33 + s * 0.21 + up * 0.5)) * 7.0, 2.0)) * ins;      // 光が羽の上を流れる
    put(ins * (0.06 + 0.08 * t) + sheen * 0.22, mix(cLine, cCore, 0.55), mix(0.3, 0.0, uDark));      // すきとおった膜
    put(ln(dd, 0.005 * WK), lc, occL);                                                                 // 羽のふち
    put(ln(seg(q, vec2(0.02, -W * 0.05), vec2(L * 0.95, -W * 0.12)), 0.0028 * WK) * ins * (1.0 - 0.5 * t) * f, lc, occL * 0.8);      // まんなかの すじ（近似）
    put(1.0 - smoothstep(-PX, PX, ellM(qs, M, vec2(L * 0.86, W * 0.42), vec2(0.03, 0.011))), cCore, occL);      // 羽の先の小さな光（トンボの羽の しるし）
  }
  void shape(vec2 p, float occL){
    float bw = mix(0.0035, 0.012, smoothstep(-0.36, 0.02, p.y));
    put(ln(seg(p, vec2(0.0, -0.38), vec2(0.0, 0.07)), bw * WK), mix(cLine, cCore, 0.4), occL);      // 細い胴
    wing(p, -1.0, 0.0, occL); wing(p, 1.0, 0.0, occL); wing(p, -1.0, 1.0, occL); wing(p, 1.0, 1.0, occL);
  }` },
  // ---- C 蝶の羽
  C: { name: 'butterfly', size: 0.5, flap: [1.6, 2.6], spin: 0, roll: 0.25, glsl: `
  const vec2 CORE = vec2(0.0, 0.03);
  void bwing(vec2 p, float s, float fore, float f, float occL){
    float ang = fore > 0.5 ? 0.6 : -0.75, off = fore > 0.5 ? 0.24 : 0.16;
    vec2 ab = fore > 0.5 ? vec2(0.26, 0.15) : vec2(0.18, 0.125);
    vec2 qs = p - vec2(s * 0.01, fore > 0.5 ? 0.04 : 0.01);
    mat2 M = rot(-ang) * mat2(s / f, 0.0, 0.0, 1.0), Mi = inverse(M);
    float dd = ellM(qs, M, vec2(off, 0.0), ab);
    float ins = 1.0 - smoothstep(-PX, PX, dd);
    vec2 q = M * qs; float t = clamp(q.x / (off + ab.x), 0.0, 1.0);
    float sheen = exp(-pow((t - fract(uT * 0.25 + s * 0.3 + fore * 0.5)) * 6.0, 2.0)) * ins;
    put(ins * (0.07 + 0.07 * t) + sheen * 0.2, mix(cLine, cCore, 0.55), mix(0.3, 0.0, uDark));
    put(ln(dd, 0.0055 * WK), cLine, occL);
    for (int i = 0; i < 3; i++) {                                                                      // 付け根から広がる すじ 3 本
      float th = -0.75 + 0.75 * float(i);
      vec2 e = Mi * vec2(off + ab.x * cos(th) * 0.92, ab.y * sin(th) * 0.92);
      put(ln(seg(qs, vec2(0.0), e), 0.0026 * WK) * (0.55 + 0.45 * f), cLine, occL * 0.75);
    }
    put(dotc(length(qs - Mi * vec2(off + ab.x * 0.97, ab.y * 0.1)), 0.012) * (0.6 + 0.4 * sin(uT * 2.0 + s + fore * 2.0)), cCore, occL);      // ふちの小さな光
  }
  void shape(vec2 p, float occL){
    float f = max(cos(0.95 * (0.5 + 0.5 * sin(uFlap))), 0.14);      // 0.14（とじる）〜 1（ひらく）。手前・奥へ羽をたたむ
    put(ln(seg(p, vec2(0.0, -0.16), vec2(0.0, 0.1)), mix(0.004, 0.01, smoothstep(-0.16, 0.06, p.y)) * WK), mix(cLine, cCore, 0.4), occL);      // 細い胴
    for (int k = 0; k < 2; k++) { float s = k == 0 ? -1.0 : 1.0;                                     // 触角
      vec2 tip = vec2(s * 0.08, 0.28); put(ln(seg(p, vec2(s * 0.006, 0.1), tip), 0.0022 * WK), cLine, occL * 0.8); put(dotc(length(p - tip), 0.011), cCore, occL); }
    bwing(p, -1.0, 0.0, f, occL); bwing(p, 1.0, 0.0, f, occL); bwing(p, -1.0, 1.0, f, occL); bwing(p, 1.0, 1.0, f, occL);
  }` },
  // ---- D 綿毛
  D: { name: 'seed', size: 0.5, flap: [0.55, 1.1], spin: 0.32, roll: 0.35, glsl: `
  const vec2 CORE = vec2(0.0, 0.02);
  void shape(vec2 p, float occL){
    put(ln(seg(p, vec2(0.0, -0.3), CORE), 0.0026 * WK), cLine, occL * 0.9);                            // 種から芯へ のびる細いじく
    put(1.0 - smoothstep(-PX, PX, ell(p - vec2(0.0, -0.35), vec2(0.014, 0.05))), mix(cLine, cCore, 0.3), occL);      // 小さな種
    float op = 1.02 + 0.1 * sin(uFlap);                                                                 // かさの開き方（息をするように）
    for (int i = 0; i < 14; i++) {
      float fi = float(i), psi = fi / 14.0 * 6.2832 + uSpin + 0.2 * sin(fi * 2.3), ph = op + 0.09 * sin(fi * 1.7 + 0.5);
      vec3 dir = vec3(sin(ph) * cos(psi), cos(ph), sin(ph) * sin(psi));
      float L = 0.38 + 0.035 * sin(fi * 3.1), fr = 0.4 + 0.6 * (0.5 + 0.5 * dir.z);                      // 手前の糸ほど明るい
      vec2 mid = CORE + L * 0.55 * dir.xy, tip = CORE + L * dir.xy + vec2(0.0, 0.035 * L);             // 先が少し上へそる
      put(ln(min(seg(p, CORE, mid), seg(p, mid, tip)), 0.0022 * WK) * fr, cLine, occL * fr);
      float rt = length(p - tip);
      put(dotc(rt, 0.011) * fr, cCore, occL * fr); E += cGlow * exp(-rt * rt / 0.0011) * 0.3 * fr * mix(0.4, 1.0, uDark);      // 糸の先の小さな光
    }
  }` },
  // ---- E 光の輪
  E: { name: 'rings', size: 0.5, flap: [1, 1.6], spin: 0.55, roll: 0.15, glsl: `
  const vec2 CORE = vec2(0.0, 0.0);
  void ring(vec2 p, vec3 n, float R, float bead, float occL){
    n = normalize(n); float m = length(n.xy);
    vec2 w2 = m > 1e-3 ? n.xy / m : vec2(0.0, 1.0), u2 = vec2(-w2.y, w2.x);
    vec3 v3 = cross(n, vec3(u2, 0.0)); float vy = dot(v3.xy, w2);
    float b = max(R * abs(vy), 0.002);
    vec2 q = vec2(dot(p - CORE, u2), dot(p - CORE, w2));
    float dd = ell(q, vec2(R, b)), fz = (q.y / (R * (abs(vy) > 1e-3 ? vy : 1e-3))) * v3.z;
    float k = 0.3 + 0.7 * smoothstep(-0.06, 0.06, fz);                                                  // 奥の半分は うすく（芯のうしろを通る）
    put(ln(dd, 0.0042 * WK) * k, cLine, occL * k);
    for (int j = 0; j < 2; j++) {                                                                        // 輪の上を回る光の粒
      float t = bead + float(j) * 3.14159; vec2 bp = CORE + R * (cos(t) * u2 + sin(t) * v3.xy);
      float kb = 0.35 + 0.65 * smoothstep(-0.05, 0.05, sin(t) * v3.z), rb = length(p - bp);
      put(dotc(rb, 0.016) * kb, cCore, occL * kb); E += cGlow * exp(-rb * rb / 0.0016) * 0.45 * kb * mix(0.4, 1.0, uDark);
    }
  }
  void shape(vec2 p, float occL){
    float a1 = uSpin * 0.7, a2 = uSpin * 0.45 + 1.2;
    ring(p, vec3(0.38 * sin(a1), 1.0, 0.6 * cos(a1)), 0.34, uT * 1.1, occL);                            // ほぼ水平の輪（ゆっくり首をふる）
    ring(p, vec3(cos(a2), 0.32 + 0.1 * sin(uFlap), sin(a2)), 0.25, -uT * 0.85 + 1.0, occL);           // たての輪（ゆっくり回る）
    for (int k = 0; k < 2; k++) {                                                                        // 芯の細い光のすじ（十字）。光に見える
      vec2 dir = k == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0); float t = dot(p - CORE, dir), dl = abs(dot(p - CORE, vec2(-dir.y, dir.x)));
      put(ln(dl, 0.0018 * WK) * exp(-t * t / 0.012) * 0.9, cCore, occL * 0.5);
    }
  }` },
};

// 光の粉（光の玉の案で使う。createFairy の粉と同じ動き）
function makeOrbDust(U, n, xray, ro) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), birth = new Float32Array(n * 2).fill(-100), geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geom.setAttribute('aVel', new THREE.BufferAttribute(vel, 3)); geom.setAttribute('aBirth', new THREE.BufferAttribute(birth, 2));
  const mat = new THREE.ShaderMaterial({ transparent: true, fog: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, uniforms: U, depthWrite: false, depthTest: !xray,
    vertexShader: `attribute vec3 aVel; attribute vec2 aBirth; uniform float uT, uPx, uPR, uScale; varying float vK, vSeed;
      void main(){
        float age = uT - aBirth.x, life = 1.2 + 0.8 * aBirth.y, k = age / life; vK = k; vSeed = aBirth.y;
        vec3 p = position + aVel * (1.0 - exp(-age * 2.2)) / 2.2;
        p.y -= (0.08 * age + 0.06 * age * age) * uScale; p.x += sin(age * 3.0 + aBirth.y * 40.0) * 0.02 * uScale; p.z += cos(age * 2.6 + aBirth.y * 17.0) * 0.02 * uScale;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.022 + 0.022 * aBirth.y) * uScale * (1.0 - 0.55 * k) * uPx / max(-mv.z, 0.05), 2.0 * uPR, 0.035 * uPx);
        if (!(k >= 0.0 && k < 1.0)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vK = 1.0; } }`,
    fragmentShader: `uniform float uT, uDark; varying float vK, vSeed;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0; if (d >= 1.0 || vK < 0.0 || vK >= 1.0) discard;
        float a = (pow(1.0 - d, 2.4) + smoothstep(0.3, 0.0, d) * 0.7) * pow(clamp(1.0 - vK, 0.0, 1.0), 1.3) * (0.62 + 0.38 * sin(uT * 9.0 + vSeed * 50.0));
        vec3 col = mix(vec3(1.0, 0.97, 0.85), vec3(0.98, 0.72, 0.3), fract(vSeed * 7.3) * mix(1.0, 0.6, uDark));
        gl_FragColor = vec4(col * a, a * 0.6 * (1.0 - uDark));
        #include <colorspace_fragment>
      }` });
  const pts = new THREE.Points(geom, mat); pts.frustumCulled = false; pts.renderOrder = ro; pts.name = 'sun_fairy_dust';
  const _sz = new THREE.Vector2();
  pts.onBeforeRender = (r, _s, cam) => { const rt = r.getRenderTarget(), h = rt ? rt.height : r.getDrawingBufferSize(_sz).y; U.uPx.value = h * cam.projectionMatrix.elements[5] * 0.5; U.uPR.value = h / 800; };
  let i0 = 0;
  const spawn = (x, y, z, vx, vy, vz, t) => {
    const i = i0; i0 = (i0 + 1) % n;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; birth[i * 2] = t; birth[i * 2 + 1] = Math.random();
    geom.attributes.position.needsUpdate = true; geom.attributes.aVel.needsUpdate = true; geom.attributes.aBirth.needsUpdate = true;
  };
  return { pts, spawn, dispose: () => { geom.dispose(); mat.dispose(); } };
}

export function createOrb(style = 'B', opts = {}) {
  const K = String(style).toUpperCase(), ST = ORB_STYLES[K], classic = K === 'A';
  if (!ST && !classic) throw new Error(`createOrb: unknown style ${style}`);
  const S = opts.scale ?? 1, RO = opts.renderOrder ?? 20, xray = opts.xray ?? false, lightMax = opts.lightIntensity ?? 2.4, C = (h) => new THREE.Color(h);
  const COL = { line: [C('#e9a440'), C('#ffe2a6')], glow: [C('#ffcf7a'), C('#ffd99a')] };
  const U = { uT: { value: 0 }, uA: { value: 1 }, uDark: { value: 0 }, uPos: { value: new THREE.Vector3() }, uSize: { value: (ST ? ST.size : 0.46) * S }, uMinK: { value: 0.05 },
    uFlap: { value: 0 }, uSpin: { value: 0 }, uRoll: { value: 0 }, uPulse: { value: 0 }, uTalk: { value: 0 }, uBreath: { value: 0 }, uK: { value: S },
    cCore: { value: C('#fffaf0') }, cLine: { value: C('#e9a440') }, cGlow: { value: C('#ffcf7a') }, uPx: { value: 800 }, uPR: { value: 1 }, uScale: { value: S } };
  const mat = classic
    ? new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, uniforms: U,      // 今のゲームと同じ（足し算・いつも手前）
      vertexShader: 'uniform vec3 uPos; uniform float uK; varying vec2 vP; void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); mv.xy += position.xy * 0.46 * uK; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uA, uT; varying vec2 vP;
        void main(){ float d = length(vP), core = smoothstep(0.2, 0.0, d) * 1.7 + pow(max(1.0 - d, 0.0), 3.0) * 0.75, fl = 0.45 + 0.55 * (0.5 + 0.5 * sin(uT * 36.0));
          vec2 w = vec2((abs(vP.x) - 0.12 - 0.22 * fl) / (0.24 * fl), (vP.y - 0.2 + 0.25 * (abs(vP.x) - 0.3)) / 0.36);
          float wing = smoothstep(1.0, 0.55, length(w)) * 0.6;
          gl_FragColor = vec4(vec3(0.92, 1.0, 0.74) * core + vec3(0.8, 1.0, 0.9) * wing, uA); }` })
    : new THREE.ShaderMaterial({ transparent: true, fog: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, depthWrite: false, depthTest: !xray, uniforms: U,
      vertexShader: ORB_VS, fragmentShader: ORB_HEAD + ST.glsl + ORB_MAIN });
  const geom = new THREE.PlaneGeometry(2, 2), quad = new THREE.Mesh(geom, mat); quad.frustumCulled = false; quad.renderOrder = RO + 1; quad.name = 'sun_fairy';
  const dust = makeOrbDust(U, opts.dust ?? 48, classic || xray, RO);
  const group = new THREE.Group(); group.name = 'sun_fairy_orb'; group.add(quad, dust.pts);
  let light = null, lightOn = false;
  function setLight(on) { if (on && !light) { light = new THREE.PointLight(0xffdfa0, 0, 7 * Math.max(S, 0.6), 2); light.name = 'sun_fairy_light'; group.add(light); } lightOn = !!on; }

  let T = 0, alpha = 1, dark = -1, talking = false, talkK = 0, mv = null, ges = null, warp = true, arcSide = 1, roll = 0, flap = 0, spin = 0, breath = 0, pulse = 0;
  const anchor = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3(), ofs = new THREE.Vector3(), world = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function setDark(v) { v = clamp(v, 0, 1); if (v === dark) return; dark = v; U.uDark.value = v; U.cLine.value.lerpColors(COL.line[0], COL.line[1], v); U.cGlow.value.lerpColors(COL.glow[0], COL.glow[1], v); }
  function setAlpha(a) { alpha = clamp(a, 0, 1); U.uA.value = alpha; }
  function setPosition(p) { mv = null; anchor.copy(p); }
  function warpTo(p) { mv = null; anchor.copy(p); warp = true; }
  function moveTo(p, sec, o = {}) {      // 曲線をえがいて飛び、少し行きすぎて もどる（createFairy と同じ）
    const dist = anchor.distanceTo(p), arc = o.arc ?? 1; if (dist < 1e-4) { mv = null; return api; }
    arcSide = o.side ?? -arcSide;
    _d.subVectors(p, anchor); const side = _v.set(-_d.z, 0, _d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const p1 = anchor.clone().lerp(p, 0.5).addScaledVector(side, Math.min(dist * 0.24, 1.6) * arcSide * arc); p1.y += Math.min(dist * 0.14, 1.0) * arc;
    const over = Math.min(0.1, 0.32 * S / dist) * (o.overshoot ?? 1);
    mv = { p0: anchor.clone(), p1, p2: new THREE.Vector3().copy(p), t: 0, sec: sec ?? clamp(0.55 + dist / 3.4, 0.6, 4.5), c: 1.70158 * Math.pow(over / 0.1, 0.6), done: o.onArrive || null };
    return api;
  }
  function setTalking(b) { talking = !!b; }
  function burst(n, sp) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.4, r = sp * S * (0.6 + 0.6 * Math.random()); dust.spawn(world.x, world.y, world.z, Math.cos(a) * r, (0.2 + Math.random() * 0.45) * S, Math.sin(a) * r, T); } }
  function play(name, o = {}) {      // 'joy'（くるっと回る ＋ 光がはじける）/ 'surprise'（びくっと下がって ふくらむ）/ 'point'（o.to のほうへ少し飛んで もどる）
    const dur = { joy: 1.15, surprise: 1.05, point: 1.6 }[name]; if (!dur) return api;
    ges = { name, t: 0, dur, dir: new THREE.Vector3(), to: !!o.to }; if (o.to) ges.dir.subVectors(o.to, anchor);
    if (name === 'joy') burst(14, 0.5);
    return api;
  }

  function update(dt, camera) {
    dt = clamp(dt || 0, 0, 0.1); T += dt; U.uT.value = T;
    if (dark < 0) setDark(opts.dark ?? 0);
    if (mv) {
      mv.t += dt; const u = Math.min(mv.t / mv.sec, 1), v = u * u * (3 - 2 * u), e = 1 + (mv.c + 1) * Math.pow(v - 1, 3) + mv.c * Math.pow(v - 1, 2), k = 1 - e;
      anchor.set(0, 0, 0).addScaledVector(mv.p0, k * k).addScaledVector(mv.p1, 2 * k * e).addScaledVector(mv.p2, e * e);
      if (u >= 1) { anchor.copy(mv.p2); const f = mv.done; mv = null; if (f) f(); }
    }
    if (warp || dt <= 0) { prev.copy(anchor); vel.set(0, 0, 0); if (dt > 0) warp = false; }
    else { _v.subVectors(anchor, prev).divideScalar(dt); if (_v.lengthSq() > 900) _v.set(0, 0, 0); vel.lerp(_v, 1 - Math.exp(-dt * 12)); prev.copy(anchor); }
    talkK += ((talking ? 1 : 0) - talkK) * (1 - Math.exp(-dt * 9));
    const speed = vel.length();
    if (camera) { camera.updateMatrixWorld(); _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1); } else { _r.set(1, 0, 0); _u.set(0, 1, 0); }
    // しぐさ
    let spinG = 0, drop = 0, pointK = 0, flapAdd = 0, pulseT = 0.18 * talkK * (0.5 + 0.5 * Math.sin(T * 8));
    if (ges) {
      ges.t += dt; const t = ges.t, u = Math.min(t / ges.dur, 1);
      if (ges.name === 'joy') { spinG = TAU * ease(Math.min(t / 0.8, 1)); pulseT = Math.max(pulseT, Math.sin(Math.PI * u) * 0.8); flapAdd = 1; if (t - dt < 0.45 && t >= 0.45) burst(8, 0.35); }
      else if (ges.name === 'surprise') { const env = (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 3.6)) * (1 - sstep(t, 0.75, 1.05)); drop = 0.16 * env; pulseT = Math.max(pulseT, env); flapAdd = 1.5 * env; }
      else { pointK = t < 0.45 ? ease(t / 0.45) : t < 1.0 ? 1 : 1 - ease(Math.min((t - 1.0) / 0.6, 1)); flapAdd = 0.6 * pointK; if (camera && !ges.to) { ges.dir.subVectors(anchor, camera.getWorldPosition(_v)); ges.to = true; } }
      if (ges.t >= ges.dur) ges = null;
    }
    pulse += (pulseT - pulse) * (1 - Math.exp(-dt * 14)); U.uPulse.value = pulse; U.uTalk.value = talkK;
    // ふわふわ（待機）・ぴょこぴょこ（話す）
    ofs.set(Math.sin(T * 0.9) * 0.012, Math.sin(T * 2.1) * 0.022 + Math.sin(T * 1.3 + 1) * 0.009 + Math.abs(Math.sin(T * 8.2)) * 0.03 * talkK - drop, Math.cos(T * 0.7) * 0.008).multiplyScalar(S);
    if (pointK > 0 && ges && ges.dir.lengthSq() > 1e-6) { _d.copy(ges.dir).normalize(); ofs.addScaledVector(_d, 0.42 * S * pointK); }
    world.addVectors(anchor, ofs); U.uPos.value.copy(world); dust.pts.visible = true;
    // 動き：羽ばたき・回転・かたむき（画面の横向きの速さで、進むほうへかたむく）
    const fl = ST ? ST.flap : [1, 1];
    flap += dt * TAU * (fl[0] + (fl[1] - fl[0]) * talkK + Math.min(speed, 4) * 0.25 * fl[0] + flapAdd * fl[0]); U.uFlap.value = flap;
    spin += dt * ((ST ? ST.spin : 0) * (1 + Math.min(speed, 4) * 0.5 + talkK * 0.6) + (ges && ges.name === 'joy' && ST && ST.spin ? 6 * (1 - Math.min(ges.t / 0.9, 1)) : 0)); U.uSpin.value = spin;
    const sx = vel.dot(_r) + (pointK > 0 && ges ? ges.dir.dot(_r) * 0.3 * pointK : 0), rT = clamp(-sx * 0.16, -0.5, 0.5) * (ST ? ST.roll / 0.2 : 0);
    roll += (rT - roll) * (1 - Math.exp(-dt * 6)); U.uRoll.value = roll + (ST && !ST.spin ? spinG : 0);
    // 光の粉（動くほど多い。止まっていても、ときどきこぼれる）
    if (alpha > 0.25 && group.visible) {
      U.uBreath.value = (breath += dt);
      let acc = (Math.min(speed * 14, 40) + 2 + 3 * talkK) * dt; while (acc >= 1 || Math.random() < acc) { acc -= 1; const r = () => (Math.random() - 0.5) * 2;
        dust.spawn(world.x + r() * 0.04 * S, world.y + (r() * 0.04 - 0.02) * S, world.z + r() * 0.04 * S, -vel.x * 0.12 + r() * 0.06 * S, -vel.y * 0.12 + r() * 0.04 * S, -vel.z * 0.12 + r() * 0.06 * S, T); if (acc < 0) break; }
    }
    U.uK.value = S * (1 + 0.45 * pulse);
    if (light) { light.position.copy(world); light.intensity = lightOn ? lightMax * alpha * (0.12 + 0.88 * dark) * (1 + 0.4 * pulse) : 0; }
  }
  function dispose() { if (group.parent) group.parent.remove(group); geom.dispose(); mat.dispose(); dust.dispose(); if (light) { group.remove(light); light.dispose(); light = null; } }
  const api = { group, update, setPosition, warpTo, moveTo, setTalking, play, setDark, setAlpha, setLight, dispose, style: K,
    get position() { return anchor; }, get worldPosition() { return world; }, get moving() { return !!mv; }, get gesture() { return ges ? ges.name : null; }, get talking() { return talking; }, get light() { return light; },
    uniforms: U };
  setDark(opts.dark ?? 0); setLight(!!opts.light);
  return api;
}
export const createOrbClassic = (o) => createOrb('A', o);
export const createOrbDragonfly = (o) => createOrb('B', o);
export const createOrbButterfly = (o) => createOrb('C', o);
export const createOrbSeed = (o) => createOrb('D', o);
export const createOrbRings = (o) => createOrb('E', o);

// ================================================================================================
// 絵の妖精（2026-11-10。ユーザーが選んだ Midjourney の絵 game/fairy/fairy_mj_original.webp から切りぬいた素材で作る）
//   素材：fairy/fairy_body.png（体。羽なし）・fairy/fairy_wing_upper.png・fairy/fairy_wing_lower.png（羽 2 枚）。どれも元の絵の 4 倍の細かさ、透明 PNG
//   形：カメラを向く板（体）＋ 羽の板 2 枚（付け根を軸に、速く小さく はばたく）＋ うしろの光のにじみ（円）＋ 金色の光の粒（コードで出す）
//   絵は横向き（右を向いている）。進む向き（画面の左右）に合わせて、左右を反転する
//   描く回数 5（にじみ・羽 2・体・光の粒）。光の粒 40
const ART = {
  // 元の絵（1024 px）の中の場所。x0, y0, w, h ＝ 素材の範囲、root ＝ 羽の付け根、anchor ＝ 妖精のまん中（場所の基準）
  body: { file: 'fairy_body.png', x0: 429, y0: 449, w: 122, h: 226 },
  upper: { file: 'fairy_wing_upper.png', x0: 349, y0: 460, w: 136, h: 84, root: [481, 540] },
  lower: { file: 'fairy_wing_lower.png', x0: 362, y0: 528, w: 122, h: 49, root: [480, 537] },
  anchor: [492, 560], height: 226,
};
// ティンカーベルに似せないための案（2026-11-10。fairy/make_variants.py が作る。数値は fairy/fairy_variants.json と同じ）
//   b 花の妖精：お団子なし・肩までのふんわりした髪・花びらが重なったすそ・丸い花びらの羽（淡い金）
//   c 光のすそ：お団子なし・光にとける長い髪・足元が光の尾になる長いすそ（足なし）・木の葉の羽（淡い金）
const ART_LOOKS = {
  mj: ART,
  // ユーザーの決定（2026-11-10）：元の絵 A の形で、頭の上のお団子（と、そこから出る細い髪）をなくす。羽・すそ・素足・色は元の絵のまま
  a1: { ...ART, body: { file: 'fairy_a1_body.png', x0: 429, y0: 449, w: 122, h: 226 },      // A1 お団子なし（頭のふちは、頭の丸みでなめらかに）
    // 正面の姿（make_variants.py --only-front が作る。左右対称・A1 と同じ色。羽は横の羽の素材を左右に使う。roots ＝ 左がわの羽の付け根。右がわは中心線で反転）
    front: { body: { file: 'fairy_a1_front_body.png', x0: 437, y0: 449, w: 110, h: 226 }, roots: { upper: [485, 546], lower: [486, 551] } } },
  a2: { ...ART, body: { file: 'fairy_a2_body.png', x0: 429, y0: 449, w: 122, h: 226 } },      // A2 髪のふくらみもなし（小さめの光の丸い頭）
  b: { ...ART, body: { file: 'fairy_b_body.png', x0: 429, y0: 449, w: 122, h: 226 },
    upper: { file: 'fairy_b_wing_upper.png', x0: 346, y0: 445, w: 140, h: 105, root: [481, 540] }, lower: { file: 'fairy_b_wing_lower.png', x0: 367.5, y0: 519.5, w: 117.5, h: 75, root: [480, 537] } },
  c: { ...ART, body: { file: 'fairy_c_body.png', x0: 429, y0: 449, w: 122, h: 310 },
    upper: { file: 'fairy_c_wing_upper.png', x0: 341, y0: 452.5, w: 145, h: 95, root: [481, 540] }, lower: { file: 'fairy_c_wing_lower.png', x0: 367.5, y0: 522, w: 117.5, h: 65, root: [480, 537] } },
};
const ART_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 体と羽：絵の色のまま。外がわに細い金色のふち（昼は形を見せる線、真っ暗では光のふち）。前もって掛けた色 ＋ かくす度合い
const ART_FS = `uniform sampler2D map; uniform float uA, uDark, uOpa, uGlowIn, uRimW, uAdd, uView; uniform vec2 uTexel; uniform vec3 cRim; varying vec2 vUv;
  void main(){
    vec4 t = texture2D(map, vUv);
    float n = 0.0;
    for (int i = 0; i < 8; i++) { float an = float(i) * 0.7854; n = max(n, texture2D(map, vUv + vec2(cos(an), sin(an)) * uTexel * uRimW).a); }
    float rim = clamp(n - t.a, 0.0, 1.0) * step(0.01, uRimW);      // 外がわのふちの線（uRimW 0 ＝ なし。2026-11-10 から既定は なし）
    float a = t.a * uOpa;
    vec3 col = t.rgb * mix(1.0, 1.18, uDark) + uGlowIn * uDark * 0.12;
    vec3 em = col * a * (1.0 + 0.2 * uAdd * uDark) + cRim * rim * mix(0.75, 0.9, uDark);
    float oc = a * mix(1.0, 0.9 - 0.55 * uAdd, uDark) + rim * mix(0.7, 0.0, uDark);      // 羽は暗いほど すけて光る（灰色に見えない）
    gl_FragColor = vec4(em * uA * uView, clamp(oc, 0.0, 1.0) * uA * uView);      // uView：横の姿 ⇔ 正面の姿 のクロスフェード
    #include <colorspace_fragment>
  }`;
// うしろの光のにじみ（足し算。昼は少しだけ）
const ART_GLOW_FS = `uniform float uA, uDark, uPulse, uFar, uGlowK; uniform vec3 cGlow; varying vec2 vUv;
  void main(){
    float d = length(vUv * 2.0 - 1.0); if (d >= 1.0) discard;
    float g = pow(1.0 - d, 3.2) * mix(0.1, 0.38, uDark) + exp(-d * d * 14.0) * mix(0.05, 0.3, uDark) * (1.0 + uFar);      // ふちへ向かって ゆっくり消える（輪に見えない）。前より弱く
    g *= (1.0 + 0.6 * uPulse) * uGlowK;
    gl_FragColor = vec4(cGlow * g * uA, g * 0.08 * (1.0 - uDark) * uA);
    #include <colorspace_fragment>
  }`;

export function createImageFairy(opts = {}) {
  const S = opts.scale ?? 1, RO = opts.renderOrder ?? 20, xray = opts.xray ?? false, base = opts.base ?? './fairy/', lightMax = opts.lightIntensity ?? 2.4;
  const LOOK = opts.look === 'a' ? 'a1' : ART_LOOKS[opts.look] ? opts.look : 'mj', AR = ART_LOOKS[LOOK];      // look：'a'＝'a1'（元の絵・お団子なし。決定）/ 'a2'（丸い頭）/ 'mj'（元の絵）/ 'b'（花の妖精）/ 'c'（光のすそ）
  const origWings = AR.upper.file === ART.upper.file;                  // 元の絵の羽（a1・a2・mj）
  const M = (opts.height ?? 0.3) * S / AR.height;                    // 元の絵の 1 画素 ＝ M メートル（scale 1 で身長 0.3 m）
  const C = (h) => new THREE.Color(h);
  const COL = { rim: [C('#d8952e'), C('#ffd27a')], glow: [C('#ffd98a'), C('#ffd27a')] };
  const OL = opts.outline ? 1 : 0;                                       // outline：true で前のふちの線を出す（既定は なし）
  const U = { uT: { value: 0 }, uA: { value: 1 }, uDark: { value: 0 }, uPulse: { value: 0 }, uFar: { value: 0 }, uGlowK: { value: opts.glow ?? 1 }, cRim: { value: C('#d8952e') }, cGlow: { value: C('#ffd98a') }, uPx: { value: 800 }, uPR: { value: 1 }, uScale: { value: S } };
  const premul = { transparent: true, fog: false, depthWrite: false, depthTest: !xray, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const loader = new THREE.TextureLoader(), mats = [], geoms = [], texs = [];
  // 1 枚の板：part の範囲を、pivot（元の絵の座標）が原点になるように置く
  const sideV = { value: 1 }, frontV = { value: 0 }, texByFile = {}, texel = {};      // 横の姿・正面の姿の こさ（クロスフェード）。絵は 1 枚につき 1 回だけ読む
  function part(p, pivot, opa, rimW, glowIn, add, view = sideV) {      // add：暗いときに光として足す度合い（羽 ＝ すきとおる光）
    const g = new THREE.PlaneGeometry(p.w * M, p.h * M); g.translate((p.x0 + p.w / 2 - pivot[0]) * M, -(p.y0 + p.h / 2 - pivot[1]) * M, 0); geoms.push(g);
    let tex = texByFile[p.file];
    if (!tex) {
      const tx = texel[p.file] = new THREE.Vector2(1 / 512, 1 / 512);
      tex = texByFile[p.file] = loader.load(base + p.file, (t) => tx.set(1 / t.image.width, 1 / t.image.height));
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2; texs.push(tex);
    }
    const m = new THREE.ShaderMaterial({ ...premul, uniforms: { ...U, map: { value: tex }, uOpa: { value: opa }, uRimW: { value: rimW }, uGlowIn: { value: glowIn }, uAdd: { value: add }, uView: view, uTexel: { value: texel[p.file] } }, vertexShader: ART_VS, fragmentShader: ART_FS });
    mats.push(m); const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  }
  const sprite = new THREE.Group(); sprite.name = 'sun_fairy_sprite';      // カメラを向く。flip.scale.x の符号で左右を反転
  const flip = new THREE.Group(); sprite.add(flip);
  const body = part(AR.body, AR.anchor, 1, 5 * OL, 1, 0); body.renderOrder = RO + 3; body.name = 'sun_fairy_body';
  const pivots = ['upper', 'lower'].map((k, i) => {
    const pv = new THREE.Group(); pv.position.set((AR[k].root[0] - AR.anchor[0]) * M, -(AR[k].root[1] - AR.anchor[1]) * M, -0.001 * S);
    const w = part(AR[k], AR[k].root, origWings ? 0.8 : 0.72, 4 * OL, 0.5, origWings ? 0.3 : 1); w.renderOrder = RO + 1 + i; w.name = `sun_fairy_wing_${k}`; pv.add(w); flip.add(pv); return pv;
  });
  flip.add(body);
  // 正面の姿（look 'a' だけ）：左右対称の体 ＋ 羽を左右に 2 枚ずつ（左は素材のまま、右は中心線で反転）
  const FR = AR.front || null, front = new THREE.Group(), fPivots = [];
  if (FR) {
    sprite.add(front);
    for (const s of [1, -1]) ['upper', 'lower'].forEach((k, i) => {
      const r = FR.roots[k], pv = new THREE.Group(); pv.position.set(s * (r[0] - AR.anchor[0]) * M, -(r[1] - AR.anchor[1]) * M, -0.001 * S);
      const w = part(AR[k], AR[k].root, origWings ? 0.8 : 0.72, 4 * OL, 0.5, origWings ? 0.3 : 1, frontV); w.renderOrder = RO + 1 + i; pv.add(w); pv.userData = { s, i }; front.add(pv); fPivots.push(pv);
    });
    const fb = part(FR.body, AR.anchor, 1, 5 * OL, 1, 0, frontV); fb.renderOrder = RO + 3; fb.name = 'sun_fairy_body_front'; front.add(fb);
  }
  const glowGeom = new THREE.PlaneGeometry(1, 1); geoms.push(glowGeom);
  const glowMat = new THREE.ShaderMaterial({ ...premul, uniforms: U, vertexShader: ART_VS, fragmentShader: ART_GLOW_FS }); mats.push(glowMat);
  const glow = new THREE.Mesh(glowGeom, glowMat); glow.renderOrder = RO; glow.frustumCulled = false; glow.name = 'sun_fairy_glow';
  glow.position.set(-0.01 * S, 0.02 * S, -0.002 * S); sprite.add(glow);
  const dust = makeOrbDust(U, opts.dust ?? 40, xray, RO + 4);
  const group = new THREE.Group(); group.name = 'sun_fairy_image'; group.add(sprite, dust.pts);
  let light = null, lightOn = false;
  function setLight(on) { if (on && !light) { light = new THREE.PointLight(0xffdfa0, 0, 7 * Math.max(S, 0.6), 2); light.name = 'sun_fairy_light'; group.add(light); } lightOn = !!on; }
  const ready = Promise.all(texs.map((t) => new Promise((res) => { if (t.image) res(); else { const chk = () => (t.image ? res() : setTimeout(chk, 30)); chk(); } })));

  let T = 0, alpha = 1, dark = -1, talking = false, talkK = 0, mv = null, ges = null, warp = true, arcSide = 1, flapPh = 0, pulse = 0, face = 1, faceT = 1, lean = 0;
  let faceCam = null, frontK = 0, stillT = 0, frontNow = false;      // faceCam：true ＝ いつも正面、false ＝ いつも横、null ＝ 自動（止まっている・話している間は正面、飛んでいる間は横）
  function faceCamera(v) { faceCam = v === true || v === false ? v : null; return api; }
  const anchor = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3(), ofs = new THREE.Vector3(), world = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3(), _c = new THREE.Vector3();
  function setDark(v) { v = clamp(v, 0, 1); if (v === dark) return; dark = v; U.uDark.value = v; U.cRim.value.lerpColors(COL.rim[0], COL.rim[1], v); U.cGlow.value.lerpColors(COL.glow[0], COL.glow[1], v); }
  function setAlpha(a) { alpha = clamp(a, 0, 1); U.uA.value = alpha; }
  function setPosition(p) { mv = null; anchor.copy(p); }
  function warpTo(p) { mv = null; anchor.copy(p); warp = true; }
  function moveTo(p, sec, o = {}) {      // 曲線をえがいて飛び、少し行きすぎて もどる
    const dist = anchor.distanceTo(p), arc = o.arc ?? 1; if (dist < 1e-4) { mv = null; return api; }
    arcSide = o.side ?? -arcSide;
    _d.subVectors(p, anchor); const side = _v.set(-_d.z, 0, _d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const p1 = anchor.clone().lerp(p, 0.5).addScaledVector(side, Math.min(dist * 0.24, 1.6) * arcSide * arc); p1.y += Math.min(dist * 0.14, 1.0) * arc;
    const over = Math.min(0.1, 0.32 * S / dist) * (o.overshoot ?? 1);
    mv = { p0: anchor.clone(), p1, p2: new THREE.Vector3().copy(p), t: 0, sec: sec ?? clamp(0.55 + dist / 3.4, 0.6, 4.5), c: 1.70158 * Math.pow(over / 0.1, 0.6), done: o.onArrive || null };
    return api;
  }
  function setTalking(b) { talking = !!b; }
  function burst(n, sp) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.4, r = sp * S * (0.6 + 0.6 * Math.random()); dust.spawn(world.x, world.y, world.z, Math.cos(a) * r, (0.15 + Math.random() * 0.4) * S, Math.sin(a) * r, T); } }
  function play(name, o = {}) {      // 'joy'（くるっと ふり返って はねる ＋ 光がはじける）/ 'surprise'（びくっと下がって 光る）/ 'point'（o.to のほうを向いて 少し飛び、もどる）
    const dur = { joy: 1.15, surprise: 1.05, point: 1.6 }[name]; if (!dur) return api;
    ges = { name, t: 0, dur, dir: new THREE.Vector3(), to: !!o.to }; if (o.to) ges.dir.subVectors(o.to, anchor);
    if (name === 'joy') burst(12, 0.45);
    return api;
  }

  function update(dt, camera) {
    dt = clamp(dt || 0, 0, 0.1); T += dt; U.uT.value = T;
    if (dark < 0) setDark(opts.dark ?? 0);
    if (mv) {
      mv.t += dt; const u = Math.min(mv.t / mv.sec, 1), v = u * u * (3 - 2 * u), e = 1 + (mv.c + 1) * Math.pow(v - 1, 3) + mv.c * Math.pow(v - 1, 2), k = 1 - e;
      anchor.set(0, 0, 0).addScaledVector(mv.p0, k * k).addScaledVector(mv.p1, 2 * k * e).addScaledVector(mv.p2, e * e);
      if (u >= 1) { anchor.copy(mv.p2); const f = mv.done; mv = null; if (f) f(); }
    }
    if (warp || dt <= 0) { prev.copy(anchor); vel.set(0, 0, 0); if (dt > 0) warp = false; }
    else { _v.subVectors(anchor, prev).divideScalar(dt); if (_v.lengthSq() > 900) _v.set(0, 0, 0); vel.lerp(_v, 1 - Math.exp(-dt * 12)); prev.copy(anchor); }
    talkK += ((talking ? 1 : 0) - talkK) * (1 - Math.exp(-dt * 9));
    const speed = vel.length();
    if (camera) { camera.updateMatrixWorld(); _r.setFromMatrixColumn(camera.matrixWorld, 0); camera.getWorldPosition(_c); } else { _r.set(1, 0, 0); _c.set(anchor.x, anchor.y, anchor.z + 2); }
    // しぐさ
    let drop = 0, pointK = 0, flapAdd = 0, hopG = 0, pulseT = 0.2 * talkK * (0.5 + 0.5 * Math.sin(T * 8)), spinFlip = 1;
    if (ges) {
      ges.t += dt; const t = ges.t, u = Math.min(t / ges.dur, 1);
      if (ges.name === 'joy') { spinFlip = Math.cos(TAU * ease(Math.min(t / 0.7, 1))); hopG = Math.sin(Math.PI * Math.min(t / 0.7, 1)) * 0.07; pulseT = Math.max(pulseT, Math.sin(Math.PI * u) * 0.8); flapAdd = 6; if (t - dt < 0.4 && t >= 0.4) burst(8, 0.3); }
      else if (ges.name === 'surprise') { const env = (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 3.6)) * (1 - sstep(t, 0.75, 1.05)); drop = 0.13 * env; pulseT = Math.max(pulseT, env); flapAdd = 10 * env; }
      else { pointK = t < 0.45 ? ease(t / 0.45) : t < 1.0 ? 1 : 1 - ease(Math.min((t - 1.0) / 0.6, 1)); flapAdd = 4 * pointK; if (!ges.to) { ges.dir.subVectors(anchor, _c); ges.dir.y = 0; ges.to = true; } }
      if (ges.t >= ges.dur) ges = null;
    }
    pulse += (pulseT - pulse) * (1 - Math.exp(-dt * 14)); U.uPulse.value = pulse;
    // ふわふわ（待機）・ぴょこぴょこ（話す）
    ofs.set(Math.sin(T * 0.9) * 0.012, Math.sin(T * 2.1) * 0.022 + Math.sin(T * 1.3 + 1) * 0.009 + Math.abs(Math.sin(T * 7.5)) * 0.028 * talkK + hopG - drop, Math.cos(T * 0.7) * 0.008).multiplyScalar(S);
    if (pointK > 0 && ges && ges.dir.lengthSq() > 1e-6) { _d.copy(ges.dir).normalize(); ofs.addScaledVector(_d, 0.4 * S * pointK); }
    world.addVectors(anchor, ofs);
    // 向き：画面の左右に動いた向きを見る（指すときは、行き先のほう）
    const sx = vel.dot(_r) + (pointK > 0 && ges ? ges.dir.dot(_r) * 4 * pointK : 0);
    if (Math.abs(sx) > 0.12) faceT = Math.sign(sx);
    face += (faceT - face) * (1 - Math.exp(-dt * 11));
    lean += (clamp(-Math.abs(sx) * 0.1, -0.3, 0) - lean) * (1 - Math.exp(-dt * 6));      // 進むほうへ 少し前のめり
    // 板：カメラを向く。遠くでは見かけの大きさを保つ（目印）
    const dist = Math.max(world.distanceTo(_c), 0.05), minH = dist * (opts.farSize ?? 0.07), k = Math.max(1, minH / ((opts.height ?? 0.3) * S));      // 遠くでも見かけの大きさを保つ：20 m 先で 1.4 m ぶん（スマホ縦で 約 35 px）
    U.uFar.value = clamp(k - 1, 0, 1.5);
    sprite.position.copy(world); if (camera) sprite.quaternion.copy(camera.quaternion);
    // 正面 ⇔ 横：自動なら、話している・止まって 0.35 秒たったら正面、飛びだす・指すときは横。切りかえは 0.3 秒ほどのクロスフェード ＋ くるっと細くなる（ふり向く）
    if (FR) {
      stillT = speed < 0.22 && !mv ? stillT + dt : 0;
      const autoFront = (talking || stillT > 0.35) && !(ges && ges.name === 'point') && speed < 0.5;
      frontNow = faceCam === null ? autoFront : faceCam;
      frontK += ((frontNow ? 1 : 0) - frontK) * (1 - Math.exp(-dt * (warp ? 1e3 : 10)));
      if (dt <= 0) frontK = frontNow ? 1 : 0;
    }
    const fk = frontK * frontK * (3 - 2 * frontK); frontV.value = fk; sideV.value = 1 - fk;
    const turn = 1 - 0.55 * Math.sin(Math.PI * fk);                    // ふり向くとき、一瞬 細くなる
    const fx = face * spinFlip, fxs = Math.sign(fx || 1) * Math.max(Math.abs(fx), 0.06);
    sprite.scale.set(k, k, k); flip.scale.set(fxs * turn, 1, 1); flip.rotation.z = lean * Math.sign(fxs) * (1 - fk);
    front.scale.set(Math.sign(spinFlip || 1) * Math.max(Math.abs(spinFlip), 0.06) * turn, 1, 1); front.visible = fk > 0.002; flip.visible = fk < 0.998;
    glow.scale.setScalar(0.62 * S * (1 + 0.25 * pulse) * (1 + 0.6 * U.uFar.value));
    // 羽ばたき：付け根を軸に、速く小さく（はばたく角度 ＋ 手前・奥へのかたむきで少し短く見える）。上と下は少しずらす
    flapPh += dt * TAU * (8.5 + 3 * talkK + Math.min(speed, 4) * 0.8 + flapAdd);
    pivots.forEach((pv, i) => { const s = Math.sin(flapPh - i * 1.1); pv.rotation.z = (i === 0 ? -0.05 : 0.04) + s * 0.12; pv.scale.x = 0.86 + 0.14 * Math.cos(flapPh - i * 1.1); });
    fPivots.forEach((pv) => { const { s, i } = pv.userData, ph = flapPh - i * 1.1;      // 正面：羽は手前・奥へ はばたく（横はばが のびちぢみ）＋ 少し上下
      pv.rotation.z = -s * ((i === 0 ? 0.06 : -0.05) + Math.sin(ph) * 0.08); pv.scale.x = s * (0.74 + 0.26 * Math.cos(ph)); });
    // 光の粒：少しずつこぼれて、うしろに尾を引く（動くほど多い）
    if (alpha > 0.25 && group.visible) {
      let acc = (Math.min(speed * 12, 34) + 1.6 + 2.5 * talkK) * dt;
      while (acc >= 1 || Math.random() < acc) { acc -= 1; const r = () => (Math.random() - 0.5) * 2;
        dust.spawn(world.x + r() * 0.035 * S, world.y + (r() * 0.05 - 0.02) * S, world.z + r() * 0.035 * S, -vel.x * 0.14 + r() * 0.05 * S, -vel.y * 0.12 + r() * 0.04 * S, -vel.z * 0.14 + r() * 0.05 * S, T); if (acc < 0) break; }
    }
    if (light) { light.position.copy(world); light.intensity = lightOn ? lightMax * alpha * (0.12 + 0.88 * dark) * (1 + 0.4 * pulse) : 0; }
  }
  function dispose() { if (group.parent) group.parent.remove(group); geoms.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose()); dust.dispose(); if (light) { group.remove(light); light.dispose(); light = null; } }
  const api = { group, update, setPosition, warpTo, moveTo, setTalking, play, setDark, setAlpha, setLight, dispose, ready, style: 'IMG', look: LOOK, faceCamera,
    get view() { return FR ? (frontK > 0.5 ? 'front' : 'side') : 'side'; }, get hasFront() { return !!FR; },
    get position() { return anchor; }, get worldPosition() { return world; }, get moving() { return !!mv; }, get gesture() { return ges ? ges.name : null; }, get talking() { return talking; }, get light() { return light; }, get facing() { return faceT; },
    uniforms: U };
  setDark(opts.dark ?? 0); setLight(!!opts.light);
  return api;
}

// ================================================================================================
// 3D の光の妖精（2026-11-10）— A1「お団子なし」の絵を、そのまま立体にしたもの。どの向きからでも見られる
//   体：光でできた小さな女の子のシルエット（丸い頭 ＋ 肩までのふんわりした髪のふくらみ、細い首と腕、ひざ丈のふんわりしたワンピース、素足）。顔は作らない
//   質感：ほぼ単色の自己発光（クリーム〜淡い金）。ふちがほんのり明るい（昼は金色のふち ＝ 形が読める線）。陰影はごくやわらかく
//   羽：A1 の羽の素材（fairy/fairy_wing_upper.png・lower.png）を、背中から左右 2 枚ずつの板として生やし、付け根から羽ばたく（少し後ろへ開いた角度 ＝ 横からも形が見える）
//   ほか：光のにじみ（足し算の円）・金色の光の粒の尾は、絵の妖精と同じ
//   向き：飛ぶ間は進む向きへ、止まると カメラ（プレイヤー）のほうへ、なめらかに回る。lookAt(点) / faceCamera(true) で決められる
//   描く回数 7（にじみ・体・羽 4・光の粒）。テクスチャ 2 枚（羽）
function lightFairyGeo() {
  // 単位 m（scale 1 で身長 0.3 m。足先 −0.15 〜 頭 +0.15）。part：0 胴とすそ・1/2 うで・3/4 足・5 頭と髪。hair：1 髪 / 2 すそ
  const V2 = (x, y) => new THREE.Vector2(x, y), list = [];
  list.push({ geo: new THREE.LatheGeometry([V2(0, -0.071), V2(0.05, -0.075), V2(0.06, -0.074), V2(0.056, -0.062), V2(0.042, -0.035), V2(0.028, -0.008),
    V2(0.021, 0.008), V2(0.022, 0.024), V2(0.021, 0.038), V2(0.015, 0.05), V2(0.008, 0.056), V2(0, 0.058)], 18), part: 0, hair: 2 });      // 胴とワンピース（すそはひざ丈でふんわり）
  list.push({ geo: new THREE.CylinderGeometry(0.007, 0.008, 0.026, 8), m: M(0, 0.064, 0), part: 0 });                                    // 細い首
  for (const s of [1, -1]) {
    const i = s > 0 ? 0 : 1;
    list.push({ geo: new THREE.CapsuleGeometry(0.0052, 0.05, 3, 8), m: M(s * 0.024, 0.046 - 0.03, 0), part: 1 + i, pivot: [s * 0.024, 0.046, 0] });      // 細いうで
    list.push({ geo: new THREE.SphereGeometry(0.0068, 8, 6), m: M(s * 0.024, 0.046 - 0.062, 0), part: 1 + i, pivot: [s * 0.024, 0.046, 0] });
    list.push({ geo: new THREE.CapsuleGeometry(0.0062, 0.058, 3, 8), m: M(s * 0.011, -0.07 - 0.034, 0), part: 3 + i, pivot: [s * 0.011, -0.07, 0] });   // 素足
    list.push({ geo: new THREE.SphereGeometry(0.0072, 8, 6), m: M(s * 0.011, -0.07 - 0.07, 0.004, 0.5, 0, 0, 0.85, 1.35, 1.0), part: 3 + i, pivot: [s * 0.011, -0.07, 0] });      // つま先（浮いている）
  }
  list.push({ geo: new THREE.SphereGeometry(0.041, 18, 14), m: M(0, 0.108, 0.004), part: 5 });                                       // 頭（顔は作らない）
  list.push({ geo: new THREE.SphereGeometry(0.046, 18, 14), m: M(0, 0.112, -0.006, 0, 0, 0, 1.02, 0.96, 1.0), part: 5, hair: 1 });     // 髪のふくらみ
  list.push({ geo: new THREE.SphereGeometry(0.046, 16, 10), m: M(0, 0.084, -0.012, 0, 0, 0, 1.12, 0.62, 0.98), part: 5, hair: 1 });    // 肩までのふんわりした すそ（ボブ）
  const g = bake(list);
  const loc = g.attributes.aLocal; let k = 0;                              // bake の aLocal に、髪・すその しるしを入れなおす
  for (const it of list) for (let j = 0; j < it._n; j++, k++) loc.setXY(k, it.hair || 0, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.2);
  return g;
}

const LF_VS = `attribute float aPart; attribute vec3 aPivot; attribute vec2 aLocal;
  uniform vec2 uLimb[4]; uniform vec3 uHead; uniform float uT, uSway;
  varying vec3 vN, vV; varying float vHair, vLeg, vUp; ${ROT}
  void main(){
    vec3 p = position, n = normal;
    if (aPart > 0.5 && aPart < 4.5) { vec2 r = uLimb[int(aPart + 0.5) - 1]; mat3 R = rZ(r.y) * rX(r.x); p = aPivot + R * (p - aPivot); n = R * n; }
    else if (aPart > 4.5) { mat3 R = rY(uHead.y) * rX(uHead.x) * rZ(uHead.z); vec3 neck = vec3(0.0, 0.07, 0.0); p = neck + R * (p - neck); n = R * n; }
    float sk = aLocal.x > 1.5 ? smoothstep(0.0, -0.075, p.y) : 0.0;                    // すそ：下ほど ふわっとゆれる
    float an = atan(p.x, p.z);
    p.xz *= 1.0 + sk * (0.06 * sin(an * 4.0 + uT * 3.1) + 0.04 * sin(uT * 2.2 + an) + 0.05 * uSway);
    p.y += sk * 0.004 * sin(an * 3.0 - uT * 2.6);
    vHair = aLocal.x > 0.5 && aLocal.x < 1.5 ? 1.0 : 0.0; vLeg = aPart > 2.5 && aPart < 4.5 ? 1.0 : 0.0; vUp = n.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * n); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const LF_FS = `uniform vec3 cCore, cHair, cLeg, cRim; uniform float uA, uDark, uPulse, uRimK; varying vec3 vN, vV; varying float vHair, vLeg, vUp;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    vec3 col = mix(mix(cCore, cHair, vHair * 0.8), cLeg, vLeg * 0.75);
    col *= 0.94 + 0.06 * vUp + 0.06 * uPulse;                                     // ごくやわらかい陰影（上が少し明るい）
    float rim = smoothstep(0.55, 0.98, f) * uRimK;                                // ふちを明るくする光（リムライト）・ふちの線は、既定で なし（uRimK 0）
    col = mix(col, cRim, rim * mix(0.75, 0.55, uDark)) + rim * uDark * 0.25;
    col *= mix(1.0, 1.15, uDark);
    gl_FragColor = vec4(col * uA, uA);
    #include <colorspace_fragment>
  }`;

export function createLightFairy3D(opts = {}) {
  const S = opts.scale ?? 1, RO = opts.renderOrder ?? 20, xray = opts.xray ?? false, base = opts.base ?? './fairy/', lightMax = opts.lightIntensity ?? 2.4;
  const C = (h) => new THREE.Color(h);
  const COL = { rim: [C('#d99a3a'), C('#fff1c8')], glow: [C('#ffd98a'), C('#ffd27a')] };
  const U = { uT: { value: 0 }, uA: { value: 1 }, uDark: { value: 0 }, uPulse: { value: 0 }, uFar: { value: 0 }, uSway: { value: 0 }, uRimK: { value: opts.outline ? 1 : 0 }, uGlowK: { value: opts.glow ?? 1 },
    cCore: { value: C('#fff4c6') }, cHair: { value: C('#ffeaa0') }, cLeg: { value: C('#ffd889') }, cRim: { value: C('#d99a3a') }, cGlow: { value: C('#ffd98a') },
    uLimb: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uHead: { value: new THREE.Vector3() }, uPx: { value: 800 }, uPR: { value: 1 }, uScale: { value: S } };
  const mats = [], geoms = [], texs = [];
  const bodyGeom = lightFairyGeo(); geoms.push(bodyGeom);
  const bodyMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LF_VS, fragmentShader: LF_FS, transparent: true, depthWrite: true, fog: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }); mats.push(bodyMat);
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat); bodyMesh.renderOrder = RO + 1; bodyMesh.frustumCulled = false; bodyMesh.name = 'sun_fairy_body';
  // 羽（A1 の羽の素材。左は素材のまま、右は反転）。体のあとに描く（体にかくれる所は深さで消える）
  const premul = { transparent: true, fog: false, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
  const MPX = 0.3 / ART.height;                                         // 元の絵の 1 画素 ＝ MPX m（身長 0.3 m の体の中で）
  const loader = new THREE.TextureLoader(), wingTex = {};
  function wingMesh(k) {
    const p = ART[k], g = new THREE.PlaneGeometry(p.w * MPX, p.h * MPX); g.translate((p.x0 + p.w / 2 - p.root[0]) * MPX, -(p.y0 + p.h / 2 - p.root[1]) * MPX, 0); geoms.push(g);
    if (!wingTex[k]) { const tx = new THREE.Vector2(1 / 512, 1 / 512); const t = loader.load(base + p.file, (tt) => tx.set(1 / tt.image.width, 1 / tt.image.height)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; texs.push(t); wingTex[k] = { t, tx }; }
    const m = new THREE.ShaderMaterial({ ...premul, uniforms: { ...U, map: { value: wingTex[k].t }, uOpa: { value: 0.8 }, uRimW: { value: opts.outline ? 4 : 0 }, uGlowIn: { value: 0.5 }, uAdd: { value: 0.3 }, uView: { value: 1 }, uTexel: { value: wingTex[k].tx } }, vertexShader: ART_VS, fragmentShader: ART_FS });
    mats.push(m); const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  }
  const body = new THREE.Group(); body.name = 'sun_fairy_3d'; body.rotation.order = 'YXZ'; body.add(bodyMesh);
  const wings = [];
  for (const s of [1, -1]) {
    const sideG = new THREE.Group(); sideG.position.set(0, 0.044, -0.016); sideG.scale.x = s; body.add(sideG);          // 背中の付け根（s ＝ −1 は左右反転 ＝ 右の羽）
    ['upper', 'lower'].forEach((k, i) => {
      const pv = new THREE.Group(); pv.position.set(-0.004, i === 0 ? 0.004 : -0.006, 0); pv.rotation.order = 'YXZ';
      const w = wingMesh(k); w.renderOrder = RO + 2 + i; w.name = `sun_fairy_wing_${k}`; pv.add(w); sideG.add(pv); wings.push({ pv, i });
    });
  }
  // 光のにじみ（カメラを向く円）
  const glowGeom = new THREE.PlaneGeometry(1, 1); geoms.push(glowGeom);
  const glowMat = new THREE.ShaderMaterial({ transparent: true, fog: false, depthWrite: false, depthTest: !xray, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: U, vertexShader: ART_VS, fragmentShader: ART_GLOW_FS }); mats.push(glowMat);
  const glow = new THREE.Mesh(glowGeom, glowMat); glow.renderOrder = RO; glow.frustumCulled = false; glow.name = 'sun_fairy_glow';
  const holder = new THREE.Group(); holder.add(body);                       // holder：場所と大きさ（遠くで大きく）。body：向き・かたむき
  const dust = makeOrbDust(U, opts.dust ?? 40, xray, RO + 4);
  const group = new THREE.Group(); group.name = 'sun_fairy_3d_group'; group.add(glow, holder, dust.pts);
  let light = null, lightOn = false;
  function setLight(on) { if (on && !light) { light = new THREE.PointLight(0xffdfa0, 0, 7 * Math.max(S, 0.6), 2); light.name = 'sun_fairy_light'; group.add(light); } lightOn = !!on; }
  const ready = Promise.all(texs.map((t) => new Promise((res) => { const chk = () => (t.image ? res() : setTimeout(chk, 30)); chk(); })));

  let T = 0, alpha = 1, dark = -1, talking = false, talkK = 0, mv = null, ges = null, warp = true, arcSide = 1, flapPh = 0, pulse = 0, yaw = 0, yawInit = false, pitch = 0, bank = 0, trem = false, tremK = 0, stillT = 0;
  let faceCam = null, lookPt = null;                                       // faceCam：true ＝ カメラを向く、false ＝ 進む向きだけ、null ＝ 自動
  const anchor = new THREE.Vector3(), prev = new THREE.Vector3(), vel = new THREE.Vector3(), ofs = new THREE.Vector3(), world = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
  function setDark(v) { v = clamp(v, 0, 1); if (v === dark) return; dark = v; U.uDark.value = v; U.cRim.value.lerpColors(COL.rim[0], COL.rim[1], v); U.cGlow.value.lerpColors(COL.glow[0], COL.glow[1], v); }
  function setAlpha(a) { alpha = clamp(a, 0, 1); U.uA.value = alpha; }
  function setPosition(p) { mv = null; anchor.copy(p); }
  function warpTo(p) { mv = null; anchor.copy(p); warp = true; }
  function moveTo(p, sec, o = {}) {
    const dist = anchor.distanceTo(p), arc = o.arc ?? 1; if (dist < 1e-4) { mv = null; return api; }
    arcSide = o.side ?? -arcSide;
    _d.subVectors(p, anchor); const side = _v.set(-_d.z, 0, _d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
    const p1 = anchor.clone().lerp(p, 0.5).addScaledVector(side, Math.min(dist * 0.24, 1.6) * arcSide * arc); p1.y += Math.min(dist * 0.14, 1.0) * arc;
    const over = Math.min(0.1, 0.32 * S / dist) * (o.overshoot ?? 1);
    mv = { p0: anchor.clone(), p1, p2: new THREE.Vector3().copy(p), t: 0, sec: sec ?? clamp(0.55 + dist / 3.4, 0.6, 4.5), c: 1.70158 * Math.pow(over / 0.1, 0.6), done: o.onArrive || null };
    return api;
  }
  function setTalking(b) { talking = !!b; }
  function faceCamera(v) { faceCam = v === true || v === false ? v : null; if (v) lookPt = null; return api; }
  function lookAt(p) { lookPt = p ? new THREE.Vector3().copy(p) : null; return api; }      // その点のほうを向く（null で やめる）
  function setTremble(b) { trem = !!b; return api; }                      // あわてて ふるえる（つづけて）
  function burst(n, sp) { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.4, r = sp * S * (0.6 + 0.6 * Math.random()); dust.spawn(world.x, world.y, world.z, Math.cos(a) * r, (0.15 + Math.random() * 0.4) * S, Math.sin(a) * r, T); } }
  function play(name, o = {}) {      // 'joy'（くるっと 1 回転して はねる）/ 'surprise'（びくっと下がって ふるえる）/ 'point'（o.to のほうを向いて うでを上げ、少し飛んで もどる）
    const dur = { joy: 1.15, surprise: 1.1, point: 1.6 }[name]; if (!dur) return api;
    ges = { name, t: 0, dur, dir: new THREE.Vector3(), to: !!o.to }; if (o.to) ges.dir.subVectors(o.to, anchor);
    if (name === 'joy') burst(12, 0.45);
    return api;
  }

  function update(dt, camera) {
    dt = clamp(dt || 0, 0, 0.1); T += dt; U.uT.value = T;
    if (dark < 0) setDark(opts.dark ?? 0);
    if (mv) {
      mv.t += dt; const u = Math.min(mv.t / mv.sec, 1), v = u * u * (3 - 2 * u), e = 1 + (mv.c + 1) * Math.pow(v - 1, 3) + mv.c * Math.pow(v - 1, 2), k = 1 - e;
      anchor.set(0, 0, 0).addScaledVector(mv.p0, k * k).addScaledVector(mv.p1, 2 * k * e).addScaledVector(mv.p2, e * e);
      if (u >= 1) { anchor.copy(mv.p2); const f = mv.done; mv = null; if (f) f(); }
    }
    const snap = warp || dt <= 0;
    if (snap) { prev.copy(anchor); vel.set(0, 0, 0); if (dt > 0) warp = false; }
    else { _v.subVectors(anchor, prev).divideScalar(dt); if (_v.lengthSq() > 900) _v.set(0, 0, 0); vel.lerp(_v, 1 - Math.exp(-dt * 12)); prev.copy(anchor); }
    talkK += ((talking ? 1 : 0) - talkK) * (1 - Math.exp(-dt * 9));
    const speed = vel.length(), hs = Math.hypot(vel.x, vel.z);
    if (camera) { camera.updateMatrixWorld(); camera.getWorldPosition(_c); } else _c.set(anchor.x, anchor.y, anchor.z + 2);
    // しぐさ
    let drop = 0, pointK = 0, flapAdd = 0, hopG = 0, spin = 0, armUp = 0, armOut = 0, shake = 0, pulseT = 0.2 * talkK * (0.5 + 0.5 * Math.sin(T * 8));
    if (ges) {
      ges.t += dt; const t = ges.t, u = Math.min(t / ges.dur, 1);
      if (ges.name === 'joy') { spin = TAU * ease(Math.min(t / 0.8, 1)); hopG = Math.sin(Math.PI * Math.min(t / 0.8, 1)) * 0.07; armUp = Math.pow(Math.sin(Math.PI * u), 0.6); pulseT = Math.max(pulseT, Math.sin(Math.PI * u) * 0.8); flapAdd = 6; if (t - dt < 0.45 && t >= 0.45) burst(8, 0.3); }
      else if (ges.name === 'surprise') { const env = (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 3.2)) * (1 - sstep(t, 0.8, 1.1)); drop = 0.12 * env; armOut = env; shake = env; pulseT = Math.max(pulseT, env); flapAdd = 10 * env; }
      else { pointK = t < 0.45 ? ease(t / 0.45) : t < 1.0 ? 1 : 1 - ease(Math.min((t - 1.0) / 0.6, 1)); flapAdd = 4 * pointK; if (!ges.to) { ges.dir.subVectors(anchor, _c); ges.dir.y = 0; ges.to = true; } }
      if (ges.t >= ges.dur) ges = null;
    }
    tremK += ((trem ? 1 : 0) - tremK) * (1 - Math.exp(-dt * 10)); shake = Math.max(shake, tremK);
    pulse += (pulseT - pulse) * (1 - Math.exp(-dt * 14)); U.uPulse.value = pulse;
    // ふわふわ（待機）・ぴょこぴょこ（話す）・ふるえ
    ofs.set(Math.sin(T * 0.9) * 0.012 + Math.sin(T * 47) * 0.004 * shake, Math.sin(T * 2.1) * 0.022 + Math.sin(T * 1.3 + 1) * 0.009 + Math.abs(Math.sin(T * 7.5)) * 0.028 * talkK + hopG - drop, Math.cos(T * 0.7) * 0.008 + Math.cos(T * 53) * 0.003 * shake).multiplyScalar(S);
    if (pointK > 0 && ges && ges.dir.lengthSq() > 1e-6) { _d.copy(ges.dir).normalize(); ofs.addScaledVector(_d, 0.4 * S * pointK); }
    world.addVectors(anchor, ofs);
    // 向き：指す行き先 → lookAt の点 → faceCamera(true) ならカメラ → 自動：話している・止まって 0.5 秒たったらカメラのほう、飛んでいる間は進む向き
    stillT = hs < 0.25 && !mv ? stillT + dt : 0;
    let tgt = null;
    if (pointK > 0.05 && ges) tgt = Math.atan2(ges.dir.x, ges.dir.z);
    else if (lookPt) tgt = Math.atan2(lookPt.x - world.x, lookPt.z - world.z);
    else if (faceCam === true || (faceCam === null && (talking || stillT > 0.5))) tgt = Math.atan2(_c.x - world.x, _c.z - world.z);
    else if (hs > 0.2) tgt = Math.atan2(vel.x, vel.z);
    if (tgt !== null) { if (!yawInit || snap) { yaw = tgt; yawInit = true; } else yaw += angd(tgt - yaw) * (1 - Math.exp(-dt * 5)); }
    const fwd = vel.x * Math.sin(yaw) + vel.z * Math.cos(yaw), sd = vel.x * Math.cos(yaw) - vel.z * Math.sin(yaw), kL = 1 - Math.exp(-dt * 6);
    pitch += (clamp(fwd * 0.12, -0.3, 0.45) - pitch) * kL; bank += (clamp(-sd * 0.12, -0.35, 0.35) - bank) * kL;
    body.rotation.set(pitch, yaw + spin + Math.sin(T * 61) * 0.03 * shake, bank);
    // 遠くでも見かけの大きさを保つ（目印）
    const dist = Math.max(world.distanceTo(_c), 0.05), k = Math.max(1, dist * (opts.farSize ?? 0.07) / (0.3 * S));
    U.uFar.value = clamp(k - 1, 0, 1.5);
    holder.position.copy(world); holder.scale.setScalar(S * k);
    glow.position.copy(world); if (camera) glow.quaternion.copy(camera.quaternion); glow.scale.setScalar(0.62 * S * k * (1 + 0.25 * pulse) * (1 + 0.3 * U.uFar.value));
    // うで・足・頭：ゆっくりゆれる。話す間は手が動く、喜ぶ ＝ 両手を上げる、おどろく ＝ 手を広げる、指す ＝ 片手を行き先へ
    const L = U.uLimb.value, trail = clamp(fwd * 0.2, -0.3, 0.7);
    const aIdle = 0.22 + 0.06 * Math.sin(T * 1.7), aL = aIdle + talkK * (0.3 + 0.28 * Math.sin(T * 6.1)) + 2.2 * armUp + 1.1 * armOut, aR = aIdle + talkK * (0.3 + 0.28 * Math.sin(T * 6.1 + 2.2)) + 2.2 * armUp + 1.1 * armOut;
    L[0].set((0.08 * Math.sin(T * 1.3) + trail * 0.8 - 0.4 * talkK) * (1 - pointK) - 1.5 * pointK, aL * (1 - pointK) + 0.15 * pointK);
    L[1].set(0.08 * Math.sin(T * 1.3 + 1.2) + trail * 0.8 - 0.4 * talkK, -aR);
    L[2].set(0.12 * Math.sin(T * 1.9) + trail + 0.2 * armUp - 0.15, 0.04 + 0.12 * armOut);
    L[3].set(0.12 * Math.sin(T * 1.9 + 2.0) + trail + 0.4 * armUp + 0.1, -0.04 - 0.12 * armOut);
    U.uHead.value.set(0.06 * Math.sin(T * 7.5) * talkK - 0.1 * armUp - 0.08 * armOut, 0.05 * Math.sin(T * 0.8), 0.07 * Math.sin(T * 2.7) * talkK + 0.04 * Math.sin(T * 1.1));
    U.uSway.value = clamp(fwd * 0.4, -0.5, 1) + 0.3 * talkK;
    // 羽ばたき：付け根から、うしろへ開いたまま 前後に（速く小さく）。上と下は少しずらす
    flapPh += dt * TAU * (8.5 + 3 * talkK + Math.min(speed, 4) * 0.8 + flapAdd);
    for (const { pv, i } of wings) { const ph = flapPh - i * 1.1; pv.rotation.set(0, -(0.74 + 0.22 * Math.sin(ph)), (i === 0 ? -0.04 : 0.05) + 0.06 * Math.sin(ph + 0.6)); }      // うしろへ約 40° 開く ＝ 正面からも横からも羽の形が見える（横から見て ふちだけの細い線にならない）
    // 光の粒
    if (alpha > 0.25 && group.visible) {
      let acc = (Math.min(speed * 12, 34) + 1.6 + 2.5 * talkK) * dt;
      while (acc >= 1 || Math.random() < acc) { acc -= 1; const r = () => (Math.random() - 0.5) * 2;
        dust.spawn(world.x + r() * 0.035 * S, world.y + (r() * 0.05 - 0.02) * S, world.z + r() * 0.035 * S, -vel.x * 0.14 + r() * 0.05 * S, -vel.y * 0.12 + r() * 0.04 * S, -vel.z * 0.14 + r() * 0.05 * S, T); if (acc < 0) break; }
    }
    if (light) { light.position.copy(world); light.intensity = lightOn ? lightMax * alpha * (0.12 + 0.88 * dark) * (1 + 0.4 * pulse) : 0; }
  }
  function dispose() { if (group.parent) group.parent.remove(group); geoms.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose()); dust.dispose(); if (light) { group.remove(light); light.dispose(); light = null; } }
  const api = { group, update, setPosition, warpTo, moveTo, setTalking, play, setDark, setAlpha, setLight, dispose, ready, style: '3D', faceCamera, lookAt, setTremble,
    get view() { return '3d'; }, get yaw() { return yaw; }, set yaw(v) { yaw = v; yawInit = true; },
    get position() { return anchor; }, get worldPosition() { return world; }, get moving() { return !!mv; }, get gesture() { return ges ? ges.name : null; }, get talking() { return talking; }, get light() { return light; },
    uniforms: U };
  setDark(opts.dark ?? 0); setLight(!!opts.light);
  return api;
}
