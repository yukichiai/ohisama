// =====================================================================
// 魔法陣（太陽の魔法陣）の共通部品。どのエリアのページからも呼べる（three だけを使う）。使い方は magic_circle.md
//   眠っている：うすく、ゆっくり明滅 → 操作キャラが上に立つと、開放の演出（約 10 秒。1 回だけ）→ 開放後：金色で静かに光りつづける
//   開放の演出（TL の秒数。エルフのしぐさのクリップ circle_unlock と同じ時間わり）：
//     ためる 0〜3 秒    操作が止まり、カメラがエルフの正面ななめ前から顔へ ゆっくり寄る。線が外から中心へ順にともり、記号の輪が回りだす。まわりの光の粒が吸いよせられる。低いひびきが高まる（エルフ：手を胸の前で合わせる）
//     とき放つ 3〜6 秒  金色に変わり、光の柱が立ちのぼる。足もとから風（粒が速くのぼる・スカートがふくらむ）。まわりへ光の波が広がる。3 秒で保存、4.8 秒で 'suncircle:open'（エルフ：両手を前〜上へひらく）
//     かけら 6〜9 秒    光の柱の中から太陽のかけらがうかび上がる。カメラは顔のななめ下から見上げ、かけらと顔を同じ画面に。きらめく鐘（エルフ：見上げて手をさし出す）
//     もどる 9〜12 秒   かけらが飛び立つ（'suncircle:shard'）。カメラがいつもの位置へもどり、操作がもどる
//   エルフ：player_avatar.js の playOnce('circle_unlock') があれば、それで動かす。クリップがまだないときは待機のまま（見上げるしぐさだけ、骨を少し回して付ける）
//   保存：localStorage の key（値 "1" ＝ 開放ずみ）。ページを開いたとき開放ずみなら、開放後の見た目で始まる（演出は流れない）。URL に ?circle=reset で 3 つとも消す
//   イベント（window）：'suncircle:open'（かけらが飛び立つ 4.2 秒前 ＝ 演出の 4.8 秒。sun_game.js が、この 4.2 秒後にかけらを UI へ飛ばすため。detail: { key, pattern, open: { ruins, mushroom, cave, all }, all }）
//                       'suncircle:shard'（かけらが飛び立つ瞬間 ＝ 演出の 9 秒。detail: { key, pattern, position: [x, y, z] }）
// 線の作り（外の二重の円・記号の輪・中の円・放射の線・6 つのしるし）は 3 エリア共通。内側の模様としるしの形だけ pattern で変わる：
//   'ruins' 石のきざみ（四角を 2 つ重ねた星）/ 'mushroom' かさのひだと胞子 / 'crystal' 水晶の六角と結晶
// 加算の光・深度は書きこまない・霧なし ＝ 床の上でも、浅い水の下でも見える。bloom なし。描く回数は ふだん 1 回（開放のあと 3 回、演出中は多くて 7 回）
// カメラと操作は、area_kit.js の createViewWalker（window.__walker）とページの controls を自分で見つけて使う（引数 walker・controls・camera で渡してもよい）
// =====================================================================
import * as THREE from 'three';

export const SUN_CIRCLE_KEYS = { ruins: 'sunCircle_ruins', mushroom: 'sunCircle_mushroom', cave: 'sunCircle_cave' };
export const SUN_CIRCLE_EVENT = 'suncircle:open', SUN_SHARD_EVENT = 'suncircle:shard';
export const SUN_PIECE_EVENT = 'sunpiece:release';      // かけらが、エルフの手元から飛び立つ瞬間（detail: { id, x, y }）
// 演出の時間（秒）。release ＝ とき放つ、shard ＝ かけらがあらわれる、fly ＝ 飛び立つ、back ＝ カメラがもどりはじめる、end ＝ おわり、openEvent ＝ 'suncircle:open' を出す時（fly の 4.2 秒前）
const TL_CIRCLE = { release: 3.0, shard: 6.0, fly: 9.0, back: 10.4, end: 12.0, openEvent: 4.8 };
export const TL = TL_CIRCLE;
// かけらを取る演出（魔法陣なし。mode 'pickup'）の時間：shard ＝ かけらが手元へ動きだす、release ＝ 手元に着く（保存する）、fly ＝ 手元から飛び立つ（sunpiece:release）、back ＝ カメラがもどりはじめる、end ＝ おわり
export const TL_PICK = { release: 3.0, shard: 1.4, fly: 4.2, back: 4.7, end: 6.0, openEvent: 3.0 };
const IS_SUN = (() => { try { return new URLSearchParams(window.location.search).get('game') === 'sun'; } catch (_) { return false; } })();      // おひさまのゲーム（?game=sun）
export const ELF_CLIP = 'circle_unlock';                             // エルフのしぐさのクリップの名前（models/elf_player.glb）
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 保存できない環境 */ } }, del(k) { try { localStorage.removeItem(k); } catch (_) { /* 同上 */ } } };
if (new URLSearchParams(location.search).get('circle') === 'reset') for (const k of Object.values(SUN_CIRCLE_KEYS)) store.del(k);
// 3 つの魔法陣の開放のようす { ruins, mushroom, cave, all }
export function sunCircleState() { const o = {}; for (const [n, k] of Object.entries(SUN_CIRCLE_KEYS)) o[n] = store.get(k) === '1'; o.all = o.ruins && o.mushroom && o.cave; return o; }

const PATTERNS = { ruins: 0, mushroom: 1, crystal: 2 };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const sstep = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };      // はじめとおわりが、とくにゆっくり
// 時間 → 値：点 [[t, v], …] の間を、なめらかな曲線でつなぐ（カメラの道すじ用。点で止まらない）
function track(keys, t) {
  const n = keys.length; if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1], h = t1 - t0, u = (t - t0) / h;
  const m0 = i > 0 ? (v1 - keys[i - 1][1]) / (t1 - keys[i - 1][0]) : 0, m1 = i < n - 2 ? (keys[i + 2][1] - v0) / (keys[i + 2][0] - t0) : 0, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1;
}
let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); return glowTex;
}

// ---------------------------------------------------------------- 演出の音（Web Audio の合成。はじまりに、ぜんぶの音の時間を決めておく）
// 高まる低いひびき（0〜3 秒）→ やわらかい鐘の和音（3 秒）→ きらめく鐘（6 秒〜）→ 飛び立つ音（9 秒）
let actx = null;
function playCineSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    if (!actx) actx = new AC(); if (actx.state !== 'running') actx.resume().catch(() => {});
    const t0 = actx.currentTime + 0.05, out = actx.createGain(); out.gain.value = 0.5; out.connect(actx.destination);
    const dl = actx.createDelay(1), fb = actx.createGain(); dl.delayTime.value = 0.31; fb.gain.value = 0.38; out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(actx.destination);      // かんたんな ひびき
    const tone = (f, t, vol, dur, type = 'sine', f1 = null) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); };
    // ためる：低い音がゆっくり大きく、高くなる ＋ 小さくふるえる高い音
    for (const [f, v] of [[55, 0.16], [82.4, 0.1], [110, 0.07], [220.5, 0.03]]) { const o = actx.createOscillator(), g = actx.createGain(); o.type = f < 100 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 1.5, t0 + TL.release);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + TL.release - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t0 + TL.release + 0.5); o.connect(g).connect(out); o.start(t0); o.stop(t0 + TL.release + 0.6); }
    for (let i = 0; i < 9; i++) tone(880 * Math.pow(1.122, i), t0 + 0.5 + i * 0.27, 0.008 + 0.004 * i, 0.5);
    // とき放つ：やわらかい鐘の和音 ＋ 低いどん
    const tr = t0 + TL.release;
    for (const [f, d, v] of [[293.66, 0, 0.15], [440.0, 0.1, 0.12], [587.33, 0.2, 0.11], [739.99, 0.3, 0.08]]) { tone(f, tr + d, v, 4.2); tone(f * 2.01, tr + d, v * 0.25, 2.4); tone(f * 3.02, tr + d, v * 0.08, 1.4); }
    tone(110, tr, 0.2, 1.6, 'sine', 45); tone(146.83, tr, 0.12, 5.0, 'triangle');
    // かけら：きらめく鐘が、上へのぼる
    const scale = [1174.66, 1318.51, 1479.98, 1760.0, 1975.53, 2349.32, 2637.02, 2959.96];
    for (let i = 0; i < 13; i++) tone(scale[Math.min(scale.length - 1, Math.floor(i * 0.6 + Math.random() * 1.5))], t0 + TL.shard + 0.1 + i * 0.15 + Math.random() * 0.05, 0.032 * (1 - i / 20), 0.8);
    // 飛び立つ：上がっていく音 ＋ 高い鐘ひとつ
    tone(520, t0 + TL.fly, 0.05, 1.1, 'sine', 2100); tone(1760, t0 + TL.fly + 0.15, 0.06, 2.6); tone(2637.02, t0 + TL.fly + 0.3, 0.035, 2.2);
    return true;
  } catch (_) { return false; }
}

