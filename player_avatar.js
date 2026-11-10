// 操作キャラ（エルフ）：GLB を読みこみ、移動入力に合わせて「向きを変える・待機／歩き／走りを切りかえる・カメラが後ろから追う」。
// area_kit.js の createWalker と同じ形（update(dt)・placeCamera(t)）なので、エリアのページでは walker と入れかえて使える。
// 使い方は player_avatar.md。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, sstep = THREE.MathUtils.smoothstep;
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export const AVATAR = {
  url: './models/elf_player.glb?v=20261110n',   // GLB を作りなおしたら v= を変える（ブラウザに古い GLB が残らないように）
  speed: 2.5,            // 入力いっぱいのときの速さ（m/秒）。エリアの歩く速さと同じ（エリアのページは 2.5 を渡している）
  speedScale: 1.4,       // 3 人称のエルフの速さの倍率（渡された speed × これ。2026-11-10 ユーザー「もっと速く」で 1.0 → 1.4。走り 2.5 → 3.5 m/秒、歩き 1.05 → 1.47 m/秒）。速くなるのは移動だけ：アニメ（再生の速さ・歩き／走りのまざり方）は 速さ ÷ これ で決めるので、速くする前と同じ（ユーザーの指示。足は少しすべって見える）
  walkRatio: 0.42,       // Shift を押している間（PC）の速さの割合 ＝ 歩き
  turn: 11,              // 向きを変える速さ（大きいほどすばやい）
  accel: 9,              // 速さの変わりやすさ（createWalker と同じ）
  cam: { dist: 3.6, height: 1.18, pitch: -0.2, minPitch: -1.1, maxPitch: 0.55, lag: 14, ground: 0.25 },   // 後ろから追うカメラ
  light: [-0.424, 0.707, 0.566],   // アニメ影の光の向き（世界の向き。Blender の Key ライトと同じ）
  blink: true,
  // しぐさの間の、目のとじ方（[クリップの秒, 0 ＝ あいている 〜 1 ＝ とじている] のキー。間はまっすぐつなぐ）
  eyes: {
    circle_unlock: [[0.9, 0], [1.25, 1], [3.5, 1], [3.95, 0]],
    sleep_lean: [[0, 1]],
    wake_up: [[0, 1], [0.35, 1], [0.5, 0.82], [0.65, 1], [0.95, 1], [1.1, 0.7], [1.25, 0.95], [1.5, 0.5], [1.75, 0.12], [1.95, 0], [2.15, 0], [2.4, 0.9], [2.85, 0.9], [3.2, 0]],   // まぶたが動く → あける → のびの間は ぎゅっととじる
  },
  seat: { trunk: 0.46, hip: 0.11 },   // sleep_lean の基準（m）：エルフの原点（＝立ち上がったあとの足もと）から後ろ trunk に木の幹の表面、すわった腰の高さ hip
  // 待機中の小さなしぐさ：操作がないまま every 秒（この間のランダム。1 回めは first 秒）たつと、clips から 1 つ（同じものは続けない）。操作を始めたら stopFade 秒でやめる
  fidget: { clips: ['idle_look', 'idle_shift', 'idle_stretch'], first: [5, 8], every: [7, 14], fadeIn: 0.5, fadeOut: 0.6, stopFade: 0.18 },
  loops: ['sleep_lean'],   // くり返すしぐさ（playOnce で呼ぶと、stopOnce か次の playOnce まで続く）
  run: 'ardy',           // 標準の走り：'ardy' ＝ GLB の run_ardy（NVIDIA ARDY。2026-11-10 ユーザーの決定）。'hand'（'old' も同じ）＝ 手づくりの走り（GLB の run）、'kimodo' ＝ run_kimodo
  walk: 'ardy',          // 標準の歩き：'ardy' ＝ GLB の walk_ardy（NVIDIA ARDY の動きを移したもの）、'old' ＝ 前の歩き（GLB の walk）
};

