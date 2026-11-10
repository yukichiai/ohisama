// =====================================================================
// エリア①「花の丘」：森の出口の木かげ → 急に空が開ける → 花と背の高い草の丘 → 丘の上（1 人称で歩くテスト場面。本編にはまだ組みこんでいない）
// 今あるファイル（nature.js・foliage.js・trees.js）は import して使うだけ。
// 光・森の部品・舞う粒・音・操作は area_kit.js（「森の小道」forest_path.js と同じもの）。
// このファイルは、花の丘だけのもの：
//   丘の形（groundH・constrain）/ HILL_GLSL（丘を走る風の波・花の色の広がり）/ createHillGround（遠くは色の波と花の色で見せる）
//   createHillGrass（nature.js の草を背を高くして使う）/ createFlowerRing（カメラのまわりだけに咲く花）
//   createHillTrees（森の出口の巨木・丘の上の木の幹）/ createHillCanopy / createExitPlants / createBlossomTree（丘の上の主役：花が垂れ下がる木）
//   広場へ戻る場所：スタートの後ろ（森の奥、z = BACK_Z より先）へ歩くと、フェードして main_plaza.html の西の出口に出る
//   createFarTree（地平線の光る大樹）/ createPetalStream（大樹から流れてくる花びらの川）/ createFluff（綿毛と光の粒）/ createHillSky・createClouds・遠くの丘の層
// 太陽ゲーム（?game=sun。入口は sun_start.html）のときだけ：花の丘と森が、ロードなしでひとつづきの場面になる。スタートの後ろの森を奥へ広げ、森の小道のとちゅうに
//   遺跡・キノコの谷・水晶の洞くつの入り口（GATES。形は sun_gates.js）を置く。広場への出口はなくなり、3 つのエリアから戻ると ?from=ruins・valley・cave で、その入り口の前に着く
// 確認用：?lite=1 ?wc=0 ?shot=1 ?debug=1 ?at=x,z,向き°,上下° ?t=秒   window.__hill.bench() / .view('A'〜'C') / .preview()
// =====================================================================
import * as THREE from 'three';
import { windU, WIND, WIND_GLSL, GRASS, createGrass } from './nature.js';
import { createForest, treeMaterial } from './trees.js';
import { foliageU } from './foliage.js';
import { areaParams, clamp, lerp, sstep, V3, rng, vnoise, glf, glc, glv, pickOf, gustAt, TILE, tileUV, TubeGeo, PlantGeo,
  buildFern, buildTuft, buildBell, buildMushrooms,
  createAreaKit, createAreaAudio, createWalkControls, createViewWalker, newPlayer, wireStart, createTravel, createStage, createTools, runLoop } from './area_kit.js';

import { createSunGates, gateEntered } from './sun_gates.js';

const { params, LITE } = areaParams();
const SUN_GAME = params.get('game') === 'sun';                     // 「太陽のない世界」のゲーム中（丘と森がひとつづき）

// ---------------------------------------------------------------- 数値（ここを直せばよい）
export const HILL = {
  exitZ: -9,                                                       // 森のはし（ここから先が丘）
  top: { x: 5, z: -66, h: 10 },                                    // 丘のてっぺん（場所と高さ）
  tree: { x: 6.0, z: -69, s: 0.82, crownR: 7.2 },                  // 丘の上の主役：花が垂れ下がる木（場所・幹の大きさ・枝の広がり）
  farTree: { x: -168.6, z: -368.2, h: 112 },                       // 地平線の光る大樹（場所と高さ）
  eye: 1.55, speed: 2.5, fov: 70,                                  // 目の高さ・歩く速さ・視野（森の小道と同じ）
  wind: 1.35,                                                      // 風の強さ（森の小道は 1）
  sun: new THREE.Vector3(-0.38, 0.72, -0.5).normalize(),           // 太陽のある向き（前の左上。草が逆光で透ける）
  canopyH: 8.5,
  light: { sky: '#eaf4ff', ground: '#b6dca0', hemiI: 2.2, sun: '#fff3d6', sunI: 1.25, tree: '#ffd0e0', treeGlow: 0 },
  // かすみ：手前はうすい緑 → 中ほどは青むらさき → 奥は桃色（地平線の空と同じ色）。大樹の方向は桃色に光る
  // 夜の色（昼と夜のスイッチ。area_kit.js の createDayNight）：景色に掛ける色・自分で光る色の強さ・にじむ光の板の強さ・光の筋の強さ・霧と空の色
  night: { tint: [0.42, 0.46, 0.8], glow: 1.5, cards: 1.6, shaft: 0.35, fog: { nearCol: '#2a3468', midCol: '#3a3e86', farCol: '#5c4e90', glowCol: '#ff9ccc' },
    sky: { zen: '#070c2c', mid: '#1c2460', hor: '#5c4e90', moon: '#e8eeff' } },
  fog: { near: 26, far: 900, nearCol: '#c6ecd8', midCol: '#b2c4f4', farCol: '#ffdfd4', glowCol: '#ffc4de', mist: 0, glowAmt: 0.5, glowPow: 4 },
  // 空：上は澄んだ青、地平線に近づくほど淡い桃色と金色
  sky: { zen: '#2c82e0', mid: '#9ccdf4', hor: '#ffdfd4', gold: '#ffe6a8', pink: '#ffb2d4', sun: '#fff6dc', cloud: '#ffffff', cloudSh: '#b4c4ee', cloudWarm: '#ffd2c8' },
  grade: { sat: 1.16, mul: [1.03, 1.0, 1.035], add: [0.012, 0.002, 0.02] },      // 水彩の効果の色味（少しあざやかに、ほんのり桃色）
  dapple: { col: [1.0, 0.9, 0.62], gain: 2.4, map: SUN_GAME ? { x0: -26, z0: -12, w: 52, d: 60 } : { x0: -16, z0: -12, w: 32, d: 24 } },      // まだらな光の画像がおおう範囲（太陽ゲームは、森の奥まで）
  shaft: { col: '#ffeab4', amt: 0.42 },
  trunk: { bark: '#51454a', bark2: '#66544c', moss: '#679c6c' },
  leaves: ['#2f6b55', '#3d8062', '#4f9a6c', '#6fb47a', '#8fc97f', '#b6dc8a', '#bfe9d2'],
  blossom: ['#c9a2ff', '#e2c6ff', '#f6cdea', '#ffffff', '#ffd6ea', '#d9b4ff'],    // 丘の上の木の花（うす紫・桃・白）
  grass: { height: [0.34, 0.86], sway: 0.26, lean: 0.6, color: '#a2d880' },   // nature.js の草を、背を高く・やわらかく
  flowers: ['#ff8fbd', '#ffffff', '#ffd84f', '#b497ff', '#ff6b6b'],            // 桃・白・黄・うす紫・赤
  lumen: ['#bff6ff', '#ffe0f4', '#fff4c0'],                                    // ほのかに光る花（水色・桃・金）
  count: LITE
    ? { canopy: 2300, grass: 0.75, flowers: 13000, flowerR: 24, lumen: 1500, fern: 70, tuft: 90, bell: 14, shroom: 8, petals: 200, motes: 170, butterflies: 22, woods: 60, crowns: 60, clouds: 15,
        blossom: 520, strands: 150, treePetals: 50, fluff: 280, stream: 500, farCards: 600 }
    : { canopy: 4600, grass: 1.0, flowers: 26000, flowerR: 30, lumen: 2600, fern: 130, tuft: 170, bell: 24, shroom: 14, petals: 400, motes: 320, butterflies: 40, woods: 110, crowns: 110, clouds: 24,
        blossom: 950, strands: 300, treePetals: 90, fluff: 520, stream: 900, farCards: 1000 },
};
const TOP = HILL.top, HT = HILL.tree, FT = HILL.farTree, SUN = HILL.sun, L = HILL.light, EXIT_Z = HILL.exitZ;
const TREE_SHADOW = { x: HT.x - SUN.x / SUN.y * 9, z: HT.z - SUN.z / SUN.y * 9 };           // 丘の上の木のかげが落ちる所

// ---------------------------------------------------------------- 丘の形（地面の高さ・歩ける所）
// ふみ分け道：森の出口からまっすぐ出て、ゆるく曲がりながら丘の上の木へ
export function trailX(z) { return TOP.x * sstep(-z, 10, 60) + Math.sin(z * 0.21) * 0.9 * sstep(-z, 8, 20); }
const TRAIL_GLSL = `float hillTrailX(float z){ return ${glf(TOP.x)} * smoothstep(10.0, 60.0, -z) + sin(z * 0.21) * 0.9 * smoothstep(8.0, 20.0, -z); }`;
// 地面の高さ：森の中は平ら。丘はなだらかな山の形（いちばん急な所で約 14°）＋ ゆるいうねり。丘のむこうは遠くの丘がつづく
export function groundH(x, z) {
  const d = Math.hypot(x - TOP.x, z - TOP.z), open = sstep(-z, 9, 30);
  let h = TOP.h * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * Math.min(d / 64, 1)), 1.15);
  h += (vnoise(x * 0.055 + 2.3, z * 0.055) - 0.5) * 1.5 * open * (0.4 + 0.6 * sstep(d, 50, 150));     // 歩く丘は なめらかに、遠くは うねりを大きく
  h += (vnoise(x * 0.011 + 9.1, z * 0.011 + 3.3) - 0.42) * 30 * sstep(d, 75, 230) * sstep(-z, 30, 110);
  return h;
}
const BACK_Z = 5.6;                                                // スタートの後ろ：ここより奥へ歩くと、大樹の広場へ戻る
// ---------------------------------------------------------------- 太陽ゲーム（?game=sun）：森の小道は、スタートの後ろへ z = FOREST_END までつづく。とちゅうから、3 つのエリアの入り口（GATES）へ枝道が出る
// pts ＝ [分かれ目, 曲がり角, 入り口]（x, z）。x・z ＝ 入り口の場所、d ＝ 入っていく向き、spawn ＝ そのエリアから戻ったときに立つ所（入り口の 2.8 m 手前で、入り口に背を向ける）
// ふつうの花の丘（?game=sun なし）では GATES・SEGS は空 ＝ 形も木のならびも前と同じ
const BR_W = 1.15, FOREST_END = 30;                                // 枝道の歩ける幅の半分、森の小道のおわり（m）
export const GATES = !SUN_GAME ? [] : [
  { name: 'ruins', to: 'mossy_ruins.html', pts: [[0, 8.0], [8.0, 10.5], [15.5, 14.5]] },                 // 苔むした遺跡：森に入って少し先から、丘を背にして左へ（苔の石の門）
  { name: 'valley', to: 'mushroom_valley.html', pts: [[0, 16.0], [-8.0, 18.5], [-16.0, 21.5]] },         // 光るキノコの谷：もう少し奥から右へ（光るキノコのならぶ道）
  { name: 'cave', to: 'crystal_cave.html', pts: [[0, FOREST_END - 0.5], [0.8, 35.5], [2.2, 41.5]] },     // 水晶の洞くつ：森の小道のつきあたり（岩の口と水晶）
].map((g) => { const m = g.pts[1], b = g.pts[2], dl = Math.hypot(b[0] - m[0], b[1] - m[1]), d = [(b[0] - m[0]) / dl, (b[1] - m[1]) / dl];
  return { ...g, x: b[0], z: b[1], d, spawn: { x: b[0] - d[0] * 2.8, z: b[1] - d[1] * 2.8, yaw: Math.atan2(d[0], d[1]) } }; });
// 森の中の歩ける所：線分と、幅の半分（森の小道 ＝ 丘の出口から FOREST_END まで、と枝道）
const SEGS = !SUN_GAME ? [] : [{ a: [0, EXIT_Z - 1], b: [0, FOREST_END], w: 1.3 }, ...GATES.flatMap((g) => [0, 1].map((i) => ({ a: g.pts[i], b: g.pts[i + 1], w: BR_W })))];
// いちばん近い道：{ sd ＝ 歩ける所からの距離（中は負）, raw ＝ 中心線からの距離, c ＝ 中心線の上のいちばん近い点, w ＝ 幅の半分 }
function forestNear(x, z) {
  let best = null;
  for (const s of SEGS) {
    const bx = s.b[0] - s.a[0], bz = s.b[1] - s.a[1], t = clamp(((x - s.a[0]) * bx + (z - s.a[1]) * bz) / (bx * bx + bz * bz), 0, 1), cx = s.a[0] + bx * t, cz = s.a[1] + bz * t, raw = Math.hypot(x - cx, z - cz);
    if (!best || raw - s.w < best.sd) best = { sd: raw - s.w, raw, c: [cx, cz], w: s.w };
  }
  return best;
}
const OBST_SUN = [];                                               // 太陽ゲーム：丘のすそに立つ木の幹（入れない所）
const halfW = (z) => lerp(1.3, 15, sstep(-z, 7, 19));              // 歩ける幅の半分：森の中は小道、丘に出ると広い
const offWalk = (x, z) => Math.abs(x - trailX(z)) - halfW(z);      // 歩ける所からの距離（中は負）
export function constrain(x, z) {
  if (SEGS.length && z > BACK_Z - 1) {                             // 太陽ゲーム：スタートの後ろは、森の小道と枝道の上を歩ける
    const n = forestNear(x, z); if (n.raw > n.w) { const k = n.w / n.raw; x = n.c[0] + (x - n.c[0]) * k; z = n.c[1] + (z - n.c[1]) * k; }
    return [x, z];
  }
  z = clamp(z, TOP.z - 8, BACK_Z + 1.0);
  const cx = trailX(z), w = halfW(z); x = clamp(x, cx - w, cx + w);
  const tx = x - HT.x, tz = z - HT.z, td = Math.hypot(tx, tz), R = 1.4;      // 丘の上の木の幹には入れない（見える幹は、腰の高さで半径 約 1 m。前の 1.9 m だと、幹の 1 m 手前の、たれ下がる花の中で止まって見えた）
  if (td < R) { const k = R / Math.max(td, 1e-4); x = HT.x + tx * k; z = HT.z + tz * k; }
  for (const o of OBST_SUN) { const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz); if (od < o.r) { const k = o.r / Math.max(od, 1e-4); x = o.x + ox * k; z = o.z + oz * k; } }
  return [x, z];
}

