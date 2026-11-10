// =====================================================================
// ワールド A「水晶の洞くつ」：入口（滝のうら）→ うねる岩のトンネル（浅い水たまりをわたる）→ 奥の大きな水晶の広間（浅い池のまん中の島に、巨大な水晶）
// （エルフで歩くテスト場面。本編にはまだ組みこんでいない。あとで「小川と滝」の滝のうらから入る予定）
// 光・音・操作・エリアの行き来・3 人称のエルフは area_kit.js（ほかのエリアと同じもの）。area_kit.js などの今あるファイルは書きかえていない。
// このファイルは、洞くつだけのもの：
//   形（pathX・halfW・floorY・pondDepth・groundH・ceilH・constrain）
//   createShell（床と天井。2 枚の高さの面が、歩ける所の外で交わって、とじた洞くつになる）・createRockMaterial（岩はだ・地層・ひび・ぬれ・苔・光る鉱脈）
//   水晶：buildCluster（形）・placeCrystals（置き場所の一覧）・createCrystals（一覧 → メッシュ。水面の下に さかさまの写しも置く＝うつりこみ）
//   createLightMap（水晶の色の光を、上から見た 1 枚の画像に描く → 岩・エルフが照らされる）・createWater（浅い水面。波紋・しずくの輪・光のにじみ）
//   createSpikes（つらら石・石じゅん。かたまりで生える）・createStones（足もとのころがった石）・createDrips（天井から落ちるしずく）・createEntrance（入口の、滝のうらの光）
// クオリティアップ（2026-11-10。道すじ・当たり判定・魔法陣とかけらの場所は変えていない）：
//   岩 ＝ かべに大きなうねりと岩だなの段、天井にくぼみとうね。でこぼこに合わせた光の当たり方（水晶のほうを向いた面が明るい）、地層のしま、ぬれた所のつや、水の上の天井にゆらめく水の光
//   水晶 ＝ もとの並びはそのまま、あとから足した（CAVE.count.extra：トンネルの両わき・岩だなの上・天井、広間のおくのかべ、出口の両わき、金色を少し）。芯が明るく ふちが色づく
//   水 ＝ 水面を走る光のあみ目、ゆれるうつりこみ。空気 ＝ 霧をうすく、しずく。エルフ ＝ 暗い所・暗い世界で明るさを足す（AVATAR_OPT.tint）
//   太陽の魔法陣（magic_circle.js の共通部品）：広間の入口と島の間の、浅い水の下（CIRCLE）。真上の天井にすき間があり、太陽のかけらがそこへのぼっていく
// 確認用：?lite=1 ?wc=0 ?shot=1 ?debug=1 ?at=x,z,向き°,上下° ?t=秒   window.__cave.bench() / .view('A'〜'C') / .preview()
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { windU } from './nature.js';
import { createMagicCircle, SUN_CIRCLE_KEYS } from './magic_circle.js';
import { areaParams, clamp, lerp, sstep, V3, rng, vnoise, glf, glc, pickOf,
  createAreaKit, createAreaAudio, createWalkControls, createViewWalker, newPlayer, wireStart, createTravel, createStage, createTools, runLoop } from './area_kit.js';

const { params, LITE } = areaParams();

// ---------------------------------------------------------------- 数値（ここを直せばよい）
export const CAVE = {
  path: { len: 40, halfW: 1.7, swing: 4.2 },                        // トンネル：長さ・歩ける幅の半分・左右へのうねり（m）
  backZ: 5.4,                                                      // 入口の後ろ：ここより奥へ歩くと、小川と滝へ戻る
  drop: 1.6,                                                       // 入口から奥へくだる高さ
  tunnelH: 4.9,                                                    // トンネルの天井の高さ
  hall: { r: 9.5, h: 12.5, island: 3.0 },                          // 奥の広間：歩ける半径・天井の高さ・まん中の島の半径
  pool: { s0: 17, s1: 29, depth: 0.24 },                           // トンネルの途中の水たまり（道のり m）と、水の深さ
  eye: 1.55, speed: 2.5, fov: 70,
  sun: new THREE.Vector3(-0.16, 0.96, -0.22).normalize(),           // 天井のすき間からさす光の向き
  light: { sky: '#a0a8dc', ground: '#4a4468', hemiI: 2.3, sun: '#cfe4ff', tree: '#a8c8ff', treeGlow: 0.2 },
  amb: [0.46, 0.48, 0.6], lightGain: 2.6, elfMax: 0.76,                           // 水晶の光がとどかない所の明るさ・水晶の光の強さ
  night: { tint: [0.8, 0.84, 1.0], glow: 1.15, cards: 1.15, shaft: 0.5, fog: { nearCol: '#101230', midCol: '#1c1c52', farCol: '#2c2a70', glowCol: '#8fb4ff' } },
  fog: { near: 4, far: 50, nearCol: '#14163a', midCol: '#242464', farCol: '#3a3888', glowCol: '#a4c4ff', mist: 0.15, glowAmt: 0.55, glowPow: 3.0 },
  grade: { sat: 1.1, mul: [0.98, 1.0, 1.06], add: [0.0, 0.004, 0.02] },
  dapple: { col: [0.72, 0.88, 1.0], gain: 3.2, map: { x0: -20, z0: -64, w: 34, d: 76 } },
  shaft: { col: '#cfe6ff', amt: 0.6 },
  rock: ['#4c5274', '#989ab8', '#a892b0', '#20223a'], moss: '#4f8f7a', void: '#070818',     // 岩の色（暗い・明るい・地層のしま・暗い層）、光のさす所の苔、水の底の暗い色
  vein: ['#6fe6ff', '#b48cff'],                                    // 岩を走る光る鉱脈
  // 水晶の色：入口に近い所 → 奥 → 広間
  colors: { front: ['#58c8ff', '#6fe6ff', '#7aa8ff'], deep: ['#9a86ff', '#c08cff', '#7aa8ff', '#6fd8ff'], hall: ['#6fd8ff', '#8a9cff', '#b48cff', '#e0a0ff', '#9ff0ff'], giant: '#86bcff' },
  count: LITE
    ? { cell: 0.6, tunnel: 46, ceil: 14, hallCeil: 12, rim: 13, inWater: 6, spikes: 300, motes: 150, stones: 110, drips: 18, extra: { tunnel: 44, ceil: 16, hallCeil: 14, back: 7, gold: 6 } }
    : { cell: 0.42, tunnel: 72, ceil: 26, hallCeil: 22, rim: 18, inWater: 9, spikes: 420, motes: 220, stones: 150, drips: 26, extra: { tunnel: 44, ceil: 14, hallCeil: 12, back: 7, gold: 7 } },      // extra ＝ あとから足した水晶（もとの並びは変えない）
};
const P = CAVE.path, HA = CAVE.hall, PO = CAVE.pool, SUN = CAVE.sun, L = CAVE.light;

