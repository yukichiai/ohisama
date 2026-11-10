// =====================================================================
// 「おひさまのかけら」（?game=sun）の、エリアの入り口（文字の看板はなし ＝ 形と光で行き先がわかる）。花の丘のページ（flower_hill.js）が、森の中に置く
//   遺跡＝苔むした石のアーチ（積んだ石・光る帯）、くずれた石がきと柱、つた、石だたみ、うすい金色の古い光
//   キノコの谷＝大きな光るキノコ 2 本が門のようにかぶさり、そのうしろに根のトンネル、わきに倒木。青緑〜紫の胞子の光。分かれ目から門まで、光るキノコが導く
//   洞くつ＝岩を組んだ口（中はトンネルになっていて、奥が青く光る）、まわりから生える水晶、冷たい霧。道にも小さな水晶
//   どの入り口も：奥に光の霧（'gate_veil'）、にじむ光（'gate_glow'）、立ちのぼる光の粒（'gate_sparks'）、足もとのシダ・小花・小石
//   かけらを取ったエリア（localStorage の sunCircle_ruins / sunCircle_mushroom / sunCircle_cave ＝ "1"）の入り口は、奥の光が金色になる（門の上の太陽のしるしは、2026-11-10 ユーザーの依頼で なくした）
// 門は、入り口の点（GATES の x・z）の 1 m 手前に立つ。くぐって 0.6 m 進むと「入った」になる（gateEntered。門に近づいただけでは入らない／くぐれば必ず入る）
// 引数：kit（area_kit.js の createAreaKit の返り値）, GATES ＝ [{ name: 'ruins' | 'valley' | 'cave', x, z（入り口の点）, d ＝ [dx, dz]（入っていく向き）, pts ＝ [分かれ目, 曲がり角, 入り口] }],
//       BR_W（枝道の、歩ける幅の半分 m）, groundH(x, z), done（確認用：{ ruins, valley, cave } を決めておく。なければ localStorage を読む）
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, rng, vnoise, clamp, sstep, lerp, pickOf, glc, TILE, TubeGeo, PlantGeo, buildFern, buildWildflowers } from './area_kit.js';

const SHIFT = -1.7, ENTER = -0.4;                                   // 門の立つ場所（入り口の点から、手前へ m）、「入った」になる線（入り口の点から m。門の 0.6 m 先）
const DONE_KEY = { ruins: 'sunCircle_ruins', valley: 'sunCircle_mushroom', cave: 'sunCircle_cave' };      // magic_circle.js の保存キー
// 入り口をくぐったか：(x, z) が、門の先の線をこえて、入り口の点の近くにいる
export function gateEntered(g, x, z) {
  const ax = (x - g.x) * g.d[0] + (z - g.z) * g.d[1];
  return ax > ENTER && Math.hypot(x - g.x, z - g.z) < 1.9;
}

