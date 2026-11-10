// =====================================================================
// 自然の手ざわり（シェーダー）：① 風の揺れ ② 草と土の地面・ふさふさの草 ③ 遠くのかすみ ④ 空のドームと雲
// 数値はこのファイルの上のほうにまとめてあります。main.js から使います。
// =====================================================================
import * as THREE from 'three';

// ---------------------------------------------------------------- 共通：時間と風
// uTime は main.js が毎フレーム進める。uWind は風の強さ（0 で止まる）。
export const windU = { uTime: { value: 0 }, uWind: { value: 1 } };
export const WIND = {
  dir: [0.86, 0.5],      // 風の向き（上から見て、東南東から西北西へ吹くように見える）
  sway: 1.25,            // ゆらゆらの速さ
  gustSpeed: 0.55,       // 強い風が町を通りぬける速さ
};
export const WIND_GLSL = `
  uniform float uTime, uWind;
  float wHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  // root：揺れの根元（木・茂みの足もと）  k：高さの割合（根元 0 〜 てっぺん 1）  amp：てっぺんの揺れ（m）
  vec3 windOffset(vec3 root, float k, float amp){
    vec2 dir = vec2(${WIND.dir[0].toFixed(3)}, ${WIND.dir[1].toFixed(3)});
    float ph = dot(root.xz, vec2(0.37, 0.71));                      // 木ごとに揺れの位相をずらす
    float front = dot(root.xz, dir) * 0.045 - uTime * ${WIND.gustSpeed.toFixed(3)};
    float gust = smoothstep(0.6, 1.0, sin(front) * 0.5 + 0.5) * (0.6 + 0.4 * sin(uTime * 0.17 + 1.3));   // ときどき通る強い風
    float sway = sin(uTime * ${WIND.sway.toFixed(3)} + ph) * 0.65 + sin(uTime * ${(WIND.sway * 1.84).toFixed(3)} + ph * 1.9) * 0.25;
    float a = uWind * amp * k * k;
    vec2 d = dir * a * (0.25 + 0.9 * gust + sway * (0.5 + 0.7 * gust))
           + vec2(-dir.y, dir.x) * a * 0.22 * sin(uTime * 1.7 + ph * 2.3);
    return vec3(d.x, -0.08 * a * gust, d.y);
  }`;

// マテリアルに風を足す。opts.kind：
//   'tree'  … 頂点に aRoot（根元 xyz・木の高さ）が入っている木（幹と葉）
//   'local' … 足もとが原点の部品（茂み・花壇の花）。h0〜h1 の高さで 0 → 1
// amp：てっぺんの揺れ（m）、flutter：葉や花の小さなふるえ（m）
export function addWind(m, opts) {
  const o = { kind: 'tree', amp: 0.18, flutter: 0, h0: 0, h1: 1, ...opts };
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uTime = windU.uTime; sh.uniforms.uWind = windU.uWind;
    const head = o.kind === 'tree' ? 'attribute vec4 aRoot;\n' : '';
    const body = o.kind === 'tree'
      ? `vec3 wRoot = aRoot.xyz; float wK = clamp((transformed.y - wRoot.y) / aRoot.w, 0.0, 1.3);`
      : `vec3 wRoot = modelMatrix[3].xyz; float wK = clamp((transformed.y - ${o.h0.toFixed(3)}) / ${(o.h1 - o.h0).toFixed(3)}, 0.0, 1.2);`;
    const flutter = o.flutter > 0
      ? `{ float wh = wHash(floor(position * 7.0)) * 6.2831;
           transformed += vec3(sin(uTime * 3.1 + wh), 0.4 * sin(uTime * 2.3 + wh * 1.3), cos(uTime * 2.7 + wh)) * ${o.flutter.toFixed(3)} * uWind * min(wK, 1.0); }`
      : '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${head}${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n{ ${body}\n transformed += windOffset(wRoot, wK, ${o.amp.toFixed(3)});\n ${flutter} }`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|wind:${o.kind}:${o.amp}:${o.flutter}:${o.h0}:${o.h1}`;
  return m;
}

