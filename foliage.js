// =====================================================================
// 葉・花・丸の「板」の共通の仕組み（町の木 trees.js・街灯 streetlamp.js が使う）
// - 板の画像は 1 枚のアトラス（キャンバスで描く。白〜灰色で描き、色は頂点の色をかける）。
// - 形は 1 本ぶんを 1 つの BufferGeometry にまとめ、同じ形は InstancedMesh で並べる（描く回数を少なく）。
// - 風は nature.js の ①（windU = { uTime, uWind }、WIND_GLSL の windOffset）をそのまま使う。
//   根元は動かず、高い所ほど大きく揺れる。木ごとの位相のずれ・ときどき通る強い風も nature.js と同じ。
// - 咲き具合 uBloom（0〜1）：花の板は花ごとの順番（aBill.z）で、つぼみ → 開く。uGlow で花がほんのり光る（ふだん 0）。
// - 時刻 foliageU.uSky（0 朝 〜 1 夜の手前）：夕方からあたたかく、夜の手前は少し青く、色味だけ少し変える。
// - 半透明はディザ（細かい点の抜き）で表す。順番に並べかえなくてよく、水彩の効果（wcPass）でなめらかに見える。
// =====================================================================
import * as THREE from 'three';
import { windU, WIND_GLSL } from './nature.js';

export { windU };

// 町じゅうの葉が共有する値（main.js の setSky から foliageU.uSky.value = t とする）
export const foliageU = { uSky: { value: 0 } };
export function setFoliageSky(t) { foliageU.uSky.value = Math.max(0, Math.min(1, t)); }

// ---------------------------------------------------------------- 乱数（seed で同じ形がくり返し作れる）
export function rng(seed) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pickW = (r, list) => { const tot = list.reduce((a, [, w]) => a + w, 0); let x = r() * tot; for (const [c, w] of list) { x -= w; if (x <= 0) return c; } return list[0][0]; };