// ---------------------------------------------------------------- 共通の部品（area_kit.js）と three.js の準備
const FT_Y = groundH(FT.x, FT.z) - 2, FT_C = V3(FT.x, FT_Y + FT.h * 0.7, FT.z);            // 地平線の大樹：根元の高さ、花のかたまりの中心
const kit = createAreaKit({ ...HILL, lite: LITE, glowPos: FT_C,
  // かげ：森の中の木かげ（ふちは模様でゆらす）・ゆっくり流れる雲のかげ（青みがかる）・丘の上の木のかげ
  shadeGLSL: `vec3 fpShade(vec3 wp){
    float n = texture2D(tFpNoise, wp.xz * 0.05).g;
    float inF = smoothstep(${glf(EXIT_Z - 2.5)}, ${glf(EXIT_Z + 2)}, wp.z + (n - 0.5) * 5.0) * (1.0 - 0.8 * smoothstep(10.0, 16.0, wp.y));   // 森の中（こずえの上は日なた）
    float cl = texture2D(tFpNoise, wp.xz * 0.0045 + vec2(uFpTime * 0.004, uFpTime * 0.0016)).b;
    vec3 cloud = mix(vec3(1.0), vec3(0.6, 0.69, 0.86), smoothstep(0.5, 0.66, cl));
    float tr = (1.0 - smoothstep(3.5, 9.5, length(wp.xz - vec2(${glf(TREE_SHADOW.x)}, ${glf(TREE_SHADOW.z)})))) * (1.0 - smoothstep(4.0, 9.0, wp.y - ${glf(TOP.h)}));
    return mix(cloud * mix(vec3(1.0), vec3(0.5, 0.52, 0.66), tr), vec3(0.3, 0.37, 0.4), inF);
  }` });
const fpU = kit.U, { addDapple, createGlowCards } = kit;
kit.installFog();                                  // 遠くほど色が変わる（緑 → 青むらさき → 桃色）。大樹の方向は桃色に光る
const stage = createStage({ params, U: fpU, fov: HILL.fov, background: HILL.fog.farCol, fog: HILL.fog, far: 1300, grade: HILL.grade });
const { renderer, scene, camera, composer } = stage;
const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemiI); scene.add(hemi);
const sun = new THREE.DirectionalLight(L.sun, L.sunI); sun.position.copy(SUN).multiplyScalar(60); scene.add(sun, sun.target);
windU.uWind.value = HILL.wind;

// ================================================================ 丘だけの見た目
// ---------------------------------------------------------------- シェーダーの関数：丘を走る風の波・花の色の広がり（地面・草・花が同じ式を使うので、波と色がそろう）
const WD = WIND.dir, FC = HILL.flowers, LC = HILL.lumen;
const HILL_GLSL = `
  uniform sampler2D tHillN;
  // 風の波（0〜1）：風下へ走る明るい帯。帯は模様でゆがむ。nature.js の「ときどき通る強い風」が来ると、はっきりする
  float hillWave(vec2 xz, float t){
    float along = dot(xz, vec2(${glf(WD[0])}, ${glf(WD[1])}));
    float w = sin(along * 0.26 - t * 1.9 + texture2D(tHillN, xz * 0.006).g * 9.0) * 0.5 + 0.5;
    float big = sin(along * 0.045 - t * ${glf(WIND.gustSpeed)}) * 0.5 + 0.5;
    return w * w * w * (0.45 + 0.55 * smoothstep(0.3, 0.9, big));
  }
  // 花：rgb ＝ その場所に多い花の色、a ＝ 花の多さ（0〜1）。丘をななめに横切る、色ごとの長い帯とかたまりになる
  vec4 hillFlowers(vec2 xz){
    vec2 q = vec2(dot(xz, vec2(0.8, 0.6)), dot(xz, vec2(-0.6, 0.8)));
    float dens = smoothstep(0.36, 0.55, texture2D(tHillN, q * vec2(0.0045, 0.017)).g * 0.62 + texture2D(tHillN, xz * 0.023 + 0.4).b * 0.38);
    float h = texture2D(tHillN, q * vec2(0.0032, 0.011) + 0.7).g + (texture2D(tHillN, xz * 0.05).r - 0.5) * 0.1;
    vec3 c = mix(${glc(FC[4])}, ${glc(FC[0])}, smoothstep(0.39, 0.42, h));
    c = mix(c, ${glc(FC[1])}, smoothstep(0.455, 0.485, h)); c = mix(c, ${glc(FC[2])}, smoothstep(0.515, 0.545, h)); c = mix(c, ${glc(FC[3])}, smoothstep(0.575, 0.605, h));
    return vec4(c, dens);
  }
  ${TRAIL_GLSL}`;

// ---------------------------------------------------------------- 地面：近くは細かい網、遠くは荒い網、その先に遠くの丘の層。遠くの草と花は、色の波と花の色で見せる
const RECT = { X0: -45, X1: 55, Z0: -110, Z1: SUN_GAME ? 56 : 30 };                // 細かい網（と、草・花が使う地面の画像）の範囲
let groundMat = null;
function hillGroundMaterial() {
  if (groundMat) return groundMat;
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tHillN = fpU.tNoise;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${HILL_GLSL}\nfloat fpSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 wp = vFogWorld; float dist = vFogDepth;
        float n1 = texture2D(tHillN, wp.xz * 0.021).g, n2 = texture2D(tHillN, wp.xz * 0.13).r, n3 = texture2D(tHillN, wp.xz * 1.3).r;
        vec2 bq = vec2(dot(wp.xz, vec2(0.8, 0.6)), dot(wp.xz, vec2(-0.6, 0.8)));
        vec3 g = mix(${glc('#74c070')}, ${glc('#a4da80')}, smoothstep(0.3, 0.7, n1)) * (0.86 + 0.28 * n2);
        g = mix(g, ${glc('#d0e68a')}, smoothstep(0.55, 0.8, texture2D(tHillN, wp.xz * 0.05 + 0.3).b) * 0.5);        // 日なたの黄色っぽい所
        g = mix(g, ${glc('#62b89a')}, smoothstep(0.5, 0.72, texture2D(tHillN, bq * vec2(0.006, 0.021) + 0.6).r) * 0.4);   // 絵の具のむら（青緑の帯が丘をななめに流れる）
        float inF = smoothstep(${glf(EXIT_Z - 2)}, ${glf(EXIT_Z + 2.5)}, wp.z + (n2 - 0.5) * 3.0);                   // 森の床は苔
        g = mix(g, mix(${glc('#3c775a')}, ${glc('#5f9f66')}, smoothstep(0.3, 0.7, n1)) * (0.82 + 0.36 * n2), inF);
        float trail = (1.0 - smoothstep(0.2, 0.55 + 0.35 * n2 + 0.75 * inF, abs(wp.x - hillTrailX(wp.z)))) * step(${glf(TOP.z - 1)}, wp.z);   // ふみ分け道（森の中は土の小道）
        ${!GATES.length ? '' : `{ float dBr = 1e3; ${GATES.map((g) => [0, 1].map((i) => `dBr = min(dBr, fpSeg(wp.xz, vec2(${glf(g.pts[i][0])}, ${glf(g.pts[i][1])}), vec2(${glf(g.pts[i + 1][0])}, ${glf(g.pts[i + 1][1])})));`).join(' ')).join(' ')}
          trail = max(trail * (1.0 - smoothstep(${glf(FOREST_END - 0.6)}, ${glf(FOREST_END + 0.8)}, wp.z)), 1.0 - smoothstep(0.2, 1.3 + 0.35 * n2, dBr)); }      // 太陽ゲーム：森の小道は FOREST_END まで。そこから枝道`}
        g = mix(g, mix(${glc('#86725a')}, ${glc('#b9a57e')}, n2) * (0.86 + 0.28 * n3), trail * mix(0.55, 0.95, inF));
        float nearK = (1.0 - smoothstep(5.0, 24.0, dist)) * (1.0 - inF) * (1.0 - trail);                              // 足もと：草の根もとの暗さと、葉のすじ（草の本数が少なくても、地面がすけて見えない）
        g *= mix(1.0, 0.62 + 0.3 * smoothstep(0.3, 0.7, texture2D(tHillN, wp.xz * vec2(2.9, 1.1)).r), nearK);
        float w = hillWave(wp.xz, uFpTime) * (1.0 - inF);                                                             // 風の波：草がねて、白っぽく光る帯
        g = g * (1.0 + 0.42 * w) + ${glc('#f6ffd0')} * 0.16 * w;
        vec4 ff = hillFlowers(wp.xz);                                                                                 // 花：近くは本物の花（createFlowerRing）、遠くは色の点 → 色の帯
        float speck = mix(smoothstep(0.5, 0.72, n3), 0.6, smoothstep(30.0, 110.0, dist));
        g = mix(g, ff.rgb, ff.a * (1.0 - inF) * smoothstep(13.0, 28.0, dist) * speck * 0.78);
        float pf = step(0.72, n3) * (1.0 - smoothstep(3.0, 9.5, length(wp.xz - vec2(${glf(HT.x)}, ${glf(HT.z)}))));   // 丘の上の木の下に、散った花びら
        g = mix(g, ${glc('#f3dcff')}, pf * 0.85);
        diffuseColor.rgb = g;
      }`);
  };
  m.customProgramCacheKey = () => (SUN_GAME ? 'hillGroundSun' : 'hillGround');
  return (groundMat = addDapple(m));
}
export function createHillGround() {
  const m = hillGroundMaterial(), group = new THREE.Group(); group.name = 'ground';
  // 近く：1 m ごと（スマホは 1.4 m）
  const cell = LITE ? 1.4 : 1.0, near = new THREE.PlaneGeometry(RECT.X1 - RECT.X0, RECT.Z1 - RECT.Z0, Math.round((RECT.X1 - RECT.X0) / cell), Math.round((RECT.Z1 - RECT.Z0) / cell));
  near.rotateX(-Math.PI / 2); near.translate((RECT.X0 + RECT.X1) / 2, 0, (RECT.Z0 + RECT.Z1) / 2);
  const np = near.attributes.position; for (let i = 0; i < np.count; i++) np.setY(i, groundH(np.getX(i), np.getZ(i)));
  near.computeVertexNormals();
  // 遠く：まん中ほど細かく、外ほど荒い網。近くの網の下にもぐらせる
  const N = LITE ? 90 : 120, R = 560, far = new THREE.PlaneGeometry(2, 2, N, N); far.rotateX(-Math.PI / 2);
  const fp = far.attributes.position, warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), 1.8) * R, cx = (RECT.X0 + RECT.X1) / 2, cz = (RECT.Z0 + RECT.Z1) / 2;
  for (let i = 0; i < fp.count; i++) {
    const x = cx + warp(fp.getX(i)), z = cz + warp(fp.getZ(i));
    const inside = Math.min(x - RECT.X0, RECT.X1 - x, z - RECT.Z0, RECT.Z1 - z);
    fp.setXYZ(i, x, groundH(x, z) - 1.2 * sstep(inside, 0, 8), z);
  }
  far.computeVertexNormals(); far.computeBoundingSphere();
  group.add(new THREE.Mesh(near, m), new THREE.Mesh(far, m));
  group.add(createRidges(m));
  return group;
}
// 遠くの丘の層（4 枚）：丘を輪のようにかこむ、ゆるい斜面。遠い層ほど高く、かすみで 緑 → 青むらさき → 桃色 と色が変わって重なる
function createRidges(mat) {
  const layers = [[430, 24, 14, 1.3], [610, 46, 20, 4.1], [800, 74, 26, 7.7], [1000, 104, 30, 2.9]], N = LITE ? 72 : 120, pos = [], idx = [];   // 半径・高さ・うねり・模様のずれ
  layers.forEach(([rad, h0, amp, seed], li) => {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const th = i / N * Math.PI * 2, k = i === N ? 0 : i, a = k / N * 6.283;
      const h = h0 + amp * ((vnoise(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + seed) - 0.5) * 2 + (vnoise(Math.cos(a) * 6.5 + seed * 2, Math.sin(a) * 6.5) - 0.5) * 0.7);
      for (const [dr, hy] of [[-120, -8], [-48, h * 0.66], [0, h]]) pos.push(TOP.x + Math.cos(th) * (rad + dr), hy, TOP.z + Math.sin(th) * (rad + dr));
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) { const a = base + i * 3 + j, b = a + 3, c = a + 1, d = b + 1; idx.push(a, b, c, b, d, c); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'far_ridges';
  return mesh;
}
// nature.js の草と、花、が使う「地面の高さ（R）と草の量（G）」の画像、草の色の画像
function createFieldTextures() {
  const G = RECT, cell = 0.5, nx = Math.round((G.X1 - G.X0) / cell) + 1, ny = Math.round((G.Z1 - G.Z0) / cell) + 1, half = new Uint16Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = G.X0 + i * cell, z = G.Z0 + j * cell, dTrail = Math.abs(x - trailX(z));
    let g = z > EXIT_Z ? (SUN_GAME ? 0 : 0.5 * sstep(dTrail, 1.0, 1.8)) : 1;             // 森の中は短い草（小道は土）、丘は背の高い草。太陽ゲームの森は、別のふさふさの草（createTurfField）
    if (z <= EXIT_Z && z > TOP.z - 1) g = Math.min(g, lerp(0.45, 1, sstep(dTrail, 0.25, 0.9)));   // ふみ分け道は短い
    g *= sstep(Math.hypot(x - HT.x, z - HT.z), 0.9, 2.1);                                // 木の根元
    half[(j * nx + i) * 2] = THREE.DataUtils.toHalfFloat(groundH(x, z)); half[(j * nx + i) * 2 + 1] = THREE.DataUtils.toHalfFloat(g);
  }
  const field = new THREE.DataTexture(half, nx, ny, THREE.RGFormat, THREE.HalfFloatType);
  field.magFilter = field.minFilter = THREE.LinearFilter; field.needsUpdate = true;
  const map = { x0: G.X0, z0: G.Z0, w: G.X1 - G.X0, d: G.Z1 - G.Z0, hx0: G.X0, hz0: G.Z0, hcell: cell, nx, ny };
  const c = document.createElement('canvas'); c.width = c.height = 8; const g2 = c.getContext('2d'); g2.fillStyle = HILL.grass.color; g2.fillRect(0, 0, 8, 8);
  const groundTex = new THREE.CanvasTexture(c); groundTex.colorSpace = THREE.SRGBColorSpace;
  return { field, map, groundTex };
}

// 太陽ゲーム：森の床の、ふさふさの短い草（area_kit.js の createTurf）が使う「地面の高さ・草の量」の画像。森の床だけに生やす（小道と枝道は土。丘との境目は、背の高い草と重ねる）
function createTurfField(map) {
  const half = new Uint16Array(map.nx * map.ny * 2);
  for (let j = 0; j < map.ny; j++) for (let i = 0; i < map.nx; i++) {
    const x = map.hx0 + i * map.hcell, z = map.hz0 + j * map.hcell, g = z < EXIT_Z - 3 ? 0 : sstep(z, EXIT_Z - 2.5, EXIT_Z + 0.5) * sstep(forestNear(x, z).sd, -0.2, 0.5);
    half[(j * map.nx + i) * 2] = THREE.DataUtils.toHalfFloat(groundH(x, z)); half[(j * map.nx + i) * 2 + 1] = THREE.DataUtils.toHalfFloat(g);
  }
  const field = new THREE.DataTexture(half, map.nx, map.ny, THREE.RGFormat, THREE.HalfFloatType);
  field.magFilter = field.minFilter = THREE.LinearFilter; field.needsUpdate = true;
  return field;
}
// ---------------------------------------------------------------- 背の高いやわらかい草（nature.js のふさふさの草。カメラの近くだけ）。風の波で大きくねて、先が光る
// 太陽ゲーム：草・花を消す円（window.__hill.clearArea）。uClear ＝ (中心 x, z, 半径, ふちのぼかし幅)。半径 0 ＝ 消さない
//   hillClear(場所, 乱数) ＝ 1（そのまま）〜 0（消す）。ふちの帯では、外へ行くほど残る本数がふえ、背も高くなる（ぱっきり切れない）
export const CLEAR_U = { uClear: { value: new THREE.Vector4(0, 0, 0, 1) } };
const CLEAR_GLSL = `uniform vec4 uClear;
  float hillClear(vec2 p, float seed){
    if (uClear.z <= 0.0) return 1.0;
    float t = smoothstep(uClear.z - uClear.w, uClear.z + uClear.w * 0.35, length(p - uClear.xy));
    return step(fract(seed * 7.13 + 0.17) * 0.9, t) * mix(0.35, 1.0, t); }`;
const CLEAR_FLOWER = `\n        { float hc = hillClear(wxz, aB.w + 0.37); fh *= hc; alive *= step(0.001, hc); fs *= step(0.001, hc); }      // 太陽ゲーム：消す円（clearArea）`;
export function createHillGrass(fieldTex) {
  // このページの中だけ、草の背を高くする（nature.js は書きかえない）。軽い版は本数が少ないぶん、葉を太くする
  Object.assign(GRASS, { height: HILL.grass.height, sway: HILL.grass.sway, lean: HILL.grass.lean, width: LITE ? 0.078 : 0.055 });
  const grass = createGrass({ scale: HILL.count.grass, field: fieldTex.field, groundTex: fieldTex.groundTex, map: fieldTex.map });
  grass.group.children.forEach((mesh) => {
    const m = mesh.material, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.tHillN = fpU.tNoise;
      if (SUN_GAME) { sh.uniforms.uClear = CLEAR_U.uClear;                // 太陽ゲーム：消す円の中の草は背が 0（ふちは低く・まばら）
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${CLEAR_GLSL}`).replace('float ang = fract(aB.z * 17.13', 'hgt *= hillClear(wxz, aB.w);\n        float ang = fract(aB.z * 17.13'); }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nvarying float vHillK;\n${HILL_GLSL}`)
        .replace('#include <project_vertex>', `{ float hw = hillWave(transformed.xz, uTime) * position.y * position.y;
          transformed.xz += vec2(${glf(WD[0])}, ${glf(WD[1])}) * hw * 0.5; transformed.y -= hw * 0.16; vHillK = hw; }\n#include <project_vertex>`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHillK;')
        .replace('#include <opaque_fragment>', 'outgoingLight = outgoingLight * (1.0 + 0.6 * vHillK) + vec3(0.05, 0.06, 0.03) * vHillK;\n#include <opaque_fragment>');
    };
    m.customProgramCacheKey = () => `${prevKey()}|hillWave${SUN_GAME ? '|clear' : ''}`;
    addDapple(m);
  });
  return grass;
}

