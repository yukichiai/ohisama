// =====================================================================
// エリア共通の部品（1 人称で歩く景観のページ：forest_path.js「森の小道」、flower_hill.js「花の丘」が使う）
// 見た目と操作感を、どのエリアでも同じにするためのもの。エリアごとの数値は createAreaKit(cfg) などの引数でわたす。
//   道具    clamp・lerp・sstep・V3・rng・vnoise・glf / glv / glc（シェーダーへ数値を書く）・distToSegment・gustAt
//   画像    createNoiseTexture（模様）・createAtlas / TILE / tileUV（シダ・草むら・花・葉・蝶の羽・花びら）
//   形      TubeGeo（幹・根・枝）・PlantGeo と buildFern / buildTuft / buildBell / buildWildflowers / buildMushrooms
//   光      createAreaKit(cfg) → installFog・addDapple（まだらな光と、かげ）・createLightShafts・createGlowCards（bloom の代わり）
//   森      createAreaKit(cfg) → createBarkMaterial・buildGiantTree・createTreeMeshes・buildRoots・createCanopy・createPlantMaterial・createTurf（ふさふさの短い草）
//   動き    createAreaKit(cfg) → createPetals・createMotes・createButterflies（風は nature.js の windU・WIND_GLSL）
//   音      createAreaAudio(opts)（Web Audio で合成）
//   昼と夜  createAreaKit(cfg) → createDayNight（昼 ⇔ 夜のスイッチ #timeBtn。空・霧・光を 2 秒でなめらかに変える。夜の色は cfg.night）
//   操作    createWalkControls・createWalker（歩く・目のゆれ）・createViewWalker（3 人称のエルフ ⇔ 1 人称の切りかえ）・wireStart（最初のタップ）・createTravel（エリアの行き来のフェード）
//   画面    createStage（renderer・scene・camera・水彩の効果）・createTools（場面・速さ・確認画像）・runLoop
// =====================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { windU, WIND, WIND_GLSL } from './nature.js';

// ページのはじめに呼ぶ：?lite=1（スマホの軽い版）?shot=1（文字を消す）?debug=1（速さの表示）
export function areaParams() {
  const params = new URLSearchParams(location.search);
  const TOUCH = ('ontouchstart' in window) || window.matchMedia('(pointer: coarse)').matches;
  const LITE = params.has('lite') ? params.get('lite') === '1' : TOUCH;
  if (params.has('shot')) document.body.classList.add('shot');
  if (params.has('debug')) document.body.classList.add('debug');
  if (TOUCH) document.body.classList.add('touch');
  return { params, TOUCH, LITE };
}

// ---------------------------------------------------------------- 小さな道具
export const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, sstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export function rng(seed) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash2 = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v) + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v;
}
export const glf = (x) => (Number.isInteger(x) ? x.toFixed(1) : x.toFixed(4));
export const glv = (v) => `vec3(${glf(v.x)}, ${glf(v.y)}, ${glf(v.z)})`;
export const glc = (hex, k = 1) => { const c = new THREE.Color(hex); return `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`; };
export const pickOf = (r, list) => list[Math.floor(r() * list.length) % list.length];
export function distToSegment(p, a, b) { const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); }
// 風の強い波（nature.js の WIND_GLSL と同じ式。音を見た目の風に合わせるために使う）
export function gustAt(x, z, t) {
  const front = (x * WIND.dir[0] + z * WIND.dir[1]) * 0.045 - t * WIND.gustSpeed;
  return sstep(Math.sin(front) * 0.5 + 0.5, 0.6, 1.0) * (0.6 + 0.4 * Math.sin(t * 0.17 + 1.3));
}

