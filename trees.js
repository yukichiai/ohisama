// =====================================================================
// 町の木 8 種類（参考：source/reference/trees_ref_1.webp・trees_ref_2.webp）
// ミント → 白 → 淡い黄色の水彩トーン。平たい紙を重ねたような木。板と帯は foliage.js の仕組み（風・ディザ・時刻）。
//   とがった木  1 うろこの紡錘形   2 3 段のひだスカート   3 先がくるんと曲がったとんがり帽子   4 フリンジの帯を重ねた円すい
//   丸い木      5 点描の球         6 半透明の丸い葉の球   7 細い枝に小さな丸＋黄色の粒         8 上は大きなぼかしの丸、下は小さな丸
// 1 本だけ：createTree(type, seed, opts) → { mesh, height, collider }
// たくさん：createForest(items, opts)  → { group, colliders, update(camera), setWind, dispose }
//   items = [{ type: 1〜8, x, y, z, rotY?, seed?, scale? }]（y は根元の地面の高さ）
//   同じ種類は「形のちがう版」variants 個を作り、木ごとに seed で選ぶ。版ごとに近い版・遠い版（板が少ない）の 2 つ。
// =====================================================================
import * as THREE from 'three';
import { CardGeo, TILE, rng, pickW, col, mixCol, createFoliageMaterial, cardMesh } from './foliage.js';

export const TREES = {
  amp: 0.2,            // てっぺんの揺れ（m）
  flutter: 0.035,      // 葉のふるえ（m）
  lodNear: 34,         // これより遠い木は軽い版（m）
  detailFar: 0.45,     // 軽い版の板の量（1 ＝ 近い版と同じ）
  liteNear: 0.7,       // スマホの近い版の板の量
  variants: 3,         // 1 種類あたりの形の版の数
  trunk: '#33432c', trunkBrown: '#45392a',
  names: { 1: 'うろこの紡錘形', 2: '3 段のひだスカート', 3: 'くるんと曲がったとんがり帽子', 4: 'フリンジの帯の円すい',
           5: '点描の球', 6: '半透明の丸い葉の球', 7: '細い枝と小さな丸', 8: '大きなぼかしと小さな丸' },
  colliderR: { 1: 0.4, 2: 0.3, 3: 0.4, 4: 0.45, 5: 0.25, 6: 0.25, 7: 0.25, 8: 0.25 },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const randDir = (r) => { for (;;) { const v = V(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); const l = v.lengthSq(); if (l > 0.02 && l <= 1) return v.normalize(); } };
const shade = (c, k) => c.clone().multiplyScalar(k);

// 幹：根元が少し太い、ほぼまっすぐの管
function trunk(b, h, r0, r1, color, r, lean = 0.04) {
  const pts = [], a = r() * Math.PI * 2;
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(Math.cos(a) * lean * t * t, -0.15 + t * (h + 0.15), Math.sin(a) * lean * t * t)); }
  b.tube(pts, (t) => r0 + (r1 - r0) * Math.pow(t, 0.7) + 0.03 * Math.max(0, 0.15 - t) / 0.15 * r0 * 3, 7, col(color), { k: undefined });
  return pts[pts.length - 1];
}