// ---------------------------------------------------------------- 花（カメラのまわり R m だけに咲く。場所はタイル状でカメラと一緒に動く＝花は地面に固定され、まわりだけ入れかわる）
// 1 輪 ＝ 細い茎の板 ＋ 花の板（上を向きつつ、こちらへ少しかたむく）。風と風の波でゆれる。3 つの組：
//   野の花（色と多さは hillFlowers。10 本に 1 本は ひざより高い大きな花）/ ほのかに光る花（かたまって咲く。丘の上の木のまわりに多い）/ 光る花のにじみ（加算の板）
// 花 1 輪の場所を決めるシェーダーの文（3 つの組が同じものを使う）。kind：咲くかどうか alive・高さ fh・花の大きさ fs・花の色 headCol を決める文
const flowerPlace = (R, kind, edge = `(1.0 - smoothstep(${glf(R * 0.6)}, ${glf(R)}, length(rel)))`, after = '') => `
        float fTile = ${glf(2 * R)};
        vec2 rel = mod(aB.xy * fTile - cameraPosition.xz + 0.5 * fTile, fTile) - 0.5 * fTile, wxz = cameraPosition.xz + rel;
        vec2 fld = texture2D(uField, ((wxz - uHGrid.xy) / uHGrid.z + 0.5) / uHN).rg;                       // 地面の高さ・草の量
        float fEdge = ${edge} * smoothstep(0.6, 0.9, fld.g);   // 遠くは縮んで消える。道や森には咲かない
        float alive, fh, fs, rh = fract(aB.z * 91.7); vec3 headCol;
        ${kind}${after}
        vec3 fRoot = vec3(wxz.x, fld.r - 0.02, wxz.y);
        float hw = hillWave(wxz, uTime);
        vec3 tipOff = windOffset(fRoot, 1.0, 0.3 * fh) + vec3(${glf(WD[0])}, -0.25, ${glf(WD[1])}) * hw * 0.6 * fh;
        float fph = aB.z * 40.0; tipOff.xz += vec2(sin(uTime * 2.7 + fph), cos(uTime * 2.3 + fph)) * 0.02 * uWind;
        vec3 tip = fRoot + vec3(0.0, fh, 0.0) + tipOff;
        vec3 toCam = normalize(cameraPosition - tip), fRight = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));`;
const KIND_MEADOW = `
        vec4 ff = hillFlowers(wxz);
        alive = fEdge * step(aB.z, ff.a * 0.94 + 0.05);                                                    // 花の多い所ほどたくさん
        float tall = step(0.68, aB.w), big = step(0.92, aB.w);                                              // 3 本に 1 本は背が高い。10 本に 1 本は、ひざより高い大きな花
        fh = (mix(0.3, 0.52, fract(aB.w * 7.3)) + tall * 0.3 + big * 0.32) * alive;
        fs = (0.075 + 0.05 * fract(aB.z * 13.7)) * (1.0 + 0.45 * tall + 0.75 * big) * step(0.01, alive);
        vec3 own = rh < 0.25 ? ${glc(FC[1])} : rh < 0.5 ? ${glc(FC[2])} : rh < 0.75 ? ${glc(FC[0])} : ${glc(FC[3])};
        headCol = mix(ff.rgb, own, 0.16) * 1.12;`;
const KIND_LUMEN = `
        float lc = texture2D(tHillN, wxz * 0.021 + 0.13).g + 0.24 * (1.0 - smoothstep(5.0, 14.0, length(wxz - vec2(${glf(HT.x)}, ${glf(HT.z)}))));
        alive = fEdge * step(aB.z, smoothstep(0.53, 0.67, lc) * 0.8);                                             // かたまって咲く。丘の上の木のまわりに多い
        fh = mix(0.55, 1.0, fract(aB.w * 7.3)) * alive;
        fs = (0.12 + 0.07 * fract(aB.z * 13.7)) * step(0.01, alive);
        headCol = (rh < 0.45 ? ${glc(LC[0])} : rh < 0.8 ? ${glc(LC[1])} : ${glc(LC[2])}) * (1.0 + 0.16 * sin(uTime * 1.6 + aB.z * 60.0));`;
export function createFlowerRing(fieldTex) {
  const C = HILL.count, M = fieldTex.map, group = new THREE.Group(); group.name = 'flowers';
  const fU = { uTime: windU.uTime, uWind: windU.uWind, tHillN: fpU.tNoise, uField: { value: fieldTex.field },
    uHGrid: { value: new THREE.Vector4(M.hx0, M.hz0, M.hcell, 0) }, uHN: { value: new THREE.Vector2(M.nx, M.ny) } };
  const FU_GLSL = 'attribute vec4 aB; uniform sampler2D uField; uniform vec4 uHGrid; uniform vec2 uHN;' + (SUN_GAME ? `\n${CLEAR_GLSL}` : '');      // 太陽ゲーム：消す円（clearArea）も
  if (SUN_GAME) Object.assign(fU, CLEAR_U);
  const CLR = SUN_GAME ? CLEAR_FLOWER : '';
  const [s0, t0, s1, t1] = tileUV(TILE.solid), su = (s0 + s1) / 2, sv = (t0 + t1) / 2, [u0, v0, u1, v1] = tileUV(TILE.flower);
  const seeds = (n, seed) => { const b = new Float32Array(n * 4), r = rng(seed); for (let i = 0; i < n * 4; i++) b[i] = r(); return new THREE.InstancedBufferAttribute(b, 4); };
  // 茎と花の板
  function ring(n, R, seed, kind, lumen, name) {
    const geo = new THREE.InstancedBufferGeometry(), aB = seeds(n, seed);
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([su, sv, su, sv, su, sv, su, sv, u0, v0, u1, v0, u1, v1, u0, v1], 2));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); geo.setAttribute('aB', aB); geo.instanceCount = n;
    const m = new THREE.MeshBasicMaterial({ map: fpU.tAtlas.value, alphaTest: 0.45, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${FU_GLSL} attribute float aPart; varying vec3 vFlower;\n${WIND_GLSL}\n${kit.LIGHT_GLSL}\n${HILL_GLSL}`)
        .replace('#include <project_vertex>', `${flowerPlace(R, kind, undefined, CLR)}
        vec3 wp;
        if (aPart < 0.5) { wp = fRoot + vec3(0.0, fh * position.y, 0.0) + tipOff * position.y * position.y + fRight * position.x * 0.007 * step(0.01, alive);
               vFlower = ${glc('#5fa860')} * fpLight(wp, vec3(0.0, 1.0, 0.0), 1.0); }
        else { vec3 fN = normalize(mix(toCam, vec3(0.0, 1.0, 0.0), ${lumen ? '0.35' : '0.55'})), fUp = cross(fN, fRight);
               wp = tip + (fRight * position.x + fUp * position.y) * fs;
               vFlower = ${lumen ? 'headCol * 1.25' : 'headCol * (fpLight(wp, vec3(0.0, 1.0, 0.0), 1.0) + 0.12)'}; }
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFlower;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vFlower;');
    };
    m.customProgramCacheKey = () => `hillFlowerRing:${name}`;
    if (!lumen) addDapple(m, 0.6);                 // 光る花は、かげの中でも明るいまま
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = name; group.add(mesh);
    return aB;
  }
  if (!SUN_GAME) ring(C.flowers, C.flowerR, 123, KIND_MEADOW, false, 'meadow_flowers');
  else createBloomFlowers(group, fU, FU_GLSL, seeds);      // 太陽ゲーム：野の花は、つぼみに閉じられる花（下の createBloomFlowers）
  const R2 = Math.min(C.flowerR, 26), aB = ring(C.lumen, R2, 321, KIND_LUMEN, true, 'lumen_flowers');
  // 光る花のにじみ（加算の板。同じ乱数・同じ式なので、花とぴったり重なる）
  const hg = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
  hg.index = base.index; hg.setAttribute('position', base.attributes.position); hg.setAttribute('aB', aB); hg.instanceCount = C.lumen;
  const hm = new THREE.ShaderMaterial({ uniforms: fU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `${FU_GLSL} varying vec2 vP; varying vec4 vCol;
      ${WIND_GLSL}
      ${HILL_GLSL}
      void main(){
        ${flowerPlace(R2, KIND_LUMEN, undefined, CLR)}
        vP = position.xy * 2.0;
        vec4 mv = viewMatrix * vec4(tip, 1.0); mv.xy += position.xy * (0.55 + 1.6 * fs) * step(0.01, alive);
        vCol = vec4(headCol, 0.17 * alive * exp(mv.z * 0.012));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vP; varying vec4 vCol;
      void main(){ float a = smoothstep(1.0, 0.0, length(vP)); gl_FragColor = vec4(vCol.rgb, a * a * vCol.a); }` });
  const halo = new THREE.Mesh(hg, hm); halo.frustumCulled = false; halo.renderOrder = 5; halo.name = 'lumen_glow'; group.add(halo);
  return group;
}