// ---------------------------------------------------------------- 形（歩ける所・床と天井の高さ・水の深さ）
export function pathX(z) { const k = clamp(-z / P.len, 0, 1); return P.swing * Math.sin(k * 5.2) * sstep(k, 0, 0.3); }
const pathSlope = (z) => (pathX(z + 0.05) - pathX(z - 0.05)) / 0.1;
const poolK = (z) => sstep(-z, PO.s0 - 2, PO.s0 + 1) * (1 - sstep(-z, PO.s1 - 1, PO.s1 + 2));
export const halfW = (z) => P.halfW + 0.7 * poolK(z) + 0.2 * Math.sin(z * 0.63 + 1);
const CX = pathX(-P.len), CZ = -(P.len + HA.r - 1.0), PATH_Z0 = CAVE.backZ + 1.0, PATH_Z1 = -(P.len + 1.5);       // 広間の中心、トンネルの帯の両はし
export const floorY = (z) => -CAVE.drop * sstep(-z, 4, 15);
const FLOOR = -CAVE.drop, WL = FLOOR - 0.03;                        // 奥の床の高さ・水面の高さ
export function walkSd(x, z) {
  const zc = clamp(z, PATH_Z1, PATH_Z0), sl = pathSlope(zc);
  return Math.min(Math.hypot(x - CX, z - CZ) - HA.r, Math.hypot((x - pathX(zc)) / Math.sqrt(1 + sl * sl), z - zc) - halfW(zc));
}
// 水の深さ（0 ＝ 水なし）：トンネルの途中の水たまり ＋ 広間の池（まん中の島と、まわりの岸は水の上）
export function pondDepth(x, z) {
  const w = (vnoise(x * 0.9 + 4.2, z * 0.9 + 1.7) - 0.5) * 1.3, zz = -z + w;                    // 岸の線は、でこぼこ
  const a = sstep(zz, PO.s0, PO.s0 + 2.5) * (1 - sstep(zz, PO.s1 - 2.5, PO.s1)), r = Math.hypot(x - CX, z - CZ) + w * 0.8;
  const b = sstep(r, HA.island, HA.island + 1.6) * (1 - sstep(r, HA.r - 1.6, HA.r + 0.2));
  return PO.depth * Math.max(a, b);
}
export function groundH(x, z) {
  const sd = walkSd(x, z), r = Math.hypot(x - CX, z - CZ);
  let h = floorY(z) - pondDepth(x, z) + (vnoise(x * 0.8 + 3.1, z * 0.8) - 0.5) * 0.08 + 0.14 * (1 - sstep(r, 1.4, HA.island + 0.4));
  if (sd > 0) {                                                    // 歩ける所の外は、岩かべへ立ち上がる：大きなうねり ＋ 細かいでこぼこ ＋ 段になった岩だな（歩ける所の中の高さは変えない）
    const n = (vnoise(x * 0.7 + 7, z * 0.7) - 0.5) * 0.9 + (vnoise(x * 2.3 + 1, z * 2.3) - 0.5) * 0.45 + (vnoise(x * 0.31 + 2.4, z * 0.31 + 5.1) - 0.5) * 1.5;
    const rise = 0.3 * sd + 0.42 * sd * sd + n * sstep(sd, 0, 1.5), off = 0.5 * vnoise(x * 0.5 + 11, z * 0.5 + 3), q = rise * 1.5 + off, f = q - Math.floor(q);
    h += lerp(rise, (Math.floor(q) + sstep(f, 0.28, 0.6) - off) / 1.5, 0.6 * sstep(sd, 0.25, 1.2));
  }
  return h;
}
// 天井のすき間（光の筋が落ちる所）。r ＝ 日だまりの半径
const POOLS = [[7, 0.3, 0.55], [14, -0.5, 0.7], [23, 0.4, 0.9], [34, -0.2, 0.65]].map(([s, dx, r]) => ({ x: pathX(-s) + dx, z: -s, r }));
POOLS.push({ x: CX, z: CZ, r: 1.7, big: true }, { x: CX - 5.3, z: CZ + 1.6, r: 0.8 }, { x: CX + 4.7, z: CZ - 3.3, r: 0.7 });
const CIRCLE = { x: CX, z: CZ + 6.0, r: 1.4 };                       // 太陽の魔法陣（広間に入ってすぐ、島の手前の水の中）
const CIRCLE_POOL = { x: CIRCLE.x, z: CIRCLE.z, r: 1.0 }; POOLS.push(CIRCLE_POOL);      // 魔法陣の真上の、天井のすき間
function ceil0(x, z) {
  const sd = walkSd(x, z), zc = clamp(z, PATH_Z1, PATH_Z0), k = 1 - sstep(Math.hypot(x - CX, z - CZ), HA.r - 1, HA.r + 4);
  const inner = lerp(halfW(zc), HA.r, k), hc = lerp(CAVE.tunnelH, HA.h, k) * (0.86 + 0.3 * vnoise(x * 0.23 + 9, z * 0.23));
  const u = clamp((sd + inner) / (inner + 2.8), 0, 1.3);
  return floorY(z) + hc * Math.sqrt(Math.max(0, 1 - u * u)) - Math.max(0, u - 1) * 12 + ((vnoise(x * 1.1 + 2, z * 1.1) - 0.5) * 0.8 + (vnoise(x * 2.6 + 5, z * 2.6) - 0.5) * 0.4
    + 2.2 * Math.max(0, vnoise(x * 0.42 + 3.3, z * 0.42 + 8.1) - 0.45)                                   // 上へへこんだ丸いくぼみ
    - 0.28 * Math.pow(Math.abs(Math.sin(z * 0.5 + 2.6 * vnoise(x * 0.25 + 1, z * 0.25 + 6))), 5)) * (1 - sstep(u, 0.85, 1));      // 天井を横切る、岩のうね
}
for (const p of POOLS) { const y = ceil0(p.x, p.z); p.ax = p.x + SUN.x / SUN.y * y; p.az = p.z + SUN.z / SUN.y * y; p.top = y; }      // すき間の場所（光の筋が天井を通る所）
export function ceilH(x, z) {
  let c = ceil0(x, z);
  for (const p of POOLS) { const d2 = (x - p.ax) ** 2 + (z - p.az) ** 2, rr = p.r + 0.55; if (d2 < rr * rr * 9) c += (p.big ? 9 : 6) * Math.exp(-d2 / (rr * rr)); }      // すき間は、上へぬける
  return c;
}
const OBST = [];                                                    // 入れない所（大きな水晶）
export function constrain(x, z) {
  const inPath = (px, pz) => pz <= PATH_Z0 && pz >= PATH_Z1 && Math.abs(px - pathX(pz)) <= halfW(pz);
  const dx = x - CX, dz = z - CZ, d = Math.hypot(dx, dz);
  if (d > HA.r && !inPath(x, z)) {
    const zc = clamp(z, PATH_Z1, PATH_Z0), cx = pathX(zc), hw = halfW(zc), ax = clamp(x, cx - hw, cx + hw), bx = CX + dx / d * HA.r, bz = CZ + dz / d * HA.r;
    if (Math.hypot(ax - x, zc - z) <= Math.hypot(bx - x, bz - z)) { x = ax; z = zc; } else { x = bx; z = bz; }
  }
  for (const o of OBST) { const ox = x - o.x, oz = z - o.z, od = Math.hypot(ox, oz); if (od < o.r) { const k = o.r / Math.max(od, 1e-4); x = o.x + ox * k; z = o.z + oz * k; } }
  return [x, z];
}

// ---------------------------------------------------------------- 共通の部品（area_kit.js）と three.js の準備
const MAP = CAVE.dapple.map;                                        // 光の地図・水の深さの画像がおおう範囲（まだらな光の画像と同じ）
const CC_UV = `vec2 ccUV(vec2 xz){ return (xz - vec2(${glf(MAP.x0)}, ${glf(MAP.z0)})) / vec2(${glf(MAP.w)}, ${glf(MAP.d)}); }`;
const ccU = { tCcLight: { value: null }, tCcDepth: { value: null }, uCcFoot: { value: new THREE.Vector3(0, 0, 0) }, uCcEntrance: { value: 1 },
  uCcWave: { value: new THREE.Vector4(0, 0, 0, 0) }, uCcGold: { value: 0 }, uCcPiece: { value: new THREE.Vector3(0, 0, 0) } };      // uCcPiece ＝ かけらが待っている場所（x, z）と、そのまわりで水の輪を出さない半径（0 ＝ どこでも出す）      // 魔法陣の開放：広がる光の波（中心 x, z・半径・強さ）と、水晶がいっせいに金色に明滅する強さ
const HALL_GLOW = V3(CX, FLOOR + 4, CZ);                            // 巨大な水晶（霧がこの方向だけ青白く明るい）
const kit = createAreaKit({ ...CAVE, lite: LITE, glowPos: HALL_GLOW,
  // かげの明るさ：水晶の色の光（上から見た光の地図）＋ 暗い所の明るさ。岩・つらら石・エルフに掛かる
  shadeGLSL: `uniform sampler2D tCcLight; ${CC_UV}
    vec3 fpShade(vec3 wp){ vec3 lm = texture2D(tCcLight, ccUV(wp.xz)).rgb;
      return vec3(${CAVE.amb.map(glf).join(', ')}) + lm * ${glf(CAVE.lightGain)} * (0.86 + 0.14 * sin(uFpTime * 0.8 + wp.x * 0.5 + wp.z * 0.4)); }`,
  shadeUniforms: () => ({ tCcLight: ccU.tCcLight }) });
const fpU = kit.U, { addDapple, createGlowCards } = kit;
kit.installFog();
const stage = createStage({ params, U: fpU, fov: CAVE.fov, background: CAVE.fog.farCol, fog: CAVE.fog, far: 160, grade: CAVE.grade });
const { renderer, scene, camera, composer } = stage;
scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemiI));