// ---------------------------------------------------------------- 板の画像（アトラス 4 × 4、1 マス 256 px）
export const TILE = { solid: 0, scale: 1, scallop: 2, fringe: 3, disc: 4, soft: 5, speckle: 6, leaf: 7, flower: 8, grain: 9, blob: 10, petal: 11 };
const GRID = 4, TS = 256, PAD = 6;
let atlas = null;
export function foliageAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = c.height = GRID * TS; const g = c.getContext('2d');
  const r = rng(7);
  const cell = (id, draw) => { g.save(); g.translate((id % GRID) * TS, Math.floor(id / GRID) * TS); g.beginPath(); g.rect(0, 0, TS, TS); g.clip(); draw(); g.restore(); };
  const blotch = (n, a, rad) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(120,120,120,${a * r()})`; g.beginPath(); g.arc(r() * TS, r() * TS, rad * (0.4 + r()), 0, Math.PI * 2); g.fill(); } };
  // 0 ぬりつぶし（幹・柱・帯の芯）
  cell(TILE.solid, () => { g.fillStyle = '#fff'; g.fillRect(0, 0, TS, TS); });
  // 1 うろこ（上はまっすぐ、下が丸い舌の形。下のふちが明るい）
  cell(TILE.scale, () => {
    g.beginPath(); g.moveTo(22, 0); g.lineTo(234, 0); g.lineTo(234, 128); g.ellipse(128, 128, 106, 118, 0, 0, Math.PI); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, TS); gr.addColorStop(0, '#d9d9d9'); gr.addColorStop(0.7, '#f7f7f7'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fill(); g.save(); g.clip(); blotch(10, 0.06, 22);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 10; g.beginPath(); g.ellipse(128, 128, 98, 110, 0, 0.15, Math.PI - 0.15); g.stroke(); g.restore();
  });
  // 2 ひだの帯（1 マス ＝ 丸い出っぱり 1 つ。下ほど明るい）
  cell(TILE.scallop, () => {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(TS, 0); g.lineTo(TS, 150); g.ellipse(128, 150, 128, 100, 0, 0, Math.PI); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, TS); gr.addColorStop(0, '#cfcfcf'); gr.addColorStop(0.55, '#ececec'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fill(); g.save(); g.clip();
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,255,255,${0.12 + 0.15 * r()})`; g.fillRect(r() * TS, 0, 3 + r() * 6, 120 + r() * 120); }
    blotch(8, 0.05, 26); g.restore();
  });
  // 3 フリンジの帯（下の 3 割に細い切れこみ。上の近くに明るい線）
  cell(TILE.fringe, () => {
    const gr = g.createLinearGradient(0, 0, 0, TS); gr.addColorStop(0, '#d6d6d6'); gr.addColorStop(0.5, '#efefef'); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fillRect(0, 0, TS, 168);
    for (let x = 2; x < TS; x += 26 + r() * 10) { const w = 15 + r() * 7, L = 40 + r() * 48; g.beginPath(); g.moveTo(x, 160); g.lineTo(x + w, 160); g.lineTo(x + w * 0.8 + (r() - 0.5) * 6, 160 + L); g.lineTo(x + w * 0.2, 160 + L * 0.94); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 26, TS, 10);
    blotch(8, 0.05, 24);
  });
  // 4 丸（水彩の丸：中は明るく、ふちに色がたまる）
  cell(TILE.disc, () => {
    const gr = g.createRadialGradient(118, 112, 10, 128, 128, 120); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.8, '#f1f1f1'); gr.addColorStop(1, '#d4d4d4');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  });
  // 5 ぼかしの丸（ふちが溶ける。ディザで半透明に見える）
  cell(TILE.soft, () => {
    for (let k = 0; k < 7; k++) {
      const x = 128 + (r() - 0.5) * 40, y = 128 + (r() - 0.5) * 40, rad = 70 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(250,250,250,0.7)'); gr.addColorStop(1, 'rgba(245,245,245,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  });
  // 6 点描（小さな点がたくさん集まった丸）
  cell(TILE.speckle, () => {
    for (let i = 0; i < 300; i++) {
      const a = r() * Math.PI * 2, d = 118 * Math.pow(r(), 0.65), x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
      const v = 215 + Math.floor(r() * 40); g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.ellipse(x, y, 3 + r() * 9, 3 + r() * 7, r() * 3, 0, Math.PI * 2); g.fill();
    }
  });
  // 7 丸い葉（先が少しとがる。葉脈は明るい線）
  cell(TILE.leaf, () => {
    g.beginPath(); g.moveTo(128, 246); g.bezierCurveTo(10, 200, 20, 40, 128, 10); g.bezierCurveTo(236, 40, 246, 200, 128, 246); g.closePath();
    const gr = g.createLinearGradient(30, 0, 226, 0); gr.addColorStop(0, '#e2e2e2'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#d8d8d8');
    g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 236); g.lineTo(128, 40); g.stroke();
  });
  // 8 白い小花（花びら 5 枚、まん中が黄色。この画像だけ色つき）
  cell(TILE.flower, () => {
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.save(); g.translate(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52); g.rotate(a + Math.PI / 2);
      const gr = g.createRadialGradient(0, 30, 4, 0, 0, 62); gr.addColorStop(0, '#f0f2ea'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 44, 60, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.fillStyle = '#f2cf3a'; g.beginPath(); g.arc(128, 128, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8b830'; for (let k = 0; k < 6; k++) { const a = k * 1.047; g.beginPath(); g.arc(128 + Math.cos(a) * 12, 128 + Math.sin(a) * 12, 4, 0, Math.PI * 2); g.fill(); }
  });
  // 9 粒（小さなやわらかい点）
  cell(TILE.grain, () => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 120); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  });
  // 10 半透明の丸い葉（すこしいびつな丸、まん中が明るい）
  cell(TILE.blob, () => {
    g.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2, rr = 112 + 8 * Math.sin(a * 3 + 1.3) + 5 * Math.sin(a * 5); g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); }
    const gr = g.createRadialGradient(108, 104, 8, 128, 128, 122); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#ededed'); gr.addColorStop(1, '#dadada');
    g.fillStyle = gr; g.fill();
  });
  // 11 花びら（舞い落ちる用）
  cell(TILE.petal, () => {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 128, 70, 110, 0, 0, Math.PI * 2); g.fill();
  });
  atlas = new THREE.CanvasTexture(c); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  return atlas;
}
// 1 マスの UV（左上 u0,v1 → 右下 u1,v0）。t0〜t1 でマスの横の一部だけも使える
export function tileUV(id, t0 = 0, t1 = 1) {
  const cx = id % GRID, cy = Math.floor(id / GRID), s = 1 / GRID, p = PAD / (GRID * TS);
  const u0 = cx * s + p, u1 = (cx + 1) * s - p, v1 = 1 - cy * s - p, v0 = 1 - (cy + 1) * s + p;
  return [u0 + (u1 - u0) * t0, v0, u0 + (u1 - u0) * t1, v1];
}

