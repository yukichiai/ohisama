// =====================================================================
// エリア⑤「苔むした遺跡」＝ 長い時間がたって、森にのみこまれた古い遺跡。
// 入口 → 石だたみの参道（苔の石柱、くずれたアーチ、つる、すき間から落ちる金色の光の筋）→ 石段 → 奥の石柱の広場（光の門の石柱・祭壇・床の光る模様）。広場の奥の森のむこうに、大きな遺跡の影
// （歩くテスト場面。本編にはまだ組みこんでいない）
// 今あるファイル（nature.js など）は import して使うだけ。光・森の部品・音・操作・エリアの行き来は area_kit.js（ほかのエリアと同じもの）。
// このファイルは、遺跡だけのもの：
//   形（pathX・floorY・groundH・footH・constrain）/ createGround（石だたみ・広場の円い床・ひび・落ち葉・床の光る模様）
//   石：createStoneMaterial（目地・雨だれ・すりへった角・苔・彫りこんだ模様）・Stones（切り出した石と円柱を 1 つの形にまとめる道具）・addPillar / addArch / addWall / addBasin・buildRuins（参道と広場の石組み＝1 回で描く）
//   buildFarRuin（遠くの大きな遺跡の影）/ buildVines（石にからむ・たれさがる つる）/ createBasinWater（石の器の水）
//   光の門の石柱：placeGates（置く所と向きの一覧）・createGates（一覧 → メッシュ）＝ あとでミニゲーム（石柱の向きをそろえて光を通す）で 1 本ずつ回せるよう、別にしてある
//   createRuinTrees・createRuinCanopy（森と、石にからむ葉）/ createPlants
// あとでミニゲームを置く所：奥の広場（COURT。まん中の直径 8 m は何も置いていない）。門の石柱の一覧は window.__ruins.gates、祭壇は .places.ALTAR
// 確認用：?lite=1 ?wc=0 ?shot=1 ?debug=1 ?at=x,z,向き°,上下° ?t=秒   window.__ruins.bench() / .view('A'〜'C') / .preview()
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windU, createGrass, createSky } from './nature.js';
import { areaParams, clamp, lerp, sstep, V3, rng, hash2, vnoise, glf, glc, pickOf, gustAt, TubeGeo,
  buildFern, buildTuft, buildBell, buildWildflowers,
  createAreaKit, createAreaAudio, createWalkControls, createViewWalker, newPlayer, wireStart, createTravel, createStage, createTools, runLoop } from './area_kit.js';
import { createMagicCircle, SUN_CIRCLE_KEYS } from './magic_circle.js';      // 太陽の魔法陣（共通部品。使い方は magic_circle.md）

const { params, LITE } = areaParams();
const SUN_GAME = params.get('game') === 'sun';                     // 「おひさまのかけら」：祭壇の光る石を出さず、その場所（台の上）に太陽のかけらを置く。広場の床の大きな輪と文字は光らせない

// ---------------------------------------------------------------- 数値（ここを直せばよい）
export const RUINS = {
  path: { len: 38, halfW: 1.4, pave: 1.75, swing: 2.0 },           // 参道：長さ・歩ける幅の半分・石だたみの幅の半分・左右へのふくらみ（m）
  backZ: 5.4,                                                      // 入口の後ろ：ここより奥へ歩くと、大樹の広場へ戻る
  court: { r: 6.8, sink: 0.8 },                                    // 奥の石柱の広場（歩ける半径、参道より低い高さ）
  step: { n: 4, run: 1.0 },                                        // 広場へおりる石段：段の数・1 段の奥行き（m）
  circle: { r: 1.8 },                                              // 太陽の魔法陣（広場のまん中）の半径 m
  pieceCamH: 2.1,                                                  // 太陽ゲーム：祭壇の上のかけらを拾う演出の、カメラの高さの下限 m（受け皿の上 1.44 m より高く）
  far: { z: -76, y: -3, span: 20, hL: 35, hR: 27, shade: 0.32 },   // 遠くの大きな遺跡：場所・塔と塔の間・左右の塔の高さ（m）・石の暗さ
  arches: [{ s: 7, gap: null }, { s: 18.5, gap: [4, 6] }, { s: 29.5, gap: null }],   // アーチ（道のり m。gap ＝ くずれて無い石の番号）
  eye: 1.55, speed: 2.5, fov: 70,                                  // 目の高さ・歩く速さ・視野（ほかのエリアと同じ）
  sun: new THREE.Vector3(-0.46, 0.7, -0.42).normalize(),
  canopyH: 9,
  light: { sky: '#f0eac4', ground: '#66754c', hemiI: 1.5, sun: '#ffe2a0', sunI: 0.7, tree: '#ffeeb0', treeGlow: 0.2 },   // tree＝広場に落ちる光
  // 夜の色（昼と夜のスイッチ。area_kit.js の createDayNight）：景色に掛ける色・自分で光る色の強さ・にじむ光の板の強さ・光の筋の強さ・霧と空の色
  night: { tint: [0.36, 0.42, 0.68], glow: 1.9, cards: 1.7, shaft: 0.45, fog: { nearCol: '#20264a', midCol: '#2c3260', farCol: '#3c4278', glowCol: '#8fd8e8' }, sky: { zen: '#0b1030', hor: '#3a3e7a' } },
  fog: { near: 6, far: 72, nearCol: '#8fa174', midCol: '#c0c38c', farCol: '#efe4b2', glowCol: '#fff2b4', mist: 0.34, glowAmt: 0.7, glowPow: 3.5 },
  sky: { zen: '#9cc0d8', hor: '#f6edc6', low: '#efe4b2', sun: '#fff0c0', cloud: '#fff8e4', cloudSh: '#d8d2b4' },
  grade: { sat: 1.06, mul: [1.045, 1.0, 0.925], add: [0.014, 0.008, 0.0] },      // 水彩の効果の色味（金色がかった、古びた色）
  dapple: { col: [1.0, 0.86, 0.5], gain: 2.7, map: { x0: -20, z0: -56, w: 40, d: 68 } },
  shaft: { col: '#ffe49c', amt: 0.62 },
  trunk: { bark: '#4f463c', bark2: '#695a48', moss: '#6a8f48' },
  leaves: ['#46663a', '#628244', '#84a04e', '#a8b85a', '#cbc96c', '#e6dc8e', '#c4d49c'],      // 黄みがかった緑
  stone: ['#989280', '#c4bca2'], moss: '#5c8c44', rune: '#7ff2d2',  // 石の色、苔、光る模様（青緑）
  turf: { soil: ['#57683c', '#7f9450', 0.3, 0.7, 0.82, 0.36], deep: '#588e3c', light: '#aed062', tip: '#f0eca0' },      // ふさふさの草：根元の色（＝ 地面の土の式）・葉の色のはば・先の色
  count: LITE
    ? { canopy: 2350, grass: 0.25, fern: 150, tuft: 90, bell: 30, flower: 50, motes: 110, butterflies: 4 }
    : { canopy: 4300, grass: 0.45, fern: 280, tuft: 160, bell: 55, flower: 100, motes: 200, butterflies: 7 },
};
const P = RUINS.path, CO = RUINS.court, SUN = RUINS.sun, L = RUINS.light;

// ---------------------------------------------------------------- 形（歩ける所・地面の高さ）
export function pathX(z) { const k = clamp(-z / P.len, 0, 1); return P.swing * Math.sin(k * 3.4) * sstep(k, 0, 0.35); }
const PATHX_GLSL = `float mrPathX(float z){ float k = clamp(-z / ${glf(P.len)}, 0.0, 1.0); return ${glf(P.swing)} * sin(k * 3.4) * smoothstep(0.0, 0.35, k); }`;
const pathSlope = (z) => (pathX(z + 0.05) - pathX(z - 0.05)) / 0.1;
const CX = pathX(-P.len), CZ = -(P.len + CO.r - 0.8), PATH_Z0 = RUINS.backZ + 1.0, PATH_Z1 = -(P.len + 1.5);       // 広場の中心、参道の帯の両はし
const ALTAR = { x: CX, z: CZ - 3.6, r: 1.25 };                     // 祭壇（広場の奥）
const STEP = { ...RUINS.step, s0: P.len - 4.5 };                   // 石段のはじまり（道のり m）
const floorY = (z) => -CO.sink * clamp((-z - STEP.s0) / (STEP.n * STEP.run), 0, 1);     // 参道のおわりで、広場へくだる（歩く高さ＝カメラの高さは、まっすぐな坂）
const stepTop = (k) => -CO.sink / STEP.n * k + 0.015;              // k 段めの石段の、上の面の高さ
export function walkSd(x, z) {
  const zc = clamp(z, PATH_Z1, PATH_Z0), sl = pathSlope(zc);
  return Math.min(Math.hypot(x - CX, z - CZ) - CO.r, Math.hypot((x - pathX(zc)) / Math.sqrt(1 + sl * sl), z - zc) - P.halfW);
}
export function groundH(x, z) {
  const sd = walkSd(x, z); let h = floorY(z);
  if (sd > 0.6) h += sstep(sd, 0.6, 12) * 3.2 + (vnoise(x * 0.2 + 3.1, z * 0.2) - 0.5) * 1.5 * sstep(sd, 0.6, 7) + (vnoise(x * 0.9 + 7, z * 0.9) - 0.4) * 0.28 * sstep(sd, 0.6, 3);
  return h;
}
// エルフの足の高さ：石段では、今いる段の上の面
export function footH(x, z) {
  const s = -z - STEP.s0;
  if (s > 0 && s < STEP.n * STEP.run && Math.abs(x - pathX(z)) < P.pave + 0.15) return stepTop(Math.floor(s / STEP.run));
  return groundH(x, z);
}
const OBST = [];                                                    // 入れない所（門の石柱・祭壇）
export function constrain(x, z) {
  const inPath = (px, pz) => pz <= PATH_Z0 && pz >= PATH_Z1 && Math.abs(px - pathX(pz)) <= P.halfW;
  const dx = x - CX, dz = z - CZ, d = Math.hypot(dx, dz);
  if (d > CO.r && !inPath(x, z)) {
    const zc = clamp(z, PATH_Z1, PATH_Z0), cx = pathX(zc), ax = clamp(x, cx - P.halfW, cx + P.halfW), bx = CX + dx / d * CO.r, bz = CZ + dz / d * CO.r;
    if (Math.hypot(ax - x, zc - z) <= Math.hypot(bx - x, bz - z)) { x = ax; z = zc; } else { x = bx; z = bz; }
  }
  for (const o of OBST) { const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz); if (od < o.r) { const k = o.r / Math.max(od, 1e-4); x = o.x + ox * k; z = o.z + oz * k; } }
  return [x, z];
}

// ---------------------------------------------------------------- 共通の部品（area_kit.js）と three.js の準備
const COURT_GLOW = V3(CX, floorY(CZ) + 5.5, CZ);                    // 広場に落ちる光（霧がここだけ金色に明るい）
const kit = createAreaKit({ ...RUINS, lite: LITE, glowPos: COURT_GLOW });
const fpU = kit.U, { addDapple, createGlowCards } = kit;
kit.installFog();
const stage = createStage({ params, U: fpU, fov: RUINS.fov, background: RUINS.fog.farCol, fog: RUINS.fog, grade: RUINS.grade });
const { renderer, scene, camera, composer } = stage;
scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemiI));
const sun = new THREE.DirectionalLight(L.sun, L.sunI); sun.position.copy(SUN).multiplyScalar(60); scene.add(sun, sun.target);
const HASH_GLSL = 'float mrHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }';
// 光る模様の明るさ：ゆっくり明滅し、近づくと明るくなる
const RUNE_GLSL = `float mrRune(vec3 wp){ return (0.3 + 0.7 * (1.0 - smoothstep(3.0, 15.0, distance(wp, cameraPosition)))) * (0.72 + 0.28 * sin(uFpTime * 0.9 + wp.x * 0.6 + wp.z * 0.5)); }`;