// 色ムラ・すじ・雲に使う模様（くり返してもつなぎ目が出ない。main.js の noiseTex と同じ作り）
export function createNoiseTexture() {
  const N = 256, data = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const vn = (x, y, per, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, b) => hash(((a % per) + per) % per, ((b % per) + per) % per, s);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
  const fbm = (x, y, base, s) => { let t = 0, a = 0.5, f = base; for (let o = 0; o < 5; o++) { t += a * vn(x * f / N, y * f / N, f, s + o); f *= 2; a *= 0.5; } return t; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (y * N + x) * 4;
    data[k] = fbm(x, y, 16, 1) * 255; data[k + 1] = fbm(x, y, 4, 2) * 255; data[k + 2] = fbm(x, y, 6, 3) * 255; data[k + 3] = fbm(x, y, 6, 4) * 255;
  }
  const t = new THREE.DataTexture(data, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- 絵の板の画像（シダ・草むら・ベルの花・小花・無地・葉のかたまり・蝶の羽・花びら）4 × 2 マス
export const TILE = { fern: 0, tuft: 1, bell: 2, flower: 3, solid: 4, leaves: 5, wing: 6, petal: 7 };
const AGX = 4, AGY = 2, ATS = 256;
export function tileUV(id) {
  const cx = id % AGX, cy = Math.floor(id / AGX), pu = 5 / (AGX * ATS), pv = 5 / (AGY * ATS);
  return [cx / AGX + pu, 1 - (cy + 1) / AGY + pv, (cx + 1) / AGX - pu, 1 - cy / AGY - pv];          // u0, v0（下）, u1, v1（上）
}
export function createAtlas() {
  const c = document.createElement('canvas'); c.width = AGX * ATS; c.height = AGY * ATS; const g = c.getContext('2d'), r = rng(9), S = ATS;
  const cell = (id, draw) => { g.save(); g.translate((id % AGX) * S, Math.floor(id / AGX) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); draw(); g.restore(); };
  const grey = (v) => `rgb(${v},${v},${v})`;
  cell(TILE.fern, () => {                                           // シダの葉 1 本（下が付け根、上が先）
    g.strokeStyle = grey(205); g.lineWidth = 5; g.beginPath(); g.moveTo(128, 254); g.lineTo(128, 8); g.stroke();
    for (let i = 0; i < 27; i++) {
      const t = i / 26, y = 248 - t * 236, len = 112 * (t < 0.22 ? 0.5 + 2.27 * t : Math.pow(1 - (t - 0.22) / 0.78, 0.85)) + 5;
      g.fillStyle = grey(Math.round(196 + 58 * t));
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(128, y + 5.5); g.quadraticCurveTo(128 + sd * len * 0.55, y - len * 0.02, 128 + sd * len, y - len * 0.4); g.quadraticCurveTo(128 + sd * len * 0.45, y - len * 0.36, 128, y - 5.5); g.closePath(); g.fill(); }
    }
  });
  cell(TILE.tuft, () => {                                           // 草むら（細い葉がひろがる）
    for (let i = 0; i < 19; i++) {
      const bx = 128 + (r() - 0.5) * 76, tx = bx + (r() - 0.5) * 190, ty = 250 - (110 + r() * 136), w = 9 + r() * 6, cx = bx + (tx - bx) * 0.22, cy = (256 + ty) / 2;
      g.fillStyle = grey(Math.round(190 + r() * 65));
      g.beginPath(); g.moveTo(bx - w / 2, 256); g.quadraticCurveTo(cx - w * 0.3, cy, tx, ty); g.quadraticCurveTo(cx + w * 0.5, cy, bx + w / 2, 256); g.closePath(); g.fill();
    }
  });
  cell(TILE.bell, () => {                                           // 下を向いたベルの花（上が付け根）
    const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, grey(205)); gr.addColorStop(0.75, grey(255)); gr.addColorStop(1, grey(240));
    g.fillStyle = gr; g.beginPath(); g.moveTo(128, 14); g.bezierCurveTo(74, 26, 66, 120, 34, 192);
    g.quadraticCurveTo(52, 252, 84, 212); g.quadraticCurveTo(128, 262, 172, 212); g.quadraticCurveTo(204, 252, 222, 192);
    g.bezierCurveTo(190, 120, 182, 26, 128, 14); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(190,190,190,0.7)'; g.lineWidth = 3; for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(128, 22); g.quadraticCurveTo(128 + k * 30, 110, 128 + k * 52, 208); g.stroke(); }
  });
  cell(TILE.flower, () => {                                         // 小花（花びら 5 枚）
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.save(); g.translate(128 + Math.cos(a) * 54, 128 + Math.sin(a) * 54); g.rotate(a + Math.PI / 2);
      const gr = g.createRadialGradient(0, 30, 4, 0, 0, 62); gr.addColorStop(0, grey(222)); gr.addColorStop(1, grey(255));
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 44, 60, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.fillStyle = '#f6da6a'; g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.fill();
  });
  cell(TILE.solid, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); });
  cell(TILE.leaves, () => {                                         // 葉のかたまり（まん中から外へ。すき間から空が見える）
    const leaf = (x, y, len, wid, ang) => {
      g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, -len * 0.45, 0, -len); g.quadraticCurveTo(-wid, -len * 0.45, 0, 0); g.closePath();
      const gr = g.createLinearGradient(-wid, 0, wid, 0); gr.addColorStop(0, grey(200)); gr.addColorStop(0.5, grey(255)); gr.addColorStop(1, grey(190));
      g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(150,150,150,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -3); g.lineTo(0, -len * 0.85); g.stroke(); g.restore();
    };
    for (let k = 0; k < 15; k++) {                                  // 小枝 15 本（外の輪 10・内の輪 4・まん中 1）：それぞれ小さな葉が 5〜6 枚
      const ring = k < 10 ? 0 : k < 14 ? 1 : 2, a0 = (ring === 0 ? k / 10 : k / 4) * 6.283 + r() * 0.5, d = ring === 0 ? 72 + r() * 22 : ring === 1 ? 32 + r() * 14 : 0;
      const cx = 128 + Math.cos(a0) * d, cy = 128 + Math.sin(a0) * d, n = 5 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) leaf(cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 6, 28 + r() * 13, 11 + r() * 4, i / n * 6.283 + r() * 0.6);
    }
  });
  cell(TILE.wing, () => {                                           // 蝶の羽 1 枚（左のはしが体につく）
    const gr = g.createRadialGradient(20, 128, 10, 90, 128, 190); gr.addColorStop(0, grey(255)); gr.addColorStop(0.7, grey(235)); gr.addColorStop(1, grey(150));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(6, 122); g.bezierCurveTo(40, 6, 206, -6, 246, 58); g.bezierCurveTo(254, 112, 150, 138, 6, 134); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(6, 128); g.bezierCurveTo(120, 136, 214, 168, 192, 220); g.bezierCurveTo(160, 258, 50, 226, 6, 140); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,120,120,0.45)'; g.lineWidth = 2.5; for (const [x, y] of [[220, 50], [170, 30], [110, 30], [180, 200], [110, 200]]) { g.beginPath(); g.moveTo(10, 128); g.lineTo(x, y); g.stroke(); }
  });
  cell(TILE.petal, () => {                                          // 花びら
    const gr = g.createLinearGradient(0, 30, 0, 226); gr.addColorStop(0, grey(255)); gr.addColorStop(1, grey(218));
    g.fillStyle = gr; g.beginPath(); g.moveTo(128, 236); g.bezierCurveTo(20, 170, 50, 30, 128, 20); g.bezierCurveTo(206, 30, 236, 170, 128, 236); g.closePath(); g.fill();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- 管をつなげて形を作る道具（幹・根・枝）
export class TubeGeo {
  constructor() { this.p = []; this.n = []; this.c = []; this.b = []; this.idx = []; this.nv = 0; }
  // path：点の列、radFn(i, θ)：太さ、colFn(i, θ)：色
  tube(path, sides, radFn, colFn) {
    const n = path.length, tan = new THREE.Vector3(), side = new THREE.Vector3(), bin = new THREE.Vector3(), nn = new THREE.Vector3(), rings = [];
    const circ = Math.max(1, Math.round(2 * Math.PI * radFn(Math.floor(n / 3), 0) * 0.9)) / 0.9;      // 樹皮の模様が 1 周でつながる長さ
    let len = 0;
    for (let i = 0; i < n; i++) {
      tan.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
      if (i === 0) side.crossVectors(Math.abs(tan.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0), tan).normalize();
      else side.addScaledVector(tan, -side.dot(tan)).normalize();
      bin.crossVectors(tan, side).normalize();
      if (i > 0) len += path[i].distanceTo(path[i - 1]);
      const ring = [];
      for (let s = 0; s <= sides; s++) {
        const th = s / sides * Math.PI * 2, rr = radFn(i, th), c = colFn(i, th);
        nn.copy(side).multiplyScalar(Math.cos(th)).addScaledVector(bin, Math.sin(th));
        this.p.push(path[i].x + nn.x * rr, path[i].y + nn.y * rr, path[i].z + nn.z * rr);
        this.n.push(nn.x, nn.y, nn.z); this.c.push(c.r, c.g, c.b); this.b.push(s / sides * circ, len);
        ring.push(this.nv++);
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
      const a = rings[i][s], b = rings[i][s + 1], c2 = rings[i + 1][s], d = rings[i + 1][s + 1];
      this.idx.push(a, b, c2, b, d, c2);
    }
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aBark', new THREE.Float32BufferAttribute(this.b, 2));
    g.setIndex(this.idx); g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------- ひざ〜腰の高さの草花（シダ・草むら・光るベルの花・小花・光るキノコ）
// 形を組み立てる道具：帯（リボン）と回転体。頂点ごとに aK（風でゆれる量 0〜1）と aGlow（自分で光る量）
export class PlantGeo {
  constructor() { this.p = []; this.uv = []; this.c = []; this.k = []; this.g = []; this.idx = []; this.nv = 0; }
  vert(p, u, v, col, k, glow) { this.p.push(p.x, p.y, p.z); this.uv.push(u, v); this.c.push(col.r, col.g, col.b); this.k.push(k); this.g.push(glow); return this.nv++; }
  ribbon(pts, right, wFn, tile, colFn, kFn, glow = 0) {
    const [u0, v0, u1, v1] = tileUV(tile), n = pts.length; let prev = null;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), w = wFn(u) / 2, col = colFn(u), k = kFn(u), vv = lerp(v0, v1, u);
      const a = this.vert(pts[i].clone().addScaledVector(right, -w), u0, vv, col, k, glow), b = this.vert(pts[i].clone().addScaledVector(right, w), u1, vv, col, k, glow);
      if (prev) this.idx.push(prev[0], prev[1], a, prev[1], b, a);
      prev = [a, b];
    }
  }
  quad(c, right, up, w, h, tile, col, k0, k1, glow = 0) {
    this.ribbon([c.clone().addScaledVector(up, -h / 2), c.clone().addScaledVector(up, h / 2)], right, () => w, tile, () => col, (u) => lerp(k0, k1, u), glow);
  }
  lathe(c, prof, sides, glowFn, colFn) {                             // prof = [[y, r], ...]（無地のマスを使う）
    const [u0, v0, u1, v1] = tileUV(TILE.solid), um = (u0 + u1) / 2, vm = (v0 + v1) / 2, rings = [];
    prof.forEach(([y, rad], j) => { const ring = []; for (let s = 0; s <= sides; s++) { const a = s / sides * 6.283; ring.push(this.vert(V3(c.x + Math.cos(a) * rad, c.y + y, c.z + Math.sin(a) * rad), um, vm, colFn(j), 0, glowFn(j))); } rings.push(ring); });
    for (let j = 0; j < prof.length - 1; j++) for (let s = 0; s < sides; s++) this.idx.push(rings[j][s], rings[j][s + 1], rings[j + 1][s], rings[j][s + 1], rings[j + 1][s + 1], rings[j + 1][s]);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aKG', new THREE.Float32BufferAttribute(this.k.flatMap((k, i) => [k, this.g[i]]), 2));
    g.setIndex(this.idx); g.computeBoundingSphere();
    return g;
  }
}
export function buildFern(seed) {
  const r = rng(seed), b = new PlantGeo(), nf = 8, base = new THREE.Color('#3f8a5c'), tip = new THREE.Color('#9fd98a');
  for (let f = 0; f < nf; f++) {
    const az = f / nf * 6.283 + (r() - 0.5) * 0.5, out = V3(Math.cos(az), 0, Math.sin(az)), right = V3(-Math.sin(az), 0, Math.cos(az)), len = 0.75 + r() * 0.4, e0 = 1.0 + r() * 0.3, pts = [], p = V3(out.x * 0.04, 0, out.z * 0.04);
    for (let j = 0; j <= 5; j++) { pts.push(p.clone()); const el = lerp(e0, -0.35, (j + 0.5) / 5); p.addScaledVector(out, Math.cos(el) * len / 5); p.y += Math.sin(el) * len / 5; }
    const tint = 0.85 + 0.3 * r();
    b.ribbon(pts, right, () => len * 0.36, TILE.fern, (u) => base.clone().lerp(tip, u * 0.8 + 0.1).multiplyScalar(tint), (u) => u * u * 0.9 + 0.1 * u);
  }
  return b.toGeometry();
}
export function buildTuft() {
  const b = new PlantGeo(), c0 = new THREE.Color('#5aa870');
  for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3 + 0.2, right = V3(Math.cos(a), 0, Math.sin(a)); b.quad(V3(0, 0.4, 0), right, V3(0, 1, 0), 0.8, 0.82, TILE.tuft, c0, 0, 1); }
  return b.toGeometry();
}
export function buildBell(seed) {                                           // 光るベルの花：細い茎の先に、下を向いた花がさがる
  const r = rng(seed), b = new PlantGeo(), stem = new THREE.Color('#4f9a6c'), white = new THREE.Color('#ffffff');
  for (let s = 0; s < 3; s++) {
    const az = s / 3 * 6.283 + r(), out = V3(Math.cos(az), 0, Math.sin(az)), right = V3(-Math.sin(az), 0, Math.cos(az)), h = 0.7 + r() * 0.4, pts = [];
    for (let j = 0; j <= 5; j++) { const u = j / 5; pts.push(V3(out.x * (0.05 + 0.22 * u * u), h * (u - 0.1 * u * u * u), out.z * (0.05 + 0.22 * u * u))); }
    b.ribbon(pts, right, (u) => 0.02 - 0.008 * u, TILE.solid, () => stem, (u) => u);
    for (let k = 0; k < 2; k++) {                                    // 花 2 輪（茎の先と、少し下）
      const at = pts[5 - k * 1].clone().add(V3(out.x * 0.05 * k, -0.02 - 0.05 * k, out.z * 0.05 * k)), sz = 0.15 - 0.03 * k;
      b.quad(at.clone().add(V3(0, -sz * 0.5, 0)), right, V3(0, 1, 0), sz, sz, TILE.bell, white, 1 - 0.15 * k, 1 - 0.15 * k, 1);
      b.quad(at.clone().add(V3(0, -sz * 0.5, 0)), out, V3(0, 1, 0), sz, sz, TILE.bell, white, 1 - 0.15 * k, 1 - 0.15 * k, 1);
    }
  }
  for (let k = 0; k < 2; k++) { const a = k * 1.6 + 0.4; b.quad(V3(0, 0.2, 0), V3(Math.cos(a), 0, Math.sin(a)), V3(0, 1, 0), 0.42, 0.42, TILE.tuft, stem, 0, 0.5); }
  return b.toGeometry();
}
export function buildWildflowers(seed) {                                    // 小花のひとむら
  const r = rng(seed), b = new PlantGeo(), stem = new THREE.Color('#5aa870'), cols = ['#ffffff', '#ffe1ec', '#fff3b8', '#e4dcff', '#ffffff'].map((h) => new THREE.Color(h));
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.283, d = 0.05 + r() * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.2 + r() * 0.28, right = V3(Math.cos(a + 1.3), 0, Math.sin(a + 1.3));
    b.ribbon([V3(x, 0, z), V3(x * 1.1, h, z * 1.1)], right, () => 0.014, TILE.solid, () => stem, (u) => u * 0.8);
    const up = V3(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5).normalize(), sz = 0.1 + r() * 0.05;
    b.quad(V3(x * 1.1, h, z * 1.1), right, up.clone().cross(right).normalize(), sz, sz, TILE.flower, pickOf(r, cols), 0.8, 0.8, 0.25);
  }
  return b.toGeometry();
}
export function buildMushrooms(seed) {                                      // 光るキノコ 4 本のひとむら（かさの裏がいちばん光る）
  const r = rng(seed), b = new PlantGeo(), stemC = new THREE.Color('#dfeef2'), capC = new THREE.Color('#ffffff');
  for (let i = 0; i < 4; i++) {
    const a = r() * 6.283, d = i === 0 ? 0 : 0.1 + r() * 0.22, h = (i === 0 ? 0.3 : 0.12) + r() * 0.16, cr = h * (0.42 + r() * 0.2), sr = cr * 0.2;
    b.lathe(V3(Math.cos(a) * d, -0.02, Math.sin(a) * d),
      [[0, sr * 1.3], [h * 0.92, sr * 0.8], [h - cr * 0.12, cr], [h + cr * 0.22, cr * 0.86], [h + cr * 0.5, cr * 0.46], [h + cr * 0.62, 0.004]], 7,
      (j) => [0.3, 0.55, 1.5, 0.8, 0.65, 0.65][j], (j) => (j < 2 ? stemC : capC));
  }
  return b.toGeometry();
}

// ================================================================ 昼と夜のスイッチの絵（文字なし）
let fogInstalled = false;                                           // installFog を使うページでは、scene.fog.far を「夜の度合い 0〜1」の受けわたしに使う（霧の距離はシェーダーに書きこむ）
const timeState = { night: false };                                 // 今が夜か（createTravel が、次のエリアへ引きつぐ）
const frameHooks = [];                                              // 毎フレーム呼ぶもの（runLoop が呼ぶ。昼と夜のうつりかわり）
// 横長のトグル：昼は水色の地に雲、つまみは太陽（左）。夜は紺色の地に星、つまみは三日月（右）。
// night：undefined ＝ CSS のクラスで動かす（ボタン用）/ false・true ＝ その状態の止め絵（確認画像用）
export function timeSwitchSVG(night) {
  const live = night === undefined, o = (v) => (live ? '' : ` opacity="${v}"`), dayO = o(night ? 0 : 1), nightO = o(night ? 1 : 0);
  const rays = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4, c = Math.cos(a), sn = Math.sin(a); return `<line x1="${(20 + c * 12.6).toFixed(2)}" y1="${(20 + sn * 12.6).toFixed(2)}" x2="${(20 + c * 15.4).toFixed(2)}" y2="${(20 + sn * 15.4).toFixed(2)}"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76 40" width="76" height="40" aria-hidden="true">
    <defs><clipPath id="tswC"><rect x="1" y="1" width="74" height="38" rx="19"/></clipPath><mask id="tswM"><rect x="0" y="0" width="76" height="40" fill="#fff"/><circle cx="25.5" cy="15.2" r="9.6" fill="#000"/></mask>
      <linearGradient id="tswD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3ff"/><stop offset="1" stop-color="#c4ecff"/></linearGradient>
      <linearGradient id="tswN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#131a4a"/><stop offset="1" stop-color="#3a3b86"/></linearGradient></defs>
    <g clip-path="url(#tswC)">
      <g class="t-day"${dayO}><rect width="76" height="40" fill="url(#tswD)"/><g fill="#fff"><ellipse cx="52" cy="27" rx="9" ry="5"/><ellipse cx="58.5" cy="23.5" rx="6" ry="5.2"/><ellipse cx="63" cy="27.5" rx="7" ry="4.2"/><ellipse cx="46" cy="12" rx="5.5" ry="2.8" opacity=".8"/><ellipse cx="50" cy="10.5" rx="4" ry="2.8" opacity=".8"/></g></g>
      <g class="t-night"${nightO}><rect width="76" height="40" fill="url(#tswN)"/><g fill="#fff"><circle cx="13" cy="12" r="1.5"/><circle cx="24" cy="27" r="1.2"/><circle cx="30" cy="11" r="1"/><circle cx="9" cy="26" r="0.9"/><circle cx="20" cy="19" r="0.8"/><path d="M33 22l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></g></g>
    </g>
    <rect x="1" y="1" width="74" height="38" rx="19" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6"/>
    <g class="t-knob"${live ? '' : ` transform="translate(${night ? 36 : 0} 0)"`}>
      <g class="t-sun"${dayO}><g stroke="#ffd23c" stroke-width="2.4" stroke-linecap="round">${rays}</g><circle cx="20" cy="20" r="10" fill="#ffd94f" stroke="#fff4bd" stroke-width="1.2"/></g>
      <g class="t-moon"${nightO}><circle cx="20" cy="20" r="11.5" fill="#fff2c0" mask="url(#tswM)"/></g>
    </g></svg>`;
}

// ================================================================ エリアの部品一式（光・森・動き）
// cfg：{ lite, sun（太陽のある向き）, glowPos（大樹の光の中心）, light { sky, ground, hemiI, sun, tree, treeGlow }, fog { farCol, glowCol, mist, glowAmt, midCol（手前と奥の間の色。なくてもよい）, glowPow（大樹の方向の光の広がり。小さいほど広い）},
//        dapple { map { x0, z0, w, d }（画像がおおう範囲）, col, gain }, shaft { col, amt }, trunk { bark, bark2, moss }, leaves [色…],
//        shadeGLSL（なくてもよい。vec3 fpShade(vec3 wp)：木かげ・雲のかげの明るさ。tFpNoise と uFpTime が使える）, shadeUniforms（なくてもよい。shadeGLSL が使う uniform。物か、物を返す関数）,
//        night（なくてもよい。夜の色）{ tint [r, g, b]（景色に掛ける色）, glow（自分で光る色の強さ）, cards（にじむ光の板の強さ）, shaft（光の筋の強さ）, secs（うつりかわる秒数）,
//               fog { nearCol, midCol, farCol, glowCol }, sky { zen, hor, low, cloud, cloudSh, sun（月あかり）, sunAmt, cloudAmt, stars } }}
export function createAreaKit(cfg) {
  const LITE = !!cfg.lite, SUN = cfg.sun, L = cfg.light, TREE_GLOW_POS = cfg.glowPos, DAP = cfg.dapple.map, FOREST = cfg;   // 下の部品は、この名前で数値を読む
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  // みんなで使う uniform
  const fpU = { uFpTime: { value: 0 }, tDapple: { value: black }, tNoise: { value: createNoiseTexture() }, tAtlas: { value: createAtlas() }, uPR: { value: 1 },
    uFoot: { value: new THREE.Vector4(0, 0, 0, 0) },
    uNight: { value: 0 } };                                         // 夜の度合い（0 昼 〜 1 夜）。createDayNight が入れる。霧を使わないシェーダー（空・雲・にじむ光）が読む      // 足もと（草がよける中心）：1 人称はカメラの場所、3 人称はエルフの場所（w ＝ 1）。createViewWalker が毎フレーム入れる
  const SHADE = cfg.shadeGLSL ? `\nuniform sampler2D tFpNoise;\n${cfg.shadeGLSL}` : '';
  // 夜の色（cfg.night で上書きできる）
  const NIGHT = (() => {
    const o = cfg.night || {}, hex = (a, b, k) => `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
    const fog = { nearCol: '#1f2a52', farCol: '#2b3168', glowCol: cfg.fog.glowCol, ...(o.fog || {}) };
    if (cfg.fog.midCol && !fog.midCol) fog.midCol = hex(fog.nearCol, fog.farCol, 0.5);
    return { tint: [0.36, 0.44, 0.74], glow: 1.5, cards: 1.5, shaft: 0.35, secs: 2, ...o, fog,
      sky: { zen: '#0a1030', hor: '#2c3472', low: fog.farCol, cloud: '#59639c', cloudSh: '#252c5a', sun: '#cfd8ff', sunAmt: 0.6, cloudAmt: null, stars: 1, ...(o.sky || {}) } };
  })();
  const NIGHT_TINT = `vec3(${NIGHT.tint.map(glf).join(', ')})`;

  // ---------------------------------------------------------------- 霧：奥ほど色が変わる（手前は青緑 → 奥は白っぽい → 大樹の方向は桃色に光る）＋ 地面近くのもや
  // three.js の霧の計算を置きかえる（scene.fog の色＝手前の色、near / far はそのまま使う）。全部のマテリアルに効く。
  // ついでに、ワールド座標 vFogWorld をフラグメントへ渡す（まだらな光 addDapple が使う）。
  function installFog() {
    const F = FOREST.fog;
    THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogWorld;\n#endif`;
    THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );\n#endif`;
    // 夜：霧の距離（near・far）はここに書きこみ、あいた fogFar（scene.fog.far）で「夜の度合い 0〜1」を受けとる ＝ 霧を使うすべてのマテリアルに、何も足さずにとどく
    //   kfNight（夜の度合い）と、vec3 kfGlow(vec3 c)（自分で光る色用：夜の色づけを打ち消して、少し強くする）は、霧を使うフラグメントシェーダーならどこでも使える
    fogInstalled = true;
    const mixN = (day, night) => `mix( ${glc(day)}, ${glc(night)}, kfNight )`;
    THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n #define kfNight fogFar\n vec3 kfGlow( vec3 c ) { return c * mix( vec3( 1.0 ), vec3( ${glf(NIGHT.glow)} ) / ${NIGHT_TINT}, kfNight ); }\n#endif`;
    THREE.ShaderChunk.fog_fragment = `
    #ifdef USE_FOG
      gl_FragColor.rgb *= mix( vec3( 1.0 ), ${NIGHT_TINT}, kfNight );                                                     // 夜の色づけ（景色ぜんたい）
      float kfD = max( 0.0, vFogDepth - ${glf(F.near)} ) / ${glf(Math.max(1, F.far - F.near))};
      float kfF = 1.0 - exp( - kfD * kfD * 2.2 - kfD * 0.7 );
      vec3 kfT = ${glv(TREE_GLOW_POS)} - cameraPosition;
      float kfG = pow( max( dot( normalize( vFogWorld - cameraPosition ), normalize( kfT ) ), 0.0 ), ${glf(F.glowPow ?? 5)} );          // 大樹の方向
      vec3 kfC = ${F.midCol ? `mix( mix( fogColor, ${mixN(F.midCol, NIGHT.fog.midCol)}, smoothstep( 0.05, 0.4, kfF ) ), ${mixN(F.farCol, NIGHT.fog.farCol)}, smoothstep( 0.4, 0.9, kfF ) )` : `mix( fogColor, ${mixN(F.farCol, NIGHT.fog.farCol)}, smoothstep( 0.12, 0.8, kfF ) )`};   // 奥ほど色が変わる
      kfC = mix( kfC, ${mixN(F.glowCol, NIGHT.fog.glowCol)}, kfG * smoothstep( 0.08, 0.6, kfF ) * ${glf(F.glowAmt ?? 0.9)} );
      float kfM = exp( - max( vFogWorld.y, 0.0 ) * 1.0 ) * smoothstep( 3.0, 18.0, vFogDepth ) * ${glf(F.mist)};     // 地面近くのもや
      kfF = clamp( kfF + kfM * ( 1.0 - kfF ), 0.0, 1.0 );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, kfC, kfF );
    #endif`;
  }

  // シェーダーの関数：その場所に落ちる光の量（0〜1）。頂点・フラグメントのどちらでも使える
  const DAPPLE_GLSL = `
    uniform sampler2D tDapple; uniform float uFpTime;
    float fpDapple(vec3 wp){
      vec2 g = wp.xz - vec2(${glf(SUN.x / SUN.y)}, ${glf(SUN.z / SUN.y)}) * max(wp.y, 0.0);       // 太陽の向きにそって地面へ
      vec2 uv = (g - vec2(${glf(DAP.x0)}, ${glf(DAP.z0)})) / vec2(${glf(DAP.w)}, ${glf(DAP.d)});
      uv += 0.0012 * vec2(sin(uFpTime * 0.9 + g.y * 1.7), cos(uFpTime * 0.7 + g.x * 1.3));       // 葉がゆれて、光もゆれる
      return texture2D(tDapple, uv).r * (0.82 + 0.18 * sin(uFpTime * 1.1 + g.x * 0.7 + g.y * 0.5));
    }`;
  // どのマテリアルにも、まだらな光を足せる（かげの明るさに掛ける。gain は強さ）
  function addDapple(m, gain = 1) {
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m), D = FOREST.dapple;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      sh.uniforms.tDapple = fpU.tDapple; sh.uniforms.uFpTime = fpU.uFpTime; if (SHADE) sh.uniforms.tFpNoise = fpU.tNoise;
      if (cfg.shadeUniforms) Object.assign(sh.uniforms, typeof cfg.shadeUniforms === 'function' ? cfg.shadeUniforms() : cfg.shadeUniforms);      // shadeGLSL が使う、エリアごとの uniform（なくてもよい）
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${DAPPLE_GLSL}${SHADE}`)
        .replace('#include <opaque_fragment>', `#ifdef USE_FOG\n outgoingLight *= ${SHADE ? 'fpShade(vFogWorld) * ' : ''}(1.0 + ${glf(D.gain * gain)} * fpDapple(vFogWorld) * vec3(${D.col.map(glf).join(', ')}));\n#endif\n#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|fpDapple${gain}`;
    return m;
  }

  // まだらな光の画像を作る。draw({ r, blob(x, z, 半径, 濃さ), cluster(x, z, 個数, 広がり, 半径, 濃さ) }) の中で、光の落ちる所を描く
  function createDappleTexture(seed, draw) {
    const r = rng(seed), N = LITE ? 512 : 1024;
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.globalCompositeOperation = 'lighter';
    const blob = (x, z, rad, a) => {
      g.save(); g.translate((x - DAP.x0) / DAP.w * N, (z - DAP.z0) / DAP.d * N); g.scale(rad / DAP.w * N, rad / DAP.d * N);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.7})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
    };
    const cluster = (x, z, n, spread, rad, a) => { for (let i = 0; i < n; i++) { const an = r() * 6.283, d = spread * Math.sqrt(r()); blob(x + Math.cos(an) * d, z + Math.sin(an) * d, rad * (0.5 + r()), a * (0.5 + 0.5 * r())); } };
    draw({ r, blob, cluster });
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    fpU.tDapple.value = tex;
    return tex;
  }

  // ---------------------------------------------------------------- 木もれ日の光の筋（加算の板。日だまりから太陽の方向へ立つ。板は筋の軸のまわりでカメラを向く）
  // pools = [{ x, z, r }]（日だまり）、groundH(x, z)：地面の高さ、topH：筋の上のはしの高さ（枝葉の上）
  function createLightShafts(pools, { groundH, topH }) {
    const S = FOREST.shaft, n = pools.length, geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1, 1, 6); base.translate(0, 0.5, 0);
    geo.index = base.index; geo.setAttribute('position', base.attributes.position);
    const aBase = new Float32Array(n * 3), aDim = new Float32Array(n * 3), list = [];
    pools.forEach((p, i) => {
      const h = groundH(p.x, p.z), b = V3(p.x, 0, p.z).addScaledVector(SUN, h / SUN.y), len = (topH - h) / SUN.y;
      aBase.set([b.x, b.y - 0.05, b.z], i * 3); aDim.set([p.r * 1.9, len, hash2(i, 7)], i * 3);
      list.push({ a: V3(p.x, 0, p.z), r: p.r });
    });
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 3)); geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(aDim, 3));
    geo.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uFpTime: fpU.uFpTime, tNoise: fpU.tNoise, uAmt: { value: S.amt }, uFpNight: fpU.uNight },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec3 aBase, aDim; varying vec2 vUv; varying float vSeed, vDist;
        void main(){
          vec3 axis = ${glv(SUN)}; float y = position.y;
          vec3 c = aBase + axis * (y * aDim.y);
          vec3 side = normalize(cross(axis, cameraPosition - c));
          vec3 wp = c + side * position.x * aDim.x * (1.0 + 0.3 * y);
          vUv = vec2(position.x + 0.5, y); vSeed = aDim.z;
          vec4 mv = viewMatrix * vec4(wp, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D tNoise; uniform float uFpTime, uAmt, uFpNight; varying vec2 vUv; varying float vSeed, vDist;
        void main(){
          float x = abs(vUv.x - 0.5) * 2.0, e = 1.0 - x * x; e *= e;
          float streak = texture2D(tNoise, vec2(vUv.x * 0.42 + vSeed * 3.0, vSeed + uFpTime * 0.006)).g;           // 縦のすじ（ゆっくり動く）
          float dust = texture2D(tNoise, vec2(vUv.x * 0.9 + vSeed, vUv.y * 1.6 - uFpTime * 0.015)).r;            // 光の中のほこり
          float vert = smoothstep(0.0, 0.05, vUv.y) * mix(0.5, 1.0, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
          float a = e * (0.4 + 1.3 * smoothstep(0.28, 0.72, streak)) * (0.8 + 0.4 * dust) * vert * uAmt;
          a *= smoothstep(0.7, 3.2, vDist) * exp(-vDist * 0.02) * (0.86 + 0.14 * sin(uFpTime * 0.55 + vSeed * 40.0));   // 近すぎる所・遠い所はうすく
          gl_FragColor = vec4(mix(${glc(S.col)}, vec3(0.72, 0.82, 1.0), uFpNight), a * (1.0 - ${glf(1 - NIGHT.shaft)} * uFpNight)); }`,      // 夜は、うすい月あかりの筋
    });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'light_shafts';
    return { mesh, list };
  }

  // ---------------------------------------------------------------- にじむ光の板（加算。bloom パスの代わり）
  // items = [{ p: Vector3, size, color, opacity, flat?（地面に寝かせる）, phase? }]。nightK：夜の強さ（昼を 1 として。なければ cfg.night.cards。日の光を表す板は 1 より小さくする）
  function createGlowCards(items, name = 'glow_cards', nightK = NIGHT.cards) {
    const n = items.length, geo = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index; geo.setAttribute('position', base.attributes.position);
    const aC = new Float32Array(n * 4), aCol = new Float32Array(n * 4), aFx = new Float32Array(n * 2), col = new THREE.Color();
    items.forEach((it, i) => {
      aC.set([it.p.x, it.p.y, it.p.z, it.size], i * 4); col.set(it.color); aCol.set([col.r, col.g, col.b, it.opacity], i * 4);
      aFx.set([it.flat ? 1 : 0, it.phase ?? hash2(i, 3) * 6.283], i * 2);
    });
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4)); geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 4));
    geo.setAttribute('aFx', new THREE.InstancedBufferAttribute(aFx, 2)); geo.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { uFpTime: fpU.uFpTime, uAmt: { value: 1 }, uFpNight: fpU.uNight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec4 aC, aCol; attribute vec2 aFx; uniform float uFpTime; varying vec2 vP; varying vec4 vCol;
        void main(){
          vP = position.xy * 2.0; vCol = aCol; vCol.a *= 0.86 + 0.14 * sin(uFpTime * 1.3 + aFx.y);
          vec4 mv;
          if (aFx.x > 0.5) mv = viewMatrix * vec4(aC.xyz + vec3(position.x, 0.0, position.y) * aC.w, 1.0);
          else { mv = viewMatrix * vec4(aC.xyz, 1.0); mv.xy += position.xy * aC.w; }
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uAmt, uFpNight; varying vec2 vP; varying vec4 vCol;
        void main(){ float d = length(vP); float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vCol.rgb, a * vCol.a * uAmt * (1.0 + ${glf(nightK - 1)} * uFpNight)); }`,      // 夜は、にじむ光が強い
    });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = name;
    return mesh;
  }

  // 幹・根・枝のマテリアル：縦に長い樹皮のすじ ＋ まだらな光
  function createBarkMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tNoise = fpU.tNoise;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aBark; varying vec2 vBark;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBark = aBark;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tNoise; varying vec2 vBark;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          { float g1 = texture2D(tNoise, vec2(vBark.x * 0.9, vBark.y * 0.06)).r, g2 = texture2D(tNoise, vec2(vBark.x * 2.7 + 0.3, vBark.y * 0.2)).g;
            diffuseColor.rgb *= 0.6 + 0.8 * smoothstep(0.3, 0.75, g1 * 0.65 + g2 * 0.35); }`);
    };
    m.customProgramCacheKey = () => 'fpBark';
    return addDapple(m);
  }
  // 巨木 1 本ぶんの形（根は buildRoots で地面にそわせて作る）
  //   幹：木ごとに、かたむき・ゆるい S 字・くの字の曲がり・太さのむら・こぶ・折れた枝のあと。根元は板のように広がる。曲がりの強さは cfg.trunk.bend（なければ 1。opt.bend でも）
  //   枝：曲線で、根元が太く先へ細い。上へ反る／下がってから上がる／途中で折れ曲がる／ねじれる、を 1 本ずつ変える。太い枝 → 中の枝 → 小枝に分かれ、つけ根は太らせて幹になじませる
  //   枝ぶり（opt.style。なければ、作った順に 0 → 1 → 2）：0 ＝ 上のほうだけに枝のある高い木、1 ＝ 低い所から横へ広がる木、2 ＝ 曲がりくねった年よりの木
  // detail 1 ＝ 近くで見る木（userData.mid に、同じ形の粗い版も入る。createTreeMeshes が、道から遠い木とスマホに使う）、0 ＝ 遠くの木（粗い）
  // userData：anchors（葉のかたまりをのせる場所 ＝ 枝と中の枝の先）・H・R0
  let treeNo = 0;
  function buildGiantTree(seed, detail, opt = {}) {
    const r = rng(seed), T = FOREST.trunk, B = opt.bend ?? T.bend ?? 1;
    const H = 17 + r() * 5, R0 = 0.72 + r() * 0.25;                 // （高さと太さは、前と同じ乱数の順 ＝ 木を置く場所は変わらない）
    const style = opt.style ?? (detail ? treeNo++ % 3 : 0);
    const bark = new THREE.Color(T.bark), bark2 = new THREE.Color(T.bark2), moss = new THREE.Color(T.moss);
    // 幹の中心線：かたむき ＋ S 字 ＋ くの字 ＋ 小さなうねり（地面の近くは動かさない ＝ 根元の場所は変わらない）
    const leanA = r() * 6.283, lean = (0.3 + r() * 1.3) * B, sA = r() * 6.283, sAmp = (0.25 + r() * 0.55) * B * (style === 2 ? 1.5 : 1), sF = 1.1 + r() * 1.3, sPh = r() * 6.283;
    const kA = r() * 6.283, kT0 = 0.35 + r() * 0.3, kAmp = (r() < 0.6 ? 0.8 + r() * 1.4 : 0) * B, wA = r() * 6.283, wPh = r() * 6.283;
    const lowK = clamp((B - 1) / 1.3, 0, 1), kT = kT0 * lerp(1, 0.45, lowK), sK = lerp(1, 0.5, lowK), lp = lerp(1.6, 1.15, lowK);      // 曲がりの強い森（bend > 1）：低い所から曲がる（葉にかくれない高さで、曲がりが見える）
    const axis = (y) => {
      const t = Math.max(0, y) / H, g = sstep(y, 0.3, 3.0), l = lean * Math.pow(t, lp), s = sAmp * sK * Math.sin(t * Math.PI * sF + sPh) * g * lerp(0.35 + 0.65 * t, 0.9, lowK), k = kAmp * Math.max(0, t - kT), w = 0.1 * B * Math.sin(y * 0.8 + wPh) * g;
      return V3(Math.cos(leanA) * l + Math.cos(sA) * s + Math.cos(kA) * k + Math.cos(wA) * w, y, Math.sin(leanA) * l + Math.sin(sA) * s + Math.sin(kA) * k + Math.sin(wA) * w);
    };
    const nb = 3 + Math.floor(r() * 2), ph = r() * 6.283, ph2 = r() * 6.283, ph3 = r() * 6.283;
    const radius = (y) => R0 * (0.3 + 0.7 * Math.pow(1 - clamp(y / H, 0, 1), 0.75)) * (1 + 0.07 * Math.sin(y * 1.1 + ph3) + 0.04 * Math.sin(y * 2.9 + ph)) * (1 - 0.9 * sstep(y, H - 3.2, H));      // 太さのむら。てっぺんへ向かって細くとがる（平らな切り口を作らない）
    const YS = [[-0.5, 0.3, 1.2, 3, 6, 10, 14.5, H], [-0.6, 0.1, 0.6, 1.3, 2.4, 4.1, 6.5, 10, 15, H], [-0.7, 0, 0.25, 0.6, 1.1, 1.7, 2.4, 3.2, 4.1, 5.2, 6.5, 8, 10, 12.5, 15.5, H]];
    const burls = []; for (let k = 0, n = 2 + (style === 2 ? 2 : 0); k < n; k++) burls.push({ y: YS[2][5 + Math.floor(r() * 5)], th: r() * 6.283, a: 0.16 + r() * 0.2 });      // こぶ
    const trunkRad = (y, th) => {
      const f = Math.exp(-Math.max(y, 0) / 1.0), lob = 0.6 * Math.sin(nb * th + ph) + 0.4 * Math.sin((nb + 2) * th + ph2); let k = (1 + 0.6 * f) * (1 + (0.06 + 0.3 * f) * lob);
      for (const b of burls) { const c = Math.cos(th - b.th); if (c > 0) k += b.a * c * c * c * Math.exp(-Math.pow((y - b.y) / 0.5, 2)); }
      return radius(y) * k;
    };
    const trunkCol = (y, th) => { const f = Math.exp(-Math.max(y, 0) / 2.4); return bark.clone().lerp(bark2, 0.5 + 0.5 * Math.sin(th * 3 + y)).lerp(moss, clamp(0.85 * f + 0.2 * Math.sin(th * 2 + ph), 0, 0.9)); };
    // 曲がった枝の道すじ：base から、向き（az・el）を少しずつ変えながら n 区間のびる。kind ＝ 0 上へ反る / 1 下がってから上がる / 2 途中で折れ曲がる / 3 ねじれる。minY より下へは行かない（道の上で頭に当たらない）
    const dirOf = (az, el) => V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const path = (base, az0, el0, len, n, kind, wob, minY = 4.2) => {
      const pts = [base.clone()], p = base.clone(), pp = r() * 6.283, sg = r() < 0.5 ? -1 : 1, ku = 0.35 + 0.3 * r(), amt = 0.6 + 0.6 * r();
      for (let j = 1; j <= n; j++) {
        const u = (j - 0.5) / n; let az = az0, el = el0;
        if (kind === 0) el += 0.9 * amt * u;
        else if (kind === 1) el += amt * (-1.0 * Math.sin(Math.PI * u) + 1.2 * u * u);
        else if (kind === 2) { if (u > ku) { az += sg * 0.9 * amt; el += 0.5 * amt; } }
        else { az += sg * 1.5 * amt * u; el += 0.35 * u; }
        el = clamp(el + wob * 0.25 * Math.sin(u * 7 + pp), -0.6, 1.35); az += wob * 0.3 * Math.sin(u * 5 + pp * 1.7);
        if (p.y < minY + 0.5) el = Math.max(el, 0.25);
        p.add(dirOf(az, el).multiplyScalar(len / n)); pts.push(p.clone());
      }
      return pts;
    };
    const fork = (pts, i, turn, lift) => { const t = pts[i + 1].clone().sub(pts[i]).normalize(); return [Math.atan2(t.z, t.x) + turn, Math.asin(clamp(t.y, -1, 1)) + lift]; };      // 枝分かれの向き：もとの枝の向きから、横へ turn、上へ lift
    const ST = [{ y: [0.5, 0.92], el: [0.35, 0.8], len: [3.5, 6.5], n: 5 + Math.floor(r() * 2), wob: 1 },
      { y: [0.24, 0.75], el: [0.05, 0.4], len: [6, 9.5], n: 4 + Math.floor(r() * 2), wob: 1 },
      { y: [0.3, 0.85], el: [0.1, 0.7], len: [4.5, 8], n: 5, wob: 1.7 }][style];
    const limbs = [], anchors = [], np = detail ? ST.n : 4, a0 = r() * 6.283;      // limbs ＝ [{ pts, rad, lvl（0 太い枝 / 1 中の枝 / 2 小枝 / 3 折れた枝のあと）}]
    for (let k = 0; k < np; k++) {
      const a = a0 + k * 2.4 + (r() - 0.5) * 0.9, y0 = H * lerp(ST.y[0], ST.y[1], (k + r() * 0.8) / np), len = lerp(ST.len[0], ST.len[1], r()) * (1 - 0.3 * (y0 / H - ST.y[0])), el0 = lerp(ST.el[0], ST.el[1], r());
      const kind = style === 2 ? 1 + Math.floor(r() * 3) : Math.floor(r() * 4), rad = Math.max(0.15, radius(y0) * 0.5), P = path(axis(y0), a, el0, len, 7, kind, ST.wob);
      limbs.push({ pts: P, rad, lvl: 0 }); anchors.push({ p: P[7].clone(), r: 2.2 + r() * 0.8, tip: 1 });
      for (let q = 0, ns = detail ? 2 + Math.floor(r() * 2) : 1; q < ns; q++) {                    // 中の枝
        const i = 2 + Math.floor(r() * 4), [az, el] = fork(P, i, (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.7), 0.1 + r() * 0.5);
        const S = path(P[i], az, el, len * (0.32 + 0.25 * r()) * (1 - 0.05 * i), 4, Math.floor(r() * 4), ST.wob);
        limbs.push({ pts: S, rad: rad * (1 - 0.8 * i / 7) * 0.62 + 0.02, lvl: 1 }); anchors.push({ p: S[4].clone(), r: 1.6 + r() * 0.7 });
        for (let w = 0, nw = detail ? 1 + Math.floor(r() * 2) : 0; w < nw; w++) {                  // 小枝（葉のかたまりの中へのびる）
          const i2 = 1 + Math.floor(r() * 3), [az2, el2] = fork(S, i2, (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.8), r() * 0.6 - 0.1);
          limbs.push({ pts: path(S[i2], az2, el2, 0.9 + r() * 1.1, 2, 0, 1), rad: 0.045, lvl: 2 });
        }
      }
    }
    for (let k = 0, n = detail ? 1 + Math.floor(r() * 2) : 0; k < n; k++) {                         // 折れた枝のあと（幹の低い所の、短い枝）
      const y0 = 3.5 + r() * 4.5; limbs.push({ pts: path(axis(y0), r() * 6.283, 0.2 + r() * 0.4, 0.7 + r() * 0.6, 2, 0, 0.5, 0), rad: 0.15 + r() * 0.08, lvl: 3 });
    }
    anchors.push({ p: axis(H - 1), r: 3.4, top: 1 }, { p: axis(H * 0.8), r: 3.0 });      // top ＝ 幹のてっぺん、tip ＝ 太い枝の先（createTreeMeshes が、ここに必ず葉の房を付ける）
    const limbCol = [bark.clone().multiplyScalar(0.9), bark.clone().lerp(bark2, 0.3).multiplyScalar(0.86), bark2.clone().multiplyScalar(0.8), bark.clone().multiplyScalar(0.8)];
    const emit = (lod) => {                                         // lod：2 ＝ 細かい / 1 ＝ 中 / 0 ＝ 粗い（形は同じで、輪切りの数・小枝がちがう）
      const b = new TubeGeo(), ys = YS[lod];
      b.tube(ys.map(axis), [6, 8, 11][lod], (i, th) => trunkRad(ys[i], th), (i, th) => trunkCol(ys[i], th));
      for (const L of limbs) {
        if ((L.lvl === 2 && lod < 2) || (L.lvl === 3 && lod < 1)) continue;
        const n = L.pts.length - 1, step = L.lvl < 2 && lod < 2 ? 2 : 1, ids = []; for (let j = 0; j <= n; j++) if (j % step === 0 || j === n) ids.push(j);
        const sides = L.lvl === 0 ? [3, 4, 6][lod] : L.lvl === 1 ? [3, 3, 5][lod] : L.lvl === 2 ? 3 : 5, c = limbCol[L.lvl];
        b.tube(ids.map((j) => L.pts[j]), sides, (i) => { const u = ids[i] / n;
          const tipK = 1 - 0.88 * sstep(u, 0.72, 1);                                             // 先はとがらせる（切れた棒に見えない）
          return tipK * (L.lvl === 0 ? L.rad * (1 - 0.8 * u) * (1 + 0.8 * Math.exp(-u * 7)) + 0.03 : L.lvl === 1 ? L.rad * (1 - 0.75 * u) * (1 + 0.5 * Math.exp(-u * 7)) + 0.02 : L.lvl === 2 ? 0.045 * (1 - 0.6 * u) + 0.012 : L.rad * (1 - 0.6 * u)); }, () => c);
      }
      const geo = b.toGeometry(); geo.userData = { anchors, H, R0, style, top: axis(H) };
      return geo;
    };
    if (!detail) return emit(0);
    const geo = emit(2); geo.userData.mid = emit(1);
    return geo;
  }

  // 巨木を InstancedMesh にまとめて group に入れる。list = [{ x, y, z, s, rot, v（geos の番号）, layer }]。葉のかたまりの場所（anchors）を返す
  // 形に粗い版（userData.mid）があれば、道にいちばん近い木（layer 0）だけ細かい形で描き、ほかは粗い版で描く（スマホの軽い版は、ぜんぶ粗い版）
  function createTreeMeshes(list, geos, mat, group) {
    const dummy = new THREE.Object3D(), anchors = [], musts = [];
    geos.forEach((geo, v) => {
      const mine = list.filter((t) => t.v === v), mid = geo.userData.mid;
      for (const t of mine) {
        dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); t.m4 = dummy.matrix.clone();
        const far = t.layer === 2;
        for (const a of geo.userData.anchors) {
          const p = a.p.clone().applyMatrix4(t.m4); anchors.push({ p, r: a.r * t.s, layer: t.layer });
          // 必ず置く葉の房（must）：幹のてっぺんに 4 枚（遠くの木は大きな葉 3 枚）、太い枝の先に 1 枚ずつ ＝ どの木も、先が葉でおおわれる。createCanopy が、ふつうの葉とは別に、数どおりに置く
          if (a.top && geo.userData.top) { t.top = geo.userData.top.clone().applyMatrix4(t.m4); musts.push({ p: p.clone().lerp(t.top, 0.5), must: true, n: far ? 3 : 4, tr: (far ? 1.7 : 1.35) * t.s, ts: far ? [3.0, 4.4] : [1.7, 2.6], r: 0.01, layer: t.layer }); }
          else if (a.tip && !(LITE && far)) musts.push({ p, must: true, n: 1, tr: 0.45 * t.s, ts: far ? [2.8, 4.0] : [1.5, 2.3], r: 0.01, layer: t.layer });
        }
      }
      const sets = mid ? [[geo, LITE ? [] : mine.filter((t) => t.layer === 0), ''], [mid, LITE ? mine : mine.filter((t) => t.layer !== 0), '_mid']] : [[geo, mine, '']];
      for (const [g, items, tag] of sets) {
        if (!items.length) continue;
        const mesh = new THREE.InstancedMesh(g, mat, items.length);
        items.forEach((t, i) => mesh.setMatrixAt(i, t.m4));
        mesh.frustumCulled = false; mesh.name = `giant_tree_${v}${tag}`; group.add(mesh);
      }
      for (const t of mine) delete t.m4;
    });
    return anchors.concat(musts);
  }
  // 地面をはう大きな根：木ごとに 4〜5 本、地面の高さにそわせる。low(x, z) が 1 の所（小道の上）では低くして、ほとんど土にうもれさせる
  function buildRoots(list, r, { groundH, low }) {
    const bark = new THREE.Color(FOREST.trunk.bark), moss = new THREE.Color(FOREST.trunk.moss), roots = new TubeGeo();
    for (const t of list) {
      if (t.layer > (LITE ? 0 : 1)) continue;
      const nr = 4 + Math.floor(r() * 2), a0 = r() * 6.283;
      for (let k = 0; k < nr; k++) {
        const a = a0 + k / nr * 6.283 + (r() - 0.5) * 0.6, len = (1.8 + r() * 2.4) * t.s, rr = t.R * (0.3 + r() * 0.12), wig = (r() - 0.5) * 1.2, h0 = 0.5 * t.s, rp = [];
        for (let j = 0; j <= 6; j++) {
          const u = j / 6, d = t.R * 0.8 + u * len, aa = a + wig * u * u * 0.5, x = t.x + Math.cos(aa) * d, z = t.z + Math.sin(aa) * d, onPath = low ? low(x, z) : 0;
          rp.push(V3(x, groundH(x, z) + lerp(h0 * Math.pow(1 - u, 1.6) + 0.1 * Math.sin(u * 7 + k) * (1 - u) - 0.25 * u, -0.06 - 0.2 * u, onPath), z));
        }
        roots.tube(rp, 6, (i) => rr * (1 - 0.8 * i / 6) + 0.03, (i, th) => bark.clone().lerp(moss, 0.55 + 0.3 * Math.sin(th)));
      }
    }
    return roots.toGeometry();
  }

  // 森の中の光（頂点ごとに計算する軽い版）：空からの光 ＋ 太陽のほうを見たときに葉が透ける光 ＋ 大樹の光
  const FOREST_LIGHT_GLSL = `
    vec3 fpLight(vec3 wp, vec3 n, float open){
      vec3 l = mix(${glc(L.ground, L.hemiI * 0.3183)}, ${glc(L.sky, L.hemiI * 0.3183)}, 0.5 + 0.5 * n.y) * (0.55 + 0.45 * open);
      float trans = pow(max(dot(normalize(wp - cameraPosition), ${glv(SUN)}), 0.0), 2.5);
      l += ${glc(L.sun)} * (max(dot(n, ${glv(SUN)}), 0.0) * 0.3 + trans * 0.95) * open;
      vec3 tl = ${glv(TREE_GLOW_POS)} - wp; float td = length(tl);
      l += ${glc(L.tree)} * (9.0 / (6.0 + td * td * 0.06)) * (0.45 + 0.55 * max(dot(n, tl / td), 0.0)) * ${glf(L.treeGlow ?? 0.16)};
      return l;
    }`;

  // ---------------------------------------------------------------- 枝葉・茂み（葉の板を InstancedMesh で）
  // all = 葉のかたまりの一覧 [{ p, r, w（重み）, size: [小, 大], flat（たてのつぶれ）, bush?（低い茂み）, bright?（明るい色を多く）, upright?（板を立てる＝横から見る森のふち用）}]
  // reject(p, a) が true の所には置かない。r は乱数
  function createCanopy(all, { r, count, reject, palette, name = 'canopy' }) {
    const N = count, pal = (palette || FOREST.leaves).map((h) => new THREE.Color(h));
    const [u0, v0, u1, v1] = tileUV(TILE.leaves), geo = new THREE.CircleGeometry(0.5, 8), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    const m = new THREE.MeshBasicMaterial({ map: fpU.tAtlas.value, alphaTest: 0.45, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.uTime; sh.uniforms.uWind = windU.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aNrm; varying vec3 vLight;\n${WIND_GLSL}\n${FOREST_LIGHT_GLSL}`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          vec3 cardC = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          mvPosition.xyz += windOffset(vec3(cardC.x, 0.0, cardC.z), 1.0, 0.26 * clamp(cardC.y / 8.0, 0.12, 1.3));
          float wh = wHash(floor(cardC * 3.0)) * 6.2831;
          mvPosition.xyz += vec3(sin(uTime * 2.6 + wh), 0.5 * sin(uTime * 2.1 + wh * 1.3), cos(uTime * 2.3 + wh)) * 0.05 * uWind;
          vLight = fpLight(mvPosition.xyz, aNrm.xyz, aNrm.w);
          mvPosition = viewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vLight;');
    };
    m.customProgramCacheKey = () => 'fpCanopy';
    addDapple(m, 0.5);
    const musts = all.filter((a) => a.must), extra = musts.reduce((s, a) => s + a.n, 0); all = all.filter((a) => !a.must);      // must ＝ 必ず置く葉の房（幹のてっぺん・太い枝の先。createTreeMeshes が作る）
    const wsum = all.reduce((s, a) => s + a.w, 0);
    const mesh = new THREE.InstancedMesh(geo, m, N + extra), nrm = new Float32Array((N + extra) * 4), dummy = new THREE.Object3D(), col = new THREE.Color(), p = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
    let made = 0;
    for (let tries = 0; made < N && tries < N * 6; tries++) {
      let x = r() * wsum, a = all[0]; for (const k of all) { x -= k.w; if (x <= 0) { a = k; break; } }
      do d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); while (d.lengthSq() > 1 || d.lengthSq() < 0.01);
      d.normalize(); const rr = 0.25 + 0.75 * Math.sqrt(r());
      p.copy(a.p).add(V3(d.x * a.r * rr, d.y * a.r * rr * a.flat, d.z * a.r * rr));
      if (reject && reject(p, a)) continue;
      n.copy(d).multiplyScalar(0.7).add(V3(0, 0.55, 0)).normalize();
      const open = a.bush ? 0.75 : clamp(0.35 + 0.65 * rr + 0.25 * d.y, 0.25, 1);              // かたまりの内側は暗い
      nrm.set([n.x, n.y, n.z, open], made * 4);
      col.copy(pal[Math.floor(Math.pow(r(), a.bush || a.bright ? 0.7 : 1.25) * pal.length) % pal.length]).multiplyScalar(0.85 + 0.3 * r());
      mesh.setColorAt(made, col);
      dummy.position.copy(p);
      dummy.lookAt(p.x + d.x * 0.5 + (r() - 0.5) * 0.9, p.y + (r() < 0.5 ? 1 : -1) * (0.6 + r()) * (a.upright ? 0.25 : 1), p.z + d.z * 0.5 + (r() - 0.5) * 0.9);   // 下から見て面が見えるよう、ほぼ水平に
      dummy.rotateZ(r() * 6.283); dummy.scale.setScalar(lerp(a.size[0], a.size[1], r()) * (LITE ? 1.3 : 1)); dummy.updateMatrix();
      mesh.setMatrixAt(made++, dummy.matrix);
    }
    const r2 = rng(4242);                                             // 必ず置く葉の房：ふつうの葉とは別の乱数（ふつうの葉のならびは変わらない）。reject には掛けない
    for (const a of musts) for (let k = 0; k < a.n; k++) {
      do d.set(r2() * 2 - 1, r2() * 2 - 1, r2() * 2 - 1); while (d.lengthSq() > 1 || d.lengthSq() < 0.01);
      d.normalize(); const rr = k === 0 ? 0 : 0.45 + 0.45 * r2();                        // 1 枚めは、先のまん中に
      p.copy(a.p).add(V3(d.x * a.tr * rr, d.y * a.tr * rr * 0.5, d.z * a.tr * rr));
      n.copy(d).multiplyScalar(0.7).add(V3(0, 0.55, 0)).normalize(); nrm.set([n.x, n.y, n.z, 0.9], made * 4);
      col.copy(pal[Math.floor(Math.pow(r2(), 0.85) * pal.length) % pal.length]).multiplyScalar(0.88 + 0.26 * r2()); mesh.setColorAt(made, col);
      dummy.position.copy(p);
      dummy.lookAt(p.x + d.x * 0.5 + (r2() - 0.5) * 0.9, p.y + (r2() < 0.5 ? 1 : -1) * (0.6 + r2()) * (k % 2 ? 0.25 : 1), p.z + d.z * 0.5 + (r2() - 0.5) * 0.9);      // 1 枚おきに、立てた葉（横から見ても、すき間ができない）
      dummy.rotateZ(r2() * 6.283); dummy.scale.setScalar(lerp(a.ts[0], a.ts[1], r2()) * (LITE ? 1.3 : 1)); dummy.updateMatrix();
      mesh.setMatrixAt(made++, dummy.matrix);
    }
    mesh.count = made; geo.setAttribute('aNrm', new THREE.InstancedBufferAttribute(nrm, 4));
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; mesh.name = name;
    return mesh;
  }

  function createPlantMaterial() {
    const m = new THREE.MeshBasicMaterial({ map: fpU.tAtlas.value, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.uTime; sh.uniforms.uWind = windU.uWind; sh.uniforms.uFpFoot = fpU.uFoot;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec2 aKG; uniform vec4 uFpFoot; varying vec3 vLight; varying float vGlow;\n${WIND_GLSL}\n${FOREST_LIGHT_GLSL}`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
          vec3 pRoot = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float pSc = length(instanceMatrix[1].xyz), pK = aKG.x;
          mvPosition.xyz += windOffset(pRoot, pK, 0.2 * pSc);
          float pPh = wHash(floor(pRoot * 5.0)) * 6.2831;
          mvPosition.xyz += vec3(sin(uTime * 2.9 + pPh + position.y * 3.0), 0.0, cos(uTime * 2.4 + pPh)) * 0.022 * pK * uWind;
          vec2 pAway = mvPosition.xz - uFpFoot.xz; float pAd = length(pAway);                          // 歩くと、足もとの草がよける
          mvPosition.xz += pAway / max(pAd, 0.05) * (1.0 - smoothstep(0.35, 1.15, pAd)) * 0.4 * pK;
          vLight = fpLight(mvPosition.xyz, vec3(0.0, 1.0, 0.0), 0.45 + 0.55 * pK);
          vGlow = aKG.y * (0.85 + 0.15 * sin(uTime * 1.4 + pPh));
          mvPosition = viewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLight; varying float vGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vLight + vGlow * 0.95;');
    };
    m.customProgramCacheKey = () => 'fpPlant';
    return addDapple(m, 0.8);
  }

  // ---------------------------------------------------------------- ふさふさの短い草（nature.js の createGrass の代わりに使える。返り値の形は同じ ＝ group・u・count・update(cam, sun)。マテリアルに addDapple を掛けるのも、createViewWalker の grass にわたすのも同じ）
  // 1 株 ＝ 外へひらいた葉 5 枚（スマホは 4 枚）。株をカメラのまわりに、ます目を少しずらしてしきつめる：近くの輪はすき間なく、遠くの輪は数をへらして株を大きく。場所はタイル状で、カメラと一緒に動く
  // field・map：createGrass と同じ（地面の高さ・草の量の画像）。草の量が少ない所（道のきわ）は、株が小さく、まばらになる
  // o：{ scale（株の数の倍率）, height [低, 高]（葉の長さ m）, width（葉の幅の半分 m）, sway（ゆれ m）, soil [色A, 色B, lo, hi, a, b]（根元の色 ＝ そのエリアの地面の式 mix(A, B, smoothstep(lo, hi, n1)) * (a + b * n2) と同じにする）,
  //      deep・light（葉の色のはば）, tip（先の色）, near・far：{ R（輪の半径 m）, count（株の数）, big（株の大きさの倍率）}}
  function createTurf({ field, map, scale = 1, height = [0.15, 0.27], width = 0.028, sway = 0.07, soil, deep, light, tip, near = {}, far = {} }) {
    const NB = LITE ? 4 : 5, N = { R: 7.5, count: LITE ? 3400 : 5600, big: 1, ...near }, F = { R: 24, count: LITE ? 3400 : 5600, big: 2.3, ...far };
    const shared = { uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uField: { value: field },
      uHGrid: { value: new THREE.Vector4(map.hx0, map.hz0, map.hcell, 0) }, uHN: { value: new THREE.Vector2(map.nx, map.ny) }, tTurf: fpU.tNoise };
    const group = new THREE.Group(); group.name = 'grass_blades';
    let total = 0;
    const ring = ({ R, count, big }, inner) => {
      const g = new THREE.InstancedBufferGeometry(), pos = [], nrm = [], bl = [], idx = [], rr = rng(91);
      for (let b = 0; b < NB; b++) {                                  // 葉 1 枚 ＝ 三角形 3 枚（根元の左右・中ほどの左右・先）。aBl ＝（向き, 外へのたおれ方, 長さの割合, 乱数）。1 枚めは、まん中で立つ
        const o = b * 5, a = (b + rr() * 0.6) / NB * 6.2832, lean = b === 0 ? 0.3 : 0.7 + 0.6 * rr(), len = b === 0 ? 1 : 0.7 + 0.3 * rr(), sd = rr();
        pos.push(-1, 0, 0, 1, 0, 0, -0.7, 0.5, 0, 0.7, 0.5, 0, 0, 1, 0);
        for (let k = 0; k < 5; k++) { nrm.push(0, 1, 0); bl.push(a, lean, len, sd); }
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
      }
      g.setIndex(idx); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('aBl', new THREE.Float32BufferAttribute(bl, 4));
      const side = Math.max(1, Math.round(Math.sqrt(count * scale))), n = side * side, ab = new Float32Array(n * 4), r2 = rng(777 + n);
      for (let i = 0; i < n; i++) ab.set([((i % side) + 0.1 + 0.8 * r2()) / side, (Math.floor(i / side) + 0.1 + 0.8 * r2()) / side, r2(), r2()], i * 4);      // ます目 ＋ ずれ（かたよらず、すき間ができない）
      g.setAttribute('aB', new THREE.InstancedBufferAttribute(ab, 4)); g.instanceCount = n; total += n;
      const u = { ...shared, uTile: { value: 2 * R }, uR: { value: R }, uInner: { value: inner }, uBig: { value: big } };
      const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u, { uTime: windU.uTime, uWind: windU.uWind });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
            attribute vec4 aB, aBl; uniform vec3 uCamPos, uSunDir; uniform vec2 uHN; uniform vec4 uHGrid; uniform float uTile, uR, uInner, uBig; uniform sampler2D uField;
            varying vec2 vGW; varying float vT, vFar, vTrans, vHue;
            ${WIND_GLSL}`)
          .replace('#include <begin_vertex>', `
            vec2 rel = mod(aB.xy * uTile - uCamPos.xz + 0.5 * uTile, uTile) - 0.5 * uTile;
            vec2 wxz = uCamPos.xz + rel;
            vec2 fld = texture2D(uField, ((wxz - uHGrid.xy) / uHGrid.z + 0.5) / uHN).rg;      // 地面の高さ・草の量
            float d = length(vec3(rel.x, fld.r - uCamPos.y, rel.y));
            float keep = (1.0 - smoothstep(uR * 0.72, uR, d)) * smoothstep(uInner, uInner + 2.0, d);
            float alive = smoothstep(aB.z - 0.15, aB.z, keep) * smoothstep(0.1, 0.4, fld.g + (aB.w - 0.5) * 0.3);      // 遠く・道のきわは間引く（ぱっと消えず、縮んで消える）
            float sc = uBig * (0.8 + 0.4 * fract(aB.w * 3.7)) * alive * mix(0.6, 1.0, smoothstep(0.25, 0.9, fld.g));   // 株の大きさ
            float y = position.y, hgt = mix(${glf(height[0])}, ${glf(height[1])}, fract(aB.w * 7.31)) * aBl.z * sc;      // この葉の長さ
            float ang = aBl.x + aB.z * 6.2831 + (fract(aB.w * 31.7 + aBl.w) - 0.5) * 0.8, lean = aBl.y * (0.75 + 0.5 * fract(aB.z * 13.3 + aBl.w * 5.1));
            vec2 outw = vec2(cos(ang), sin(ang)), side = vec2(-outw.y, outw.x);
            vec3 transformed = vec3(wxz.x, fld.r - 0.02, wxz.y);
            transformed.xz += outw * 0.025 * sc * step(0.3, aBl.y) + side * position.x * ${glf(width)} * sc * (0.8 + 0.5 * aBl.w);
            transformed.y += hgt * (y - 0.3 * lean * y * y);                                   // 先は少したれる
            transformed.xz += outw * hgt * lean * (0.3 * y + 0.7 * y * y);                     // 外へひらく
            transformed += windOffset(vec3(wxz.x, fld.r, wxz.y), y, ${glf(sway)} * sc);
            vGW = wxz; vT = y; vFar = smoothstep(uR * 0.35, uR * 0.95, d) * step(1.5, uBig); vHue = fract(aB.w * 5.7 + aBl.w * 0.37);
            vTrans = pow(max(dot(normalize(transformed - cameraPosition), normalize(uSunDir)), 0.0), 3.0) * y * y;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tTurf; uniform vec3 uSunC; varying vec2 vGW; varying float vT, vFar, vTrans, vHue;')
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')     // 葉はみな上向き（地面と同じ光）
          .replace('#include <color_fragment>', `#include <color_fragment>
            float tn1 = texture2D(tTurf, vGW * 0.045).g, tn2 = texture2D(tTurf, vGW * 0.31).r;
            vec3 tRoot = mix(${glc(soil[0])}, ${glc(soil[1])}, smoothstep(${glf(soil[2])}, ${glf(soil[3])}, tn1)) * (${glf(soil[4])} + ${glf(soil[5])} * tn2);      // 根元 ＝ 地面の色（境目が見えない）
            vec3 tLeaf = mix(${glc(deep)}, ${glc(light)}, clamp(vHue * 0.55 + tn2 * 0.75 - 0.1, 0.0, 1.0));                                                         // 深い緑 〜 明るい緑（株ごと・場所ごとのむら）
            vec3 tc = mix(mix(tRoot * 0.78, tLeaf, smoothstep(0.0, 0.55, vT)), ${glc(tip)}, smoothstep(0.5, 1.0, vT) * 0.55);                                        // 先は少し明るい
            diffuseColor.rgb = mix(tc, mix(tRoot, tLeaf, 0.6), vFar * 0.7);`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSunC * 0.3 * vTrans * (1.0 - vFar);');   // 先が透けて光る
      };
      m.customProgramCacheKey = () => 'fpTurf';
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
      group.add(mesh);
    };
    ring(N, -10); ring(F, N.R * 0.6);
    const fwd = new THREE.Vector3();
    return { group, u: shared, count: total,
      // 輪のまん中は、カメラの 3.2 m 先の足もと（3 人称ではエルフのあたり。上から見おろしても、見上げても、見えている近くの地面が濃い輪に入る）
      update(cam, sun) { cam.getWorldDirection(fwd); shared.uCamPos.value.set(cam.position.x + fwd.x * 3.2, cam.position.y - 1.3, cam.position.z + fwd.z * 3.2); shared.uSunDir.value.copy(sun.position).sub(sun.target.position); shared.uSunC.value.copy(sun.color).multiplyScalar(sun.intensity); } };
  }

  // ---------------------------------------------------------------- 舞う花びら（位置はすべてシェーダーで時間から計算）
  // pos：シェーダーの文。float tt（一生の 0〜1）と vec3 p（場所）を決める。aS（乱数 4 つ）・uFpTime・cameraPosition が使える。head：その前に置く関数。bright：日なたの明るさ
  function createPetals({ count, pos, head = '', bright = 1 }) {
    const n = count, geo = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1.25), [u0, v0, u1, v1] = tileUV(TILE.petal);
    const uv = base.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', uv);
    const s = new Float32Array(n * 4), r = rng(77); for (let i = 0; i < n * 4; i++) s[i] = r();
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4)); geo.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFpTime: fpU.uFpTime, tDapple: fpU.tDapple, tAtlas: fpU.tAtlas }, side: THREE.DoubleSide, fog: true,
      vertexShader: `attribute vec4 aS; varying vec2 vUv; varying vec3 vCol;
        #include <fog_pars_vertex>
        ${DAPPLE_GLSL}
        ${head}
        void main(){
          ${pos}
          float a1 = tt * 60.0 + aS.z * 6.28, a2 = tt * 43.0 + aS.w * 6.28;
          mat3 ry = mat3(cos(a1), 0.0, -sin(a1), 0.0, 1.0, 0.0, sin(a1), 0.0, cos(a1));
          mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(a2), sin(a2), 0.0, -sin(a2), cos(a2));
          float sc = (0.06 + 0.035 * aS.x) * smoothstep(0.0, 0.05, tt) * (1.0 - smoothstep(0.93, 1.0, tt)) * smoothstep(0.35, 1.3, distance(p, cameraPosition));   // 目のすぐ前では小さく
          vec3 wp = p + ry * rx * (position * sc);
          vUv = uv; vCol = ${glc('#ffe4ee')} * (${glf(0.62 * bright)} + 1.5 * fpDapple(p)) + ${glc('#ffd0e0')} * 0.12;         // 光の筋の中で明るくなる
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D tAtlas; varying vec2 vUv; varying vec3 vCol;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(tAtlas, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(vCol * t.rgb, 1.0);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = 'petals';
    return mesh;
  }

  // ---------------------------------------------------------------- 宙にただよう光の粒（3 種類：光の筋の中で光るほこり / 青緑のホタル / 広場でのぼる桃色の光）
  // pos（xyz）・seed（乱数, 種類 0 ほこり / 1 ホタル / 2 のぼる光）・ground（その場所の地面の高さ。なければ 0）
  function createMotes({ pos, seed, ground }) {
    const sd = seed, grd = ground || new Float32Array(sd.length / 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 2)); g.setAttribute('aGround', new THREE.BufferAttribute(grd, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uFpTime: fpU.uFpTime, tDapple: fpU.tDapple, uPR: fpU.uPR }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec2 aSeed; attribute float aGround; uniform float uPR; varying vec4 vCol;
        ${DAPPLE_GLSL}
        void main(){
          vec3 p = position; float s = aSeed.x, ph = s * 6.2831, k = aSeed.y, t = uFpTime;
          p.x += sin(t * 0.31 + ph) * 0.7 + sin(t * 0.83 + ph * 2.1) * 0.2; p.z += cos(t * 0.27 + ph * 1.7) * 0.7; p.y += sin(t * 0.45 + ph * 1.3) * 0.3;
          if (k > 1.5) p.y = 0.2 + mod(p.y + t * (0.18 + s * 0.25), 9.0);                                       // 広場の光はゆっくりのぼる
          p.y += aGround;
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float size = 0.05, a = 1.0; vec3 c;
          if (k < 0.5) { float d = fpDapple(p); c = ${glc('#fff0c4')}; a = 0.1 + 1.6 * d; size = 0.035 + 0.02 * s; }                    // ほこり：光の筋の中だけ明るい
          else if (k < 1.5) { c = mix(${glc('#a8ffd8')}, ${glc('#c8f4ff')}, s); a = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * (0.9 + s) + ph * 3.0), 3.0); size = 0.07 + 0.04 * s; }
          else { c = mix(${glc('#ffd6e6')}, ${glc('#fff4d8')}, s); a = 0.5 + 0.5 * sin(t * (1.2 + s * 1.5) + ph); size = 0.07 + 0.06 * s; }
          a *= smoothstep(0.25, 1.2, -mv.z) * exp(mv.z * 0.03);
          vCol = vec4(c, a);
          gl_PointSize = min(size * 900.0 * uPR / max(0.5, -mv.z), 48.0 * uPR); }`,
      fragmentShader: `varying vec4 vCol;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a * vCol.a; if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, a); }`,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 7; pts.name = 'motes';
    return pts;
  }

  // ---------------------------------------------------------------- 蝶（羽ばたき・飛ぶ道すじ・向きはシェーダーで計算）
  // homeFn(r, i) → [x, z, 地面の高さ]：i 匹めの蝶のいる所
  function createButterflies(count, homeFn, seed = 63) {
    const n = count, r = rng(seed), geo = new THREE.InstancedBufferGeometry(), [u0, v0, u1, v1] = tileUV(TILE.wing);
    // 羽 2 枚：x = 0 が体、x = 1 が羽の先。aSide で左右
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u1, v0, u0, v0, u0, v1, u1, v1, u1, v0, u0, v0], 2));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute([1, 1, 1, 1, -1, -1, -1, -1], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const home = new Float32Array(n * 3), sd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [x, z, gy = 0] = homeFn(r, i);
      home.set([x, gy + 0.8 + r() * 0.9, z], i * 3); sd.set([r(), 0.6 + r() * 1.3, 0.5 + r() * 0.5, r()], i * 4);
    }
    geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 3)); geo.setAttribute('aS', new THREE.InstancedBufferAttribute(sd, 4)); geo.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFpTime: fpU.uFpTime, tAtlas: fpU.tAtlas }, side: THREE.DoubleSide, fog: true,
      vertexShader: `attribute vec3 aHome; attribute vec4 aS; attribute float aSide; uniform float uFpTime; varying vec2 vUv; varying vec3 vCol;
        #include <fog_pars_vertex>
        vec3 flyAt(float t, float rad, float ph){ return vec3(sin(t + ph) * rad + sin(t * 2.3 + ph) * 0.25, sin(t * 1.7 + ph * 2.0) * 0.35 + sin(t * 6.1 + ph) * 0.05, sin(t * 0.8 + ph * 1.3) * rad * 0.8); }
        void main(){
          float ph = aS.x * 6.2831, t = uFpTime * aS.z * 0.55;
          vec3 c = aHome + flyAt(t, aS.y, ph), v = flyAt(t + 0.05, aS.y, ph) - flyAt(t - 0.05, aS.y, ph);
          float yaw = atan(v.x, v.z), flap = 0.25 + 1.05 * sin(uFpTime * (11.0 + aS.w * 5.0) + ph * 9.0);
          vec3 q = vec3(aSide * position.x * cos(flap), position.x * sin(flap), position.z) * (0.07 + 0.03 * aS.w);
          vec3 wp = c + vec3(q.x * cos(yaw) + q.z * sin(yaw), q.y, -q.x * sin(yaw) + q.z * cos(yaw));
          vUv = uv; vCol = mix(mix(${glc('#bfeaff')}, ${glc('#ffe0f2')}, aS.w), ${glc('#fff6c8')}, step(0.75, aS.x)) * 0.95;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D tAtlas; varying vec2 vUv; varying vec3 vCol;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(tAtlas, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(vCol * (0.35 + 0.65 * t.rgb), 1.0);
          #include <fog_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.name = 'butterflies';
    return mesh;
  }

  // ---------------------------------------------------------------- 昼と夜：スイッチ（#timeBtn。ここで作る）を押すと、空・霧・光が N.secs 秒かけて変わる。はじめは昼。URL に ?time=night で夜から
  // sky：nature.js の createSky の u（空の色を昼 ⇔ 夜で変える。自分の空を持つページは null にして onNight で変える）
  // ownFog：手前の霧の色（scene.fog.color）をページが自分で決める / onNight(v)：夜の度合い v（0〜1）が変わるたびに呼ぶ（街灯・大樹の花の光 など）
  function createDayNight({ params, scene, sky = null, ownFog = false, onNight = null }) {
    const N = NIGHT, col = (h) => new THREE.Color(h), st = { target: params.get('time') === 'night' ? 1 : 0, x: 0, v: -1 };
    st.x = st.target;
    const fog0 = scene.fog.color.clone(), fog1 = col(N.fog.nearCol), bg = scene.background && scene.background.isColor ? [scene.background.clone(), col(N.fog.farCol)] : null;
    const SK = sky ? [['uZen', N.sky.zen], ['uHor', N.sky.hor], ['uLow', N.sky.low], ['uCloud', N.sky.cloud], ['uCloudSh', N.sky.cloudSh], ['uSunCol', N.sky.sun]].map(([k, h]) => [sky[k].value, sky[k].value.clone(), col(h)]) : [];
    const sun0 = sky ? sky.uSunAmt.value : 0, cloud0 = sky ? sky.uCloudAmt.value : 0;
    function apply(v) {
      if (v === st.v) return; st.v = v;
      fpU.uNight.value = v; scene.fog.far = v;                       // 霧のシェーダーへ（kfNight）
      if (!ownFog) scene.fog.color.lerpColors(fog0, fog1, v);
      if (bg) scene.background.lerpColors(bg[0], bg[1], v);
      for (const [c, a, b] of SK) c.lerpColors(a, b, v);
      if (sky) { sky.uSunAmt.value = lerp(sun0, N.sky.sunAmt, v); sky.uStars.value = N.sky.stars * v; if (N.sky.cloudAmt != null) sky.uCloudAmt.value = lerp(cloud0, N.sky.cloudAmt, v); }
      if (onNight) onNight(v);
    }
    const btn = document.createElement('button'); btn.id = 'timeBtn'; btn.type = 'button'; btn.setAttribute('role', 'switch'); btn.setAttribute('aria-label', '昼と夜の切りかえ'); btn.innerHTML = timeSwitchSVG(); document.body.append(btn);
    const ui = () => { const n = st.target === 1; btn.classList.toggle('night', n); btn.setAttribute('aria-checked', String(n)); timeState.night = n; };
    const api = {
      night: N,
      get isNight() { return st.target === 1; }, get value() { return st.v; },
      // night：true 夜 / false 昼。instant：すぐ切りかえる（確認用）
      set(night, instant = false) { st.target = night ? 1 : 0; ui(); if (instant) { st.x = st.target; apply(st.x); } },
      toggle() { api.set(st.target !== 1); },
      update(dt) { if (st.x === st.target) return; st.x = st.target > st.x ? Math.min(1, st.x + dt / N.secs) : Math.max(0, st.x - dt / N.secs); apply(st.x * st.x * (3 - 2 * st.x)); },
    };
    btn.addEventListener('click', () => { api.toggle(); btn.blur(); });
    ui(); apply(st.x); frameHooks.push(api.update);
    window.__dayNight = api;                                         // 確認用
    return api;
  }

  return { U: fpU, cfg, NIGHT, createDayNight, createTurf, DAPPLE_GLSL, LIGHT_GLSL: FOREST_LIGHT_GLSL, installFog, addDapple, createDappleTexture, createLightShafts, createGlowCards,
    createBarkMaterial, buildGiantTree, createTreeMeshes, buildRoots, createCanopy, createPlantMaterial, createPetals, createMotes, createButterflies };
}