// ---------------------------------------------------------------- 形を組み立てる道具
// 頂点ごとに：position・normal・uv・color（rgba。a は半透明の量）
//   aFol  = (高さの割合 k ＝ 揺れの量, 位相, 小さなふるえの量, 漂う粒 1/0)
//   aBill = (カメラを向く板のずれ x, y [m], 花の咲く順番 0〜1（花でなければ -1）, 不透明度 ＋ ぼかしの板なら 2)
// 不透明度（o.alpha）と、ふちをディザでぼかす板か（ぼかしの丸・粒。o.soft で指定もできる）
const SOFT = new Set([TILE.soft, TILE.grain]);
const alphaOf = (tile, o) => Math.max(0.01, Math.min(1, o.alpha ?? 1)) + ((o.soft ?? SOFT.has(tile)) ? 2 : 0);
export class CardGeo {
  constructor(H) { this.H = H; this.p = []; this.n = []; this.uv = []; this.c = []; this.f = []; this.b = []; this.idx = []; this.nv = 0; }
  vert(p, n, u, v, col, a, k, ph, fl, drift, bx = 0, by = 0, bloom = -1) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.c.push(col.r, col.g, col.b, 1); this.f.push(k, ph, fl, drift); this.b.push(bx, by, bloom, a);
    return this.nv++;
  }
  _k(y, o) { return o.k ?? Math.max(0, y / this.H); }
  // 向きの決まった板。c 中心、right・up は単位ベクトル、n は光の向き
  quad(c, right, up, w, h, tile, col, n, o = {}) {
    const [u0, v0, u1, v1] = tileUV(tile), a = alphaOf(tile, o), ph = o.phase ?? 0, fl = o.flutter ?? 0, dr = o.drift ?? 0, bl = o.bloom ?? -1;
    const P = (sx, sy) => c.clone().addScaledVector(right, sx * w / 2).addScaledVector(up, sy * h / 2);
    const k = this._k(c.y, o);
    const i0 = this.vert(P(-1, 1), n, u0, v1, col, a, k, ph, fl, dr, 0, 0, bl), i1 = this.vert(P(1, 1), n, u1, v1, col, a, k, ph, fl, dr, 0, 0, bl);
    const i2 = this.vert(P(1, -1), n, u1, v0, col, a, k, ph, fl, dr, 0, 0, bl), i3 = this.vert(P(-1, -1), n, u0, v0, col, a, k, ph, fl, dr, 0, 0, bl);
    this.idx.push(i0, i3, i1, i1, i3, i2);
  }
  // カメラを向く板（丸・点描・ぼかし）。c 中心、size 直径、rot 回転、n は光の向き（樹冠の外向き）
  bill(c, size, rot, tile, col, n, o = {}) {
    const [u0, v0, u1, v1] = tileUV(tile), a = alphaOf(tile, o), ph = o.phase ?? 0, fl = o.flutter ?? 0, dr = o.drift ?? 0, bl = o.bloom ?? -1;
    const k = this._k(c.y, o), cs = Math.cos(rot) * size / 2, sn = Math.sin(rot) * size / 2, sy = o.squash ?? 1;
    const corner = (x, y, u, v) => this.vert(c, n, u, v, col, a, k, ph, fl, dr, x * cs - y * sn * sy, x * sn + y * cs * sy, bl);
    const i0 = corner(-1, 1, u0, v1), i1 = corner(1, 1, u1, v1), i2 = corner(1, -1, u1, v0), i3 = corner(-1, -1, u0, v0);
    this.idx.push(i0, i3, i1, i1, i3, i2);
  }
  // 管（幹・枝・つる）。path は点の列、rad は太さ（数 or 関数 t→m）、col は色（Color or 関数 t→Color）
  tube(path, rad, sides, col, o = {}) {
    const n = path.length, rings = [], [su0, sv0, su1, sv1] = tileUV(TILE.solid), su = (su0 + su1) / 2, sv = (sv0 + sv1) / 2;
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), bin = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      tan.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize();
      side.crossVectors(Math.abs(tan.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, tan).normalize(); bin.crossVectors(tan, side).normalize();
      const t = i / (n - 1), rr = typeof rad === 'function' ? rad(t) : rad, cc = typeof col === 'function' ? col(t) : col, ring = [];
      for (let s = 0; s <= sides; s++) {
        const a = s / sides * Math.PI * 2, nn = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
        const p = path[i].clone().addScaledVector(nn, rr);
        ring.push(this.vert(p, nn, su, sv, cc, 1, this._k(p.y, o), o.phase ?? 0, o.flutter ?? 0, 0));
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
      const a = rings[i][s], b = rings[i][s + 1], c2 = rings[i + 1][s], d = rings[i + 1][s + 1];
      this.idx.push(a, c2, b, b, c2, d);
    }
  }
  // 回転体の帯（ひだスカート・フリンジの帯・芯）。prof = [[y, r], ...] 上から下へ。
  // segs 本の出っぱり（1 本 ＝ 画像 1 マス）。sub で 1 本をさらに細かく。col(t 0 上〜1 下, θ) → Color
  band(prof, segs, sub, tile, col, o = {}) {
    const cx = o.cx ?? 0, cz = o.cz ?? 0, th0 = o.theta0 ?? 0, jit = o.jitter ?? 0, r = o.rng ?? Math.random;
    const N = segs * sub, len = [0];
    for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const L = len[len.length - 1] || 1;
    const jr = Array.from({ length: segs + 1 }, () => 1 + (r() - 0.5) * 2 * jit); jr[segs] = jr[0];
    const grid = [];
    for (let j = 0; j < prof.length; j++) {
      const row = [], t = len[j] / L;
      for (let s = 0; s <= N; s++) {
        const th = th0 + s / N * Math.PI * 2, seg = Math.floor(s / sub), fr = (s % sub) / sub;
        const jj = jr[seg] * (1 - fr) + jr[Math.min(segs, seg + 1)] * fr, rr = prof[j][1] * (1 + (jj - 1) * t);
        const y = prof[j][0] + (o.droop ? o.droop(t, th) : 0);
        const p = new THREE.Vector3(cx + Math.cos(th) * rr, y, cz + Math.sin(th) * rr);
        const j0 = Math.max(0, j - 1), j1 = Math.min(prof.length - 1, j + 1);
        const dy = prof[j0][0] - prof[j1][0], dr = prof[j1][1] - prof[j0][1];
        const nn = new THREE.Vector3(Math.cos(th) * dy, dr + 0.15 * Math.max(dy, 0.01), Math.sin(th) * dy).normalize();
        row.push({ p, nn, t, th });
      }
      grid.push(row);
    }
    for (let j = 0; j < prof.length - 1; j++) for (let s = 0; s < N; s++) {
      const seg = s % sub, ua = seg / sub, ub = (seg + 1) / sub, ids = [];
      for (const [jj, ss, uu] of [[j, s, ua], [j, s + 1, ub], [j + 1, s + 1, ub], [j + 1, s, ua]]) {
        const q = grid[jj][ss], [u0, v0, u1, v1] = tileUV(tile, uu, uu);
        const v = v1 + (v0 - v1) * q.t;
        ids.push(this.vert(q.p, q.nn, u0, v, col(q.t, q.th), alphaOf(tile, o), this._k(q.p.y, o), o.phase ?? 0, o.flutter ?? 0, 0));
      }
      this.idx.push(ids[0], ids[3], ids[1], ids[1], ids[3], ids[2]);
    }
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4));
    g.setAttribute('aFol', new THREE.Float32BufferAttribute(this.f, 4));
    g.setAttribute('aBill', new THREE.Float32BufferAttribute(this.b, 4));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    // カメラを向く板は中心しか入っていないので、球を少し大きく
    g.boundingSphere.radius += 1.0;
    return g;
  }
}
export const col = (hex) => new THREE.Color(hex);
export const mixCol = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

