// =====================================================================
// エリア③「光るキノコの谷」：谷の入口（少し日の光がある）→ 小道をくだるにつれて枝葉がとじ、うす暗い谷 → 奥のくぼ地に、とても大きな親キノコ
// （1 人称で歩くテスト場面。本編にはまだ組みこんでいない）
// 今あるファイル（nature.js など）は import して使うだけ。光・森の部品・音・操作・エリアの行き来は area_kit.js（ほかのエリアと同じもの）。
// このファイルは、谷だけのもの：
//   谷の形（pathX・groundH・constrain）/ createGround（光る苔。歩いた所まで光が広がる）/ createPond（奥のくぼ地いちめんの浅い池：光のうつりこみ・波紋）
//   キノコ：buildShroom（形）・placeMushrooms（置く所の一覧）・createMushrooms（一覧 → メッシュ）・createShroomGlow（にじむ光）
//     → あとで Tripo のモデルに置きかえるときは、placeMushrooms の一覧はそのまま、createMushrooms の中の形だけ入れかえればよい
//   createSpores（ただよう光る胞子）/ createValleyTrees・createValleyCanopy（谷をおおう森）/ createPlants（シダ・光る小さな花）
// 光り方：uFront（歩いた所の少し先まで、の道のり m）より手前のキノコ・苔・胞子が明るくなる。近づくと、さらにふわっと明るくなる。全体が、ゆっくり呼吸するように脈うつ
//   キノコは「内側から光る」見え方（かさの裏のひだ・かさのふち・上面の模様だけが光り、かさの上面そのものは暗い）。createLightMap（光の地図）で、近くの地面・幹・草・エルフがキノコの色に照らされる
//   createMistLayer（足もとの低い霧）/ createParentVeil（親キノコのかさからおりる光のすじ）/ 地面：菌糸のすじを奥へ流れる光・歩いたあとにのこる光・親キノコの根元から広がる光の輪
// 確認用：?lite=1 ?wc=0 ?shot=1 ?debug=1 ?at=x,z,向き°,上下° ?t=秒   window.__valley.bench() / .view('A'〜'C') / .preview()
// =====================================================================
import * as THREE from 'three';
import { createMagicCircle, SUN_CIRCLE_KEYS } from './magic_circle.js';      // 太陽の魔法陣（共通部品。使い方は magic_circle.md）
import { windU, WIND_GLSL, createGrass, createSky } from './nature.js';
import { areaParams, clamp, lerp, sstep, V3, rng, vnoise, glf, glc, glv, pickOf, gustAt, TubeGeo,
  buildFern, buildTuft, buildBell,
  createAreaKit, createAreaAudio, createWalkControls, createViewWalker, newPlayer, wireStart, createTravel, createStage, createTools, runLoop } from './area_kit.js';

const { params, LITE } = areaParams();
const SUN_GAME = params.get('game') === 'sun';                     // 「おひさまのかけら」：かけらのまわりに、魔法陣に見えるものを出さない（池の、親キノコから広がる光の輪／親キノコのかさが水にうつった、放射の線の円）

// ---------------------------------------------------------------- 数値（ここを直せばよい）
export const VALLEY = {
  path: { len: 44, halfW: 1.35, swing: 3.4, drop: 7.5 },           // 小道：長さ・歩ける幅の半分・左右へのふくらみ・くだる高さ（m）
  backZ: 5.4,                                                      // 入口の後ろ：ここより奥へ歩くと、大樹の広場へ戻る
  hollow: { z: -51.5, r: 8 },                                      // 奥のくぼ地（中心の z、歩ける半径）
  circle: { dz: 1.7, r: 1.5 },                                    // 太陽の魔法陣：池の中、親キノコの手前（くぼ地の中心から手前へ 1.7 m）。半径 m
  parent: { dz: -3.0, h: 11, color: '#5fd8ff' },                   // 親キノコ：くぼ地の中心から奥へ 3 m、高さ 11 m
  pond: { r: 9.2, depth: 0.3, shore: 3.4 },                         // 奥のくぼ地いちめんの浅い池：半径・いちばん深い所（すねくらい）・岸から深くなるまでの幅（m）
  eye: 1.55, speed: 2.5, fov: 70,                                  // 目の高さ・歩く速さ・視野（ほかのエリアと同じ）
  sun: new THREE.Vector3(-0.44, 0.8, -0.42).normalize(),
  canopyH: 8.5,
  light: { sky: '#b4dcd6', ground: '#33604f', hemiI: 1.7, sun: '#ffe9bf', sunI: 0.45, tree: '#8fe9ff', treeGlow: 0.22, treeI: 90, treeDecay: 1.4 },   // tree＝親キノコの光
  dark: [0.15, 0.2, 0.31], dark2: [0.15, 0.13, 0.34],              // 谷の中の暗さ（入口の明るさに掛ける。青みがかる）。dark2 ＝ いちばん奥（青むらさき）
  lightGain: 1.05,                                                  // キノコが、まわり（地面・幹・草・エルフ）を照らす強さ
  // 夜の色（昼と夜のスイッチ。area_kit.js の createDayNight）：景色に掛ける色・自分で光る色の強さ・にじむ光の板の強さ・光の筋の強さ・霧と空の色
  night: { tint: [0.6, 0.62, 0.92], glow: 1.9, cards: 1.6, shaft: 0.25, fog: { nearCol: '#0c1030', farCol: '#080620', glowCol: '#5cb8ff' },
    sky: { zen: '#060a26', hor: '#1c2458', low: '#080620', cloud: '#39407a', cloudSh: '#141a44', moon: '#cfd8ff' }, light: 0.9, dim: 0.8 },      // light ＝ 夜にキノコの光が強まる分、dim ＝ 夜の谷の中の暗さ
  fog: { near: 4, far: 62, nearCol: '#47857c', nearDark: '#0f2a36', nearDeep: '#15123a', farCol: '#0f0d2a', glowCol: '#4aa6e0', mist: 0.3, glowAmt: 0.36, glowPow: 4 },   // nearDeep ＝ いちばん奥の霧（青むらさき）
  sky: { zen: '#8cc3d6', hor: '#dcefe4', low: '#bfe0d8', sun: '#fff3d0', cloud: '#ffffff', cloudSh: '#d4e4ea', dark: '#0e0f28' },   // dark＝谷の中で、枝葉のすき間に見える色
  grade: { sat: 1.12, mul: [0.98, 1.0, 1.06], add: [0.0, 0.004, 0.018] },
  dapple: { col: [1.0, 0.9, 0.62], gain: 2.4, map: { x0: -16, z0: -20, w: 32, d: 32 } },
  shaft: { col: '#ffeab4', amt: 0.45 },
  trunk: { bark: '#51454a', bark2: '#66544c', moss: '#679c6c', bend: 2.3 },      // bend ＝ 幹の曲がりの強さ（ほかのエリアは 1。ここは、ふしぎな森らしく大きめ）
  leaves: ['#2f6b55', '#3d8062', '#4f9a6c', '#6fb47a', '#8fc97f', '#b6dc8a', '#bfe9d2'],
  shroomColors: ['#4fa8ff', '#9a7bff', '#3fe0d0', '#6f8cff', '#c08cff', '#44c8f0'],      // 青・むらさき・青緑
  mossGlow: ['#3fe6c0', '#5fb8ff'],                                // 光る苔、光るすじ（菌糸）
  count: LITE
    ? { canopy: 2000, grass: 0.22, fern: 170, tuft: 70, bell: 50, spores: 320, motes: 80, far: 40, butterflies: 5, mist: 12 }
    : { canopy: 3700, grass: 0.4, fern: 320, tuft: 130, bell: 90, spores: 600, motes: 150, far: 75, butterflies: 9, mist: 22 },
};
const P = VALLEY.path, HO = VALLEY.hollow, SUN = VALLEY.sun, L = VALLEY.light;

// ---------------------------------------------------------------- 谷の形（歩ける所・地面の高さ）
// 小道の中心線：入口（z = 0）からまっすぐ出て、ゆるく左右に曲がりながら、奥（z = -len）のくぼ地へ
export function pathX(z) { const k = clamp(-z / P.len, 0, 1); return P.swing * Math.sin(k * 4.2) * sstep(k, 0, 0.3); }
const PATHX_GLSL = `float vyPathX(float z){ float k = clamp(-z / ${glf(P.len)}, 0.0, 1.0); return ${glf(P.swing)} * sin(k * 4.2) * smoothstep(0.0, 0.3, k); }`;
const pathSlope = (z) => (pathX(z + 0.05) - pathX(z - 0.05)) / 0.1;
const HX = pathX(-P.len), HZ = HO.z, PATH_Z0 = VALLEY.backZ + 1.0, PATH_Z1 = -(P.len + 3);      // くぼ地の中心、小道の帯の両はし
const PAR = { x: HX, z: HZ + VALLEY.parent.dz }, POND = VALLEY.pond;
const floorY = (z) => -P.drop * sstep(-z, 3, 42);                 // 谷底の高さ（入口 0 → 奥 -drop）
const WL = floorY(HZ) - 0.03;                                      // 池の水面の高さ（くぼ地の地面より、ほんの少し下。小道からは段差なしで水に入る）
export const pondDepth = (x, z) => POND.depth * (1 - sstep(Math.hypot(x - HX, z - HZ), POND.r - POND.shore, POND.r));   // 池の深さ（岸で 0、中は足首〜すね）
export const depthOf = (z) => sstep(-z, 5, 22);                    // 谷の深さ（0 入口 → 1 うす暗い谷の中）
const DEPTH_GLSL = `float vyDepth(float z){ return smoothstep(5.0, 22.0, -z); }`;
// 歩ける所からの距離（中は負）
export function walkSd(x, z) {
  const dHo = Math.hypot(x - HX, z - HZ) - HO.r, zc = clamp(z, PATH_Z1, PATH_Z0), sl = pathSlope(zc);
  return Math.min(dHo, Math.hypot((x - pathX(zc)) / Math.sqrt(1 + sl * sl), z - zc) - P.halfW);
}
// 地面の高さ：小道は奥へくだる。左右は谷のかべのように高い。奥のくぼ地は、浅い池の底
export function groundH(x, z) {
  const sd = walkSd(x, z); let h = floorY(z);
  if (sd > 0.3) h += sstep(sd, 0.3, 9) * 5.5 + (vnoise(x * 0.21 + 3.1, z * 0.21) - 0.5) * 1.6 * sstep(sd, 0.3, 6) + (vnoise(x * 0.9 + 7, z * 0.9) - 0.4) * 0.3 * sstep(sd, 0.3, 2.5);
  h -= pondDepth(x, z);                                             // 池の底（岸から、ゆるやかに深くなる）
  return h;
}
const walkH = groundH;                                              // 池の中は、浅い水の底を歩く
const OBST = [];                                                    // 入れない所（キノコの茎など）。placeMushrooms が足す
export function constrain(x, z) {
  const inPath = (px, pz) => pz <= PATH_Z0 && pz >= PATH_Z1 && Math.abs(px - pathX(pz)) <= P.halfW;
  const dx = x - HX, dz = z - HZ, d = Math.hypot(dx, dz);
  if (d > HO.r && !inPath(x, z)) {
    const zc = clamp(z, PATH_Z1, PATH_Z0), cx = pathX(zc), ax = clamp(x, cx - P.halfW, cx + P.halfW), bx = HX + dx / d * HO.r, bz = HZ + dz / d * HO.r;
    if (Math.hypot(ax - x, zc - z) <= Math.hypot(bx - x, bz - z)) { x = ax; z = zc; } else { x = bx; z = bz; }
  }
  for (const o of OBST) { const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz); if (od < o.r) { const k = o.r / Math.max(od, 1e-4); x = o.x + ox * k; z = o.z + oz * k; } }
  return [x, z];
}