// ---------------------------------------------------------------- 太陽ゲーム（?game=sun）だけ：つぼみに閉じられる野の花
// 開き具合 uBloom（0 ＝ つぼみ 〜 1 ＝ 満開）。window.__hill.setBloom(t, { spread, wave }) で決める（使い方は flower_hill.md）。場所・色・大きさ・数は、ふつうの野の花と同じ式
//   近くの花（カメラから BLOOM_NEAR m の中）：茎 ＋ 花の顔の板（ふつうの花と同じ絵）＋ 花びら 5 枚（それぞれ 2 つに折れる板）＋ 萼（がく）5 枚。
//     閉じるとき：顔の板が まん中の黄色まで小さくなり、その下の花びらが 1 枚ずつ根元から起き上がって、中心へ向かって重なり、先のとがった しずく形のつぼみになる。すき間から萼の緑が見える。色は少し沈む
//   遠くの花（その外）：ふつうと同じ板 1 枚。閉じるときは、小さく ほそくなってから、とがった つぼみの絵に入れかわる（遠くて小さいので、軽いまま）
//   'meadow_flowers'（遠く）の形の計算は、ふつうの野の花と同じ文（sun_game.js が足している「とじる」計算も、そのまま効く）。近くは 'meadow_flowers_near'
const BLOOM_NEAR = LITE ? 6 : 7.5;
export const BLOOM_U = { uBloom: { value: new THREE.Vector4(1, 0.4, 0, 0) }, uBloomW: { value: new THREE.Vector4(0, 0, 1, 0) } };   // uBloom ＝ (開き具合, ずらし幅, -, -)、uBloomW ＝ (波の中心 x, z, 半径, 波を使う 0〜1)
const BLOOM_GLSL = `uniform vec4 uBloom, uBloomW;
  float bloomOf(vec3 root, float seed){                                // この花の開き具合（花ごとに少しずつ、ずらす）
    float bR = fract(seed * 5.3), bWd = clamp(length(root.xz - uBloomW.xy) / max(uBloomW.z, 0.001), 0.0, 1.0);
    float bS = mix(bR, bWd * 0.8 + bR * 0.2, uBloomW.w) * uBloom.y;
    return smoothstep(bS, bS + 1.0 - uBloom.y + 0.001, uBloom.x); }`;
function createBloomFlowers(group, fU, FU_GLSL, seeds) {
  const C = HILL.count, Rn = BLOOM_NEAR, Rt = Rn + 1.4, FAR_R = C.flowerR;
  Object.assign(fU, BLOOM_U);
  const [s0, t0, s1, t1] = tileUV(TILE.solid), su = (s0 + s1) / 2, sv = (t0 + t1) / 2, [u0, v0, u1, v1] = tileUV(TILE.flower), [p0, q0, p1, q1] = tileUV(TILE.petal);
  const NEAR_EDGE = `(1.0 - smoothstep(${glf(Rn - 1.0)}, ${glf(Rn + 0.3)}, length(rel)))`;                         // 近くの花は、ここまで
  const FAR_CUT = `\n        { float nc = smoothstep(${glf(Rn - 1.0)}, ${glf(Rn + 0.3)}, length(rel)); fh *= nc; fs *= step(0.01, nc); alive *= nc; }`;   // 遠くの花は、ここから（同じ多さで、入れかわる）
  const mat = (name, body, extraPars = '') => {
    const m = new THREE.MeshBasicMaterial({ map: fpU.tAtlas.value, alphaTest: 0.45, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${FU_GLSL} ${extraPars} varying vec3 vFlower;\n${WIND_GLSL}\n${kit.LIGHT_GLSL}\n${HILL_GLSL}\n${BLOOM_GLSL}`)
        .replace('#include <project_vertex>', `${body}
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFlower;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vFlower;');
    };
    m.customProgramCacheKey = () => `hillBloom:${name}`; addDapple(m, 0.6); return m;
  };
  const STEM = `wp = fRoot + vec3(0.0, fh * position.y, 0.0) + tipOff * position.y * position.y + fRight * position.x * 0.007 * step(0.01, alive);
               vFlower = ${glc('#5fa860')} * fpLight(wp, vec3(0.0, 1.0, 0.0), 1.0);`;
  // ---- 遠くの花：板 1 枚（茎 ＋ 顔）。開き具合が 0.5 より下は、とがった つぼみの絵（花びらの絵を、とがったほうを上にして）
  { const n = C.flowers, geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([su, sv, su, sv, su, sv, su, sv, u0, v0, u1, v0, u1, v1, u0, v1], 2));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 1, 1, 1], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); geo.setAttribute('aB', seeds(n, 123)); geo.instanceCount = n;
    const m = mat('far', `${flowerPlace(FAR_R, KIND_MEADOW, undefined, FAR_CUT + CLEAR_FLOWER)}
        float eB = bloomOf(fRoot, aB.w);
        vec3 wp;
        if (aPart < 0.5) { ${STEM} }
        else { vec3 fN = normalize(mix(toCam, vec3(0.0, 1.0, 0.0), 0.55)), fUp = cross(fN, fRight);
          if (eB >= 0.5) { float sc = mix(0.55, 1.0, smoothstep(0.5, 1.0, eB));
            wp = tip + (fRight * position.x * mix(0.7, 1.0, smoothstep(0.5, 1.0, eB)) + fUp * position.y) * fs * sc;
            vFlower = headCol * (fpLight(wp, vec3(0.0, 1.0, 0.0), 1.0) + 0.12) * mix(0.82, 1.0, eB); }
          else { wp = tip + fRight * position.x * fs * 0.4 + vec3(0.0, 1.0, 0.0) * (position.y + 1.0) * fs * 0.5;            // つぼみ：上を向いて立つ、とがった形
            vMapUv = vec2(mix(${glf(p0)}, ${glf(p1)}, position.x * 0.5 + 0.5), mix(${glf(q1)}, ${glf(q0)}, position.y * 0.5 + 0.5));
            vFlower = mix(headCol * 0.84, ${glc('#5f9a52')}, 0.18) *(fpLight(wp, normalize(toCam + vec3(0.0, 0.4, 0.0)), 1.0) + 0.1); } }`, 'attribute float aPart;');
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = 'meadow_flowers'; group.add(mesh); }
  // ---- 近くの花：茎・顔・花びら 5 枚（3 段）・萼 5 枚（2 段）。aQ ＝ (部分 0 茎・1 顔・2 花びら・3 萼, 何枚め, 根元 0 〜 先 1, 左 -1・右 1)
  { const pos = [], uv = [], q = [], idx = [], vert = (x, y, u, v, part, k, s, side) => { pos.push(x, y, 0); uv.push(u, v); q.push(part, k, s, side); return pos.length / 3 - 1; };
    { const a = vert(-1, 0, su, sv, 0, 0, 0, -1), b = vert(1, 0, su, sv, 0, 0, 0, 1), c = vert(1, 1, su, sv, 0, 0, 1, 1), d = vert(-1, 1, su, sv, 0, 0, 1, -1); idx.push(a, b, c, a, c, d); }
    { const a = vert(-1, -1, u0, v0, 1, 0, 0, 0), b = vert(1, -1, u1, v0, 1, 0, 0, 0), c = vert(1, 1, u1, v1, 1, 0, 0, 0), d = vert(-1, 1, u0, v1, 1, 0, 0, 0); idx.push(a, b, c, a, c, d); }
    for (let k = 0; k < 5; k++) { const rows = [0, 0.5, 1].map((s) => [vert(0, 0, p0, lerp(q1, q0, s), 2, k, s, -1), vert(0, 0, p1, lerp(q1, q0, s), 2, k, s, 1)]);      // 花びら：絵のとがったほうが先（閉じると、先が 1 点に集まって とがる）。満開の間は、顔の板の下にかくれている
      for (let r = 0; r < 2; r++) { const [a, b] = rows[r], [c, d] = rows[r + 1]; idx.push(a, b, d, a, d, c); } }
    for (let k = 0; k < 5; k++) { const rows = [0, 1].map((s) => [vert(0, 0, p0, lerp(q1, q0, s), 3, k, s, -1), vert(0, 0, p1, lerp(q1, q0, s), 3, k, s, 1)]);      // 萼：とがったほうが先
      const [a, b] = rows[0], [c, d] = rows[1]; idx.push(a, b, d, a, d, c); }
    const n = Math.round(C.flowers * Math.pow(Rt / FAR_R, 2)), geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aQ', new THREE.Float32BufferAttribute(q, 4)); geo.setIndex(idx); geo.setAttribute('aB', seeds(n, 457)); geo.instanceCount = n;
    const m = mat('near', `${flowerPlace(Rt, KIND_MEADOW, NEAR_EDGE, CLEAR_FLOWER)}
        float eB = bloomOf(fRoot, aB.w), part = aQ.x, pk = aQ.y, ps = aQ.z, side = aQ.w;
        vec3 fN0 = normalize(mix(toCam, vec3(0.0, 1.0, 0.0), 0.55));
        vec3 A = normalize(mix(normalize(vec3(0.0, 1.0, 0.0) + tipOff * 0.8), fN0, smoothstep(0.15, 0.95, eB)));      // 花の軸：開くとカメラのほう、閉じると上（茎の先）
        vec3 B1 = normalize(fRight - A * dot(fRight, A)), B2 = cross(A, B1);
        vec3 wp, nrm = A;
        if (part < 0.5) { ${STEM} }
        else if (part < 1.5) {                                                             // 顔（ふつうの花の絵）：閉じはじめると、まん中の黄色まで小さくなる
          float fc = eB > 0.9 ? mix(0.3, 1.0, smoothstep(0.9, 1.0, eB)) : 0.3 * smoothstep(0.3, 0.62, eB);
          wp = tip + (fRight * position.x + cross(fN0, fRight) * position.y) * fs * fc + fN0 * fs * 0.035;
          vFlower = headCol * (fpLight(wp, fN0, 1.0) + 0.12); }
        else {
          bool petal = part < 2.5;
          float ek = petal ? smoothstep(pk * 0.12, pk * 0.12 + 0.52, eB) : eB;             // 花びらは 1 枚ずつ（5 枚めから閉じる）
          float phi = 1.5708 - (pk + (petal ? 0.0 : 0.5)) * 1.2566 + (petal ? ps * ps * 0.45 * (1.0 - ek) : 0.0);   // 閉じると、先がねじれて重なる（とがる）
          vec3 d = cos(phi) * B1 + sin(phi) * B2, tg = -sin(phi) * B1 + cos(phi) * B2;
          vec2 q; float w, be;
          if (petal) {                                                                     // 2 つに折れる花びら：根元 → 中 → 先。角度は、ひらく（ねる）〜 とじる（立って、先が内へ）
            float b1 = mix(0.91, 0.11, ek), b2 = mix(1.91, 0.15, ek), nest = 1.0 + 0.07 * pk * (1.0 - ek);      // とじたとき：根元から ふくらんで（下 1/3 がいちばん太い）、上へ細くとがる しずく形（高さ 約 1.2、太さ 約 0.6 × 花の大きさ）
            vec2 a0 = vec2(mix(0.02, -0.03, ek), 0.0), a1 = a0 + vec2(cos(b1), sin(b1)) * mix(0.46, 0.53, ek), a2 = a1 + vec2(cos(b2), sin(b2)) * mix(0.89, 0.5, ek);
            q = ps < 0.25 ? a0 : ps < 0.75 ? a1 : a2; q.x *= ps > 0.25 ? nest : 1.0; q.y += 0.03 * pk * (1.0 - ek) * ps - 0.04 * ek;
            w = mix(ps < 0.25 ? 0.5 : ps < 0.75 ? 0.62 : 0.3, 0.6, ek) * (1.0 - smoothstep(0.95, 1.0, eB));      // 満開では、顔の絵の下にかくれる
            be = ps < 0.25 ? b1 : ps < 0.75 ? 0.5 * (b1 + b2) : b2;
          } else {                                                                         // 萼：ひらくと花の下へ、とじると つぼみの根元をつつむ
            be = mix(0.77, -0.38, eB); q = vec2(0.05, -0.02) + vec2(cos(be), sin(be)) * 0.48 * ps; w = 0.3;
          }
          wp = tip + (d * q.x + A * q.y) * fs + tg * side * w * fs;
          nrm = normalize(A * cos(be) - d * sin(be)); if (dot(nrm, toCam) < 0.0) nrm = -nrm;
          vec3 lt = fpLight(wp, nrm, 1.0) + 0.12;
          vFlower = petal ? mix(headCol * mix(0.8, 1.0, ps) * mix(0.72, 1.0, eB) * (0.86 + 0.14 * fract(pk * 0.618 + 0.3)), ${glc('#6f9f58')}, 0.22 * (1.0 - ek) * (1.0 - ps)) * lt      // 花びらごとに少し明るさをかえる（重なりが見える）
                          : ${glc('#4f8f48')} * lt;
        }`, 'attribute vec4 aQ;');
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = 'meadow_flowers_near'; group.add(mesh); }
}