// ================================================================ 岩
// ---------------------------------------------------------------- 岩のマテリアル：色むら・横しまの地層・ひび・水ぎわのぬれ・光のさす所の苔 ＋ ほのかに光る鉱脈。水の深い所の床は描かない（暗い水ごしに、さかさまの水晶が見える）
function createRockMaterial(side) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', side });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tCc = fpU.tNoise; sh.uniforms.tCcDepth = ccU.tCcDepth;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tCc, tCcDepth; float ccD, ccHgt, ccWet;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 wp = vFogWorld;
        float n1 = texture2D(tCc, wp.xz * 0.05 + wp.y * 0.031).g;
        float n2 = 0.5 * (texture2D(tCc, wp.xy * 0.19).r + texture2D(tCc, wp.zy * 0.19 + 0.37).r), n3 = 0.5 * (texture2D(tCc, wp.xy * 1.2).b + texture2D(tCc, wp.zy * 1.2 + 0.2).b);
        float strata = texture2D(tCc, vec2(0.37 + n1 * 0.08, wp.y * 0.2 + n1 * 0.3)).r;                              // 横しまの地層
        float band = smoothstep(0.46, 0.6, strata), dark = 1.0 - smoothstep(0.3, 0.44, strata);
        vec3 rock = mix(${glc(CAVE.rock[0])}, ${glc(CAVE.rock[1])}, smoothstep(0.3, 0.7, n2));
        rock = mix(rock, ${glc(CAVE.rock[2])}, band * 0.75); rock = mix(rock, ${glc(CAVE.rock[3])}, dark * 0.6);         // 明るいしまと、暗い層
        rock *= (0.45 + 1.1 * n3) * (0.68 + 0.7 * smoothstep(0.3, 0.7, n1));                                           // 明るい所と暗い所の差
        float crack = 0.5 * (texture2D(tCc, wp.xy * 0.1 + 0.11).g + texture2D(tCc, wp.zy * 0.1 + 0.53).g);
        float crack2 = 0.5 * (texture2D(tCc, wp.xz * 0.33 + 0.7).g + texture2D(tCc, wp.zy * 0.33 + wp.x * 0.33).g);
        float ck = 1.0 - smoothstep(0.004, 0.034, abs(crack - 0.5)), ck2 = 1.0 - smoothstep(0.004, 0.04, abs(crack2 - 0.5));
        rock *= (1.0 - 0.48 * ck) * (1.0 - 0.3 * ck2);                                                                // ひび（大・小）
        float wetK = 1.0 - smoothstep(${glf(WL + 0.05)}, ${glf(WL + 0.75)}, wp.y);
        rock *= mix(1.0, 0.6, wetK);                                                                                    // 水ぎわは、ぬれて暗い
        float moss = smoothstep(0.1, 0.4, fpDapple(wp)) * smoothstep(0.3, 0.55, n2 + 0.3 * n3) * (1.0 - smoothstep(0.6, 2.4, wp.y - ${glf(FLOOR)}));
        rock = mix(rock, ${glc(CAVE.moss)} * (0.7 + 0.6 * n3), moss * 0.75);                                            // 光のさす所には、苔
        ccHgt = n2 * 0.5 + n3 * 0.22 + band * 0.2 - dark * 0.12 - ck * 0.16 - ck2 * 0.08;                                // でこぼこの高さ（光の当たり方に使う）
        ccWet = clamp(wetK * 0.9 + 0.55 * smoothstep(0.5, 0.68, n1), 0.0, 1.0);                                         // ぬれた所（水ぎわ ＋ しみ出した所）
        ccD = wp.y < ${glf(WL + 0.02)} ? texture2D(tCcDepth, ccUV(wp.xz)).r : 0.0;
        if (ccD > 0.5) discard;                                                                                         // 水の深い所の床は描かない
        diffuseColor.rgb = mix(rock, ${glc(CAVE.void)}, smoothstep(0.06, 0.5, ccD)); }`);
  };
  m.customProgramCacheKey = () => 'caveRock2';
  addDapple(m);
  const shaded = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    shaded.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ vec3 wp = vFogWorld;
        // 岩のでこぼこ：面の向きを、でこぼこの高さでかたむける。光は「水晶の光の地図」の明るいほうから来る ＝ 水晶に向いた面が明るく、うらが暗い
        vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz), sx = dFdx(wp), sy = dFdy(wp), r1 = cross(sy, nW), r2 = cross(nW, sx);
        float det = dot(sx, r1); vec3 nB = normalize(abs(det) * nW - 0.34 * sign(det) * (dFdx(ccHgt) * r1 + dFdy(ccHgt) * r2));
        vec2 luv = ccUV(wp.xz), le = vec2(${glf(0.7 / MAP.w)}, ${glf(0.7 / MAP.d)}); vec3 lmc = texture2D(tCcLight, luv).rgb;
        float l0 = dot(lmc, vec3(0.333)), lx = dot(texture2D(tCcLight, luv + vec2(le.x, 0.0)).rgb, vec3(0.333)), lz = dot(texture2D(tCcLight, luv + vec2(0.0, le.y)).rgb, vec3(0.333));
        vec3 Ld = normalize(vec3(lx - l0, 0.0, lz - l0) * 16.0 + vec3(0.0, 0.32, 0.0));
        outgoingLight *= 0.5 + 1.25 * max(dot(nB, Ld), 0.0) + 0.3 * (0.5 + 0.5 * nB.y);
        vec3 vv = normalize(cameraPosition - wp);                                                                       // ぬれた所のつや（水晶の色で光る）
        outgoingLight += kfGlow(lmc * 1.6 + 0.05) * pow(max(dot(reflect(-vv, normalize(nW + nB)), Ld), 0.0), 12.0) * ccWet * 0.3 * (1.0 - smoothstep(0.0, 0.3, ccD));
        // 水のゆらめく光（水面の上の天井と、水ぎわのかべ）
        float hy = wp.y - ${glf(WL)}, wk = max(texture2D(tCcDepth, luv).r, texture2D(tCcDepth, ccUV(wp.xz + nW.xz * 1.6)).r) * smoothstep(0.05, 0.5, hy) * (1.0 - smoothstep(2.5, 7.0, hy));
        if (wk > 0.02) { vec2 cq = wp.xz * 0.5 + wp.y * 0.3; float c1 = texture2D(tCc, cq + vec2(uFpTime * 0.027, uFpTime * 0.019)).r, c2 = texture2D(tCc, cq * 1.6 - vec2(uFpTime * 0.022, -uFpTime * 0.031)).g;
          outgoingLight += kfGlow(lmc * 1.4 + vec3(0.1, 0.17, 0.26)) * pow(1.0 - smoothstep(0.0, 0.17, abs(c1 - c2)), 2.0) * wk * 0.13; }
        float v1 = 0.5 * (texture2D(tCc, wp.xy * 0.07 + 0.3).a + texture2D(tCc, wp.zy * 0.07 + 0.6).a);
        float vein = (1.0 - smoothstep(0.0, 0.006, abs(v1 - 0.5) - 0.002)) * smoothstep(0.56, 0.7, texture2D(tCc, wp.xz * 0.031 + wp.y * 0.02 + 0.5).g);
        vec3 vc = mix(${glc(CAVE.vein[0])}, ${glc(CAVE.vein[1])}, smoothstep(0.38, 0.62, texture2D(tCc, wp.xz * 0.021).r));
        outgoingLight += kfGlow(vc) * vein * (0.55 + 0.45 * sin(uFpTime * 0.7 + wp.x * 0.8 + wp.z * 0.6)) * 0.32 * (1.0 - smoothstep(0.0, 0.3, ccD));      // 光る鉱脈
      }\n#include <opaque_fragment>`);
  };
  return m;
}
// ---------------------------------------------------------------- 床と天井：同じ格子の、2 枚の高さの面。歩ける所の外で床が立ち上がり、天井がさがって交わる ＝ とじた洞くつ。岩の中にうまる三角は作らない
export function createShell() {
  const X0 = MAP.x0 + 1, X1 = MAP.x0 + MAP.w - 1, Z0 = MAP.z0 + 1, Z1 = MAP.z0 + MAP.d - 1, cell = CAVE.count.cell;
  const nx = Math.round((X1 - X0) / cell), nz = Math.round((Z1 - Z0) / cell), fl = new Float32Array((nx + 1) * (nz + 1)), ce = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = X0 + i / nx * (X1 - X0), z = Z0 + j / nz * (Z1 - Z0), k = j * (nx + 1) + i; fl[k] = groundH(x, z); ce[k] = Math.max(ceilH(x, z), fl[k] - 0.6); }
  function build(hs, keep) {
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i; pos.set([X0 + i / nx * (X1 - X0), hs[k], Z0 + j / nz * (Z1 - Z0)], k * 3); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (![a, b, c, d].some(keep)) continue;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
  const floor = new THREE.Mesh(build(fl, (k) => fl[k] < ce[k] + 0.6), createRockMaterial(THREE.FrontSide)); floor.name = 'cave_floor';
  const ceil = new THREE.Mesh(build(ce, (k) => ce[k] > fl[k] - 0.25), createRockMaterial(THREE.BackSide)); ceil.name = 'cave_ceiling';
  floor.frustumCulled = ceil.frustumCulled = false;
  return { floor, ceil };
}
// ---------------------------------------------------------------- つらら石（天井からさがる）と石じゅん（床から立つ）。1 回で描く
export function createSpikes(mat, crystals, seed = 33) {
  const r = rng(seed), n = CAVE.count.spikes, g = new THREE.CylinderGeometry(0.015, 0.17, 1, 7, 5), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {                              // 根元が広がり、少しでこぼこした円すい（先が上）
    const t = p.getY(i) + 0.5, a = Math.atan2(p.getZ(i), p.getX(i)), k = (1 + 0.9 * Math.pow(1 - t, 3)) * (1 + 0.22 * (vnoise(a * 1.3 + 5, t * 4) - 0.5) * (1 - t));
    p.setXYZ(i, p.getX(i) * k + 0.03 * Math.sin(t * 7), t - 0.14, p.getZ(i) * k + 0.03 * Math.cos(t * 5));
  }
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(g, mat, n), dummy = new THREE.Object3D(); let made = 0;
  function put(x, z, down, len) {
    const sd = walkSd(x, z);
    if (down) {                                                    // つらら石
      if (sd > 1.4 || POOLS.some((q) => Math.hypot(x - q.ax, z - q.az) < q.r * 2 + 1.2)) return;
      const c = ceilH(x, z); if (c - len < groundH(x, z) + (sd < 0.35 ? 2.9 : 0.9)) return;      // 歩く所の上は、頭の上をあける。かべぎわは低くてもよい
      const w = (0.8 + r() * 1.1) * (0.75 + 0.4 * len);
      dummy.position.set(x, c + 0.05, z); dummy.rotation.set(Math.PI + (r() - 0.5) * 0.14, r() * 6.283, (r() - 0.5) * 0.14); dummy.scale.set(w, len, w);
    } else {                                                       // 石じゅん（歩ける所の外。魔法陣のまわりには立てない ＝ 演出のカメラのじゃまをしない）
      if (sd < 0.3 || sd > 1.9 || z > 4 || Math.hypot(x - CIRCLE.x, z - CIRCLE.z) < 5) return;
      if (crystals.some((q) => !q.ceil && Math.hypot(q.x - x, q.z - z) < 0.3 + 0.35 * q.s)) return;
      const w = (0.9 + r() * 1.3) * (0.8 + 0.4 * len);
      dummy.position.set(x, groundH(x, z), z); dummy.rotation.set((r() - 0.5) * 0.14, r() * 6.283, (r() - 0.5) * 0.14); dummy.scale.set(w, len, w);
    }
    dummy.updateMatrix(); mesh.setMatrixAt(made++, dummy.matrix);
  }
  for (let tries = 0; made < n && tries < n * 30; tries++) {      // 1 か所に 1〜5 本：長い 1 本のまわりに、短いのがよりそう
    const x = lerp(MAP.x0 + 2, MAP.x0 + MAP.w - 2, r()), z = lerp(CZ - HA.r - 3, 6, r()), down = r() < 0.6, hall = Math.hypot(x - CX, z - CZ) < HA.r;
    const group = 1 + Math.floor(r() * r() * 5), len0 = down ? (0.5 + r() * r() * 2.3) * (hall ? 1.7 : 1) : 0.35 + r() * r() * 1.7;
    for (let k = 0; k < group && made < n; k++) { const a = r() * 6.283, d = k === 0 ? 0 : 0.22 + r() * 0.5; put(x + Math.cos(a) * d, z + Math.sin(a) * d, down, len0 * (k === 0 ? 1 : 0.3 + 0.5 * r())); }
  }
  mesh.count = made; mesh.frustumCulled = false; mesh.name = 'spikes';
  return mesh;
}
// ---------------------------------------------------------------- 足もとのころがった石（道のはし・かべぎわ。岩と同じマテリアル。1 回で描く）
export function createStones(mat, crystals, seed = 71) {
  const r = rng(seed), n = CAVE.count.stones, g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.74 + 0.55 * vnoise(x * 1.7 + 3 + z * 0.9, y * 1.7 + z * 1.3 + 8); p.setXYZ(i, x * k, y * k * 0.62, z * k); }
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(g, mat, n), dummy = new THREE.Object3D(); let made = 0;
  for (let tries = 0; made < n && tries < n * 40; tries++) {
    const x = lerp(MAP.x0 + 2, MAP.x0 + MAP.w - 2, r()), z = lerp(CZ - HA.r - 2, 4.5, r()), sd = walkSd(x, z);
    if (sd < -0.18 || sd > 1.1 || pondDepth(x, z) > 0.1 || Math.hypot(x - CIRCLE.x, z - CIRCLE.z) < 5) continue;
    const s = sd < 0.05 ? 0.08 + r() * 0.1 : 0.12 + r() * r() * 0.5;
    if (crystals.some((q) => !q.ceil && Math.hypot(q.x - x, q.z - z) < 0.2 + 0.3 * q.s + s)) continue;
    dummy.position.set(x, groundH(x, z) + s * 0.18, z); dummy.rotation.set((r() - 0.5) * 0.5, r() * 6.283, (r() - 0.5) * 0.5); dummy.scale.set(s * (0.8 + r() * 0.6), s * (0.7 + r() * 0.6), s * (0.8 + r() * 0.6));
    dummy.updateMatrix(); mesh.setMatrixAt(made++, dummy.matrix);
  }
  mesh.count = made; mesh.frustumCulled = false; mesh.name = 'stones';
  return mesh;
}
// ---------------------------------------------------------------- 天井から水面へ落ちるしずく（光の点。1 回で描く）
export function createDrips(seed = 91) {
  const r = rng(seed), n = CAVE.count.drips, pos = new Float32Array(n * 3), sd = new Float32Array(n * 3); let made = 0;
  for (let tries = 0; made < n && tries < 4000; tries++) {
    const x = lerp(MAP.x0 + 2, MAP.x0 + MAP.w - 2, r()), z = lerp(CZ - HA.r, -PO.s0, r()); if (pondDepth(x, z) < 0.08) continue;
    const top = Math.min(ceilH(x, z) - 0.2, WL + 9); pos.set([x, top, z], made * 3); sd.set([r(), 0.16 + 0.14 * r(), top - WL], made * 3); made++;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 3)); g.setDrawRange(0, made);
  const m = new THREE.ShaderMaterial({ uniforms: { uFpTime: fpU.uFpTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 aSeed; uniform float uFpTime; varying float vA;
      void main(){ float ph = fract(uFpTime * aSeed.y + aSeed.x * 7.0), fall = clamp((ph - 0.35) / 0.65, 0.0, 1.0); vec3 q = position; q.y -= fall * fall * aSeed.z;      // しばらく ぶらさがってから、だんだん速く落ちる
        vec4 mv = modelViewMatrix * vec4(q, 1.0); gl_Position = projectionMatrix * mv; vA = smoothstep(0.0, 0.3, ph) * (1.0 - smoothstep(0.97, 1.0, fall)); gl_PointSize = clamp(46.0 / max(0.5, -mv.z), 1.5, 7.0); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = max(0.0, 1.0 - length(vec2(c.x * 3.2, c.y)) * 2.0); gl_FragColor = vec4(vec3(0.72, 0.9, 1.0) * a * a * vA * 0.9, 1.0); }` });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 5; pts.name = 'drips';
  return pts;
}

// ================================================================ 水晶
const mat4 = (x, y, z, s = 1, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), V3(s, s, s));
// ---------------------------------------------------------------- 水晶のかたまり 1 つぶんの形：六角の柱（先がとがる）が、まん中の 1 本のまわりに、ななめに生える。高さ 1 が基準。面ごとに平らな かげ
export function buildCluster(seed) {
  const r = rng(seed), parts = [], n = 5 + Math.floor(r() * 3), a0 = r() * 6.283;
  for (let i = 0; i < n; i++) {
    const main = i === 0, h = main ? 1 : 0.32 + r() * 0.5, rad = h * (0.1 + r() * 0.05) + 0.025, tip = 0.2 + r() * 0.14;
    const body = new THREE.CylinderGeometry(rad * 0.8, rad, h * (1 - tip), 6, 1, true).toNonIndexed(); body.translate(0, h * (1 - tip) / 2, 0);
    const cone = new THREE.ConeGeometry(rad * 0.8, h * tip, 6, 1, true).toNonIndexed(); cone.translate(rad * 0.25 * (r() - 0.5), h * (1 - tip) + h * tip / 2, rad * 0.25 * (r() - 0.5));
    const g = mergeGeometries([body, cone]), py = g.attributes.position, aH = new Float32Array(py.count);
    for (let k = 0; k < py.count; k++) aH[k] = py.getY(k) / h;
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1)); g.deleteAttribute('uv');
    const az = a0 + i / (n - 1) * 6.283 + (r() - 0.5) * 0.7, tilt = main ? 0.08 + r() * 0.1 : 0.28 + r() * 0.55, out = main ? 0 : 0.05 + r() * 0.06;
    g.applyMatrix4(mat4(Math.cos(az) * out, -0.06, -Math.sin(az) * out, 1, az, 0, -tilt));
    parts.push(g);
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
// ---------------------------------------------------------------- 水晶の置き場所の一覧 [{ x, y, z, s（高さ m）, rot, tx, tz（かたむき）, color, v（形の番号）, ceil（天井から生える）, mirror（水面にうつす）, note（近づくと鳴る音）}]
export function placeCrystals(seed = 11) {
  const r = rng(seed), C = CAVE.count, K = CAVE.colors, list = [], scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
  const nearWater = (x, z, rad) => { for (let k = 0; k < 8; k++) for (const d of [0, 0.5, 1]) if (pondDepth(x + Math.cos(k * 0.785) * rad * d, z + Math.sin(k * 0.785) * rad * d) > 0.02) return true; return false; };
  const add = (o) => { const q = { rot: r() * 6.283, tx: (r() - 0.5) * 0.3, tz: (r() - 0.5) * 0.3, v: Math.floor(r() * 3), ceil: false, note: scale[list.length % scale.length], ...o };
    q.mirror = q.mirror ?? (q.ceil ? pondDepth(q.x, q.z) > 0.02 : nearWater(q.x, q.z, 2.2 + q.s)); list.push(q); return q; };
  const free = (x, z, s) => !list.some((q) => !q.ceil && Math.hypot(q.x - x, q.z - z) < 0.3 * (q.s + s) + 0.25);
  // トンネルの両わき（奥ほど多く、大きい）
  for (let made = 0, tries = 0; made < C.tunnel && tries < 4000; tries++) {
    const z = lerp(3.5, -P.len - 0.5, r()), dens = 0.16 + 0.84 * sstep(-z, 1, 24) + 0.4 * poolK(z); if (r() > dens) continue;
    const side = r() < 0.5 ? -1 : 1, sl = pathSlope(z), x = pathX(z) + side * (halfW(z) + 0.12 + r() * 0.95) * Math.sqrt(1 + sl * sl), s = (0.32 + r() * r() * 1.1) * (0.75 + 0.55 * sstep(-z, 0, 34));
    if (walkSd(x, z) < 0.1 || !free(x, z, s)) continue;
    add({ x, z, y: groundH(x, z) - 0.07 * s, s, color: pickOf(r, r() < sstep(-z, 6, 30) ? K.deep : K.front) }); made++;
  }
  // トンネルの天井
  for (let made = 0, tries = 0; made < C.ceil && tries < 2000; tries++) {
    const z = lerp(0, -P.len, r()); if (r() > 0.25 + 0.75 * sstep(-z, 4, 24)) continue;
    const x = pathX(z) + (r() - 0.5) * 2.4 * halfW(z); if (POOLS.some((q) => Math.hypot(x - q.ax, z - q.az) < q.r * 2 + 1)) continue;
    add({ x, z, y: ceilH(x, z) + 0.1, s: 0.4 + r() * 0.8, ceil: true, color: pickOf(r, z < -18 ? K.deep : K.front) }); made++;
  }
  // 広間：まん中の島の巨大な水晶
  add({ x: CX, z: CZ, y: groundH(CX, CZ) - 0.3, s: 5.4, v: 0, rot: 0.6, tx: 0.03, tz: -0.05, color: CAVE.colors.giant, giant: true, mirror: true });
  add({ x: CX + 0.75, z: CZ - 0.35, y: groundH(CX, CZ) - 0.3, s: 3.5, v: 1, rot: 2.4, tx: -0.12, tz: 0.2, color: '#a890ff', giant: true, mirror: true });
  add({ x: CX - 0.6, z: CZ + 0.5, y: groundH(CX, CZ) - 0.3, s: 2.6, v: 2, rot: 4.4, tx: 0.2, tz: -0.16, color: '#7fd4ff', giant: true, mirror: true });
  OBST.push({ x: CX, z: CZ, r: 1.75 });
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + 0.3, d = 1.75 + r() * 0.55, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d; add({ x, z, y: groundH(x, z) - 0.05, s: 0.5 + r() * 0.8, color: pickOf(r, K.hall), mirror: true }); }
  // 広間のふちの岸（トンネルの出口の向き＝ +z の側はあける）
  for (let k = 0; k < C.rim; k++) {
    const a = k / C.rim * 6.283 + (r() - 0.5) * 0.2; if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue;
    const d = HA.r + 0.25 + r() * 1.1, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d, s = 1.2 + r() * 2.3;
    add({ x, z, y: groundH(x, z) - 0.1 * s, s, color: pickOf(r, K.hall), mirror: true });
  }
  // 池の中に立つ水晶（入口から島へのまっすぐな道はあける）
  for (let made = 0, tries = 0; made < C.inWater && tries < 400; tries++) {
    const a = r() * 6.283; if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.55) continue;
    const d = lerp(HA.island + 2.0, HA.r - 2.4, r()), x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d, s = 0.8 + r() * 1.0;
    if (list.some((q) => !q.ceil && Math.hypot(q.x - x, q.z - z) < 2.6)) continue;
    add({ x, z, y: groundH(x, z) - 0.05, s, color: pickOf(r, K.hall), mirror: true }); OBST.push({ x, z, r: 0.22 * s + 0.3 }); made++;
  }
  // 広間の天井
  for (let made = 0, tries = 0; made < C.hallCeil && tries < 1000; tries++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * (HA.r + 0.5), x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
    if (POOLS.some((q) => Math.hypot(x - q.ax, z - q.az) < q.r * 2 + 1.3)) continue;
    add({ x, z, y: ceilH(x, z) + 0.15, s: 0.8 + r() * 1.5, ceil: true, color: pickOf(r, K.hall) }); made++;
  }
  // ---- ここから下は、あとから足した水晶（クオリティアップ）。上の並び・当たり判定（OBST）は変えない。池の中と、魔法陣のまわり 5 m（演出のカメラが通る所）には足さない
  const X = C.extra, farC = (x, z) => Math.hypot(x - CIRCLE.x, z - CIRCLE.z) > 5;
  // トンネル：両わき（入口の近くにも）と、かべの少し高い岩だなの上
  for (let made = 0, tries = 0; made < X.tunnel && tries < 4000; tries++) {
    const z = lerp(3.0, -P.len - 0.5, r()), side = r() < 0.5 ? -1 : 1, sl = pathSlope(z), up = r() < 0.45;
    const x = pathX(z) + side * (halfW(z) + (up ? 0.9 + r() * 1.1 : 0.15 + r() * 0.8)) * Math.sqrt(1 + sl * sl), s = up ? 0.3 + r() * 0.6 : 0.22 + r() * r() * 0.8;
    if (walkSd(x, z) < 0.12 || !free(x, z, s) || !farC(x, z)) continue;
    add({ x, z, y: groundH(x, z) - 0.07 * s, s, color: pickOf(r, r() < sstep(-z, 6, 30) ? K.deep : K.front) }); made++;
  }
  for (let made = 0, tries = 0; made < X.ceil && tries < 2000; tries++) {      // トンネルの天井
    const z = lerp(0, -P.len, r()), x = pathX(z) + (r() - 0.5) * 2.6 * halfW(z); if (POOLS.some((q) => Math.hypot(x - q.ax, z - q.az) < q.r * 2 + 1)) continue;
    add({ x, z, y: ceilH(x, z) + 0.1, s: 0.35 + r() * 0.7, ceil: true, color: pickOf(r, z < -18 ? K.deep : K.front) }); made++;
  }
  for (let made = 0, tries = 0; made < X.hallCeil && tries < 1000; tries++) {      // 広間の天井
    const a = r() * 6.283, d = Math.sqrt(r()) * (HA.r + 1.5), x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
    if (POOLS.some((q) => Math.hypot(x - q.ax, z - q.az) < q.r * 2 + 1.3)) continue;
    add({ x, z, y: ceilH(x, z) + 0.15, s: 0.7 + r() * 1.3, ceil: true, color: pickOf(r, K.hall) }); made++;
  }
  for (let k = 0; k < X.back; k++) {                               // 広間のおくのかべ（入口の正面）：巨大な水晶の後ろに、大きな水晶がならぶ
    const a = -Math.PI / 2 + (k / (X.back - 1) - 0.5) * 2.3 + (r() - 0.5) * 0.14, d = HA.r + 1.3 + r() * 0.9, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d, s = 2.6 + r() * 2.0;
    if (free(x, z, s)) add({ x, z, y: groundH(x, z) - 0.1 * s, s, color: pickOf(r, K.hall) });
  }
  for (const sg of [-1, 1]) { const a = Math.PI / 2 + sg * 0.56, d = HA.r + 0.6, x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;      // トンネルの出口の両わき：広間の入口をふちどる 2 本
    if (free(x, z, 2.6)) add({ x, z, y: groundH(x, z) - 0.26, s: 2.6, color: sg < 0 ? '#7fd4ff' : '#a890ff' }); }
  for (let made = 0, tries = 0; made < X.gold && tries < 1500; tries++) {      // 金色の小さな水晶を、所どころに（太陽のかけら・魔法陣と同じ色）
    const z = lerp(-8, -P.len - 0.5, r()), side = r() < 0.5 ? -1 : 1, sl = pathSlope(z), x = pathX(z) + side * (halfW(z) + 0.2 + r() * 0.9) * Math.sqrt(1 + sl * sl), s = 0.3 + r() * 0.3;
    if (walkSd(x, z) < 0.12 || !free(x, z, s) || !farC(x, z) || list.some((q) => q.gold && Math.abs(q.z - z) < 3.5)) continue;
    add({ x, z, y: groundH(x, z) - 0.07 * s, s, color: '#ffc860', gold: true }); made++;
  }
  return list;
}
// ---------------------------------------------------------------- 水晶のマテリアル：自分で光る。面ごとの明るさ・ふちの白い光・ゆっくりした明滅。近づくと明るくなる。mirror ＝ 水面の下の さかさまの写し（水面より上は描かない）
function createCrystalMaterial(mirror) {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFpTime: fpU.uFpTime, uFpFoot: fpU.uFoot, tCc: fpU.tNoise, uCcWave: ccU.uCcWave, uCcGold: ccU.uCcGold }, fog: true, side: mirror ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: `attribute float aH; uniform float uFpTime; varying vec3 vN, vW, vCol; varying float vH, vPh;
      #include <fog_pars_vertex>
      void main(){
        mat4 mm = modelMatrix * instanceMatrix; vec4 wp = mm * vec4(position, 1.0);
        ${mirror ? `float dp = clamp(${glf(WL)} - wp.y, 0.0, 1.6); wp.x += sin(wp.y * 4.0 + uFpTime * 1.3 + wp.z * 1.7) * 0.035 * dp; wp.z += cos(wp.y * 3.3 - uFpTime * 1.1 + wp.x * 1.9) * 0.03 * dp;      // 水面のうつりこみは、ゆれる` : ''}
        vW = wp.xyz; vN = normalize(mat3(mm) * normal); vCol = instanceColor; vH = aH; vPh = fract(sin(dot(mm[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uFpTime, uCcGold; uniform vec4 uFpFoot, uCcWave; uniform sampler2D tCc; varying vec3 vN, vW, vCol; varying float vH, vPh;
      #include <fog_pars_fragment>
      void main(){
        ${mirror ? `if (vW.y > ${glf(WL)}) discard;` : ''}
        vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
        float ndv = abs(dot(n, v)), fres = pow(1.0 - ndv, 2.2), facet = 0.5 + 0.5 * dot(n, normalize(vec3(0.35, 0.6, 0.5)));
        float pulse = 0.8 + 0.2 * sin(uFpTime * 0.8 + vPh * 6.2831), near = 1.0 - smoothstep(2.0, 11.0, distance(vW, uFpFoot.xyz));
        float inner = texture2D(tCc, vec2(vH * 0.35 + vPh, vPh * 3.0 + dot(n.xz, vec2(0.21, 0.17)))).r;              // 中のくもり・すじ
        // 中から光って見える：正面から見た面（芯）は白っぽく明るく、ななめの面（ふち）は こい色。根元ほど明るい（中に光がある）
        float core = pow(ndv, 1.5) * (0.62 + 0.38 * (1.0 - vH));
        vec3 edge = vCol * mix(vCol, vec3(1.0), 0.25) * (0.5 + 0.5 * facet);
        vec3 c = mix(edge, mix(vCol, vec3(1.0), 0.62) * 1.3, core) + vCol * (0.3 * smoothstep(0.45, 0.75, inner) + 0.35 * (1.0 - vH) * (1.0 - vH)) + mix(vCol, vec3(1.0), 0.35) * pow(fres, 2.0) * 0.3;
        c += vec3(1.0) * pow(max(dot(reflect(-v, n), normalize(vec3(-0.2, 0.9, 0.3))), 0.0), 24.0) * 0.5;               // きらり
        c *= pulse * (0.8 + 0.45 * near);
        float wx = (distance(vW.xz, uCcWave.xy) - uCcWave.z) / 1.5;                                                     // 魔法陣の開放：光の波が通ると金色に光り、そのあと いっせいに明滅する
        float gk = clamp(exp(-wx * wx) * uCcWave.w + uCcGold * (0.4 + 0.6 * sin(uFpTime * 9.0 + vPh * 40.0)), 0.0, 1.0);
        c = mix(c, vec3(1.0, 0.8, 0.4) * (dot(c, vec3(0.5)) + 0.3), gk);
        ${mirror ? `c *= 0.62 * exp(-(${glf(WL)} - vW.y) * 0.06);` : ''}
        gl_FragColor = vec4(kfGlow(c), 1.0); vec3 lit = gl_FragColor.rgb;
        #include <fog_fragment>
        gl_FragColor.rgb = mix(lit, gl_FragColor.rgb, 0.55);                                                            // 自分で光るので、霧に のまれにくい
      }`,
  });
}
// ---------------------------------------------------------------- 一覧 → メッシュ（形 3 種類 × ふつう・さかさまの写し）
export function createCrystals(list) {
  const group = new THREE.Group(), geos = [buildCluster(3), buildCluster(8), buildCluster(14)], mats = [createCrystalMaterial(false), createCrystalMaterial(true)]; group.name = 'crystals';
  const flip = new THREE.Matrix4().makeScale(1, -1, 1).setPosition(0, 2 * WL, 0), m = new THREE.Matrix4(), col = new THREE.Color();
  geos.forEach((geo, v) => [false, true].forEach((mirror) => {
    const mine = list.filter((q) => q.v === v && (!mirror || q.mirror)); if (!mine.length) return;
    const mesh = new THREE.InstancedMesh(geo, mats[mirror ? 1 : 0], mine.length);
    mine.forEach((q, i) => {
      m.copy(mat4(q.x, q.y, q.z, q.s, q.rot, q.tx + (q.ceil ? Math.PI : 0), q.tz)); if (mirror) m.premultiply(flip);
      mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.set(q.color).multiplyScalar(q.giant ? 1.45 : 1));
    });
    mesh.frustumCulled = false; mesh.name = `crystals_${v}${mirror ? '_mirror' : ''}`; if (mirror) mesh.renderOrder = -1; group.add(mesh);
  }));
  return group;
}
// ---------------------------------------------------------------- 光の地図：水晶 1 かたまりずつの色の光を、上から見た 1 枚の画像に描く（かげの計算 fpShade と、水面が読む）
export function createLightMap(list) {
  const N = LITE ? 256 : 512, c = document.createElement('canvas'); c.width = Math.round(N * MAP.w / MAP.d); c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'lighter';
  const blob = (x, z, rad, color, a) => {
    const px = (x - MAP.x0) / MAP.w * c.width, pz = (z - MAP.z0) / MAP.d * c.height, pr = rad / MAP.d * c.height, col = new THREE.Color(color), rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
    const gr = g.createRadialGradient(px, pz, 0, px, pz, pr); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.35, `rgba(${rgb},${a * 0.5})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(px, pz, pr, 0, 6.283); g.fill();
  };
  const srgb = (h) => `#${new THREE.Color(h).convertLinearToSRGB().getHexString()}`;      // 画像は見た目の色で描く（シェーダーは数値として読む）
  for (const q of list) blob(q.x, q.z, Math.min(1.5 + 2.1 * q.s, q.giant ? 10 : 7), srgb(q.color), q.giant ? 0.3 : clamp(0.14 + 0.1 * q.s, 0, 0.34) * (q.ceil ? 0.5 : 1));
  blob(0, CAVE.backZ + 1, 9, '#9ccfe6', 0.75);                      // 入口：滝のうらからの外の光
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const px = g.getImageData(0, 0, c.width, c.height).data;          // その場所の光の強さ（エルフの明るさをおさえるのに使う）
  tex.userData.lightAt = (x, z) => { const i = clamp(Math.round((x - MAP.x0) / MAP.w * c.width), 0, c.width - 1), j = clamp(Math.round((z - MAP.z0) / MAP.d * c.height), 0, c.height - 1), k = (j * c.width + i) * 4; return Math.max(px[k], px[k + 1], px[k + 2]) / 255; };
  return tex;
}
// 水の深さの画像（0〜1 ＝ 0〜いちばん深い所）
export function createDepthTexture() {
  const cell = 0.25, nx = Math.round(MAP.w / cell), nz = Math.round(MAP.d / cell), data = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = Math.round(255 * pondDepth(MAP.x0 + (i + 0.5) * cell, MAP.z0 + (j + 0.5) * cell) / PO.depth);
  const t = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ================================================================ 水
// ---------------------------------------------------------------- 浅い水面（板 1 枚）：すきとおった暗い水。水晶の光のにじみ、ゆっくりしたゆらぎ、天井からのしずくの輪、歩く足もとから広がる波紋、光の筋のあたる所のきらめき
// うつりこみは、水面の下に置いた さかさまの水晶（createCrystals）が見えるしくみ。その下に、暗い底の板
export function createWater() {
  const group = new THREE.Group(); group.name = 'water';
  const zTop = -(PO.s0 - 1), zBot = CZ - HA.r - 3, geo = new THREE.PlaneGeometry(MAP.w - 2, zTop - zBot); geo.rotateX(-Math.PI / 2); geo.translate(MAP.x0 + MAP.w / 2, WL, (zTop + zBot) / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFpTime: fpU.uFpTime, tDapple: fpU.tDapple, tCc: fpU.tNoise, tCcLight: ccU.tCcLight, tCcDepth: ccU.tCcDepth, uCcFoot: ccU.uCcFoot, uCcWave: ccU.uCcWave, uCcPiece: ccU.uCcPiece },
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D tCc, tCcLight, tCcDepth; uniform vec3 uCcFoot, uCcPiece; uniform vec4 uCcWave; varying vec3 vW;
      #include <fog_pars_fragment>
      ${kit.DAPPLE_GLSL}
      ${CC_UV}
      float ccH(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 q = vW.xz; float d = texture2D(tCcDepth, ccUV(q)).r; if (d < 0.02) discard;
        float t = uFpTime; vec3 v = normalize(cameraPosition - vW); float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
        vec4 wa = texture2D(tCc, q * 0.11 + vec2(t * 0.011, t * 0.007)), wb = texture2D(tCc, q * 0.37 - vec2(t * 0.017, -t * 0.012)); vec2 nr = (wa.rg - 0.5) * 0.7 + (wb.gb - 0.5) * 0.5;      // ゆらぎ
        float shim = 1.0 - smoothstep(0.0, 0.15, abs(wa.b - wb.r)); shim *= shim;                                                                                                          // 水面を走る、光のあみ目
        vec2 cell = floor(q / 2.6); float hs = ccH(cell), ph = fract(t * (0.11 + 0.08 * hs) + hs * 7.0);                                                                     // 天井からのしずくの輪
        vec2 rc = (cell + 0.2 + 0.6 * vec2(ccH(cell + 1.7), ccH(cell + 5.3))) * 2.6; float rr = distance(q, rc), fade = (1.0 - ph) * (1.0 - ph) * step(hs, 0.6);
        fade *= uCcPiece.z > 0.0 ? smoothstep(uCcPiece.z * 0.75, uCcPiece.z, distance(rc, uCcPiece.xy)) : 1.0;      // かけらのまわりでは、しずくの輪を出さない（魔法陣に見えないように）
        float ring = ((1.0 - smoothstep(0.0, 0.045, abs(rr - ph * 1.15))) + 0.6 * (1.0 - smoothstep(0.0, 0.04, abs(rr - ph * 1.15 + 0.2))) * step(0.2, ph * 1.15)) * fade;
        float fd = distance(q, uCcFoot.xy), fr = max(sin(fd * 11.0 - t * 7.0), 0.0);                                                                                            // 足もとの波紋
        fr = fr * fr * exp(-fd * 1.5) * (0.05 + 0.95 * uCcFoot.z) * smoothstep(0.12, 0.4, fd);      // 立ち止まっている間は、ほとんど出さない
        vec3 lm = texture2D(tCcLight, ccUV(q + nr * 1.8)).rgb; float dap = fpDapple(vW + vec3(nr.x, 0.0, nr.y) * 0.5);
        float glint = smoothstep(0.16, 0.34, length(nr));
        vec3 col = ${glc(CAVE.void)} * 1.5 + lm * (0.04 + 0.22 * fres + 0.5 * glint * fres) + (lm + 0.22) * vec3(0.72, 0.86, 1.0) * (ring * 0.9 + fr * 0.8);
        dap *= dap; col += vec3(0.75, 0.9, 1.0) * dap * (0.3 + 0.6 * glint) + (lm * 1.3 + vec3(0.05, 0.09, 0.15)) * shim * (0.05 + 0.24 * fres);
        float a = (0.22 + 0.22 * fres + 0.45 * (ring + fr) + 0.25 * dap + 0.1 * shim) * smoothstep(0.02, 0.3, d);
        col += vec3(0.55, 0.7, 0.9) * (1.0 - smoothstep(0.02, 0.16, d)) * 0.12;                                                                                                 // 水ぎわの うすい線
        float wd = distance(q, uCcWave.xy) - uCcWave.z, wv = (exp(-wd * wd * 9.0) + 0.5 * max(sin(wd * 5.0), 0.0) * smoothstep(-4.5, 0.0, wd) * step(wd, 0.0)) * uCcWave.w;      // 魔法陣の開放：大きな波もん
        col += vec3(1.0, 0.84, 0.5) * wv * 0.55; a += 0.35 * wv;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
        #include <fog_fragment>
      }`,
  });
  const surf = new THREE.Mesh(geo, m); surf.renderOrder = 3; surf.frustumCulled = false; surf.name = 'water_surface';
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: CAVE.void, fog: false })); bottom.position.set(CX, WL - 16, CZ); bottom.renderOrder = -2; bottom.name = 'water_dark_bottom';
  group.add(bottom, surf);
  return group;
}
// ---------------------------------------------------------------- 入口：滝のうら。落ちる水のすじを通した、外の明るい光（加算の板 1 枚）
export function createEntrance() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uFpTime: fpU.uFpTime, tCc: fpU.tNoise, uAmt: ccU.uCcEntrance }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tCc; uniform float uFpTime, uAmt; varying vec2 vUv;
      void main(){
        float s1 = texture2D(tCc, vec2(vUv.x * 1.7, vUv.y * 0.22 + uFpTime * 0.33)).r, s2 = texture2D(tCc, vec2(vUv.x * 4.3 + 0.4, vUv.y * 0.5 + uFpTime * 0.55)).b;
        float streak = 0.55 + 0.9 * smoothstep(0.3, 0.75, s1 * 0.6 + s2 * 0.5), e = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        gl_FragColor = vec4(mix(vec3(0.62, 0.86, 1.0), vec3(0.95, 1.0, 1.0), streak - 0.55), e * streak * 0.9 * uAmt); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 6.5), m); mesh.position.set(0, 2.3, CAVE.backZ + 1.2); mesh.renderOrder = 4; mesh.name = 'entrance_falls';
  return mesh;
}

// ================================================================ 組み立て
kit.createDappleTexture(37, ({ blob, cluster }) => { for (const p of POOLS) { blob(p.x, p.z, p.r, 1); cluster(p.x, p.z, p.big ? 14 : 6, p.r * 1.8, 0.28, 0.8); } });
const crystals = placeCrystals();
ccU.tCcLight.value = createLightMap(crystals); ccU.tCcDepth.value = createDepthTexture();
const shell = createShell(); scene.add(shell.floor, shell.ceil);
scene.add(createSpikes(shell.floor.material, crystals), createStones(shell.floor.material, crystals), createDrips());
scene.add(createCrystals(crystals), createWater(), createEntrance());
const shafts = kit.createLightShafts(POOLS, { groundH, topH: FLOOR + HA.h + 4 }); scene.add(shafts.mesh);

// にじむ光の板（bloom の代わり）：水晶のまわりの光、足もとの光の輪、水面の下の写し、天井のすき間の明るさ、入口の外の光
const glowItems = [];
for (const q of crystals) {
  const up = q.ceil ? -1 : 1, big = q.s > (LITE ? 1.0 : 0.6);
  if (big) glowItems.push({ p: V3(q.x, q.y + up * 0.5 * q.s, q.z), size: 1.3 + 2.1 * q.s, color: q.color, opacity: q.giant ? 0.3 : 0.2 });
  if (!q.ceil) glowItems.push({ p: V3(q.x, Math.max(groundH(q.x, q.z), WL) + 0.05, q.z), size: 1.8 + 2.3 * q.s, color: q.color, opacity: 0.14, flat: true });
  if (q.mirror && big) glowItems.push({ p: V3(q.x, 2 * WL - (q.y + up * 0.5 * q.s), q.z), size: 1.3 + 2.1 * q.s, color: q.color, opacity: 0.08 });
}
glowItems.push({ p: HALL_GLOW.clone(), size: 16, color: '#9fc0ff', opacity: 0.16 });
const skyGlow = createGlowCards(POOLS.map((p) => ({ p: V3(p.ax, p.top + (p.big ? 3.5 : 2.2), p.az), size: p.r * 4.5 + 1, color: '#e4f2ff', opacity: 0.8 })).concat(
  [{ p: V3(0, 2.2, CAVE.backZ + 3), size: 10, color: '#cfeaff', opacity: 0.5 }, { p: V3(0, 0.06, CAVE.backZ - 0.5), size: 7, color: '#bfe2ff', opacity: 0.22, flat: true }]), 'sky_glow', 0.4);      // 外の光は、夜は弱い
scene.add(createGlowCards(glowItems, 'crystal_glow'), skyGlow);
// 光の粒（area_kit.js）：光の筋の中のほこり ＋ 水晶のまわりにただよう青い光
scene.add((() => {
  const n = CAVE.count.motes, r = rng(49), pos = new Float32Array(n * 3), sd = new Float32Array(n * 2), gr = new Float32Array(n), floorC = crystals.filter((q) => !q.ceil);
  for (let i = 0; i < n; i++) {
    const kind = i < n * 0.4 ? 0 : 1; let x, z, y;
    if (kind === 0) { const p = POOLS[Math.floor(r() * POOLS.length)]; y = 0.4 + r() * (p.big ? 9 : 4); x = p.x + SUN.x / SUN.y * y + (r() - 0.5) * p.r * 2.4; z = p.z + SUN.z / SUN.y * y + (r() - 0.5) * p.r * 2.4; }
    else { const q = floorC[Math.floor(r() * floorC.length)]; x = q.x + (r() - 0.5) * (2.5 + q.s); z = q.z + (r() - 0.5) * (2.5 + q.s); y = 0.3 + r() * (1.2 + q.s); }
    pos.set([x, y, z], i * 3); sd.set([r(), kind], i * 2); gr[i] = floorY(z);
  }
  return kit.createMotes({ pos, seed: sd, ground: gr });
})());

// ---------------------------------------------------------------- プレイヤー・音・はじまり・エリアの行き来
const player = newPlayer({ pitch: 0.03 });
const controls = createWalkControls(renderer.domElement, player, camera, { stickEl: document.getElementById('stick'), knobEl: document.getElementById('knob') });
// 洞くつの静けさ：低い空気の音、天井からのしずく（ひびく）、入口では滝のこもった音、奥ほど大きくなる水晶の低いひびきと鈴。石をふむ足音、水の中では水をふむ音。鳥はいない
const audio = createAreaAudio({ wind: { g: [0.07, 0.05], lp: [150, 110], hi: [0.0, 0.003], bp: [2600, 600] }, birds: { vol: [0.00002, 0], gap: [900, 900] },
  steps: { low: 0.15, thump: 0.2, swish: [0.005, 0.005] }, drips: true, falls: true, water: true,
  tone: { notes: [65.41, 98.0, 130.81, 196.0, 261.63, 392.0], amps: [0.5, 0.44, 0.34, 0.22, 0.14, 0.07], gain: 0.4, lp: [220, 1500] } });
const inWater = () => pondDepth(player.x, player.z) > 0.07;
// エルフ：水晶の色の光は受けるが、明るい所（広間・水晶のそば）で白くとばないよう、その場所の光の強さに合わせて明るさをおさえる。光の筋の中の明るさの足し方も弱め
const elfTint = new THREE.Color(1, 1, 1); let dayNight = null;
// 暗い所（水晶の光がとどかない所・暗い世界）では、逆に明るさを足して、青黒くつぶれないようにする（顔に当たる光のかわり。青みも少し打ち消す）
const AVATAR_OPT = { light: [-0.25, 0.85, 0.45], dapple: 0.1,
  tint: () => { const lm = ccU.tCcLight.value.userData.lightAt(player.x, player.z) * CAVE.lightGain, k = Math.min(1.45, CAVE.elfMax / (Math.max(...CAVE.amb) + lm)), nv = dayNight ? dayNight.value : 0, nt = CAVE.night.tint;
    return elfTint.setRGB(...CAVE.amb.map((a, i) => lerp(k, Math.min(1.7, CAVE.elfMax / (a + lm)), 0.55) * lerp(1, 0.94 / nt[i], nv))); } };
const walker = createViewWalker({ params, scene, addDapple, U: fpU, avatar: AVATAR_OPT, player, controls, camera, constrain, groundH, eye: CAVE.eye, speed: CAVE.speed,
  onStep: (foot) => (inWater() ? audio.splash(0.7, foot ? 0.2 : -0.2) : audio.footstep(foot)), helpEl: document.getElementById('help') });
wireStart({ params, controls, audio });
const travel = createTravel({ params, controls });                 // 入口の後ろ（滝のうら）→ 小川と滝
// 太陽の魔法陣：浅い水の下で青〜紫に光る。上に 2.5 秒立つと開放（金色になり、太陽のかけらが天井のすき間へのぼる）
const circle = createMagicCircle({ scene, position: [CIRCLE.x, WL - 0.05, CIRCLE.z], radius: CIRCLE.r, pattern: 'crystal', color: '#6fd0ff', color2: '#a884ff', key: SUN_CIRCLE_KEYS.cave,
  riseTo: [CIRCLE_POOL.ax + SUN.x / SUN.y * 6, CIRCLE_POOL.top + 6, CIRCLE_POOL.az + SUN.z / SUN.y * 6], pillarH: 9, muted: () => audio.isMuted(), controls, camera, groundH,
  piece: { front: [pathX(-P.len + 2), -P.len + 2], dist: 0.8 },      // 開放の前のかけら：魔法陣の前（トンネルの出口の側）に浮かぶ。光のすじは天井まで
  // 演出のカメラ：エルフは入口のほうを向く（後ろに島の巨大な水晶が入る）。カメラは、岩かべ・天井・水晶・水面の下に入らない
  cine: { faceTo: [CIRCLE.x + 0.6, CIRCLE.z + 6], free: (p) => { const c = constrain(p.x, p.z);
    return p.y > Math.max(groundH(p.x, p.z) + 0.22, WL + 0.1) && p.y < ceilH(p.x, p.z) - 0.45 && Math.hypot(c[0] - p.x, c[1] - p.z) < 0.7
      && !crystals.some((q) => !q.ceil && p.y < q.y + q.s * 1.05 && Math.hypot(q.x - p.x, q.z - p.z) < 0.32 * q.s + 0.35); } },
  // 洞くつの反応：光の波が通った水晶が金色に光り、そのあと いっせいに明滅する。水面に大きな波もん
  onCine: (c) => { const on = c.phase !== 'sleep' && c.phase !== 'open';
    ccU.uCcWave.value.set(CIRCLE.x, CIRCLE.z, c.wave, on ? c.waveAmt : 0); ccU.uCcGold.value = on ? 0.75 * sstep(c.T, 3.2, 3.8) * (1 - sstep(c.T, 4.8, 6.4)) + 0.6 * sstep(c.T, 9.2, 9.7) * (1 - sstep(c.T, 10.3, 11.6)) : 0; } });
dayNight = kit.createDayNight({ params, scene, onNight: (v) => { ccU.uCcEntrance.value = 1 - 0.6 * v; } });      // 洞くつの中はほとんど同じ。外からの光（入口・天井のすき間）だけが月あかりになる
// 水晶に近づくと、小さな鈴の音をひとつ（同じ水晶は 9 秒あける）
const chimeAt = new Map(); let chimeAcc = 0;
function updateNearChime(dt, now) {
  chimeAcc += dt; if (chimeAcc < 0.15) return; chimeAcc = 0;
  for (const q of crystals) {
    if (q.ceil || Math.hypot(q.x - player.x, q.z - player.z) > 1.6 + 0.4 * q.s || now - (chimeAt.get(q) ?? -99) < 9) continue;
    chimeAt.set(q, now); audio.chime(q.giant ? q.note / 2 : q.note, 0.05, clamp((q.x - player.x) * 0.4, -0.7, 0.7)); break;
  }
}

// ---------------------------------------------------------------- 確認用：場面・速さ・確認画像
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const VIEWS = {
  A: { x: 0, z: -2.6, yaw: Math.PI, pitch: 0.05 },                                                         // 入口（ふり返って、滝のうらを見る）
  B: { x: pathX(-19.5) + 0.5, z: -19.5, yaw: yawTo(pathX(-19.5) + 0.5, -19.5, pathX(-26) - 0.8, -26), pitch: -0.06 },         // 道の途中（水たまり）
  C: { x: pathX(-P.len + 0.5), z: -P.len + 0.5, yaw: yawTo(pathX(-P.len + 0.5), -P.len + 0.5, CX - 2.6, CZ), pitch: 0.12 },   // 奥の水晶の広間
};
const FIXED_T = params.has('t') ? parseFloat(params.get('t')) : null;
const clock = () => FIXED_T ?? performance.now() / 1000;
function renderFrame(t) {
  if (renderer.domElement.width < 2 || renderer.domElement.height < 2) return;
  windU.uTime.value = fpU.uFpTime.value = t;
  walker.placeCamera(t);
  ccU.uCcFoot.value.set(player.x, player.z, player.moving);
  { const pp = circle.piecePosition, wait = circle.mode === 'pickup' && circle.state === 'sleep' && (pp.x !== 0 || pp.z !== 0); ccU.uCcPiece.value.set(pp.x, pp.z, wait ? 5.0 : 0); }      // かけらを取るモードで、かけらが待っている間
  renderer.info.reset();
  composer.render();
}
const tools = createTools({ params, stage, lite: LITE, player, views: VIEWS, constrain, renderFrame, clock });
// 魔法陣の確認画像（2 段 3 枚）：A 今（顔が白い ＝ エルフの明るさをおさえる前）/ B〜D 直したあと（ためる・とき放つ・かけらと顔）/ E・F ほかのエリアの顔の寄り（あとから はりつける場所をあけておく）
// 保存・音・イベントなしで、見た目だけ切りかえる（circle.preview）。エルフのしぐさ（circle_unlock）も、その時間の姿勢になる
function circlePanel(g, x, y, w, h, key, text, img) {
  const LH = 78; g.fillStyle = '#17302f'; g.fillRect(x, y, w, LH); g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = '700 50px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(key, x + 26, y + LH / 2 + 2); g.font = '700 40px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(text, x + 86, y + LH / 2 + 2);
  if (img) g.drawImage(img, x, y + LH);
}
function circlePreview(w = 720, h = 540) {
  const LH = 78, gap = 8, c = document.createElement('canvas'); c.width = w * 3 + gap * 2; c.height = (h + LH) * 2 + gap; const g = c.getContext('2d'), keep = { ...player }, was = circle.state, max0 = CAVE.elfMax;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  const on = { x: CIRCLE.x + 0.15, z: CIRCLE.z + 0.2, yaw: 0, pitch: 0 };
  [['A', '今（顔が白い）', 2.5, 99], ['B', '直したあと・ためる', 2.5], ['C', '直したあと・とき放つ', 4.2], ['D', '直したあと・かけらと顔', 8.0], ['E', '遺跡での顔の寄り', null], ['F', 'キノコの谷での顔の寄り', null]].forEach(([key, text, T, elfMax], i) => {
    const x = (i % 3) * (w + gap), y = Math.floor(i / 3) * (h + LH + gap); let img = null;
    if (T !== null) { CAVE.elfMax = elfMax ?? max0; circle.cine.faceLum = elfMax ? 0 : undefined;      // A だけ：明るさをおさえる前（エルフの明るさの上限なし・顔の明るさ合わせなし）
      tools.setView(on); circle.preview('sleep', 0); renderFrame(clock()); circle.update(0, clock(), player.x, player.z); circle.preview('opening', 1.6); tools.shot(320, 240); circle.preview('opening', T); img = tools.shot(w, h); }
    circlePanel(g, x, y, w, h, key, text, img);
  });
  CAVE.elfMax = max0; circle.cine.faceLum = undefined; circle.preview(was === 'opening' ? 'open' : was, 0); for (let k = 0; k < 4; k++) walker.update(0.3); Object.assign(player, keep); renderFrame(clock());
  return c;
}
// かけらの確認画像（2 段 2 枚）：A 洞くつ・かけらと魔法陣（近く）/ B 洞くつ・遠くから見た光のすじ / C・D ほかのエリア（あとから はりつける場所をあけておく）
function piecePreview(w = 720, h = 540) {
  const LH = 78, gap = 8, c = document.createElement('canvas'); c.width = w * 2 + gap; c.height = (h + LH) * 2 + gap; const g = c.getContext('2d'), keep = { ...player };
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); circle.preview('sleep', 0); circle.update(0, clock(), player.x, player.z);
  const pp = circle.piecePosition, near = { x: pp.x + 1.2, z: pp.z + 2.2, yaw: yawTo(pp.x + 1.2, pp.z + 2.2, CIRCLE.x - 0.4, CIRCLE.z - 0.5), pitch: 0.02 }, far = { x: pathX(-24), z: -24, yaw: yawTo(pathX(-24), -24, pathX(-31), -31), pitch: 0.05 };
  [['A', '洞くつ・かけらと魔法陣（近く）', near], ['B', '洞くつ・遠くから見た光のすじ', far], ['C', '遺跡', null], ['D', 'キノコの谷', null]].forEach(([key, text, v], i) => {
    const x = (i % 2) * (w + gap), y = Math.floor(i / 2) * (h + LH + gap); let img = null;
    if (v) { tools.setView(v); circle.update(0, clock(), player.x, player.z); img = tools.shot(w, h); }
    circlePanel(g, x, y, w, h, key, text, img);
  });
  Object.assign(player, keep); renderFrame(clock());
  return c;
}
const PREVIEW = [['A', '入口（滝のうら）'], ['B', '道の途中の水たまり'], ['C', '奥の水晶の広間']];
window.__cave = { render: () => renderFrame(clock()), CAVE, VIEWS, player, audio, controls, travel, walker, renderer, scene, camera, crystals, circle, circlePreview, piecePreview, places: { HALL: { x: CX, z: CZ, r: HA.r }, POOLS, CIRCLE },
  setView: tools.setView, view: tools.setView, bench: tools.bench, shot: tools.shot, preview: (w = 720, h = 540) => tools.preview(PREVIEW, 3, w, h), constrain, walkSd, groundH, ceilH, pondDepth, pathX, frames: 0, errors: [],
  counts: { spikes: scene.getObjectByName('spikes').count, stones: scene.getObjectByName('stones').count, crystals: crystals.length, mirrored: crystals.filter((q) => q.mirror).length, glow: glowItems.length, shafts: POOLS.length } };
window.addEventListener('error', (e) => window.__cave.errors.push(String(e.message)));

// ---------------------------------------------------------------- 毎フレーム
runLoop({ stage, lite: LITE, clock, renderFrame, api: window.__cave, update(dt, t) {
  walker.update(dt);
  circle.update(dt, t, player.x, player.z);
  if (!travel.busy && player.z > CAVE.backZ) travel.go('stream_falls.html', 'cave');
  updateNearChime(dt, t);
  const k = 1 - sstep(Math.hypot(player.x - CX, player.z - CZ), 3, 40);
  audio.update(dt, { t, gust: 0.3 + 0.3 * Math.sin(t * 0.21), prox: 0.1 + 0.55 * k, drip: 0.9, falls: 0.55 * (1 - sstep(-player.z, -5, 24)), water: 0.3 * Math.min(1, pondDepth(player.x, player.z) / PO.depth + 0.3 * k) });
} });