// ---------------------------------------------------------------- 共通の部品（area_kit.js）と three.js の準備
const PARENT_GLOW = V3(PAR.x, floorY(PAR.z) + VALLEY.parent.h * 0.86, PAR.z);       // 親キノコのかさ（光の中心）
const LMAP = { x0: -24, z0: -72, w: 48, d: 80 };                    // 光の地図（createLightMap）がおおう範囲
const FLOOR_GLSL = `float vyFloorY(float z){ return ${glf(-P.drop)} * smoothstep(3.0, 42.0, -z); }`;
const kit = createAreaKit({ ...VALLEY, lite: LITE, glowPos: PARENT_GLOW,
  // かげと光：谷をくだるほど暗く、青く（いちばん奥は青むらさき）。そこへ、近くのキノコの色の光（光の地図）を足す ＝ 地面・幹・草・エルフが、キノコに照らされる
  // 光は、歩いた所（uVyFront）までが明るく、地面に近いほど強く、ゆっくり脈うつ
  shadeGLSL: `${DEPTH_GLSL}\n${FLOOR_GLSL}\nuniform sampler2D tVyLight; uniform float uVyFront, uVyNight;
    vec3 fpShade(vec3 wp){
      float dep = vyDepth(wp.z);
      vec3 base = mix(vec3(1.0), mix(vec3(${VALLEY.dark.map(glf).join(', ')}), vec3(${VALLEY.dark2.map(glf).join(', ')}), smoothstep(24.0, 48.0, -wp.z)), dep);
      vec3 lm = texture2D(tVyLight, (wp.xz - vec2(${glf(LMAP.x0)}, ${glf(LMAP.z0)})) / vec2(${glf(LMAP.w)}, ${glf(LMAP.d)})).rgb;
      float wake = 1.0 - smoothstep(uVyFront - 4.0, uVyFront + 3.0, -wp.z), low = exp(-max(wp.y - vyFloorY(wp.z), 0.0) * 0.42);      // 地面に近いほど強い（高い枝葉までは とどかない）
      base *= mix(1.0, ${glf(VALLEY.night.dim)}, uVyNight * dep);                                        // 夜：谷の中はさらに深く
      return base + lm * dep * (0.2 + 0.8 * wake) * low * (0.84 + 0.16 * sin(uFpTime * 0.75 + wp.x * 0.3 + wp.z * 0.3)) * ${glf(VALLEY.lightGain)} * (1.0 + ${glf(VALLEY.night.light)} * uVyNight);      // 夜：キノコの光がいちばん映える
    }`,
  shadeUniforms: () => ({ tVyLight: vyU.tLight, uVyFront: vyU.uFront, uVyNight: fpU.uNight }) });
const fpU = kit.U, { addDapple, createGlowCards } = kit;
kit.installFog();                                  // 霧：谷の奥は暗い青緑。親キノコの方向だけ、水色に明るい
const stage = createStage({ params, U: fpU, fov: VALLEY.fov, background: VALLEY.fog.farCol, fog: VALLEY.fog, grade: VALLEY.grade });
const { renderer, scene, camera, composer } = stage;
const hemi = new THREE.HemisphereLight(L.sky, L.ground, L.hemiI); scene.add(hemi);
const sun = new THREE.DirectionalLight(L.sun, L.sunI); sun.position.copy(SUN).multiplyScalar(60); scene.add(sun, sun.target);
const parentLight = new THREE.PointLight(L.tree, L.treeI, 0, L.treeDecay); parentLight.position.copy(PARENT_GLOW).add(V3(0, -2.5, 1.5)); scene.add(parentLight);   // 親キノコの光（ライトはこれ 1 つだけ）
const vyU = { uFront: { value: 6 },                // 歩いた所の少し先まで、の道のり（m）。ここまでのキノコ・苔・胞子が明るい
  tLight: { value: null },                         // 光の地図（createLightMap）
  uTrail: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -1000, 0)) } };      // 歩いたあとの光：(x, z, そこを歩いた時間)