const DISC_FRAG = `
  uniform float uTime, uIn, uGold, uAmt, uPat, uFlash, uSpin; uniform vec3 uCol, uCol2, uGoldCol; varying vec2 vP;
  const float W = 0.011;                                              // 線のふちの やわらかさ
  float h1(float n){ return fract(sin(n * 91.345) * 47453.5453); }
  float ring(float r, float r0, float w){ return 1.0 - smoothstep(w * 0.5, w * 0.5 + W, abs(r - r0)); }
  // 正 n 角形の線（rad ＝ 辺までの距離）
  float ngon(vec2 p, float n, float rad, float rot, float w){ float a = atan(p.y, p.x) + rot, k = 6.2831853 / n; return 1.0 - smoothstep(w * 0.5, w * 0.5 + W, abs(cos(floor(0.5 + a / k) * k - a) * length(p) - rad)); }
  void main(){
    float r = length(vP); if (r > 1.04) discard;
    float a = atan(vP.y, vP.x), g = 0.0;
    // ---- 共通の線：外の二重の円、記号の輪（uSpin で回る）、中の円、放射の線、内の円
    g += ring(r, 0.97, 0.024) + ring(r, 0.905, 0.012) + ring(r, 0.72, 0.014) + ring(r, 0.34, 0.016);
    float ca = (a + uSpin) / 6.2831853 * 24.0, id = mod(floor(ca), 24.0), gi = h1(id + uPat * 17.0), gj = h1(id * 1.7 + 3.0 + uPat);
    vec2 gc = vec2(fract(ca) - 0.5, (r - 0.8125) / 0.055);                                            // 記号 1 つぶんのマス（たて -1〜1）
    float mark = max(step(abs(gc.x - (gi - 0.5) * 0.3), 0.065) * step(abs(gc.y), 0.8), step(abs(gc.y - (gj - 0.5) - gc.x * (gi - 0.5) * 2.0), 0.17) * step(abs(gc.x), 0.3) * step(0.3, gi));
    mark = max(mark, step(length(vec2(gc.x, gc.y * 0.42) - vec2(0.22 * sign(gj - 0.5), 0.22 * sign(gi - 0.5))), 0.085));
    g += mark * step(abs(gc.y), 1.0) * 0.9;
    float ray = abs(fract(a / 6.2831853 * 12.0 + 0.5) - 0.5) / 12.0 * 6.2831853 * r;
    g += (1.0 - smoothstep(0.005, 0.005 + W, ray)) * step(0.34, r) * step(r, 0.72) * 0.75;
    // ---- 6 つのしるし（中の輪の上）：形はエリアごと
    vec2 dq = vec2((fract(a / 6.2831853 * 6.0 + 0.5) - 0.5) / 6.0 * 6.2831853 * r, r - 0.53);
    float sd = uPat < 0.5 ? max(abs(dq.x), abs(dq.y)) - 0.05 : uPat < 1.5 ? length(dq) - 0.058 : abs(dq.x) * 1.7 + abs(dq.y) - 0.085;      // 四角 / 丸 / ひし形
    g += (1.0 - smoothstep(0.006, 0.006 + W, abs(sd))) + (1.0 - smoothstep(-0.02, 0.0, sd)) * 0.35;
    // ---- 内側の模様：エリアごと（記号の輪と逆に、ゆっくり回る）
    float cs = cos(uSpin * 0.5), sn = sin(uSpin * 0.5); vec2 ip = vec2(cs * vP.x - sn * vP.y, sn * vP.x + cs * vP.y); float ia = atan(ip.y, ip.x);
    if (uPat < 0.5) {                                                 // 遺跡：四角を 2 つ重ねた星 ＋ きざみ
      g += ngon(ip, 4.0, 0.205, 0.0, 0.016) + ngon(ip, 4.0, 0.205, 0.7853982, 0.016) + ring(r, 0.1, 0.014);
      float tk = abs(fract(ia / 6.2831853 * 8.0) - 0.5) / 8.0 * 6.2831853 * r; g += (1.0 - smoothstep(0.006, 0.006 + W, tk)) * step(r, 0.1);
    } else if (uPat < 1.5) {                                          // キノコ：かさのひだ（長短の放射）＋ 波うつふち ＋ 胞子の点
      float ga = fract(ia / 6.2831853 * 28.0), gl = mod(floor(ia / 6.2831853 * 28.0), 2.0);
      g += (1.0 - smoothstep(0.004, 0.004 + W, abs(ga - 0.5) / 28.0 * 6.2831853 * r)) * step(0.07 + 0.07 * gl, r) * step(r, 0.27) * 0.9;
      g += ring(r, 0.285 + 0.012 * cos(ia * 14.0), 0.014) + ring(r, 0.055, 0.014);
      float sc = a / 6.2831853 * 18.0, sid = floor(sc), sr = 0.4 + 0.27 * h1(sid * 3.1 + 5.0);
      g += (1.0 - smoothstep(0.012, 0.012 + W, length(vec2((fract(sc) - 0.5) / 18.0 * 6.2831853 * r, r - sr)))) * step(0.35, h1(sid + 9.0)) * 0.9;
    } else {                                                          // 洞くつ：水晶の六角 ＋ 三角 2 つの六芒星 ＋ まん中の小さな六角
      g += ngon(ip, 6.0, 0.245, 0.0, 0.016) + ngon(ip, 3.0, 0.1225, 0.5235988, 0.014) + ngon(ip, 3.0, 0.1225, -0.5235988, 0.014) + ngon(ip, 6.0, 0.07, 0.5235988, 0.012);
    }
    g = min(g, 1.6);
    // ---- 光り方：外から中心へ、線が順にともる（uIn ＝ ともった所の内がわのはしの半径）。とき放つと金色に
    float lit = smoothstep(uIn - 0.1, uIn, r), front = (1.0 - smoothstep(0.0, 0.07, abs(r - uIn))) * step(-0.03, uIn) * step(uIn, 1.1);
    float sleep = 0.46 + 0.16 * sin(uTime * 0.9), awake = 1.05 + 0.1 * sin(uTime * 1.3 + r * 5.0);
    vec3 base = mix(uCol, uCol2, smoothstep(0.2, 0.95, r)), col = mix(base, uGoldCol, uGold);
    float I = g * mix(sleep, awake, lit) + g * front * 1.2 + (1.0 - smoothstep(0.0, 1.0, r)) * (0.05 + 0.2 * lit * (0.4 + 0.6 * uGold)) + front * 0.22;
    I *= 1.0 + uFlash * 1.2;
    gl_FragColor = vec4(col * I * uAmt * (1.0 - smoothstep(0.98, 1.04, r)), 1.0);
  }`;

// かけらを取る音（短い）：きらめきがのぼる → 手元に着いた やわらかい鐘 → 飛び立つ音
function playPickSound(T) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    if (!actx) actx = new AC(); if (actx.state !== 'running') actx.resume().catch(() => {});
    const t0 = actx.currentTime + 0.05, out = actx.createGain(); out.gain.value = 0.45; out.connect(actx.destination);
    const dl = actx.createDelay(1), fb = actx.createGain(); dl.delayTime.value = 0.27; fb.gain.value = 0.34; out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(actx.destination);
    const tone = (f, t, vol, dur, f1 = null) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); };
    for (let i = 0; i < 7; i++) tone(783.99 * Math.pow(1.122, i), t0 + 0.2 + i * (T.release - 0.4) / 7, 0.012 + 0.004 * i, 0.5);
    for (const [f, d, v] of [[587.33, 0, 0.13], [880.0, 0.09, 0.1], [1174.66, 0.18, 0.07]]) { tone(f, t0 + T.release + d, v, 2.2); tone(f * 2.01, t0 + T.release + d, v * 0.22, 1.2); }
    tone(880, t0 + T.fly, 0.08, 0.9, 2637); tone(1318.5, t0 + T.fly + 0.05, 0.05, 0.8, 3520);
    return true;
  } catch (_) { return false; }
}

// ================================================================ 魔法陣の絵だけを、好きな場所に出す（演出・保存・かけらなし。外から光らせる）
// 最後の花の丘などで使う：const art = createCircleArt({ scene, position: [x, y, z], radius: 2.2, pattern: 'ruins', color: '#ffd36a', color2: '#fff0c0' });
//   毎フレーム art.update(dt, t)。 art.set({ amount, lit, gold, pillar, flash, spin })：amount ＝ ぜんたいの濃さ 0〜1（0 で見えない）、lit ＝ 線が外から中心へともる 0〜1（0 ＝ 眠っている）、
//   gold ＝ 金色 0〜1、pillar ＝ 光の柱 0〜1、flash ＝ ぜんたいが白く光る 0〜1、spin ＝ 記号の輪の回る速さ。 art.wave(半径 m, 強さ 0〜1)：広がる光の波。 art.moveTo(x, y, z)。 art.dispose()
export function createCircleArt(o) {
  const c = createMagicCircle({ ...o, mode: 'circle', key: null, piece: { show: false }, manual: true });
  const art = { group: c.group, uniforms: c.uniforms, radius: c.radius, center: c.group.position, values: c.art,      // center ＝ 中心（THREE.Vector3。moveTo で動く）, radius ＝ 半径 m
    set(v) { Object.assign(c.art, v); c.conform(); return this; }, wave(radius, amount = 1) { c.art.wave = radius; c.art.waveAmt = amount; return this; },
    moveTo(x, y, z) { c.group.position.set(x, y, z); c.position.set(x, y, z); c.conform(); return this; }, update(dt, t) { c.update(dt, t); }, dispose() { c.dispose(); if (window.__sunCircle === art) window.__sunCircle = null; } };
  window.__sunCircle = art;      // 外から読む用：window.__sunCircle.center（x, y, z）と .radius（魔法陣の中の草や花を消す範囲）
  return art;
}