// ================================================================ 地面
// ---------------------------------------------------------------- 地面：森の土と草、苔のはえた石だたみの参道（角が欠け、ひびが入り、ところどころ石がぬけている）、広場の円い石の床（大きなひび・ふちにたまった土と苔）、落ち葉。床の光る模様は、かげを掛けたあとに足す
// 落ち葉はシェーダーで描く（板をふやさない）。p ＝ ます目の中の場所、dens ＝ 多さ。戻り値 ＝（葉があるか, 色を決める数）
const LEAF_GLSL = `vec2 mrLeaf(vec2 p, float dens){ vec2 c = floor(p), f = fract(p) - 0.5; float h = mrHash(c + 17.3), a = h * 6.2832;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * (f - (vec2(mrHash(c + 3.1), mrHash(c + 9.7)) - 0.5) * 0.36);
  float d = length(q * vec2(3.3, 7.2)) + abs(q.y) * 2.2;
  return vec2((1.0 - smoothstep(0.8, 1.0, d)) * step(1.0 - dens, fract(h * 7.31)), fract(h * 13.7)); }`;
export function createGround() {
  const X0 = -36, X1 = 36, Z0 = -74, Z1 = 22, cell = LITE ? 1.1 : 0.85;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / cell), Math.round((Z1 - Z0) / cell));
  geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, groundH(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tMr = fpU.tNoise;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tMr; float mrPave, mrR, mrWear, mrLeafK; vec2 mrQ;\n${PATHX_GLSL}\n${HASH_GLSL}\n${LEAF_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 wp = vFogWorld;
        float n1 = texture2D(tMr, wp.xz * 0.045).g, n2 = texture2D(tMr, wp.xz * 0.31).r, n3 = texture2D(tMr, wp.xz * 1.9).r;
        float zc = clamp(wp.z, ${glf(PATH_Z1)}, ${glf(PATH_Z0 + 3)}), px = wp.x - mrPathX(zc);
        float dPa = length(vec2(max(abs(px) - ${glf(P.pave)}, 0.0), wp.z - zc)) + abs(px) - max(abs(px), ${glf(P.pave)}) + (n2 - 0.5) * 0.9;
        mrQ = wp.xz - vec2(${glf(CX)}, ${glf(CZ)}); mrR = length(mrQ);
        float dCo = mrR - ${glf(CO.r + 0.5)} + (n2 - 0.5) * 0.8;
        vec3 soil = mix(${glc('#57683c')}, ${glc('#7f9450')}, smoothstep(0.3, 0.7, n1)) * (0.82 + 0.36 * n2);
        vec3 mossJ = ${glc('#4c7a3a')} * (0.8 + 0.4 * n2);
        // 参道の石だたみ：1 段おきにずらした長方形の石
        vec2 sq = vec2(px / 1.15, wp.z / 0.85); sq.x += 0.5 * mod(floor(sq.y), 2.0); vec2 sc = floor(sq), sf = fract(sq) - 0.5; float id = mrHash(sc), id2 = mrHash(sc + 3.7);
        // 広場の床：輪になった石
        float ring = floor(mrR / 1.05), cnt = 6.0 * (ring + 1.0), ang = atan(mrQ.y, mrQ.x) / 6.2832 + 0.5, ca = ang * cnt + 0.5 * mod(ring, 2.0);
        vec2 cf = vec2(fract(mrR / 1.05) - 0.5, (fract(ca) - 0.5) * (1.0 - 0.3 / cnt)); float cid = mrHash(vec2(ring, floor(ca))), cid2 = mrHash(vec2(floor(ca) + 5.0, ring));
        float inCo = 1.0 - smoothstep(-0.3, 0.2, dCo), inPa = (1.0 - smoothstep(-0.3, 0.2, dPa)) * (1.0 - inCo);
        vec2 f = mix(sf, cf, inCo); float i1 = mix(id, cid, inCo), i2 = mix(id2, cid2, inCo);
        // 石の形：角はまるく、ふちは少しがたがた。いくつかは、角がななめに大きく欠けている
        float dS = length(max(abs(f) - 0.34, 0.0)) - 0.09 + (n3 - 0.5) * 0.05;
        dS = max(dS, dot(f, vec2(i1 > 0.5 ? 1.0 : -1.0, fract(i1 * 2.0) > 0.5 ? 1.0 : -1.0)) - (0.5 + 0.45 * i2));
        float sl = 1.0 - smoothstep(-0.015, 0.03, dS), rim = smoothstep(-0.14, -0.01, dS);
        // 石を横切るひび（いくつかの石だけ）と、広場の床を走る大きなひび
        float cA = i2 * 6.2832, crack = (1.0 - smoothstep(0.004, 0.024, abs(dot(f, vec2(cos(cA), sin(cA))) + (n3 - 0.5) * 0.08 + (i1 - 0.5) * 0.2))) * step(0.6, fract(i1 * 5.3));
        float big = texture2D(tMr, wp.xz * 0.075 + 0.31).g; crack = max(crack, (1.0 - smoothstep(0.004, 0.03, abs(big - 0.5))) * inCo);
        float gone = max(smoothstep(0.6, 0.68, n1 * 0.7 + id * 0.45) * (1.0 - inCo), step(0.9, cid) * step(3.5, ring) * inCo);      // ぬけた石（草と苔になる）。広場は、ふちに近い所だけ
        vec3 stone = mix(${glc(RUINS.stone[0])}, ${glc(RUINS.stone[1])}, i1) * (0.84 + 0.3 * n3) * (1.0 + dot(f, vec2(i1 - 0.5, i2 - 0.5)) * 0.5);   // 石ごとに、色と、かたむき（明るさのむら）がちがう
        stone *= 1.0 - 0.2 * rim;                                                                              // ふちのよごれ
        stone = mix(stone, mossJ * 0.5, crack * 0.85);
        stone = mix(stone, mossJ, smoothstep(0.5, 0.72, n2 * 0.6 + n3 * 0.5 + rim * 0.22) * 0.65);            // 石の上の苔（ふちからひろがる）
        stone = mix(stone, mossJ * 0.8, inCo * smoothstep(${glf(CO.r - 1.7)}, ${glf(CO.r + 0.3)}, mrR + (n2 - 0.5) * 1.3) * 0.75);   // 広場のふちには、土と苔がたまっている
        mrPave = max(inPa, inCo) * (1.0 - gone);
        mrWear = 0.4 + 0.6 * smoothstep(0.28, 0.6, n2 * 0.55 + n3 * 0.45);                                   // 光る模様は、ところどころ、すりへって消えかけている
        vec3 bed = mix(soil * 0.6, mossJ * 0.9, smoothstep(0.3, 0.7, n3 * 0.6 + n2 * 0.4)) * (0.8 + 0.2 * sl);         // ぬけた石のあと：石の形にくぼんだ、土と苔
        vec3 col = mix(soil, mix(mix(mix(soil * 0.55, mossJ * 0.7, smoothstep(0.35, 0.65, n2)), stone, sl), bed, gone), max(inPa, inCo));      // 石のすき間は、土と苔
        // 落ち葉（黄・だいだい・茶）：石だたみと広場の上。ふちに近いほど多い。遠くは描かない
        float lm = max(inPa, inCo) * (1.0 - smoothstep(9.0, 20.0, distance(wp, cameraPosition)));
        mrLeafK = 0.0;
        if (lm > 0.01) {
          float ld = clamp(0.06 + 0.42 * smoothstep(0.38, 0.66, n1 * 0.5 + n2 * 0.5) + 0.32 * max(smoothstep(0.8, 1.7, abs(px)) * (1.0 - inCo), smoothstep(${glf(CO.r - 2.6)}, ${glf(CO.r)}, mrR) * inCo), 0.0, 0.8);
          vec2 l1 = mrLeaf(wp.xz * 3.3, ld), l2 = mrLeaf(wp.xz * 5.1 + 7.3, ld * 0.6), lf = l1.x > l2.x ? l1 : l2;
          vec3 lc = mix(mix(${glc('#d6b44c')}, ${glc('#b88034')}, smoothstep(0.25, 0.6, lf.y)), ${glc('#6e5432')}, step(0.7, lf.y)) * (0.8 + 0.4 * n3);
          mrLeafK = lf.x * lm; col = mix(col, lc, mrLeafK);
        }
        diffuseColor.rgb = col;
      }`);
  };
  m.customProgramCacheKey = () => 'ruinsGround' + (SUN_GAME ? 'Sun' : '');
  addDapple(m);
  const shaded = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    shaded.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${RUNE_GLSL}\nvoid main() {`).replace('#include <opaque_fragment>', `{
        vec3 wp = vFogWorld; float ang = atan(mrQ.y, mrQ.x);
        // 広場の床：外がわの大きな輪 2 本と、その間の文字だけ（まん中は、太陽の魔法陣 ＝ magic_circle.js が描く）
        float g = 0.5 * (1.0 - smoothstep(0.0, 0.04, abs(mrR - 5.9))) + 0.4 * (1.0 - smoothstep(0.0, 0.04, abs(mrR - 5.3)));
        vec2 gc = vec2(fract(ang / 6.2832 * 64.0) - 0.5, (mrR - 5.6) / 0.34); float gi = mrHash(vec2(floor(ang / 6.2832 * 64.0), 3.0));
        float mark = max(step(abs(gc.x), 0.09) * step(abs(gc.y), 0.36), step(abs(gc.y - (gi - 0.5) * 0.5), 0.09) * step(abs(gc.x), 0.3));
        mark = max(mark, step(abs(length(gc * vec2(1.0, 0.8)) - 0.26), 0.07) * step(0.55, fract(gi * 7.13)));
        g += 0.4 * mark * step(abs(gc.y), 0.5);
        g *= ${SUN_GAME ? '0.0' : `step(mrR, ${glf(CO.r)})`};                      // 太陽ゲームでは、広場の床の輪と文字は光らない（魔法陣に見えるので。石の床はそのまま）
        // 参道のところどころに、輪の模様のある石
        float zc = clamp(wp.z, ${glf(PATH_Z1)}, ${glf(PATH_Z0)}); vec2 sq = vec2((wp.x - mrPathX(zc)) / 1.15, wp.z / 0.85); sq.x += 0.5 * mod(floor(sq.y), 2.0); vec2 sf = fract(sq) - 0.5;
        float sid = mrHash(floor(sq) + 7.0), sr = length(sf * vec2(1.15, 0.85));
        g += step(0.9, sid) * ((1.0 - smoothstep(0.0, 0.035, abs(sr - 0.26))) + (1.0 - smoothstep(0.0, 0.03, abs(sr - 0.12)))) * step(${glf(CO.r + 0.6)}, mrR) * 0.8;
        outgoingLight += kfGlow(${glc(RUINS.rune)}) * clamp(g, 0.0, 1.4) * mrPave * mrWear * (1.0 - 0.85 * mrLeafK) * mrRune(wp) * 0.62;
      }\n#include <opaque_fragment>`);
  };
  const mesh = new THREE.Mesh(geo, m); mesh.name = 'ground';
  return { mesh, X0, X1, Z0, Z1 };
}
function createFieldTextures(G) {
  const cell = 0.5, nx = Math.round((G.X1 - G.X0) / cell) + 1, ny = Math.round((G.Z1 - G.Z0) / cell) + 1, half = new Uint16Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = G.X0 + i * cell, z = G.Z0 + j * cell, zc = clamp(z, PATH_Z1, PATH_Z0 + 3), sdPave = Math.min(Math.hypot(x - CX, z - CZ) - CO.r - 0.5, Math.hypot(x - pathX(zc), z - zc) - P.pave);
    const g = sstep(sdPave, 0.0, 0.7) * 0.7;                                        // 石だたみと広場には生やさない。森の中は短い草
    half[(j * nx + i) * 2] = THREE.DataUtils.toHalfFloat(groundH(x, z)); half[(j * nx + i) * 2 + 1] = THREE.DataUtils.toHalfFloat(g);
  }
  const field = new THREE.DataTexture(half, nx, ny, THREE.RGFormat, THREE.HalfFloatType);
  field.magFilter = field.minFilter = THREE.LinearFilter; field.needsUpdate = true;
  const map = { x0: G.X0, z0: G.Z0, w: G.X1 - G.X0, d: G.Z1 - G.Z0, hx0: G.X0, hz0: G.Z0, hcell: cell, nx, ny };
  const c = document.createElement('canvas'); c.width = c.height = 8; const g2 = c.getContext('2d'); g2.fillStyle = '#86a455'; g2.fillRect(0, 0, 8, 8);
  const groundTex = new THREE.CanvasTexture(c); groundTex.colorSpace = THREE.SRGBColorSpace;
  return { field, map, groundTex };
}