// ================================================================ 地面と浅い池
// ---------------------------------------------------------------- 地面：苔の谷底・土の小道。光る苔のかたまりと、光るすじ（菌糸）が、歩いた所まで明るくなる
export function createGround() {
  const X0 = -40, X1 = 40, Z0 = -80, Z1 = 22, cell = LITE ? 1.1 : 0.85;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / cell), Math.round((Z1 - Z0) / cell));
  geo.rotateX(-Math.PI / 2); geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, groundH(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tVy = fpU.tNoise; sh.uniforms.uFront = vyU.uFront; sh.uniforms.uVyFoot = fpU.uFoot; sh.uniforms.uVyTrail = vyU.uTrail;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tVy; uniform float uFront; uniform vec4 uVyFoot; uniform vec4 uVyTrail[8]; float vyEdge;\n${PATHX_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec3 wp = vFogWorld;
        float n1 = texture2D(tVy, wp.xz * 0.045).g, n2 = texture2D(tVy, wp.xz * 0.31).r, n3 = texture2D(tVy, wp.xz * 1.9).r;
        // 池の深い所は、底を描かない：水面の下に置いた「さかさまのキノコ」が見えて、鏡のようにうつりこむ（createMushrooms・createParentVeil）。岸の浅い所だけ、底が見える
        if (${glf(POND.depth)} * (1.0 - smoothstep(${glf(POND.r - POND.shore)}, ${glf(POND.r)}, length(wp.xz - vec2(${glf(HX)}, ${glf(HZ)})))) > 0.1 + 0.06 * (n2 - 0.5)) discard;
        float zc = clamp(wp.z, ${glf(PATH_Z1)}, ${glf(PATH_Z0)});
        float dPa = length(vec2(wp.x - vyPathX(zc), wp.z - zc)) - ${glf(P.halfW)} + (n2 - 0.5) * 0.7;
        float dHo = length(wp.xz - vec2(${glf(HX)}, ${glf(HZ)})) - ${glf(HO.r)} + (n2 - 0.5) * 1.2;
        vyEdge = min(dPa, dHo);                                                                            // 歩ける所からの距離（光る苔の置き方に使う）
        vec3 moss = mix(${glc('#356e5c')}, ${glc('#5a9a6c')}, smoothstep(0.3, 0.7, n1)) * (0.82 + 0.36 * n2);
        vec3 dirt = mix(${glc('#75695a')}, ${glc('#9a8a6e')}, n2) * (0.86 + 0.28 * n3);
        dirt = mix(dirt, moss, smoothstep(0.55, 0.8, n3) * 0.7);
        vec3 c = mix(moss, dirt, (1.0 - smoothstep(-0.6, -0.05, dPa)) * smoothstep(-2.5, 0.5, dHo));        // くぼ地の中は、道が苔にとける
        c *= 1.0 - 0.5 * (1.0 - smoothstep(${glf(POND.r - 1.0)}, ${glf(POND.r + 0.5)}, length(wp.xz - vec2(${glf(HX)}, ${glf(HZ)}))));   // 池の底と水ぎわは、ぬれて暗い
        diffuseColor.rgb = c;
      }`);
  };
  m.customProgramCacheKey = () => 'valleyGround';
  addDapple(m);
  const shaded = m.onBeforeCompile;                                 // かげを掛けたあとに、光る苔を足す（苔の光は暗くならない）
  m.onBeforeCompile = (sh, r) => {
    shaded.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
        vec3 wp = vFogWorld;
        float mossP = smoothstep(0.54, 0.7, texture2D(tVy, wp.xz * 0.19).g) * smoothstep(0.3, 0.6, texture2D(tVy, wp.xz * 1.1).r);      // 光る苔のかたまり
        float vn = texture2D(tVy, wp.xz * 0.27 + 0.4).b, vein = (smoothstep(0.47, 0.5, vn) - smoothstep(0.5, 0.53, vn)) * smoothstep(0.35, 0.65, texture2D(tVy, wp.xz * 0.9).r);   // 光るすじ（菌糸）
        float nearWalk = 1.0 - smoothstep(0.5, 7.0, vyEdge), onPath = smoothstep(-0.9, 0.0, vyEdge);
        float wake = 1.0 - smoothstep(uFront - 4.0, uFront + 2.0, -wp.z);                                  // 歩いた所の少し先まで明るい
        float amt = (0.1 + 0.9 * wake) * vyDepth(wp.z) * (0.3 + 0.7 * nearWalk) * (0.25 + 0.75 * onPath) * (0.78 + 0.22 * sin(uFpTime * 1.1 + wp.x * 0.9 + wp.z * 0.7));
        float flow = 0.55 + 0.45 * sin(wp.z * 1.4 + uFpTime * 1.7 + vn * 14.0);                             // 菌糸のすじを、奥へ流れていく光（道しるべ）
        vec3 gl = (${glc(VALLEY.mossGlow[0])} * mossP * 0.8 + ${glc(VALLEY.mossGlow[1])} * vein * 1.5 * flow) * amt;
        // 歩く人の足もと：まわりの苔がふわっと光り、歩いたあとにも しばらく光がのこる
        vec3 who = mix(cameraPosition, uVyFoot.xyz, uVyFoot.w);
        float foot = (1.0 - smoothstep(0.3, 2.6, distance(wp.xz, who.xz))) * 0.45;
        for (int i = 0; i < 8; i++) { float age = uFpTime - uVyTrail[i].z; foot += (1.0 - smoothstep(0.1, 0.85, distance(wp.xz, uVyTrail[i].xy))) * exp(-max(age, 0.0) * 0.35) * step(0.0, age) * 0.9; }
        gl += mix(${glc(VALLEY.mossGlow[0])}, vec3(0.85, 1.0, 1.0), 0.35) * foot * (0.3 + 0.7 * smoothstep(0.3, 0.7, texture2D(tVy, wp.xz * 2.3).g)) * vyDepth(wp.z) * 0.6;
        outgoingLight += kfGlow(gl);                                                                           // kfGlow：夜は、光るものが強く見える（area_kit.js の霧のシェーダー）
      }\n#include <opaque_fragment>`);
  };
  const mesh = new THREE.Mesh(geo, m); mesh.name = 'ground';
  return { mesh, X0, X1, Z0, Z1 };
}
function createFieldTextures(G) {
  const cell = 0.5, nx = Math.round((G.X1 - G.X0) / cell) + 1, ny = Math.round((G.Z1 - G.Z0) / cell) + 1, half = new Uint16Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = G.X0 + i * cell, z = G.Z0 + j * cell, sd = walkSd(x, z);
    const g = sstep(sd, -0.25, 0.5) * lerp(1, 0.55, depthOf(z)) * (pondDepth(x, z) > 0.03 ? 0 : 1);                    // 小道とくぼ地には生やさない。谷の中は短い草
    half[(j * nx + i) * 2] = THREE.DataUtils.toHalfFloat(groundH(x, z)); half[(j * nx + i) * 2 + 1] = THREE.DataUtils.toHalfFloat(g);
  }
  const field = new THREE.DataTexture(half, nx, ny, THREE.RGFormat, THREE.HalfFloatType);
  field.magFilter = field.minFilter = THREE.LinearFilter; field.needsUpdate = true;
  const map = { x0: G.X0, z0: G.Z0, w: G.X1 - G.X0, d: G.Z1 - G.Z0, hx0: G.X0, hz0: G.Z0, hcell: cell, nx, ny };
  const c = document.createElement('canvas'); c.width = c.height = 8; const g2 = c.getContext('2d'); g2.fillStyle = '#6fb792'; g2.fillRect(0, 0, 8, 8);
  const groundTex = new THREE.CanvasTexture(c); groundTex.colorSpace = THREE.SRGBColorSpace;
  return { field, map, groundTex };
}
// ---------------------------------------------------------------- 浅い池：奥のくぼ地いちめんにはった、澄んだ暗い水（円い板 1 枚）。鏡のように光がうつりこむ（本物の反射ではなく、光のにじみを重ねる）
//   うつりこみ：水面の下に、池のまわりのキノコと光のとばりを さかさまに置いてある（池の深い所は地面を描かないので、澄んだ暗い水ごしに見える）＋ キノコの色の光のにじみ ＋ 胞子のきらめき
//   波紋：親キノコの根元から広がる輪 / 歩いたあと（uTrail）と足もとから広がる輪 / 光る胞子が落ちた所の小さな輪。水面はゆっくりゆらぐ
export function createPond() {
  const R = POND.r, geo = new THREE.CircleGeometry(R + 0.2, 56); geo.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFpTime: fpU.uFpTime, uFront: vyU.uFront, tNoise: fpU.tNoise, tVyLight: vyU.tLight, uVyFoot: fpU.uFoot, uVyTrail: vyU.uTrail },
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vWp;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tNoise, tVyLight; uniform float uFpTime, uFront; uniform vec4 uVyFoot; uniform vec4 uVyTrail[8]; varying vec3 vWp;
      #include <fog_pars_fragment>
      vec3 vyLm(vec2 q){ return texture2D(tVyLight, (q - vec2(${glf(LMAP.x0)}, ${glf(LMAP.z0)})) / vec2(${glf(LMAP.w)}, ${glf(LMAP.d)})).rgb; }
      void main(){
        float t = uFpTime; vec2 p = vWp.xz; float r = distance(p, vec2(${glf(HX)}, ${glf(HZ)}));
        float depth = ${glf(POND.depth)} * (1.0 - smoothstep(${glf(R - POND.shore)}, ${glf(R)}, r));
        if (depth < 0.003) discard;
        vec3 vd = normalize(cameraPosition - vWp); float fres = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);                // 遠くの水面ほど、よくうつる
        vec2 wob = vec2(texture2D(tNoise, p * 0.09 + vec2(t * 0.012, 0.0)).g, texture2D(tNoise, p * 0.09 + vec2(0.3, t * 0.01)).r) - 0.5;   // ゆっくりしたゆらぎ
        float lit = smoothstep(${glf(P.len - 2)}, ${glf(P.len + 4)}, uFront), wake = 1.0 - smoothstep(uFront - 4.0, uFront + 3.0, -vWp.z);
        // 波紋
        vec2 pc = p - vec2(${glf(PAR.x)}, ${glf(PAR.z)}); float pr = length(pc);
        float rings = ${SUN_GAME ? '0.0' : 'smoothstep(0.8, 1.0, sin(pr * 2.3 - t * 1.05)) * (1.0 - smoothstep(2.5, 10.5, pr)) * smoothstep(0.9, 1.7, pr)'};    // 親キノコの根元から広がる光の輪（太陽ゲームでは出さない ＝ かけらのまわりの同心円に見えるので）
        vec3 who = mix(cameraPosition, uVyFoot.xyz, uVyFoot.w); float rip = 0.0;
        for (int i = 0; i < 8; i++) { float age = t - uVyTrail[i].z, d = distance(p, uVyTrail[i].xy), x = (d - age * 0.85) / 0.07; rip += exp(-x * x) * exp(-age * 1.1) * step(0.0, age) * step(age, 4.5); }   // 歩いたあと
        float dw = distance(p, who.xz), ph0 = fract(t * 0.45), x0 = (dw - 0.3 - ph0 * 1.3) / 0.06, x1 = (dw - 0.34) / 0.05;
        rip += exp(-x0 * x0) * (1.0 - ph0) * 0.7 + exp(-x1 * x1) * 0.4 * uVyFoot.w;                                                  // 足もと：立っていても ゆっくり広がる輪 ＋ 水ぎわの輪（3 人称のエルフ）
        vec2 cell = floor(p / 2.4), cf = p / 2.4 - cell; float ch = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453), ph = fract(t * (0.1 + 0.08 * ch) + ch * 7.0);
        float dd = length(cf - (vec2(fract(ch * 13.7), fract(ch * 31.3)) * 0.6 + 0.2)) * 2.4, xd = (dd - ph * 0.8) / 0.05;
        float drop = exp(-xd * xd) * (1.0 - ph * 1.6) * step(ph, 0.6) + exp(-dd * dd * 70.0) * exp(-ph * 16.0) * 2.2;                 // 光る胞子が落ちて、ぽつんと光る
        ${SUN_GAME ? 'rip = 0.0; drop = exp(-dd * dd * 70.0) * exp(-ph * 16.0) * 0.8;      // 太陽ゲーム：白い輪（足もと・歩いたあと・胞子の落ちた所）は出さない。胞子の落ちた点の小さなきらめきだけ。水面のゆらぎ・うつりこみはそのまま' : ''}
        // うつりこみ
        vec2 toCam = normalize(cameraPosition.xz - p + 1e-4), q = p + wob * 0.9 + toCam * (rip + rings * 0.5) * 0.3;
        vec3 lm = (vyLm(q) + vyLm(q + toCam * 0.9) * 0.8 + vyLm(q + toCam * 2.0) * 0.55 + vyLm(q + toCam * 3.4) * 0.3) / 2.65;        // キノコの光：見る人のほうへ のびる
        float sp = smoothstep(0.86, 0.94, texture2D(tNoise, q * 0.7 + vec2(t * 0.004, 0.0)).b) * (0.5 + 0.5 * sin(t * 2.0 + p.x * 5.0 + p.y * 3.0));   // 胞子のきらめき
        vec3 refl = lm * lm * (0.25 + 0.75 * wake) * 0.9 * (0.4 + 0.6 * fres) + mix(${glc(VALLEY.shroomColors[2])}, ${glc(VALLEY.shroomColors[1])}, fract(ch * 5.3)) * sp * 0.45 * (0.3 + 0.7 * wake);
        vec3 glow = ${glc(VALLEY.parent.color)} * rings * lit * 0.75 + vec3(0.8, 0.96, 1.0) * (rip * 0.55 + drop * 0.5 * (0.3 + 0.7 * wake));
        vec3 col = vec3(0.004, 0.016, 0.032) + kfGlow(refl + glow);                                                                   // 澄んだ暗い水
        float a = smoothstep(0.0, 0.09, depth) * mix(0.42, 0.6, fres) + (rings * lit + rip + drop * 0.5) * 0.25;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(HX, WL, HZ); mesh.renderOrder = 2; mesh.name = 'pond';
  return mesh;
}