// ================================================================ 音（素材ファイルなし。Web Audio で合成する）
// 風（見た目の風の波に合わせて強くなる）・葉ずれ・鳥・足音・大樹のひびき（近づくと大きくなる）。最初のタップのあとに unlock() を呼ぶ。
// opts（エリアごとのちがい。書かなければ森の小道の値）：
//   wind  { g: [静かなとき, 風の波で足す量], lp: [低い音の高さ, 足す量], hi: [葉ずれ, 足す量], bp: [葉ずれの高さ, 足す量] }
//   birds { set: 'forest'（森の鳥）| 'open'（ひらけた場所の鳥：ヒバリ・トビ・カッコウ）, vol: [小, 幅], gap: [次までの秒, 幅] }
//   steps { low: 土をふむ音, thump: 低いどすん, swish: [草のかさっ, 幅] }   tone: false で大樹のひびきなし   water: true で水の音（update の s.water ＝ 水への近さ 0〜1）
//   tone { notes: [Hz…], amps: […], gain, lp: [低, 幅], chimes: false（ひとりでに鳴る鈴を止める）} でひびきを変えられる。chime(Hz, 大きさ, 左右) で鈴を鳴らせる
//   drips: true で水のしずく（update の s.drip ＝ 聞こえやすさ 0〜1）
//   falls: true で滝の音（update の s.falls ＝ 滝への近さ 0〜1。低いごうごう ＋ しぶきのざあっ）
//   splash(大きさ, 左右) で、浅い水をふむ音（足音の代わりに呼ぶ）
export function createAreaAudio(opts = {}) {
  const W = { g: [0.2, 0.42], lp: [300, 720], hi: [0.008, 0.06], bp: [3600, 1500], ...opts.wind }, B = { set: 'forest', vol: [0.025, 0.06], gap: [1.0, 4.5], ...opts.birds };
  const S = { low: 0.2, thump: 0.16, swish: [0.03, 0.025], ...opts.steps }, TONE = opts.tone !== false;
  const TN = { notes: [146.83, 220.0, 293.66, 369.99, 440.0, 587.33], amps: [0.5, 0.42, 0.34, 0.2, 0.22, 0.1], gain: 0.6, lp: [350, 2700], chimes: true, ...(typeof opts.tone === 'object' ? opts.tone : {}) };
  let ctx = null, master = null, analyser = null, parts = null, muted = false, acc = 0;
  // 太陽ゲーム（?game=sun）：エリアの合成音（風・葉ずれ・鳥・虫・水・滝・しずく・足音・鈴・大樹のひびき）は鳴らさない。音はぜんぶ sun_game.js の音のファイル。
  //   AudioContext も作らない（unlock は何もしない）。音のオン・オフ（setMuted・isMuted）は、今までどおり状態だけ持つ ＝ 右上の音のボタン → sun_game.js の音、のつなぎはそのまま
  const SILENT = new URLSearchParams(location.search).get('game') === 'sun';
  const noiseBuffer = (sec, brown) => {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    const m = Math.floor(ctx.sampleRate * 0.25); for (let i = 0; i < m; i++) { const k = i / m; d[i] = d[i] * k + d[n - m + i] * (1 - k); }      // くり返しのつなぎ目をなめらかに
    return { b, loopEnd: (n - m) / ctx.sampleRate };
  };
  const loop = (nb) => { const s = ctx.createBufferSource(); s.buffer = nb.b; s.loop = true; s.loopEnd = nb.loopEnd; return s; };
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filter = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const panner = (p) => { if (!ctx.createStereoPanner) return gain(1); const n = ctx.createStereoPanner(); n.pan.value = p; return n; };
  // 森のひびき（短い残響）
  function makeReverb() {
    const n = Math.floor(ctx.sampleRate * 2.0), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.8); }
    const cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  // 風と葉ずれ
  function makeWind(out) {
    const low = loop(noiseBuffer(6, true)), lp = filter('lowpass', 420, 0.4), g = gain(0);
    low.connect(lp).connect(g).connect(out);
    const hi = loop(noiseBuffer(4, false)), bp = filter('bandpass', 4200, 0.6), g2 = gain(0);
    hi.connect(bp).connect(g2).connect(out);
    low.start(); hi.start();
    return { update(now, gust) {
      g.gain.setTargetAtTime(W.g[0] + W.g[1] * gust, now, 0.5); lp.frequency.setTargetAtTime(W.lp[0] + W.lp[1] * gust, now, 0.6);
      g2.gain.setTargetAtTime(W.hi[0] + W.hi[1] * gust * gust, now, 0.35); bp.frequency.setTargetAtTime(W.bp[0] + W.bp[1] * gust, now, 0.5);
    } };
  }
  // 鳥：短いさえずりを、ときどき、左右のどこかから
  function makeBirds(out, send) {
    let next = 0;
    const chirp = (t0, f0, f1, dur, vol, pan, vib = 0) => {
      const o = ctx.createOscillator(), g = gain(0.0001), p = panner(pan);
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      if (vib) { const l = ctx.createOscillator(), lg = gain(f0 * 0.06); l.frequency.value = vib; l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(p); p.connect(out); p.connect(send); o.start(t0); o.stop(t0 + dur + 0.05);
    };
    const phrases = [
      (t0, v, pan) => { const n = 3 + Math.floor(Math.random() * 3), f = 3000 + Math.random() * 900; for (let i = 0; i < n; i++) chirp(t0 + i * 0.13, f, f * 1.28, 0.07, v, pan); return n * 0.13; },          // ピピピ
      (t0, v, pan) => { const f = 1700 + Math.random() * 400; chirp(t0, f, f * 0.98, 0.26, v, pan); chirp(t0 + 0.32, f * 1.25, f * 1.5, 0.16, v, pan); chirp(t0 + 0.5, f * 1.5, f * 1.2, 0.12, v * 0.8, pan); return 0.7; },   // ホー・ピチュ
      (t0, v, pan) => { const f = 2500 + Math.random() * 600; chirp(t0, f, f * 1.05, 0.42, v * 0.8, pan, 28); return 0.45; },                                                                                  // ふるえる声
      (t0, v, pan) => { const f = 560 + Math.random() * 80; chirp(t0, f, f * 0.9, 0.3, v * 1.3, pan); chirp(t0 + 0.42, f, f * 0.88, 0.34, v * 1.3, pan); return 0.8; },                                       // 遠くの低い声
    ];
    // ひらけた場所の鳥：空の高い所でさえずり続けるヒバリ、トビの「ピーヒョロロ」、遠くのカッコウ、近くの小鳥
    const open = [
      (t0, v, pan) => { const dur = 2.2 + Math.random() * 2.2; let t = 0;
        while (t < dur) { const f = 2800 + Math.random() * 1900, d = 0.045 + Math.random() * 0.06; chirp(t0 + t, f, f * (Math.random() < 0.5 ? 1.25 : 0.8), d, v * (0.45 + 0.55 * Math.random()), pan); t += d + 0.015 + Math.random() * 0.05; }
        return dur; },
      (t0, v, pan) => { chirp(t0, 2350, 2150, 0.55, v * 0.9, pan); chirp(t0 + 0.6, 2150, 1500, 0.75, v * 0.9, pan, 13); return 1.4; },
      (t0, v, pan) => { chirp(t0, 672, 660, 0.2, v * 1.5, pan); chirp(t0 + 0.32, 532, 520, 0.3, v * 1.5, pan); return 0.7; },
      phrases[0],
    ];
    const list = B.set === 'open' ? open : phrases;
    return { count: 0, update(now) {
      if (now < next) return;
      const k = Math.floor(Math.random() * list.length), vol = B.vol[0] + Math.random() * B.vol[1], pan = Math.random() * 1.7 - 0.85, rep = Math.random() < 0.35 ? 2 : 1;
      let t0 = now + 0.05; for (let i = 0; i < rep; i++) t0 += list[k](t0, vol, pan) + 0.25;
      this.count++; next = t0 + B.gap[0] + Math.random() * B.gap[1];
    } };
  }
  // 足音：やわらかい土をふむ音 ＋ 草のかさっという音
  function makeFootsteps(out, send) {
    const nb = noiseBuffer(0.5, false);
    return { count: 0, play(foot) {
      const t0 = ctx.currentTime, p = panner(foot ? 0.16 : -0.16); p.connect(out); const sg = gain(0.25); p.connect(sg).connect(send);
      const s = ctx.createBufferSource(); s.buffer = nb.b; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const lp = filter('lowpass', 520 + Math.random() * 480, 0.9), g = gain(0.0001);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(S.low, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      s.connect(lp).connect(g).connect(p); s.start(t0, Math.random() * 0.2); s.stop(t0 + 0.25);
      const o = ctx.createOscillator(), og = gain(0.0001); o.frequency.setValueAtTime(96, t0); o.frequency.exponentialRampToValueAtTime(46, t0 + 0.11);
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(S.thump, t0 + 0.008); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      o.connect(og).connect(p); o.start(t0); o.stop(t0 + 0.16);
      const s2 = ctx.createBufferSource(); s2.buffer = nb.b; const hp = filter('highpass', 2600, 0.5), g2 = gain(0.0001);
      g2.gain.setValueAtTime(0.0001, t0 + 0.02); g2.gain.exponentialRampToValueAtTime(S.swish[0] + Math.random() * S.swish[1], t0 + 0.035); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
      s2.connect(hp).connect(g2).connect(p); s2.start(t0 + 0.02, Math.random() * 0.2); s2.stop(t0 + 0.2);
      this.count++;
    } };
  }
  // 水の音（泉・小川・噴水）：近づくほど大きい。さらさら（高めの音）＋ こぽこぽ（ゆれる低めの音）
  function makeWater(out, send) {
    const hi = loop(noiseBuffer(3, false)), bp = filter('bandpass', 2400, 0.9), g = gain(0); hi.connect(bp).connect(g).connect(out);
    const lo = loop(noiseBuffer(5, true)), bp2 = filter('bandpass', 700, 2.5), g2 = gain(0), sg = gain(0.3); lo.connect(bp2).connect(g2).connect(out); g2.connect(sg).connect(send);
    hi.start(); lo.start();
    return { gain: 0, update(now, near) {
      this.gain = 0.11 * near;
      g.gain.setTargetAtTime(this.gain * (0.75 + 0.5 * Math.random()), now, 0.12); bp.frequency.setTargetAtTime(2000 + 1400 * Math.random(), now, 0.25);
      g2.gain.setTargetAtTime(this.gain * 2.2 * (0.5 + Math.random()), now, 0.1); bp2.frequency.setTargetAtTime(450 + 700 * Math.random(), now, 0.08);
    } };
  }
  // 大樹のひびき：重なる長い音（和音）＋ ときどき鈴のような音。近づくほど大きく、明るくなる
  function makeTreeTone(out, send) {
    const bus = gain(0), lp = filter('lowpass', 400, 0.5); lp.connect(bus); bus.connect(out); const sg = gain(0.9); bus.connect(sg).connect(send);
    const amps = TN.amps;
    const voices = TN.notes.map((f, i) => {
      const o = ctx.createOscillator(), g = gain(0); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 9;
      o.connect(g).connect(lp); o.start(); return { g, amp: amps[i], ph: Math.random() * 6.283, sp: 0.06 + Math.random() * 0.1 };
    });
    const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51]; let nextChime = 0;
    const chime = (t0, f, vol, pan) => {
      const p = panner(pan), g = gain(0.0001); p.connect(out); const cs = gain(1.4); p.connect(cs).connect(send);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
      for (const [mul, a] of [[1, 1], [2.01, 0.28], [3.02, 0.08]]) { const o = ctx.createOscillator(), og = gain(a); o.frequency.value = f * mul; o.connect(og).connect(g); o.start(t0); o.stop(t0 + 2.7); }
      g.connect(p);
    };
    return { gain: 0, chimes: 0, chime, update(now, t, prox) {
      this.gain = TN.gain * Math.pow(prox, 1.6);
      bus.gain.setTargetAtTime(this.gain, now, 0.5); lp.frequency.setTargetAtTime(TN.lp[0] + TN.lp[1] * prox, now, 0.5);
      for (const v of voices) v.g.gain.setTargetAtTime(v.amp * (0.6 + 0.4 * Math.sin(t * v.sp * 6.283 + v.ph)), now, 0.3);
      if (TN.chimes && prox > 0.1 && now > nextChime) { chime(now + 0.05, scale[Math.floor(Math.random() * scale.length)], 0.03 + 0.12 * prox, Math.random() * 1.2 - 0.6); this.chimes++; nextChime = now + (0.9 + Math.random() * 3.2) * (1.7 - prox); }
    } };
  }
  // 水のしずく：ぽちゃん（短い音が下がって上がる ＋ 残響）。amt（0〜1）が大きいほど、よく聞こえる
  function makeDrips(out, send) {
    let next = 0;
    return { count: 0, update(now, amt) {
      if (amt <= 0.02 || now < next) return;
      const t0 = now + 0.05, f = 900 + Math.random() * 900, o = ctx.createOscillator(), g = gain(0.0001), p = panner(Math.random() * 1.6 - 0.8), sg = gain(1.6);
      o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + 0.03); o.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + 0.11);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09 * amt, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(p); p.connect(out); p.connect(sg).connect(send); o.start(t0); o.stop(t0 + 0.25);
      this.count++; next = t0 + 0.8 + Math.random() * 3.6;
    } };
  }
  // 滝の音：低いごうごう（近いほど大きく、こもりが取れる）＋ しぶきのざあっ。near（0〜1）＝ 滝への近さ
  function makeFalls(out, send) {
    const lo = loop(noiseBuffer(6, true)), lp = filter('lowpass', 300, 0.5), g = gain(0); lo.connect(lp).connect(g).connect(out);
    const hi = loop(noiseBuffer(4, false)), bp = filter('bandpass', 1500, 0.35), g2 = gain(0), sg = gain(0.25); hi.connect(bp).connect(g2).connect(out); g2.connect(sg).connect(send);
    lo.start(); hi.start();
    return { gain: 0, update(now, near) {
      const k = near * near; this.gain = 0.3 * k;
      g.gain.setTargetAtTime(this.gain * (0.9 + 0.2 * Math.random()), now, 0.4); lp.frequency.setTargetAtTime(260 + 520 * near, now, 0.5);
      g2.gain.setTargetAtTime(0.11 * k * (0.85 + 0.3 * Math.random()), now, 0.3); bp.frequency.setTargetAtTime(1100 + 1500 * near, now, 0.5);
    } };
  }
  // 浅い水をふむ音：短い ぱしゃ（雑音がすぐ消える）＋ 小さな ぽちゃ（音が上がる）
  function makeSplash(out, send) {
    const nb = noiseBuffer(0.6, false);
    return { count: 0, play(vol, pan) {
      const t0 = ctx.currentTime, p = panner(pan); p.connect(out); const sg = gain(0.5); p.connect(sg).connect(send);
      const s = ctx.createBufferSource(); s.buffer = nb.b; s.playbackRate.value = 0.9 + Math.random() * 0.5;
      const bp = filter('bandpass', 1500 + Math.random() * 1200, 0.8), g = gain(0.0001);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.1 * vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      s.connect(bp).connect(g).connect(p); s.start(t0, Math.random() * 0.2); s.stop(t0 + 0.4);
      const o = ctx.createOscillator(), og = gain(0.0001), f = 420 + Math.random() * 260; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.9, t0 + 0.09);
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.045 * vol, t0 + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(og).connect(p); o.start(t0); o.stop(t0 + 0.16); this.count++;
    } };
  }
  function unlock() {
    if (SILENT) return true;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC();
      master = gain(muted ? 0 : 0.9); const comp = ctx.createDynamicsCompressor(); analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
      comp.connect(master); master.connect(analyser); analyser.connect(ctx.destination);
      const out = gain(1); out.connect(comp); const rev = makeReverb(), wet = gain(0.5), send = gain(1); send.connect(rev).connect(wet).connect(comp);
      parts = { wind: makeWind(out), birds: makeBirds(out, send), steps: makeFootsteps(out, send), tone: TONE ? makeTreeTone(out, send) : null, water: opts.water ? makeWater(out, send) : null, drips: opts.drips ? makeDrips(out, send) : null, falls: opts.falls ? makeFalls(out, send) : null, splash: makeSplash(out, send) };
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }
  const pause = () => { if (ctx && ctx.state === 'running') ctx.suspend(); }, resume = () => { if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  window.addEventListener('pagehide', pause); window.addEventListener('pageshow', resume);
  return {
    unlock,
    // s = { gust（風の波 0〜1。gustAt で作る）, prox（大樹への近さ 0〜1）, t（風の時間）}。0.1 秒ごとに音の大きさを合わせる
    update(dt, s) {
      if (!ctx || ctx.state !== 'running') return; acc += dt; if (acc < 0.1) return; acc = 0;
      const now = ctx.currentTime;
      parts.wind.update(now, s.gust); parts.birds.update(now); if (parts.tone) parts.tone.update(now, s.t, s.prox || 0); if (parts.water) parts.water.update(now, s.water || 0); if (parts.drips) parts.drips.update(now, s.drip || 0); if (parts.falls) parts.falls.update(now, s.falls || 0);
    },
    footstep(foot) { if (ctx && ctx.state === 'running') parts.steps.play(foot); },
    splash(vol = 1, pan = 0) { if (ctx && ctx.state === 'running') parts.splash.play(vol, pan); },
    // 鈴のような音を 1 つ鳴らす（キノコが明るくなるとき など）
    chime(freq, vol = 0.06, pan = 0) { if (ctx && ctx.state === 'running' && parts.tone) { parts.tone.chime(ctx.currentTime + 0.02, freq, vol, pan); parts.tone.chimes++; } },
    setMuted(v) { muted = !!v; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.08); },
    isMuted: () => muted,
    // 確認用：今の状態と、出ている音の大きさ（RMS）
    state() {
      if (!ctx) return { ctx: 'none', silent: SILENT, muted };
      const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); let sum = 0; for (const v of d) sum += v * v;
      return { ctx: ctx.state, muted, drips: parts.drips ? parts.drips.count : 0, water: parts.water ? +parts.water.gain.toFixed(3) : 0, falls: parts.falls ? +parts.falls.gain.toFixed(3) : 0, rms: +Math.sqrt(sum / d.length).toFixed(4), treeGain: parts.tone ? +parts.tone.gain.toFixed(3) : 0, chimes: parts.tone ? parts.tone.chimes : 0, birds: parts.birds.count, steps: parts.steps.count, splashes: parts.splash.count };
    },
  };
}