// ================================================================ 森の出口と、丘の上の木
// ---------------------------------------------------------------- まだらな光：森の出口の小道だけ（丘は日なた）
export function createDapple(seed = 27) {
  const pools = [];
  kit.createDappleTexture(seed, ({ r, blob, cluster }) => {
    for (let s = 1.2, i = 0; s < -EXIT_Z - 1.0; s += 1.15 + r() * 0.8, i++) {               // 光の筋が落ちる日だまり
      const z = -s, x = (i % 3 === 0 ? (r() - 0.5) * 1.2 : (i % 2 ? -1 : 1) * (1.5 + r() * 2.2)), rad = 0.55 + r() * 0.55;
      pools.push({ x, z, r: rad }); blob(x, z, rad, 1); cluster(x, z, 7, rad * 1.8, 0.28, 0.85);
    }
    for (let i = 0; i < 70; i++) { const z = lerp(5, EXIT_Z + 0.8, r()), x = (r() - 0.5) * 20; cluster(x, z, 4 + Math.floor(r() * 8), 0.5 + r() * 0.9, 0.2, 0.8); }
    if (GATES.length) {                                                                    // 太陽ゲーム：森の奥の小道のわきにも日だまり、森の床にまだら
      for (let z = 8; z < FOREST_END + 9; z += 3.4 + r() * 1.8) { const x = (r() < 0.5 ? -1 : 1) * (1.7 + r() * 2.6), rad = 0.55 + r() * 0.5; pools.push({ x, z, r: rad }); blob(x, z, rad, 1); cluster(x, z, 7, rad * 1.8, 0.28, 0.85); }
      for (let i = 0; i < 200; i++) { const z = lerp(5, 46, r()), x = (r() - 0.5) * 50; cluster(x, z, 4 + Math.floor(r() * 8), 0.5 + r() * 0.9, 0.2, 0.8); }
    }
  });
  return { pools };
}
// ---------------------------------------------------------------- 巨木：出口の門の 2 本・スタートのまわり・丘から見える森のふち ＋ 丘の上の 1 本（幹と根。花は createBlossomTree）
export function createHillTrees(seed = 15) {
  const r = rng(seed), mat = kit.createBarkMaterial(), group = new THREE.Group(); group.name = 'giant_trees';
  const geos = [kit.buildGiantTree(11, 1), kit.buildGiantTree(23, 1), kit.buildGiantTree(37, 1), kit.buildGiantTree(51, 0)], list = [];
  const add = (x, z, s, layer, v = layer === 2 ? 3 : Math.floor(r() * 3)) => list.push({ x, z, s, layer, v, rot: r() * 6.283, y: groundH(x, z) - 0.25, R: geos[v].userData.R0 * s });
  add(-3.5, EXIT_Z + 2.4, 1.25, 0); add(3.7, EXIT_Z + 1.5, 1.15, 0);                      // 出口の門
  const caps = [22, 30, 86], gaps = [3.1, 4.3, 6.0], made = [2, 0, 0];
  if (GATES.length) {                                                                      // 太陽ゲーム：森を奥へ広げる。小道・枝道・入り口のまわりをあけて置く（道に近い木ほど細かい形）
    const capsS = [38, 52, 112];
    for (let i = 0; i < 16000; i++) {
      const edge = r() < 0.4, x = edge ? lerp(-120, 120, r()) : lerp(-48, 48, r()), z = edge ? EXIT_Z + 1.2 + 40 * Math.pow(r(), 1.5) : lerp(EXIT_Z + 1.2, 62, r()), sd = forestNear(x, z).sd, layer = sd < 3.3 ? 0 : sd < 9.5 ? 1 : 2;
      if (made[layer] >= capsS[layer]) continue;
      const s = layer === 0 ? 0.85 + r() * 0.45 : layer === 1 ? 0.9 + r() * 0.5 : 1.0 + r() * 0.6, rad = 1.5 * s;
      if (sd < rad + 0.25) continue;
      if (GATES.some((g) => Math.hypot(x - (g.x + g.d[0] * 0.4), z - (g.z + g.d[1] * 0.4)) < rad + 4.2)) continue;       // 入り口の門のまわり
      if (list.some((t) => Math.hypot(t.x - x, t.z - z) < gaps[Math.max(layer, t.layer)])) continue;
      add(x, z, s, layer); made[layer]++;
    }
    for (let i = 0, n = 0; i < 800 && n < 12; i++) {                                       // 丘のすそ：森からはなれるほど、木が小さく、まばらになる（丘と森の、自然なつながり）
      const z = EXIT_Z - 1.5 - 15 * Math.pow(r(), 1.6), x = trailX(z) + (r() < 0.5 ? -1 : 1) * (4.5 + r() * 24), s = lerp(0.78, 0.5, sstep(-z, 10, 25)) * (0.85 + 0.3 * r());
      if (list.some((t) => Math.hypot(t.x - x, t.z - z) < 5.5)) continue;
      add(x, z, s, 1); OBST_SUN.push({ x, z, r: list[list.length - 1].R * 1.25 + 0.3 }); n++;
    }
  }
  for (let i = 0; i < (GATES.length ? 0 : 9000); i++) {
    const x = lerp(-120, 120, r()), z = EXIT_Z + 1.2 + 40 * Math.pow(r(), 1.5), d0 = Math.hypot(x, z), layer = d0 < 9 ? 0 : d0 < 17 ? 1 : 2;
    if (made[layer] >= caps[layer]) continue;
    const s = layer === 0 ? 0.85 + r() * 0.45 : layer === 1 ? 0.9 + r() * 0.5 : 1.0 + r() * 0.6, rad = 1.5 * s;
    if (z < 2.6 && Math.abs(x) - 1.3 < rad + 0.25) continue;                               // 小道はあけておく
    if (list.some((t) => Math.hypot(t.x - x, t.z - z) < gaps[Math.max(layer, t.layer)])) continue;
    add(x, z, s, layer); made[layer]++;
  }
  add(HT.x, HT.z, HT.s, 0, 1);                                                             // 丘の上の木
  for (const t of list) if (t.z > 2.4 && t.z < BACK_Z + 5 && Math.abs(t.x) < 1.5 * t.s + 1.7) t.x = (t.x < 0 ? -1 : 1) * (1.5 * t.s + 1.9);   // スタートの後ろ（広場へ戻る道）をふさぐ木は、わきへよせる
  const anchors = kit.createTreeMeshes(list, geos, mat, group);
  const low = (x, z) => (GATES.length ? 1 - sstep(forestNear(x, z).sd, -0.3, 0.5) : z > EXIT_Z - 1 && z < BACK_Z + 5 ? 1 - sstep(Math.abs(x), 1.0, 1.8) : 0);
  // 広場へ戻る道の目印：小道をまたぐ根のアーチ（その奥が、ほんのり桃色に明るい）
  const tb = new TubeGeo(), bark = new THREE.Color(HILL.trunk.bark), moss = new THREE.Color(HILL.trunk.moss), ap = [];
  for (let j = 0; j <= 12; j++) { const u = j / 12, a = Math.PI * u; ap.push(V3(-Math.cos(a) * 2.7 + 0.15 * Math.sin(u * 9), -0.3 + Math.sin(a) * 3.1 + 0.1 * Math.sin(u * 13), BACK_Z - 1.2 + 0.25 * Math.sin(u * 5))); }
  tb.tube(ap, 8, (i) => 0.36 - 0.1 * Math.sin(Math.PI * i / 12) + 0.04 * Math.sin(i * 2.1), (i, th) => bark.clone().lerp(moss, clamp(0.45 + 0.4 * Math.cos(th), 0, 1)));
  const arch = new THREE.Mesh(tb.toGeometry(), mat); arch.name = 'return_arch'; group.add(arch);
  const rootMesh = new THREE.Mesh(kit.buildRoots(list.filter((t) => t.layer < 2), r, { groundH, low }), mat); rootMesh.name = 'giant_roots'; group.add(rootMesh);
  return { group, list, anchors };
}
// ---------------------------------------------------------------- 枝葉：森の中は頭の上をおおい、森のはしでぷつりと終わる（そこで急に空が開ける）。丘の上の木は丸くしげる
export function createHillCanopy(anchors, shafts, seed = 18) {
  const r = rng(seed);
  // かたまりごとの葉の枚数の割合：小道の真上・スタートのまわりを厚く（木かげ）、森のふちは大きな板で少なめに、丘の上の木は丸くしげらせる
  const share = GATES.length ? { ceil: 0.3, near: 0.24, mid: 0.14, far: 0.2, hill: 0.08, bush: 0.04 } : { ceil: 0.22, near: 0.22, mid: 0.14, far: 0.26, hill: 0.11, bush: 0.05 };      // 太陽ゲーム：森が広いぶん、小道の上と近くの木を厚く（葉の数も 1.4 倍）
  const all = anchors.map((a) => (a.p.z < -45
    ? { ...a, g: 'hill', hill: true, bright: true, r: a.r * 0.9, w: a.r * a.r, size: [1.3, 2.1], flat: 0.75 }
    : { ...a, g: ['near', 'mid', 'far'][a.layer], out: GATES.length > 0 && a.p.z < EXIT_Z - 2.5, upright: a.layer === 2, w: a.r * a.r, size: a.layer === 2 ? [3.4, 5.0] : [1.6, 2.7], flat: 0.55 }));
  const hy = groundH(HT.x, HT.z);                                                          // 丘の上の木：てっぺんのまわりを丸くしげらせる
  for (let k = 0; k < 7; k++) { const an = k / 7 * 6.283 + r(), d = k === 0 ? 0 : 2.2 + r() * 1.2; all.push({ g: 'hill', hill: true, bright: true, p: V3(HT.x + Math.cos(an) * d * 1.5, hy + 10.2 + r() * 2.6, HT.z + Math.sin(an) * d * 1.5), r: 2.8, layer: 0, w: 5, size: [1.3, 2.1], flat: 0.7 }); }
  for (let z = 3; z > EXIT_Z + 1.2; z -= 0.75) all.push({ g: 'ceil', p: V3((r() - 0.5) * 9, 4.8 + r() * 2.8, z + (r() - 0.5)), r: 2.3 + r() * 0.8, layer: 0, w: 1, size: [1.3, 2.2], flat: 0.4 });   // 小道の真上
  if (GATES.length) {                                                                      // 太陽ゲーム：森の奥の小道と、枝道の上
    for (let z = 4; z < FOREST_END + 14; z += 0.8) all.push({ g: 'ceil', p: V3((r() - 0.5) * 12, 4.8 + r() * 2.8, z + (r() - 0.5)), r: 2.3 + r() * 0.8, layer: 0, w: 1, size: [1.3, 2.2], flat: 0.4 });
    for (const g of GATES) for (let k = 0; k < 12; k++) { const i = k < 6 ? 0 : 1, t = (k % 6 + 0.5) / 6, a = g.pts[i], b = g.pts[i + 1];
      all.push({ g: 'ceil', p: V3(lerp(a[0], b[0], t) + (r() - 0.5) * 6, 5.0 + r() * 2.6, lerp(a[1], b[1], t) + (r() - 0.5) * 6), r: 2.3 + r() * 0.8, layer: 0, w: 1, size: [1.3, 2.2], flat: 0.4 }); }
  }
  for (let i = 0; i < 70; i++) {                                                           // 道ばたと、森のふちの低い茂み
    const edge = i % 2 === 0, x = edge ? (r() - 0.5) * 70 : (r() < 0.5 ? -1 : 1) * (2 + r() * 5), z = edge ? EXIT_Z + (r() - 0.3) * 3 : lerp(4, EXIT_Z, r());
    if (Math.abs(x) < 2.1) continue;
    all.push({ g: 'bush', p: V3(x, groundH(x, z) + 0.45 + r() * 0.5, z), r: 0.8 + r() * 0.7, layer: 0, w: 1, size: [0.6, 1.05], flat: 0.5, bush: true });
  }
  const sums = {}; for (const a of all) sums[a.g] = (sums[a.g] || 0) + a.w;
  for (const a of all) a.w *= share[a.g] / sums[a.g];
  return kit.createCanopy(all, { r, count: Math.round(HILL.count.canopy * (GATES.length ? 1.4 : 1)), reject: (p, a) => {
    if (a.hill) return p.y < groundH(p.x, p.z) + 5.2;
    if (a.out) return p.y < groundH(p.x, p.z) + 3.0;                                       // 太陽ゲーム：丘のすその木と、森のふちから丘へのびた枝の葉
    if (a.bush) return Math.abs(p.x) < 1.7;
    if (p.y < 3.6 || p.z < EXIT_Z - 0.8) return true;                                      // 森のはしから先には、葉を出さない
    return shafts.some((s) => { const t = p.y / SUN.y; return Math.hypot(p.x - (s.a.x + SUN.x * t), p.z - (s.a.z + SUN.z * t)) < s.r + 0.55; });   // 光の筋の通り道
  } });
}
// ---------------------------------------------------------------- 森の出口の草花（シダ・草むら・光るベルの花・光るキノコ）。森の小道のつづきに見えるように
export function createExitPlants(trees, glow, seed = 33) {
  const r = rng(seed), C = HILL.count, mat = kit.createPlantMaterial(), group = new THREE.Group(); group.name = 'exit_plants';
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const inTrunk = (x, z) => trees.some((t) => t.layer < 2 && Math.hypot(t.x - x, t.z - z) < t.R * 1.5 + 0.1);
  function place(geo, count, spread, scale, tints, name) {
    const mesh = new THREE.InstancedMesh(geo, mat, count); let made = 0;
    for (let tries = 0; made < count && tries < count * 60; tries++) {
      const z = lerp(5, EXIT_Z - 1.5, r()), x = (r() < 0.5 ? -1 : 1) * (1.45 + spread * Math.pow(r(), 1.6));
      if (inTrunk(x, z)) continue;
      const s = lerp(scale[0], scale[1], r());
      dummy.position.set(x, groundH(x, z) - 0.02, z); dummy.rotation.set((r() - 0.5) * 0.16, r() * 6.283, (r() - 0.5) * 0.16); dummy.scale.set(s, s * (0.85 + 0.3 * r()), s); dummy.updateMatrix();
      mesh.setMatrixAt(made, dummy.matrix); mesh.setColorAt(made, col.set(pickOf(r, tints)).multiplyScalar(0.85 + 0.3 * r())); made++;
    }
    mesh.count = made; mesh.frustumCulled = false; mesh.name = name; group.add(mesh);
    return mesh;
  }
  place(buildFern(3), C.fern, 9, [0.75, 1.35], ['#ffffff', '#e4f5d8', '#d2f0e4'], 'ferns');
  place(buildTuft(), C.tuft, 11, [0.7, 1.3], ['#ffffff', '#e6f7c8', '#cfeedd'], 'tufts');
  const bells = place(buildBell(5), C.bell, 3, [0.8, 1.2], ['#bff4ff', '#d9e6ff', '#ffe0f0', '#ffffff'], 'bell_flowers');
  const shrooms = place(buildMushrooms(13), C.shroom, 2.5, [0.5, 1.1], ['#3fe6d6', '#56ccff', '#a884ff', '#ff7cc6', '#66ffb0'], 'glow_mushrooms');
  const m4 = new THREE.Matrix4(), ps = new THREE.Vector3();
  for (const [mesh, dy, size] of [[bells, 0.75, 0.95], [shrooms, 0.2, 1.1]]) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m4); ps.setFromMatrixPosition(m4); mesh.getColorAt(i, col);
    glow.push({ p: V3(ps.x, ps.y + dy, ps.z), size, color: `#${col.getHexString()}`, opacity: 0.24 });
  }
  return group;
}