// ================================================================ キノコ
// ---------------------------------------------------------------- キノコ 1 本の形（高さ 1。置くときに大きさを掛ける）。kind：0 かさ / 1 つりがね / 2 平たい大がさ / 3 まるい子ども
// 頂点ごとの aSh ＝ (自分で光る量, 部分 0 茎・1 かさの裏のひだ・2 かさの上, かさのまん中 0 〜 ふち 1)
const SHROOM_KINDS = [
  { capR: 0.42, capH: 0.34, stemR: 0.07, droop: 0.09, capY: 0.72, skirt: true },
  { capR: 0.26, capH: 0.46, stemR: 0.06, droop: 0.02, capY: 0.56, skirt: false },
  { capR: 0.62, capH: 0.27, stemR: 0.075, droop: 0.06, capY: 0.84, skirt: true },
  { capR: 0.36, capH: 0.42, stemR: 0.13, droop: 0.04, capY: 0.5, skirt: false },
];
export function buildShroom(kind, seed = 1) {
  const K = SHROOM_KINDS[kind], r = rng(seed + kind * 13), sides = kind === 2 ? 28 : 16, bend = (r() - 0.5) * 0.2, sr = K.stemR, cy = K.capY, prof = [];
  const add = (y, rad, glow, part, shade) => prof.push({ y, rad, glow, part, shade });
  add(-0.04, sr * 1.9, 0.08, 0, 0.8); add(0.02, sr * 1.7, 0.09, 0, 0.82); add(0.09, sr * 1.2, 0.11, 0, 0.86); add(cy * 0.45, sr, 0.15, 0, 0.9);                 // 茎（根元がふくらむ）
  if (K.skirt) { add(cy * 0.74, sr * 0.9, 0.2, 0, 0.9); add(cy * 0.77, sr * 2.1, 0.45, 0, 1); add(cy * 0.8, sr * 0.9, 0.22, 0, 0.92); }                      // つば
  add(cy - 0.015, sr * 0.85, 0.3, 0, 0.95);
  add(cy - 0.005, sr * 1.1, 0.95, 1, 1); add(cy - K.droop * 0.35, K.capR * 0.55, 0.85, 1, 1); add(cy - K.droop, K.capR, 0.7, 1, 1);                              // かさの裏（ひだ）：いちばん光る
  const yb = cy - K.droop, lip = K.capR * 0.05;                    // かさのふち：厚みのある丸いへり → かさの上：丸いドーム（だ円の半分）
  add(yb + 0.004, K.capR * 1.03, 0.55, 2, 1); add(yb + 0.02 + lip * 0.5, K.capR * 1.06, 0.4, 2, 0.98); add(yb + 0.04 + lip, K.capR * 1.05, 0.32, 2, 0.97);
  for (const th of [0.2, 0.42, 0.66, 0.9, 1.14, 1.36, 1.5708]) add(yb + 0.04 + lip + (K.capH + K.droop) * Math.sin(th), K.capR * 1.05 * Math.max(Math.cos(th), 0.004), 0.3 - 0.08 * Math.sin(th), 2, 0.96);
  const pos = [], nrm = [], col = [], sh = [], idx = [], n = prof.length;
  for (let j = 0; j < n; j++) {
    const a = prof[Math.max(0, j - 1)], b = prof[Math.min(n - 1, j + 1)], p = prof[j], dr = b.rad - a.rad, dy = b.y - a.y, len = Math.hypot(dr, dy) || 1, ox = bend * p.y * p.y;
    for (let s = 0; s <= sides; s++) {
      const th = s / sides * 6.2832, c = Math.cos(th), sn = Math.sin(th), wob = 1 + (p.part === 2 || p.part === 1 ? 0.035 * Math.sin(th * 5 + seed) : 0);
      pos.push(ox + c * p.rad * wob, p.y, sn * p.rad * wob); nrm.push(c * dy / len, -dr / len, sn * dy / len); col.push(p.shade, p.shade, p.shade); sh.push(p.glow, p.part, p.part > 0.5 ? Math.min(1, p.rad / K.capR) : 0);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let s = 0; s < sides; s++) { const a = j * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aSh', new THREE.Float32BufferAttribute(sh, 3));
  g.setIndex(idx); g.computeBoundingSphere(); g.userData = { ...K, bend };
  return g;
}
// ---------------------------------------------------------------- キノコを置く所の一覧 [{ x, y, z, h（高さ m）, kind, color, s（道のり。光る順番）, rot, tilt: [x, z] }]
// 道の両わき（奥ほど大きく多い）・頭の上にかさがかぶさる 3 か所・土手の上の遠い光・くぼ地の親キノコとキノコの輪・池のふち
export function placeMushrooms(seed = 17) {
  const r = rng(seed), rb = rng(seed + 500), list = [], C = VALLEY.shroomColors;      // rb ＝ 柄の曲がり用（置き場所の乱数とは別 ＝ 置き場所は前と同じ）
  const add = (x, z, h, kind, o = {}) => {
    const K = SHROOM_KINDS[kind], m = { x, z, y: groundH(x, z) - 0.03 * h, h, kind, color: o.color ?? pickOf(r, C), s: o.s ?? Math.max(0, -z), rot: r() * 6.283, tilt: o.tilt ?? [(r() - 0.5) * 0.16, (r() - 0.5) * 0.16], chime: o.chime ?? h > 1.2 };
    m.bend = [rb() * 6.283, (0.12 + 0.3 * rb()) * (h > 3 ? 0.6 : 1)];                    // 柄の曲がり：[向き, 曲がりの強さ（高さ 1 あたりの角度 rad）]。大きいキノコは、ひかえめ
    list.push(m);
    if (walkSd(x, z) < 0.9) OBST.push({ x, z, r: K.stemR * h * 1.7 + 0.28 });
    return m;
  };
  for (let s = 7, i = 0; s < P.len - 1.5; s += 1.2 + r() * 0.9, i++) {                      // 道の両わき（入口の近くは小さく、奥ほど大きい）
    const z = -s, side = i % 2 ? 1 : -1, k = s / P.len, big = r() < 0.5 * sstep(k, 0.22, 0.6);
    const h = (big ? 2.6 + r() * 2.2 : r() < 0.5 ? 0.5 + r() * 0.8 : 1.3 + r() * 1.1) * lerp(0.55, 1, sstep(k, 0.1, 0.4));
    add(pathX(z) + side * (P.halfW + 0.55 + h * 0.16 + r() * (big ? 1.6 : 2.6)), z + (r() - 0.5), h, big ? pickOf(r, [0, 0, 1, 2]) : pickOf(r, [0, 1, 3, 3, 0]));
  }
  for (const s of [17, 27.5, 36]) for (const side of [-1, 1]) {                             // 頭の上にかさがかぶさる所：平たい大がさを道の両がわに、道のほうへかたむけて
    const z = -s + side * 0.7, h = 3.5 + r() * 0.8;
    add(pathX(z) + side * (P.halfW + 1.0), z, h, 2, { tilt: [(r() - 0.5) * 0.08, side * 0.17] });
  }
  for (let i = 0; i < VALLEY.count.far; i++) {                                              // 土手の上（遠くに見える光）
    const z = lerp(-14, -64, r()), x = (z < -P.len ? HX : pathX(z)) + (r() < 0.5 ? -1 : 1) * (4.5 + r() * 9.5);
    if (walkSd(x, z) < 2.6) continue;
    add(x, z, 0.6 + r() * r() * 3.0, pickOf(r, [0, 1, 3, 0, 2]), { chime: false });
  }
  add(PAR.x, PAR.z, VALLEY.parent.h, 2, { color: VALLEY.parent.color, s: P.len + 1.5, tilt: [0, 0] }).parent = true; list[list.length - 1].bend = [0, 0];      // 親キノコ
  for (let k = 0; k < 14; k++) {                                                            // 親キノコをかこむ、キノコの輪（小道の入ってくる側だけ、あけてある）。1 本ずつ順に光る
    const a = k / 14 * 6.2832 + 0.22, x = PAR.x + Math.cos(a) * 5.7, z = PAR.z + Math.sin(a) * 5.7;
    if (Math.sin(a) > 0.74) continue;
    add(x, z, 1.2 + r() * 1.5, pickOf(r, [0, 1, 0, 3]), { s: P.len + 2.5 + k * 0.9 });
  }
  for (let k = 0; k < 18; k++) {                                                            // 池のふちの小さなキノコ
    const a = k / 18 * 6.2832 + r() * 0.3, d = POND.r + 0.1 + r() * 0.7, x = HX + Math.cos(a) * d, z = HZ + Math.sin(a) * d;
    if (walkSd(x, z) > 0.7) add(x, z, 0.25 + r() * 0.5, pickOf(r, [3, 0, 1]), { s: P.len + 1, chime: false });
  }
  return list;
}
// かさのつけ根の場所（柄が曲がったぶん、まっすぐ上からずれる。にじむ光の板を、ここに置く）
const _ce = new THREE.Euler(), _cq = new THREE.Quaternion(), _cy = new THREE.Quaternion();
export function capOf(s) {
  const cy = SHROOM_KINDS[s.kind].capY, k = s.bend[1], xc = k > 1e-3 ? (1 - Math.cos(k * cy)) / k : 0, yc = k > 1e-3 ? Math.sin(k * cy) / k : cy;
  _ce.set(s.tilt[0], 0, s.tilt[1]); _cq.setFromEuler(_ce).multiply(_cy.setFromAxisAngle(V3(0, 1, 0), s.rot));
  return V3(Math.cos(s.bend[0]) * xc, yc, Math.sin(s.bend[0]) * xc).applyQuaternion(_cq).multiplyScalar(s.h).add(V3(s.x, s.y, s.z));
}
// ---------------------------------------------------------------- 一覧 → メッシュ（形ごとに InstancedMesh 1 つ＝4 回で描く）。光は emissive（ライトなし）
// 柄は 1 本ずつ、ゆるく弓なりに曲がり（aBend ＝ 向き xz・強さ）、太さにむらがある。かさも、柄の先の向きにかたむく（シェーダーで曲げる ＝ 描く回数はふえない）
// かげの色は森の光（入口は明るく、谷の中は暗い）、そこへ「自分の色 × 光る量」を足す。光る量 ＝ いつもの弱い光 ＋ 歩いた所まで明るい（uFront）＋ 近づくとふわっと明るい
const SHROOM_GLOW_GLSL = `
  uniform float uFront; uniform vec4 uVyFoot;
  float vyShroomGlow(float s, vec3 root, float size, float t){
    vec3 who = mix(cameraPosition, uVyFoot.xyz, uVyFoot.w);                                            // 1 人称はカメラ、3 人称はエルフ
    float wake = smoothstep(s - 3.0, s + 1.5, uFront), near = 1.0 - smoothstep(1.5, 7.0 + size, distance(root, who));
    float ph = s > ${glf(P.len + 0.5)} ? distance(root.xz, vec2(${glf(PAR.x)}, ${glf(PAR.z)})) * 0.6 : s * 0.33;   // 呼吸：道ぞいは奥へ伝わる。くぼ地は、親キノコからまわりへ伝わる
    float breath = 0.5 + 0.5 * sin(t * 0.8 - ph);
    return (0.1 + 0.44 * wake + 0.46 * near * (0.25 + 0.75 * wake)) * (0.66 + 0.5 * breath * (0.35 + 0.65 * wake));
  }`;
export function createMushrooms(list) {
  const group = new THREE.Group(); group.name = 'mushrooms';
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windU.uTime; sh.uniforms.uWind = windU.uWind; sh.uniforms.uFront = vyU.uFront; sh.uniforms.uVyFoot = fpU.uFoot; sh.uniforms.tVy = fpU.tNoise;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aSh, aBend; attribute float aS; varying vec3 vAmb, vLocal; varying float vGlow, vPart, vEdge, vFres, vSc, vUpN;\n${WIND_GLSL}\n${kit.LIGHT_GLSL}\n${DEPTH_GLSL}\n${SHROOM_GLOW_GLSL}`)
      .replace('#include <project_vertex>', `
        vec3 bp = transformed, bn = normal;
        if (aSh.y < 0.5) bp.xz *= 1.0 + 0.13 * sin(bp.y * 10.0 + aBend.x * 9.0) * smoothstep(0.0, 0.12, bp.y);      // 柄の太さのむら
        if (aBend.z > 0.001) {                                                                       // 柄を弓なりに曲げる（かさも、柄の先の向きにかたむく）
          float bt = aBend.z * bp.y, bc = cos(bt), bs = sin(bt), bd = dot(bp.xz, aBend.xy), nd = dot(bn.xz, aBend.xy);
          bp.xz += aBend.xy * ((1.0 - bc) / aBend.z + bd * bc - bd); bp.y = bs / aBend.z - bd * bs;
          bn.xz += aBend.xy * (nd * bc + bn.y * bs - nd); bn.y = bn.y * bc - nd * bs;
        }
        vec4 mvPosition = instanceMatrix * vec4(bp, 1.0);
        vec3 sRoot = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float sSc = length(instanceMatrix[1].xyz);
        mvPosition.xz += vec2(sin(uTime * 0.9 + sRoot.x * 0.7), cos(uTime * 0.7 + sRoot.z * 0.6)) * 0.012 * sSc * position.y * position.y;      // ごくわずかにゆれる
        vec3 sN = normalize(mat3(instanceMatrix) * bn);
        vGlow = aSh.x * vyShroomGlow(aS, sRoot, sSc, uTime);
        vAmb = fpLight(mvPosition.xyz, sN, 1.0) * mix(vec3(1.0), vec3(${VALLEY.dark.map(glf).join(', ')}), vyDepth(mvPosition.z));
        vPart = aSh.y; vLocal = position; vEdge = aSh.z; vSc = sSc; vUpN = sN.y;
        vFres = 1.0 - abs(dot(sN, normalize(cameraPosition - mvPosition.xyz)));
        mvPosition = viewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tVy; varying vec3 vAmb, vLocal; varying float vGlow, vPart, vEdge, vFres, vSc, vUpN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 tint = diffuseColor.rgb, col; float ang = atan(vLocal.z, vLocal.x), g = vGlow;
          if (vPart < 0.5) {                                                                           // 茎：うすく透けた色。上のかさの光をうけて、上ほど明るい
            col = mix(vec3(0.8), tint, 0.45) * vAmb * 0.75 + tint * g * 1.25 + vec3(g * g * 0.35);
          } else if (vPart < 1.5) {                                                                    // かさの裏：細いひだが、内側から強く光る（ここがいちばん明るい）
            float ribs = 0.5 + 0.5 * sin(ang * 34.0); ribs *= ribs;                                    // ひだ：明るいすじと、暗いすき間
            float core = 1.0 - smoothstep(0.12, 1.0, vEdge);                                             // 茎に近いほど明るい（光が、まん中からにじみ出る）
            col = tint * g * (0.16 + 0.85 * ribs * (0.4 + 0.6 * core) + 0.55 * core * core) + vec3(1.0) * g * g * 0.3 * core * core * (0.5 + 0.5 * ribs);
          } else {                                                                                     // かさの上：かさそのものは暗い。にじんだ模様・すじ・ふちだけが、内側の光で光る
            vec2 q = vLocal.xz * vSc;
            float n = texture2D(tVy, q * 1.15 + 0.3).g, n2 = texture2D(tVy, q * 0.5 + 0.7).r;
            float spots = smoothstep(0.66, 0.8, n) * smoothstep(0.35, 0.6, n2);                              // 小さな光の点が、ところどころに かたまる
            float veins = (1.0 - smoothstep(0.0, 0.035, abs(texture2D(tVy, q * 0.42 + 0.11).b - 0.5))) * (0.3 + 0.7 * vEdge);      // 細い光のすじ（ふちへ向かって明るい）
            float edge = smoothstep(0.55, 1.0, vEdge), rim = vFres * vFres * vFres * vFres;
            float side = 1.0 - clamp(vUpN, 0.0, 1.0);                                                    // かさの丸い側面ほど、中の光が透けて明るい（厚みが見える）
            col = mix(vec3(0.4), tint, 0.85) * (vAmb * 0.26 + 0.035) * (0.5 + 0.7 * clamp(vUpN, 0.0, 1.0))                     // かさそのもの（暗い）
              + tint * g * (0.03 + 2.6 * spots + 1.2 * veins + 1.7 * edge * edge * edge + 0.1 * rim + 0.6 * side * side) + vec3(1.0) * g * g * 0.4 * (spots + edge * edge * edge);
          }
          diffuseColor.rgb = kfGlow(col); }`);
  };
  m.customProgramCacheKey = () => 'valleyShroom';
  const dummy = new THREE.Object3D(), col = new THREE.Color(), qt = new THREE.Quaternion(), qy = new THREE.Quaternion(), e = new THREE.Euler(), UP = V3(0, 1, 0);
  const MIRROR = new THREE.Matrix4().makeTranslation(0, 2 * WL, 0).multiply(new THREE.Matrix4().makeScale(1, -1, 1));      // 水面（高さ WL）を鏡にする行列
  SHROOM_KINDS.forEach((_, kind) => {
    const mine = list.filter((s) => s.kind === kind), geo = buildShroom(kind, 3), mesh = new THREE.InstancedMesh(geo, m, mine.length), aS = new Float32Array(mine.length), aB = new Float32Array(mine.length * 3);
    mine.forEach((s, i) => {
      e.set(s.tilt[0], 0, s.tilt[1]); qt.setFromEuler(e); qy.setFromAxisAngle(UP, s.rot);
      dummy.position.set(s.x, s.y, s.z); dummy.quaternion.copy(qt).multiply(qy); dummy.scale.setScalar(s.h); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, col.set(s.color)); aS[i] = s.s; aB.set([Math.cos(s.bend[0]), Math.sin(s.bend[0]), s.bend[1]], i * 3);
    });
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 1)); geo.setAttribute('aBend', new THREE.InstancedBufferAttribute(aB, 3));
    mesh.frustumCulled = false; mesh.name = `mushrooms_${kind}`; group.add(mesh);
    // 池のまわりのキノコは、水面を鏡にして さかさまにも置く（水にうつった姿。池の深い所は地面を描かないので、水ごしに見える）
    //   太陽ゲームでは、親キノコだけは うつさない（かさの裏のひだが、かけらの足もとの水面に「放射の線の入った円」としてうつり、魔法陣に見えるので）
    const near = mine.map((sm, i) => i).filter((i) => Math.hypot(mine[i].x - HX, mine[i].z - HZ) < POND.r + 2.5 && !(SUN_GAME && mine[i].parent));
    if (near.length) {
      const g2 = geo.clone(), mir = new THREE.InstancedMesh(g2, m, near.length), aS2 = new Float32Array(near.length), aB2 = new Float32Array(near.length * 3), m4 = new THREE.Matrix4();
      near.forEach((i, j) => { mesh.getMatrixAt(i, m4); mir.setMatrixAt(j, m4.premultiply(MIRROR)); mesh.getColorAt(i, col); mir.setColorAt(j, col); aS2[j] = aS[i]; aB2.set([aB[i * 3], aB[i * 3 + 1], aB[i * 3 + 2]], j * 3); });
      g2.setAttribute('aS', new THREE.InstancedBufferAttribute(aS2, 1)); g2.setAttribute('aBend', new THREE.InstancedBufferAttribute(aB2, 3));
      mir.frustumCulled = false; mir.name = `mushrooms_mirror_${kind}`; group.add(mir);
    }
  });
  return group;
}
// ---------------------------------------------------------------- キノコのにじむ光（加算の板。1 回で描く）：かさのまわりの光 ＋ 地面に落ちる光。キノコと同じ式で明るくなる
export function createShroomGlow(list) {
  const items = [];
  for (const s of list) {
    const K = SHROOM_KINDS[s.kind], capR = K.capR * s.h, cap = capOf(s);
    items.push({ p: cap.toArray(), size: Math.max(0.9, capR * (s.parent ? 3.0 : s.h > 2.2 ? 2.7 : 4.2)), color: s.color, op: s.parent ? 0.13 : s.h > 2.2 ? 0.07 : 0.16, flat: 0, s: s.s, h: s.h });        // かさのまわりのにじみ
    items.push({ p: [s.x, pondDepth(s.x, s.z) > 0.02 ? WL + 0.02 : s.y + 0.03 * s.h + 0.06, s.z], size: Math.max(1.3, capR * (s.parent ? 3.6 : 5.2)), color: s.color, op: s.parent ? 0.26 : 0.16, flat: 1, s: s.s, h: s.h });      // 地面に落ちる光
    if (s.h > 2.4 && !s.parent) items.push({ p: [(s.x + cap.x) / 2, (s.y + cap.y) / 2, (s.z + cap.z) / 2], size: capR * 2.0, color: s.color, op: 0.11, flat: 0, s: s.s, h: s.h });   // 大きなキノコ：かさの下にたまる光
  }
  const n = items.length, geo = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1), aC = new Float32Array(n * 4), aCol = new Float32Array(n * 4), aFx = new Float32Array(n * 3), col = new THREE.Color();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  items.forEach((it, i) => { aC.set([...it.p, it.size], i * 4); col.set(it.color); aCol.set([col.r, col.g, col.b, it.op], i * 4); aFx.set([it.flat, it.s, it.h], i * 3); });
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4)); geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 4)); geo.setAttribute('aFx', new THREE.InstancedBufferAttribute(aFx, 3)); geo.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: { uFpTime: fpU.uFpTime, uFront: vyU.uFront, uVyFoot: fpU.uFoot }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aC, aCol; attribute vec3 aFx; uniform float uFpTime; varying vec2 vP; varying vec4 vCol;
      ${SHROOM_GLOW_GLSL}
      void main(){
        vP = position.xy * 2.0; vCol = aCol;
        vec4 mv;
        if (aFx.x > 0.5) mv = viewMatrix * vec4(aC.xyz + vec3(position.x, 0.0, position.y) * aC.w, 1.0);
        else { mv = viewMatrix * vec4(aC.xyz, 1.0); mv.xy += position.xy * aC.w; }
        vCol.a *= vyShroomGlow(aFx.y, aC.xyz, aFx.z, uFpTime) * exp(mv.z * 0.012);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vP; varying vec4 vCol;
      void main(){ float a = smoothstep(1.0, 0.0, length(vP)); gl_FragColor = vec4(vCol.rgb, a * a * vCol.a); }`,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'mushroom_glow';
  return mesh;
}
// ---------------------------------------------------------------- ただよう光る胞子：カメラのまわりの箱の中を、ゆっくりのぼりながら流れる。谷の中ほど多く、歩いた所ほど明るい。親キノコのかさからも降ってくる
export function createSpores() {
  const n = VALLEY.count.spores, r = rng(101), s = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) s[i] = r();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 4));
  const C = VALLEY.shroomColors, m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime, uPR: fpU.uPR, uFront: vyU.uFront }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aS; uniform float uFpTime, uPR, uFront; varying vec4 vCol;
      ${DEPTH_GLSL}
      void main(){
        float t = uFpTime, own = step(0.66, aS.w); vec3 p;
        if (own < 0.5) {                                             // 谷じゅうをただよう胞子
          vec3 box = vec3(26.0, 8.0, 26.0), base = aS.xyz * box; base.y += t * (0.1 + 0.12 * aS.w); base.x += sin(t * 0.21 + aS.z * 20.0) * 0.8; base.z += cos(t * 0.17 + aS.x * 20.0) * 0.8;
          p = cameraPosition + mod(base - cameraPosition + 0.5 * box, box) - 0.5 * box; p.y += 2.2;
        } else {                                                     // 親キノコのかさの下から、ゆっくり降る胞子
          float ph = fract(t * (0.03 + 0.03 * aS.x) + aS.y), a = aS.x * 6.2832 + t * 0.05, rad = ${glf(VALLEY.parent.h * 0.58)} * sqrt(aS.z);      // ゆっくり回りながら、ふりそそぐ
          p = vec3(${glf(PAR.x)} + cos(a) * rad + sin(t * 0.3 + aS.y * 30.0) * 0.5, ${glf(PARENT_GLOW.y - 0.6)} - ph * ${glf(VALLEY.parent.h * 0.8)}, ${glf(PAR.z)} + sin(a) * rad);
        }
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float dist = -mv.z, wake = 1.0 - smoothstep(uFront - 2.0, uFront + 5.0, -p.z);
        gl_PointSize = clamp((0.035 + 0.05 * aS.x) * (1.0 + 0.7 * own) * 900.0 * uPR / max(dist, 0.5), 1.2 * uPR, 15.0 * uPR);
        float al = (0.16 + 0.84 * wake) * vyDepth(p.z) * (0.45 + 0.55 * sin(t * (0.7 + aS.y * 1.3) + aS.z * 40.0)) * smoothstep(0.3, 1.4, dist) * exp(-dist * 0.035);
        float h = fract(aS.y * 7.7);
        vCol = vec4(mix(h < 0.34 ? ${glc(C[0])} : h < 0.67 ? ${glc(C[2])} : ${glc(C[1])}, ${glc(VALLEY.parent.color)}, own * 0.6), al * mix(0.9, 1.5, own)); }`,
    fragmentShader: `varying vec4 vCol;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = smoothstep(1.0, 0.0, d); a = a * a * vCol.a; if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb + 0.35 * a, a); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 7; pts.name = 'spores';
  return pts;
}