// ---------------------------------------------------------------- 材質：光を受けない色（Blender の発光シェーダーと同じ）＋ 光の向きで付くアニメ影 ＋ 布と髪の裏の色
export function makeMaterial(src, uLight) {
  const ud = src.userData || {}, back = { none: 0, cloth: 1, hair_blue: 2, hair: 3 }[ud.back || 'none'] || 0;
  const m = new THREE.MeshBasicMaterial({ map: src.map, side: THREE.DoubleSide, alphaTest: ud.cutout ? 0.5 : 0, name: src.name });
  const U = {
    uElfLight: uLight,
    uElfShadow: { value: new THREE.Color().fromArray(ud.shadow_color || [1, 1, 1]) },
    uElfK: { value: ud.shadow_strength ?? 0 }, uElfEdge: { value: ud.shadow_edge ?? 0.45 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vElfN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n#ifdef USE_SKINNING\n  vElfN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);\n#else\n  vElfN = normalize(mat3(modelMatrix) * normal);\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vElfN;\nuniform vec3 uElfLight, uElfShadow;\nuniform float uElfK, uElfEdge;')
      .replace('#include <opaque_fragment>', `
        { bool bk = !gl_FrontFacing; vec3 n = normalize(vElfN) * (bk ? -1.0 : 1.0);
          float l = dot(n, uElfLight) * 0.5 + 0.5, aa = max(fwidth(l), 0.004);
          float sd = 1.0 - smoothstep(uElfEdge - aa, uElfEdge + aa, l);
          ${back === 1 ? 'if (bk) outgoingLight *= vec3(0.26, 0.34, 0.32);' : ''}
          ${back === 2 ? 'if (bk) { outgoingLight = vec3(0.397, 0.731, 0.855); sd = 0.0; }' : ''}
          ${back === 3 ? 'if (bk) sd = 0.0;' : ''}
          outgoingLight *= mix(vec3(1.0), uElfShadow, sd * uElfK); }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `elf${back}`;
  return m;
}

// 足もとの丸い影（地面にのせる 1 枚）
function makeBlobShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.renderOrder = 1; return mesh;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {THREE.PerspectiveCamera} o.camera
 * @param {object} o.player    {x, z, yaw, pitch, vx, vz, walk, step, moving}（area_kit の newPlayer と同じ。yaw・pitch はカメラの向き）
 * @param {object} o.controls  read() が {f, s}（前後・左右 -1〜1）を返すもの（area_kit の createWalkControls と同じ）
 * @param {(x:number,z:number)=>number} [o.groundH]    地面の高さ
 * @param {(x:number,z:number)=>[number,number]} [o.constrain]  歩ける所に直す
 * @param {number} [o.speed]  入力いっぱいのときの速さ
 * @param {(foot:number)=>void} [o.onStep]  足が地面についたとき（0 左・1 右）
 * @param {HTMLElement} [o.helpEl]  少し歩いたら消す説明
 * @param {object} [o.cam]  カメラの設定（AVATAR.cam の上書き）
 * @param {number[]} [o.light]  アニメ影の光の向き
 * @param {boolean} [o.shadow=true]  足もとの丸い影
 * @param {boolean} [o.fidget]  待機中の小さなしぐさ。なし ＝ プレイヤーが 1 回動かしたあとから出る（読みこみ直後の演出に割りこまない）。true ＝ はじめから出る。false ＝ 出さない
 * @param {string} [o.run]  走りのクリップ（なし ＝ 標準の 'ardy' → GLB の run_ardy。'hand' → 手づくりの run、'kimodo' → run_kimodo。ページの URL の ?run=hand でも同じ）
 * @param {string} [o.walk]  歩きのクリップ（なし ＝ 標準の 'ardy' → GLB の walk_ardy。'old' → 前の歩き ＝ GLB の walk。ページの URL の ?walk=old でも同じ）
 */
export async function createPlayerAvatar(o) {
  const { scene, camera, player, controls, groundH = () => 0, constrain = (x, z) => [x, z], onStep, helpEl } = o;
  const speed = (o.speed ?? AVATAR.speed) * AVATAR.speedScale, cam = { ...AVATAR.cam, ...(o.cam || {}) };
  const uLight = { value: new THREE.Vector3().fromArray(o.light || AVATAR.light).normalize() };

  const gltf = await new GLTFLoader().loadAsync(o.url || AVATAR.url);
  const model = gltf.scene, root = new THREE.Group(); root.name = 'player_avatar'; root.add(model); scene.add(root);
  // 歩きのクリップ：標準は ARDY の歩き（walk_ardy）。前の歩き（GLB の walk）にもどすときは walk: 'old' か、ページの URL に ?walk=old
  const wk = o.walk ?? new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('walk') ?? AVATAR.walk;
  const walkClip = wk !== 'old' && gltf.animations.some((c) => c.name === `walk_${wk}`) ? `walk_${wk}` : 'walk';
  const rk = o.run ?? new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('run') ?? AVATAR.run;
  const runClip = rk !== 'old' && rk !== 'hand' && gltf.animations.some((c) => c.name === `run_${rk}`) ? `run_${rk}` : 'run';
  const info = { walk_speed: 1.03, run_speed: 2.46, walk_step: 0.43, run_step: 0.77, height: 1.5, walkClip, runClip };
  const morphs = [];
  model.traverse((n) => {
    for (const k of Object.keys(info)) if (n.userData && typeof n.userData[k] === 'number') info[k] = n.userData[k];
    if (walkClip !== 'walk' && n.userData && typeof n.userData[`${walkClip}_speed`] === 'number') info.walkAlt = n.userData[`${walkClip}_speed`];
    if (runClip !== 'run' && n.userData && typeof n.userData[`${runClip}_speed`] === 'number') info.runAlt = n.userData[`${runClip}_speed`];
    if (n.isMesh) {
      n.material = makeMaterial(n.material, uLight); n.frustumCulled = false;      // 骨で動くので、画面の外の判定はしない
      if (n.morphTargetDictionary) morphs.push(n);
    }
  });
  const blob = (o.shadow ?? true) ? makeBlobShadow() : null; if (blob) scene.add(blob);

  // アニメーション：待機・歩き・走りをいつも重ねておき、速さで重みを変える。歩きと走りは「進んだ距離」で進める（足がすべらない）
  const mixer = new THREE.AnimationMixer(model), act = {};
  if (info.walkAlt) info.walk_speed = info.walkAlt; if (info.runAlt) info.run_speed = info.runAlt;
  const fixClip = (c) => {
    const t0 = Math.min(...c.tracks.map((t) => t.times[0]));            // 書き出しの最初のすきま（1 コマぶん）をつめる → ループがつながる
    if (t0 > 0) { for (const ar of new Set(c.tracks.map((t) => t.times))) for (let i = 0; i < ar.length; i++) ar[i] -= t0; c.resetDuration(); }   // 時間の配列は骨どうしで共有
  };
  const gestures = {}, onceAct = {};                                    // しぐさ（1 回だけ再生するクリップ。playOnce で使う）
  for (const c of gltf.animations) {
    const key = c.name === walkClip ? 'walk' : c.name === runClip ? 'run' : c.name;
    if (key !== 'idle' && key !== 'walk' && key !== 'run' || (c.name === 'walk' && walkClip !== 'walk') || (c.name === 'run' && runClip !== 'run')) { if (!/^(walk|run)/.test(c.name)) gestures[c.name] = c; continue; }      // 使わないクリップは動かさない
    fixClip(c);
    const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(key === 'idle' ? 1 : 0); act[key] = a; }
  if (act.walk) act.walk.timeScale = 0; if (act.run) act.run.timeScale = 0;
  const durW = act.walk ? act.walk.getClip().duration : 1, durR = act.run ? act.run.getClip().duration : 1;
  const cycW = info.walk_speed * durW, cycR = info.run_speed * durR;       // 1 周（2 歩）で進む距離
  // 歩きと走りで「左足が前に出る時」をそろえる（クリップの始まりの足がちがっても、歩き⇔走りの切りかわりで脚がまざらない）
  const footPhase = (a) => {
    const L = model.getObjectByName('Left_Foot'), R = model.getObjectByName('Right_Foot'); if (!a || !L || !R) return 0;
    const dur = a.getClip().duration, N = 16, pl = new THREE.Vector3(), pr = new THREE.Vector3(); let re = 0, im = 0;
    for (const b of Object.values(act)) b.setEffectiveWeight(b === a ? 1 : 0);
    for (let i = 0; i < N; i++) {
      a.time = i / N * dur; mixer.update(0); model.updateMatrixWorld(true);
      const d = L.getWorldPosition(pl).z - R.getWorldPosition(pr).z, th = i / N * Math.PI * 2; re += d * Math.cos(th); im += d * Math.sin(th);
    }
    a.time = 0; return Math.atan2(im, re) / (Math.PI * 2);
  };
  let phRef = footPhase(act.run), offR = 0;
  if (runClip !== 'run') {                                             // 走りを入れかえた時：手づくりの走り（run）と足の順をそろえる（足音・止まる時の足の決まりは run が基準）
    const rc = gltf.animations.find((c) => c.name === 'run');
    if (rc) { fixClip(rc); const ra = mixer.clipAction(rc); ra.play(); ra.timeScale = 0; const ph = footPhase(ra); ra.setEffectiveWeight(0); ra.stop(); mixer.uncacheAction(rc); offR = (((phRef - ph) % 1) + 1) % 1; phRef = ph; }
  }
  const phW = footPhase(act.walk), offW = walkClip === 'walk' ? 0 : (((phW - phRef) % 1) + 1) % 1;      // 前の歩きは今までどおり（ずらさない）。歩きのクリップを この分だけ先へずらして読む
  info.runPhase = offR;
  info.walkPhase = offW;
  for (const n of ['idle', 'walk', 'run']) if (act[n]) act[n].setEffectiveWeight(n === 'idle' ? 1 : 0);

  const st = { facing: player.yaw + Math.PI, v: 0, phase: 0, w: { idle: 1, walk: 0, run: 0 }, slow: false, blinkT: 2 + Math.random() * 2, blink: 0, foot: 0, camPos: new THREE.Vector3(), camInit: false, once: null, prev: null, eyesClosed: 0, fidgetOn: o.fidget !== false, played: o.fidget === true, idleT: 0, nextFidget: 0, lastFidget: null };
  const onKey = (e) => { if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') st.slow = e.type === 'keydown'; };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  const tgt = new THREE.Vector3(), want = new THREE.Vector3();
  info.clips = Object.keys(gestures);
  const eyeAt = (keys, t) => {                                          // 目のとじ方のキー → その時の値
    if (!keys.length) return 0; if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
    return keys[keys.length - 1][1];
  };
  const fidgets = AVATAR.fidget.clips.filter((n) => gestures[n]), rnd = ([a, b]) => a + Math.random() * (b - a);
  const endOnce = (done) => { const on = st.once; if (!on) return; st.once = null; on.a.setEffectiveWeight(0); on.a.stop(); on.finish(done); };

  const api = {
    root, model, mixer, actions: act, info, state: st, cam, lightDir: uLight.value,
    // 入力 → 移動・向き・アニメーション
    update(dt) {
      const on = st.once, inp = on && on.lock ? { f: 0, s: 0 } : controls.read(), sn = Math.sin(player.yaw), cs = Math.cos(player.yaw), sp = speed * (st.slow ? AVATAR.walkRatio : 1);
      const tx = (-sn * inp.f + cs * inp.s) * sp, tz = (-cs * inp.f - sn * inp.s) * sp, a = 1 - Math.exp(-dt * AVATAR.accel);
      player.vx += (tx - player.vx) * a; player.vz += (tz - player.vz) * a;
      const [nx, nz] = constrain(player.x + player.vx * dt, player.z + player.vz * dt), moved = Math.hypot(nx - player.x, nz - player.z);
      const dx = nx - player.x, dz = nz - player.z; player.x = nx; player.z = nz; player.walk += moved;
      const v = dt > 0 ? moved / dt : 0; st.v += (v - st.v) * (1 - Math.exp(-dt * 12));
      player.moving += ((v > 0.35 ? 1 : 0) - player.moving) * (1 - Math.exp(-dt * 7));
      if (player.walk > 1.5 && helpEl) helpEl.classList.add('off');
      // 向き：進む方へ、なめらかに回る（モデルの正面は +Z）
      if (moved > 1e-5 && Math.hypot(tx, tz) > 0.2) st.facing += angDiff(Math.atan2(dx, dz), st.facing) * (1 - Math.exp(-dt * AVATAR.turn));
      root.position.set(player.x, groundH(player.x, player.z), player.z); root.rotation.y = st.facing;
      if (blob) { blob.position.copy(root.position); blob.position.y += 0.03; }
      // アニメーションの重み
      const vA = st.v / AVATAR.speedScale;                              // アニメ用の速さ（速くする前の速さ）
      const move = sstep(vA, 0.08, 0.5), runK = act.run ? sstep(vA, info.walk_speed * 1.2, info.run_speed * 0.82) : 0, k = 1 - Math.exp(-dt * 10);
      st.w.idle += (1 - move - st.w.idle) * k; st.w.walk += (move * (1 - runK) - st.w.walk) * k; st.w.run += (move * runK - st.w.run) * k;
      // しぐさ（playOnce）：はじめと終わりで、待機・歩きとなめらかに入れかわる
      // 待機中の小さなしぐさ：歩き・走り・待機の通常の時だけ（外から playOnce したしぐさの間と、そのあとプレイヤーが動かすまでは出さない）
      if (Math.abs(inp.f) + Math.abs(inp.s) > 0.05) {
        st.played = true; st.idleT = 0;
        if (on && on.fidget && !on.out) { on.out = true; on.fadeOut = AVATAR.fidget.stopFade; }      // 操作を始めたら、すぐ歩きへ
      } else if (st.fidgetOn && st.played && !on && !st.prev && root.visible && st.w.idle > 0.98 && fidgets.length) {
        if (!st.nextFidget) st.nextFidget = rnd(AVATAR.fidget.first);
        st.idleT += dt;
        if (st.idleT >= st.nextFidget) {
          const list = fidgets.length > 1 ? fidgets.filter((n) => n !== st.lastFidget) : fidgets, name = list[Math.floor(Math.random() * list.length)];
          st.lastFidget = name; st.idleT = 0; st.nextFidget = rnd(AVATAR.fidget.every);
          api.playOnce(name, { lock: false, fidget: true, fadeIn: AVATAR.fidget.fadeIn, fadeOut: AVATAR.fidget.fadeOut });
        }
      }
      let ow = 0, pw = 0, eye = 0;
      const pv = st.prev;                                              // 前のしぐさ（次のしぐさへ入れかわる間だけ残る。例：sleep_lean → wake_up）
      if (pv) {
        pv.t += dt * pv.speed; pv.w = Math.max(0, pv.w - dt / pv.fade); pw = pv.w * pv.w * (3 - 2 * pv.w);
        const tt = pv.loop ? pv.t % pv.dur : Math.min(pv.t, pv.dur - 1e-4);
        pv.a.time = tt; pv.a.setEffectiveWeight(pw); eye += eyeAt(pv.eyes, tt) * pw;
        if (pv.w <= 0) { pv.a.stop(); st.prev = null; }
      }
      if (on) {
        on.t += dt * on.speed;
        if (on.loop) { if (on.w >= 1) on.finish(true); }
        else {
          if (on.t >= on.dur) on.finish(true);
          if (!on.hold && on.t >= on.dur - on.fadeOut) on.out = true;     // クリップの終わりは待機に近い姿勢なので、最後の fadeOut 秒で待機へ
        }
        on.w = on.out ? Math.max(0, on.w - dt / on.fadeOut) : (on.fadeIn > 0 ? Math.min(1, on.w + dt / on.fadeIn) : 1);
        ow = on.w * on.w * (3 - 2 * on.w);
        const tt = on.loop ? on.t % on.dur : Math.min(on.t, on.dur - 1e-4);
        on.a.time = tt; on.a.setEffectiveWeight(ow); eye += eyeAt(on.eyes, tt) * ow;
        if (on.out && on.w <= 0) endOnce(!on.loop && on.t >= on.dur - on.fadeOut - 1e-3);
      }
      eye = Math.max(Math.min(eye, 1), st.eyesClosed);
      const bw = Math.max(0, 1 - ow - pw);
      for (const n of ['idle', 'walk', 'run']) if (act[n]) act[n].setEffectiveWeight(st.w[n] * bw);
      const before = st.phase; st.phase += moved / AVATAR.speedScale / lerp(cycW, cycR, runK);      // アニメは速くする前の速さで進む
      if (st.w.idle > 0.98) st.phase = Math.round(st.phase * 2) / 2 + 0.0;       // とまったら、次の一歩は足がついた所から
      if (act.walk) act.walk.time = ((st.phase + offW) % 1) * durW; if (act.run) act.run.time = ((st.phase + offR) % 1) * durR;
      const f = Math.floor(st.phase * 2); if (f !== Math.floor(before * 2) && move > 0.3) { player.step = f; if (onStep) onStep(f % 2); }
      mixer.update(dt);
      // 瞬き
      if (AVATAR.blink && morphs.length) {
        st.blinkT -= dt; let b = 0;
        if (st.blinkT < 0) { const u = -st.blinkT / 0.17; if (u >= 1) st.blinkT = 2.2 + Math.random() * 3.6; else b = Math.sin(Math.PI * u); }
        b = Math.max(b, eye);
        if (b !== st.blink) { st.blink = b; api.setBlink(b); }
      }
    },
    // しぐさを 1 回だけ再生する。終わったら待機（歩き・走り）にもどる。返り値の Promise は、最後まで再生したら true、とちゅうで止めた・クリップがないときは false
    //   o: { fadeIn: 0.35, fadeOut: 0.45（秒）, hold: 最後の姿勢で止めておく（stopOnce() でもどる。Promise は最後の姿勢になった時）, lock: 再生中は移動の入力を受けない（初期値 true）, speed: 1, onDone(done) }
    playOnce(name, o = {}) {
      const c = gestures[name];
      if (!c) { console.warn(`player_avatar: クリップ ${name} がありません（あるもの: ${info.clips.join(', ')}）`); if (o.onDone) o.onDone(false); return Promise.resolve(false); }
      const loop = o.loop ?? AVATAR.loops.includes(name), fadeIn = o.fadeIn ?? 0.35;
      if (!o.fidget) st.played = false;                                    // 外から再生したしぐさ（演出）のあとは、プレイヤーが動かすまで 待機のしぐさを出さない
      st.idleT = 0;
      if (st.prev) { st.prev.a.setEffectiveWeight(0); st.prev.a.stop(); st.prev = null; }
      if (st.once) {                                                     // 再生中のしぐさからは、待機をはさまずに入れかわる
        const o0 = st.once; st.once = null; o0.finish(false);
        if (o0.name === name || fadeIn <= 0) { o0.a.setEffectiveWeight(0); o0.a.stop(); }
        else st.prev = { a: o0.a, t: o0.t, w: o0.w, dur: o0.dur, loop: o0.loop, speed: o0.speed, eyes: o0.eyes, fade: fadeIn };
      }
      let a = onceAct[name];
      if (!a) { fixClip(c); a = onceAct[name] = mixer.clipAction(c); a.clampWhenFinished = true; }
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      a.reset(); a.play(); a.timeScale = 0; a.setEffectiveWeight(0);       // 時間は update で進める
      return new Promise((resolve) => {
        let fin = false;
        st.once = { name, a, t: 0, dur: c.duration, w: 0, out: false, loop, fadeIn, fadeOut: o.fadeOut ?? 0.45, hold: !!o.hold, lock: o.lock ?? true, speed: o.speed ?? 1, fidget: !!o.fidget,
          eyes: AVATAR.eyes[name] || [], finish(done) { if (fin) return; fin = true; if (o.onDone) o.onDone(done); resolve(done); } };
        if (fadeIn <= 0) api.update(0);                                    // すぐにその姿勢にする（場面の始まり用）
      });
    },
    // 再生中のしぐさを止めて、待機にもどる（hold で止めていた姿勢・くり返すしぐさからも）
    stopOnce() { if (st.once) st.once.out = true; },
    // 目をとじたままにする（true / false、または 0〜1）。自動のまばたきより優先する。しぐさの目のとじ方（AVATAR.eyes）とは、大きい方を使う
    // 待機中の小さなしぐさを出す・出さない（演出の間は false にしておくと確実）。false にすると、出ているしぐさもやめる
    setFidget(b) { st.fidgetOn = !!b; st.idleT = 0; if (!b && st.once && st.once.fidget) st.once.out = true; },
    setEyesClosed(v) { st.eyesClosed = v === true ? 1 : (+v || 0); },
    setBlink(v) {
      for (const m of morphs) {
        const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
        if (d.blink !== undefined) inf[d.blink] = v;
        if (d.blink_mid !== undefined) inf[d.blink_mid] = 16 * v * v * (1 - v) * (1 - v);
        if (d.blink_iris !== undefined) inf[d.blink_iris] = Math.pow(v, 12);
      }
    },
    // 後ろから追うカメラ（player.yaw・pitch ＝ 見回した向き）
    placeCamera(t, dt = 1 / 60) {
      const gy = groundH(player.x, player.z), p = clamp(player.pitch + cam.pitch, cam.minPitch, cam.maxPitch), cp = Math.cos(p);
      tgt.set(player.x, gy + cam.height, player.z);
      want.set(tgt.x + Math.sin(player.yaw) * cp * cam.dist, tgt.y - Math.sin(p) * cam.dist, tgt.z + Math.cos(player.yaw) * cp * cam.dist);
      want.y = Math.max(want.y, groundH(want.x, want.z) + cam.ground);
      if (!st.camInit) { st.camPos.copy(want); st.camInit = true; } else st.camPos.lerp(want, 1 - Math.exp(-dt * cam.lag));
      camera.position.copy(st.camPos); camera.lookAt(tgt);
    },
    setVisible(b) { root.visible = b; if (blob) blob.visible = b; },
    dispose() { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); scene.remove(root); if (blob) scene.remove(blob); },
  };
  api.update(0);
  return api;
}