// ================================================================ 丘の上の主役と、遠くの景色
// ---------------------------------------------------------------- 丘の上の主役：花が垂れ下がる大きな木（幹・根・緑の葉は createHillTrees・createHillCanopy）
// ここで足すもの：花の枝葉（うす紫・桃・白）/ 垂れ下がる花房（風にゆれ、近づくとよける）/ 枝の下のやわらかい光 / 散る花びら
function buildStrand(seed) {                                         // 花房 1 本：細いつる ＋ 小花のかたまり 9 つ（上はうす紫、先は白）。上（つけ根）は動かず、先ほどゆれる
  const r = rng(seed), b = new PlantGeo(), len = 2.6, stem = new THREE.Color('#9fbf8f');
  const c0 = new THREE.Color('#b796ff'), c1 = new THREE.Color('#f2b4e4'), c2 = new THREE.Color('#ffffff');
  b.ribbon([V3(0, 0, 0), V3(0, -len, 0)], V3(1, 0, 0), () => 0.014, TILE.solid, () => stem, (u) => u);
  for (let i = 0; i < 9; i++) {
    const u = 0.1 + 0.1 * i, s = 0.37 * (1 - 0.06 * i) * (0.85 + 0.3 * r()), a = r() * 3.14, col = c0.clone().lerp(c1, sstep(u, 0.1, 0.6)).lerp(c2, sstep(u, 0.6, 1.0));
    const c = V3((r() - 0.5) * 0.1, -len * u, (r() - 0.5) * 0.1);
    b.quad(c, V3(Math.cos(a), 0, Math.sin(a)), V3(0, 1, 0), s, s, TILE.flower, col, u, u, 0.32);
    b.quad(c, V3(-Math.sin(a), 0, Math.cos(a)), V3(0, 1, 0), s, s, TILE.flower, col, u, u, 0.32);
  }
  return b.toGeometry();
}
export function createBlossomTree(anchors, glow, seed = 91) {
  const r = rng(seed), C = HILL.count, hy = groundH(HT.x, HT.z), R = HT.crownR, group = new THREE.Group(); group.name = 'blossom_tree';
  // 花の枝葉：幹の枝先 ＋ かさのように広がる輪
  const all = anchors.filter((a) => a.p.z < -30).map((a) => ({ p: a.p.clone().add(V3(0, 0.7, 0)), r: a.r, w: a.r * a.r, size: [1.2, 2.0], flat: 0.7, bright: true }));
  for (let k = 0; k < 14; k++) {
    const an = k / 14 * 6.283 + r(), d = k < 3 ? r() * 2 : 3 + r() * (R - 3.6);
    all.push({ p: V3(HT.x + Math.cos(an) * d, hy + 12.4 + r() * 2.6 - d * 0.3, HT.z + Math.sin(an) * d), r: 2.8, w: 9, size: [1.2, 2.0], flat: 0.62, bright: true });
  }
  group.add(kit.createCanopy(all, { r, count: C.blossom, palette: HILL.blossom, name: 'blossom_crown', reject: (p) => p.y < hy + 6.0 }));
  // 垂れ下がる花房
  const strands = new THREE.InstancedMesh(buildStrand(7), kit.createPlantMaterial(), C.strands), dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < C.strands; i++) {
    const an = r() * 6.283, d = R * (0.22 + 0.78 * Math.sqrt(r())), s = 0.8 + r() * 0.7 + 0.4 * (d / R);
    dummy.position.set(HT.x + Math.cos(an) * d, hy + 11.2 + r() * 1.8 - d * 0.32, HT.z + Math.sin(an) * d); dummy.rotation.set(0, r() * 6.283, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    strands.setMatrixAt(i, dummy.matrix); strands.setColorAt(i, col.set(pickOf(r, ['#ffffff', '#f1e4ff', '#ffe6f3'])).multiplyScalar(0.9 + 0.2 * r()));
  }
  strands.frustumCulled = false; strands.name = 'blossom_strands'; group.add(strands);
  // 枝の下のやわらかい光（にじむ光の板へ足す）
  for (let k = 0; k < 9; k++) { const an = r() * 6.283, d = R * 0.85 * Math.sqrt(r()); glow.push({ p: V3(HT.x + Math.cos(an) * d, hy + 6.5 + r() * 3, HT.z + Math.sin(an) * d), size: 6, color: '#dcbfff', opacity: 0.1 }); }
  glow.push({ p: V3(HT.x, hy + 0.1, HT.z), size: 18, color: '#ecd4ff', opacity: 0.2, flat: true }, { p: V3(HT.x, hy + 9, HT.z), size: 22, color: '#f0d8ff', opacity: 0.12 });
  // 散る花びら：枝の下から、風下へ流れながら落ちる
  group.add(kit.createPetals({ count: C.treePetals, bright: 1.5, pos: `
        float per = 7.0 + aS.x * 5.0, tt = fract(uFpTime / per + aS.y), pan = aS.z * 6.2831, prd = ${glf(R)} * sqrt(aS.w);
        vec3 p = vec3(${glf(HT.x)} + cos(pan) * prd + ${glf(WD[0])} * tt * 3.5 + sin(tt * 19.0 + aS.w * 6.28) * 0.35,
                      ${glf(hy)} + mix(8.5 - prd * 0.3, 0.15, tt) + sin(tt * 27.0 + aS.x * 6.28) * 0.12, ${glf(HT.z)} + sin(pan) * prd + ${glf(WD[1])} * tt * 3.5);` }));
  return group;
}
// ---------------------------------------------------------------- 地平線の光る大樹（遠いので、かんたんな形：幹と枝の管 ＋ 花の板のかたまり ＋ にじむ光）。かすみをかけず、はっきり見せる
export function createFarTree() {
  const H = FT.h, y0 = FT_Y, C = FT_C, group = new THREE.Group(), r = rng(71); group.name = 'far_bigtree';
  // 幹と太い枝（遠くの色＝青むらさきがかった茶。根元は花の光で明るい）
  const tb = new TubeGeo(), bark = new THREE.Color('#7a6690'), lit = new THREE.Color('#c9a6c2');
  tb.tube([0, 0.06, 0.16, 0.3, 0.44, 0.58].map((t) => V3(FT.x + Math.sin(t * 5) * H * 0.03, y0 + t * H, FT.z)), 9, (i, th) => H * 0.058 * (1 - 0.1 * i) * (i === 0 ? 2.1 : i === 1 ? 1.35 : 1) * (1 + 0.1 * Math.sin(th * 4)), (i) => bark.clone().lerp(lit, i < 2 ? 0.5 : 0.12));
  const tips = [];
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * 6.283 + r() * 0.5, len = H * (0.26 + 0.14 * r()), y1 = 0.4 + 0.12 * r(), pts = [0, 0.35, 0.7, 1].map((u) => V3(FT.x + Math.cos(a) * len * u, y0 + H * (y1 + 0.22 * u + 0.1 * u * u), FT.z + Math.sin(a) * len * u));
    tb.tube(pts, 5, (i) => H * (0.027 - 0.006 * i), () => bark); tips.push(pts[3], pts[2]);
  }
  group.add(new THREE.Mesh(tb.toGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // 花：枝先と、てっぺんのまわりの丸いかたまり（雲のような形）に、小さめの花の板をたくさん。日の当たる側は白く、下と内側は濃い桃色
  const clumps = tips.map((p) => ({ c: p.clone().add(V3(0, H * 0.05, 0)), R: H * (0.15 + 0.05 * r()) }));
  for (let k = 0; k < 16; k++) { const a = r() * 6.283, d = H * 0.34 * Math.sqrt(r()); clumps.push({ c: V3(C.x + Math.cos(a) * d, C.y + H * (0.02 + 0.2 * r()) - d * 0.25, C.z + Math.sin(a) * d), R: H * (0.17 + 0.07 * r()) }); }
  const n = HILL.count.farCards, [u0, v0, u1, v1] = tileUV(TILE.leaves), geo = new THREE.CircleGeometry(0.5, 8), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
  const crown = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: fpU.tAtlas.value, alphaTest: 0.45, side: THREE.DoubleSide, fog: false }), n);
  const dummy = new THREE.Object3D(), col = new THREE.Color(), deep = new THREE.Color('#e58bb4'), pal = ['#ffc6dc', '#ffdcea', '#ffffff', '#ffb4d0'].map((h) => new THREE.Color(h));
  for (let i = 0; i < n; i++) {
    const k = clumps[i % clumps.length]; let d; do d = V3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); while (d.lengthSq() > 1 || d.lengthSq() < 0.05);
    const rr = 0.45 + 0.55 * Math.sqrt(r()), dn = d.clone().normalize(), light = clamp(0.5 + 0.5 * dn.dot(SUN), 0, 1) * (0.55 + 0.45 * rr);
    dummy.position.set(k.c.x + d.x * k.R * rr, k.c.y + d.y * k.R * rr * 0.75, k.c.z + d.z * k.R * rr); dummy.rotation.set(r() * 6.283, r() * 6.283, r() * 6.283); dummy.scale.setScalar(H * (0.085 + 0.05 * r()) * (LITE ? 1.25 : 1)); dummy.updateMatrix();
    crown.setMatrixAt(i, dummy.matrix); crown.setColorAt(i, col.copy(deep).lerp(pickOf(r, pal), 0.25 + 0.75 * light).multiplyScalar(0.92 + 0.16 * r()));
  }
  crown.frustumCulled = false; crown.name = 'far_bigtree_crown'; group.add(crown);
  // 光：まわりに淡い桃色のにじみ（大きい・中くらい・しん）、根元の金色の光、足もとの丘をてらす光
  group.add(createGlowCards([{ p: C, size: H * 4.2, color: '#ffbcd8', opacity: 0.2 }, { p: C, size: H * 2.4, color: '#ffd0e4', opacity: 0.27 }, { p: C.clone().add(V3(0, H * 0.08, 0)), size: H * 1.2, color: '#fff0f6', opacity: 0.22 },
    { p: V3(FT.x, y0 + H * 0.14, FT.z), size: H * 0.9, color: '#ffeec2', opacity: 0.3 }, { p: V3(FT.x, y0 + 4, FT.z), size: H * 3.4, color: '#ffcbe0', opacity: 0.26, flat: true }], 'far_bigtree_glow'));
  return group;
}
// ---------------------------------------------------------------- 大樹から流れてくる花びらの川：大樹の花のかたまりから、丘の上の空を通って風下へ。遠くは小さな光の点、近くは花びらの大きさ
export function createPetalStream() {
  const n = HILL.count.stream, r = rng(97), s = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) s[i] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 4));
  const P2 = V3(TOP.x + WD[0] * 46, TOP.h + 10, TOP.z + WD[1] * 46), P1 = FT_C.clone().lerp(P2, 0.5).add(V3(0, 62, 0));
  const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime, uPR: fpU.uPR }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec4 aS; uniform float uFpTime, uPR; varying vec4 vCol;
      void main(){
        float u = fract(aS.x + uFpTime * (0.011 + 0.006 * aS.w));                                   // 0 大樹 → 1 丘の上をこえて風下へ（60〜90 秒）
        vec3 P0 = ${glv(FT_C)}, P1 = ${glv(P1)}, P2 = ${glv(P2)};
        vec3 c = mix(mix(P0, P1, u), mix(P1, P2, u), u);
        float rad = mix(mix(${glf(FT.h * 0.36)}, 9.0, smoothstep(0.0, 0.3, u)), 30.0, smoothstep(0.45, 1.0, u)) * sqrt(aS.z);   // 花のかたまりから出て、細い川になり、丘の上で広がる
        vec3 side = normalize(cross(P2 - P0, vec3(0.0, 1.0, 0.0)));
        float a = aS.y * 6.2831 + uFpTime * 0.2 * (aS.w - 0.5);
        vec3 p = c + (side * cos(a) + vec3(0.0, 0.55, 0.0) * sin(a)) * rad + vec3(sin(uFpTime * 0.5 + aS.y * 20.0), cos(uFpTime * 0.4 + aS.w * 20.0), 0.0) * 1.5;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp(0.3 * 900.0 * uPR / max(dist, 1.0), 1.8 * uPR, 9.0 * uPR);
        float al = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.86, 1.0, u)) * (0.5 + 0.5 * sin(uFpTime * (2.0 + aS.w * 3.0) + aS.y * 40.0)) * smoothstep(2.0, 8.0, dist);
        vCol = vec4(mix(${glc('#ff9ec8')}, ${glc('#fff2f8')}, aS.w), al); }`,
    fragmentShader: `varying vec4 vCol;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb, a * 0.92); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; pts.name = 'petal_stream';
  return pts;
}
// ---------------------------------------------------------------- ただよう綿毛と光の粒（カメラのまわりの箱の中を風下へ流れる。風の波の帯が通るとき、ぐっと流されて、まい上がる）
export function createFluff() {
  const n = HILL.count.fluff, r = rng(101), s = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) s[i] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 4));
  const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime, uPR: fpU.uPR, tHillN: fpU.tNoise }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec4 aS; uniform float uFpTime, uPR; varying vec4 vCol;
      ${HILL_GLSL}
      void main(){
        vec3 box = vec3(34.0, 7.5, 34.0), base = aS.xyz * box;
        base.xz += vec2(${glf(WD[0])}, ${glf(WD[1])}) * uFpTime * (1.2 + aS.w * 1.0); base.y += uFpTime * 0.1;
        vec3 p = cameraPosition + mod(base - cameraPosition + 0.5 * box, box) - 0.5 * box;
        float w = hillWave(p.xz, uFpTime);
        p.xz += vec2(${glf(WD[0])}, ${glf(WD[1])}) * w * 1.7; p.y += 2.2 + w * 0.6 + sin(uFpTime * 0.7 + aS.w * 6.28) * 0.3;
        p.x += sin(uFpTime * 0.5 + aS.x * 30.0) * 0.4;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float dist = -mv.z, mote = step(0.66, aS.w);                                                // 3 つに 1 つは光の粒（金色・桃色）、ほかは白い綿毛
        gl_PointSize = clamp((0.05 + 0.05 * aS.x) * 900.0 * uPR / max(dist, 0.5), 1.3 * uPR, 15.0 * uPR);
        float al = smoothstep(0.4, 1.6, dist) * (1.0 - smoothstep(13.0, 17.0, dist)) * mix(0.72, 0.55 + 0.45 * sin(uFpTime * (1.5 + aS.x * 2.0) + aS.y * 40.0), mote);
        vCol = vec4(mix(vec3(1.0), mix(${glc('#ffe9a8')}, ${glc('#ffc8e2')}, step(0.83, aS.w)) * 1.25, mote), al); }`,
    fragmentShader: `varying vec4 vCol;
      void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
        float a = smoothstep(1.0, 0.0, d); a = a * a + 0.35 * smoothstep(0.12, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(1.0, 0.3, d);   // やわらかい丸 ＋ 十字のけば
        a *= vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb, a); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6; pts.name = 'fluff';
  return pts;
}
// ---------------------------------------------------------------- こずえのマテリアル（丸い形のふちを、ちぎれた葉のように抜き、色にむらをつける）。遠くの木立と、森のこずえが使う
let crownMat = null;
function crownMaterial() {
  if (crownMat) return crownMat;
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tCrownN = fpU.tNoise;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrownP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrownP = position + instanceMatrix[3].xyz * 0.13;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tCrownN; varying vec3 vCrownP;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        { vec2 cu = vCrownP.xz * 1.1 + vCrownP.y * vec2(0.9, 0.6);
          float rim = 1.0 - abs(dot(normalize(vViewPosition), normal)), cn = texture2D(tCrownN, cu * 2.6).r;
          if (rim * 1.1 + (cn - 0.5) * 1.3 > 0.72) discard;                                       // ふちをちぎれた葉のように抜く
          diffuseColor.rgb *= 0.62 + 0.8 * texture2D(tCrownN, cu * 0.9 + 0.3).r; }`);
  };
  m.customProgramCacheKey = () => 'hillCrown';
  return (crownMat = addDapple(m, 0));
}
// ---------------------------------------------------------------- 遠くの丘の木立（丸い形を InstancedMesh で。奥行きと大きさの手がかり）
export function createFarWoods(seed = 57) {
  const r = rng(seed), n = HILL.count.woods, mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), crownMaterial(), n);
  const dummy = new THREE.Object3D(), col = new THREE.Color(), pal = ['#4f9a6c', '#6fb47a', '#3d8062', '#8fc97f'];
  let made = 0, cx = 0, cz = 0, left = 0;
  for (let tries = 0; made < n && tries < n * 40; tries++) {
    if (left <= 0) { const a = r() * 6.283, d = 175 + r() * 290; cx = TOP.x + Math.cos(a) * d; cz = TOP.z + Math.sin(a) * d; left = 3 + Math.floor(r() * 7); }   // 数本ずつかたまる
    const x = cx + (r() - 0.5) * 26, z = cz + (r() - 0.5) * 26; left--;
    if (z > EXIT_Z - 40 || Math.hypot(x - FT.x, z - FT.z) < 95) continue;
    const s = 3.2 + r() * 3.2;
    dummy.position.set(x, groundH(x, z) + s * 0.8, z); dummy.rotation.set(0, r() * 6.283, 0); dummy.scale.set(s, s * (1.0 + 0.4 * r()), s); dummy.updateMatrix();
    mesh.setMatrixAt(made, dummy.matrix); mesh.setColorAt(made, col.set(pickOf(r, pal)).multiplyScalar(0.85 + 0.25 * r())); made++;
  }
  mesh.count = made; mesh.frustumCulled = false; mesh.name = 'far_woods';
  return mesh;
}

// ---------------------------------------------------------------- 森のこずえ（丸い形を InstancedMesh で）：丘からふり返ると、森がこんもり見える。森の中からは、葉のすき間の奥の緑になる
export function createForestCrowns(trees, seed = 59) {
  // どの木にも 1 つ、幹のてっぺんをつつむ所に置く（幹が、こずえの上へつき出ない）。のこりは、こんもり見えるように、少し下とわきに足す
  const r = rng(seed), list = trees.filter((t) => t.z > EXIT_Z - 2 && t.top), more = Math.round(Math.min(HILL.count.crowns, list.length) * 0.4), n = list.length + more;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), crownMaterial(), n);
  const dummy = new THREE.Object3D(), col = new THREE.Color(), pal = ['#3d8062', '#4f9a6c', '#5fa873', '#356f58'];
  for (let i = 0; i < n; i++) {
    const first = i < list.length, t = first ? list[i] : list[Math.floor(r() * list.length)], s = (first ? 3.3 + r() * 1.4 : 2.6 + r() * 1.2) * t.s;
    if (first) dummy.position.set(t.top.x + (r() - 0.5) * 0.8, t.top.y - s * 0.3, t.top.z + (r() - 0.5) * 0.8);
    else dummy.position.set(t.top.x + (r() - 0.5) * 6 * t.s, t.top.y - s * (0.9 + 0.8 * r()), t.top.z + (r() - 0.5) * 6 * t.s);
    dummy.scale.set(s, s * (0.72 + 0.18 * r()), s); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, col.set(pickOf(r, pal)).multiplyScalar(0.85 + 0.3 * r()));
  }
  mesh.frustumCulled = false; mesh.name = 'forest_crowns';
  return mesh;
}
// ---------------------------------------------------------------- 空のドーム：上は澄んだ青、地平線に近づくほど淡い桃色と金色。大樹の方位の地平線は桃色に明るい。高い所にうすい雲（nature.js の空と同じ作り）
export function createHillSky() {
  const K = HILL.sky, az = V3(FT.x - TOP.x, 0, FT.z - TOP.z).normalize();
  const m = new THREE.ShaderMaterial({
    uniforms: { uFpTime: fpU.uFpTime, tNoise: fpU.tNoise, uNight: fpU.uNight }, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime, uNight; varying vec3 vDir;
      float sHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y, low = exp(-max(y, 0.0) * 6.5);
        vec3 col = mix(${glc(K.hor)}, ${glc(K.mid)}, smoothstep(0.0, 0.2, y)); col = mix(col, ${glc(K.zen)}, smoothstep(0.1, 0.72, y));
        float toTree = max(dot(normalize(d.xz + 1e-5), vec2(${glf(az.x)}, ${glf(az.z)})), 0.0);
        col += ${glc(K.pink)} * low * (0.12 + 0.5 * toTree * toTree * toTree) + ${glc(K.gold)} * low * 0.16;                        // 地平線の桃色と金色
        float s = max(dot(d, ${glv(SUN)}), 0.0); col += ${glc(K.sun)} * (pow(s, 6.0) * 0.2 + pow(s, 40.0) * 0.32);                   // 太陽の方向のひかり
        if (y > 0.0) {
          vec2 p = d.xz / (y + 0.16), drift = vec2(uFpTime * 0.0045, uFpTime * 0.0018);
          float c = texture2D(tNoise, p * 0.11 + drift).g * 0.62 + texture2D(tNoise, p * 0.31 + drift * 1.6).b * 0.38;
          col = mix(col, mix(${glc(K.cloudWarm)}, ${glc(K.cloud)}, smoothstep(0.08, 0.45, y)), smoothstep(0.5, 0.7, c) * smoothstep(0.03, 0.25, y) * 0.6);
        }
        col = mix(col, ${glc(HILL.fog.farCol)}, smoothstep(0.0, -0.2, y));
        if (uNight > 0.0) {                                                                             // 夜：こい青むらさきの空、地平線は大樹の方角だけ桃色、月あかり、星
          vec3 nc = mix(${glc(HILL.night.sky.hor)}, ${glc(HILL.night.sky.mid)}, smoothstep(0.0, 0.22, y)); nc = mix(nc, ${glc(HILL.night.sky.zen)}, smoothstep(0.1, 0.7, y));
          nc += ${glc(K.pink)} * low * (0.05 + 0.5 * toTree * toTree * toTree);
          float mo = max(dot(d, ${glv(SUN)}), 0.0); nc += ${glc(HILL.night.sky.moon)} * (pow(mo, 8.0) * 0.14 + pow(mo, 90.0) * 0.3 + smoothstep(0.99955, 0.9997, mo) * 0.85);
          vec3 sp = d * 170.0, cell = floor(sp); float h = sHash(cell);
          vec3 off = vec3(sHash(cell + 1.7), sHash(cell + 3.1), sHash(cell + 5.3)) - 0.5;
          float st = step(0.992, h) * smoothstep(0.22, 0.0, length(fract(sp) - 0.5 - off * 0.5)) * (0.55 + 0.45 * sin(uFpTime * (1.5 + h * 3.0) + h * 40.0));
          nc += vec3(0.95, 0.95, 1.0) * st * smoothstep(0.03, 0.25, y);
          nc = mix(nc, ${glc(HILL.night.fog.farCol)}, smoothstep(0.0, -0.2, y));
          col = mix(col, nc, uNight);
        }
        gl_FragColor = vec4(col, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), m);
  mesh.name = 'sky_dome'; mesh.frustumCulled = false; mesh.renderOrder = -1000;
  mesh.onBeforeRender = (rr, sc, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}
// ---------------------------------------------------------------- 大きなやわらかい雲：ふくらんだ雲の板を重ねる。地平線に近い大きな雲の列（下は桃色がかる）と、高い所の雲。ゆっくり風下へ流れる
export function createClouds(seed = 83) {
  const r = rng(seed), nc = HILL.count.clouds, puffs = [];
  for (let c = 0; c < nc; c++) {
    const lowC = c % 3 !== 0, a = r() * 6.283, d = lowC ? 520 + r() * 330 : 300 + r() * 380, cx = Math.cos(a) * d, cz = Math.sin(a) * d - 60;
    const cy = lowC ? 95 + r() * 95 : 200 + r() * 150, big = lowC ? 85 + r() * 85 : 65 + r() * 70, np = 6 + Math.floor(r() * 4), tx = Math.cos(a + 1.57), tz = Math.sin(a + 1.57);
    for (let k = 0; k < np; k++) {                                  // 横にならぶ ふくらみ
      const u = (k + 0.5) / np - 0.5, s = big * (0.5 + 0.65 * (1 - Math.abs(u) * 1.5) + 0.3 * r());
      puffs.push([cx + u * big * 2.5 * tx, cy + s * 0.24 + (r() - 0.5) * big * 0.18, cz + u * big * 2.5 * tz, s, r()]);
    }
    for (let k = 0; k < 3; k++) { const u = (r() - 0.5) * 1.3; puffs.push([cx + u * big * tx, cy + big * (0.36 + 0.26 * r()), cz + u * big * tz, big * (0.42 + 0.3 * r()), r()]); }   // 上に重なる ふくらみ
  }
  const n = puffs.length, geo = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => p.slice(0, 4))), 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(puffs.map((p) => p[4])), 1)); geo.instanceCount = n;
  const K = HILL.sky, m = new THREE.ShaderMaterial({
    uniforms: { uFpTime: fpU.uFpTime, tNoise: fpU.tNoise, uNight: fpU.uNight }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec4 aC; attribute float aSeed; uniform float uFpTime; varying vec2 vP; varying float vSeed, vFade, vWarm;
      void main(){
        vec3 c = aC.xyz; float span = 1800.0;
        vec2 q = mod(c.xz + vec2(${glf(WD[0])}, ${glf(WD[1])}) * uFpTime * 2.2 + 0.5 * span, span) - 0.5 * span;      // 風下へ流れ、遠くへ行ったら反対側からもどる
        vFade = 1.0 - smoothstep(0.38 * span, 0.5 * span, max(abs(q.x), abs(q.y)));
        c.xz = q; vP = position.xy * 2.0; vSeed = aSeed;
        vWarm = 1.0 - smoothstep(0.1, 0.42, (c.y - cameraPosition.y) / length(c - cameraPosition));                  // 地平線に近い雲ほど、桃色がかる
        vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * aC.w * vec2(1.25, 0.8);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime, uNight; varying vec2 vP; varying float vSeed, vFade, vWarm;
      void main(){
        float d = length(vP);
        float n = texture2D(tNoise, vP * 0.21 + vSeed * 7.0 + uFpTime * 0.002).g;                 // ふちを もこもこ にする
        float a = smoothstep(1.0, 0.25, d + (n - 0.5) * 0.7) * vFade;
        float lit = smoothstep(-0.7, 0.5, vP.y + (n - 0.5) * 0.5);                                 // 下はかげ、上は白
        vec3 col = mix(mix(${glc(K.cloudSh)}, ${glc(K.cloudWarm)}, vWarm * 0.85), mix(${glc(K.cloud)}, ${glc('#fff4ea')}, vWarm * 0.6), lit);
        gl_FragColor = vec4(col * mix(vec3(1.0), vec3(0.3, 0.33, 0.62), uNight), a * 0.9); }`,      // 夜の雲は、暗い青むらさき
  });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = -900; mesh.name = 'clouds';
  return mesh;
}