// ---------------------------------------------------------------- 光の地図：キノコ 1 本ずつの色の光を、上から見た 1 枚の画像に描く（かげの計算 fpShade が読む）。ライトを 1 つも増やさずに、まわりが照らされる
export function createLightMap(list) {
  const W = LITE ? 256 : 384, c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * LMAP.d / LMAP.w); const g = c.getContext('2d'), k = W / LMAP.w;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'lighter';
  for (const s of list) {
    const K = SHROOM_KINDS[s.kind], rad = s.parent ? 16 : 1.0 + K.capR * s.h * 3.6, a = s.parent ? 0.85 : clamp(0.26 + s.h * 0.12, 0.3, 0.7);
    const x = (s.x - LMAP.x0) * k, y = (s.z - LMAP.z0) * k, r = rad * k, n = parseInt(s.color.slice(1), 16), rgb = `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.35, `rgba(${rgb},${a * 0.5})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  return tex;
}
// ---------------------------------------------------------------- 足もとの低い霧：道の上にうすくたなびく霧の板（地面のかたむきに合わせて寝かせる。1 回で描く）。奥ほど青むらさき
export function createMistLayer(seed = 67) {
  const n = VALLEY.count.mist, r = rng(seed), geo = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
  const aC = new Float32Array(n * 4), aM = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const z = lerp(-9, -60, (i + r()) / n), x = (z < -P.len ? HX : pathX(z)) + (r() - 0.5) * (z < -P.len ? 11 : 3.4);
    aC.set([x, floorY(z) + 0.28 + r() * 0.5, z, 3.6 + r() * 3.2], i * 4); aM.set([r(), (floorY(z + 0.5) - floorY(z - 0.5))], i * 2);
  }
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4)); geo.setAttribute('aM', new THREE.InstancedBufferAttribute(aM, 2)); geo.instanceCount = n;
  const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime, tNoise: fpU.tNoise, uFront: vyU.uFront }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute vec4 aC; attribute vec2 aM; uniform float uFpTime, uFront; varying vec2 vP; varying vec4 vK;
      ${DEPTH_GLSL}
      void main(){
        vec3 p = aC.xyz + position * aC.w; p.y += aM.y * position.z * aC.w;                               // 道のかたむきに合わせる
        p.x += sin(uFpTime * 0.07 + aM.x * 6.28) * 1.1; p.z += cos(uFpTime * 0.05 + aM.x * 9.0) * 0.9;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float wake = 1.0 - smoothstep(uFront - 2.0, uFront + 6.0, -aC.z);
        vP = position.xz * 2.0; vK = vec4(aM.x * 7.0, smoothstep(22.0, 50.0, -aC.z), vyDepth(aC.z) * (0.45 + 0.55 * wake) * smoothstep(0.6, 3.5, -mv.z) * exp(mv.z * 0.018), 0.0); }`,
    fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime; varying vec2 vP; varying vec4 vK;
      void main(){ float d = length(vP), a = smoothstep(1.0, 0.15, d) * (0.3 + 0.9 * texture2D(tNoise, vP * 0.17 + vK.x + uFpTime * 0.008).g);
        gl_FragColor = vec4(mix(${glc('#8fe6e0')}, ${glc('#a89cff')}, vK.y), a * vK.z * 0.13); }` });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'ground_mist';
  return mesh;
}
// ---------------------------------------------------------------- 親キノコのかさからおりる光のすじ：かさの下をかこむ、うすい光のとばり 2 重（加算。親キノコが明るくなってから見える）
export function createParentVeil() {
  const H = VALLEY.parent.h, K = SHROOM_KINDS[2], y0 = floorY(PAR.z), top = y0 + (K.capY - K.droop) * H - 0.2, group = new THREE.Group(); group.name = 'parent_veil';
  const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime, tNoise: fpU.tNoise, uFront: vyU.uFront }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,      // 内がわの面だけ描く（外から見ても中から見ても 1 枚ぶん。重ね描きをへらす）
    vertexShader: 'varying vec2 vUv; varying float vDist; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime, uFront; varying vec2 vUv; varying float vDist;
      void main(){
        float streak = texture2D(tNoise, vec2(vUv.x * 2.6, uFpTime * 0.012)).g * 0.6 + texture2D(tNoise, vec2(vUv.x * 7.0 + 0.3, vUv.y * 0.3 - uFpTime * 0.02)).r * 0.4;
        float lit = smoothstep(${glf(P.len - 2)}, ${glf(P.len + 5)}, uFront), breath = 0.75 + 0.25 * sin(uFpTime * 0.8);
        float a = pow(vUv.y, 1.5) * smoothstep(0.34, 0.74, streak) * (0.15 + 0.85 * lit) * breath * smoothstep(0.6, 3.0, vDist) * (1.0 - smoothstep(0.96, 1.0, vUv.y));
        gl_FragColor = vec4(mix(${glc(VALLEY.parent.color)}, vec3(1.0), 0.25), a * 0.3); }` });
  for (const [rt, rb] of [[K.capR * H * 0.86, K.capR * H * 1.0], [K.capR * H * 0.45, K.capR * H * 0.62]]) {
    const geo = new THREE.CylinderGeometry(rt, rb, top - y0, 40, 1, true), mesh = new THREE.Mesh(geo, m); mesh.position.set(PAR.x, (top + y0) / 2, PAR.z); mesh.renderOrder = 6; group.add(mesh);
    const mir = new THREE.Mesh(geo, m); mir.position.set(PAR.x, 2 * WL - (top + y0) / 2, PAR.z); mir.scale.y = -1; mir.renderOrder = 1; group.add(mir);      // 水にうつった光のとばり（水面より先に描く）
  }
  return group;
}

// ================================================================ 谷をおおう森
// ---------------------------------------------------------------- まだらな光：入口のあたりだけ（谷の中へは日がとどかない）
export function createDapple(seed = 29) {
  const pools = [];
  kit.createDappleTexture(seed, ({ r, blob, cluster }) => {
    for (const [x, z, rad] of [[0.4, 3.2, 0.75], [-0.6, -0.8, 0.7], [1.6, -3.8, 0.65], [-1.4, -6.6, 0.55], [0.6, -9.6, 0.45]]) { const px = pathX(z) + x; pools.push({ x: px, z, r: rad }); blob(px, z, rad, 1); cluster(px, z, 7, rad * 1.8, 0.28, 0.85); }
    for (let i = 0; i < 70; i++) { const z = lerp(9, -11, r()), k = sstep(z, -12, -3); cluster(pathX(z) + (r() - 0.5) * 16, z, 3 + Math.floor(r() * 7 * k), 0.5 + r() * 0.9, 0.2, 0.8 * k); }
  });
  return { pools };
}
// ---------------------------------------------------------------- 巨木：谷のかべの上と、まわりの森。入口の後ろ（広場へ戻る道）に根のアーチ
export function createValleyTrees(shrooms, seed = 9) {
  const r = rng(seed), mat = kit.createBarkMaterial(), group = new THREE.Group(); group.name = 'giant_trees';
  const geos = [kit.buildGiantTree(11, 1), kit.buildGiantTree(23, 1), kit.buildGiantTree(37, 1), kit.buildGiantTree(51, 0)], list = [];
  const add = (x, z, s, layer) => { const v = layer === 2 ? 3 : Math.floor(r() * 3); list.push({ x, z, s, layer, v, rot: r() * 6.283, y: groundH(x, z) - 0.25, R: geos[v].userData.R0 * s }); };
  const caps = [44, 60, 76], gaps = [3.2, 4.3, 6.2], made = [0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    const x = lerp(-36, 36, r()), z = lerp(-74, 18, r()), sd = walkSd(x, z), layer = sd < 1.0 ? -1 : sd < 3.6 ? 0 : sd < 9.5 ? 1 : sd < 30 ? 2 : -1;
    if (layer < 0 || made[layer] >= caps[layer]) continue;
    const s = layer === 0 ? 0.85 + r() * 0.45 : layer === 1 ? 0.9 + r() * 0.5 : 1.0 + r() * 0.6, rad = 1.5 * s;
    if (sd < rad + 0.3 || Math.hypot(x - PAR.x, z - PAR.z) < 9) continue;
    if (shrooms.some((m) => m.h > 1.4 && Math.hypot(m.x - x, m.z - z) < rad + 0.5)) continue;       // 大きなキノコの場所はあける
    if (list.some((t) => Math.hypot(t.x - x, t.z - z) < gaps[Math.max(layer, t.layer)])) continue;
    add(x, z, s, layer); made[layer]++;
  }
  const anchors = kit.createTreeMeshes(list, geos, mat, group);
  const rootMesh = new THREE.Mesh(kit.buildRoots(list, r, { groundH, low: (x, z) => 1 - sstep(walkSd(x, z), -0.3, 0.5) }), mat); rootMesh.name = 'giant_roots'; group.add(rootMesh);
  const tb = new TubeGeo(), bark = new THREE.Color(VALLEY.trunk.bark), moss = new THREE.Color(VALLEY.trunk.moss), ap = [];      // 広場へ戻る道の目印：根のアーチ
  for (let j = 0; j <= 12; j++) { const u = j / 12, a = Math.PI * u; ap.push(V3(-Math.cos(a) * 2.7 + 0.15 * Math.sin(u * 9), -0.3 + Math.sin(a) * 3.1 + 0.1 * Math.sin(u * 13), VALLEY.backZ - 1.2 + 0.25 * Math.sin(u * 5))); }
  tb.tube(ap, 8, (i) => 0.36 - 0.1 * Math.sin(Math.PI * i / 12) + 0.04 * Math.sin(i * 2.1), (i, th) => bark.clone().lerp(moss, clamp(0.45 + 0.4 * Math.cos(th), 0, 1)));
  const arch = new THREE.Mesh(tb.toGeometry(), mat); arch.name = 'return_arch'; group.add(arch);
  return { group, list, anchors };
}
// ---------------------------------------------------------------- 枝葉：入口はすき間が多く、谷をくだるほど頭の上をとじていく。大きなキノコと親キノコのかさの上にはかぶせない
export function createValleyCanopy(trees, shafts, seed = 12) {
  const r = rng(seed), share = { ceil: 0.34, near: 0.26, mid: 0.2, far: 0.16, bush: 0.04 };
  const all = trees.anchors.map((a) => ({ ...a, g: ['near', 'mid', 'far'][a.layer], w: a.r * a.r, size: a.layer === 2 ? [2.8, 4.0] : [1.6, 2.7], flat: 0.55 }));
  for (let z = -4; z > -62; z -= 0.55) {                             // 谷の真上の天井：奥ほど厚い
    const cx = z < -P.len ? HX : pathX(z), k = depthOf(z);
    all.push({ g: 'ceil', p: V3(cx + (r() - 0.5) * 16, floorY(z) + 7.2 + r() * 3.2 + (z < -P.len + 2 ? 6.5 : 0), z + (r() - 0.5)), r: 2.6 + r() * 0.9, w: 0.25 + k, size: [1.7, 2.8], flat: 0.4 });
  }
  for (let i = 0; i < 70; i++) {
    const z = lerp(6, -60, r()), x = (z < -P.len ? HX : pathX(z)) + (r() - 0.5) * 22, sd = walkSd(x, z);
    if (sd < 0.9 || sd > 7) continue;
    all.push({ g: 'bush', p: V3(x, groundH(x, z) + 0.45 + r() * 0.5, z), r: 0.8 + r() * 0.7, w: 1, size: [0.6, 1.05], flat: 0.5, bush: true });
  }
  const sums = {}; for (const a of all) sums[a.g] = (sums[a.g] || 0) + a.w;
  for (const a of all) a.w *= share[a.g] / sums[a.g];
  return kit.createCanopy(all, { r, count: VALLEY.count.canopy, reject: (p, a) => {
    if (a.bush) return walkSd(p.x, p.z) < 0.5;
    if (p.y < groundH(p.x, p.z) + 3.6) return true;
    const cx = p.z < -P.len ? HX : pathX(clamp(p.z, PATH_Z1, PATH_Z0));
    if (Math.abs(p.x - cx) < 4.5 && p.y < floorY(p.z) + 5.6) return true;                    // 道のすぐ上は、背の高いキノコのぶんをあける
    if (Math.hypot(p.x - PAR.x, p.z - PAR.z) < 9 && p.y < PARENT_GLOW.y + 3.2) return true;   // 親キノコのかさ
    return shafts.some((s) => { const t = p.y / SUN.y; return Math.hypot(p.x - (s.a.x + SUN.x * t), p.z - (s.a.z + SUN.z * t)) < s.r + 0.55; });   // 光の筋の通り道
  } });
}
// ---------------------------------------------------------------- 草花：シダ・草むら（入口のあたり）・光る小さな花（谷の小道ぞいと、くぼ地）
export function createPlants(trees, glow, seed = 35) {
  const r = rng(seed), C = VALLEY.count, mat = kit.createPlantMaterial(), group = new THREE.Group(), dummy = new THREE.Object3D(), col = new THREE.Color(); group.name = 'plants';
  const inTrunk = (x, z) => trees.some((t) => t.layer < 2 && Math.hypot(t.x - x, t.z - z) < t.R * 1.5 + 0.1) || OBST.some((o) => Math.hypot(x - o.x, z - o.z) < o.r) || pondDepth(x, z) > 0.05;
  function place(geo, count, accept, scale, tints, name) {
    const mesh = new THREE.InstancedMesh(geo, mat, count); let made = 0;
    for (let tries = 0; made < count && tries < count * 60; tries++) {
      const z = lerp(7, HZ - HO.r - 6, r()), x = (z < -P.len ? HX : pathX(z)) + (r() - 0.5) * (z < -P.len ? 30 : 20), sd = walkSd(x, z);
      if (r() > accept(sd, z, x) || inTrunk(x, z)) continue;
      const s = lerp(scale[0], scale[1], r());
      dummy.position.set(x, groundH(x, z) - 0.02, z); dummy.rotation.set((r() - 0.5) * 0.16, r() * 6.283, (r() - 0.5) * 0.16); dummy.scale.set(s, s * (0.85 + 0.3 * r()), s); dummy.updateMatrix();
      mesh.setMatrixAt(made, dummy.matrix); mesh.setColorAt(made, col.set(pickOf(r, tints)).multiplyScalar(0.85 + 0.3 * r())); made++;
    }
    mesh.count = made; mesh.frustumCulled = false; mesh.name = name; group.add(mesh);
    return mesh;
  }
  const edge = (sd, lo, hi) => (sd < lo ? 0 : Math.exp(-(sd - lo) / hi));
  place(buildFern(3), C.fern, (sd) => edge(sd, 0.25, 2.8), [0.75, 1.4], ['#ffffff', '#e4f5d8', '#d2f0e4'], 'ferns');
  place(buildTuft(), C.tuft, (sd, z) => edge(sd, 0.1, 3.0) * (1 - depthOf(z)), [0.7, 1.3], ['#ffffff', '#e6f7c8', '#cfeedd'], 'tufts');
  const bells = place(buildBell(5), C.bell, (sd, z) => edge(sd, 0.15, 1.5) * (0.15 + 0.85 * depthOf(z)),
    [0.6, 1.0], ['#9fe8ff', '#b7b0ff', '#8ff5e0', '#d6c8ff'], 'bell_flowers');
  const m4 = new THREE.Matrix4(), ps = new THREE.Vector3();
  for (let i = 0; i < bells.count; i++) { bells.getMatrixAt(i, m4); ps.setFromMatrixPosition(m4); bells.getColorAt(i, col); glow.push({ p: V3(ps.x, ps.y + 0.6, ps.z), size: 0.85, color: `#${col.getHexString()}`, opacity: 0.2 }); }
  return group;
}