// ---------------------------------------------------------------- ① うろこを重ねた紡錘形（下が白〜淡い黄色、上がミント）
function buildScale(b, r, d) {
  const H = b.H, yb = 1.0, R = 1.3 + r() * 0.3, flow = (r() - 0.5) * 0.16;
  trunk(b, 1.4, 0.14, 0.1, TREES.trunkBrown, r, 0.01);
  const prof = (t) => R * Math.pow(Math.sin(Math.PI * Math.min(1, 0.14 + 0.86 * t)), 0.78) + 0.02;
  const cAt = (t) => { t += flow; return t < 0.3 ? mixCol('#f2efc8', '#f3f7ea', t / 0.3) : t < 0.58 ? mixCol('#f3f7ea', '#c9eedf', (t - 0.3) / 0.28) : mixCol('#c9eedf', '#8fd9bd', (t - 0.58) / 0.42); };
  // 芯（すき間から見える奥の色）
  const core = []; for (let i = 0; i <= 8; i++) { const t = 1 - i / 8; core.push([yb + t * (H - yb), prof(t) * 0.8]); }
  b.band(core, 9, 1, TILE.solid, (t) => shade(cAt(1 - t), 0.84), { rng: r });
  // うろこ：下の段から順に。上の段のうろこが下の段の付け根にかぶる
  const rows = Math.round((11 + r() * 3) * (d < 1 ? 0.75 : 1)), sp = (H - yb) / rows;
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.35) / rows, y = yb + t * (H - yb), rr = prof(t);
    const dr = (prof(Math.min(1, t + 0.02)) - prof(Math.max(0, t - 0.02))) / (0.04 * (H - yb));
    const h = sp * 1.9 * (1 + 0.15 * (1 - t)), w = h * 0.95, n = Math.max(3, Math.round(Math.PI * 2 * rr / (w * 0.62)));
    for (let j = 0; j < n; j++) {
      const th = (j + (i % 2) * 0.5 + (r() - 0.5) * 0.25) / n * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
      const right = V(-st, 0, ct), lift = dr - 0.42, up = V(ct * lift, 1, st * lift).normalize();
      const nn = new THREE.Vector3().crossVectors(up, right).normalize().add(V(0, 0.35, 0)).normalize();
      const c = V(ct * (rr + 0.05), y - h * 0.28, st * (rr + 0.05));
      b.quad(c, right, up, w * (0.9 + r() * 0.2), h, TILE.scale, shade(cAt(t + (r() - 0.5) * 0.08), 0.96 + r() * 0.08), nn, { phase: r(), flutter: 0.3 });
    }
  }
  // てっぺん
  b.band([[H + 0.12, 0], [H - 0.2, 0.2]], 6, 1, TILE.scallop, () => cAt(1), { rng: r });
  // 小さな黄色の葉（ちらほら）
  for (let i = 0; i < 3; i++) {
    const t = [0.12, 0.2, 0.97][i] + r() * 0.05, th = r() * Math.PI * 2, rr = prof(Math.min(1, t)) + 0.12;
    b.bill(V(Math.cos(th) * rr, yb + t * (H - yb), Math.sin(th) * rr), 0.16, r() * 6, TILE.leaf, col('#e9dc52'), V(Math.cos(th), 0.4, Math.sin(th)).normalize(), { phase: r(), flutter: 1 });
  }
  return R;
}

// ---------------------------------------------------------------- ② 3 段のひだスカートの円すい（細い幹が見える）
function buildSkirt(b, r, d) {
  const H = b.H, tiers = r() < 0.35 ? 4 : 3, Rmax = 1.25 + r() * 0.2, y0 = 0.3 * H, span = H - y0;
  trunk(b, H * 0.78, 0.06, 0.03, TREES.trunk, r, 0.02);
  const L = span * (tiers === 3 ? 0.42 : 0.36), step = (span - L) / (tiers - 1);
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), top = H - i * step, bot = top - L, R = Rmax * (0.5 + 0.5 * (i + 1) / tiers) * (0.95 + r() * 0.1);
    const r0 = i === 0 ? 0 : R * 0.3, cTop = mixCol('#6fcbab', '#eaf7f0', f * 1.1), cBot = mixCol('#9fe0c8', '#eef3c4', f);
    const prof = [[top, r0], [top - L * 0.55, r0 + (R - r0) * 0.66], [bot + L * 0.12, R * 0.97], [bot, R]];
    const segs = Math.round((9 + R * 3) * (d < 1 ? 0.75 : 1));
    b.band(prof, segs, 2, TILE.scallop, (t) => mixCol(cTop, cBot, t).multiplyScalar(0.97 + 0.06 * Math.sin(t * 9)), { rng: r, jitter: 0.06, theta0: r() * 6, phase: r(), flutter: 0.25, droop: (t, th) => -0.06 * t * Math.sin(th * 3 + i) });
  }
  return Rmax;
}