// ================================================================ 操作
// スマホ：画面の左半分をドラッグで移動、右半分をドラッグで見回す。PC：WASD・矢印キーで移動、マウスドラッグで見回す。
// タッチの端末（body.touch）：移動のスティックは、画面の左下に いつも出ている（#stick.fixed）。土台のまわりの広い範囲（下の inStickZone）にふれると、
//   土台のまん中から指までの向きと距離で歩く（大きく倒すほど速い ＝ いっぱいで走る）。指をはなすと、つまみは静かにまん中へもどる。そのほかの所のドラッグは、今までどおり見回す
//   操作が止まっている間（演出・はじめの画面）は消える。妖精のセリフ（#sunTalk.show）が左下にかかるときは、その上へ よける
//   タッチのない端末（マウス）では出さない（キーボードで歩く）
export function createWalkControls(dom, player, camera, { stickEl, knobEl } = {}) {
  const keys = new Set(), stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 }, R = 56;
  let locked = true;
  const FIXED = !!stickEl && document.body.classList.contains('touch');
  if (FIXED) { stickEl.classList.add('fixed'); stickEl.classList.add('locked'); }
  const resetStick = () => { stick.id = null; stick.x = stick.y = 0; if (stickEl) { stickEl.classList.remove('on'); knobEl.style.transform = 'translate(-50%,-50%)'; } };
  const baseC = () => { const r = stickEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; };
  const inStickZone = (x, y) => { const [cx, cy, br] = baseC(); return Math.hypot(x - cx, y - cy) < br * 1.9 || (x < Math.min(window.innerWidth * 0.45, cx + br * 2.4) && y > cy - br * 1.6); };      // 土台のまわり（半径の 1.9 倍）と、その左下のすみ
  if (FIXED) {                                                         // セリフの枠が左下にかかるときは、スティックをその上へ（指を置いている間は動かさない）
    setInterval(() => { if (stick.id !== null) return; const t = document.querySelector('#sunTalk.show'); let lift = 0;
      if (t) { const r = t.getBoundingClientRect(), b = stickEl.getBoundingClientRect(), cur = parseFloat(stickEl.style.getPropertyValue('--lift')) || 0;
        if (r.left < b.right + 8 && r.right > b.left - 8) lift = Math.max(0, b.bottom + cur - r.top + 12); }      // b.bottom + cur ＝ よけていないときの土台の下のはし
      stickEl.style.setProperty('--lift', `${Math.round(lift)}px`); }, 200);
    const help = document.querySelector('#help .touch'); if (help && /左半分/.test(help.textContent)) help.textContent = '左下の丸で歩く ／ ドラッグで見回す';
  }
  dom.addEventListener('pointerdown', (e) => {
    if (locked) return;
    try { dom.setPointerCapture(e.pointerId); } catch (_) { /* 古いブラウザ */ }
    if (FIXED && e.pointerType !== 'mouse' && stick.id === null && inStickZone(e.clientX, e.clientY)) {      // 左下のスティック：土台のまん中から
      const [cx, cy] = baseC(); stick.id = e.pointerId; stick.cx = cx; stick.cy = cy; stickEl.classList.add('on'); move(e);
    } else if (!FIXED && e.pointerType !== 'mouse' && e.clientX < window.innerWidth / 2 && stick.id === null) {
      stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY; stick.x = stick.y = 0;
      if (stickEl) { stickEl.style.left = `${e.clientX}px`; stickEl.style.top = `${e.clientY}px`; stickEl.classList.add('on'); }
    } else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
  });
  function move(e) {
    let dx = e.clientX - stick.cx, dy = e.clientY - stick.cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    stick.x = dx / R; stick.y = dy / R; if (knobEl) knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  dom.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) move(e);
    else if (e.pointerId === look.id) {
      const k = (e.pointerType === 'mouse' ? 0.0042 : 0.0058) * (camera.fov / 70);
      player.yaw -= (e.clientX - look.x) * k; player.pitch = clamp(player.pitch - (e.clientY - look.y) * k, -1.25, 1.35);
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const up = (e) => { if (e.pointerId === stick.id) resetStick(); if (e.pointerId === look.id) look.id = null; };
  dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  const MOVE = { KeyW: [1, 0], ArrowUp: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], KeyA: [0, -1], ArrowLeft: [0, -1], KeyD: [0, 1], ArrowRight: [0, 1] };
  window.addEventListener('keydown', (e) => { if (MOVE[e.code]) { keys.add(e.code); e.preventDefault(); } });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); resetStick(); look.id = null; });
  return {
    keys, stick,
    lock(b) { locked = b; if (b) { keys.clear(); resetStick(); look.id = null; } if (FIXED) stickEl.classList.toggle('locked', b); },      // 止まっている間は、左下のスティックも消す
    // 前後 f・左右 s（-1〜1）
    read() {
      if (locked) return { f: 0, s: 0 };
      let f = -stick.y, s = stick.x; for (const c of keys) { f += MOVE[c][0]; s += MOVE[c][1]; }
      const d = Math.hypot(f, s); if (d > 1) { f /= d; s /= d; }
      return { f, s };
    },
  };
}