export function createSunGates({ kit, GATES, BR_W, groundH, done = null }) {
  const group = new THREE.Group(); group.name = 'sun_gates';
  if (!GATES.length) return group;
  const addDapple = kit.addDapple, GOLD = '#ffd76a';
  const r = rng(133), dummy = new THREE.Object3D(), col = new THREE.Color(), tmp = new THREE.Color();
  const forced = new URLSearchParams(location.search).get('gatedone');                    // 確認用：?gatedone=ruins,valley（取ったことにする）／ ?gatedone=none（どれも取っていない）
  const isDone = (name) => { if (forced != null) return forced.split(',').includes(name); if (done) return !!done[name]; try { return localStorage.getItem(DONE_KEY[name]) === '1'; } catch (_) { return false; } };
  const gate = (name) => { const g = GATES.find((gt) => gt.name === name), [dx, dz] = g.d, y0 = groundH(g.x, g.z);
    return { g, yaw: Math.atan2(dx, dz), done: isDone(name), at: (lx, ly, lz) => V3(g.x + dz * lx + dx * (lz + SHIFT), y0 + ly, g.z - dx * lx + dz * (lz + SHIFT)) }; };      // at(右へ, 上へ, 奥へ)：入り口の前に立って見た場所（門の面が 奥へ 0.7、「入った」の線が 奥へ 1.3）
  const put = (geo, pos, ry = 0, rx = 0, rz = 0, s = [1, 1, 1]) => geo.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(...s)));
  // 頂点に色を入れる（上のほうは苔の色。苔のまだらは、石のマテリアルが足す）
  const tinted = (geo, hex, moss = 0, mossHex = '#5c8c44') => {
    const p = geo.attributes.position, n = p.count, a = new Float32Array(n * 3); geo.computeBoundingBox(); const y0 = geo.boundingBox.min.y, y1 = geo.boundingBox.max.y, k = 0.88 + 0.24 * r();
    for (let i = 0; i < n; i++) { col.set(hex).multiplyScalar(k); if (moss) col.lerp(tmp.set(mossHex), moss * sstep(p.getY(i), lerp(y0, y1, 0.45), y1)); a.set([col.r, col.g, col.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
  };
  // 切り出した石：箱を 2×2×2 に分けて、角を少し落とし、面をでこぼこさせる（まっすぐな箱に見えない）
  const hewn = (sx, sy, sz, amp = 0.05) => {
    const g = new THREE.BoxGeometry(sx, sy, sz, 2, 2, 2), p = g.attributes.position, sd = r() * 40, H = [sx / 2, sy / 2, sz / 2];
    for (let i = 0; i < p.count; i++) {
      const c = [p.getX(i), p.getY(i), p.getZ(i)]; let e = 0; for (let k = 0; k < 3; k++) if (Math.abs(c[k]) > H[k] * 0.95) e++;
      const pull = e === 2 ? 0.045 : 0, nz = (k) => (vnoise(c[(k + 1) % 3] * 2.1 + sd + k * 7, c[(k + 2) % 3] * 2.1 + sd) - 0.5) * amp * 2;
      const h3 = vnoise(c[0] * 3.3 + sd, c[1] * 3.3 + c[2] * 2.7 + sd);                       // 角ごとの欠け（同じ場所の頂点は、同じだけ動く）
      for (let k = 0; k < 3; k++) c[k] = c[k] * (1 - (e === 3 ? 0.06 + 0.16 * h3 : pull) * Math.min(1, 0.5 / Math.max(H[k], 0.25))) + nz(k);
      p.setXYZ(i, c[0], c[1], c[2]);
    }
    g.computeVertexNormals(); return g;
  };
  // 石・岩のマテリアル：頂点の色に、石のはだ（まだら・ざらつき・ひび）と、上を向いた面やくぼみの苔を足す
  const stoneMat = (mossHex, amt, key) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => { sh.uniforms.tGate = kit.U.tNoise;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGUp;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvGUp = dot(normalize(transformedNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGate; varying float vGUp;')
        .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 wp = vFogWorld; bool up = abs(vGUp) > 0.7; vec2 pA = up ? wp.xz : wp.xy, pB = up ? wp.zx + 3.1 : wp.zy;
          float n1 = texture2D(tGate, wp.xz * 0.19 + wp.y * 0.11).g, nm = texture2D(tGate, pA * 0.55 + 0.2).g, n2 = 0.5 * (texture2D(tGate, pA * 0.3).r + texture2D(tGate, pB * 0.3 + 0.37).r), n3 = 0.5 * (texture2D(tGate, pA * 1.4).b + texture2D(tGate, pB * 1.4 + 0.2).b);
          float crack = 0.5 * (texture2D(tGate, pA * 0.13 + 0.11).g + texture2D(tGate, pB * 0.13 + 0.53).g);
          vec3 st = diffuseColor.rgb * (0.8 + 0.42 * n2) * (0.86 + 0.28 * n3) * (1.0 - 0.36 * (1.0 - smoothstep(0.0, 0.02, abs(crack - 0.5))));
          float moss = max(smoothstep(0.3, 0.8, vGUp) * smoothstep(0.56, 0.7, n1 * 0.5 + n2 * 0.3 + n3 * 0.35), smoothstep(0.62, 0.76, nm * 0.6 + n3 * 0.3 + n1 * 0.25) * 0.7) * ${amt.toFixed(2)};
          diffuseColor.rgb = mix(st, ${glc(mossHex)} * (0.7 + 0.55 * n2), moss); }`); };
    m.customProgramCacheKey = () => key; return addDapple(m); };
  // 自分で光る色（夜の色づけを打ち消す。area_kit.js の kfGlow）。vc ＝ 頂点の色を使う
  const glowMat = (hex, vc = false, side = THREE.FrontSide) => { const m = new THREE.MeshBasicMaterial({ color: hex, vertexColors: vc, side });
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = kfGlow(diffuseColor.rgb);'); };
    m.customProgramCacheKey = () => 'fpGateGlow' + (vc ? 'V' : ''); return m; };
  const mesh = (geos, mat, name) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos), mat); m.name = name; m.frustumCulled = false; group.add(m); };
  const plantMat = kit.createPlantMaterial();
  // items ＝ [{ p, s（大きさ）, c（色）, rx・rz（かたむき）か q（向きを決める）}]
  const instanced = (geo, items, name, mat = plantMat) => { if (!items.length) return; const m = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { dummy.position.copy(it.p); if (it.q) dummy.quaternion.copy(it.q); else dummy.rotation.set(it.rx || 0, r() * 6.283, it.rz || 0); dummy.scale.setScalar(it.s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.set(it.c)); });
    m.frustumCulled = false; m.name = name; group.add(m); };
  // 枝道にそった場所（u ＝ 0 分かれ目 〜 1 入り口の点、side ＝ 道の中心から横へ m）
  const along = (g, u, side) => { const i = u < 0.5 ? 0 : 1, t = Math.min(1, u < 0.5 ? u * 2 : (u - 0.5) * 2), a = g.pts[i], b = g.pts[i + 1], bx = b[0] - a[0], bz = b[1] - a[1], bl = Math.hypot(bx, bz);
    const x = a[0] + bx * t + bz / bl * side, z = a[1] + bz * t - bx / bl * side; return V3(x, groundH(x, z), z); };
  // みんなで使う一覧：立ちのぼる光の粒・にじむ光の板・光の霧・シダ・小花・つるの葉・木（つる・根・倒木）
  const sparks = [], lights = [], veils = [], ferns = [], flowers = [], ivy = [], wood = new TubeGeo();
  const rise = (p, n, H, colors, spread) => { for (let i = 0; i < n; i++) sparks.push({ x: p.x + (r() - 0.5) * spread, y: p.y, z: p.z + (r() - 0.5) * spread, H: H * (0.55 + 0.45 * r()), c: pickOf(r, colors), s: r(), k: 0.6 + 0.8 * r() }); };
  // 光の霧：門の奥に立つ、ゆっくり流れるうすい光の板（黒い穴や平らな板に見えないよう、奥行きを見せる）。w × h、色、濃さ
  const veil = (pos, yaw, w, h, hex, amt) => { const g = put(new THREE.PlaneGeometry(w, h, 1, 1), pos, yaw + Math.PI), n = g.attributes.position.count, a = new Float32Array(n * 4); col.set(hex);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b, amt], i * 4); g.setAttribute('aV', new THREE.BufferAttribute(a, 4)); veils.push(g); };
  const fern = (p, s = 0.8 + 0.5 * r(), c = pickOf(r, ['#ffffff', '#f2f2c4', '#dcecc0'])) => ferns.push({ p, s, c, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2 });
  const flower = (p, s = 0.9 + 0.5 * r(), c = pickOf(r, ['#ffffff', '#fff6d0', '#fff0e0'])) => flowers.push({ p, s, c });
  // つる・根：pts をつないだ管（樹皮のマテリアル）。leafEvery ごとに葉のかたまり
  const BARK = new THREE.Color('#4c4630'), BARK2 = new THREE.Color('#6a5a44'), MOSSC = new THREE.Color('#6a8f48');
  const tube = (pts, rad, o = {}) => { const n = pts.length, tip = o.tip ?? 0.4;
    wood.tube(pts, o.sides || 5, (i) => rad * (1 - (1 - tip) * i / (n - 1)), (i, th) => BARK.clone().lerp(BARK2, 0.5 + 0.5 * Math.sin(i * 1.7)).lerp(MOSSC, clamp((o.moss || 0) * (0.5 + 0.5 * Math.cos(th)), 0, 1)));
    if (o.leaf) { let acc = o.leaf * r(); for (let i = 1; i < n; i++) { acc += pts[i].distanceTo(pts[i - 1]); if (acc < o.leaf) continue; acc = 0; ivy.push({ p: pts[i].clone(), s: 0.8 + 0.5 * r(), c: pickOf(r, ['#7fae54', '#5f9648', '#9cc060', '#b8cc6c']), rx: (r() - 0.5) * 1.2, rz: (r() - 0.5) * 1.2 }); } } };

  // ================================================================ 遺跡：苔むした石のアーチ、くずれた石がきと柱、つた、石だたみ、うすい金色の古い光
  { const { g, at, yaw, done: dn } = gate('ruins'), stone = [], rune = [], S = ['#b4ae9c', '#c8c0aa', '#d8d0b8', '#beb7a4'], R = 2.0, N = 9, yA = 3.76, RUNE = dn ? GOLD : '#7ff2d2';
    const blk = (sx, sy, sz, pos, rz = 0, moss = 0.6, ry = yaw, rx = 0, amp = 0.05) => stone.push(put(tinted(hewn(sx, sy, sz, amp), pickOf(r, S), moss * 0.5), pos, ry + (r() - 0.5) * 0.05, rx, rz));
    const col2 = (rad, h, pos, moss = 0.6, rx = 0, rz = 0, ry = r() * 6.283) => stone.push(put(tinted(new THREE.CylinderGeometry(rad * 0.9, rad, h, 10, 2), pickOf(r, S), moss * 0.5), pos, ry, rx, rz));
    for (const sd of [-1, 1]) {                                                               // 門の柱：台 ＋ 積んだ石 4 つ ＋ 柱頭
      blk(1.34, 0.42, 1.34, at(sd * R, 0.12, 0.7), 0, 0.7);
      for (let k = 0; k < 4; k++) blk(0.9 + 0.08 * r(), 0.82, 0.9 + 0.08 * r(), at(sd * R + (r() - 0.5) * 0.05, 0.72 + k * 0.8, 0.7 + (r() - 0.5) * 0.05), (r() - 0.5) * 0.03, 0.15);
      blk(1.18, 0.28, 1.14, at(sd * R, 3.63, 0.7), 0, 0.5);
      for (const h of [1.72, 2.18]) rune.push(put(new THREE.BoxGeometry(1.0, 0.045, 1.0), at(sd * R, h, 0.7), yaw));
      for (let k = 0; k < 4; k++) for (const f of [-1, 1]) rune.push(put(new THREE.BoxGeometry(0.05, 0.16 + 0.14 * r(), 0.03), at(sd * R + (k - 1.5) * 0.2, 1.95 + (r() - 0.5) * 0.08, 0.7 + f * 0.505), yaw));
      lights.push({ p: at(sd * R, 1.95, 0.5), size: 2.6, color: RUNE, opacity: 0.28 });
    }
    for (let i = 0; i < N; i++) { if (i === 5) continue; const th = Math.PI * (i + 0.5) / N, key = i === 4;      // 半円の石（まん中は大きな、かなめ石。1 つ欠けている）
      blk(Math.PI * R / N * 1.08, key ? 0.86 : 0.7, key ? 1.0 : 0.92, at(Math.cos(th) * R, yA + Math.sin(th) * (R + (key ? 0.06 : 0)), 0.7), th - Math.PI / 2, 0.45);
      if (i % 2 === 0 || key) rune.push(put(new THREE.BoxGeometry(key ? 0.3 : 0.05, key ? 0.05 : 0.26, 0.03), at(Math.cos(th) * R, yA + Math.sin(th) * R, 0.7 - (key ? 0.52 : 0.48)), yaw, 0, th - Math.PI / 2)); }      // アーチの石にも、光るしるし（遠くからでも、門の形がわかる）
    blk(0.7, 0.58, 0.86, at(-3.3, 0.22, -0.4), 0.35, 0.7, yaw + 0.6, 0.2); blk(0.6, 0.5, 0.7, at(1.75, 0.2, 2.4), -0.2, 0.8, yaw - 0.4);      // 落ちた石
    // くずれた石がき（門の左右へ、だんだん低くなる）
    for (const [sd, n1, n2] of [[-1, 4, 2], [1, 3, 1]]) {
      for (let k = 0; k < n1; k++) blk(1.0, 0.56, 0.72, at(sd * (R + 1.05 + k * 1.02), 0.24, 0.72 + sd * 0.12 * k), (r() - 0.5) * 0.06, 0.65);
      for (let k = 0; k < n2; k++) blk(0.96, 0.52, 0.68, at(sd * (R + 1.5 + k * 1.02), 0.78, 0.72 + sd * 0.12 * k), (r() - 0.5) * 0.08, 0.75);
    }
    // くずれた円い柱：門の手前の左右（立っているもの・折れたもの・たおれたもの）
    col2(0.3, 2.5, at(-3.5, 1.2, -1.5), 0.5); blk(0.84, 0.2, 0.84, at(-3.5, 0.06, -1.5), 0, 0.6); blk(0.8, 0.22, 0.8, at(-3.5, 2.55, -1.5), 0.05, 0.8);
    col2(0.3, 1.1, at(3.4, 0.5, -1.7), 0.8, 0.05, 0.06); blk(0.84, 0.2, 0.84, at(3.4, 0.06, -1.7), 0, 0.6);
    col2(0.29, 1.5, at(4.3, 0.3, -0.5), 0.8, Math.PI / 2 + 0.06, 0, yaw + 0.5);
    // 石だたみ：門の前のしき石（すき間があき、ところどころ欠けている）と、枝道の点々とした敷石
    for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) { if (r() < 0.16) continue; blk(0.84 + 0.1 * r(), 0.09, 0.76 + 0.1 * r(), at(j * 0.92 + (i % 2) * 0.3 - 0.15, 0.012, -2.5 + i * 0.86), (r() - 0.5) * 0.04, 0.4, yaw + (r() - 0.5) * 0.12, 0, 0.025); }
    for (let i = 0; i < 9; i++) { const p = along(g, 0.1 + 0.72 * i / 8, (r() - 0.5) * 0.7); blk(0.75 + 0.3 * r(), 0.08, 0.55 + 0.2 * r(), p.add(V3(0, 0.012, 0)), 0, 0.4, r() * 6.283, 0, 0.025); }
    for (let i = 0; i < 12; i++) { const s = 0.14 + 0.2 * r(); blk(s * 1.3, s * 0.8, s, at((r() < 0.5 ? -1 : 1) * (1.5 + 2.6 * r()), s * 0.3, -3 + 4.4 * r()), r(), 0.5, r() * 6.283, r(), 0.03); }      // 小石
    // 分かれ目と曲がり角の、目じるしの石（光る輪のついた、折れた円い柱）
    for (const [u, side, h] of [[0.2, -(BR_W + 0.9), 1.25], [0.2, BR_W + 0.85, 0.8], [0.5, BR_W + 0.6, 0.95]]) {
      const p = along(g, u, side), ry = r() * 6.283, tl = (r() - 0.5) * 0.14;
      stone.push(put(tinted(new THREE.CylinderGeometry(0.25, 0.3, h, 9, 2), pickOf(r, S), 0.7), p.clone().add(V3(0, h / 2 - 0.05, 0)), ry, tl, tl)); blk(0.8, 0.17, 0.8, p.clone().add(V3(0, 0.03, 0)), 0, 0.5, ry);
      for (const k of [0.5, 0.7]) rune.push(put(new THREE.CylinderGeometry(0.295, 0.3, 0.04, 9), p.clone().add(V3(0, h * k, 0)), ry, tl, tl));
      lights.push({ p: p.clone().add(V3(0, h * 0.6, 0)), size: 1.9, color: RUNE, opacity: 0.32 }); fern(p.clone().add(V3(0.5, 0, 0.3)), 0.6);
    }
    mesh(stone, stoneMat('#5c8c44', 0.8, 'gateStoneA'), 'gate_ruins_stone'); mesh(rune, glowMat(RUNE), 'gate_ruins_rune');
    // つた：柱をのぼり、アーチの上をはい、下にたれる
    for (const sd of [-1, 1]) for (const zo of [-0.5, 0.5]) { if (r() < 0.2) continue; const pts = [], ph = r() * 6;
      for (let i = 0; i <= 9; i++) { const u = i / 9; pts.push(at(sd * (R + (zo < 0 ? 0.1 : 0.52) + 0.05 * Math.sin(u * 7 + ph)) + (zo < 0 ? sd * 0.0 : 0), 0.05 + u * 3.7, 0.7 + zo * (zo < 0 ? 1.02 : 0.3) + 0.06 * Math.sin(u * 5 + ph))); }
      const end = sd > 0 ? Math.PI * (0.12 + 0.2 * r()) : Math.PI * (0.88 - 0.2 * r()); for (let i = 1; i <= 4; i++) { const th = lerp(sd > 0 ? 0.05 : Math.PI - 0.05, end, i / 4); pts.push(at(Math.cos(th) * (R + 0.36), yA + Math.sin(th) * (R + 0.36), 0.7 + zo * 0.7)); }
      tube(pts, 0.04, { leaf: 0.52 }); }
    for (const th of [0.24, 0.4, 0.72, 0.86]) { const a = Math.PI * th, top = at(Math.cos(a) * (R - 0.3), yA + Math.sin(a) * (R - 0.32), 0.7 + (r() - 0.5) * 0.5), L = 0.5 + 0.8 * r(), pts = [];
      for (let i = 0; i <= 4; i++) pts.push(top.clone().add(V3(0.05 * Math.sin(i * 1.3), -L * i / 4, 0.04 * Math.sin(i)))); tube(pts, 0.022, { leaf: 0.32 }); }
    // 足もとのシダと小花（道の外）
    for (const [lx, lz] of [[-3.0, 0.2], [-2.9, 1.4], [3.0, 0.3], [3.1, 1.5], [-4.6, 0.9], [4.4, 1.0], [-2.2, -2.9], [2.3, -3.1], [-5.2, -0.6], [5.0, -1.4]]) fern(at(lx + (r() - 0.5) * 0.4, 0, lz));
    for (const [lx, lz] of [[-1.9, -2.2], [1.9, -1.2], [-1.75, -0.3], [2.6, -2.6], [-4.0, -2.0], [3.9, 0.4]]) flower(at(lx, 0, lz));
    // 光：むこうの金色の古い光（光の霧 2 枚）、門の上の明かり、足もとの光
    const LC = dn ? '#ffd98a' : '#ffe49c';
    veil(at(0, 1.9, 1.5), yaw, 3.3, 3.8, LC, 0.5); veil(at(0, 2.2, 3.0), yaw, 5.0, 4.6, '#fff0c0', 0.34);
    lights.push({ p: at(0, 2.1, 3.6), size: 9, color: LC, opacity: 0.46 }, { p: at(0, 1.6, 1.4), size: 4.5, color: '#fff0c0', opacity: 0.3 }, { p: at(0, 5.6, 1.6), size: 7, color: LC, opacity: 0.2 },
      { p: at(0, 0.07, 0.4), size: 7, color: '#ffe9a8', opacity: 0.3, flat: true }, { p: at(-1.6, 0.5, -1.4), size: 3.2, color: '#fff2c8', opacity: 0.1 }, { p: at(1.7, 0.45, -0.8), size: 3.0, color: '#fff2c8', opacity: 0.1 });
    rise(at(0, 0.3, 1.2), 24, 6.5, ['#ffe9a8', '#fff4d0', dn ? GOLD : '#9ff2dc'], 2.6);
  }
  // ================================================================ キノコの谷：大きな光るキノコ 2 本の門、うしろに根のトンネル、わきに倒木。青緑〜紫の胞子の光。分かれ目から門まで、光るキノコが導く
  { const { g, at, yaw, done: dn } = gate('valley'), small = [], big = [], C = ['#6fe8ff', '#c59bff', '#7ff2d2', '#8fb4ff'];
    // ひとむら：大・中・小の光るキノコ（門のキノコと同じ絵）。s ＝ むらの大きさ
    const add = (p, s, c = pickOf(r, C), op = 0.22) => { const a0 = r() * 6.283;
      [[0, 0.44, 0], [0.24, 0.3, 2.2], [0.2, 0.19, 4.3]].forEach(([d, h, da], k) => { if (k === 2 && s < 1.3) return; const a = a0 + da, x = p.x + Math.cos(a) * d * s, z = p.z + Math.sin(a) * d * s;
        small.push({ p: V3(x, groundH(x, z) + (p.y - groundH(p.x, p.z)) - 0.02, z), s: h * s * (0.85 + 0.3 * r()), c: k ? pickOf(r, C) : c, rx: (r() - 0.5) * 0.3, rz: (r() - 0.5) * 0.3 }); });
      lights.push({ p: p.clone().add(V3(0, 0.34 * s, 0)), size: Math.max(1.0, s * 0.95), color: c, opacity: op }); };
    add(along(g, 0.14, BR_W + 0.9), 3.0, '#6fe8ff', 0.32); add(along(g, 0.14, -(BR_W + 0.9)), 2.5, '#c59bff', 0.32);                               // 分かれ目の目じるし（本道のすぐわき。枝道の入口の左右）
    for (let i = 0; i < 16; i++) { const k = i / 15, s = lerp(0.9, 2.9, k) * (0.85 + 0.3 * r()); add(along(g, 0.18 + 0.62 * k, (i % 2 ? -1 : 1) * (BR_W + 0.25 + 0.28 * s + r() * 0.3)), s); }      // 道の両わきに点々と。門に近いほど大きく
    add(at(-3.7, 0, 0.3), 3.6); add(at(3.7, 0, 0.5), 4.0); add(at(-4.6, 0, 2.2), 2.6); add(at(4.5, 0, 2.4), 2.8); add(at(-2.9, 0.42, -1.6), 1.5, '#7ff2d2'); add(at(-3.2, 0.5, -0.6), 1.2, '#c59bff');      // 門のわきと、倒木の上
    // 門の大きなキノコ（高さ 1 の形）：柄・つば・かさの裏のひだ・丸いかさ。aSh ＝（光る量, 部分 0 柄・1 ひだ・2 かさの上, かさのまん中 0 〜 ふち 1）
    const shroomGeo = (sides, fine) => { const prof = [], add2 = (y, rad, glow, part, shade) => prof.push({ y, rad, glow, part, shade });
      add2(-0.03, 0.095, 0.3, 0, 0.8); if (fine) add2(0.03, 0.078, 0.32, 0, 0.84); add2(0.12, 0.056, 0.36, 0, 0.88); if (fine) add2(0.45, 0.048, 0.45, 0, 0.92); add2(0.6, 0.046, 0.5, 0, 0.92);
      if (fine) { add2(0.625, 0.105, 0.9, 0, 1); add2(0.65, 0.045, 0.55, 0, 0.94); } add2(0.735, 0.043, 0.6, 0, 0.96);
      add2(0.745, 0.056, 0.95, 1, 1); add2(0.73, 0.28, 0.85, 1, 1); add2(0.7, 0.5, 0.7, 1, 1);
      add2(0.705, 0.515, 0.55, 2, 1); if (fine) add2(0.73, 0.53, 0.42, 2, 0.98); add2(0.76, 0.525, 0.34, 2, 0.97);
      for (const th of fine ? [0.2, 0.45, 0.7, 0.95, 1.2, 1.4, 1.5708] : [0.35, 0.7, 1.05, 1.35, 1.5708]) add2(0.76 + 0.24 * Math.sin(th), 0.525 * Math.max(Math.cos(th), 0.004), 0.3 - 0.08 * Math.sin(th), 2, 0.96);
      const pos = [], nrm = [], cl = [], sh = [], idx = [], n = prof.length;
      for (let j = 0; j < n; j++) { const a = prof[Math.max(0, j - 1)], b = prof[Math.min(n - 1, j + 1)], p = prof[j], dr = b.rad - a.rad, dy = b.y - a.y, len = Math.hypot(dr, dy) || 1;
        for (let s = 0; s <= sides; s++) { const th = s / sides * 6.2832, c = Math.cos(th), sn = Math.sin(th), wob = 1 + (p.part > 0.5 ? 0.035 * Math.sin(th * 5) : 0);
          pos.push(c * p.rad * wob, p.y, sn * p.rad * wob); nrm.push(c * dy / len, -dr / len, sn * dy / len); cl.push(p.shade, p.shade, p.shade); sh.push(p.glow, p.part, p.part > 0.5 ? Math.min(1, p.rad / 0.52) : 0); } }
      for (let j = 0; j < n - 1; j++) for (let s = 0; s < sides; s++) { const a = j * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); geo.setAttribute('aSh', new THREE.Float32BufferAttribute(sh, 3)); geo.setIndex(idx); geo.computeBoundingSphere(); return geo; };
    // 光るキノコのマテリアル（光るキノコの谷と同じ仲間の絵）：柄はうすく透け、かさの裏のひだがいちばん光り、かさの上は暗くて、点とすじとふちだけが光る
    const shroomMat = (() => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => { sh.uniforms.tGate = kit.U.tNoise; sh.uniforms.uFpTime = kit.U.uFpTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aSh; varying vec3 vSh, vLoc; varying float vSc, vUpN, vFres;')
          .replace('#include <project_vertex>', `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
            vec3 sN = normalize(mat3(instanceMatrix) * normal); vSh = aSh; vLoc = position; vSc = length(instanceMatrix[1].xyz); vUpN = sN.y;
            vFres = 1.0 - abs(dot(sN, normalize(cameraPosition - mvPosition.xyz)));
            mvPosition = viewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGate; uniform float uFpTime; varying vec3 vSh, vLoc; varying float vSc, vUpN, vFres;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          { vec3 tint = diffuseColor.rgb, c; float ang = atan(vLoc.z, vLoc.x), g = vSh.x * (0.82 + 0.18 * sin(uFpTime * 0.9 + vSc * 3.0));
            if (vSh.y < 0.5) c = (mix(vec3(0.8), tint, 0.45) * 0.4 + tint * g * 1.1 + vec3(g * g * 0.25)) * (0.84 + 0.16 * sin(ang * 13.0 + sin(vLoc.y * 9.0) * 1.5)) * (0.7 + 0.3 * smoothstep(0.0, 0.3, vLoc.y));
            else if (vSh.y < 1.5) { float ribs = 0.5 + 0.5 * sin(ang * 36.0); ribs *= ribs; float core = 1.0 - smoothstep(0.12, 1.0, vSh.z);
              c = tint * g * (0.2 + 0.85 * ribs * (0.4 + 0.6 * core) + 0.5 * core * core) + vec3(1.0) * g * g * 0.25 * core * core * (0.5 + 0.5 * ribs); }
            else { vec2 q = vLoc.xz * vSc; float n = texture2D(tGate, q * 1.1 + 0.3).g, n2 = texture2D(tGate, q * 0.5 + 0.7).r;
              float spots = smoothstep(0.64, 0.8, n) * smoothstep(0.35, 0.6, n2), veins = (1.0 - smoothstep(0.0, 0.04, abs(texture2D(tGate, q * 0.42 + 0.11).b - 0.5))) * (0.3 + 0.7 * vSh.z);
              float edge = smoothstep(0.55, 1.0, vSh.z), side = 1.0 - clamp(vUpN, 0.0, 1.0);
              c = mix(vec3(0.4), tint, 0.85) * 0.2 * (0.5 + 0.7 * clamp(vUpN, 0.0, 1.0)) + tint * g * (0.06 + 2.2 * spots + 1.0 * veins + 1.5 * edge * edge * edge + 0.1 * vFres * vFres * vFres + 0.55 * side * side) + vec3(1.0) * g * g * 0.35 * (spots + edge * edge * edge); }
            diffuseColor.rgb = kfGlow(c); }`); };
      m.customProgramCacheKey = () => 'gateShroom'; return m; })();
    const axis = V3(g.d[0], 0, g.d[1]), lean = (a) => new THREE.Quaternion().setFromAxisAngle(axis, a);      // 門の向きの軸でかたむける ＝ まん中へ、たおれかかる
    for (const [side, h, c] of [[BR_W + 1.2, 2.1, '#c59bff'], [-(BR_W + 1.2), 1.7, '#6fe8ff']]) {                                             // 分かれ目の目じるし：エルフの背より高いキノコ（本道から見える）
      const p = along(g, 0.2, side); big.push({ p, s: h, c, rx: (r() - 0.5) * 0.2, rz: (r() - 0.5) * 0.2 });
      lights.push({ p: p.clone().add(V3(0, 0.72 * h, 0)), size: h * 1.5, color: c, opacity: 0.32 }, { p: p.clone().add(V3(0, 0.07, 0)), size: h * 1.4, color: c, opacity: 0.22, flat: true });
      rise(p.clone().add(V3(0, 0.6 * h, 0)), 5, 3.2, [c, '#ffffff'], 1.0);
    }
    for (const [lx, lz, h, a, c] of [[-1.85, 0.7, 4.7, -0.2, '#6fe8ff'], [1.85, 0.7, 4.2, 0.25, '#c59bff'], [-3.0, 2.3, 3.1, -0.12, '#8fb4ff'], [3.1, 2.5, 2.7, 0.14, '#7ff2d2']]) {      // 門の 2 本と、うしろにひかえる 2 本
      const p = at(lx, -0.08, lz); big.push({ p, s: h, c, q: lean(a) });
      const cap = p.clone().add(V3(0, 0.76 * h, 0).applyQuaternion(lean(a)));
      lights.push({ p: cap.clone().add(V3(0, -0.25, 0)), size: h * 1.15, color: c, opacity: 0.3 }, { p: p.clone().add(V3(0, 0.07, 0)), size: h * 0.9, color: c, opacity: 0.24, flat: true });
      rise(cap.clone().add(V3(0, -0.4, 0)), 8, 2.6, [c, '#ffffff'], h * 0.7);                                                                      // かさのまわりに、ふわりと舞う胞子
    }
    instanced(shroomGeo(20, true), big, 'gate_valley_arch', shroomMat); instanced(shroomGeo(10, false), small, 'gate_valley_mushrooms', shroomMat);
    // 根のトンネル：門のうしろで、太い根が通り道をまたぐ（「入った」の線より奥 ＝ 歩いても当たらない）。わきに、苔むした倒木
    for (const [x0, x1, z0, z1, top, rad] of [[-2.7, 2.6, 1.9, 2.2, 3.3, 0.24], [-3.4, 2.1, 3.3, 3.0, 2.6, 0.2], [-1.9, 3.3, 4.4, 4.7, 2.9, 0.17]]) { const pts = [], ph = r() * 6;
      for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(at(lerp(x0, x1, u) + 0.12 * Math.sin(u * 9 + ph), -0.35 + Math.sin(Math.PI * u) * (top + 0.35) + 0.1 * Math.sin(u * 13 + ph), lerp(z0, z1, u) + 0.2 * Math.sin(u * 5 + ph))); }
      tube(pts, rad, { sides: 7, tip: 0.8, moss: 0.7, leaf: 0.9 }); }
    { const pts = []; for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push(at(lerp(-2.5, -3.6, u), 0.34 + 0.1 * u + 0.03 * Math.sin(u * 7), lerp(-3.6, 0.1, u))); } tube(pts, 0.36, { sides: 9, tip: 0.86, moss: 0.9 }); }      // 倒木
    for (const [lx, lz] of [[-2.4, -2.6], [2.5, -2.2], [-4.4, -1.0], [3.3, -0.8], [-5.0, 1.0], [5.2, 1.2], [2.4, -4.0], [-2.3, -4.4]]) fern(at(lx + (r() - 0.5) * 0.4, 0, lz), 0.8 + 0.5 * r(), pickOf(r, ['#d8fff0', '#c4f0e8', '#e4e8ff']));
    // 奥へつづく光の霧（門の間から見える）と、上へ立ちのぼる胞子（木の間から、遠くでも見える）
    const LC = dn ? '#ffe2a0' : '#9aa4ff', LC2 = dn ? '#ffd98a' : '#7f8cff';
    veil(at(0, 1.7, 1.6), yaw, 3.2, 3.4, LC, 0.5); veil(at(0, 2.0, 3.6), yaw, 5.2, 4.2, LC2, 0.36);
    lights.push({ p: at(0, 1.5, 2.2), size: 5.5, color: LC, opacity: 0.38 }, { p: at(0, 2.1, 4.4), size: 8.5, color: LC2, opacity: 0.36 }, { p: at(0, 3.0, 6.8), size: 11, color: dn ? '#ffd98a' : '#a08cff', opacity: 0.22 },
      { p: at(0, 6.2, 1.4), size: 7.5, color: dn ? '#ffe2a0' : '#8fa8ff', opacity: 0.22 }, { p: at(0, 0.07, 1.0), size: 7, color: '#6fe8ff', opacity: 0.28, flat: true }, { p: at(-1.4, 0.4, -1.2), size: 3, color: '#b8d8ff', opacity: 0.1 }, { p: at(1.5, 0.4, -0.6), size: 3, color: '#d0c4ff', opacity: 0.1 });
    rise(at(0, 0.2, 1.4), 40, 9.5, ['#9fe6ff', '#cbb0ff', dn ? GOLD : '#ffffff'], 3.4); rise(at(0, 0.2, 4.0), 16, 6, ['#9fb0ff', '#cbb0ff'], 3.0);
    for (let i = 0; i < 6; i++) rise(along(g, 0.2 + 0.6 * i / 5, (i % 2 ? -1 : 1) * (BR_W + 0.6)).add(V3(0, 0.3, 0)), 3, 2.4, ['#9fe6ff', '#cbb0ff'], 0.8);      // 道ぞいのキノコからも、少し
  }
  // ================================================================ 水晶の洞くつ：岩を組んだ口（中はトンネル。奥が青く光る）、まわりから生える水晶、冷たい霧。道にも小さな水晶
  { const { g, at, yaw, done: dn } = gate('cave'), rocks = [], cry = [], RC = ['#646c7a', '#747c88', '#868e98', '#5c6474'];
    const rock = (pos, s, moss = 0.5, det = 2) => { const geo = new THREE.IcosahedronGeometry(1, det), p = geo.attributes.position, sd = r() * 30;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.74 + 0.36 * vnoise(x * 1.3 + sd, y * 1.3 + z * 1.1 + sd) + 0.16 * vnoise(x * 3.4 + sd, y * 3.4 - z * 2.9 + sd); p.setXYZ(i, x * k, y * k, z * k); }      // でこぼこの岩（大きなうねり ＋ 細かい角）
      geo.computeVertexNormals(); rocks.push(put(tinted(geo, pickOf(r, RC), moss, '#5a7a66'), pos, yaw + (r() - 0.5) * 0.6, 0, 0, s)); };
    rock(at(-3.0, 0.9, 0.9), [1.5, 1.7, 1.4]); rock(at(-2.7, 2.7, 1.0), [1.25, 1.15, 1.2]); rock(at(3.1, 1.0, 0.9), [1.6, 1.8, 1.5]); rock(at(2.75, 2.85, 1.0), [1.2, 1.05, 1.2]);      // 口の左右の岩
    rock(at(0.05, 4.0, 1.1), [3.4, 0.95, 1.5], 0.7); rock(at(-0.6, 4.5, 1.9), [1.6, 0.8, 1.3], 0.8);                                                                           // 上にのる岩
    for (const lz of [3.2, 5.3]) { rock(at(-3.0, 1.3, lz), [1.7, 2.4, 1.9], 0.6); rock(at(3.1, 1.3, lz + 0.1), [1.7, 2.4, 1.9], 0.6); rock(at(0.1, 3.9, lz), [3.2, 1.1, 1.8], 0.7); }      // トンネルをつつむ岩（両わきと上）
    rock(at(0, 1.9, 7.4), [4.4, 3.4, 2.6], 0.6); rock(at(-4.3, 0.6, 1.6), [1.3, 1.0, 1.2]); rock(at(4.3, 0.7, 1.9), [1.4, 1.1, 1.3]); rock(at(-3.6, 0.35, -0.6), [0.8, 0.6, 0.7]); rock(at(3.5, 0.3, -1.0), [0.7, 0.5, 0.8]);      // うしろの山・わきの岩
    for (let i = 0; i < 14; i++) { const s = 0.12 + 0.22 * r(); rock(at((r() < 0.5 ? -1 : 1) * (1.5 + 2.8 * r()), s * 0.4, -3.2 + 4.2 * r()), [s * 1.3, s * 0.85, s], 0.3, 0); }      // 小石
    mesh(rocks.filter((q) => q.attributes.position.count > 100), stoneMat('#5a7a66', 0.75, 'gateStoneB'), 'gate_cave_rocks'); mesh(rocks.filter((q) => q.attributes.position.count <= 100), stoneMat('#5a7a66', 0.75, 'gateStoneB'), 'gate_cave_pebbles');
    // 口の中のトンネル（内がわだけ描く管）：口の近くは岩の色、奥ほど深い青。つきあたりは、青い光（黒い穴・平らな板に見えない）
    { const tg = new THREE.CylinderGeometry(1.3, 1.95, 5.0, 16, 5, true); tg.rotateX(Math.PI / 2); const p = tg.attributes.position, a = new Float32Array(p.count * 3), c0 = new THREE.Color('#39424f'), c1 = new THREE.Color(dn ? '#2a2414' : '#081a3a');
      for (let i = 0; i < p.count; i++) { const u = (p.getZ(i) + 2.5) / 5, n = 0.82 + 0.36 * vnoise(p.getX(i) * 2.3 + 5, p.getY(i) * 2.3 + p.getZ(i) * 1.7); col.copy(c0).lerp(c1, Math.pow(u, 0.7)).multiplyScalar(n); a.set([col.r, col.g, col.b], i * 3); }
      tg.setAttribute('color', new THREE.BufferAttribute(a, 3)); const tun = new THREE.Mesh(put(tg, at(0, 1.5, 3.7), yaw), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })); tun.name = 'gate_cave_tunnel'; group.add(tun);
      const eg = new THREE.CircleGeometry(1.32, 20), ep = eg.attributes.position, ea = new Float32Array(ep.count * 3), e0 = new THREE.Color(dn ? '#fff0c0' : '#bfeaff'), e1 = new THREE.Color(dn ? '#6a4a18' : '#12356a');
      for (let i = 0; i < ep.count; i++) { col.copy(e0).lerp(e1, sstep(Math.hypot(ep.getX(i), ep.getY(i)) / 1.32, 0.15, 1)); ea.set([col.r, col.g, col.b], i * 3); }
      eg.setAttribute('color', new THREE.BufferAttribute(ea, 3)); const end = new THREE.Mesh(put(eg, at(0, 1.45, 6.15), yaw + Math.PI), glowMat('#ffffff', true)); end.name = 'gate_cave_light'; group.add(end); }
    // 水晶：六角の柱 ＋ とがった先。面ごとに明るさがちがう（光を受けた面は白っぽい）
    const LD = V3(0.4, 0.8, 0.45).normalize(), CC = ['#7fd8ff', '#b39cff', '#9fe8ff'];
    const crystal = (pos, h, tiltX = 0, tiltZ = 0, hex = pickOf(r, CC)) => { const rad = h * (0.15 + 0.05 * r());
      const a = new THREE.CylinderGeometry(rad * 0.86, rad, h * 0.72, 6, 1).translate(0, h * 0.36, 0).toNonIndexed(), b = new THREE.ConeGeometry(rad * 0.86, h * 0.3, 6).translate(0, h * 0.87, 0).toNonIndexed(), geo = mergeGeometries([a, b]);
      put(geo, pos, r() * 6.283, tiltX, tiltZ); geo.computeVertexNormals(); const p = geo.attributes.position, nn = geo.attributes.normal, ca = new Float32Array(p.count * 3), y0 = pos.y;
      for (let i = 0; i < p.count; i++) { const li = Math.abs(nn.getX(i) * LD.x + nn.getY(i) * LD.y + nn.getZ(i) * LD.z); col.set(hex).multiplyScalar(0.5 + 0.75 * li).lerp(tmp.set('#ffffff'), 0.45 * sstep(p.getY(i) - y0, h * 0.55, h * 1.02) + 0.25 * li * li); ca.set([col.r, col.g, col.b], i * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(ca, 3)); cry.push(geo); };
    const cluster = (c, n, hs, spread, lean, hex) => { for (let i = 0; i < n; i++) { const a = r() * 6.283, d = spread * Math.sqrt(r()); crystal(c.clone().add(V3(Math.cos(a) * d, 0, Math.sin(a) * d)), hs * (i === 0 ? 1 : 0.4 + 0.5 * r()), Math.sin(a) * lean * (0.5 + r()), -Math.cos(a) * lean * (0.5 + r()), hex); } };
    cluster(at(-1.85, 0, 0.5), 6, 2.3, 0.4, 0.3, '#7fd8ff'); cluster(at(1.9, 0, 0.6), 6, 2.0, 0.4, 0.3, '#b39cff'); cluster(at(-3.7, 0, -0.5), 4, 1.4, 0.4, 0.35); cluster(at(3.8, 0, -0.4), 4, 1.3, 0.4, 0.35);      // 口の両わき
    cluster(at(-1.0, 0, 2.9), 4, 1.2, 0.3, 0.35, '#9fe8ff'); cluster(at(1.05, 0, 3.6), 4, 1.1, 0.3, 0.35, '#b39cff'); cluster(at(-0.7, 0, 5.0), 3, 0.9, 0.25, 0.3); cluster(at(0.6, 0, 5.6), 3, 0.8, 0.25, 0.3, '#9fe8ff');   // トンネルの中
    for (const [lx, ly, lz, hs] of [[-2.2, 3.5, 0.3, 1.0], [2.0, 3.7, 0.4, 0.9], [-3.4, 2.3, 0.1, 0.8], [3.5, 2.5, 0.2, 0.8]]) crystal(at(lx, ly, lz), hs, (r() - 0.5) * 0.5 + 0.9, (r() - 0.5) * 1.6);      // 岩の上・すき間から、ななめに生える
    for (const [lx, ly, lz, hs] of [[-0.7, 3.3, 1.3, 0.6], [0.8, 3.25, 1.6, 0.75], [0.0, 2.9, 3.4, 0.6]]) crystal(at(lx, ly, lz), hs, Math.PI + (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);      // 天井からさがる
    for (let i = 0; i < 7; i++) { const p = along(g, 0.06 + 0.66 * (i + r() * 0.4) / 7, (i % 2 ? -1 : 1) * (BR_W + 0.3 + r() * 0.5)), hex = pickOf(r, CC); cluster(p, 3, 0.6 + 0.45 * r(), 0.18, 0.4, hex);      // 道しるべの小さな水晶
      lights.push({ p: p.clone().add(V3(0, 0.4, 0)), size: 1.7, color: hex, opacity: 0.3 }); }
    mesh(cry, glowMat('#ffffff', true), 'gate_cave_crystals');
    for (const [lx, lz, hex] of [[-1.85, 0.4, '#6fd0ff'], [1.9, 0.5, '#a884ff'], [-3.7, -0.6, '#6fd0ff'], [3.8, -0.5, '#a884ff'], [-1.0, 2.8, '#8fe0ff'], [1.05, 3.5, '#a884ff']]) lights.push({ p: at(lx, 0.8, lz), size: 2.8, color: hex, opacity: 0.32 });
    for (const [lx, lz] of [[-2.6, -1.6], [2.7, -1.9], [-4.6, 0.2], [4.6, 0.4], [-5.2, -1.8], [5.0, -2.4]]) fern(at(lx + (r() - 0.5) * 0.4, 0, lz), 0.7 + 0.4 * r(), pickOf(r, ['#d8f4ff', '#c8e8f0', '#e8f0ff']));
    // 光：中からもれる青い光（光の霧 2 枚）と、足もとを流れる冷たい霧
    const LC = dn ? '#ffe2a0' : '#8fd8ff';
    veil(at(0, 1.5, 1.6), yaw, 3.2, 3.0, LC, 0.22); veil(at(0, 1.5, 3.6), yaw, 2.6, 2.8, dn ? '#ffd98a' : '#6fb8ff', 0.34);
    lights.push({ p: at(0, 1.5, 3.0), size: 5, color: dn ? '#ffd98a' : '#6fd0ff', opacity: 0.4 }, { p: at(0, 1.4, 5.4), size: 4, color: dn ? '#fff0c0' : '#bfe8ff', opacity: 0.5 }, { p: at(0, 5.6, 1.0), size: 7, color: dn ? '#ffe2a0' : '#8fb4ff', opacity: 0.2 },
      { p: at(0, 0.07, 0.2), size: 7, color: '#9fc8ff', opacity: 0.3, flat: true }, { p: at(0, 0.1, -2.2), size: 5.5, color: '#b8d4ff', opacity: 0.16, flat: true },
      { p: at(-1.6, 0.45, -1.0), size: 3.4, color: '#c8e0ff', opacity: 0.12 }, { p: at(1.7, 0.4, -1.8), size: 3.2, color: '#c8e0ff', opacity: 0.12 }, { p: at(0.2, 0.5, -3.4), size: 3.6, color: '#c8e0ff', opacity: 0.09 });
    rise(at(0, 0.3, 1.0), 26, 6.5, ['#8fe0ff', '#b9a0ff', dn ? GOLD : '#ffffff'], 3.0);
  }
  // ================================================================ まとめて描くもの
  if (wood.nv) { const m = new THREE.Mesh(wood.toGeometry(), kit.createBarkMaterial()); m.name = 'gate_wood'; m.frustumCulled = false; group.add(m); }      // つる・根・倒木
  { const pg = new PlantGeo(), green = new THREE.Color('#ffffff');                                                                                // つるの葉のかたまり（葉の板 5 枚）
    for (let k = 0; k < 5; k++) { const a = r() * 6.283, e = (r() - 0.5) * 1.6, right = V3(Math.cos(a), 0, Math.sin(a)), up = V3(-Math.sin(a) * Math.sin(e), Math.cos(e), Math.cos(a) * Math.sin(e));
      pg.quad(V3((r() - 0.5) * 0.3, (r() - 0.5) * 0.24, (r() - 0.5) * 0.3), right, up, 0.36, 0.36, TILE.leaves, green, 0.3, 0.7); }
    instanced(pg.toGeometry(), ivy, 'gate_ivy'); }
  instanced(buildFern(7), ferns, 'gate_ferns'); instanced(buildWildflowers(9), flowers, 'gate_flowers');
  // 光の霧：加算の板。ふちはやわらかく消え、うすい霧がゆっくり上へ流れる
  if (veils.length) { const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: kit.U.uFpTime, tNoise: kit.U.tNoise }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'attribute vec4 aV; varying vec4 vV; varying vec2 vUv; varying vec3 vW; void main(){ vV = aV; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime; varying vec4 vV; varying vec2 vUv; varying vec3 vW;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0, e = (1.0 - x * x) * smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
          float n = texture2D(tNoise, vec2(vW.x + vW.z, vW.y - uFpTime * 0.07) * 0.21).g, n2 = texture2D(tNoise, vec2(vW.x - vW.z, vW.y - uFpTime * 0.13) * 0.47 + 0.3).r;
          gl_FragColor = vec4(vV.rgb, e * e * (0.45 + 0.9 * n * n2 * 2.0) * vV.a * (0.9 + 0.1 * sin(uFpTime * 0.7 + vW.x)) * smoothstep(1.2, 4.0, distance(cameraPosition, vW))); }` });      // カメラのすぐ近くでは消える（門から出てきたとき、画面が光でうまらない）
    const vm = new THREE.Mesh(mergeGeometries(veils), m); vm.name = 'gate_veil'; vm.frustumCulled = false; vm.renderOrder = 5; group.add(vm); }
  // 立ちのぼる光の粒：加算の点。位置はシェーダーで時間から計算
  { const n = sparks.length, pos = new Float32Array(n * 3), aS = new Float32Array(n * 3), cc = new Float32Array(n * 3);
    sparks.forEach((s, i) => { pos.set([s.x, s.y, s.z], i * 3); aS.set([s.s, s.H, s.k], i * 3); col.set(s.c); cc.set([col.r, col.g, col.b], i * 3); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aS', new THREE.BufferAttribute(aS, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: kit.U.uFpTime, uPR: kit.U.uPR }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: true,
      vertexShader: `attribute vec3 aS; uniform float uFpTime, uPR; varying vec4 vC;
        void main(){ float u = fract(aS.x + uFpTime * (0.03 + 0.035 * fract(aS.x * 7.31))), ph = aS.x * 40.0;
          vec3 p = position + vec3(sin(uFpTime * 0.6 + ph) * 0.35 * u + sin(u * 9.0 + ph) * 0.15, u * aS.y, cos(uFpTime * 0.5 + ph * 0.77) * 0.35 * u);
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aS.z * uPR * 46.0 / max(-mv.z, 0.5), 1.5 * uPR, 14.0 * uPR);
          vC = vec4(color, smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.55, 1.0, u)) * (0.6 + 0.4 * sin(uFpTime * 2.3 + ph))); }`,
      fragmentShader: `varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(vC.rgb, a * a * vC.a * 0.9); }` });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 7; pts.name = 'gate_sparks'; group.add(pts);
  }
  // にじむ光：カメラのすぐ近くの板は消す（門から出てきたとき、カメラが光の中に入って、画面が白くならないように）
  const cards = kit.createGlowCards(lights, 'gate_glow');
  cards.material.vertexShader = cards.material.vertexShader.replace('gl_Position = projectionMatrix * mv;', 'if (aFx.x < 0.5) vCol.a *= smoothstep(1.0, 4.5, -mv.z); gl_Position = projectionMatrix * mv;');
  group.add(cards);
  return group;
}