// ---------------------------------------------------------------- ③ 先がくるんと片側に曲がった、とんがり帽子
function buildHat(b, r, d) {
  const H = b.H, tiers = Math.round((6 + r() * 2) * (d < 1 ? 0.7 : 1)), y0 = 0.7, yTop = 0.58 * H, dir = (r() - 0.5) * 0.6;   // 先は +X のほうへ曲がる（並べるときは木ごとに回す）
  trunk(b, 1.1, 0.12, 0.1, TREES.trunkBrown, r, 0.01);
  const L = (yTop - y0) / tiers * 1.9;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), bot = y0 + f * (yTop - y0 - L * 0.5), top = bot + L, R = 1.3 - 0.65 * f + (r() - 0.5) * 0.08;
    const cTop = mixCol('#d4f1e5', '#eff8f1', f), cBot = mixCol('#8edbc0', '#d9f2e8', f);
    b.band([[top, R * 0.5], [bot + L * 0.25, R * 0.95], [bot, R]], Math.round(12 + R * 6), 1, TILE.scallop, (t) => mixCol(cTop, cBot, t), { rng: r, jitter: 0.05, theta0: r() * 6, phase: r(), flutter: 0.2 });
  }
  // くるんと曲がった先：中心線を片側へ曲げた円すい
  const n = d < 1 ? 9 : 14, bend = 0.9 + r() * 0.5, path = [], rad = [];
  const yh0 = yTop - 0.15, hh = H - yh0;
  for (let i = 0; i <= n; i++) {
    const s = i / n, off = bend * Math.pow(s, 2.2);
    path.push(V(Math.cos(dir) * off, yh0 + hh * (s - 0.18 * Math.pow(s, 3)), Math.sin(dir) * off));
    rad.push(0.66 * Math.pow(1 - s, 0.85) + 0.004);
  }
  b.tube(path, (t) => rad[Math.round(t * n)], 10, (t) => mixCol('#c7ecd9', '#e7ebb0', Math.pow(t, 0.8)), { phase: r(), flutter: 0.15 });
  return 1.3;
}

// ---------------------------------------------------------------- ④ フリンジのある帯を何段も重ねた円すい（帯ごとに色が入れ替わる）
function buildFringe(b, r, d) {
  const H = b.H, n = Math.round((9 + Math.floor(r() * 3)) * (d < 1 ? 0.75 : 1)), y0 = 0.5, yT = H - 0.4, Rmax = 1.45 + r() * 0.15;
  trunk(b, 0.9, 0.14, 0.11, TREES.trunk, r, 0.01);
  const pal = [['#8fd7bd', 5], ['#eef7ee', 2.5], ['#6cc6a6', 2.5], ['#e2eaa6', 1.5], ['#c2ebda', 3]];
  let prev = null;
  const bh = (yT - y0) / n * 1.7;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), top = y0 + f * (yT - y0 - bh * 0.4) + bh, R = Rmax * Math.pow(1 - 0.8 * f, 0.95) * (0.95 + r() * 0.1);
    let c; do { c = pickW(r, pal); } while (c === prev); prev = c;
    const cc = col(c);
    b.band([[top, R * 0.6], [top - bh * 0.55, R * 0.9], [top - bh, R]], Math.max(6, Math.round(R * 9)), 1, TILE.fringe,
      (t) => shade(cc, 1.04 - 0.1 * t), { rng: r, jitter: 0.07, theta0: r() * 6, phase: r(), flutter: 0.25, droop: (t, th) => 0.05 * t * Math.sin(th * 2 + i * 1.7) });
  }
  b.band([[H, 0], [H - 0.42, 0.42]], 7, 1, TILE.scallop, (t) => mixCol('#e8f6ee', '#bfe9d7', t), { rng: r });
  return Rmax;
}