// ---------------------------------------------------------------- シェーダー（Lambert ＋ 風 ＋ カメラを向く板 ＋ 咲き具合 ＋ ディザの半透明）
const VERT_HEAD = `
  attribute vec4 aFol; attribute vec4 aBill;
  uniform float uAmp, uFlutter, uBloom;
  varying float vOpen, vFl; varying vec2 vAlpha;
  ${WIND_GLSL}`;
const VERT_PROJECT = `
  vec4 fLocal = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mat4 fInst = instanceMatrix;
  #else
    mat4 fInst = mat4(1.0);
  #endif
  vec4 fWorld = modelMatrix * fInst * fLocal;
  vec3 fRoot = (modelMatrix * fInst * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float fScale = length((modelMatrix * fInst)[1].xyz);
  fWorld.xyz += windOffset(fRoot, aFol.x, uAmp * fScale);
  float fPh = aFol.y * 6.2831;
  fWorld.xyz += vec3(sin(uTime * 3.1 + fPh), 0.4 * sin(uTime * 2.3 + fPh * 1.3), cos(uTime * 2.7 + fPh)) * uFlutter * aFol.z * (0.35 + 0.65 * uWind);
  fWorld.xyz += aFol.w * vec3(sin(uTime * 0.7 + fPh) * 0.14, sin(uTime * 0.53 + fPh * 1.7) * 0.18, cos(uTime * 0.61 + fPh) * 0.14);   // 漂う粒
  vOpen = 1.0; vFl = step(0.0, aBill.z); vAlpha = vec2(aBill.w - 2.0 * step(1.5, aBill.w), step(1.5, aBill.w));
  float fB = 1.0;
  if (aBill.z >= 0.0) { vOpen = smoothstep(aBill.z * 0.75, aBill.z * 0.75 + 0.25, uBloom); fB = mix(0.25, 1.0, vOpen); }
  vec4 mvPosition = viewMatrix * fWorld;
  mvPosition.xy += aBill.xy * fScale * fB;
  gl_Position = projectionMatrix * mvPosition;`;