// ================================================================ 組み立て
const dapple = createDapple();
const sky = createSky(fpU.tNoise.value, { lite: LITE });           // 空（nature.js）。谷をくだるにつれて、枝葉のすき間の色を暗くしていく
const SKY = (() => { const K = VALLEY.sky, c = (h) => new THREE.Color(h), d = c(K.dark); return { zen: [c(K.zen), d], hor: [c(K.hor), d], low: [c(K.low), c(VALLEY.fog.farCol)], cloud: [c(K.cloud), d], cloudSh: [c(K.cloudSh), d], fog: [c(VALLEY.fog.nearCol), c(VALLEY.fog.nearDark)], deep: c(VALLEY.fog.nearDeep) }; })();
{ const u = sky.u; u.uSunCol.value.set(VALLEY.sky.sun); u.uSunDir.value.copy(SUN); u.uCloudAmt.value = 0.7; u.uSunAmt.value = 1; u.uStars.value = 0; }
function setDepth(k) {                                              // k：0 入口 → 1 谷の中
  const u = sky.u; u.uZen.value.lerpColors(SKY.zen[0], SKY.zen[1], k); u.uHor.value.lerpColors(SKY.hor[0], SKY.hor[1], k); u.uLow.value.lerpColors(SKY.low[0], SKY.low[1], k);
  u.uCloud.value.lerpColors(SKY.cloud[0], SKY.cloud[1], k); u.uCloudSh.value.lerpColors(SKY.cloudSh[0], SKY.cloudSh[1], k); u.uSunAmt.value = 1 - k;
  scene.fog.color.lerpColors(SKY.fog[0], SKY.fog[1], k).lerp(SKY.deep, sstep(-player.z, 24, 46) * 0.85);      // いちばん奥は、霧も青むらさき
  const n = fpU.uNight.value;                                       // 夜：入口の空も、こい青むらさきと星。霧はさらに深い色
  if (n > 0) { const N = NSKY; u.uZen.value.lerp(N.zen, n); u.uHor.value.lerp(N.hor, n); u.uLow.value.lerp(N.low, n); u.uCloud.value.lerp(N.cloud, n); u.uCloudSh.value.lerp(N.cloudSh, n); scene.fog.color.lerp(N.fog, n * 0.85); u.uSunAmt.value *= 1 - 0.45 * n; }
  u.uStars.value = n; u.uSunCol.value.lerpColors(NSKY.sun, NSKY.moon, n);
}
const NSKY = (() => { const K = VALLEY.night, c = (h) => new THREE.Color(h); return { zen: c(K.sky.zen), hor: c(K.sky.hor), low: c(K.sky.low), cloud: c(K.sky.cloud), cloudSh: c(K.sky.cloudSh), fog: c(K.fog.nearCol), sun: c(VALLEY.sky.sun), moon: c(K.sky.moon) }; })();
scene.add(sky.mesh);