// ---------------------------------------------------------------- 丸い木の共通：細い濃い色の幹と、樹冠に入る小枝
function roundTrunk(b, r, yc, Rc, forks = 3) {
  const top = trunk(b, yc - Rc * 0.35, 0.065, 0.04, TREES.trunk, r, 0.03);
  for (let i = 0; i < forks; i++) {
    const a = r() * Math.PI * 2, p0 = top.clone().add(V(0, -0.25 * r(), 0)), p1 = p0.clone().add(V(Math.cos(a) * Rc * 0.45, Rc * (0.35 + 0.25 * r()), Math.sin(a) * Rc * 0.45));
    b.tube([p0, p0.clone().lerp(p1, 0.5).add(V(0, 0.05, 0)), p1], (t) => 0.03 * (1 - t) + 0.008, 5, col(TREES.trunk));
  }
  return top;
}
// 樹冠の外向き（光の向き）
const crownN = (p, c) => p.clone().sub(c).normalize().add(V(0, 0.25, 0)).normalize();

// ---------------------------------------------------------------- ⑤ ふわっとした点描の球（上がミント、下が淡い黄色にぼける）
function buildStipple(b, r, d) {
  const H = b.H, Rc = 1.5 + r() * 0.15, yc = H - Rc, C = V(0, yc, 0), lean = (r() - 0.5) * 0.15;
  roundTrunk(b, r, yc, Rc, 3);
  const N = Math.round(110 * d), sz = 1 / Math.sqrt(Math.max(d, 0.3));
  // 奥のやわらかい色（樹冠が空っぽに見えないように）
  for (let i = 0; i < 8; i++) {
    const p = C.clone().add(randDir(r).multiplyScalar(Rc * 0.35));
    b.bill(p, Rc * 1.45, r() * 6, TILE.soft, mixCol('#e6edb8', '#b9e8d4', (p.y - yc + Rc) / (2 * Rc)), crownN(p, C), { alpha: 0.9, phase: r(), flutter: 0.2 });
  }
  for (let i = 0; i < N; i++) {
    const dir = randDir(r), p = C.clone().add(dir.clone().multiplyScalar(Rc * (0.4 + 0.6 * Math.sqrt(r())))); p.y = yc + (p.y - yc) * 0.95; p.x += lean * (p.y - yc);
    const hy = (p.y - (yc - Rc)) / (2 * Rc), sideY = dir.x * 0.5 + 0.5;
    let c = mixCol('#eef0bc', '#9fe4cf', THREE.MathUtils.smoothstep(hy + (sideY - 0.5) * 0.12, 0.3, 0.72));
    if (r() < 0.18) c = mixCol(c, '#f7fbf5', 0.7);
    b.bill(p, (0.5 + 0.35 * r()) * Rc * 0.75 * sz, r() * 6, TILE.speckle, c, crownN(p, C), { phase: r(), flutter: 1 });
  }
  // てっぺんの白い点
  for (let i = 0; i < Math.round(12 * d); i++) {
    const dir = randDir(r); dir.y = Math.abs(dir.y) * 0.8 + 0.2; dir.normalize();
    const p = C.clone().addScaledVector(dir, Rc * 0.95);
    b.bill(p, 0.06 + 0.06 * r(), r() * 6, TILE.grain, col('#ffffff'), dir, { phase: r(), flutter: 1 });
  }
  return Rc;
}

// ---------------------------------------------------------------- ⑥ 半透明の丸い葉がぎゅっと集まった球
function buildDiscs(b, r, d) {
  const H = b.H, Rc = 1.42 + r() * 0.15, yc = H - Rc, C = V(0, yc, 0), yellowSide = r() * Math.PI * 2;
  roundTrunk(b, r, yc, Rc, 2);
  const N = Math.round(190 * d), sz = 1 / Math.sqrt(Math.max(d, 0.3));
  for (let i = 0; i < N; i++) {
    const dir = randDir(r), p = C.clone().addScaledVector(dir, Rc * (0.5 + 0.5 * Math.sqrt(r())));
    const yel = Math.max(0, Math.cos(Math.atan2(dir.z, dir.x) - yellowSide)) * Math.max(0, -dir.y + 0.3);
    const c = col(pickW(r, [['#a3e3cc', 4], ['#c4efe0', 4], ['#e6f8f1', 3], ['#8bd9bd', 2], ['#d7eba6', 0.6 + yel * 6]]));
    b.bill(p, (0.36 + 0.16 * r()) * sz, r() * 6, TILE.blob, c, crownN(p, C), { alpha: 0.72 + 0.2 * r(), phase: r(), flutter: 1 });
  }
  return Rc;
}