// ================================================================ 動き（形と動かし方は area_kit.js。ここは流れ方・いる場所だけ）
// 花びら：カメラのまわりの箱の中を、風下へ流れていく（箱はカメラと一緒に動くので、いつも目の前を流れる）
export function createPetals() {
  return kit.createPetals({ count: HILL.count.petals, bright: 1.5, pos: `
        float per = 9.0 + aS.x * 7.0, tt = fract(uFpTime / per + aS.y);
        vec3 box = vec3(22.0, 5.5, 22.0), base = vec3(aS.z, aS.w, fract(aS.x * 7.13 + aS.y * 3.7)) * box;
        base.xz += vec2(${glf(WD[0])}, ${glf(WD[1])}) * uFpTime * (2.2 + aS.x * 1.2);
        base.y -= uFpTime * 0.22;
        vec3 p = cameraPosition + mod(base - cameraPosition + 0.5 * box, box) - 0.5 * box;
        p.y += 1.4 + sin(uFpTime * 1.3 + aS.z * 6.28) * 0.18; p.x += sin(uFpTime * 0.9 + aS.w * 6.28) * 0.3;` });
}
// 光の粒：丘の上でゆっくりのぼる、綿毛のような光
export function createMotes() {
  const n = HILL.count.motes, r = rng(43), pos = new Float32Array(n * 3), sd = new Float32Array(n * 2), ground = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = lerp(EXIT_Z + 2, TOP.z - 10, r()), x = trailX(z) + (r() - 0.5) * 44;
    pos.set([x, 0.3 + r() * 6, z], i * 3); sd.set([r(), 2], i * 2); ground[i] = groundH(x, z);
  }
  return kit.createMotes({ pos, seed: sd, ground });
}
// 蝶：丘の花の上
export function createButterflies() {
  return kit.createButterflies(HILL.count.butterflies, (r, i) => {
    const z = i < 3 ? lerp(EXIT_Z - 2, EXIT_Z - 9, r()) : lerp(EXIT_Z - 4, TOP.z - 4, r()), x = trailX(z) + (r() - 0.5) * (i < 3 ? 5 : 20);
    return [x, z, groundH(x, z) - 0.25];
  }, 67);
}