function patchVertex(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
    .replace('#include <project_vertex>', VERT_PROJECT);
}

// opts.amp：てっぺんの揺れ（m）、flutter：葉のふるえ（m）、bloom：咲き具合の初期値、budColor：つぼみの色
export function createFoliageMaterial(opts = {}) {
  const o = { amp: 0.18, flutter: 0.03, bloom: 1, glow: 0, self: 0.22, budColor: '#e3a0b4', ...opts };
  const u = {
    uAmp: { value: o.amp }, uFlutter: { value: o.flutter }, uBloom: { value: o.bloom }, uGlow: { value: o.glow }, uSelf: { value: o.self },
    uBud: { value: new THREE.Color(o.budColor) },
  };
  const m = new THREE.MeshLambertMaterial({ map: foliageAtlas(), vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime: windU.uTime, uWind: windU.uWind, uSky: foliageU.uSky });
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uBloom, uGlow, uSky, uSelf; uniform vec3 uBud; varying float vOpen, vFl; varying vec2 vAlpha;
        float fIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(uBud, diffuseColor.rgb, vOpen);
        // 時刻：夕方はあたたかく、夜の手前は少し青く（光の色は main.js の空の表が変える。ここは葉の色味だけ）
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 0.99, 0.92), smoothstep(0.5, 0.75, uSky) * (1.0 - smoothstep(0.85, 1.0, uSky)));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.94, 0.95, 1.04), smoothstep(0.8, 1.0, uSky));`)
      .replace('#include <alphatest_fragment>', `
        {  // 形はくっきり（画像の a が 0.5 で切る）。半透明とぼかしの板だけ、ディザ（細かい点の抜き）で
          float dz = mix(0.04, 0.96, fIGN(gl_FragCoord.xy));
          if (vAlpha.y > 0.5) { if (diffuseColor.a * vAlpha.x < dz) discard; }
          else if (diffuseColor.a < 0.5 || vAlpha.x < dz) discard;
        }
        diffuseColor.a = 1.0;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vNormal);                       // 裏から見ても光の向きは同じ（板の外向き）
        if (!gl_FrontFacing) diffuseColor.rgb *= 0.86;     // 帯の内側は少し暗い`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uGlow * vFl * vOpen;   // 花だけ、ほんのり光る
        totalEmissiveRadiance += diffuseColor.rgb * uSelf * (1.0 - 0.7 * uSky);   // 紙の明るさ：かげの側も灰色にしない`);
  };
  m.customProgramCacheKey = () => 'foliageCard';
  m.userData.u = u;
  // 影：同じ揺れ・同じ形で抜く
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: foliageAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  d.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, u, { uTime: windU.uTime, uWind: windU.uWind }); patchVertex(sh); };
  d.customProgramCacheKey = () => 'foliageCardDepth';
  m.userData.depth = d;
  return m;
}

// 形と材質から InstancedMesh（count 本）を作る
export function cardMesh(geo, mat, count, { castShadow = true, receiveShadow = true } = {}) {
  const m = count > 0 ? new THREE.InstancedMesh(geo, mat, count) : new THREE.Mesh(geo, mat);
  m.customDepthMaterial = mat.userData.depth; m.castShadow = castShadow; m.receiveShadow = receiveShadow;
  if (m.isInstancedMesh) m.frustumCulled = false;      // 並べた木は町じゅうに散らばるので、まとめて 1 回
  return m;
}