// ---------------------------------------------------------------- ⑦ 細い枝に小さな丸が散らばる木（丸のまわりに黄色の粒が少し舞う）
function buildTwigs(b, r, d) {
  const H = b.H, Rc = 1.55 + r() * 0.15, yc = H - Rc * 1.05, C = V(0, yc, 0);
  const top = trunk(b, yc - Rc * 0.85, 0.055, 0.035, TREES.trunk, r, 0.02);
  const tips = [], twigs = [];
  const grow = (p0, dir, len, rad, depth) => {
    const p1 = p0.clone().addScaledVector(dir, len), mid = p0.clone().lerp(p1, 0.5).add(V((r() - 0.5) * 0.08, 0.03, (r() - 0.5) * 0.08));
    b.tube([p0, mid, p1], (t) => rad * (1 - 0.4 * t), 4, col(TREES.trunk));
    twigs.push([p0, p1, depth]);
    if (depth === 0) { tips.push(p1); return; }
    for (let i = 0; i < 2; i++) {
      const a = r() * Math.PI * 2, nd = dir.clone().add(V(Math.cos(a), 0.2, Math.sin(a)).multiplyScalar(0.35 + 0.3 * r())).normalize();
      grow(p1, nd, len * 0.55, rad * 0.6, depth - 1);
    }
  };
  // 幹の上から、細い枝が扇のように広がる
  const fan = 4 + (r() < 0.5 ? 1 : 0), a0 = r() * Math.PI * 2;
  for (let i = 0; i < fan; i++) {
    const a = a0 + i / fan * Math.PI * 2 + (r() - 0.5) * 0.7, tilt = 0.25 + 0.45 * r();
    grow(top, V(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)), Rc * (0.6 + 0.25 * r()), 0.024, d < 1 ? 1 : 2);
  }
  // 上の大きなやわらかい丸（2〜3 個）
  for (let i = 0; i < 3; i++) {
    const p = C.clone().add(V((r() - 0.5) * Rc, Rc * (0.35 + 0.3 * r()), (r() - 0.5) * Rc * 0.6));
    b.bill(p, Rc * (1.0 + 0.4 * r()), r() * 6, TILE.soft, col(pickW(r, [['#bfe9da', 3], ['#d5f1e6', 2]])), crownN(p, C), { alpha: 0.95, phase: r(), flutter: 0.3 });
  }
  const outer = twigs.filter((t) => t[2] <= 0);
  const N = Math.round(220 * d), sz = 1 / Math.sqrt(Math.max(d, 0.3));
  for (let i = 0; i < N; i++) {
    const pool = r() < 0.75 ? outer : twigs, tw = pool[Math.floor(r() * pool.length)], p = tw[0].clone().lerp(tw[1], r()).add(randDir(r).multiplyScalar(0.28 * Math.sqrt(r())));   // 小さな丸は枝の先のほうに多く
    const c = col(pickW(r, [['#a5e3cc', 4], ['#cdeee0', 4], ['#f1f8f2', 3], ['#7fcfb2', 2], ['#ece27a', 1.2]]));
    b.bill(p, (0.14 + 0.14 * r()) * sz, r() * 6, TILE.disc, c, crownN(p, C), { alpha: 0.9, phase: r(), flutter: 1 });
  }
  // 黄色の粒（ゆっくり漂う）
  for (let i = 0; i < Math.round(28 * d); i++) {
    const p = C.clone().addScaledVector(randDir(r), Rc * (0.8 + 0.5 * r()));
    b.bill(p, 0.05 + 0.04 * r(), 0, TILE.grain, col(pickW(r, [['#f0df6a', 3], ['#f5ec9e', 2]])), V(0, 1, 0), { phase: r(), flutter: 0.5, drift: 1 });
  }
  return Rc;
}