const ground = createGround(); scene.add(ground.mesh);
const fieldTex = createFieldTextures(ground);
// 草：ふさふさの短い草（area_kit.js の createTurf）。色 ＝ 根元（地面の式と同じ）・葉のはば・先。?turf=0 で、前のまばらな草（nature.js の createGrass）にもどして見くらべられる
const TURF = { soil: ['#356e5c', '#5a9a6c', 0.3, 0.7, 0.82, 0.36], deep: '#3a8264', light: '#7cc49c', tip: '#b8ecd2' };
const grass = params.get('turf') === '0' ? createGrass({ scale: VALLEY.count.grass, field: fieldTex.field, groundTex: fieldTex.groundTex, map: fieldTex.map })
  : kit.createTurf({ field: fieldTex.field, map: fieldTex.map, ...TURF });
grass.group.children.forEach((m) => addDapple(m.material));
scene.add(grass.group);
const grassSun = { position: SUN.clone(), target: { position: V3(0, 0, 0) }, color: new THREE.Color(L.sun), intensity: 1.1 };
scene.add(createPond());

const shrooms = placeMushrooms();
vyU.tLight.value = createLightMap(shrooms);
scene.add(createMushrooms(shrooms), createShroomGlow(shrooms), createSpores(), createMistLayer(), createParentVeil());