// ================================================================ 魔法陣を 1 つ作る
// o：{ scene, position（THREE.Vector3 か [x, y, z]。円の中心。床・水面のすぐ上か、浅い水の下）, radius（m。初期値 1.5）,
//      pattern（'ruins' | 'mushroom' | 'crystal'）, color・color2（眠っているときの色：内側・外側）, gold（開放後の色）,
//      key（localStorage のキー。SUN_CIRCLE_KEYS のどれか）, riseTo（太陽のかけらがのぼっていく先。高さ m か、[x, y, z]。初期値 ＝ 円の上 14 m）, pillarH（光の柱の高さ。初期値 9）,
//      muted（() => 音を消しているか）, renderOrder（円の描く順。初期値 2）,
//      mode（'circle' ＝ 魔法陣の上に立って開放する（今まで）／'pickup' ＝ 魔法陣を出さず、かけらに近づいて取る。書かなければ、?game=sun のとき 'pickup'、それ以外は 'circle'）,
//      manual（true ＝ 絵だけ。自分では何もしない。createCircleArt が使う）,
//      onOpen(api)（とき放った瞬間）, onCine(info)（演出中、毎フレーム。エリアごとの反応用。info は下の cineInfo）, onPhase(名前, api)（'charge' | 'release' | 'shard' | 'fly' | 'end' に入った瞬間）,
//      ── 下はなくてもよい（なければ自分でさがす・初期値を使う）
//      walker（createViewWalker の返り値。初期値 window.__walker）, controls（lock(bool) を持つ物。初期値 ＝ ページの window.__xxx.controls）, camera,
//      groundH(x, z)（演出のカメラが地面にもぐらないように）, dwell（上に立ってから、真ん中へ歩きはじめるまでの秒。初期値 0.3）, player（操作キャラ { x, z, yaw, vx, vz }。なければ window.__xxx.player をさがす）,
//      cine { faceTo [x, z]（演出中にエルフが向く先。なければ、正面がひらけた向きを自分でえらぶ）, free(p)（カメラがその点に入ってよいか。なければ、ページの constrain・groundH で調べる）,
//             margin（歩ける所からカメラが出てよい距離 m。初期値 0.45）, dist（カメラの距離の倍率。初期値 1）, minH（カメラの高さの下限 m。初期値 0.3）, faceLum（演出中の顔の明るさの目標。初期値 0.45。0 ＝ 明るさ合わせをしない）, light（エルフに魔法陣の色を足す強さ。明るくはしない。初期値 0.25。0 で切る）}, waveR（広がる光の波の半径 m。初期値 9）, gatherR（吸いよせられる粒の半径 m）}
// 返すもの：{ group, shard, update(dt, t, px, pz), open(instant), reset(), preview(状態, 数), state, isOpen, charge, T, cineInfo }
//   毎フレーム update(dt, t, 操作キャラの x, z) を呼ぶ
export function createMagicCircle(o) {
  const PICK = o.mode ? o.mode === 'pickup' : IS_SUN, TL = PICK ? TL_PICK : TL_CIRCLE;      // かけらを取るだけ（魔法陣なし）か、魔法陣の開放か
  const M = o.manual ? { amount: 1, lit: 0, gold: 0, pillar: 0, flash: 0, wave: 0, waveAmt: 0, spin: 0.2 } : null;      // 絵だけ（外から光らせる）
  const pos = o.position.isVector3 ? o.position.clone() : new THREE.Vector3(...o.position), R = o.radius ?? 1.5, H = o.pillarH ?? 9, key = o.key || null;
  const pat = PATTERNS[o.pattern] ?? 2, gold = new THREE.Color(o.gold || '#ffd36a'), CN = { dist: 1, minH: 0.3, margin: 0.45, ...(o.cine || {}) };
  const WAVE_R = o.waveR ?? 9, GATHER_R = o.gatherR ?? Math.max(4.5, R * 3), DWELL = o.dwell ?? (PICK ? 0.08 : 0.3);
  const riseTo = Array.isArray(o.riseTo) ? new THREE.Vector3(...o.riseTo) : o.riseTo && o.riseTo.isVector3 ? o.riseTo.clone() : new THREE.Vector3(pos.x, pos.y + (o.riseTo ?? 14), pos.z);
  const group = new THREE.Group(); group.name = `magic_circle_${o.pattern || 'crystal'}`; group.position.copy(pos); group.visible = !PICK;
  const U = { uTime: { value: 0 }, uIn: { value: 2 }, uGold: { value: 0 }, uAmt: { value: 1 }, uPat: { value: pat }, uFlash: { value: 0 }, uSpin: { value: 0 },
    uCol: { value: new THREE.Color(o.color || '#7fb4ff') }, uCol2: { value: new THREE.Color(o.color2 || o.color || '#b48cff') }, uGoldCol: { value: gold },
    uPillar: { value: 0 }, uGrow: { value: 1 }, uRise: { value: 0 }, uH: { value: 800 }, uGather: { value: 0 }, uNear: { value: 1 }, uWave: { value: 0 }, uWaveA: { value: 0 } };
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
  let cam = o.camera || null; const v2 = new THREE.Vector2();
  // 円（平らな板 1 枚。模様はシェーダーで描く）
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1, M ? 36 : 1, M ? 36 : 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ ...add, uniforms: U, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = vec2(position.x, -position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: DISC_FRAG }));
  disc.scale.setScalar(R); disc.renderOrder = o.renderOrder ?? 2; disc.name = 'circle_disc'; disc.frustumCulled = false; group.add(disc);
  disc.onBeforeRender = (renderer, _s, camera) => { U.uH.value = renderer.getDrawingBufferSize(v2).y; if (!o.camera && camera && camera.isPerspectiveCamera) cam = camera; };
  // 顔の明るさ合わせ：顔の寄りの間に、描いた絵の「顔のあたり」の明るさを数回だけ読み、演出中のエルフの明るさを 目標（CN.faceLum）へ寄せる
  // ＝ 明るいエリアでは白くとばず、暗いエリアでは暗くつぶれない（エリアごとの光の強さを知らなくてもよい）。読むのは 15×15 画素を 4 回だけ
  const face = { v: new THREE.Vector3(), half: new Uint16Array(4 * 225), u8: new Uint8Array(4 * 225), lum: [], head: null };
  disc.onAfterRender = (renderer) => {
    if (!st.measure || !cam) return; st.measure = false; if (CN.faceLum === 0) return;
    try {
      const w = findWalker(), av = w && w.avatar, rt = renderer.getRenderTarget(); if (!av || !rt || !av.root.visible) return;
      if (!face.head) face.head = av.model.getObjectByName('Head'); if (!face.head) return;
      const f = av.root.rotation.y; face.head.getWorldPosition(face.v); face.v.x += Math.sin(f) * 0.1; face.v.z += Math.cos(f) * 0.1; face.v.y += 0.05; face.v.project(cam);
      if (Math.abs(face.v.x) > 0.9 || Math.abs(face.v.y) > 0.9 || face.v.z > 1) return;
      const x = clamp(Math.round((face.v.x * 0.5 + 0.5) * rt.width) - 7, 0, rt.width - 15), y = clamp(Math.round((face.v.y * 0.5 + 0.5) * rt.height) - 7, 0, rt.height - 15);
      const isHalf = rt.texture.type === THREE.HalfFloatType, buf = isHalf ? face.half : face.u8; renderer.readRenderTargetPixels(rt, x, y, 15, 15, buf);
      const ls = []; for (let i = 0; i < 225; i++) { const g = (k) => (isHalf ? THREE.DataUtils.fromHalfFloat(buf[i * 4 + k]) : buf[i * 4 + k] / 255), r = g(0), gg = g(1), b = g(2); if (b > 0.7 * r && r > 0.02) ls.push(0.3 * r + 0.6 * gg + 0.1 * b); }      // 肌の色の画素だけ（黄色い髪は数えない）
      if (ls.length < 20) return; ls.sort((a, b) => a - b); face.lum.push(ls[Math.floor(ls.length * 0.6)]);
      if (face.lum.length >= (st.preview ? 1 : 4)) { const m = [...face.lum].sort((a, b) => a - b)[Math.floor(face.lum.length / 2)]; st.faceLum = m; st.gain = clamp((CN.faceLum ?? 0.45) / Math.max(m / (st.gainNow || 1), 0.02), 0.5, 3.0); }
    } catch (_) { /* 読めない環境では、何もしない */ }
  };
  // まわりへ広がる光の波（とき放つとき。平らな板 1 枚に、輪を 2 本）
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, M ? 40 : 1, M ? 40 : 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ ...add, uniforms: U, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vP; void main(){ vP = vec2(position.x, -position.z); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uWave, uWaveA; uniform vec3 uGoldCol; varying vec2 vP;
      void main(){ float d = length(vP) * ${WAVE_R.toFixed(2)}, x1 = (d - uWave) / 0.38, x2 = (d - uWave + 1.2) / 0.26;
        float g = exp(-x1 * x1) + 0.5 * exp(-x2 * x2) + 0.12 * smoothstep(uWave, uWave - 3.0, d) * step(d, uWave);
        gl_FragColor = vec4(mix(uGoldCol, vec3(1.0, 0.96, 0.82), 0.3) * g * uWaveA * 0.55 * (1.0 - smoothstep(0.62, 1.0, length(vP))), 1.0); }` }));
  wave.scale.setScalar(WAVE_R); wave.position.y = 0.03; wave.renderOrder = disc.renderOrder; wave.name = 'circle_wave'; wave.visible = false; group.add(wave);
  // 光の柱（ふたのない筒）：上へ流れるすじ。上ほどうすい。uGrow で下からのびる
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.74, H, 28, 1, true).translate(0, H / 2, 0), new THREE.ShaderMaterial({ ...add, uniforms: U, side: THREE.DoubleSide,
    vertexShader: 'uniform float uGrow; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.y *= uGrow; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: `uniform float uRise, uPillar, uNear; uniform vec3 uGoldCol; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float x = vUv.x * 28.0, s = vn(vec2(x, vUv.y * 2.5 - uRise * 1.1)) * 0.6 + vn(vec2(x * 2.3 + 7.0, vUv.y * 6.0 - uRise * 2.3)) * 0.4;
        float a = (0.25 + 0.95 * smoothstep(0.35, 0.8, s)) * pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.03, vUv.y);
        gl_FragColor = vec4(mix(uGoldCol, vec3(1.0, 0.97, 0.85), 0.35) * a * uPillar * uNear * 0.3, 1.0); }` }));
  pillar.renderOrder = 6; pillar.name = 'circle_pillar'; pillar.visible = false; group.add(pillar);
  // 立ちのぼる光の粒（らせんにのぼる ＝ 足もとからの風。位置はシェーダーで計算。uRise が進むほどのぼる）
  const points = (n, vs, fs, name) => { const seed = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const m = new THREE.Points(pg, new THREE.ShaderMaterial({ ...add, uniforms: U, vertexShader: vs, fragmentShader: fs })); m.frustumCulled = false; m.renderOrder = 7; m.name = name; m.visible = false; group.add(m); return m; };
  const PT_FS = (col) => `uniform vec3 ${col}; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(mix(${col}, vec3(1.0), 0.3) * a * a * vA, 1.0); }`;
  const motes = points(64, `attribute vec3 aSeed; uniform float uRise, uPillar, uGrow, uH; varying float vA;
      void main(){ float u = fract(aSeed.y + uRise * (0.07 + 0.09 * aSeed.z)), y = u * ${H.toFixed(2)} * uGrow, an = aSeed.x * 6.2831 + uRise * (0.5 + aSeed.z) + y * 0.6, rad = ${R.toFixed(3)} * (0.15 + 0.75 * aSeed.z) * (1.0 - 0.45 * u);
        vec4 mv = modelViewMatrix * vec4(cos(an) * rad, y, sin(an) * rad, 1.0); gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.08, u) * (1.0 - u) * uPillar; gl_PointSize = min((0.05 + 0.06 * aSeed.x) * projectionMatrix[1][1] * uH * 0.5 / max(0.3, -mv.z), 64.0); }`, PT_FS('uGoldCol'), 'circle_motes');
  // 吸いよせられる光の粒（ためるとき。まわりから、らせんをえがいて魔法陣へ）
  const gather = points(44, `attribute vec3 aSeed; uniform float uGather, uTime, uH; varying float vA;
      void main(){ float pr = clamp(uGather * 1.5 - aSeed.y * 0.5, 0.0, 1.0), e = pr * pr * (3.0 - 2.0 * pr);
        float rad = mix(${GATHER_R.toFixed(2)} * (0.45 + 0.55 * aSeed.z), 0.1, e), an = aSeed.x * 6.2831 + e * 4.2 + uTime * 0.3, y = mix(0.25 + 2.4 * fract(aSeed.x * 7.31), 0.1, e * e);
        vec4 mv = modelViewMatrix * vec4(cos(an) * rad, y, sin(an) * rad, 1.0); gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.15, pr) * (1.0 - smoothstep(0.88, 1.0, pr)); gl_PointSize = min((0.06 + 0.07 * aSeed.z) * projectionMatrix[1][1] * uH * 0.5 / max(0.3, -mv.z), 64.0); }`, PT_FS('uCol'), 'circle_gather');
  // 太陽のかけら：金色の光の玉（芯 ＋ にじみ）。場面に直接置く（のぼっていく先は、円の真上とはかぎらない）
  const sprite = (color, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color, ...add })); sp.scale.setScalar(s); sp.renderOrder = 8; sp.visible = false; return sp; };
  const shard = new THREE.Group(), core = sprite('#fff6d8', R * 0.6), halo = sprite(gold, R * 2.1); shard.add(halo, core); shard.name = 'sun_shard'; shard.visible = false;
  // 開放の前：かけらは「魔法陣の前」に落ちていて、少し浮いて、ゆっくり回りながら金色に光る。まっすぐ上へ、細い光のすじ（遠くからの目じるし）と、のぼる光の粒
  //   piece: { front [x, z]（「前」の向き ＝ この点のほうへ置く。エリアの入口の側。なければ、はじめに操作キャラがいた側）, dist（円のふちからの距離 m。初期値 0.9）, height（浮く高さ m。初期値 1.0）, beamH（光のすじの高さ m。初期値 22）, show（false で出さない）}
  const PC = { dist: 0.9, height: PICK ? 1.5 : 1.0, beamH: 22, show: true, ...(o.piece || {}) };      // かけらを取るモードでは、少し高い所（エルフが見上げる高さ）
  // 飛び立ったあとの 3D のかけら：おひさまのゲーム（?game=sun。画面の上の太陽マークへ飛ぶ光は sun_game.js が描く）では、合図を出してすぐ消す。それ以外は、今までどおり空へのぼる。piece.toUI で決めてもよい
  const TO_UI = PC.toUI ?? IS_SUN, NEAR = PC.near ?? 2.2, STAND = PC.stand ?? 0.95, BIGC = PICK ? 0.62 : R * 0.6, BIGH = PICK ? 1.75 : R * 1.6;      // near ＝ かけらを取る演出が始まる距離、stand ＝ 取る時に立つ所（かけらからの距離）
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffeab0', fog: false })); gem.scale.set(0.12, 0.2, 0.12); gem.name = 'sun_shard_gem'; shard.add(gem);
  if (PICK) { gem.frustumCulled = false; gem.onBeforeRender = (renderer, sc, camera) => { disc.onBeforeRender(renderer, sc, camera); placePrompt(renderer, camera); }; gem.onAfterRender = disc.onAfterRender; }      // 魔法陣を描かないとき：カメラと顔の明るさは、かけらを描く時に調べる
  // かけらの下の、やわらかい光だまり（魔法陣を出さないときだけ。円や紋の形にはしない）
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: gold, ...add, opacity: 0.4 })); pool.scale.setScalar(2.8); pool.renderOrder = 5; pool.visible = false; pool.name = 'sun_shard_pool';
  U.uBeam = { value: 0 };
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0), new THREE.ShaderMaterial({ ...add, uniforms: U, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, side = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - c));      // たての板が、いつもカメラのほうを向く
        gl_Position = projectionMatrix * viewMatrix * vec4(c + side * position.x * 1.7 + vec3(0.0, position.y * ${PC.beamH.toFixed(1)}, 0.0), 1.0); }`,
    fragmentShader: `uniform float uTime, uBeam; uniform vec3 uGoldCol; varying vec2 vUv;
      void main(){ float x = abs(vUv.x - 0.5) * 2.0, core = exp(-x * x * 220.0), glow = exp(-x * x * 10.0);
        float up = pow(1.0 - vUv.y, 1.5) * smoothstep(0.0, 0.015, vUv.y), fl = 0.85 + 0.15 * sin(uTime * 2.3 + vUv.y * 40.0);
        gl_FragColor = vec4((mix(uGoldCol, vec3(1.0, 0.97, 0.86), 0.5) * core * 1.0 + uGoldCol * glow * 0.22) * up * fl * uBeam, 1.0); }` }));
  beam.frustumCulled = false; beam.renderOrder = 6; beam.name = 'sun_shard_beam'; shard.add(beam);
  const pSeed = new Float32Array(20 * 3); for (let i = 0; i < 60; i++) pSeed[i] = Math.random();
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60), 3)); pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 3));
  const pieceMotes = new THREE.Points(pGeo, new THREE.ShaderMaterial({ ...add, uniforms: U,
    vertexShader: `attribute vec3 aSeed; uniform float uTime, uBeam, uH; varying float vA;
      void main(){ float u = fract(aSeed.y + uTime * (0.1 + 0.08 * aSeed.z)), an = aSeed.x * 6.2831 + uTime * 0.5, rad = 0.08 + 0.3 * aSeed.z * (1.0 - u);
        vec4 mv = modelViewMatrix * vec4(cos(an) * rad, u * 3.2, sin(an) * rad, 1.0); gl_Position = projectionMatrix * mv;
        vA = smoothstep(0.0, 0.1, u) * (1.0 - u) * uBeam; gl_PointSize = min((0.035 + 0.04 * aSeed.x) * projectionMatrix[1][1] * uH * 0.5 / max(0.3, -mv.z), 48.0); }`,
    fragmentShader: `uniform vec3 uGoldCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(mix(uGoldCol, vec3(1.0), 0.3) * a * a * vA, 1.0); }` }));
  pieceMotes.frustumCulled = false; pieceMotes.renderOrder = 7; pieceMotes.name = 'sun_shard_motes'; shard.add(pieceMotes);
  const rest = new THREE.Vector3(); let restSet = false;              // かけらの置き場所（魔法陣の前）
  const scene = o.scene; scene.add(group, shard, pool); const goal = { x: pos.x, z: pos.z };      // goal ＝ 演出の時にエルフが立つ所（魔法陣の真ん中か、かけらの前）

  const st = { state: 'sleep', charge: 0, T: 0, dwell: 0, px: pos.x, pz: pos.z, gotPx: false, measure: false, gain: null, gainNow: 1, gainT: 0, faceLum: null, preview: false, face: null, faceFrom: 0, wide2: 42, wide4: -70, side: 1, fov0: 50, cut: 0, dk: 1, wasFp: false, clip: null, marks: {}, hooked: null, controls: null, blockers: null, camY: null, enter: null, frontA: null };
  const E = new THREE.Vector3(), hover = new THREE.Vector3(), from = new THREE.Vector3(), cp = new THREE.Vector3(), look = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), mLook = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const windK = (T) => sstep(T, TL.release - 0.1, TL.release + 0.7) * (1 - sstep(T, TL.shard + 0.3, TL.shard + 2.2));
  // かけらの置き場所：魔法陣の前（piece.front のほう。なければ、はじめに操作キャラがいた側）。壁・石柱・茎にめりこむ向きは、少しずつ回してさがす
  function placePiece() {
    restSet = true;
    const fx = PC.front ? PC.front[0] - pos.x : st.px - pos.x, fz = PC.front ? PC.front[1] - pos.z : st.pz - pos.z, a0 = Math.hypot(fx, fz) > 0.3 ? Math.atan2(fx, fz) : 0, d = R + PC.dist; st.frontA = a0;
    for (const off of [0, 25, -25, 50, -50, 80, -80, 115, -115, 150, -150, 180]) {
      const a = a0 + off * Math.PI / 180; rest.set(pos.x + Math.sin(a) * d, pos.y + PC.height, pos.z + Math.cos(a) * d);
      let ok = true; for (const [dx, dz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) { tmpP.set(rest.x + dx, rest.y, rest.z + dz); if (!free(tmpP)) { ok = false; break; } }
      if (ok) return;
    }
    rest.set(pos.x + Math.sin(a0) * R * 0.5, pos.y + PC.height, pos.z + Math.cos(a0) * R * 0.5);      // どの向きも入れない：円の中の、前より
  }
  const tmpP = new THREE.Vector3();
  // かけらが待つ所（上から見た場所）：真ん中に立つエルフの、少し前の上（エルフにも、さし出す手にも重ならない）
  // エルフの手元（両手の間の少し上。しぐさのクリップがないときは、胸の前）。体や服にめりこまないよう、体の軸から 0.3 m より近づけない
  const hand = { l: null, r: null, a: new THREE.Vector3(), b: new THREE.Vector3(), av: null, hold: new THREE.Vector3(), has: false };
  function handAt(out) {
    const w = findWalker(), av = w && w.avatar, f = st.face ?? (av ? av.state.facing : 0), fx = Math.sin(f), fz = Math.cos(f), gy = av ? av.root.position.y : pos.y;
    if (av && hand.av !== av) { hand.av = av; hand.l = av.model.getObjectByName('Left_MiddleProximal') || av.model.getObjectByName('Left_Hand'); hand.r = av.model.getObjectByName('Right_MiddleProximal') || av.model.getObjectByName('Right_Hand'); }
    let ok = false;
    if (av && st.clip && hand.l && hand.r) { av.root.updateWorldMatrix(true, true); hand.l.getWorldPosition(hand.a); hand.r.getWorldPosition(hand.b); out.addVectors(hand.a, hand.b).multiplyScalar(0.5); ok = out.y > gy + 0.72; }      // 手が上がっている時だけ、手の場所を使う
    if (ok) {
      out.y = Math.max(out.y + (PC.handUp ?? 0.2), gy + 0.9);
      const d = (out.x - st.px) * fx + (out.z - st.pz) * fz; if (d < 0.3) { out.x += fx * (0.3 - d); out.z += fz * (0.3 - d); }
    } else out.set(st.px + fx * 0.42, gy + 1.1, st.pz + fz * 0.42);
    return out;
  }
  // かけらが手元から飛び立つ瞬間の合図：sunpiece:release { id（ruins / mushroom / cave）, x, y（その時の、かけらの画面上の場所。CSS ピクセル）}。受ける側がいなくても、何も起きないだけ
  const PIECE_ID = key && key.startsWith('sunCircle_') ? key.slice(10) : ({ ruins: 'ruins', mushroom: 'mushroom', crystal: 'cave' })[o.pattern || 'crystal'];
  function sendRelease() {
    st.marks.pieceRel = true; let x = window.innerWidth / 2, y = window.innerHeight * 0.55, size = 40;
    try {
      if (cam) {
        const el = (o.renderer || (findBy((v) => v.renderer && v.renderer.domElement) || {}).renderer || {}).domElement, r = el ? el.getBoundingClientRect() : null;
        cam.updateMatrixWorld(); tmpP.copy(shard.position).project(cam);
        const W = r && r.width > 0 ? r : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        if (tmpP.z < 1) { x = W.left + (tmpP.x * 0.5 + 0.5) * W.width; y = W.top + (0.5 - tmpP.y * 0.5) * W.height;
          const hh = gem.scale.y, y1 = tmpP.copy(shard.position).setY(shard.position.y + hh).project(cam).y, y0 = tmpP.copy(shard.position).setY(shard.position.y - hh).project(cam).y; size = Math.abs(y1 - y0) * 0.5 * W.height; }      // size ＝ かけら（結晶）の、画面上の見かけの高さ
      }
    } catch (_) { /* 場所がわからないときは、画面のまん中あたり */ }
    api.lastRelease = { id: PIECE_ID, x, y, size };
    window.dispatchEvent(new CustomEvent(SUN_PIECE_EVENT, { detail: { id: PIECE_ID, x, y, size } }));
  }
  // 演出の今のようす（エリアごとの反応 onCine に渡す）
  const info = { api: null, phase: 'sleep', T: 0, charge: 0, gold: 0, wind: 0, wave: 0, waveAmt: 0, center: pos, radius: R };
  function apply() {
    const s = st.state, T = st.T;
    if (M) {                                                         // 絵だけ：外から入れた値のとおりに光る
      U.uAmt.value = M.amount; U.uIn.value = M.lit <= 0 ? 2 : 1.15 - M.lit * 1.32; U.uGold.value = M.gold; U.uFlash.value = M.flash; U.uPillar.value = M.pillar; U.uGrow.value = 1; U.uGather.value = 0; U.uWave.value = M.wave; U.uWaveA.value = M.waveAmt; U.uNear.value = 1;
      group.visible = M.amount > 0.003; pillar.visible = motes.visible = M.pillar > 0.004; gather.visible = false; wave.visible = M.waveAmt > 0.004; shard.visible = false; return;
    }
    if (s === 'sleep') { U.uIn.value = st.charge > 0 ? 1.15 - st.charge * 1.3 : 2; U.uGold.value = 0; U.uFlash.value = 0; U.uPillar.value = 0; U.uGrow.value = 1; U.uGather.value = 0; U.uWaveA.value = 0; }
    else if (s === 'opening') {
      const c = clamp(T / TL.release, 0, 1), rel = T - TL.release;
      U.uIn.value = 1.15 - smoother(c, 0, 1) * 1.32; U.uGold.value = sstep(T, TL.release, TL.release + 0.9); U.uFlash.value = rel < 0 ? 0.3 * c * c : Math.exp(-rel * 1.5) * 0.8;
      U.uGather.value = c; U.uGrow.value = 0.1 + 0.9 * sstep(T, TL.release, TL.release + 1.3);
      U.uPillar.value = 0.1 * c * c + sstep(T, TL.release, TL.release + 0.7) * (1 - 0.84 * sstep(T, TL.fly + 0.2, TL.end - 0.4));
      const rel2 = T - TL.fly;                                         // 光の波：とき放つ時と、かけらが飛び立つ時の 2 回
      if (rel2 >= 0) { U.uWave.value = rel2 * 5.0; U.uWaveA.value = 0.8 * sstep(rel2, 0, 0.2) * (1 - sstep(rel2, 1.2, 2.2)); }
      else { U.uWave.value = Math.max(0, rel) * 4.2; U.uWaveA.value = sstep(rel, 0, 0.2) * (1 - sstep(rel, 1.4, 2.4)); }
      // 太陽のかけら：魔法陣の前から、中心の上へ引きよせられる（ためる間）→ 光の柱の中で待つ → 少しおりてきて強く光る（かけらの絵）→ 飛び立つ（だんだん速く）→ 小さくなって消える
      if (!restSet) placePiece();
      // 太陽のかけら：魔法陣の前で光ったまま待つ（ためる・とき放つ）→ 6 秒から、エルフの手元へふわっと飛んでくる（弓なり。小さくなる）→ 手元でとどまって光る（7.6〜9 秒）
      //   → 9 秒で飛び立つ：合図 sunpiece:release を出す。画面の上の太陽マークへ飛ぶのは sun_game.js（TO_UI ＝ 3D のかけらはここで消す）。おひさまのゲームでないときは、今までどおり空（riseTo）へのぼって消える
      const HT = TL.shard + 1.6, arrive = smoother(T, TL.shard, HT), k = TO_UI ? 0 : smoother(T, TL.fly, TL.end - 0.5), out = TO_UI ? 1 : 1 - sstep(T, TL.end - 1.3, TL.end - 0.4);
      if (PC.show) { from.copy(rest); from.y += 0.07 * Math.sin(U.uTime.value * 1.3); } else from.set(pos.x, pos.y + 2.75, pos.z);
      if (T >= TL.shard - 0.05) {
        if (T < TL.fly - 0.05 || !hand.has) { handAt(hover); hand.hold.copy(hover); hand.has = true; } else hover.copy(hand.hold);      // 飛び立つ時は、手を追わない（手はここから下がる）
        from.lerp(hover, arrive); from.y += 0.45 * Math.sin(arrive * Math.PI); }
      shard.position.lerpVectors(from, riseTo, k * k);
      const born = PC.show ? 1 : sstep(T, TL.shard, TL.shard + 0.6), hold = sstep(T, HT - 0.2, HT + 0.3) * (1 - k), pulse = 1 + 0.1 * Math.sin(T * 6.0) * hold + 0.05 * Math.sin(T * 2.1);
      const small = arrive * (1 - k), sc = born * (0.35 + 0.65 * out) * pulse;                             // 手元では小さく（顔や体が光にうもれない）。空へのぼるときは、また大きく
      core.scale.setScalar(lerp(BIGC * 0.85, 0.36, small) * sc); halo.scale.setScalar(lerp(BIGH * 0.85, 0.85, small) * sc);
      core.material.opacity = born * out * 0.95; halo.material.opacity = born * out * 0.5; gem.scale.set(0.12, 0.2, 0.12).multiplyScalar(born * out * lerp(1, 0.62, small));      // 明るさは変えない（同じかけらが、少しずつ小さくなるだけ）
      U.uBeam.value = PC.show ? 1 - sstep(T, TL.shard - 0.4, TL.shard + 0.5) : 0;
    }
    if (s === 'sleep' && PC.show && (restSet || st.gotPx)) {            // 開放の前：魔法陣の前で、少し浮いて光る（置き場所は、操作キャラの場所がわかってから決める）
      if (!restSet) placePiece();
      shard.position.copy(rest); shard.position.y += 0.07 * Math.sin(U.uTime.value * 1.3);
      const sc = 0.85 * (1 + 0.05 * Math.sin(U.uTime.value * 2.1)); core.scale.setScalar(BIGC * sc); halo.scale.setScalar(BIGH * sc);
      core.material.opacity = 0.95; halo.material.opacity = 0.5; gem.scale.set(0.12, 0.2, 0.12); U.uBeam.value = 1;
    }
    if (PICK) {                                                      // 光だまり：かけらが待っている間だけ。取ると消える
      // 足もとの光だまりは出さない（地面の丸い光が、魔法陣のように見えるため。エリアには魔法陣を置かない決まり）。piece: { pool: true } のときだけ出す
      const k = PC.pool !== true ? 0 : s === 'sleep' && PC.show && restSet ? 1 : s === 'opening' && PC.show ? 1 - sstep(T, TL.shard, TL.shard + 1.0) : 0; pool.visible = k > 0.01;
      if (pool.visible) { const gh = o.groundH || (page && page.groundH); pool.position.set(rest.x, Math.max(pos.y, gh ? gh(rest.x, rest.z) : pos.y) + 0.05, rest.z); pool.material.opacity = 0.4 * k * (0.9 + 0.1 * Math.sin(U.uTime.value * 1.7)); }
    }
    if (s === 'open') { U.uIn.value = -1; U.uGold.value = 1; U.uFlash.value = 0; U.uPillar.value = 0.16; U.uGrow.value = 1; U.uGather.value = 0; U.uWaveA.value = 0; }
    if (s !== 'opening') U.uNear.value = 1;
    pillar.visible = motes.visible = U.uPillar.value > 0.004; gather.visible = s === 'opening' && T < TL.release + 0.3; wave.visible = U.uWaveA.value > 0.004;
    const gone = TO_UI ? TL.fly : TL.end - 0.4, sh = PC.show ? ((s === 'sleep' && restSet) || (s === 'opening' && T < gone)) : (s === 'opening' && T > TL.shard && T < gone);
    shard.visible = core.visible = halo.visible = sh; gem.rotation.y = U.uTime.value * 0.7; beam.visible = pieceMotes.visible = sh && U.uBeam.value > 0.004;
    info.phase = s !== 'opening' ? s : T < TL.release ? 'charge' : T < TL.shard ? 'release' : T < TL.fly ? 'shard' : 'fly';
    info.T = T; info.charge = s === 'opening' ? clamp(T / TL.release, 0, 1) : s === 'open' ? 1 : st.charge; info.gold = U.uGold.value; info.wind = s === 'opening' ? windK(T) : 0; info.wave = U.uWave.value; info.waveAmt = U.uWaveA.value;
  }

  // ---------------------------------------------------------------- 演出のカメラ（演出専用。いつもの後ろからのカメラは使わず、エルフの顔を主役に、カットを切りかえる）
  //   ためる 0〜3      エルフの正面ななめ前、顔の高さから、ゆっくり寄る
  //   とき放つ 3〜6    横の低い位置から、上がりながら正面へ回りこみ（だんだん速く）、手をひらく所で一気に引いて、魔法陣ぜんたいと光の柱
  //   かけら 6〜9      ななめ横・顔の高さから。かけらと顔が同じ画面（さし出した手は顔の横）。かけらに合わせて、カメラも上へ
  //   もどる 9〜12     大きく引いてエリアぜんたい → 10.4 秒から、いつもの操作カメラへなめらかにつなぐ
  // カメラは「見る点 → カメラ」の間を少しずつ調べ、地面・壁・入れない所（石柱・茎・水晶）の手前で止める。エルフは、正面にカメラの入るすき間がある向きへ、はじめにゆっくり向きなおる
  const findWalker = () => o.walker || window.__walker || null;
  const findBy = (test) => { for (const k of Object.keys(window)) { if (!k.startsWith('__')) continue; try { const v = window[k]; if (v && test(v)) return v; } catch (_) { /* 読めない物はとばす */ } } return null; };
  const findControls = () => o.controls || (findBy((v) => v.controls && typeof v.controls.lock === 'function') || {}).controls || null;
  let page;                                                           // ページの「歩ける所」と地面の高さ（window.__xxx.constrain・groundH）
  const D2R = Math.PI / 180, tmp = new THREE.Vector3(), L = new THREE.Vector3(), SH = { az: 0, d: 3, h: 1, look: 1, fov: 50, cut: 0 };
  // カメラがその点に入ってよいか：cine.free(p) があればそれ。なければ「地面より上・魔法陣より上・歩ける所から cine.margin 以内」
  function free(p) {
    if (CN.free) return CN.free(p);
    if (page === undefined) page = findBy((v) => typeof v.constrain === 'function' && typeof v.groundH === 'function');
    const gh = o.groundH || (page && page.groundH);
    if (p.y < pos.y + 0.12 || (gh && p.y < gh(p.x, p.z) + 0.22)) return false;
    if (page) { const c = page.constrain(p.x, p.z); if (Math.hypot(c[0] - p.x, c[1] - p.z) > CN.margin) return false; }
    return true;
  }
  // 見る点 a からカメラ b へ進めて、じゃまな物の手前までの割合（0〜1）
  function freeFrac(a, b) { const n = Math.max(4, Math.ceil(a.distanceTo(b) / 0.3)); for (let i = 1; i <= n; i++) { tmp.lerpVectors(a, b, i / n); if (!free(tmp)) return (i - 1) / n; } return 1; }
  const camAt = (F, az, d, h, out) => out.set(E.x + Math.sin(F + az * D2R) * d, E.y + h, E.z + Math.cos(F + az * D2R) * d);
  const roomAt = (F, az, d, h, look) => { L.set(E.x, E.y + look, E.z); return freeFrac(L, camAt(F, az, d, h, cp)); };
  // 時間 → カメラ（az ＝ エルフの正面から回った角度°、d ＝ 距離、h ＝ 足もとからの高さ、look ＝ 見る点の高さ、fov ＝ 画角、cut ＝ カットの番号）
  function shotAt(T) {
    const set = (az, d, h, look, fov, cut) => { SH.az = az; SH.d = d; SH.h = h; SH.look = look; SH.fov = fov; SH.cut = cut; };
    if (PICK) {                                                      // かけらを取る：エルフの顔が見える ななめ前から。かけらが手元へ来るのに合わせて寄り、手元のかけらと顔でとまる（カットなし）
      const sd = st.side, a = clamp(T / TL.shard, 0, 1), u = smoother(T, TL.shard, TL.shard + 1.6), v = smoother(T, TL.shard + 1.6, TL.fly), tl = cam && cam.aspect < 1;      // たて長の画面：かけらとエルフが横にならぶと入りきらないので、正面よりから
      set(lerp(lerp(lerp(tl ? 34 : 64, tl ? 30 : 56, a), 44, u), 47, v) * sd, lerp(lerp(lerp(tl ? 3.2 : 2.9, tl ? 2.9 : 2.6, a), 1.6, u), 1.48, v), lerp(lerp(1.4, 1.34, a), 1.25, u), lerp(lerp(1.22, 1.17, u), 1.14, v), lerp(48, 54, u), 1); return;
    }
    const R1 = TL.release + 1.6;
    if (T < TL.release) { const u = smoother(T, 0, TL.release); set(lerp(38, 18, u), lerp(2.5, 1.45, u), lerp(1.3, 1.22, u), 1.18, lerp(44, 36, u), 1); }
    else if (T < R1) { const e = Math.pow((T - TL.release) / 1.6, 1.8); set(lerp(-82, 25, e), lerp(1.7, 2.3, e), lerp(0.5, 1.42, sstep(e, 0, 0.55)), lerp(1.0, 1.2, e), 46, 2); }      // 手が口もとに重ならないよう、正面へ回るまでに顔より上の高さへ
    else if (T < TL.shard) { const w = 1 - Math.pow(1 - (T - R1) / (TL.shard - R1), 3); set(lerp(25, st.wide2, w), lerp(2.3, 6.2, w), lerp(1.42, 1.9, w), lerp(1.2, 1.5, w), lerp(46, 62, w), 2); }
    // かけら 6〜9：カットを切らない。引きの絵（魔法陣の前のかけらとエルフが両方映っている）から、かけらが手元へ飛ぶのと同じ速さで寄っていき、手元のかけらと顔の絵でとまる ＝ かけらは画面に映りつづける
    else if (T < TL.fly) { const u = smoother(T, TL.shard, TL.shard + 1.6), v = smoother(T, TL.shard + 1.6, TL.fly), s = st.side;
      set(lerp(lerp(st.wide2, 52 * s, u), 46 * s, v), lerp(lerp(6.2, 1.5, u), 1.42, v), lerp(lerp(1.9, 1.2, u), 1.28, v), lerp(lerp(1.5, 1.17, u), 1.14, v), lerp(62, 56, u), 2); }
    else { const u = smoother(T, TL.fly, TL.fly + 1.7), s = st.side; set(lerp(46 * s, st.wide4, u), lerp(1.42, 7.0, u), lerp(1.28, 3.4, u), lerp(1.14, 1.3, u), lerp(56, 66, u), 2); }
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  // 演出のはじめに 1 回：エルフの向き（正面にカメラの入るすき間がある向き）と、引きの絵の角度（いちばん引ける向き）を決める
  function planShots(av) {
    const cur = av ? av.state.facing : Math.atan2(E.x - cam.position.x, E.z - cam.position.z);
    st.faceFrom = cur;
    if (PICK) {                                                      // かけらを取る：エルフは かけらのほうを向く。カメラは、あいている側のななめ前
      st.face = Math.hypot(rest.x - E.x, rest.z - E.z) > 0.15 ? Math.atan2(rest.x - E.x, rest.z - E.z) : cur;
      st.side = roomAt(st.face, 60, 2.8, 1.38, 1.2) >= roomAt(st.face, -60, 2.8, 1.38, 1.2) - 0.05 ? 1 : -1; st.fov0 = cam.fov; st.cut = 0; st.dk = 1; return;
    }
    if (CN.faceTo) st.face = Math.atan2(CN.faceTo[0] - E.x, CN.faceTo[1] - E.z);
    else { if (st.frontA === null) placePiece(); const base = st.frontA ?? cur;      // 決まった向き：魔法陣の「前」（かけらのあった側 ＝ 入口の側）から、カメラの入るすき間をさがす
      let best = base, bs = -1; for (const off of [0, 45, -45, 90, -90, 135, -135, 180]) { const F = base + off * D2R, sc = Math.min(roomAt(F, 28, 2.6, 1.25, 1.18), roomAt(F, -55, 1.8, 1.25, 1.5), roomAt(F, 20, 2.2, 1.4, 1.1)); if (sc > bs + 0.02) { bs = sc; best = F; } if (sc >= 0.98) break; } st.face = best; }
    const pick = (list, d, h, look) => { let best = list[0], bs = -1; for (const az of list) { const sc = roomAt(st.face, az, d, h, look); if (sc > bs + 0.02) { bs = sc; best = az; } if (sc >= 0.85) break; } return best; };
    st.wide2 = pick([42, 70, 15, 100, -15, 130, -50, 160, -90, -130], 6.2, 1.7, 1.5); st.side = st.wide2 >= 0 ? 1 : -1;      // side ＝ 引きの絵のあと、かけらを追って寄っていく側（引きの絵と同じ側 ＝ かけらの通り道を横切らない）
    st.wide4 = pick([-70, -100, -40, -130, -10, 70, 100, 130, 160, 40].map((a) => -a * st.side), 7.0, 3.4, 1.3);
    st.fov0 = cam.fov; st.cut = 0; st.dk = 1;
  }
  function cineCamera(w) {
    if (st.state !== 'opening' || !cam) return;
    const T = st.T, av = w && w.avatar ? w.avatar : null;
    E.set(st.px, av ? av.root.position.y : pos.y, st.pz);
    if (st.face === null) planShots(av);
    if (av) { playElf(av); av.state.facing = st.faceFrom + angDiff(st.face, st.faceFrom) * smoother(T, 0, 0.9); av.root.rotation.y = av.state.facing; }      // エルフが、カメラのほうへ向きなおる
    shotAt(T); if (api.cineOverride) Object.assign(SH, api.cineOverride);      // 確認用：カメラを手で決める { az, d, h, look, fov }
    const tall = cam.aspect < 1, d = SH.d * CN.dist * (tall && SH.d > 3 ? 1.12 : 1);                       // たて長の画面：引きの絵は少し遠くから、画角は少し広く
    const toShard = (tall ? 0.5 : 0.45) * (PICK ? sstep(T, 0, 0.6) : sstep(T, TL.release + 1.6, TL.shard - 0.6)) * (1 - sstep(T, TL.fly, TL.fly + 1.2));      // かけらが手元へ動く間・手元にある間は、見る点を かけらのほうへ寄せる（かけらとエルフが同じ画面）
    look.set(lerp(E.x, shard.position.x, toShard), E.y + SH.look, lerp(E.z, shard.position.z, toShard));
    if (PICK) look.y += toShard * 0.7 * Math.max(0, shard.position.y - look.y);      // かけらが顔より高い間は、見る点も少し上へ
    camAt(st.face, SH.az, d, Math.max(SH.h, CN.minH), cp);
    const fr = freeFrac(look, cp), want = fr >= 1 ? 1 : Math.max(0.9 / d, fr - 0.2 / d);                   // じゃまな物の手前まで寄る（近づくのは速く、はなれるのはゆっくり）
    if (st.cut !== SH.cut) { st.cut = SH.cut; st.dk = want; } else st.dk += (want - st.dk) * (want < st.dk ? 0.5 : 0.06);
    cp.sub(look).multiplyScalar(st.dk).add(look);
    const shake = (T >= TL.release ? 0.035 * Math.exp(-(T - TL.release) * 4.5) : 0) + (T >= TL.fly + 0.07 ? 0.02 * Math.exp(-(T - TL.fly - 0.07) * 4.5) : 0);      // 光が走る瞬間の、小さなゆれ
    cp.x += Math.sin(T * 61.0) * shake; cp.y += Math.sin(T * 47.0 + 1.0) * shake; cp.z += Math.sin(T * 53.0 + 2.0) * shake;
    const wgt = (PICK ? smoother(T, 0, 0.8) : 1) * (1 - smoother(T, TL.back, TL.end));                                                          // おわりは、いつもの操作カメラ（walker が決めた位置）へ、なめらかにつなぐ
    q0.copy(cam.quaternion); mLook.lookAt(cp, look, UP); q1.setFromRotationMatrix(mLook);
    cam.position.lerp(cp, wgt); cam.quaternion.copy(q0).slerp(q1, wgt);
    cam.fov = lerp(st.fov0, SH.fov * (tall ? 1.15 : 1), wgt); cam.updateProjectionMatrix();
    U.uNear.value = lerp(1, lerp(0.3, 1, sstep(Math.hypot(cam.position.x - pos.x, cam.position.z - pos.z), R * 0.8, R * 2.4)), wgt);      // カメラが光の柱の中・すぐそばにある間は、柱をうすくする（顔が光にうもれない）
    if (av && st.wasFp && T >= TL.back) av.setVisible(cam.position.distanceTo(look) > 1.0);                 // 1 人称へもどる：カメラがエルフの頭に入る手前で、エルフをかくす
    if (av) { poseElf(av, T); lightElf(av, T); }
    if (T >= TL.fly && !st.marks.pieceRel) sendRelease();                                                // かけらが手元から飛び立つ瞬間：画面上の場所をそえて合図（この時のカメラで計算する）
  }
  // エルフのしぐさ（player_avatar.js の playOnce）。クリップ・関数がなければ何もしない（待機のまま）。エルフがあとから読みこまれたときも、演出の時間に合わせて とちゅうから再生する
  function playElf(av, preview = false) {
    if (st.clip !== null) return; st.clip = false;
    try {
      if (typeof av.playOnce !== 'function' || !(av.info && av.info.clips && av.info.clips.includes(ELF_CLIP))) return;
      av.playOnce(ELF_CLIP, { lock: true }); const on = av.state.once; if (!on) return;
      if (PICK) { on.speed = st.T < TL.fly ? 3.0 / TL.fly : 1; on.t = Math.min(6.0 + Math.min(st.T, TL.fly) * 3.0 / TL.fly + Math.max(0, st.T - TL.fly), on.dur - 0.01); }      // かけらを取る：クリップの 6〜9 秒（見上げて手をさし出す）を、0〜飛び立つ時に合わせて ゆっくり再生
      else on.t = Math.min(st.T, on.dur - 0.01);
      st.clip = true;
      if (preview) { on.w = st.T < on.dur - 0.5 ? 1 : 0; av.update(0); }
    } catch (_) { st.clip = false; }
  }
  const stopElf = () => { try { const w = findWalker(); if (st.clip && w && w.avatar && w.avatar.state.once && w.avatar.state.once.name === ELF_CLIP) w.avatar.stopOnce(); } catch (_) { /* そのまま */ } st.clip = null; };
  // 演出中だけ、エルフに魔法陣の色を少し足す（ためる間は魔法陣の色、とき放ったあとは金色）。明るさは足さない（顔が白くとばないように。エリアの明るさは、エリア側の avatar.tint で決める）
  const elfMats = { list: null, c: new THREE.Color(), tint: new THREE.Color() };
  function lightElf(av, T) {
    if (!elfMats.list) { elfMats.list = []; av.root.traverse((n) => { if (n.isMesh && n.material && n.material.color) elfMats.list.push({ m: n.material, base: n.material.color.clone(), last: n.material.color.clone() }); }); }
    const k = sstep(T, 0, 0.8) * (1 - smoother(T, TL.back, TL.end));
    st.gainNow = st.gain === null ? 1 : lerp(1, st.gain, (st.preview ? 1 : sstep(T, st.gainT, st.gainT + 0.7)) * (1 - smoother(T, TL.back, TL.end)));      // 顔の明るさ合わせ（測ってから 0.7 秒かけて、なめらかに）
    elfMats.tint.copy(U.uCol.value).lerp(gold, U.uGold.value).lerp(elfMats.c.set(1, 1, 1), 0.72);
    for (const it of elfMats.list) {
      if (!it.m.color.equals(it.last)) it.base.copy(it.m.color);      // ページが色を入れなおした（エリアの明るさ）：それをもとにする
      it.m.color.copy(it.base).lerp(elfMats.c.copy(it.base).multiply(elfMats.tint), k * (CN.light ?? 0.25)).multiplyScalar(st.gainNow); it.last.copy(it.m.color);
    }
  }
  // エルフの見上げるしぐさと、風でふくらむスカート（骨を、アニメーションの上から少し回す。髪は骨がないので動かない）
  const bones = { list: null, pq: new THREE.Quaternion(), dq: new THREE.Quaternion(), ax: new THREE.Vector3(), bp: new THREE.Vector3(), hp: new THREE.Vector3() };
  function poseElf(av, T) {
    if (!bones.list) {
      bones.list = []; const hips = av.model.getObjectByName('Hips');
      av.model.traverse((n) => { if (!n.isBone) return; const sk = /Skirt.*_([12])$/.exec(n.name);
        if (n.name === 'Neck' || n.name === 'Head') bones.list.push({ b: n, kind: 'look', k: n.name === 'Neck' ? 0.4 : 0.6, last: new THREE.Quaternion(), base: new THREE.Quaternion(), has: false });
        else if (sk) bones.list.push({ b: n, kind: 'skirt', k: sk[1] === '1' ? 1 : 0.55, ph: bones.list.length * 1.7, last: new THREE.Quaternion(), base: new THREE.Quaternion(), has: false }); });
      bones.hips = hips;
    }
    const lookK = st.clip ? 0 : sstep(T, TL.shard + 0.2, TL.shard + 1.4) * (1 - sstep(T, TL.back, TL.end - 0.9)),      // しぐさのクリップがあるときは、見上げるのはクリップにまかせる
       downK = st.clip ? (CN.lookDown ?? 0.5) * sstep(T, TL.shard + 0.4, TL.shard + 1.4) * (1 - sstep(T, TL.fly - 0.25, TL.fly + 0.35)) : 0,      // かけらが手元に来る間は、手元を見る（クリップの「見上げる」の上から、首と頭を少し下へ）。飛び立つと、クリップのとおり見上げる
       wk = windK(T), ck = 0.2 * sstep(T, 0.8, TL.release) * (1 - sstep(T, TL.release, TL.release + 0.3));
    av.root.updateMatrixWorld(true); const f = av.root.rotation.y; if (bones.hips) bones.hips.getWorldPosition(bones.hp);
    for (const it of bones.list) {
      const b = it.b;
      if (it.has && b.quaternion.equals(it.last)) b.quaternion.copy(it.base);      // アニメーションが上書きしなかった骨は、前のコマの回しぶんを戻す
      it.base.copy(b.quaternion);
      let ang = 0;
      if (it.kind === 'look') { ang = (-0.6 * lookK + downK) * it.k; bones.ax.set(Math.cos(f), 0, -Math.sin(f)); }
      else { b.getWorldPosition(bones.bp); const dx = bones.bp.x - bones.hp.x, dz = bones.bp.z - bones.hp.z, dl = Math.hypot(dx, dz) || 1; bones.ax.set(-dz / dl, 0, dx / dl);
        ang = it.k * (wk + ck) * (st.clip ? 0.09 : 0.2) * (1 + 0.3 * Math.sin(T * 7.0 + it.ph) + 0.15 * Math.sin(T * 11.3 + it.ph * 2.1)); }
      if (Math.abs(ang) > 1e-4) { b.parent.getWorldQuaternion(bones.pq); bones.dq.setFromAxisAngle(bones.ax, ang); b.quaternion.premultiply(bones.pq.clone().invert().multiply(bones.dq).multiply(bones.pq)); }
      it.last.copy(b.quaternion); it.has = true;
    }
  }
  // walker.placeCamera を包む（ページの呼び出しはそのまま。ふだんのカメラが決まったあとに、演出のカメラを重ねる）
  function hook() {
    if (st.hooked) return; const w = findWalker(); if (!w || typeof w.placeCamera !== 'function') return;
    const orig = w.placeCamera; w.placeCamera = (t, dt) => { orig(t, dt); cineCamera(w); }; st.hooked = w;
  }
  // 操作を止める・もどす（controls.lock があればそれを使う。なければ、入力のイベントを手前で止める）
  function lock(b) {
    if (b) { st.controls = findControls(); if (st.controls) { st.controls.lock(true); return; }
      if (st.blockers) return;
      const stop = (e) => { e.stopImmediatePropagation(); }; st.blockers = stop; window.dispatchEvent(new Event('blur'));
      for (const n of ['keydown', 'pointerdown', 'pointermove']) window.addEventListener(n, stop, true);
    } else { if (st.controls) st.controls.lock(false); if (st.blockers) for (const n of ['keydown', 'pointerdown', 'pointermove']) window.removeEventListener(n, st.blockers, true); st.controls = st.blockers = null; }
  }
  const mark = (name, T, fn, phase = true) => { if (st.T >= T && !st.marks[name]) { st.marks[name] = true; fn(); if (phase && o.onPhase) o.onPhase(name, api); } };
  // ---------------------------------------------------------------- 開放の前に、かならず魔法陣の真ん中へ（短く歩いて入る → 真ん中に立ってから、演出としぐさが始まる）
  //   操作を止め、controls.read() を一時的にさしかえて「真ん中へ向かう入力」を返す ＝ いつもの歩き（歩きのモーション・足音・向き）で入る。1 人称でも同じ
  //   遠すぎる・引っかかって着かない・操作キャラが見つからないときは、演出のはじめのカメラの切りかえにかくして、位置を合わせる
  const findPlayer = () => o.player || (findBy((v) => v.player && typeof v.player.x === 'number' && typeof v.player.yaw === 'number') || {}).player || null;
  function centre(p) {
    if (!p) return; p.x = goal.x; p.z = goal.z; p.vx = p.vz = 0; st.px = goal.x; st.pz = goal.z;
    const w = findWalker(), av = w && w.avatar; if (av) { av.root.position.x = goal.x; av.root.position.z = goal.z; }
  }
  function startEnter() {
    const p = findPlayer(); goal.x = pos.x; goal.z = pos.z;
    if (PICK && p) {                                                 // かけらを取る：かけらの前（今いる側）に立つ。もう近くにいるなら、その場で
      const dx = p.x - rest.x, dz = p.z - rest.z, dl = Math.hypot(dx, dz) || 1;
      if (dl <= STAND + 0.2) { goal.x = p.x; goal.z = p.z; } else { goal.x = rest.x + dx / dl * STAND; goal.z = rest.z + dz / dl * STAND; }
    }
    const d = p ? Math.hypot(p.x - goal.x, p.z - goal.z) : 0;
    lock(true); const c = st.controls;
    if (!p || d < 0.07 || d > (PICK ? 3 : R * 1.3 + 0.5) || !c || typeof c.read !== 'function') { centre(p); begin(); return; }
    const en = { p, c, read: c.read, t: 0, lim: 0.7 + d / 0.9 };
    c.read = () => { const dx = goal.x - p.x, dz = goal.z - p.z, dl = Math.hypot(dx, dz) || 1, m = clamp(dl * 1.6, 0.14, 0.6) / dl, sn = Math.sin(p.yaw), cs = Math.cos(p.yaw);
      return { f: -(sn * dx + cs * dz) * m, s: (cs * dx - sn * dz) * m }; };
    st.enter = en;
  }
  function endEnter(go, snap = true) {
    const en = st.enter; if (!en) return; st.enter = null; en.c.read = en.read;
    if (go) { if (snap) centre(en.p); begin(); } else lock(false);
  }
  // ---------------------------------------------------------------- 「E 拾う」の表示（かけらを取るモードだけ。画面の上の HTML。かけらの上について動く）
  //   見た目は UI 案 C「筆と和紙」（ui_design\ui_design.md の 6）：字にふち・板をつけない（影だけ）。印は細い線だけ。
  //   PC：細い丸い輪の中に E ＋「拾う」。E キーで拾う（表示のクリックでもよい）。タッチ端末：細い 3 重の輪（タップ印）＋「拾う」。表示をタップで拾う
  //   押せる範囲は 表示ぜんぶ（高さ 48 px 以上・幅 88 px 以上）。表示の下のまん中から、かけらへ細い線をたらす
  //   言語は sun_game.js と同じ決め方（?lang= → localStorage の sunGame_lang → 端末の言語 → English）。書体は "Ohisama C Talk <言語>"（fonts/ui_c_talk_<言語>.woff2）。
  //   その字がフォントに入っていない間は、端末の書体で出す（字ごとに書体がまざらないよう、1 字でも足りなければ ぜんぶ端末の書体）
  const PICK_TEXT = { ja: '拾う', en: 'Pick up', zh: '拾取', ko: '줍기' };
  const PICK_FONT = { ja: '"Yu Mincho", "Hiragino Mincho ProN", serif', en: 'Georgia, serif', zh: '"Songti SC", "SimSun", serif', ko: '"AppleMyungjo", "Batang", serif' };      // うしろにつける端末の字
  const pickLang = () => { try { const q = new URLSearchParams(window.location.search).get('lang'); if (PICK_TEXT[q]) return q; const v = store.get('sunGame_lang'); if (PICK_TEXT[v]) return v; } catch (_) { /* 下へ */ }
    const n = String(navigator.language || 'en').toLowerCase().slice(0, 2); return PICK_TEXT[n] ? n : 'en'; };
  const PR = { el: null, ring: null, on: false, k: 0, placed: false, w: 0, h: 0, touch: false, lang: null, talkFont: false, avoid: [], avoidT: -9, x: 0, y: 0, press: 0, hover: false };
  try { PR.touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (_) { /* そのまま */ }
  const GOLD_LINE = 'rgba(240,222,170,0.85)';
  // 印：PC ＝ 丸い輪 28 px（線 1 px・面なし）の中に E。タッチ ＝ 3 重の輪（中の点 ＋ 細い輪 2 本）
  const KEY_HTML = `<span data-ring style="display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:28px;height:28px;flex:none;border-radius:50%;border:1px solid ${GOLD_LINE};box-shadow:0 0 8px rgba(240,222,170,0.25);color:#fff6dc;font-family:'Ohisama C Talk en',Georgia,serif;font-size:15px;line-height:1;letter-spacing:0;font-synthesis:none">E</span>`;
  const TAP_HTML = '<span data-ring style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:50%"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#f0deaa" style="display:block"><circle cx="15" cy="15" r="4.2" fill="#f0deaa" stroke="none"/><circle cx="15" cy="15" r="8.3" stroke-width="1"/><circle cx="15" cy="15" r="12.6" stroke-width="0.8" opacity="0.45"/></svg></span>';
  const LINE_HTML = '<span style="position:absolute;left:50%;top:100%;width:1px;height:22px;margin-left:-0.5px;background:linear-gradient(rgba(240,222,170,0.7),rgba(240,222,170,0));pointer-events:none"></span>';      // かけらへの線
  const talkFam = (l) => `"Ohisama C Talk ${l}"`;
  function fillPrompt() {
    const el = PR.el, lang = pickLang(); PR.lang = lang;
    el.innerHTML = `${PR.touch ? TAP_HTML : KEY_HTML}<span data-t style="display:block">${PICK_TEXT[lang]}</span>${LINE_HTML}`; el.setAttribute('aria-label', PICK_TEXT[lang]); PR.ring = el.firstElementChild;
    el.style.fontFamily = PR.talkFont === lang ? `${talkFam(lang)}, ${PICK_FONT[lang]}` : PICK_FONT[lang];
    PR.w = el.offsetWidth; PR.h = el.offsetHeight;
    if (PR.talkFont !== lang && document.fonts && document.fonts.load) document.fonts.load(`18px ${talkFam(lang)}`, PICK_TEXT[lang]).then(() => {      // この書体に、この字がぜんぶ入っているか（入っていれば、その書体に切りかえる）
      // 字の絵をくらべる（全角の字は どの書体でも幅が同じなので、幅ではわからない）：この書体を先頭にした時と、端末の書体だけの時で、絵が同じなら「入っていない」
      const cv = document.createElement('canvas'); cv.width = cv.height = 56; const g = cv.getContext('2d', { willReadFrequently: true }); g.textBaseline = 'middle'; g.textAlign = 'center';
      const pic = (f, ch) => { g.clearRect(0, 0, 56, 56); g.font = `40px ${f}`; g.fillText(ch, 28, 28); return g.getImageData(0, 0, 56, 56).data; };
      const same = (a, b) => { for (let k = 3; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) > 24) return false; return true; };
      const all = [...PICK_TEXT[lang]].every((ch) => ch === ' ' || !same(pic(`${talkFam(lang)}, monospace`, ch), pic('monospace', ch)) || !same(pic(`${talkFam(lang)}, serif`, ch), pic('serif', ch)));
      if (all && PR.el && PR.lang === lang) { PR.talkFont = lang; fillPrompt(); }
    }).catch(() => {});
  }
  function buildPrompt() {
    if (!document.getElementById('sunPickFonts')) { const css = document.createElement('style'); css.id = 'sunPickFonts';
      css.textContent = Object.keys(PICK_TEXT).map((l) => `@font-face { font-family: ${talkFam(l)}; src: url("./fonts/ui_c_talk_${l}.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }`).join('\n')
        + '\n#sunPick { outline: none; } #sunPick:focus-visible { outline: 1px solid rgba(240,222,170,0.75); outline-offset: -3px; }'; document.head.append(css); }
    const el = document.createElement('button'); el.type = 'button'; el.id = 'sunPick'; PR.el = el;
    el.style.cssText = 'position:fixed;left:0;top:0;z-index:8;box-sizing:border-box;margin:0;border:0;padding:0 8px;min-height:48px;min-width:88px;display:flex;align-items:center;justify-content:center;gap:10px;'
      + 'background:none;color:#f6f0e0;font-size:18px;font-weight:400;font-synthesis:none;line-height:1;letter-spacing:0.12em;text-shadow:0 0 8px rgba(8,8,24,0.8),0 1px 2px rgba(8,8,24,0.9);'
      + 'opacity:0;pointer-events:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;white-space:nowrap;will-change:transform,opacity;transform-origin:50% 50%;';
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch' && !PR.touch) { PR.touch = true; fillPrompt(); } pickNow(); });
    el.addEventListener('click', () => pickNow());                 // キーボードで選んで Enter・スペース
    el.addEventListener('pointerenter', (e) => { PR.hover = e.pointerType === 'mouse'; }); el.addEventListener('pointerleave', () => { PR.hover = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(el); fillPrompt();
  }
  function pickNow() { if (PICK && st.state === 'sleep' && !st.enter && PR.on) { PR.on = false; PR.press = 1; startEnter(); return true; } return false; }      // press ＝ 押した時の光（輪の中が光り、表示が少し小さくなる。0.12 秒）
  const onPickKey = (e) => { if (PR.touch) { PR.touch = false; if (PR.el) fillPrompt(); }  if (e.code === 'KeyE' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && pickNow()) e.preventDefault(); };
  const onPickPointer = (e) => { if (e.pointerType === 'touch' && !PR.touch) { PR.touch = true; if (PR.el) fillPrompt(); } };      // 指でさわっている ＝ タップ印の表示に
  if (PICK && PC.prompt !== false) { window.addEventListener('keydown', onPickKey); window.addEventListener('pointerdown', onPickPointer, true); }
  // ふわっと出入り（k ＝ 0〜1）。場所は、かけらを描く時（placePrompt）に決める
  function tickPrompt(dt) {
    if (PR.on && !PR.el) buildPrompt(); if (!PR.el) return;
    if (PR.on && PR.k < 0.02 && PR.lang !== pickLang()) fillPrompt();      // 言語を変えたあと
    PR.k += ((PR.on ? 1 : 0) - PR.k) * (1 - Math.exp(-Math.min(dt, 0.1) * (PR.on ? 9 : 14))); if (!PR.on && PR.k < 0.01) PR.k = 0;
    const a = PR.placed ? PR.k : 0; PR.el.style.opacity = a.toFixed(3); PR.el.style.pointerEvents = PR.on && a > 0.4 ? 'auto' : 'none';
    PR.press = Math.max(0, PR.press - dt / 0.3); const pk = Math.min(1, PR.press * 2.5);
    if (PR.ring) PR.ring.style.background = pk > 0.01 ? `rgba(240,222,170,${(0.25 * pk).toFixed(3)})` : PR.hover ? 'rgba(255,248,230,0.12)' : 'none';      // 押した：輪の中が光る。マウスを乗せた：うすい面
    if (PR.placed) PR.el.style.transform = `translate(${PR.x.toFixed(1)}px, ${(PR.y + (1 - PR.k) * 9).toFixed(1)}px) scale(${(1 - 0.05 * pk).toFixed(3)})`;
  }
  // かけらの画面上の場所の、少し上に置く。画面のはし・太陽マーク・ボタンなどに重なる時は、ずらす
  function placePrompt(renderer, camera) {
    if (!PR.el || PR.k <= 0) return;
    tmpP.copy(shard.position); tmpP.y += 0.3; tmpP.project(camera); if (tmpP.z > 1) { PR.placed = false; return; }
    const r = renderer.domElement.getBoundingClientRect(), W = window.innerWidth, Hh = window.innerHeight, w = PR.w, h = PR.h;
    let x = r.left + (tmpP.x * 0.5 + 0.5) * r.width - w / 2, y = r.top + (0.5 - tmpP.y * 0.5) * r.height - h - 24;      // 表示の下に、かけらへの線（22 px）が入る
    x = clamp(x, 8, Math.max(8, W - w - 8)); y = clamp(y, 8, Math.max(8, Hh - h - 8));
    if (U.uTime.value - PR.avoidT > 0.5 || U.uTime.value < PR.avoidT) { PR.avoidT = U.uTime.value; PR.avoid.length = 0;      // よける物（0.5 秒ごとに調べなおす）：太陽マーク・タスクの表示・視点や音のボタンなど
      for (const e of document.querySelectorAll('#sunUI, #viewBtn, #soundBtn, #timeBtn, #stat, [id^="sun"]:not(#sunPick):not(#sunPickFonts)')) {
        const q = e.getBoundingClientRect(), cs = getComputedStyle(e); if (q.width < 5 || q.height < 5 || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || (q.width > W * 0.9 && q.height > Hh * 0.5)) continue; PR.avoid.push(q); } }
    for (let pass = 0; pass < 2; pass++) for (const q of PR.avoid) if (x < q.right + 6 && x + w > q.left - 6 && y < q.bottom + 6 && y + h > q.top - 6) y = q.top + q.height / 2 < Hh / 2 ? q.bottom + 8 : q.top - h - 8;
    PR.x = x; PR.y = clamp(y, 8, Math.max(8, Hh - h - 8)); PR.placed = true;
  }
  // ---------------------------------------------------------------- 絵だけの魔法陣（createCircleArt）を、地面の形に沿わせる
  //   丘のような斜面に平らな円を置くと、上り側の半分が地面にうまって切れる。円と光の波の板の点を、1 つずつ地面の高さ（ページの groundH）＋ 少し上へ置きなおす
  //   場所が変わった時（moveTo）だけ やりなおす。地面の高さがわからないページでは、平らなまま。conform: false で切れる
  const CF = { key: '', lift: o.lift ?? 0.07 };
  function conform() {
    if (!M || o.conform === false) return; const gp = group.position, key = `${gp.x.toFixed(3)},${gp.y.toFixed(3)},${gp.z.toFixed(3)}`; if (key === CF.key) return;
    if (page === undefined) page = findBy((v) => typeof v.constrain === 'function' && typeof v.groundH === 'function');
    const gh = o.groundH || (page && page.groundH); if (!gh) return;
    CF.key = key;
    for (const [mesh, sc, lift] of [[disc, R, CF.lift], [wave, WAVE_R, CF.lift + 0.03]]) { const a = mesh.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) a.setY(i, (gh(gp.x + a.getX(i) * sc, gp.z + a.getZ(i) * sc) + lift - gp.y - mesh.position.y) / sc);
      a.needsUpdate = true; mesh.geometry.computeBoundingSphere(); mesh.material.polygonOffset = true; mesh.material.polygonOffsetFactor = -1; mesh.material.polygonOffsetUnits = -6; }
    try { window.dispatchEvent(new CustomEvent('suncircle:art', { detail: { x: gp.x, y: gp.y, z: gp.z, radius: R } })); } catch (_) { /* そのまま */ }      // 場所が決まった・変わった（草や花を消す側が使える）
  }
  function begin() {
    st.state = 'opening'; st.T = 0; st.charge = 1; hand.has = false; st.marks = { charge: true }; st.face = null; st.clip = null; st.gain = null; st.gainNow = 1; st.preview = false; face.lum.length = 0;
    hook(); lock(true);
    if (!cam) cam = (findBy((v) => v.camera && v.camera.isPerspectiveCamera) || {}).camera || null;      // まだ 1 枚も描いていないとき：ページのカメラ（window.__xxx.camera）
    const w = findWalker(); st.wasFp = !!(w && w.mode === 'fp' && w.setMode); if (st.wasFp) w.setMode('tp');      // 1 人称でも、演出中は外からのカメラ
    if (!(o.muted && o.muted())) { if (PICK) playPickSound(TL); else playCineSound(); }
    if (o.onPhase) o.onPhase('charge', api);
  }
  function release() { if (key) store.set(key, '1'); if (o.onOpen) o.onOpen(api); }
  function openEvent() { const open = sunCircleState(); window.dispatchEvent(new CustomEvent(SUN_CIRCLE_EVENT, { detail: { key, pattern: o.pattern || 'crystal', open, all: open.all } })); }
  function finish() {
    st.state = 'open'; lock(false); stopElf(); if (cam && st.face !== null) { cam.fov = st.fov0; cam.updateProjectionMatrix(); }
    const w = findWalker(); if (st.wasFp && w && w.avatar && w.mode === 'fp') w.avatar.setVisible(false); st.wasFp = false;
  }
  const api = {
    prompt: PR, pick: () => pickNow(), conform: () => conform(),
    lastRelease: null, pieceId: PIECE_ID, toUI: TO_UI, mode: PICK ? 'pickup' : 'circle', art: M,
    group, shard, uniforms: U, key, radius: R, position: pos, riseTo, TL, cineInfo: info, cine: CN, cineOverride: null, piece: PC, piecePosition: rest,
    get state() { return st.state; }, get isOpen() { return st.state === 'open' || (st.state === 'opening' && st.T >= TL.release); }, get charge() { return info.charge; }, get T() { return st.T; }, get entering() { return !!st.enter; }, get faceGain() { return st.gain; }, get faceLum() { return st.faceLum; },
    // 毎フレーム：dt（秒）, t（時間）, 操作キャラの場所 px, pz
    update(dt, t, px, pz) {
      U.uTime.value = t; if (px !== undefined) { st.px = px; st.pz = pz; st.gotPx = true; }
      if (M) { conform(); U.uSpin.value += dt * M.spin; U.uRise.value += dt * (1 + 2.6 * M.pillar); apply(); return; }
      hook();
      if (PICK) { if (st.state !== 'sleep' || st.enter) PR.on = false; tickPrompt(dt); }      // 「E 拾う」の表示（1 コマおくれで出入りする）
      if (st.state === 'sleep') {
        const inside = px !== undefined && (PICK ? PC.show && restSet && Math.hypot(px - rest.x, pz - rest.z) < NEAR : Math.hypot(px - pos.x, pz - pos.z) < R * 0.8);
        if (st.enter) { const en = st.enter; en.t += dt; if (Math.hypot(en.p.x - goal.x, en.p.z - goal.z) < 0.07) endEnter(true); else if (en.t > en.lim) endEnter(true, !PICK); }      // 真ん中へ歩いている間
        else if (PICK) { PR.on = inside && PC.prompt !== false; if (inside && PC.prompt === false) { st.dwell += dt; if (st.dwell >= DWELL) startEnter(); } }      // かけらを取る：近づくと「E 拾う」が出る。E キーか、表示のタップで始まる（piece.prompt: false なら、近づくだけで始まる）
        else { st.dwell = inside ? st.dwell + dt : 0; if (st.dwell >= DWELL) startEnter(); }
      } else if (st.state === 'opening') {
        st.T += dt; const c = clamp(st.T / TL.release, 0, 1), rel = st.T - TL.release;
        U.uSpin.value += dt * (rel < 0 ? 0.2 + 1.9 * c * c : 0.1 + 2.0 * Math.exp(-rel * 0.7)); U.uRise.value += dt * (1 + 2.6 * windK(st.T));
        if (st.gain === null && st.T > 0.95 && st.T < 2.6) { st.measure = true; st.gainT = st.T; }      // 顔の寄りの間（エルフがカメラを向いたあと）に、顔の明るさを測る
        mark('release', TL.release, release); mark('openEvent', TL.openEvent, openEvent, false); mark('shard', TL.shard, () => {});
        mark('fly', TL.fly, () => window.dispatchEvent(new CustomEvent(SUN_SHARD_EVENT, { detail: { key, pattern: o.pattern || 'crystal', position: shard.position.toArray() } })));
        mark('back', TL.back, () => { const w = findWalker(); if (st.wasFp && w && w.setMode) w.setMode('fp'); });      // 1 人称だった：ここで戻し、カメラは目の位置へなめらかに入っていく
        if (st.T >= TL.fly + 0.12 && !st.marks.pieceRel) sendRelease();      // 演出のカメラが入らなかったとき（walker が見つからない など）：ここで合図を出す
        if (st.T >= TL.end) { finish(); if (o.onPhase) o.onPhase('end', api); }
      } else { U.uSpin.value += dt * 0.06; U.uRise.value += dt; }
      apply();
      if (o.onCine && (st.state === 'opening' || info.last !== st.state)) { info.last = st.state; info.api = api; o.onCine(info); }
    },
    // 開放する。instant ＝ true：演出なしで、すぐ開放後にする（保存とイベントは出す）。false：演出をはじめる
    open(instant = false) {
      if (st.state !== 'sleep') return;
      if (instant) { endEnter(false); st.state = 'open'; release(); openEvent(); apply(); } else if (!st.enter) { startEnter(); apply(); }
    },
    // 眠っている状態に戻す（保存も消す）
    reset() { endEnter(false); if (st.state === 'opening') { lock(false); if (cam && st.face !== null) { cam.fov = st.fov0; cam.updateProjectionMatrix(); } } stopElf(); st.state = 'sleep'; st.charge = 0; st.T = 0; st.dwell = 0; if (key) store.del(key); apply(); },
    // 確認用：見た目だけ切りかえる（保存・音・イベント・操作の停止なし）。state：'sleep' | 'opening' | 'open'、v：sleep は ともり具合 0〜1、opening は 演出の秒（0〜TL.end。カメラも演出の位置になる）
    preview(state, v = 0) {
      endEnter(false); hand.has = false; st.state = state; st.charge = state === 'sleep' ? v : 1; st.T = state === 'opening' ? v : 0; if (st.face !== null && cam) { cam.fov = st.fov0; cam.updateProjectionMatrix(); } st.face = null; st.wasFp = false; st.preview = true; if (state !== 'opening') { st.gain = null; st.gainNow = 1; face.lum.length = 0; } else if (st.gain === null) st.measure = true; st.marks = { charge: true, release: true, openEvent: true, shard: true, fly: true, back: true, pieceRel: true }; stopElf();
      if (state === 'opening') { const w = findWalker(); if (w && w.avatar) playElf(w.avatar, true); }
      if (state === 'opening') { U.uSpin.value = 0.4 * v * v * (v < TL.release ? 1 : 0) + (v >= TL.release ? 3.6 + 1.2 * (v - TL.release) : 0); U.uRise.value = v * 2; hook(); }
      apply(); if (o.onCine) { info.api = api; o.onCine(info); }
    },
    dispose() { scene.remove(group, shard, pool); if (PR.el) PR.el.remove(); window.removeEventListener('keydown', onPickKey); window.removeEventListener('pointerdown', onPickPointer, true); },
  };
  if (key && store.get(key) === '1') st.state = 'open';                // 開放ずみなら、開放後の見た目で始まる
  apply();
  return api;
}