// ---------------------------------------------------------------- ⑧ 上は大きなぼかしの丸、下は小さな丸が重なる木
function buildCloud(b, r, d) {
  const H = b.H, Rc = 1.6 + r() * 0.15, yc = H - Rc * 0.95, C = V(0, yc, 0);
  roundTrunk(b, r, yc - 0.3, Rc, 3);
  for (let i = 0; i < Math.round(10 * Math.max(d, 0.6)); i++) {
    const dir = randDir(r); dir.y = Math.abs(dir.y) * 0.9 + 0.05; dir.normalize();
    const p = C.clone().addScaledVector(dir, Rc * (0.45 + 0.25 * r()));
    b.bill(p, Rc * (0.9 + 0.5 * r()), r() * 6, TILE.soft, col(pickW(r, [['#bfe9da', 3], ['#a9e2cf', 2], ['#d2f0e8', 2]])), crownN(p, C), { alpha: 1, phase: r(), flutter: 0.3 });
  }
  const N = Math.round(85 * d), sz = 1 / Math.sqrt(Math.max(d, 0.3));
  for (let i = 0; i < N; i++) {
    const dir = randDir(r); if (dir.y > 0.3) dir.y = 0.3 - (dir.y - 0.3) * 0.5; dir.normalize();
    const p = C.clone().addScaledVector(dir, Rc * (0.45 + 0.55 * Math.sqrt(r()))); p.y -= 0.15;
    const big = r() < 0.15;
    const c = col(big ? pickW(r, [['#eef9f6', 3], ['#d6f1ea', 2]]) : pickW(r, [['#d6f1ea', 3], ['#a2e0cb', 3], ['#4fb89a', 1.4], ['#e1e37a', 1], ['#7fcfb2', 1.5]]));
    b.bill(p, (big ? 0.42 + 0.15 * r() : 0.16 + 0.16 * r()) * sz, r() * 6, TILE.disc, c, crownN(p, C), { alpha: 0.95, phase: r(), flutter: 1 });
  }
  return Rc;
}

const BUILD = { 1: buildScale, 2: buildSkirt, 3: buildHat, 4: buildFringe, 5: buildStipple, 6: buildDiscs, 7: buildTwigs, 8: buildCloud };
const HEIGHT = { 1: [5.0, 6.0], 2: [5.2, 6.2], 3: [5.0, 6.0], 4: [5.2, 6.2], 5: [4.6, 5.2], 6: [4.6, 5.2], 7: [4.8, 5.5], 8: [4.7, 5.3] };