const shafts = kit.createLightShafts(dapple.pools, { groundH, topH: VALLEY.canopyH + 2.5 }); scene.add(shafts.mesh);
const trees = createValleyTrees(shrooms); scene.add(trees.group);
const canopy = createValleyCanopy(trees, shafts.list); scene.add(canopy);
const glowItems = [];
scene.add(createPlants(trees.list, glowItems));
glowItems.push({ p: V3(0, 2.2, VALLEY.backZ + 4.5), size: 9, color: '#fff2d0', opacity: 0.45 }, { p: V3(0, 0.06, VALLEY.backZ + 1.5), size: 7, color: '#fff0c8', opacity: 0.25, flat: true });   // 広場へ戻る道の奥の、日の光
glowItems.push({ p: PARENT_GLOW.clone(), size: 26, color: VALLEY.parent.color, opacity: 0.09 });      // 親キノコの大きなにじみ（遠くからの目印）
scene.add(createGlowCards(glowItems, 'flora_glow'));
// 光の粒（area_kit.js）：入口の光の筋の中のほこり ＋ 谷の青緑のホタル
scene.add((() => {
  const n = VALLEY.count.motes, r = rng(41), pos = new Float32Array(n * 3), sd = new Float32Array(n * 2), gr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const kind = i < n * 0.3 ? 0 : 1, z = kind ? lerp(-8, -60, r()) : lerp(5, -11, r()), x = (z < -P.len ? HX : pathX(z)) + (r() - 0.5) * (kind ? 14 : 8);
    pos.set([x, (kind ? 0.3 : 0.4) + r() * (kind ? 2.6 : 4), z], i * 3); sd.set([r(), kind], i * 2); gr[i] = floorY(z);
  }
  return kit.createMotes({ pos, seed: sd, ground: gr });
})());
scene.add(kit.createButterflies(VALLEY.count.butterflies, (r) => { const z = lerp(-12, -46, r()), x = pathX(z) + (r() - 0.5) * 5; return [x, z, floorY(z) + 0.4]; }, 71));

// ---------------------------------------------------------------- プレイヤー・音・はじまり・エリアの行き来
const player = newPlayer({ pitch: 0.02 });
const controls = createWalkControls(renderer.domElement, player, camera, { stickEl: document.getElementById('stick'), knobEl: document.getElementById('knob') });
// 森や丘より静かに：弱い風、まばらな鳥、静かな低いひびき（谷の中ほど大きい）、水のしずく。キノコが明るくなるとき、小さな鈴のような音
const audio = createAreaAudio({ wind: { g: [0.07, 0.16], lp: [260, 420], hi: [0.003, 0.02], bp: [3200, 900] }, birds: { set: 'forest', vol: [0.008, 0.02], gap: [5, 9] },
  steps: { low: 0.14, thump: 0.12, swish: [0.02, 0.02] }, drips: true,
  tone: { notes: [55.0, 82.41, 110.0, 164.81, 220.0, 329.63], amps: [0.55, 0.5, 0.36, 0.2, 0.12, 0.05], gain: 0.34, lp: [200, 760], chimes: false } });
// 3 人称のエルフ（area_kit.js の createViewWalker）の設定：アニメ影の光の向き ＝ このエリアの太陽
const ELF_TINT = new THREE.Color();
const AVATAR_OPT = { light: SUN.toArray(), tint: () => ELF_TINT.setRGB(1, 1, 1).multiplyScalar(lerp(1, 1.3, depthOf(player.z))),      // うす暗い谷の中でも黒くつぶれないよう、奥ほど少し明るさを足す（色のついた光は、光の地図から受ける）
  blockers: shrooms.filter((s) => s.h > 2.2).map((s) => ({ x: s.x, y: s.y + (SHROOM_KINDS[s.kind].capY + 0.08) * s.h, z: s.z, r: SHROOM_KINDS[s.kind].capR * s.h, ky: 2.2 })) };      // 大きなキノコのかさに、カメラが入らないように
const walker = createViewWalker({ params, scene, addDapple, U: fpU, grass, avatar: AVATAR_OPT, player, controls, camera, constrain, groundH: walkH, eye: VALLEY.eye, speed: VALLEY.speed, onStep: (foot) => (pondDepth(player.x, player.z) > 0.05 ? audio.splash(0.6 + 0.5 * Math.random(), foot ? 0.16 : -0.16) : audio.footstep(foot)),      // 池の中は、水をふむ音
  helpEl: document.getElementById('help') });
wireStart({ params, controls, audio });
const travel = createTravel({ params, controls });                 // 入口の後ろ → 大樹の広場の北西の出口
const dayNight = kit.createDayNight({ params, scene, ownFog: true });      // 昼と夜（空と手前の霧の色は、上の setDepth が谷の深さと合わせて決める）
// 光が道にそって広がる：歩いた所の 6 m 先まで（くぼ地に入ったら、親キノコ → キノコの輪へ順に）。明るくなるキノコごとに、鈴のような音
const CHIME_SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66], chimeList = shrooms.filter((s) => s.chime).sort((a, b) => a.s - b.s);
let chimeI = 0, lastChime = 0;
const frontTarget = () => (player.z < -P.len + 0.5 ? P.len + 18 : Math.max(0, -player.z) + 6);
function updateFront(dt, t) {
  const u = vyU.uFront, target = frontTarget();
  if (target > u.value) u.value = Math.min(target, u.value + dt * (player.z < -P.len + 0.5 ? 3.2 : 7));
  let pending = 0; while (chimeI + pending < chimeList.length && chimeList[chimeI + pending].s < u.value) pending++;
  if (pending > 4) chimeI += pending - 1;                            // いっぺんにたくさん明るくなったとき（場面を切りかえたとき）は鳴らさない
  else if (pending > 0 && t - lastChime > 0.2) { const s = chimeList[chimeI]; audio.chime(CHIME_SCALE[chimeI % CHIME_SCALE.length] * (s.parent ? 0.5 : 1), s.parent ? 0.09 : 0.035, clamp((s.x - player.x) * 0.25, -0.8, 0.8)); chimeI++; lastChime = t; s.rung = t; }
}
// 近づくと鳴る：すぐそばのキノコが、小さな鈴のような音をひとつ（同じキノコは 9 秒あける。大きいキノコほど低い音）
let nearT = -1;
function updateNearChime(t) {
  if (Math.abs(t - nearT) < 0.3) return; nearT = t;
  let best = null, bd = 2.3;
  for (const s of chimeList) { const d = Math.hypot(s.x - player.x, s.z - player.z) - SHROOM_KINDS[s.kind].stemR * s.h; if (d < bd && s.s < vyU.uFront.value) { bd = d; best = s; } }
  if (best && t - (best.rung ?? -99) > 9) { best.rung = t; audio.chime(CHIME_SCALE[chimeList.indexOf(best) % CHIME_SCALE.length] * (best.h > 3 ? 0.5 : 1), 0.022, clamp((best.x - player.x) * 0.3, -0.8, 0.8)); }
}
// 歩いたあとにのこる光と、池の波紋：0.75 m 歩くごとに、足もとの場所と時間をおぼえる（8 つまで。地面と池のシェーダーが読む）
let trailI = 0, trailWalk = 0;
function updateTrail(t) {
  if (player.walk - trailWalk < 0.75) return; trailWalk = player.walk;
  vyU.uTrail.value[trailI].set(player.x, player.z, t, 0); trailI = (trailI + 1) % vyU.uTrail.value.length;
}

// ---------------------------------------------------------------- 確認用：場面・速さ・確認画像
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const VIEWS = {
  A: { x: 0, z: 0.4, yaw: 0.0, pitch: 0.02 },                                                              // 谷の入口
  B: { x: pathX(-21.5), z: -21.5, yaw: yawTo(pathX(-21.5), -21.5, pathX(-28.5), -28.5), pitch: 0.12 },     // キノコの道
  C: { x: HX + 0.6, z: -P.len - 0.6, yaw: yawTo(HX + 0.6, -P.len - 0.6, PAR.x, PAR.z), pitch: 0.2 },       // 奥の親キノコ
};
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
const clock = () => FIXED_T ?? performance.now() / 1000;
function renderFrame(t) {
  if (renderer.domElement.width < 2 || renderer.domElement.height < 2) return;
  windU.uTime.value = fpU.uFpTime.value = t;
  if (frontTarget() > vyU.uFront.value + 12) vyU.uFront.value = frontTarget();      // 場面を切りかえたとき（確認用）は、そこまで光らせておく
  walker.placeCamera(t);
  setDepth(depthOf(player.z));
  renderer.info.reset();
  grass.update(camera, grassSun);
  parentLight.intensity = L.treeI * (0.25 + 0.75 * sstep(vyU.uFront.value, P.len - 4, P.len + 3)) * (1 + 0.06 * Math.sin(t * 0.8));
  composer.render();
}
const tools = createTools({ params, stage, lite: LITE, player, views: VIEWS, constrain, renderFrame, clock });
const PREVIEW = [['A', '谷の入口'], ['B', 'キノコの道'], ['C', '奥の親キノコ']];             // 3 場面の確認画像（横に 3 枚）
// 太陽の魔法陣：浅い池の水の下。上に 2.5 秒立つと開放（localStorage の sunCircle_mushroom に残る。?circle=reset で戻す）。太陽のかけらは、親キノコのかさの外（手前の空）へ、ななめにのぼる
const CIRCLE = { x: HX, z: HZ + VALLEY.circle.dz, r: VALLEY.circle.r };
const circle = createMagicCircle({ scene, position: [CIRCLE.x, WL - 0.05, CIRCLE.z], radius: CIRCLE.r, pattern: 'mushroom', color: '#6fe8ff', color2: '#c59bff', key: SUN_CIRCLE_KEYS.mushroom,
  riseTo: [CIRCLE.x, WL + 16, CIRCLE.z + 8], renderOrder: 3, muted: () => audio.isMuted() });      // renderOrder 3 ＝ いつも水面（2）のあとに描く（カメラの向きで明るさが変わらない）
window.__valley = { render: () => renderFrame(clock()), VALLEY, VIEWS, player, audio, controls, travel, renderer, scene, camera, vyU, shrooms, circle, places: { CIRCLE },
  setView: tools.setView, view: tools.setView, bench: tools.bench, shot: tools.shot, preview: (w = 720, h = 540) => tools.preview(PREVIEW, 3, w, h), constrain, walkSd, groundH, pathX, pondDepth, pond: { x: HX, z: HZ, r: POND.r, y: WL }, frames: 0, errors: [],
  counts: { mushrooms: shrooms.length, giants: trees.list.length, canopy: canopy.count, glow: glowItems.length, shafts: dapple.pools.length, mist: VALLEY.count.mist } };
window.addEventListener('error', (e) => window.__valley.errors.push(String(e.message)));

// ---------------------------------------------------------------- 毎フレーム
function update(dt, t) {
  walker.update(dt);
  if (!travel.busy && player.z > VALLEY.backZ) travel.go('main_plaza.html', 'valley');
  updateFront(dt, t); updateNearChime(t); updateTrail(t);
  circle.update(dt, t, player.x, player.z);
  const k = depthOf(player.z), nearPond = 1 - sstep(Math.hypot(player.x - HX, player.z - HZ), 7, 22);
  audio.update(dt, { t, gust: gustAt(player.x, player.z, t) * (1 - 0.6 * k), prox: 0.2 + 0.8 * k, drip: k * (0.35 + 0.65 * nearPond) });
}
window.__valley.tick = update;                                     // 確認用：1 コマぶん進める
runLoop({ stage, lite: LITE, clock, renderFrame, api: window.__valley, update });