// ================================================================ 組み立て
const dapple = createDapple();

scene.add(createHillSky());
scene.add(createHillGround());
const fieldTex = createFieldTextures();
const grass = createHillGrass(fieldTex); scene.add(grass.group);
// 太陽ゲーム：森の床の、ふさふさの短い草（丘の背の高い草とは別もの。同じ group に入れる ＝ エルフの足もとでねるのも同じ）
const hillGrassMeshes = [...grass.group.children];
const turf = !SUN_GAME ? null : kit.createTurf({ scale: 0.7, field: createTurfField(fieldTex.map), map: fieldTex.map, soil: ['#3c775a', '#5f9f66', 0.3, 0.7, 0.82, 0.36], deep: '#3f8a5c', light: '#8fd49a', tip: '#d6f4c2' });
const turfMeshes = turf ? [...turf.group.children] : [];
for (const m of turfMeshes) { addDapple(m.material); grass.group.add(m); }
const grassSun = { position: SUN.clone(), target: { position: V3(0, 0, 0) }, color: new THREE.Color(L.sun), intensity: 2.0 };        // 草の先が透ける光
const flowerRing = createFlowerRing(fieldTex); scene.add(flowerRing);

const shafts = kit.createLightShafts(dapple.pools, { groundH, topH: HILL.canopyH + 2.5 }); scene.add(shafts.mesh);
const giants = createHillTrees(); scene.add(giants.group);
const canopy = createHillCanopy(giants.anchors, shafts.list); scene.add(canopy);

// 町の木（trees.js）を 1 本、丘の肩に（本編と同じ絵がら・大きさの目安）
const townTrees = (() => {
  const x = trailX(-50) + 17, z = -50;
  addDapple(treeMaterial(), 0.6);
  foliageU.uSky.value = 0.3;
  return createForest([{ type: 5, x, y: groundH(x, z) - 0.1, z, scale: 1.5, seed: 231 }], { lite: LITE, variants: 1, castShadow: false });
})();
scene.add(townTrees.group);

const glowItems = [];
scene.add(createExitPlants(giants.list, glowItems));
scene.add(createBlossomTree(giants.anchors, glowItems));
scene.add(createSunGates({ kit, GATES, BR_W, groundH }));      // 太陽ゲーム：森の中の、3 つのエリアの入り口（ふつうの花の丘では、からっぽ）
scene.add(createGlowCards(glowItems, 'flora_glow'));
const farTree = createFarTree();
scene.add(farTree, createFarWoods(), createForestCrowns(giants.list), createClouds());
scene.add(createPetalStream(), createFluff());
if (!SUN_GAME) scene.add(createGlowCards([{ p: V3(0, 2.2, BACK_Z + 4.5), size: 9, color: '#ffd2e4', opacity: 0.5 }, { p: V3(0, 1.4, BACK_Z + 2.5), size: 4.5, color: '#fff0f6', opacity: 0.4 },
  { p: V3(0, 0.06, BACK_Z + 1.5), size: 7, color: '#ffe2ee', opacity: 0.3, flat: true }], 'return_glow'));   // 広場へ戻る道の奥の光（大樹の広場の花の色）
scene.add(createPetals(), createMotes(), createButterflies());

// ---------------------------------------------------------------- プレイヤー（目だけ。体は映さない）・音・はじまり
const player = newPlayer();
{ const g = GATES.find((gt) => gt.name === params.get('from')); if (g) Object.assign(player, g.spawn); }      // 太陽ゲーム：エリアから戻ったら、そのエリアの入り口の前に、入り口に背を向けて立つ
const controls = createWalkControls(renderer.domElement, player, camera, { stickEl: document.getElementById('stick'), knobEl: document.getElementById('knob') });
// 森より強めの風・草のざわめき、ひらけた場所の鳥（ヒバリ・トビ・カッコウ）、草をふむ足音。大樹のひびきはなし
const audio = createAreaAudio({ wind: { g: [0.26, 0.6], lp: [360, 950], hi: [0.018, 0.11], bp: [3200, 1900] }, birds: { set: 'open', vol: [0.02, 0.05], gap: [0.8, 3.6] },
  steps: { low: 0.13, thump: 0.1, swish: [0.07, 0.05] }, tone: false });
// 3 人称のエルフ（area_kit.js の createViewWalker）の設定：アニメ影の光の向き ＝ このエリアの太陽
const AVATAR_OPT = { light: SUN.toArray(), cam: { margin: SUN_GAME ? (x, z) => (z > EXIT_Z ? 0.45 : 1.5) : 1.5 } };      // 丘はひらけているので、カメラは道の外へ少し出てよい（太陽ゲームの森の中は、木の幹に入らないよう小さく）
const walker = createViewWalker({ params, scene, addDapple, U: fpU, grass, avatar: AVATAR_OPT, player, controls, camera, constrain, groundH, eye: HILL.eye, speed: HILL.speed, onStep: (foot) => audio.footstep(foot), helpEl: document.getElementById('help') });
wireStart({ params, controls, audio });
const travel = createTravel({ params, controls });      // エリアの行き来（スタートの後ろ → 大樹の広場の西の出口）
// 昼と夜：空は createHillSky が自分で変える。夜、地平線の大樹は少し暗い色になる（まわりのにじむ光は、夜のほうが強い）
const farTreeMats = []; farTree.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) farTreeMats.push(o.material); });
const dayNight = kit.createDayNight({ params, scene, onNight: (v) => { for (const m of farTreeMats) m.color.setRGB(lerp(1, 0.72, v), lerp(1, 0.66, v), lerp(1, 0.95, v)); } });

// ---------------------------------------------------------------- 確認用：場面・速さ・確認画像
const VIEWS = {
  A: { x: 0, z: 0.4, yaw: 0.0, pitch: 0.06 },                      // 森の出口
  B: { x: trailX(-30) - 2.5, z: -30, yaw: 0.0068, pitch: 0.1 },    // 丘の途中（丘の上の木のほうを見る）
  C: { x: TOP.x - 2.5, z: TOP.z + 3.5, yaw: 0.3902, pitch: -0.03 },   // 丘の上（地平線の大樹のほうを見る）
};
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
const clock = () => FIXED_T ?? performance.now() / 1000;
function renderFrame(t) {
  if (renderer.domElement.width < 2 || renderer.domElement.height < 2) return;
  windU.uTime.value = fpU.uFpTime.value = t;
  walker.placeCamera(t);
  renderer.info.reset();
  grass.update(camera, grassSun); townTrees.update(camera);
  if (turf) {                                                       // 太陽ゲーム：森の草は森の近くにいるときだけ、丘の草と花は丘の近くにいるときだけ描く
    turf.update(camera, grassSun);
    const nearForest = player.z > EXIT_Z - 26, nearHill = player.z < EXIT_Z + 34;
    for (const m of turfMeshes) m.visible = nearForest;
    for (const m of hillGrassMeshes) m.visible = nearHill;
    flowerRing.visible = nearHill;
  }
  shafts.mesh.material.uniforms.uAmt.value = HILL.shaft.amt * (1 - 0.9 * sstep(-player.z, 9, 22));      // 光の筋は森の中だけ（丘からふり返ると消えている）
  composer.render();
}
const tools = createTools({ params, stage, lite: LITE, player, views: VIEWS, constrain, renderFrame, clock });
const PREVIEW = [['A', '森の出口'], ['B', '丘の途中'], ['C', '丘の上']];                    // 3 場面の確認画像（横に 3 枚）
window.__hill = { render: () => renderFrame(clock()), HILL, VIEWS, player, audio, controls, travel, renderer, scene, camera, gates: GATES, sunGame: SUN_GAME,
  setView: tools.setView, view: tools.setView, bench: tools.bench, shot: tools.shot, preview: (w = 720, h = 540) => tools.preview(PREVIEW, 3, w, h), constrain, groundH, trailX, frames: 0, errors: [],
  counts: { giants: giants.list.length, canopy: canopy.count, flowers: HILL.count.flowers + HILL.count.lumen, grass: grass.count, glow: glowItems.length, shafts: dapple.pools.length } };
// 太陽ゲーム：野の花の開き具合。t ＝ 0（つぼみ）〜 1（満開）。spread ＝ 花ごとのずれ（0 ＝ いっせい 〜 0.9 ＝ 大きくずれる。初期値 0.4）。wave ＝ [x, z, 半径]（その点から外へ、順に。なければ ばらばら）
//   毎フレーム呼んでよい（uniform を 1 つ書くだけ）。くわしくは flower_hill.md
if (SUN_GAME) Object.defineProperties(window.__hill, Object.getOwnPropertyDescriptors({      // defineProperties ＝ bloom・clear を、呼ぶたびに今の値を返す getter のまま付ける（Object.assign だと、付けた時の値で止まる）
  setBloom(t, o = {}) { BLOOM_U.uBloom.value.set(clamp(t, 0, 1), clamp(o.spread ?? 0.4, 0, 0.9), 0, 0); if (o.wave) BLOOM_U.uBloomW.value.set(o.wave[0], o.wave[1], o.wave[2] || 20, 1); else if (o.wave === null || o.wave === false) BLOOM_U.uBloomW.value.w = 0; },
  get bloom() { return BLOOM_U.uBloom.value.x; },
  // 草と花を消す円：clearArea(x, z, 半径, on)。on ＝ true（消す）／ false（もどす）／ 0〜1 の数（その割合の半径まで消す ＝ 毎フレーム 0 → 1 で、中心から広がって消える）
  //   ふち：半径の 15％（0.4〜1.2 m）の帯で、外へ行くほど草・花がふえ、背も高くなる。消えるのは丘の草・野の花・光る花だけ（地面・道・木・森の短い草はそのまま）。くわしくは flower_hill.md
  clearArea(x, z, radius, on = true) { const k = on === true ? 1 : on === false ? 0 : clamp(+on || 0, 0, 1), r = Math.max(0, radius) * k;
    CLEAR_U.uClear.value.set(x, z, r, clamp(radius * 0.15, 0.4, 1.2)); return r; },
  get clear() { const v = CLEAR_U.uClear.value; return { x: v.x, z: v.y, r: v.z }; } }));
window.addEventListener('error', (e) => window.__hill.errors.push(String(e.message)));

// ---------------------------------------------------------------- 毎フレーム
function update(dt, t) {
  walker.update(dt);
  if (!travel.busy && !SUN_GAME && player.z > BACK_Z) travel.go('main_plaza.html', 'hill');
  if (!travel.busy) for (const g of GATES) if (gateEntered(g, player.x, player.z)) { travel.go(g.to, 'hill'); break; }      // 太陽ゲーム：門をくぐると、そのエリアへ（門に近づいただけでは入らない）
  const open = sstep(-player.z, 5, 16);                                                    // 森を出ると、風の音が強くなる
  audio.update(dt, { t, gust: Math.min(1, gustAt(player.x, player.z, t) * (0.6 + 0.4 * open) + 0.28 * open) });
}
window.__hill.tick = update;                        // 確認用：1 コマぶん進める
runLoop({ stage, lite: LITE, clock, renderFrame, api: window.__hill, update });