// 歩く（速さ・とまる所・足音）と、目の位置（歩くときのごく弱いゆれ・立っているときの呼吸）
export function createWalker({ player, controls, camera, constrain, groundH, eye, speed, stepLen = 0.74, onStep, helpEl }) {
  return {
    update(dt) {
      const inp = controls.read(), sn = Math.sin(player.yaw), cs = Math.cos(player.yaw), sp = speed;
      const tx = (-sn * inp.f + cs * inp.s) * sp, tz = (-cs * inp.f - sn * inp.s) * sp, a = 1 - Math.exp(-dt * 9);
      player.vx += (tx - player.vx) * a; player.vz += (tz - player.vz) * a;
      const [nx, nz] = constrain(player.x + player.vx * dt, player.z + player.vz * dt), moved = Math.hypot(nx - player.x, nz - player.z);
      player.x = nx; player.z = nz; player.walk += moved;
      const st = Math.floor(player.walk / stepLen + 0.5); if (st !== player.step) { player.step = st; if (onStep) onStep(st % 2); }
      player.moving += ((dt > 0 && moved / dt > 0.35 ? 1 : 0) - player.moving) * (1 - Math.exp(-dt * 7));
      if (player.walk > 1.5 && helpEl) helpEl.classList.add('off');
    },
    placeCamera(t) {
      const ph = player.walk / stepLen * Math.PI, m = player.moving;
      const bobY = -Math.cos(ph * 2) * 0.017 * m + Math.sin(t * 1.1) * 0.004, bobX = Math.sin(ph) * 0.013 * m;
      camera.position.set(player.x + Math.cos(player.yaw) * bobX, groundH(player.x, player.z) + eye + bobY, player.z - Math.sin(player.yaw) * bobX);
      camera.rotation.set(player.pitch, player.yaw, Math.sin(ph) * 0.0035 * m);
    },
  };
}
export const newPlayer = (o = {}) => ({ x: 0, z: 0.4, yaw: 0, pitch: 0.06, vx: 0, vz: 0, walk: 0, step: 0, moving: 0, ...o });