// 形だけ作る（type 1〜8、seed、detail 1 ＝ 近い版）
const geoCache = new Map();
export function treeGeometry(type, seed, detail = 1) {
  const key = `${type}:${seed}:${detail}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const r = rng(seed * 31 + type * 1009), [h0, h1] = HEIGHT[type], H = h0 + (h1 - h0) * r();
  const b = new CardGeo(H);
  const R = BUILD[type](b, r, detail);
  const geo = b.toGeometry(); geo.userData = { height: H, crownR: R, type };
  geoCache.set(key, geo);
  return geo;
}

let sharedMat = null;
export function treeMaterial() { return sharedMat || (sharedMat = createFoliageMaterial({ amp: TREES.amp, flutter: TREES.flutter })); }

// ---------------------------------------------------------------- 1 本だけ
export function createTree(type, seed = 1, opts = {}) {
  const geo = treeGeometry(type, seed, opts.detail ?? 1), mat = opts.material || treeMaterial();
  const mesh = cardMesh(geo, mat, 0, opts); mesh.name = `tree${type}_${seed}`;
  return { mesh, height: geo.userData.height, collider: { r: TREES.colliderR[type] } };
}

// ---------------------------------------------------------------- たくさん並べる（種類 × 版 × 近い・遠いごとに InstancedMesh 1 つ）
// opts：lite（スマホ）、variants、lodNear（m）、castShadow
export function createForest(items, opts = {}) {
  const o = { lite: false, variants: TREES.variants, lodNear: TREES.lodNear, castShadow: true, ...opts };
  const mat = treeMaterial(), group = new THREE.Group(); group.name = 'code_trees';
  const nearD = o.lite ? TREES.liteNear : 1, farD = TREES.detailFar;
  const buckets = new Map(), colliders = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  items.forEach((it, i) => {
    const seed = it.seed ?? (i * 7 + 3), r = rng(seed * 13 + 5), v = Math.floor(r() * o.variants), key = `${it.type}:${v}`;
    if (!buckets.has(key)) buckets.set(key, { type: it.type, v, list: [] });
    const sc = (it.scale ?? 1) * (0.9 + 0.2 * r()), lean = 0.05 * (r() - 0.5);       // 高さと傾きを木ごとに少し変える
    e.set(lean, it.rotY ?? r() * Math.PI * 2, 0.05 * (r() - 0.5), 'YXZ'); q.setFromEuler(e);
    s3.set(sc * (0.94 + 0.12 * r()), sc, sc * (0.94 + 0.12 * r())); p3.set(it.x, it.y, it.z);
    const tint = new THREE.Color().setRGB(0.97 + 0.06 * r(), 0.98 + 0.04 * r(), 0.97 + 0.05 * r());
    buckets.get(key).list.push({ m: new THREE.Matrix4().compose(p3, q, s3), p: p3.clone(), tint });
    colliders.push({ x: it.x, z: it.z, r: TREES.colliderR[it.type] * sc, type: it.type });
  });
  const meshes = [];
  for (const bk of buckets.values()) {
    const seed = 100 + bk.v * 17;
    const near = cardMesh(treeGeometry(bk.type, seed, nearD), mat, bk.list.length, { castShadow: o.castShadow });
    const far = cardMesh(treeGeometry(bk.type, seed, farD), mat, bk.list.length, { castShadow: o.castShadow });
    near.name = `tree${bk.type}_v${bk.v}_near`; far.name = `tree${bk.type}_v${bk.v}_far`;
    bk.list.forEach((t, i) => { near.setMatrixAt(i, t.m); far.setMatrixAt(i, t.m); near.setColorAt(i, t.tint); far.setColorAt(i, t.tint); });
    far.count = 0;
    group.add(near, far); meshes.push({ near, far, list: bk.list });
  }
  const last = new THREE.Vector3(1e9, 0, 0);
  // カメラが 2 m 動くたびに、近い木・遠い木を入れかえる（木の数だけの軽い計算）
  function update(camera) {
    const cp = camera.position || camera;
    if (cp.distanceToSquared(last) < 4) return; last.copy(cp);
    const L2 = o.lodNear * o.lodNear;
    for (const { near, far, list } of meshes) {
      let a = 0, b = 0;
      for (const t of list) {
        if (t.p.distanceToSquared(cp) < L2) { near.setMatrixAt(a, t.m); near.setColorAt(a++, t.tint); }
        else { far.setMatrixAt(b, t.m); far.setColorAt(b++, t.tint); }
      }
      near.count = a; far.count = b;
      near.instanceMatrix.needsUpdate = far.instanceMatrix.needsUpdate = true;
      if (near.instanceColor) near.instanceColor.needsUpdate = true; if (far.instanceColor) far.instanceColor.needsUpdate = true;
    }
  }
  const stats = () => {
    let tris = 0; for (const { near, far } of meshes) tris += near.count * near.geometry.index.count / 3 + far.count * far.geometry.index.count / 3;
    return { trees: items.length, drawCalls: meshes.reduce((a, m) => a + (m.near.count > 0) + (m.far.count > 0), 0), tris: Math.round(tris) };
  };
  return { group, colliders, update, stats, material: mat, meshes };
}

// main.js の今の木（tree_forest＝とがった木 24 本、tree_round＝丸い木 27 本）から items を作るときの種類の決め方
export const typeFor = (gameType, i) => (gameType === 'tree_forest' ? [1, 2, 3, 4][(i * 3 + (i >> 2)) % 4] : [5, 6, 7, 8][(i * 5 + (i >> 1)) % 4]);