// ---------------------------------------------------------------- ③ 遠くのかすみ（three.js の霧の計算を置きかえる）
// 霧の near までは色をそのまま（近くは濁らせない）。そこから奥へ、空の地平線の色へなめらかに溶ける。
// 色はうすく灰色によせてから地平線の色へ（遠くの木や山が青白く下がって見える）。
export function patchHaze() {
  THREE.ShaderChunk.fog_fragment = `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float hzD = max( 0.0, vFogDepth - fogNear ) / max( 1.0, fogFar - fogNear );
      float fogFactor = clamp( 1.0 - exp( - hzD * hzD * 2.4 - hzD * 0.45 ), 0.0, 1.0 );
    #endif
    vec3 hzGray = vec3( dot( gl_FragColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( gl_FragColor.rgb, hzGray, 0.35 ), smoothstep( 0.0, 0.5, fogFactor ) * 0.6 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif`;
}

// ---------------------------------------------------------------- ② 地面：草地の色むら・石畳・踏み固めた土・広場の敷石
// mask（地面の画像と同じ並び）：R 草地 / G 石畳（大きな道・市場）/ B 土の小道 / A 広場の敷石
export const GROUND = {
  grassLight: [0.74, 0.90, 0.66],   // 草の色（地面の色にかける。明るい所）
  grassDeep: [0.60, 0.83, 0.58],    // 草の色（濃い所）
  grassSun: [0.88, 0.93, 0.64],     // 日だまりの黄色っぽい所
  cobble: 0.34,                     // 石畳の石の大きさ（m）
  slab: 1.3,                        // 広場の敷石の幅（m）
};
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(3)).join(', ')})`;
const GNOISE = `
  float gH1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 gH2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(gH1(i), gH1(i + vec2(1, 0)), f.x), mix(gH1(i + vec2(0, 1)), gH1(i + vec2(1, 1)), f.x), f.y); }
  vec3 grassTint(vec2 wp){
    float ln = gN(wp * 0.22) * 0.65 + gN(wp * 0.55 + 4.0) * 0.35, mn = gN(wp * 0.9 + 7.0);
    vec3 gt = mix(${v3(GROUND.grassLight)}, ${v3(GROUND.grassDeep)}, smoothstep(0.35, 0.72, ln));
    return mix(gt, ${v3(GROUND.grassSun)}, smoothstep(0.62, 0.86, mn) * 0.55);
  }`;
export function addGroundDetail(m, maskTex, plazaXZ) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uGMask = { value: maskTex }; sh.uniforms.uPlaza = { value: new THREE.Vector2(...plazaXZ) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGMask; uniform vec2 uPlaza;\n${GNOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec4 gm = texture2D(uGMask, vMapUv);
        vec2 wp = vWPos.xz;
        float fn = gN(wp * 4.5 + 3.0), mn = gN(wp * 0.9 + 7.0);
        vec3 base = diffuseColor.rgb;
        // 草地：地面の色に草の色をかけ、大きなむら・小さなむらをつける
        vec3 grassC = base * grassTint(wp) * (0.93 + 0.12 * fn) * (0.97 + 0.06 * gN(wp * 13.0));
        vec3 c = mix(base, grassC, gm.r);
        // 石畳（大きな道）：石のかたちと目地
        if (gm.g > 0.01) {
          vec2 q = wp / ${GROUND.cobble.toFixed(3)}, ip = floor(q), fp = fract(q);
          float f1 = 8.0, f2 = 8.0, id = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)), rr = o + gH2(ip + o) * 0.75 + 0.125 - fp; float d = dot(rr, rr);
            if (d < f1) { f2 = f1; f1 = d; id = gH1(ip + o); } else if (d < f2) f2 = d;
          }
          float edge = smoothstep(0.02, 0.16, sqrt(f2) - sqrt(f1));
          vec3 stone = base * vec3(1.0, 0.985, 0.96) * (0.92 + 0.11 * id) * (0.97 + 0.05 * fn);
          c = mix(c, mix(stone * vec3(0.85, 0.85, 0.82), stone, edge), gm.g);
        }
        // 踏み固めた土（小道）：あたたかい色、むらと小石
        vec3 dirt = base * vec3(1.0, 0.95, 0.86) * (0.91 + 0.13 * mn) * (1.0 - 0.09 * step(0.8, gN(wp * 11.0)));
        c = mix(c, dirt, gm.b);
        // 広場の敷石：噴水を中心にした輪と、等分の目地（人工の床）
        if (gm.a > 0.01) {
          vec2 pc = wp - uPlaza; float rad = length(pc), ang = atan(pc.y, pc.x);
          float rr = rad / ${GROUND.slab.toFixed(3)}, ring = floor(rr), fr = fract(rr);
          float n = max(6.0, floor(6.2831 * (ring + 0.5) * ${GROUND.slab.toFixed(3)} / 1.5));
          float fa = fract((ang / 6.2831 + 0.5) * n + ring * 0.37);
          float dm = min(min(fr, 1.0 - fr) * ${GROUND.slab.toFixed(3)}, min(fa, 1.0 - fa) * 6.2831 * max(rad, 0.3) / n);
          float slabId = gH1(vec2(ring, floor((ang / 6.2831 + 0.5) * n + ring * 0.37)));
          vec3 pave = base * (0.96 + 0.06 * slabId) * mix(0.86, 1.0, smoothstep(0.012, 0.045, dm));
          c = mix(c, pave, gm.a);
        }
        diffuseColor.rgb = c;
      }`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|groundDetail`;
  return m;
}

// 地面の種類の画像（main.js の地図の形から描く）。draw(g, layer) で各層を白で塗ってもらう
export function makeGroundMask(W, H, draw) {
  const layers = ['grass', 'cobble', 'dirt', 'plaza'].map((layer) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.setTransform(W / 1600, 0, 0, H / 1000, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g, layer);
    return g.getImageData(0, 0, W, H).data;
  });
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const src = (y * W + x) * 4, dst = ((H - 1 - y) * W + x) * 4;      // 上下を地面の画像（flipY）と同じ向きに
    for (let k = 0; k < 4; k++) data[dst + k] = layers[k][src];
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.userData = { data, W, H };                                          // 短い草の場所を決めるときにも使う
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- ② ふさふさの草（参考：source/reference/grass_ref.png。色は町のミント寄り）
// 葉 1 本 ＝ 細い三角形 3 枚（5 頂点）。何万本を 1 回で描く（InstancedBufferGeometry）。
// 草の場所はタイル状で、カメラと一緒に動く（葉は地面に固定され、まわりだけ入れかわる）。生やすのは草地だけ（地面の種類の画像の G）。
// 近くの輪（濃い草）と遠くの輪（だんだん間引き、背を低く、色を地面へ溶かす）の 2 つ。境目はなめらかにつなぐ。
// 本数は GRASS の count × 倍率（main.js：?grass=0〜2、スマホは自動で半分）。
export const GRASS = {
  near: { R: 9, count: 26000 },         // 近くの輪：半径（m）と本数
  far: { R: 26, count: 30000 },         // 遠くの輪：半径（m）と本数（近くの輪の 6 割の所から入れかわる）
  height: [0.26, 0.6],                  // 葉の高さ（m）
  width: 0.05,                          // 葉の根元の幅（m）
  lean: 0.45,                           // 葉のしなり
  sway: 0.16,                           // 風で先が揺れる大きさ（m）
  root: 0.42, tip: 1.2,                // 根元の暗さ・先の明るさ（地面の色にかける）
  glow: 0.35,                           // 先が光を受けて透ける明るさ（太陽の方を向いたとき）
};
function grassRing({ R, inner, count, field, groundTex, map, shared }) {
  const g = new THREE.InstancedBufferGeometry();
  // 葉の形：根元の左右・中ほどの左右・先（x は幅の割合、y は高さの割合）
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -0.62, 0.5, 0, 0.62, 0.5, 0, 0, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const b = new Float32Array(count * 4);
  let s = 777 + count; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < count; k++) b.set([rnd(), rnd(), rnd(), rnd()], k * 4);
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = count;
  const u = { ...shared, uTile: { value: 2 * R }, uR: { value: R }, uInner: { value: inner } };
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime: windU.uTime, uWind: windU.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aB; uniform vec3 uCamPos, uSunDir; uniform vec2 uMap0, uMapSize, uHN; uniform vec4 uHGrid;
        uniform float uTile, uR, uInner; uniform sampler2D uField;
        varying vec2 vGUv, vGW; varying float vT, vFar, vTrans;
        ${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `
        vec2 rel = mod(aB.xy * uTile - uCamPos.xz + 0.5 * uTile, uTile) - 0.5 * uTile;
        vec2 wxz = uCamPos.xz + rel;
        vec2 fld = texture2D(uField, ((wxz - uHGrid.xy) / uHGrid.z + 0.5) / uHN).rg;      // 地面の高さ・草の量
        float d = length(vec3(rel.x, fld.r - uCamPos.y, rel.y));                          // カメラからの距離（上から見ても遠くなる）
        float keep = (1.0 - smoothstep(uR * 0.6, uR, d)) * smoothstep(uInner, uInner + 2.5, d);
        float alive = smoothstep(aB.z - 0.15, aB.z, keep) * smoothstep(0.3, 0.75, fld.g);   // 遠くほど間引く（ぱっと消えず、縮んで消える）
        float hgt = mix(${GRASS.height[0].toFixed(3)}, ${GRASS.height[1].toFixed(3)}, aB.w) * alive * smoothstep(0.35, 1.0, fld.g) * mix(1.0, 0.4, smoothstep(5.0, uR, d));   // 道や広場のきわは背を低く
        float ang = fract(aB.z * 17.13 + aB.w * 3.71) * 6.2831;
        vec2 side = vec2(cos(ang), sin(ang)), face = vec2(-side.y, side.x);
        float y = position.y;
        vec3 transformed = vec3(wxz.x, fld.r - 0.03, wxz.y);
        transformed.xz += side * position.x * ${GRASS.width.toFixed(3)} * (0.7 + 0.6 * aB.w) * step(0.002, hgt);
        transformed.y += y * hgt;
        transformed.xz += face * y * y * hgt * ${GRASS.lean.toFixed(3)} * (fract(aB.w * 9.13) * 2.0 - 1.0);   // 1 本ずつしなる向き
        transformed += windOffset(vec3(wxz.x, fld.r, wxz.y), y, ${GRASS.sway.toFixed(3)} * hgt / ${GRASS.height[1].toFixed(3)});
        vGUv = vec2((wxz.x - uMap0.x) / uMapSize.x, 1.0 - (wxz.y - uMap0.y) / uMapSize.y); vGW = wxz;
        vT = y; vFar = smoothstep(uR * 0.35, uR * 0.95, d);
        vTrans = pow(max(dot(normalize(transformed - cameraPosition), normalize(uSunDir)), 0.0), 3.0) * y * y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGround; uniform vec3 uSunC; varying vec2 vGUv, vGW; varying float vT, vFar, vTrans;\n${GNOISE}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nnormal = normalize(vNormal);`)     // 葉はみな上向き（地面と同じ光）
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gBase = texture2D(uGround, vGUv).rgb * grassTint(vGW);
        diffuseColor.rgb = mix(gBase * mix(${GRASS.root.toFixed(3)}, ${GRASS.tip.toFixed(3)}, vT), gBase, vFar);   // 根元は暗く、先は明るく。遠くは地面の色へ`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uSunC * ${GRASS.glow.toFixed(3)} * vTrans * (1.0 - vFar);`);   // 先が透けて光る
  };
  m.customProgramCacheKey = () => 'grassBlades2';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false;
  return mesh;
}
// scale：本数の倍率（0〜2。スマホは main.js で半分にする）
export function createGrass({ scale = 1, field, groundTex, map }) {
  const shared = {
    uCamPos: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) },
    uField: { value: field }, uGround: { value: groundTex },
    uMap0: { value: new THREE.Vector2(map.x0, map.z0) }, uMapSize: { value: new THREE.Vector2(map.w, map.d) },
    uHGrid: { value: new THREE.Vector4(map.hx0, map.hz0, map.hcell, 0) }, uHN: { value: new THREE.Vector2(map.nx, map.ny) },
  };
  const group = new THREE.Group(); group.name = 'grass_blades';
  const N = GRASS.near, F = GRASS.far;
  group.add(grassRing({ R: N.R, inner: -10, count: Math.round(N.count * scale), field, groundTex, map, shared }));
  group.add(grassRing({ R: F.R, inner: N.R * 0.6, count: Math.round(F.count * scale), field, groundTex, map, shared }));
  return {
    group, u: shared, count: Math.round((N.count + F.count) * scale),
    update(cam, sun) { shared.uCamPos.value.copy(cam.position); shared.uSunDir.value.copy(sun.position).sub(sun.target.position); shared.uSunC.value.copy(sun.color).multiplyScalar(sun.intensity); },
  };
}

// ---------------------------------------------------------------- ④ 空のドーム（上は濃く、地平線は明るく、太陽の方向は少し光る）＋ ゆっくり流れる雲
export function createSky(noiseTex, { lite = false } = {}) {
  const u = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uCloud: { value: new THREE.Color() }, uCloudSh: { value: new THREE.Color() }, uCloudAmt: { value: 1 }, uSunAmt: { value: 1 }, uStars: { value: 0 },
    uTime: windU.uTime, tNoise: { value: noiseTex },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uZen, uHor, uLow, uSunCol, uSunDir, uCloud, uCloudSh; uniform float uCloudAmt, uSunAmt, uTime, uStars; uniform sampler2D tNoise;
      float sHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 col = mix(uZen, uHor, pow(1.0 - clamp(y, 0.0, 1.0), 2.6));       // 上は濃く、地平線は明るく
        col = mix(col, uLow, smoothstep(0.0, -0.3, y));                         // 地平線の下（島の下の空）
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * (pow(s, 6.0) * 0.22 + pow(s, 40.0) * 0.32) * uSunAmt;  // 太陽の方向のひかり
        if (y > 0.0) {                                                          // 雲：空の高い所にある平らな層を、下から見る
          vec2 p = d.xz / (y + 0.16);
          vec2 drift = vec2(uTime * 0.0045, uTime * 0.0018);
          float c = texture2D(tNoise, p * 0.11 + drift).g * 0.62 + texture2D(tNoise, p * 0.31 + drift * 1.6).b * 0.38;
          ${lite ? '' : 'c += (texture2D(tNoise, p * 0.9 + drift * 2.3).r - 0.5) * 0.12;'}
          float cov = smoothstep(0.5, 0.68, c) * smoothstep(0.03, 0.25, y) * uCloudAmt;
          float lit = texture2D(tNoise, p * 0.11 + drift + normalize(uSunDir.xz + 1e-4) * 0.012).g * 0.62 - texture2D(tNoise, p * 0.11 + drift).g * 0.62;
          vec3 cc = mix(uCloudSh, uCloud, clamp(0.55 + lit * 9.0 + (c - 0.6) * 1.6, 0.0, 1.0));
          cc += uSunCol * pow(s, 5.0) * 0.18 * uSunAmt;                         // 太陽に近い雲のふちが明るい
          col = mix(col, cc, cov * 0.88);
          if (uStars > 0.0) {                                                    // 星：方向を細かいます目に分け、ごく一部のます目に小さな点（またたく）
            vec3 sp = d * 170.0, cell = floor(sp); float h = sHash(cell);
            vec3 off = vec3(sHash(cell + 1.7), sHash(cell + 3.1), sHash(cell + 5.3)) - 0.5;
            float st = step(0.993, h) * smoothstep(0.22, 0.0, length(fract(sp) - 0.5 - off * 0.5));
            st *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
            col += vec3(0.95, 0.95, 1.0) * st * uStars * smoothstep(0.03, 0.25, y) * (1.0 - cov);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), m);
  mesh.name = 'sky_dome'; mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.onBeforeRender = (r, sc, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return { mesh, u };
}