// ================================================================ 視点の切りかえ：3 人称（エルフを後ろから追う。player_avatar.js）⇔ 1 人称（createWalker。今までと同じ）
// createWalker の代わりに使う（update(dt)・placeCamera(t) は同じ形）。はじめは 3 人称。URL に ?view=fp で 1 人称から。画面の「視点」ボタン（#viewBtn。ここで作る）で切りかえる。
// 引数は createWalker と同じ ＋ { params, scene, addDapple（キットの。エルフにもエリアの光とかげを掛ける）, U（キットの uniform）, grass（nature.js の createGrass の返り値。3 人称のとき、エルフの足もとの草をねかせる）, avatar }
//   avatar：{ footH(x, z)：エルフの足の高さ（なければ groundH。石段のように「歩く高さ」と「見た目の段」がちがう所で使う）,
//             cam：{ dist, min, height, pitch, minPitch, maxPitch, ground, margin（歩ける所からカメラが出てよい距離 m。数か、(x, z) の関数）},
//             blockers：[{ x, y, z, r, ky? }]（カメラが入ってはいけない球。ky ＝ たての つぶれ）, light：アニメ影の光の向き [x, y, z],
//             tint：色（'#rrggbb' か、毎フレーム THREE.Color を返す関数）＝ エリアの暗さ・色に合わせる, dapple：まだらな光の強さ }
// カメラは、キャラから後ろへ少しずつ進めて調べ、「地面の下・歩ける所の外（＝木の幹、岩かべ、根のトンネルのかべ）・blockers の中」に入る手前で止める（近づける）
const viewState = { mode: 'tp' };                                   // 今の視点（createTravel が、次のエリアへ引きつぐ）
export function createViewWalker(o) {
  const { params, scene, camera, player, controls, constrain, groundH } = o, A = o.avatar || {};
  const fp = createWalker(o);
  const cam = { dist: 3.4, min: 0.9, height: 1.2, pitch: -0.16, minPitch: -0.95, maxPitch: 0.5, ground: 0.3, margin: 0.45, ...(A.cam || {}) };
  const footH = A.footH || groundH, blockers = A.blockers || [], marginAt = typeof cam.margin === 'function' ? cam.margin : () => cam.margin;
  const SUN_TP = params.get('game') === 'sun';                       // 太陽ゲーム：いつも 3 人称（ユーザーの決定）。視点のボタンは出さず、?view=fp も効かない（確認用には window.__walker.setMode('fp') だけが使える）
  const st = { mode: params.get('view') === 'fp' && !SUN_TP ? 'fp' : 'tp', avatar: null, loading: null, dist: cam.dist, y: null, camY: null, lastT: null, mats: [] };
  viewState.mode = st.mode;
  const tgt = new THREE.Vector3(), q = new THREE.Vector3(), dir = new THREE.Vector3();
  const btn = document.createElement('button'); btn.id = 'viewBtn'; btn.type = 'button'; btn.setAttribute('aria-label', '視点の切りかえ'); document.body.append(btn);
  if (SUN_TP) { btn.hidden = true; btn.tabIndex = -1; }                 // 出さない（area_kit.css の html.sunGame #viewBtn でも消す）
  btn.innerHTML = '<svg class="tp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7.2" r="3.4"/><path d="M5.2 20.2c0-4.2 3-6.8 6.8-6.8s6.8 2.6 6.8 6.8"/></svg>'      // 3 人称：人のかたち
    + '<svg class="fp" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.2 12s3.6-6.4 9.8-6.4S21.8 12 21.8 12s-3.6 6.4-9.8 6.4S2.2 12 2.2 12z"/><circle cx="12" cy="12" r="3"/></svg>';   // 1 人称：目
  const tp = () => st.mode === 'tp' && st.avatar;
  const foot = o.U ? o.U.uFoot.value : new THREE.Vector4();
  if (o.grass && o.U) for (const mesh of o.grass.group.children) {      // 草：エルフのまわり 1.3 m は、ねて、外へよける（3 人称のときだけ。エルフが草にうもれない）
    const m = mesh.material, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      sh.uniforms.uFpFoot = o.U.uFoot;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uFpFoot;')
        .replace('#include <project_vertex>', `{ vec2 fa = transformed.xz - uFpFoot.xz; float fd = length(fa), fk = (1.0 - smoothstep(0.35, 1.3, fd)) * uFpFoot.w;
          transformed.y -= y * hgt * 0.8 * fk; transformed.xz += fa / max(fd, 0.05) * y * 0.3 * fk; }\n#include <project_vertex>`);
    };
    m.customProgramCacheKey = () => `${prevKey()}|fpFoot`; m.needsUpdate = true;
  }
  function apply() {
    viewState.mode = st.mode; btn.classList.toggle('fp', st.mode === 'fp'); btn.title = st.mode === 'fp' ? '1 人称（押すと 3 人称）' : '3 人称（押すと 1 人称）';
    if (st.avatar) { st.avatar.setVisible(st.mode === 'tp'); if (st.mode === 'tp') sync(); }
  }
  // エルフを、今の player の場所・向きに合わせる（視点を切りかえたとき・場面を切りかえたとき）
  function sync() { const av = st.avatar; av.state.facing = player.yaw + Math.PI; av.update(0); st.y = av.root.position.y; st.camY = null; st.dist = cam.dist; }
  function load() {
    if (!st.loading) st.loading = import('./player_avatar.js')
      .then((m) => m.createPlayerAvatar({ scene, camera, player, controls, groundH: footH, constrain, speed: o.speed, onStep: o.onStep, helpEl: o.helpEl, light: A.light, shadow: A.shadow }))
      .then((av) => {
        av.root.traverse((n) => { if (n.isMesh) { if (o.addDapple) o.addDapple(n.material, A.dapple ?? 0.5); if (typeof A.tint === 'string') n.material.color.set(A.tint); n.material.needsUpdate = true; st.mats.push(n.material); } });
        st.avatar = av; apply(); return av;
      })
      .catch((e) => { console.warn('エルフを読みこめなかったので、1 人称にします', e); st.mode = 'fp'; apply(); return null; });
    return st.loading;
  }
  const blocked = (p) => {
    if (p.y < groundH(p.x, p.z) - 0.35) return true;                // 地面の下（少しだけなら、あとで持ち上げる）
    const [cx, cz] = constrain(p.x, p.z); if (Math.hypot(cx - p.x, cz - p.z) > marginAt(p.x, p.z)) return true;      // 歩ける所の外
    for (const b of blockers) { const dx = p.x - b.x, dy = (p.y - b.y) * (b.ky || 1), dz = p.z - b.z; if (dx * dx + dy * dy + dz * dz < b.r * b.r) return true; }
    return false;
  };
  const api = {
    get mode() { return st.mode; }, get avatar() { return st.avatar; }, cam, state: st, ready: () => (st.mode === 'tp' ? load() : Promise.resolve(null)),
    setMode(m) { st.mode = m === 'fp' ? 'fp' : 'tp'; apply(); return st.mode === 'tp' ? load() : Promise.resolve(null); },
    toggle() { return api.setMode(st.mode === 'tp' ? 'fp' : 'tp'); },
    sync() { if (tp()) sync(); },
    update(dt) {
      if (!tp()) return fp.update(dt);
      const av = st.avatar; av.update(dt);
      const ty = av.root.position.y;                                // 足の高さは、段差でかくっとしないよう、すばやく なめらかに追う
      if (st.y === null || dt <= 0 || Math.abs(ty - st.y) > 1.2) st.y = ty; else st.y += (ty - st.y) * (1 - Math.exp(-dt * 22));
      av.root.position.y = st.y;
    },
    placeCamera(t, dt) {
      if (!tp()) { fp.placeCamera(t); foot.set(camera.position.x, camera.position.y, camera.position.z, 0); return; }
      const av = st.avatar;
      if (dt === undefined) dt = st.lastT === null ? 0 : clamp(t - st.lastT, 0, 0.05); st.lastT = t;
      if (Math.abs(av.root.position.x - player.x) + Math.abs(av.root.position.z - player.z) > 1e-4) { sync(); dt = 0; }      // 場面を切りかえた（player が動かされた）
      if (typeof A.tint === 'function') { const c = A.tint(); for (const m of st.mats) m.color.copy(c); }
      const p = clamp(player.pitch + cam.pitch, cam.minPitch, cam.maxPitch), cp = Math.cos(p);
      if (st.camY === null || dt <= 0) st.camY = st.y; else st.camY += (st.y - st.camY) * (1 - Math.exp(-dt * 10));
      tgt.set(player.x, st.camY + cam.height, player.z); dir.set(Math.sin(player.yaw) * cp, -Math.sin(p), Math.cos(player.yaw) * cp);
      let ok = cam.dist; const N = 9;
      for (let i = 1; i <= N; i++) {
        if (!blocked(q.copy(tgt).addScaledVector(dir, cam.dist * i / N))) continue;
        let lo = cam.dist * (i - 1) / N, hi = cam.dist * i / N;        // じゃまな物の手前を、もう少し細かくさがす
        for (let k = 0; k < 4; k++) { const mid = (lo + hi) / 2; if (blocked(q.copy(tgt).addScaledVector(dir, mid))) hi = mid; else lo = mid; }
        ok = Math.max(cam.min, lo - 0.12); break;
      }
      if (dt <= 0) st.dist = ok; else st.dist += (ok - st.dist) * (1 - Math.exp(-dt * (ok < st.dist ? 24 : 3.5)));      // 近づくのは速く、はなれるのはゆっくり
      q.copy(tgt).addScaledVector(dir, st.dist); q.y = Math.max(q.y, groundH(q.x, q.z) + cam.ground);
      camera.position.copy(q); camera.lookAt(tgt);
      foot.set(player.x, st.y, player.z, 1);
    },
  };
  btn.addEventListener('click', () => { api.toggle(); btn.blur(); });
  apply(); if (st.mode === 'tp') load();
  window.__walker = api;                                           // 確認用
  return api;
}