// ================================================================ 石
// ---------------------------------------------------------------- 石のマテリアル：石のはだ・ひび・積んだ石の目地・雨だれ・すりへった角・根もとのよごれ・苔（上の面／まだら／目地／根もと）＋ ほのかに光る、彫りこんだ模様
// 頂点ごとの数：aGl ＝（光る強さ, 模様の横の位置, 縦の位置 0〜1, 地面からの高さ m）、aSt ＝（横の位置 ÷ 石 1 個の長さ（円柱は −1）, 積んだ段の数, 上の面の苔の量, ふちなら 1）
function createStoneMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tMr = fpU.tNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aGl, aSt; varying vec4 vGl, vSt; varying float vUp;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvUp = dot(normalize(transformedNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); vGl = aGl; vSt = aSt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nuniform sampler2D tMr; varying vec4 vGl, vSt; varying float vUp; float mrMoss, mrMark;\n${HASH_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 wp = vFogWorld;
        bool flatUp = abs(vUp) > 0.7; vec2 pA = flatUp ? wp.xz : wp.xy, pB = flatUp ? wp.zx + 3.1 : wp.zy;      // 上を向いた面は、真上から見た模様
        float n1 = texture2D(tMr, wp.xz * 0.19 + wp.y * 0.11).g, n2 = 0.5 * (texture2D(tMr, pA * 0.27).r + texture2D(tMr, pB * 0.27 + 0.37).r), n3 = 0.5 * (texture2D(tMr, pA * 1.3).b + texture2D(tMr, pB * 1.3 + 0.2).b);
        float crack = 0.5 * (texture2D(tMr, pA * 0.11 + 0.11).g + texture2D(tMr, pB * 0.11 + 0.53).g);
        float wall = 1.0 - smoothstep(0.5, 0.8, abs(vUp));                                                  // 立った面
        // 積んだ石の目地：横の段 ＋ 1 段おきにずれた、たての目地
        float cs = vGl.z * vSt.y, row = floor(cs), ux = vSt.x + 0.5 * mod(row, 2.0), coursed = step(0.5, vSt.y) * wall;
        float joint = max(1.0 - smoothstep(0.02, 0.055, abs(fract(cs + 0.5) - 0.5)), (1.0 - smoothstep(0.012, 0.035, abs(fract(ux + 0.5) - 0.5))) * step(0.0, vSt.x)) * coursed;
        float blk = mrHash(vec2(row, floor(ux) * step(0.0, vSt.x)) + floor(vColor.r * 97.0));              // 石 1 個ごとの明るさ
        vec3 st = diffuseColor.rgb * (0.7 + 0.55 * n2) * (0.86 + 0.28 * n3) * (1.0 - 0.38 * (1.0 - smoothstep(0.0, 0.02, abs(crack - 0.5))));
        st *= 1.0 + (blk - 0.5) * 0.18 * coursed;
        st *= 1.0 - 0.3 * smoothstep(0.5, 0.8, texture2D(tMr, vec2((wp.x + wp.z) * 0.5, wp.y * 0.03)).r) * wall;      // 雨だれのあと
        st = mix(st, st * 1.2 + 0.03, vSt.w * vSt.w * (0.35 + 0.65 * n3));                                 // すりへった角は、白っぽい
        st *= 1.0 - 0.5 * joint;
        float base = 1.0 - smoothstep(0.05, 0.5 + 0.6 * n2, vGl.w);                                        // 根もと：土のよごれと苔
        st = mix(st, st * vec3(0.66, 0.62, 0.5), base * 0.75);
        float mTop = smoothstep(0.45, 0.85, vUp + (n1 - 0.5) * 0.9 - (1.0 - vSt.z) * (1.25 - 1.1 * n2 - 0.5 * n3));      // 上を向いた面（苔の量が少ない石は、まだらに）
        st *= 1.0 - 0.3 * (1.0 - vSt.z) * (1.0 - wall) * smoothstep(0.0, 0.8, vSt.w);                      // 石段・敷石のふちに、土がたまる
        float mGap = max(joint * smoothstep(0.35, 0.6, n1 + 0.15), base * smoothstep(0.3, 0.6, n2 * 0.7 + n1 * 0.5)) * 0.9;      // 目地と根もと
        mrMoss = max(max(mTop, smoothstep(0.55, 0.75, n1 + 0.25 * n2) * 0.8), mGap);                        // ＋ まだらな苔
        // 石の中ほどの帯に、彫りこんだ古い文字（たての線 ＋ ななめの線 ＋ 小さな点）。ところどころ、すりへっている
        float band = smoothstep(0.4, 0.43, vGl.z) * (1.0 - smoothstep(0.63, 0.66, vGl.z));
        vec2 gc = vec2(fract(vGl.y) - 0.5, (vGl.z - 0.53) / 0.2); float gi = mrHash(vec2(floor(vGl.y), 5.0)), gj = fract(gi * 7.13), tilt = (gj - 0.5) * 0.9;
        float mark = max(step(abs(gc.x - (gi - 0.5) * 0.3), 0.055) * step(abs(gc.y), 0.38), step(abs(gc.y - gc.x * tilt - (gj - 0.5) * 0.4), 0.07) * step(abs(gc.x), 0.32) * step(0.25, gi));
        mark = max(mark, step(length(gc - vec2(0.26 * sign(gj - 0.5), 0.3 * sign(gi - 0.5))), 0.075));
        float line = (1.0 - smoothstep(0.0, 0.012, abs(vGl.z - 0.415))) + (1.0 - smoothstep(0.0, 0.012, abs(vGl.z - 0.645)));
        mrMark = (mark * band + 0.7 * line) * step(0.01, vGl.x) * (0.3 + 0.7 * smoothstep(0.25, 0.55, n3 * 0.6 + n1 * 0.5));
        st *= 1.0 - 0.4 * min(mrMark, 1.0);                                                                 // 彫ったみぞ
        diffuseColor.rgb = mix(st, ${glc(RUINS.moss)} * (0.7 + 0.55 * n2), mrMoss); }`);
  };
  m.customProgramCacheKey = () => 'ruinsStone';
  addDapple(m);
  const shaded = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    shaded.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${RUNE_GLSL}\nvoid main() {`).replace('#include <opaque_fragment>', `
      outgoingLight += kfGlow(${glc(RUINS.rune)}) * mrMark * vGl.x * (1.0 - 0.75 * mrMoss) * mrRune(vFogWorld) * 0.85;
      #include <opaque_fragment>`);
  };
  return m;
}
// ---------------------------------------------------------------- 石を 1 つの形にまとめる道具：箱と円柱を置いていき、最後に toGeometry()。foot ＝ 石のある所（木や草を置かない）
const mat4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(sx, sy, sz));
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), ONE = V3(1, 1, 1);
// 切り出した石：箱（3×3×3 に分ける）のふちを面取りして、角をところどころ大きく欠く。uv ＝ 面ごとの（横, たて）0〜1、aEdge ＝（ふちなら 1, 横の位置 m）
function hewnBox(sx, sy, sz, r, bevel = 0.07, chip = 1) {
  const g = new THREE.BoxGeometry(sx, sy, sz, 3, 3, 3), p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv, n = p.count, edge = new Float32Array(n * 2);
  const S = [sx, sy, sz], H = [sx / 2, sy / 2, sz / 2], b = Math.min(bevel, sx * 0.28, sy * 0.28, sz * 0.28), sd = r() * 50, c = [0, 0, 0], ext = [false, false, false];
  for (let i = 0; i < n; i++) {
    c[0] = p.getX(i); c[1] = p.getY(i); c[2] = p.getZ(i);
    let e = 0;
    for (let k = 0; k < 3; k++) { ext[k] = Math.abs(c[k]) > H[k] * 0.9; c[k] = Math.sign(c[k]) * (ext[k] ? H[k] : H[k] - b); if (ext[k]) e++; }
    const ax = Math.abs(nr.getX(i)) > 0.5 ? 0 : Math.abs(nr.getY(i)) > 0.5 ? 1 : 2, ua = ax === 0 ? 2 : 0, va = ax === 1 ? 2 : 1;
    uv.setXY(i, c[ua] / S[ua] + 0.5, c[va] / S[va] + 0.5); edge[i * 2 + 1] = c[ua] + H[ua];
    if (e >= 2) {
      const h = hash2(c[0] * 7.3 + c[1] * 3.1 + sd, c[2] * 5.7 - c[1] * 1.9 + sd), pull = b * (e === 2 ? 0.5 + 0.35 * h * chip : 0.6 + (h > 0.62 ? 2.2 * (h - 0.62) / 0.38 : 0) * chip);
      for (let k = 0; k < 3; k++) if (ext[k]) c[k] -= Math.sign(c[k]) * Math.min(pull, H[k] * 0.45);
      edge[i * 2] = 1;
    }
    p.setXYZ(i, c[0], c[1], c[2]);
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 2));
  return g;
}
export class Stones {
  // r ＝ 置き方の乱数（石のならびを決める）、r2 ＝ 石 1 個ごとの見た目（色あい・欠け方）の乱数
  constructor(seed, tint = true) { this.r = rng(seed); this.r2 = rng(seed + 1000); this.parts = []; this.foot = []; this.extra = []; this.tops = []; this.cols = []; this.arches = []; this.beams = []; this.swags = []; this.water = [];
    this.c0 = new THREE.Color(tint ? RUINS.stone[0] : '#ffffff'); this.c1 = new THREE.Color(tint ? RUINS.stone[1] : '#ffffff'); }
  // geo を m で置く。o：{ glow（光る模様の強さ）, cells（模様の文字の数）, shade（明るさ）, courses（積んだ段の数）, block（石 1 個の長さ m）, moss（上の面の苔 0〜1）, rough（表面のでこぼこ m）, hg（地面からの高さを決めておく）}
  push(geo, m, o = {}, own = false) {
    const g = own ? geo : geo.clone(); g.applyMatrix4(m);
    const p = g.attributes.position, n = p.count, uv = g.attributes.uv, ed = g.attributes.aEdge, amp = o.rough ?? (ed ? 0.035 : 0.02);
    if (amp > 0) for (let i = 0; i < n; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);               // 場所で決まる、小さなでこぼこ（同じ場所の頂点は、同じだけ動く）
      p.setXYZ(i, x + (vnoise(y * 1.9 + 11, z * 1.9) - 0.5) * amp, y + (vnoise(x * 1.9 + 5, z * 1.9 + 3) - 0.5) * amp * 0.5, z + (vnoise(x * 1.9 + 7, y * 1.9) - 0.5) * amp); }
    if (ed) g.computeVertexNormals();
    const col = new Float32Array(n * 3), gl = new Float32Array(n * 4), st = new Float32Array(n * 4);
    const c = this.c0.clone().lerp(this.c1, this.r()).multiplyScalar((o.shade ?? 1) * (0.9 + 0.2 * this.r())); c.offsetHSL((this.r2() - 0.5) * 0.04, 0, (this.r2() - 0.5) * 0.05);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      gl.set([o.glow || 0, uv.getX(i) * (o.cells || 4), uv.getY(i), o.hg ?? p.getY(i) - groundH(p.getX(i), p.getZ(i))], i * 4);
      st.set([ed ? ed.getY(i) / (o.block || 0.95) : -1, o.courses || 0, o.moss ?? 1, ed ? ed.getX(i) : 0], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGl', new THREE.BufferAttribute(gl, 4)); g.setAttribute('aSt', new THREE.BufferAttribute(st, 4));
    g.deleteAttribute('uv'); if (ed) g.deleteAttribute('aEdge');
    this.parts.push(g);
  }
  // 箱の石（m の大きさ ＝ 石の大きさ）。高い石は、積んだ石に見せる。o：push と同じ ＋ { bevel（面取り m）, chip（欠けの強さ）}
  box(m, o = {}) {
    m.decompose(_p, _q, _s);
    this.push(hewnBox(_s.x, _s.y, _s.z, this.r2, o.bevel ?? 0.07, o.chip ?? 1), new THREE.Matrix4().compose(_p, _q, ONE), { courses: _s.y >= 1.3 ? Math.round(_s.y / 0.62) : 0, ...o }, true);
  }
  toGeometry() { const g = mergeGeometries(this.parts); g.computeBoundingSphere(); return g; }
}
// 円い石柱：台座 ＋ 柱（輪切りの石を積んだもの）＋（折れていなければ）柱頭。o：{ broken（折れている）, glow, parent（置く向き・場所の行列。なければ地面の上）}
export function addPillar(S, x, z, r, h, o = {}) {
  const Pm = o.parent || mat4(x, groundH(x, z) - 0.12, z, 1, 1, 1, S.r() * 6.283, o.broken ? (S.r() - 0.5) * 0.09 : 0, o.broken ? (S.r() - 0.5) * 0.09 : 0);
  S.box(Pm.clone().multiply(mat4(0, 0.2, 0, r * 2.7, 0.4, r * 2.7)), { moss: 0.8 });
  const cyl = new THREE.CylinderGeometry(r * 0.88, r, h, 12, Math.max(3, Math.round(h / 0.55))), p = cyl.attributes.position, sd = S.r() * 20;
  if (o.broken) for (let i = 0; i < p.count; i++) if (p.getY(i) > h / 2 - 0.01) p.setY(i, h / 2 + (vnoise(Math.atan2(p.getZ(i), p.getX(i)) * 1.4 + sd, sd) - 0.6) * 0.8 + p.getX(i) * 0.45);      // 折れ口はななめで、ぎざぎざ
  S.push(cyl, Pm.clone().multiply(mat4(0, 0.4 + h / 2, 0)), { glow: o.glow || 0, cells: 9, courses: Math.max(1, Math.round(h / 0.78)) });
  if (!o.broken) { S.box(Pm.clone().multiply(mat4(0, 0.4 + h + 0.11, 0, r * 2.2, 0.22, r * 2.2))); S.box(Pm.clone().multiply(mat4(0, 0.4 + h + 0.34, 0, r * 2.7, 0.24, r * 2.7))); }
  S.foot.push({ x, z, r: r * 1.5 });
  S.cols.push({ Pm, r, h, broken: !!o.broken });
  if (o.broken) S.tops.push({ p: V3(0, 0.4 + h - 0.34, 0).applyMatrix4(Pm), fern: true });
}
// アーチ：四角い柱 2 本 ＋ 半円にならぶ石。gap ＝ [はじめ, おわり] の番号の石がくずれて無い（落ちた石が下にころがる）
export function addArch(S, x, z, yaw, span, hP, gap = null) {
  const y = groundH(x, z) - 0.12, Pm = mat4(x, y, z, 1, 1, 1, yaw), R = span / 2, N = 11, y0 = 0.4 + hP + 0.24;
  for (const sd of [-1, 1]) {
    S.box(Pm.clone().multiply(mat4(sd * R, 0.2, 0, 1.3, 0.4, 1.3)), { moss: 0.8 });
    S.box(Pm.clone().multiply(mat4(sd * R, 0.4 + hP / 2, 0, 0.92, hP, 0.92)), { glow: 1, cells: 3 });
    S.box(Pm.clone().multiply(mat4(sd * R, 0.4 + hP + 0.12, 0, 1.16, 0.24, 1.12)));
    const w = V3(sd * R, 0, 0).applyMatrix4(Pm); S.foot.push({ x: w.x, z: w.z, r: 0.9 });
  }
  for (let i = 0; i < N; i++) {
    if (gap && i >= gap[0] && i <= gap[1]) continue;
    const th = Math.PI * (i + 0.5) / N, edge = gap && (i === gap[0] - 1 || i === gap[1] + 1) ? 1 : 0;
    S.box(Pm.clone().multiply(mat4(Math.cos(th) * R, y0 + Math.sin(th) * R - 0.1 * edge, 0, Math.PI * R / N * 1.05, 0.6, 0.86, 0, 0, th - Math.PI / 2 + 0.12 * edge * (i < N / 2 ? 1 : -1))), { shade: 0.94 + 0.12 * (i % 2), chip: edge ? 2.2 : 1 });
    if (i >= 3 && i <= 7 && S.r2() < 0.6) S.tops.push({ p: V3(Math.cos(th) * (R + 0.3), y0 + Math.sin(th) * (R + 0.3), (S.r2() - 0.5) * 0.4).applyMatrix4(Pm), fern: S.r2() < 0.4 });
  }
  if (gap) for (let k = gap[0]; k <= gap[1] + 1; k++) {                                 // 落ちた石
    const w = V3((S.r() - 0.5) * span * 0.9, 0, (S.r() < 0.5 ? -1 : 1) * (1.0 + S.r() * 1.6)).applyMatrix4(Pm);
    if (walkSd(w.x, w.z) < 0.5) continue;
    S.box(mat4(w.x, groundH(w.x, w.z) + 0.2, w.z, 0.66, 0.6, 0.86, S.r() * 6.283, (S.r() - 0.5) * 0.7, (S.r() - 0.5) * 0.5), { chip: 2 }); S.foot.push({ x: w.x, z: w.z, r: 0.6 });
  }
  S.arches.push({ Pm, R, N, y0, gap });
}
// くずれた低い石がき：(x0, z0) から (x1, z1) へ、石を rows 段。上の段ほど欠けている
export function addWall(S, x0, z0, x1, z1, rows = 3) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.05)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
  for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) {
    if (S.r() < j * 0.34) continue;
    const t = (i + 0.5 + (j % 2) * 0.5) / (n + 0.5), x = lerp(x0, x1, t), z = lerp(z0, z1, t);
    S.box(mat4(x, groundH(x, z) + 0.22 + j * 0.5, z, 1.0, 0.5, 0.62, yaw + (S.r() - 0.5) * 0.08, 0, (S.r() - 0.5) * 0.05), { chip: 1.4 });
    if (j === 0) S.foot.push({ x, z, r: 0.7 });
    if (j > 0 && S.r2() < 0.3) S.tops.push({ p: V3(x, groundH(x, z) + 0.45 + j * 0.5, z), fern: S.r2() < 0.35 });
  }
}
// 石の器（水をたたえた鉢）：台 ＋ 脚 ＋ 鉢。fallen なら、鉢は落ちて横にころがり、水はない。水面の場所は S.water に入る
export function addBasin(S, x, z, o = {}) {
  const y = groundH(x, z) - 0.1, k = o.scale || 1, Pm = mat4(x, y, z, 1, 1, 1, S.r2() * 6.283);
  S.box(Pm.clone().multiply(mat4(0, 0.12, 0, 1.0 * k, 0.24, 1.0 * k)), { moss: 0.6 });
  S.push(new THREE.CylinderGeometry(0.26 * k, 0.36 * k, 0.5 * k, 10, 1), Pm.clone().multiply(mat4(0, 0.24 + 0.25 * k, 0)), { glow: 0.8, cells: 5 });
  const bowl = new THREE.CylinderGeometry(0.74 * k, 0.4 * k, 0.4 * k, 16, 1);
  S.extra.push({ x, z, r: 0.9 * k });
  if (o.fallen) { const bx = x + o.fallen[0], bz = z + o.fallen[1]; S.push(bowl, mat4(bx, groundH(bx, bz) + 0.42 * k, bz, 1, 1, 1, S.r2() * 6.283, 1.15, 0.2)); S.extra.push({ x: bx, z: bz, r: 0.8 * k }); return; }
  S.push(bowl, Pm.clone().multiply(mat4(0, 0.24 + 0.7 * k, 0)), { moss: 0.35 });
  S.water.push({ x, y: y + 0.24 + 0.9 * k + 0.014, z, r: 0.61 * k });
}
// ---------------------------------------------------------------- 遺跡の石組み（参道の石柱・アーチ・石がき、広場をかこむ石柱と梁、祭壇、広場へおりる石段、かたむいた敷石、石の器）。1 つの形＝1 回で描く
// 戻り値：geo, foot（石のある所）, extra（あとから足した石のある所）, tops（石の上の、草の生える所）, cols（石柱）, arches, beams（広場の梁）, swags（梁のない、となりどうしの柱）, water（水面）
export function buildRuins(seed = 61) {
  const S = new Stones(seed), r = S.r, r2 = S.r2;
  for (const a of RUINS.arches) { const z = -a.s; addArch(S, pathX(z), z, Math.atan(pathSlope(z)), 4.5, 3.3, a.gap); }
  for (let s = 3.2, i = 0; s < P.len - 3; s += 3.6, i++) for (const side of [-1, 1]) {      // 参道の両わきの石柱（折れたもの・立っているもの）
    if (RUINS.arches.some((a) => Math.abs(a.s - s) < 2.2) || r() < 0.2) continue;
    const z = -s + (r() - 0.5) * 0.8, x = pathX(z) + side * (P.pave + 0.75 + r() * 0.5), broken = r() < 0.62;
    addPillar(S, x, z, 0.36 + r() * 0.06, broken ? 0.7 + r() * 2.0 : 3.4 + r() * 0.5, { broken, glow: broken ? 0 : 1 });
    if (broken && r() < 0.6) { const bx = x + side * (0.9 + r()), bz = z + (r() - 0.5) * 2; S.push(new THREE.CylinderGeometry(0.33, 0.36, 1.1 + r() * 0.8, 12, 2), mat4(bx, groundH(bx, bz) + 0.3, bz, 1, 1, 1, r() * 6.283, Math.PI / 2 + (r() - 0.5) * 0.3)); S.foot.push({ x: bx, z: bz, r: 0.9 }); }   // 横だおしの柱
  }
  for (const [s0, s1, side, d] of [[10, 15, -1, 4.2], [12.5, 16, 1, 4.6], [22, 27, 1, 4.0], [24, 28, -1, 5.2], [32, 35.5, -1, 3.9]]) addWall(S, pathX(-s0) + side * d, -s0, pathX(-s1) + side * (d + 0.6), -s1, 3);
  for (let k = 0; k < 16; k++) {                                                              // ころがる石
    const z = lerp(2, -P.len, r()), x = pathX(z) + (r() < 0.5 ? -1 : 1) * (P.pave + 0.6 + r() * 5);
    S.box(mat4(x, groundH(x, z) + 0.18, z, 0.5 + r() * 0.5, 0.4 + r() * 0.25, 0.5 + r() * 0.4, r() * 6.283, (r() - 0.5) * 0.5, (r() - 0.5) * 0.4), { chip: 2 }); S.foot.push({ x, z, r: 0.6 });
  }
  // 広場：まわりをかこむ高い石柱（入口の側はあけてある）と、その上にのこる梁。奥の祭壇
  const fy = floorY(CZ), cols = [];
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * 6.2832 + 0.224, sn = Math.sin(a); if (sn > 0.8) continue;
    const x = CX + Math.cos(a) * (CO.r + 0.9), z = CZ + sn * (CO.r + 0.9), broken = r() < 0.3 && sn > -0.6, h = broken ? 1.2 + r() * 2.4 : 5.2;
    addPillar(S, x, z, 0.46, h, { broken, glow: broken ? 0 : 1, parent: mat4(x, fy - 0.1, z, 1, 1, 1, r() * 6.283, broken ? (r() - 0.5) * 0.08 : 0, 0) });
    cols.push({ x, z, top: broken ? null : fy + 0.3 + h + 0.46, a });
  }
  for (let i = 0; i + 1 < cols.length; i++) { const a = cols[i], b = cols[i + 1]; if (a.top === null || b.top === null || Math.abs(b.a - a.a) > 0.5) continue;   // となりどうしの柱の上の梁（無い所には、つるがわたる）
    if (r() < 0.25) { S.swags.push([a, b]); continue; }
    S.box(mat4((a.x + b.x) / 2, a.top + 0.26, (a.z + b.z) / 2, Math.hypot(b.x - a.x, b.z - a.z) + 0.9, 0.52, 0.9, Math.atan2(-(b.z - a.z), b.x - a.x)), { glow: 0.8, cells: 7, courses: 1, block: 1.5 });
    S.beams.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: a.top + 0.26 }); }
  S.push(new THREE.CylinderGeometry(ALTAR.r, ALTAR.r + 0.12, 0.3, 20, 1), mat4(ALTAR.x, fy + 0.13, ALTAR.z));       // 祭壇：円い台 ＋ 柱 ＋ 水をたたえた受け皿
  S.push(new THREE.CylinderGeometry(0.34, 0.46, 0.95, 12, 1), mat4(ALTAR.x, fy + 0.75, ALTAR.z), { glow: 1.2, cells: 7 });
  S.push(new THREE.CylinderGeometry(0.62, 0.36, 0.22, 14, 1), mat4(ALTAR.x, fy + 1.33, ALTAR.z), { moss: 0.3 });
  S.water.push({ x: ALTAR.x, y: fy + 1.455, z: ALTAR.z, r: 0.52 });
  OBST.push({ x: ALTAR.x, z: ALTAR.z, r: ALTAR.r + 0.35 });
  // ここから下は、置き方の乱数（r）を使わない ＝ 上の石のならびは変わらない
  for (let k = 0; k < STEP.n; k++) {                                                          // 広場へおりる石段（歩く高さは、なめらかな坂のまま。エルフの足は footH で段の上にのる）
    const zc = -(STEP.s0 + (k + 0.5) * STEP.run), yaw = Math.atan(pathSlope(zc)), top = stepTop(k), nb = 3 + (k % 2), w = (P.pave * 2 + 0.4) / nb;
    for (let i = 0; i < nb; i++) { const j = i - (nb - 1) / 2; S.box(mat4(pathX(zc) + j * w * Math.cos(yaw), top - 0.2, zc - j * w * Math.sin(yaw), w - 0.025, 0.4, STEP.run + 0.02, yaw), { hg: 1.0, moss: 0.3, rough: 0.012, bevel: 0.05, chip: 0.8, shade: 0.94 + 0.12 * ((k + i) % 2), courses: 0 }); }
  }
  for (let k = 0; k < 20; k++) {                                                              // 根にもちあげられて、かたむいた敷石（参道のふち。歩く所の外）
    const z = lerp(1.5, -P.len + 5.5, r2()), side = r2() < 0.5 ? -1 : 1, x = pathX(z) + side * (P.halfW + 0.72 + r2() * 0.6);
    if (S.foot.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.5)) continue;
    S.box(mat4(x, groundH(x, z) + 0.04 + r2() * 0.07, z, 0.9 + r2() * 0.3, 0.17, 0.66 + r2() * 0.2, Math.atan(pathSlope(z)) + (r2() - 0.5) * 0.5, (r2() - 0.5) * 0.28, side * (0.06 + r2() * 0.2)), { moss: 0.45, chip: 1.6, bevel: 0.05 });
  }
  { const z = -16.5; addBasin(S, pathX(z) - (P.pave + 0.9), z); }                              // 石の器：参道のわきに 1 つ、石段の両わきに 1 つずつ（右は、鉢が落ちてころがっている）
  { const z = -(STEP.s0 + 3.4); addBasin(S, pathX(z) - (P.pave + 1.35), z, { scale: 1.1 }); addBasin(S, pathX(z) + (P.pave + 1.3), z + 0.3, { scale: 1.1, fallen: [0.95, 0.5] }); }
  return { geo: S.toGeometry(), foot: S.foot, extra: S.extra, tops: S.tops, cols: S.cols, arches: S.arches, beams: S.beams, swags: S.swags, water: S.water };
}
// ---------------------------------------------------------------- 遠くの大きな遺跡（広場の奥の森のむこう。霧の中の影になる）：2 つの塔と、その間のくずれた大アーチ、左右の列柱
export function buildFarRuin(seed = 71) {
  const S = new Stones(seed), r = S.r, F = RUINS.far, X = CX, Z = F.z, Y = F.y, o = { hg: 12, bevel: 0.4, chip: 1.6, rough: 0.5, block: 2.8, moss: 0.6, shade: F.shade };
  const tower = (x, z, w, d, h, yaw, lean) => {
    let y = Y;
    [0.44, 0.3, 0.26].forEach((k, i) => { const hh = h * k, ww = w * (1 - 0.13 * i), dd = d * (1 - 0.1 * i);
      S.box(mat4(x + (r() - 0.5) * 0.5, y + hh / 2, z, ww, hh, dd, yaw + (r() - 0.5) * 0.05, 0, i === 2 ? lean : 0), { ...o, courses: Math.max(2, Math.round(hh / 1.9)) });
      if (i < 2) S.box(mat4(x, y + hh, z, ww + 0.9, 1.0, dd + 0.9, yaw), { ...o, courses: 0 });               // 段のさかいの、出っぱった帯
      y += hh; });
  };
  tower(X - F.span / 2, Z, 8, 7, F.hL, 0.04, 0); tower(X + F.span / 2, Z + 1, 7.5, 7, F.hR, -0.05, 0.05);
  const R = F.span / 2 - 2.6, N = 13, y0 = Y + F.hR * 0.6;                                     // 塔の間の大アーチ（右がわがくずれている）
  for (let i = 0; i < N; i++) { if (i >= 2 && i <= 4) continue;
    const th = Math.PI * (i + 0.5) / N; S.box(mat4(X + Math.cos(th) * R, y0 + Math.sin(th) * R, Z, Math.PI * R / N * 1.06, 2.4, 4.2, 0, 0, th - Math.PI / 2), { ...o, courses: 0 }); }
  S.box(mat4(X - 3.6, y0 + R + 3.2, Z, 8.5, 3.6, 3.6, 0, 0, 0.02), { ...o, courses: 2 });      // アーチの上にのこる壁
  for (const [dx, dz, h, lean] of [[-18.5, 3, 18, 0], [-24.5, 4, 18, 0], [-30.5, 6, 10, -0.05], [18, 4, 13, 0.03], [24, 7, 8, 0.07]])      // 左右の列柱
    S.push(new THREE.CylinderGeometry(1.25, 1.5, h, 12, 4), mat4(X + dx, Y + h / 2, Z + dz, 1, 1, 1, 0, 0, lean), { hg: 12, courses: Math.round(h / 2.2), rough: 0.3, moss: 0.6, shade: F.shade });
  S.box(mat4(X - 21.5, Y + 18.9, Z + 3.5, 9.6, 1.8, 3.0, -0.16), { ...o, courses: 0 });        // 列柱の上にのこる梁
  return S.toGeometry();
}
// ---------------------------------------------------------------- つる：石柱にまきつき、アーチをはいのぼり、アーチの下や広場の梁からたれさがる。葉は createRuinCanopy が、つるにそって付ける（leaves ＝ 葉のかたまりの一覧）
export function buildVines(R0, seed = 83) {
  const r = rng(seed), tb = new TubeGeo(), leaves = [], c0 = new THREE.Color('#4c4630'), c1 = new THREE.Color('#70783e');
  const add = (pts, rad, every = 0.42, leafR = 0.27) => {
    const n = pts.length, tint = 0.8 + 0.4 * r(); let acc = every * r();
    tb.tube(pts, 5, (i) => rad * (1 - 0.55 * i / (n - 1)), (i) => c0.clone().lerp(c1, hash2(i * 0.37, n)).multiplyScalar(tint));
    for (let i = 1; i < n; i++) { acc += pts[i].distanceTo(pts[i - 1]); if (acc < every) continue; acc = 0;
      leaves.push({ g: 'ivy', p: pts[i].clone(), r: leafR * (0.75 + 0.5 * r()), w: 0.5, size: [0.2, 0.36], flat: 0.9, bush: true, ivy: true }); }
  };
  const hang = (top, len, sway = 0.12) => {                                                    // まっすぐたれるつる（先は細い）
    const pts = [], a = r() * 6.283, n = Math.max(4, Math.round(len / 0.3));
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push(V3(top.x + Math.cos(a + u * 2.5) * sway * u, top.y - len * u, top.z + Math.sin(a + u * 2.1) * sway * u)); }
    add(pts, 0.022 + 0.012 * r(), 0.34, 0.2);
  };
  for (const c of R0.cols) {                                                                   // 石柱にまきつく（台座のわきの地面から）
    if (r() < (c.broken ? 0.45 : 0.3)) continue;
    const dir = r() < 0.5 ? -1 : 1, a0 = Math.floor(r() * 4) * Math.PI / 2, top = c.h * (c.broken ? 0.9 : 0.5 + 0.5 * r()), turns = top / (1.5 + r() * 0.8), n = Math.ceil(turns * 9) + 2;
    const pts = [V3(Math.cos(a0) * c.r * 2.1, 0.03, Math.sin(a0) * c.r * 2.1), V3(Math.cos(a0) * c.r * 1.46, 0.43, Math.sin(a0) * c.r * 1.46)];
    for (let i = 1; i <= n; i++) { const u = i / n, y = 0.45 + top * u, rad = c.r * (1 - 0.12 * (y - 0.4) / c.h) + 0.03, a = a0 + dir * turns * 6.283 * u; pts.push(V3(Math.cos(a) * rad, y, Math.sin(a) * rad)); }
    add(pts.map((p) => p.applyMatrix4(c.Pm)), 0.03 + 0.02 * r());
  }
  for (const A of R0.arches) {                                                                 // アーチ：柱の外がわをのぼり、アーチの上をはって、先はたれさがる
    const loc = (x, y, z) => V3(x, y, z).applyMatrix4(A.Pm), Ro = A.R + 0.36, gap = A.gap ? [Math.PI * A.gap[0] / A.N, Math.PI * (A.gap[1] + 1) / A.N] : null;
    for (const sd of [-1, 1]) {
      if (r() < 0.15) continue;
      const pts = [], zo = (r() < 0.5 ? -1 : 1) * (0.2 + 0.2 * r()), ph = r() * 6, want = Math.PI * (0.3 + 0.45 * r());
      for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(loc(sd * (A.R + 0.51 + 0.05 * Math.sin(u * 7 + ph) + (u > 0.9 ? 0.13 : 0)), 0.05 + u * (A.y0 - 0.1), zo + 0.12 * Math.sin(u * 5 + ph))); }
      const lim = gap ? (sd > 0 ? gap[0] - 0.05 : gap[1] + 0.05) : null, end = sd > 0 ? (gap ? Math.min(want, lim) : want) : (gap ? Math.max(Math.PI - want, lim) : Math.PI - want), inGap = gap && end === lim;
      const st = sd > 0 ? 0.1 : Math.PI - 0.1, m = Math.max(3, Math.round(Math.abs(end - st) * Ro / 0.3));
      for (let i = 1; i <= m; i++) { const th = lerp(st, end, i / m); pts.push(loc(Math.cos(th) * (Ro + 0.03 * Math.sin(i * 1.7 + ph)), A.y0 + Math.sin(th) * Ro, zo + 0.15 * Math.sin(i * 0.9 + ph))); }
      const th2 = end + (inGap ? sd * 0.16 : 0), L = 0.6 + 1.2 * r(), bx = Math.cos(th2) * (Ro - 0.05), by = A.y0 + Math.sin(th2) * (Ro - 0.05), bz = inGap ? zo : Math.sign(zo) * 0.56;
      for (let i = 0; i <= 4; i++) pts.push(loc(bx + 0.05 * Math.sin(i + ph), by - 0.1 - L * i / 4, bz + 0.04 * Math.sin(i * 1.3)));
      add(pts, 0.04 + 0.015 * r(), 0.4, 0.3);
    }
    for (let k = 0; k < 5; k++) {                                                              // アーチの下にたれるつる（頭の上まで）
      const th = Math.PI * (0.2 + 0.6 * r()); if (gap && th > gap[0] - 0.05 && th < gap[1] + 0.05) continue;
      const Ri = A.R - 0.32, top = loc(Math.cos(th) * Ri, A.y0 + Math.sin(th) * Ri + 0.04, (r() - 0.5) * 0.6), len = Math.min(0.5 + r() * 1.5, top.y - floorY(top.z) - 2.75);
      if (len > 0.35) hang(top, len);
    }
  }
  for (const b of R0.beams) for (let k = 0; k < 3; k++) {                                      // 広場の梁からたれるつる
    if (r() < 0.3) continue;
    const t = 0.1 + 0.8 * r(), nx = -(b.bz - b.az), nz = b.bx - b.ax, nl = Math.hypot(nx, nz), sdn = r() < 0.5 ? -1 : 1;
    hang(V3(lerp(b.ax, b.bx, t) + nx / nl * 0.47 * sdn, b.y + 0.2, lerp(b.az, b.bz, t) + nz / nl * 0.47 * sdn), 1.0 + r() * 2.4, 0.16);
  }
  for (const [a, b] of R0.swags) {                                                             // 梁のない所：柱から柱へわたって、たるむ
    const pts = [], sag = 0.8 + r() * 0.7;
    for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push(V3(lerp(a.x, b.x, u), a.top - 0.1 - sag * 4 * u * (1 - u) + 0.04 * Math.sin(u * 11), lerp(a.z, b.z, u))); }
    add(pts, 0.035, 0.36, 0.26);
    for (let k = 0; k < 2; k++) { const u = 0.25 + 0.5 * r(); hang(V3(lerp(a.x, b.x, u), a.top - 0.14 - sag * 4 * u * (1 - u), lerp(a.z, b.z, u)), 0.6 + r() * 1.2); }
  }
  return { geo: tb.toGeometry(), leaves };
}
// ---------------------------------------------------------------- 石の器の水：空をうつす静かな水面に、ときどき輪がひろがり、青緑にほのかに光る（すきとおらない板。まとめて 1 回で描く）
export function createBasinWater(list) {
  const geo = mergeGeometries(list.map((w) => { const g = new THREE.CircleGeometry(w.r, 18); g.rotateX(-Math.PI / 2); g.translate(w.x, w.y, w.z);
    const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length / 3; i++) a.set([w.x, w.z, w.r], i * 3);
    g.setAttribute('aW', new THREE.BufferAttribute(a, 3)); return g; }));
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFpTime = fpU.uFpTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aW; varying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFpTime; varying vec3 vW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float d = length(vFogWorld.xz - vW.xy) / vW.z, ph = fract(uFpTime * 0.16 + vW.x * 0.37), ph2 = fract(ph + 0.5);
        float rip = (1.0 - smoothstep(0.0, 0.06, abs(d - ph * 1.1))) * (1.0 - ph) + 0.6 * (1.0 - smoothstep(0.0, 0.05, abs(d - ph2 * 1.1))) * (1.0 - ph2);
        vec3 c = mix(${glc('#2f5a54')}, ${glc('#cfe6d0')}, 0.3 + 0.45 * d * d) * (1.0 - 0.3 * smoothstep(0.82, 1.0, d));
        diffuseColor.rgb = c + rip * 0.2 + kfGlow(${glc(RUINS.rune)}) * (0.16 + 0.05 * sin(uFpTime * 1.3 + vW.y)) * (1.0 - 0.6 * d); }`);
  };
  m.customProgramCacheKey = () => 'ruinsWater';
  const mesh = new THREE.Mesh(geo, m); mesh.name = 'basin_water'; mesh.frustumCulled = false;
  return mesh;
}
// ---------------------------------------------------------------- 光の門の石柱：まん中に四角い穴のあいた石の門。一覧 [{ x, z, y, rot（向き rad）}]。広場のふちに近い所に、まん中を向いてならぶ（今は向きがばらばら）
export function placeGates(seed = 5) {
  const r = rng(seed), list = [], fy = floorY(CZ);
  for (const deg of [22, 158, -8, 188, -48, 228]) {
    const a = deg * Math.PI / 180, x = CX + Math.cos(a) * 4.7, z = CZ + Math.sin(a) * 4.7;
    list.push({ x, z, y: fy - 0.04, rot: Math.atan2(-(CZ - z), CX - x) + Math.PI / 2 + (r() - 0.5) * 1.6 });       // 穴がまん中を向く向き ＋ ずれ
    OBST.push({ x, z, r: 0.75 });
  }
  return list;
}
export function buildGate() {
  const S = new Stones(9, false), o = { bevel: 0.04, chip: 0.6, rough: 0.012 };      // 門の石は、ほかより欠けが少ない（形と大きさは、もとのまま）
  S.box(mat4(0, 0.15, 0, 0.98, 0.3, 0.9), { ...o, moss: 0.7 });
  S.box(mat4(0, 0.8, 0, 0.74, 1.0, 0.52), { ...o, glow: 1.2, cells: 3 });
  for (const sx of [-0.27, 0.27]) S.box(mat4(sx, 1.575, 0, 0.2, 0.55, 0.52), o);
  S.box(mat4(0, 2.08, 0, 0.74, 0.46, 0.52), { ...o, glow: 1.2, cells: 3 });
  S.box(mat4(0, 2.39, 0, 0.9, 0.16, 0.64), o);
  return S.toGeometry();
}
export function createGates(list, mat) {
  const mesh = new THREE.InstancedMesh(buildGate(), mat, list.length), dummy = new THREE.Object3D(), c0 = new THREE.Color(RUINS.stone[0]), c1 = new THREE.Color(RUINS.stone[1]);
  list.forEach((g, i) => { dummy.position.set(g.x, g.y, g.z); dummy.rotation.set(0, g.rot, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, c0.clone().lerp(c1, 0.4 + 0.5 * (i % 3) / 2)); });
  mesh.frustumCulled = false; mesh.name = 'light_gates';
  return mesh;
}

// ================================================================ 森と草花
// ---------------------------------------------------------------- まだらな光：参道のところどころと、広場のまん中に、枝葉のすき間から光が落ちる
export function createDapple(seed = 37) {
  const pools = [];
  kit.createDappleTexture(seed, ({ r, blob, cluster }) => {
    const add = (x, z, rad) => { pools.push({ x, z, r: rad }); blob(x, z, rad, 1); cluster(x, z, 8, rad * 1.9, 0.3, 0.85); };
    for (const [s, dx, rad] of [[-2.4, 0.3, 0.7], [3.4, -0.9, 0.6], [9.6, 1.0, 0.6], [13.4, -0.4, 0.75], [18.5, 0.2, 0.9], [23.2, -1.1, 0.6], [26.4, 0.9, 0.65], [33, 0.1, 0.7]]) add(pathX(-s) + dx, -s, rad);
    add(CX, CZ, 1.9); add(ALTAR.x + 0.2, ALTAR.z + 0.2, 0.75); add(CX - 3.6, CZ + 1.4, 0.55); add(CX + 3.9, CZ - 1.2, 0.5);
    for (let i = 0; i < 110; i++) { const z = lerp(14, -58, r()), x = pathX(clamp(z, -P.len, 0)) + (r() - 0.5) * 30; cluster(x, z, 3 + Math.floor(r() * 5), 0.5 + r() * 0.9, 0.2, 0.7); }
    for (const [s, dx, rad] of [[16.4, -1.2, 0.5], [20.7, 1.25, 0.45]]) add(pathX(-s) + dx, -s, rad);     // くずれたアーチの前後：石柱の間にさしこむ、細い光
    add(CX + 1.7, CZ + 3.3, 0.45); add(CX - 2.0, CZ - 2.4, 0.5);                                           // 広場：柱の間からさしこむ、細い光
  });
  return { pools };
}
// 広場の奥の、森のすき間（広場から遠くの遺跡が見える、おうぎ形）：(x, z) がその中か。pad ＝ よぶんの幅（m）
const farGap = (x, z, pad = 0) => z < CZ - CO.r - 1.5 && Math.abs(x - CX) < 1.5 + 0.27 * (CZ - z) + pad;
// ---------------------------------------------------------------- 巨木：参道の両がわと、広場のまわりの森。入口の後ろ（広場へ戻る道）に根のアーチ
export function createRuinTrees(foot, seed = 21) {
  const r = rng(seed), mat = kit.createBarkMaterial(), group = new THREE.Group(); group.name = 'giant_trees';
  const geos = [kit.buildGiantTree(15, 1), kit.buildGiantTree(27, 1), kit.buildGiantTree(43, 1), kit.buildGiantTree(59, 0)], all = [];
  const caps = [36, 54, 70], gaps = [3.6, 4.4, 6.2], made = [0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    const x = lerp(-34, 34, r()), z = lerp(-72, 18, r()), sd = walkSd(x, z), layer = sd < 2.6 ? -1 : sd < 5.2 ? 0 : sd < 10.5 ? 1 : sd < 30 ? 2 : -1;
    if (layer < 0 || made[layer] >= caps[layer]) continue;
    const s = layer === 0 ? 0.85 + r() * 0.45 : layer === 1 ? 0.9 + r() * 0.5 : 1.0 + r() * 0.6, rad = 1.5 * s;
    if (sd < rad + 1.6) continue;
    if (foot.some((m) => Math.hypot(m.x - x, m.z - z) < rad + m.r + 0.3)) continue;
    if (all.some((t) => Math.hypot(t.x - x, t.z - z) < gaps[Math.max(layer, t.layer)])) continue;
    const v = layer === 2 ? 3 : Math.floor(r() * 3); all.push({ x, z, s, layer, v, rot: r() * 6.283, y: groundH(x, z) - 0.25, R: geos[v].userData.R0 * s }); made[layer]++;
  }
  const list = all.filter((t) => !farGap(t.x, t.z, t.R + 1.0));     // 広場の奥は、遠くの遺跡が見えるように、木をぬく（ほかの木のならびは変えない）
  const anchors = kit.createTreeMeshes(list, geos, mat, group);
  const rootMesh = new THREE.Mesh(kit.buildRoots(list, r, { groundH, low: (x, z) => 1 - sstep(walkSd(x, z), 0.3, 1.2) }), mat); rootMesh.name = 'giant_roots'; group.add(rootMesh);
  const tb = new TubeGeo(), bark = new THREE.Color(RUINS.trunk.bark), moss = new THREE.Color(RUINS.trunk.moss), ap = [];      // 広場へ戻る道の目印：根のアーチ
  for (let j = 0; j <= 12; j++) { const u = j / 12, a = Math.PI * u; ap.push(V3(-Math.cos(a) * 2.7 + 0.15 * Math.sin(u * 9), -0.3 + Math.sin(a) * 3.1 + 0.1 * Math.sin(u * 13), RUINS.backZ - 1.2 + 0.25 * Math.sin(u * 5))); }
  tb.tube(ap, 8, (i) => 0.36 - 0.1 * Math.sin(Math.PI * i / 12) + 0.04 * Math.sin(i * 2.1), (i, th) => bark.clone().lerp(moss, clamp(0.45 + 0.4 * Math.cos(th), 0, 1)));
  const arch = new THREE.Mesh(tb.toGeometry(), mat); arch.name = 'return_arch'; group.add(arch);
  return { group, list, anchors };
}
// ---------------------------------------------------------------- 枝葉：参道の上をおおう（光の筋の通り道はあける）。広場のまん中の上は、まるくあいている。アーチと石柱の上には、からみつく葉
export function createRuinCanopy(trees, shafts, foot, vineLeaves = [], seed = 26) {
  const r = rng(seed), share = { ceil: 0.27, near: 0.215, mid: 0.18, far: 0.125, bush: 0.045, ivy: 0.165 };      // ivy ＝ 石にからむ葉（アーチの上・石のまわり・つるにそって）
  const all = trees.anchors.map((a) => ({ ...a, g: ['near', 'mid', 'far'][a.layer], w: a.r * a.r, size: a.layer === 2 ? [2.8, 4.0] : [1.6, 2.7], flat: 0.55 }));
  for (let z = 8; z > -62; z -= 0.6) { const cx = z < -P.len ? CX : pathX(z); all.push({ g: 'ceil', p: V3(cx + (r() - 0.5) * 18, floorY(z) + 7.6 + r() * 3.0, z + (r() - 0.5)), r: 2.6 + r() * 0.9, w: 1, size: [1.7, 2.8], flat: 0.4 }); }
  for (let i = 0; i < 80; i++) {
    const z = lerp(7, -58, r()), x = (z < -P.len ? CX : pathX(z)) + (r() - 0.5) * 24, sd = walkSd(x, z);
    if (sd < 1.6 || sd > 8) continue;
    all.push({ g: 'bush', p: V3(x, groundH(x, z) + 0.45 + r() * 0.5, z), r: 0.8 + r() * 0.7, w: 1, size: [0.6, 1.05], flat: 0.5, bush: true });
  }
  for (const a of RUINS.arches) { const z = -a.s, x = pathX(z), yaw = Math.atan(pathSlope(z));               // アーチにからむ葉
    for (let k = 0; k < 5; k++) { const th = Math.PI * (0.1 + 0.8 * r()); if (a.gap && th > Math.PI * a.gap[0] / 11 && th < Math.PI * (a.gap[1] + 1) / 11) continue;
      all.push({ g: 'ivy', p: V3(x + Math.cos(th) * 2.25 * Math.cos(yaw), groundH(x, z) + 3.9 + Math.sin(th) * 2.4, z - Math.cos(th) * 2.25 * Math.sin(yaw)), r: 0.55 + r() * 0.4, w: 1, size: [0.4, 0.75], flat: 0.7, bush: true, ivy: true }); } }
  for (const f of foot) if (r() < 0.35) all.push({ g: 'ivy', p: V3(f.x, groundH(f.x, f.z) + 0.5 + r() * 1.6, f.z), r: 0.5 + r() * 0.35, w: 0.7, size: [0.35, 0.7], flat: 0.8, bush: true, ivy: true });
  for (const a of vineLeaves) all.push(a);
  const sums = {}; for (const a of all) sums[a.g] = (sums[a.g] || 0) + a.w;
  for (const a of all) a.w *= share[a.g] / sums[a.g];
  return kit.createCanopy(all, { r, count: RUINS.count.canopy, reject: (p, a) => {
    if (a.ivy) return false;
    if (a.bush) return walkSd(p.x, p.z) < 1.2;
    if (p.y < groundH(p.x, p.z) + 3.6) return true;
    if (farGap(p.x, p.z)) return true;                                                        // 広場の奥の、森のすき間
    const cx = p.z < -P.len ? CX : pathX(clamp(p.z, PATH_Z1, PATH_Z0));
    if (Math.abs(p.x - cx) < 3.2 && p.y < floorY(p.z) + 6.6) return true;                    // 参道のすぐ上は、アーチのぶんをあける
    if (Math.hypot(p.x - CX, p.z - CZ) < 3.4) return true;                                    // 広場のまん中の上は、空があいている
    if (Math.hypot(p.x - CX, p.z - CZ) < CO.r + 1.5 && p.y < floorY(CZ) + 7.2) return true;
    return shafts.some((s) => { const t = p.y / SUN.y; return Math.hypot(p.x - (s.a.x + SUN.x * t), p.z - (s.a.z + SUN.z * t)) < s.r + 0.6; });   // 光の筋の通り道
  } });
}
// ---------------------------------------------------------------- 草花：シダ・草むら・白い小花・青緑に光るベルの花（石のそば）。tops ＝ 石の上の、草の生える所
export function createPlants(trees, foot, glow, tops = [], seed = 45) {
  const r = rng(seed), C = RUINS.count, mat = kit.createPlantMaterial(), group = new THREE.Group(), dummy = new THREE.Object3D(), col = new THREE.Color(); group.name = 'plants';
  const blocked = (x, z) => trees.some((t) => t.layer < 2 && Math.hypot(t.x - x, t.z - z) < t.R * 1.5 + 0.1) || foot.some((m) => Math.hypot(m.x - x, m.z - z) < m.r * 0.8);
  const nearStone = (x, z) => foot.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.9);
  // 決まった場所に置く草（同じメッシュにまぜる ＝ 描く回数をふやさない）：石の上に根づいたもの（tops）と、石だたみ・広場のふちの、石のすき間から生える小さなもの（歩く人の足をかくさない大きさ）
  const fixed = { fern: [], tuft: [], flower: [] };
  for (const t of tops) (t.fern ? fixed.fern : fixed.tuft).push({ p: t.p, s: t.fern ? 0.4 + 0.22 * r() : 0.42 + 0.28 * r() });
  for (let i = 0; i < 150; i++) {
    const kind = r() < 0.55 ? 'tuft' : 'flower'; let x, z;
    if (r() < 0.62) { z = lerp(4, -(STEP.s0 - 0.4), r()); x = pathX(z) + (r() < 0.5 ? -1 : 1) * (1.28 + r() * 0.62); }        // 参道：石だたみのふちの石のすき間
    else { const a = r() * 6.283, d = 5.5 + r() * 1.45; if (Math.sin(a) > 0.72) continue; x = CX + Math.cos(a) * d; z = CZ + Math.sin(a) * d; }      // 広場：ふちに近い所
    if (foot.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.15)) continue;
    fixed[kind].push({ p: V3(x, groundH(x, z) - 0.01, z), s: kind === 'tuft' ? 0.26 + 0.16 * r() : 0.5 + 0.25 * r() });
  }
  function place(geo, count, accept, scale, tints, name, extra = []) {
    const mesh = new THREE.InstancedMesh(geo, mat, count + extra.length); let made = 0;
    for (let tries = 0; made < count && tries < count * 60; tries++) {
      const z = lerp(8, CZ - CO.r - 5, r()), x = (z < -P.len ? CX : pathX(z)) + (r() - 0.5) * (z < -P.len ? 30 : 22), sd = Math.min(walkSd(x, z) + P.halfW - P.pave, Math.hypot(x - CX, z - CZ) - CO.r - 0.5);
      if (sd < 0.1 || r() > accept(sd, x, z) || blocked(x, z)) continue;
      const s = lerp(scale[0], scale[1], r());
      dummy.position.set(x, groundH(x, z) - 0.02, z); dummy.rotation.set((r() - 0.5) * 0.16, r() * 6.283, (r() - 0.5) * 0.16); dummy.scale.set(s, s * (0.85 + 0.3 * r()), s); dummy.updateMatrix();
      mesh.setMatrixAt(made, dummy.matrix); mesh.setColorAt(made, col.set(pickOf(r, tints)).multiplyScalar(0.85 + 0.3 * r())); made++;
    }
    for (const e of extra) {
      dummy.position.copy(e.p); dummy.rotation.set((r() - 0.5) * 0.3, r() * 6.283, (r() - 0.5) * 0.3); dummy.scale.set(e.s, e.s, e.s); dummy.updateMatrix();
      mesh.setMatrixAt(made, dummy.matrix); mesh.setColorAt(made, col.set(pickOf(r, tints)).multiplyScalar(0.85 + 0.3 * r())); made++;
    }
    mesh.count = made; mesh.frustumCulled = false; mesh.name = name; group.add(mesh);
    return mesh;
  }
  const edge = (sd, lo, hi) => (sd < lo ? 0 : Math.exp(-(sd - lo) / hi));
  place(buildFern(3), C.fern, (sd) => edge(sd, 0.15, 3.0), [0.75, 1.4], ['#ffffff', '#f2f2c4', '#dcecc0'], 'ferns', fixed.fern);
  place(buildTuft(), C.tuft, (sd) => edge(sd, 0.1, 2.6), [0.7, 1.3], ['#ffffff', '#f0f0b4', '#d8e8b0'], 'tufts', fixed.tuft);
  place(buildWildflowers(7), C.flower, (sd) => edge(sd, 0.2, 2.2) * 0.8, [0.8, 1.2], ['#ffffff', '#fff6d0', '#fff0e0'], 'wildflowers', fixed.flower);
  const bells = place(buildBell(5), C.bell, (sd, x, z) => (nearStone(x, z) ? 0.9 : 0.04) * edge(sd, 0.1, 4), [0.6, 1.0], ['#a8ffe8', '#c4fff0', '#9ff0e0'], 'bell_flowers');
  const m4 = new THREE.Matrix4(), ps = new THREE.Vector3();
  for (let i = 0; i < bells.count; i++) { bells.getMatrixAt(i, m4); ps.setFromMatrixPosition(m4); glow.push({ p: V3(ps.x, ps.y + 0.6, ps.z), size: 0.85, color: RUINS.rune, opacity: 0.17 }); }
  return group;
}

// ================================================================ 組み立て
const dapple = createDapple();
const sky = createSky(fpU.tNoise.value, { lite: LITE });
{ const u = sky.u, K = RUINS.sky; u.uZen.value.set(K.zen); u.uHor.value.set(K.hor); u.uLow.value.set(K.low); u.uCloud.value.set(K.cloud); u.uCloudSh.value.set(K.cloudSh);
  u.uSunCol.value.set(K.sun); u.uSunDir.value.copy(SUN); u.uCloudAmt.value = 0.6; u.uSunAmt.value = 1; u.uStars.value = 0; }
scene.add(sky.mesh);

const ground = createGround(); scene.add(ground.mesh);
const fieldTex = createFieldTextures(ground);
// 草：ふさふさの短い草（area_kit.js の createTurf）。?turf=0 で、前のまばらな草（nature.js の createGrass）にもどして見くらべられる
const grass = params.get('turf') === '0' ? createGrass({ scale: RUINS.count.grass, field: fieldTex.field, groundTex: fieldTex.groundTex, map: fieldTex.map })
  : kit.createTurf({ field: fieldTex.field, map: fieldTex.map, ...RUINS.turf });
grass.group.children.forEach((m) => addDapple(m.material));
scene.add(grass.group);
const grassSun = { position: SUN.clone(), target: { position: V3(0, 0, 0) }, color: new THREE.Color(L.sun), intensity: 1.1 };

const stoneMat = createStoneMaterial(), ruins = buildRuins(), gates = placeGates();
const ruinMesh = new THREE.Mesh(ruins.geo, stoneMat); ruinMesh.name = 'ruins'; ruinMesh.frustumCulled = false;
const farRuin = new THREE.Mesh(buildFarRuin(), stoneMat); farRuin.name = 'far_ruin';
scene.add(ruinMesh, createGates(gates, stoneMat), farRuin, createBasinWater(ruins.water));
const vines = buildVines(ruins);                                   // つる（幹と同じ樹皮のマテリアル）。葉は createRuinCanopy で付ける
{ const m = new THREE.Mesh(vines.geo, kit.createBarkMaterial()); m.name = 'vines'; m.frustumCulled = false; scene.add(m); }
// 祭壇の上にうかぶ、光る石（ゆっくり回って、上下する）
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: '#d4fff2', fog: false })); crystal.scale.set(1, 1.7, 1); crystal.name = 'altar_crystal'; crystal.visible = !SUN_GAME; scene.add(crystal);      // 太陽ゲームでは出さない（同じ場所に、太陽のかけらが浮かぶ）
const CRYSTAL_Y = floorY(CZ) + 2.0;

const shafts = kit.createLightShafts(dapple.pools, { groundH, topH: RUINS.canopyH + 3.5 }); scene.add(shafts.mesh);
const trees = createRuinTrees(ruins.foot); scene.add(trees.group);
const canopy = createRuinCanopy(trees, shafts.list, ruins.foot, vines.leaves); scene.add(canopy);
const glowItems = [];
scene.add(createPlants(trees.list, ruins.foot.concat(ruins.extra), glowItems, ruins.tops));
for (const w of ruins.water) if (w.z !== ALTAR.z) glowItems.push({ p: V3(w.x, w.y + 0.12, w.z), size: 1.7, color: RUINS.rune, opacity: 0.13 });      // 石の器の水の、ほのかな光
glowItems.push({ p: V3(0, 2.2, RUINS.backZ + 4.5), size: 9, color: '#fff2d0', opacity: 0.45 }, { p: V3(0, 0.06, RUINS.backZ + 1.5), size: 7, color: '#fff0c8', opacity: 0.25, flat: true });   // 広場へ戻る道の奥の、日の光
glowItems.push({ p: V3(CX, floorY(CZ) + 0.07, CZ), size: 8.5, color: '#ffe9a8', opacity: 0.3, flat: true }, { p: COURT_GLOW.clone(), size: 20, color: '#ffeeb0', opacity: 0.1 });      // 広場のまん中：日だまり
if (!SUN_GAME) glowItems.push({ p: V3(CX, floorY(CZ) + 0.09, CZ), size: 8, color: RUINS.rune, opacity: 0.16, flat: true },                                                                 // 床の模様の光
  { p: V3(ALTAR.x, CRYSTAL_Y, ALTAR.z), size: 3.6, color: RUINS.rune, opacity: 0.42 }, { p: V3(ALTAR.x, CRYSTAL_Y, ALTAR.z), size: 9, color: RUINS.rune, opacity: 0.1 });                  // 光る石
for (const g of gates) glowItems.push({ p: V3(g.x, g.y + 1.58, g.z), size: 1.5, color: RUINS.rune, opacity: 0.22 });      // 門の穴のあたり
for (const a of RUINS.arches) for (const sd of [-1, 1]) { const z = -a.s, yaw = Math.atan(pathSlope(z)); glowItems.push({ p: V3(pathX(z) + sd * 2.25 * Math.cos(yaw), groundH(pathX(z), z) + 2.1, z - sd * 2.25 * Math.sin(yaw)), size: 2.2, color: RUINS.rune, opacity: 0.12 }); }
scene.add(createGlowCards(glowItems, 'flora_glow'));
// 光の粒（area_kit.js）：光の筋の中のほこり ＋ 石のまわりの青緑の光
scene.add((() => {
  const n = RUINS.count.motes, r = rng(49), pos = new Float32Array(n * 3), sd = new Float32Array(n * 2), gr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const kind = i < n * 0.6 ? 0 : 1, inCourt = r() < 0.35, z = inCourt ? CZ + (r() - 0.5) * 12 : lerp(6, -P.len, r()), x = inCourt ? CX + (r() - 0.5) * 12 : pathX(z) + (r() - 0.5) * (kind ? 7 : 9);
    pos.set([x, (kind ? 0.3 : 0.5) + r() * (kind ? 2.4 : 5.5), z], i * 3); sd.set([r(), kind], i * 2); gr[i] = floorY(z);
  }
  return kit.createMotes({ pos, seed: sd, ground: gr });
})());
scene.add(kit.createButterflies(RUINS.count.butterflies, (r) => { const z = lerp(-4, -P.len + 2, r()), x = pathX(z) + (r() - 0.5) * 6; return [x, z, floorY(z) + 0.4]; }, 79));

// ---------------------------------------------------------------- プレイヤー・音・はじまり・エリアの行き来
const player = newPlayer({ pitch: 0.03 });
const controls = createWalkControls(renderer.domElement, player, camera, { stickEl: document.getElementById('stick'), knobEl: document.getElementById('knob') });
// 静かな響き：弱い風、まばらな鳥、石をふむ足音。低い長い音が、広場に近づくほど大きくなり、ときどき遠い鈴のような音
const audio = createAreaAudio({ wind: { g: [0.08, 0.18], lp: [260, 480], hi: [0.004, 0.03] }, birds: { set: 'forest', vol: [0.01, 0.028], gap: [3.5, 8] },
  steps: { low: 0.15, thump: 0.2, swish: [0.006, 0.006] },
  tone: { notes: [73.42, 110.0, 146.83, 220.0, 293.66, 440.0], amps: [0.5, 0.46, 0.36, 0.22, 0.14, 0.06], gain: 0.42, lp: [240, 1400] } });
// 3 人称のエルフ（area_kit.js の createViewWalker）の設定：アニメ影の光の向き ＝ このエリアの太陽
const AVATAR_OPT = { light: SUN.toArray(), footH };                 // footH ＝ 石段では、段の上に足がのる
const walker = createViewWalker({ params, scene, addDapple, U: fpU, grass, avatar: AVATAR_OPT, player, controls, camera, constrain, groundH, eye: RUINS.eye, speed: RUINS.speed, onStep: (foot) => audio.footstep(foot), helpEl: document.getElementById('help') });
wireStart({ params, controls, audio });
const travel = createTravel({ params, controls });                 // 入口の後ろ → 大樹の広場の北東の出口
// 太陽の魔法陣（magic_circle.js。使い方は magic_circle.md）：石柱の広場のまん中の床（localStorage の sunCircle_ruins に残る。?circle=reset で戻す）
// 太陽ゲーム（?game=sun）では、魔法陣は出ず（部品が自分で切りかえる）、太陽のかけらだけが、祭壇の台の上（前の「光る石」の場所）に浮かぶ。こちらは場所を渡すだけ：
//   piece.front・dist ＝ 円の中心から祭壇へ、祭壇までの距離 → かけらは祭壇の真上。height ＝ 光る石と同じ高さ。stand ＝ 拾うときに立つ所（祭壇の「入れない所」半径 1.6 m のすぐ外）
//   cine.free ＝ 部品の「その点に、かけら・カメラが入ってよいか」の調べ方。祭壇のまわりだけ、祭壇の形（台・柱・受け皿）で決める ＝ 受け皿より上なら入ってよい
//     （部品の初期の式は「歩ける所から 0.45 m 以内」。祭壇は歩けない所なので、そのままだと、かけらが別の向きへ回され、拾う演出のカメラが祭壇の中へ押しこまれる）。ほかの場所は、初期の式と同じ
//   cine.minH ＝ 演出のカメラの高さの下限。エルフは祭壇のすぐ前に立つので、カメラ（エルフのななめ前 ＝ 祭壇の側）が受け皿より上から見おろすようにする
const PIECE_H = CRYSTAL_Y - (floorY(CZ) + 0.04);
const pieceFree = (p) => {
  const fy = floorY(CZ), ar = Math.hypot(p.x - ALTAR.x, p.z - ALTAR.z);
  if (ar < ALTAR.r + 0.65) return p.y > fy + (ar < 0.78 ? 1.5 : ar < ALTAR.r + 0.3 ? 0.55 : 0.22);      // 受け皿（半径 0.62・上の面 1.44 m）より上／円い台（高さ 0.3 m）より上
  if (p.y < fy + 0.16 || p.y < groundH(p.x, p.z) + 0.22) return false;
  const c = constrain(p.x, p.z); return Math.hypot(c[0] - p.x, c[1] - p.z) <= 0.45;
};
const circle = createMagicCircle({ scene, position: [CX, floorY(CZ) + 0.04, CZ], radius: RUINS.circle.r, pattern: 'ruins', color: RUINS.rune, color2: '#bfffe8', key: SUN_CIRCLE_KEYS.ruins,
  riseTo: [CX, floorY(CZ) + 16, CZ], muted: () => audio.isMuted(),
  ...(SUN_GAME ? { piece: { front: [ALTAR.x, ALTAR.z], dist: Math.hypot(ALTAR.x - CX, ALTAR.z - CZ) - RUINS.circle.r, height: PIECE_H, stand: ALTAR.r + 0.55 }, cine: { free: pieceFree, minH: RUINS.pieceCamH } } : {}) });
const dayNight = kit.createDayNight({ params, scene, sky: sky.u });      // 昼と夜（夜は、光る模様と光る石がいちばん目立つ）

// ---------------------------------------------------------------- 確認用：場面・速さ・確認画像
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const VIEWS = {
  A: { x: 0, z: 0.4, yaw: 0.0, pitch: 0.06 },                                                              // 入口
  B: { x: pathX(-12.5), z: -12.5, yaw: yawTo(pathX(-12.5), -12.5, pathX(-19), -19), pitch: 0.14 },         // くずれたアーチ
  C: { x: pathX(-P.len + 1.2), z: -P.len + 1.2, yaw: yawTo(pathX(-P.len + 1.2), -P.len + 1.2, CX, CZ - 2), pitch: 0.05 },   // 奥の石柱の広場
};
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
const clock = () => FIXED_T ?? performance.now() / 1000;
function renderFrame(t) {
  if (renderer.domElement.width < 2 || renderer.domElement.height < 2) return;
  windU.uTime.value = fpU.uFpTime.value = t;
  walker.placeCamera(t);
  crystal.position.set(ALTAR.x, CRYSTAL_Y + 0.08 * Math.sin(t * 0.9), ALTAR.z); crystal.rotation.y = t * 0.4;
  renderer.info.reset();
  grass.update(camera, grassSun);
  composer.render();
}
const tools = createTools({ params, stage, lite: LITE, player, views: VIEWS, constrain, renderFrame, clock });
const PREVIEW = [['A', '入口'], ['B', 'くずれたアーチ'], ['C', '奥の石柱の広場']];          // 3 場面の確認画像（横に 3 枚）
window.__ruins = { render: () => renderFrame(clock()), RUINS, VIEWS, player, audio, controls, travel, renderer, scene, camera, gates, circle, places: { COURT: { x: CX, z: CZ, r: CO.r }, ALTAR, STEPS: { s0: STEP.s0, n: STEP.n, run: STEP.run }, FAR: RUINS.far }, footH,
  setView: tools.setView, view: tools.setView, bench: tools.bench, shot: tools.shot, preview: (w = 720, h = 540) => tools.preview(PREVIEW, 3, w, h), constrain, walkSd, groundH, pathX, frames: 0, errors: [],
  counts: { stones: ruins.foot.length, vineLeaves: vines.leaves.length, stonePlants: ruins.tops.length, water: ruins.water.length, gates: gates.length, giants: trees.list.length, canopy: canopy.count, glow: glowItems.length, shafts: dapple.pools.length } };
window.addEventListener('error', (e) => window.__ruins.errors.push(String(e.message)));

// ---------------------------------------------------------------- 毎フレーム
runLoop({ stage, lite: LITE, clock, renderFrame, api: window.__ruins, update(dt, t) {
  walker.update(dt);
  circle.update(dt, t, player.x, player.z);
  if (!travel.busy && player.z > RUINS.backZ) travel.go('main_plaza.html', 'ruins');
  const k = 1 - sstep(Math.hypot(player.x - CX, player.z - CZ), 3, 44);
  audio.update(dt, { t, gust: gustAt(player.x, player.z, t) * 0.6, prox: 0.12 + 0.5 * k });
} });