// はじまり：最初のタップで音を鳴らす許可をもらい、操作できるようにする（#gate・#soundBtn）
// エリア名（はじめの画面の <h1>）：下の表にあるエリアは、オリジナルの字「Ohisama Title」で出す（area_kit.css の #gate h1.areaName）。
// 太陽ゲーム（?game=sun）では、選んだ言語で出す（sun_game.js と同じ決め方：URL の ?lang= → localStorage の sunGame_lang → 端末の言語 → English）。html は日本語のまま ＝ 表のキー
export const AREA_NAMES = {
  '花の丘': { en: 'Flower Hill', zh: '花之丘', ko: '꽃의 언덕' },
  '苔むした遺跡': { en: 'Mossy Ruins', zh: '苔藓遗迹', ko: '이끼 낀 유적' },
  '光るキノコの谷': { en: 'Glowing Mushroom Valley', zh: '发光蘑菇谷', ko: '빛나는 버섯 골짜기' },
  '水晶の洞くつ': { en: 'Crystal Cave', zh: '水晶洞窟', ko: '수정 동굴' },
  '小川と滝': { en: 'Stream and Falls', zh: '小溪与瀑布', ko: '시냇물과 폭포' },
  '森の小道': { en: 'Forest Path', zh: '森林小路', ko: '숲속 오솔길' },
  '見晴らしの崖': { en: 'Lookout Cliff', zh: '观景悬崖', ko: '전망 절벽' },
};
function showAreaName(params) {
  const gateEl = document.getElementById('gate'), h1 = gateEl && gateEl.querySelector('h1'), ja = h1 ? h1.textContent.trim() : '', T = AREA_NAMES[ja];
  if (!T) return;
  h1.classList.add('areaName');
  if (params.get('game') !== 'sun') return;
  const ok = (l) => l === 'ja' || !!T[l]; let lang = params.get('lang');
  if (!ok(lang)) { try { lang = localStorage.getItem('sunGame_lang'); } catch (_) { lang = null; } }
  if (!ok(lang)) { lang = String(navigator.language || 'en').toLowerCase().slice(0, 2); if (!ok(lang)) lang = 'en'; }
  h1.textContent = lang === 'ja' ? ja : T[lang]; h1.lang = { ja: 'ja', en: 'en', zh: 'zh-Hans', ko: 'ko' }[lang];
  gateEl.classList.add('sunArea'); gateEl.dataset.lang = lang;      // 日本語のそえ書きは出さず、ボタンは「Start」（タイトル画面と同じ）。data-lang ＝ エリア名の字を言語ごとに決める（area_kit.css の UI 案 C）
  const tap = gateEl.querySelector('.tap'); if (tap) tap.textContent = 'Start';
}
// 太陽ゲーム（?game=sun）のエリアのページ（ほかのエリアから来たときも、URL を直接開いたときも、再読みこみも）：はじめの画面に Start を出さない。読みこみ中は暗い画面にエリア名だけ（ページの読みこみ直後から。area_kit.css の html.sunAuto）、
//   準備ができたら（景色が数コマ描けたら）エリア名を少し見せて、画面ぜんたいを静かにフェードして消す。操作はすぐできる（画面は押せない ＝ 指やクリックは、そのまま景色の操作へ）。
//   音：ブラウザは、ページを移ったあと、何か押すまで音を鳴らせないことがある。なので着いたときに一度ためし（鳴らせるブラウザでは、そのまま鳴る）、鳴らせなかったら、最初のキー・タップ・クリックで鳴らしはじめる
//   花の丘（太陽ゲームの中心。sun_game.js が はじめの画面を使う）は、エリア名を出さず、今までどおり すぐ はじめの画面を消して、暗い色から短く明ける（createTravel）
//   花の丘かどうかは、ページが flower_hill.js を読むかで決める（公開版では花の丘が /ohisama/（index.html）なので、ファイルの名前では分からない）
const SUN_Q = new URLSearchParams(location.search), SUN_GAME_Q = SUN_Q.get('game') === 'sun' && !SUN_Q.has('shot');
const SUN_HILL = !!document.querySelector('script[src*="flower_hill"]') || /sun_start|flower_hill/.test(location.pathname);
const SUN_AREA_AUTO = SUN_GAME_Q && !SUN_HILL, SUN_AUTO = SUN_AREA_AUTO || (SUN_GAME_Q && SUN_Q.has('from'));      // 花の丘は、ほかのエリアから来たときだけ（はじめは sun_game.js のタイトル画面）
if (SUN_Q.get('game') === 'sun') document.documentElement.classList.add('sunGame');
if (SUN_AUTO) { document.documentElement.classList.add('sunAuto'); if (SUN_AREA_AUTO) showAreaName(SUN_Q); }
export function wireStart({ params, controls, audio }) {
  showAreaName(params);
  const gateEl = document.getElementById('gate'), soundBtn = document.getElementById('soundBtn');
  const start = () => { audio.unlock(); gateEl.classList.add('off'); controls.lock(false); };
  const firstInput = () => { const first = () => { audio.unlock(); window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true); };
    window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true); };
  if (SUN_AREA_AUTO) {                             // 太陽ゲームでエリアを移った：Start なしで始まる（上の説明）
    controls.lock(false); audio.unlock(); firstInput();
    let n = 0, done = false; const fade = () => { if (done) return; done = true; setTimeout(() => gateEl.classList.add('off'), 1100); };
    const wait = () => { if (++n >= 4) fade(); else requestAnimationFrame(wait); };      // 景色が 4 コマ描けたら（はじめのコマは、シェーダーの準備で重い）
    requestAnimationFrame(wait); setTimeout(fade, 6000);                                 // 画面がかくれていて コマが進まないときも、6 秒で消す
    soundBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.isMuted()); soundBtn.classList.toggle('muted', audio.isMuted()); soundBtn.blur(); });
    return;
  }
  if (params.has('from')) {                        // ほかのエリアから来たとき：はじめの画面を出さず、すぐ歩ける。音は最初の操作で鳴らす
    gateEl.style.transition = 'none'; gateEl.classList.add('off'); controls.lock(false);
    const first = () => { audio.unlock(); window.removeEventListener('pointerdown', first, true); window.removeEventListener('keydown', first, true); };
    window.addEventListener('pointerdown', first, true); window.addEventListener('keydown', first, true);
  }
  gateEl.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
  window.addEventListener('keydown', () => { if (!gateEl.classList.contains('off')) start(); });
  soundBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.isMuted()); soundBtn.classList.toggle('muted', audio.isMuted()); soundBtn.blur(); });
  if (params.has('shot')) controls.lock(false);
  gateEl.classList.add('ready');                   // ここで はじめて「タップしてはじめる」を出す（ページの準備ができる前は、押しても何も起きないので出さない。area_kit.css）
}

// ================================================================ エリアの行き来：短いフェード（ロードの代わり）をはさんで別のページへ移る。まだ無いエリアは、お知らせを出して戻す
// 行き先には ?from=今のエリア をつける（着いた側は、はじめの画面を出さずに白から明ける）。?lite・?wc・?debug は引きつぐ
// 太陽ゲーム（?game=sun）では、「花の丘＋森」の場面（sun_start.html ＝ flower_hill.js）が行き来の中心：遺跡・キノコの谷・水晶の洞くつから出ると、行き先がどこであっても、森の「そのエリアの入り口の前」に着く（?from=エリアの名前）
const SUN_HUB = { url: 'sun_start.html', from: ['ruins', 'valley', 'cave'] };
export function createTravel({ params, controls }) {
  const fade = document.createElement('div'), note = document.createElement('div'); fade.id = 'areaFade'; note.id = 'areaNote'; document.body.append(fade, note);
  let busy = false;
  if (params.has('from') && !SUN_AREA_AUTO) { fade.classList.add('on', 'now'); setTimeout(() => fade.classList.remove('on', 'now'), 80); }      // 太陽ゲームでは、白くせず、暗い はじめの画面から静かに明ける（wireStart）
  return {
    get busy() { return busy; },
    // 別のエリアへ：url（ページ名）、from（今のエリアの名前）
    go(url, from) {
      if (busy) return; busy = true; controls.lock(true); fade.classList.add('on');
      if (params.get('game') === 'sun' && SUN_HUB.from.includes(from)) url = SUN_HUB.url;      // 太陽ゲーム：エリアの出口は、花の丘とつながった森へ
      const q = new URLSearchParams(); for (const k of ['lite', 'wc', 'debug', 'game']) if (params.has(k)) q.set(k, params.get(k)); q.set('from', from);
      if (viewState.mode === 'fp' && params.get('game') !== 'sun') q.set('view', 'fp');      // 太陽ゲームでは引きつがない（いつも 3 人称）
      if (timeState.night) q.set('time', 'night');                 // 夜にしていたら、次のエリアも夜で始める             // 1 人称にしていたら、次のエリアも 1 人称で始める（3 人称は、はじめの設定なので何も付けない）
      setTimeout(() => { location.href = `${url}?${q}`; }, 520);
    },
    // まだ無いエリア：フェード → onBack()（もとの場所へ戻す）→ text を出す → 明ける
    bounce(text, onBack) {
      if (busy) return; busy = true; controls.lock(true); fade.classList.add('on');
      setTimeout(() => { onBack(); note.textContent = text; note.classList.add('on'); }, 480);
      setTimeout(() => { note.classList.remove('on'); fade.classList.remove('on'); controls.lock(false); busy = false; }, 1900);
    },
  };
}

// ================================================================ 画面全体の水彩の効果（main.js の wcPass と同じ式。色味と、ふちを少し暗くするのを足した）
// grade（なくてもよい）：{ sat（あざやかさ）, mul [r, g, b], add [r, g, b] } ＝ エリアごとの色味
export function createWatercolorPass(tNoise, grade = null) {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, tNoise: { value: tNoise }, res: { value: new THREE.Vector2(1, 1) }, strength: { value: 0.85 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse, tNoise; uniform vec2 res; uniform float strength; varying vec2 vUv;
      vec3 tex(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
      void main(){
        vec2 px = 1.0 / res, q = vUv * res;
        vec4 nw = texture2D(tNoise, q / 600.0);
        vec2 uv = vUv + (nw.ba - 0.5) * px * 5.0 * strength;              // にじみ：輪郭が少しよれる
        vec3 c = tex(uv);
        vec3 b1 = (tex(uv + px * vec2(2.0, 0.0)) + tex(uv - px * vec2(2.0, 0.0)) + tex(uv + px * vec2(0.0, 2.0)) + tex(uv - px * vec2(0.0, 2.0))) * 0.25;
        vec3 b2 = (tex(uv + px * vec2(3.2, 3.2)) + tex(uv - px * vec2(3.2, 3.2)) + tex(uv + px * vec2(3.2, -3.2)) + tex(uv - px * vec2(3.2, -3.2))) * 0.25;
        c = mix(c, mix(b1, b2, 0.4), 0.5 * strength);                     // やわらかく
        c *= mix(1.0, 0.975 + 0.06 * texture2D(tNoise, q / 900.0).g, strength);   // 大きな色ムラ
        float paper = texture2D(tNoise, q / 256.0).r, grain = texture2D(tNoise, q / 37.0 + 0.37).r;
        c *= 1.0 - strength * (0.04 * (paper - 0.5) + 0.02 * (grain - 0.5));       // 紙の目
        vec2 v = vUv - 0.5; c *= 1.0 - 0.34 * smoothstep(0.25, 0.85, dot(v, v) * 2.0);   // ふちを少し暗く（視線がまん中の光へ向く）${grade ? `
        c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, ${glf(grade.sat ?? 1)}) * vec3(${(grade.mul || [1, 1, 1]).map(glf).join(', ')}) + vec3(${(grade.add || [0, 0, 0]).map(glf).join(', ')});   // エリアの色味` : ''}
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ================================================================ 品質の段階（太陽ゲーム ?game=sun だけ。大樹の花まつり側は今までどおり 画素比 2 まで）
// 段階 0〜3 ＝ 画面の画素比の上限 2 / 1.5 / 1.25 / 1（景色の作りはそのまま。描く画素の数だけが変わる。水彩の効果があるので、見た目の差は小さい）。
// はじめ：スマホ（タッチ）は 1、PC は 0。?q=0〜3 で固定（自動では変えない）。
// 自動：2.5 秒ごとに、コマの間かくの中央値を見る。おそい（下の slow）が 2 回続くと 1 段下げる。下げた段階は sessionStorage（sunQ）に残し、次のエリアもそこから（タブを閉じると元にもどる）。
//   PC は 30 コマで止まっているブラウザ（約 33 ms）を「おそい」に数えない。スマホは 33 ms も「おそい」（60 コマに届いていない）。ただし 28 コマ以上 出ている間は、段階 2 より下げない。
// 確認用：window.__quality（.state()・.set(段階)）。?debug=1 の速さの表示にも段階が出る
const Q_PR = [2, 1.5, 1.25, 1];
function createQuality(params, touch) {
  const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { /* 保存できない時は、そのページだけ */ } return null; };
  const fixed = params.has('q') ? clamp(parseInt(params.get('q'), 10) || 0, 0, 3) : null;
  let level = fixed ?? Math.max(touch ? 1 : 0, clamp(parseInt(ss('sunQ') || '0', 10) || 0, 0, 3));
  const subs = [], hist = [], win = [];
  let winStart = 0, bad = 0, waitTo = performance.now() + 4000, last = 0;      // はじめの 4 秒（シェーダーの準備・読みこみ）は見ない
  const pr = () => Math.min(window.devicePixelRatio || 1, Q_PR[level]);
  function set(l, why) {
    l = clamp(l, 0, 3); if (l === level) return;
    level = l; if (fixed === null) ss('sunQ', String(l)); hist.push({ t: +(performance.now() / 1000).toFixed(1), level: l, why });
    for (const f of subs) f();
  }
  function frame(now) {
    if (fixed !== null || level >= 3) return;
    const d = now - last; last = now;
    if (document.hidden || now < waitTo || d > 250) { win.length = 0; winStart = now; return; }   // かくれている間・1 回きりの止まり（読みこみ・タブの切りかえ）は数えない
    win.push(d);
    if (now - winStart < 2500) return;
    win.sort((a, b) => a - b); const med = win[win.length >> 1]; win.length = 0; winStart = now;
    const slow = touch ? med > 19 : (med > 19 && med < 31) || med > 36;
    const floor = med > 36 ? 3 : 2;                                  // 28 コマ以上なら、段階 2（画素比 1.25）で止める
    bad = slow && level < floor ? bad + 1 : 0;
    if (bad >= 2) { bad = 0; set(level + 1, `median ${med.toFixed(1)} ms`); waitTo = now + 1500; }
  }
  const api = { get level() { return level; }, pr, frame, set: (l) => set(l, 'manual'), onChange: (f) => subs.push(f),
    state: () => ({ level, pr: pr(), fixed, touch, history: hist.slice() }) };
  window.__quality = api;
  return api;
}

// ================================================================ 画面（renderer・scene・camera・水彩の効果）
// fog：{ nearCol, near, far }（色のつづきは createAreaKit の installFog）。U：キットの uniform（光の粒の大きさを画面に合わせる）。grade：水彩の効果の色味
export function createStage({ params, U, fov, background, fog, far = 240, grade = null }) {
  const TOUCH = ('ontouchstart' in window) || window.matchMedia('(pointer: coarse)').matches;
  const quality = params.get('game') === 'sun' ? createQuality(params, TOUCH) : null;   // 太陽ゲームだけ、品質の段階で画素比を決める
  const prNow = () => (quality ? quality.pr() : Math.min(window.devicePixelRatio, 2));
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(prNow());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.info.autoReset = false;                  // 1 フレームぶん（水彩のパスもふくめて）を数える
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  scene.fog = new THREE.Fog(fog.nearCol, fog.near, fog.far);
  if (fogInstalled) scene.fog.far = 0;                              // installFog の霧：far は「夜の度合い」（0 ＝ 昼）。霧の距離はシェーダーに書いてある
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.06, far);
  camera.rotation.order = 'YXZ';
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const wcPass = params.get('wc') === '0' ? null : createWatercolorPass(U.tNoise.value, grade);
  if (wcPass) composer.addPass(wcPass);
  function resize(w = window.innerWidth, h = window.innerHeight, pr = prNow()) {
    if (w < 2 || h < 2) return;                                     // かくれている間（大きさ 0）は何もしない
    renderer.setPixelRatio(pr); renderer.setSize(w, h, w === window.innerWidth && h === window.innerHeight);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    if (wcPass) wcPass.uniforms.res.value.set(w * pr, h * pr);
    U.uPR.value = pr * h / 800;                                     // 光の粒の大きさは、画面の高さに合わせる
    camera.aspect = w / h; camera.fov = fov + (w < h ? 6 : 0); camera.updateProjectionMatrix();   // たて長の画面は少し広く
  }
  window.addEventListener('resize', () => resize()); resize();
  if (quality) quality.onChange(() => resize());                    // 段階が変わったら、すぐ画素比を変える
  return { renderer, scene, camera, composer, wcPass, resize, quality };
}

// ================================================================ 確認用：場面・速さ・確認画像
// views = { A: { x, z, yaw, pitch }, … }、renderFrame(t)：1 枚描く、clock()：今の時間（秒）
export function createTools({ params, stage, lite, player, views, constrain, renderFrame, clock }) {
  const { renderer, resize } = stage;
  function setView(v) {
    const o = typeof v === 'string' ? views[v] : v;
    [player.x, player.z] = constrain(o.x, o.z); player.yaw = o.yaw; player.pitch = o.pitch; player.vx = player.vz = 0; player.moving = 0;
  }
  if (params.has('at')) { const [x, z, yaw, pitch] = params.get('at').split(',').map(Number); setView({ x, z, yaw: (yaw || 0) * Math.PI / 180, pitch: (pitch || 0) * Math.PI / 180 }); }
  if (params.has('view') && views[params.get('view')]) setView(params.get('view'));
  // 描く速さを測る（n 枚を続けて描いて、1 枚あたりのミリ秒）。既定はスマホ縦 390×844、画素 2 倍（main.js の __town.bench と同じ測り方）
  function bench(n = 120, w = 390, h = 844, pr = 2) {
    resize(w, h, pr);
    const gl = renderer.getContext(), px = new Uint8Array(4), t = clock();
    renderFrame(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) renderFrame(t + i / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / n, size = [renderer.domElement.width, renderer.domElement.height].join('x');
    const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    resize();
    return { ms: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1), size, lite, ...info };
  }
  // 今の場面を w × h の画像にする
  function shot(w = 960, h = 600) {
    resize(w, h, 1); renderFrame(clock());
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    resize();
    return c;
  }
  // 確認画像：labels = [['A', '短い説明'], …] を cols 列に並べる（パネルは同じ大きさ、各パネルの上にラベル）
  function preview(labels, cols = 2, w = 960, h = 600) {
    const LH = 78, gap = 8, rows = Math.ceil(labels.length / cols);
    const c = document.createElement('canvas'); c.width = w * cols + gap * (cols - 1); c.height = (h + LH) * rows + gap * (rows - 1); const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    const keep = { ...player };
    labels.forEach(([key, text], i) => {
      const x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (h + LH + gap);
      setView(key); const img = shot(w, h);
      g.fillStyle = '#17302f'; g.fillRect(x, y, w, LH);
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.font = '700 50px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(key, x + 26, y + LH / 2 + 2);
      g.font = '700 40px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(text, x + 86, y + LH / 2 + 2);
      g.drawImage(img, x, y + LH);
    });
    Object.assign(player, keep);
    return c;
  }
  return { setView, bench, shot, preview };
}

// ================================================================ 毎フレーム：update(dt, t)（歩く・音）→ renderFrame(t)。api.frames を数え、?debug=1 で速さを表示
export function runLoop({ stage, lite, clock, update, renderFrame, api }) {
  if (new URLSearchParams(location.search).get('game') === 'sun') import('./sun_game.js');      // 「太陽のない世界」のゲーム中（?game=sun）だけ、進行のモジュールを読みこむ（sun_game.js）
  const { renderer, quality } = stage, statEl = document.getElementById('stat');
  let last = performance.now(), acc = 0, accN = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (quality) quality.frame(now);                                 // 太陽ゲーム：コマの間かくを見て、重ければ画素比を下げる
    const t = clock();
    for (const h of frameHooks) h(dt);                               // 昼と夜のうつりかわり
    update(dt, t);
    const t0 = performance.now();
    renderFrame(t);
    api.frames++;
    if (statEl && document.body.classList.contains('debug')) {
      acc += performance.now() - t0; accN++;
      if (accN >= 30) { statEl.textContent = `${(acc / accN).toFixed(2)} ms (CPU)  ${renderer.info.render.calls} calls  ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris${lite ? '  lite' : ''}${quality ? `  q${quality.level} pr${quality.pr()}` : ''}`; acc = 0; accN = 0; }
    }
  });
}
