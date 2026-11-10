// =====================================================================
// 「太陽のない世界」の進行（入口は sun_start.html）。どのエリアのページでも、URL に ?game=sun があるときだけ読みこまれる
//   （area_kit.js の runLoop の 1 行が読みこむ。エリアを移るとき game=sun は引きつがれる。もとの URL を直接開けば、今までどおり）
// 中身：
//   どのエリアでも … 暗い世界（area_kit.js の昼と夜のしくみの「夜」に固定。スイッチはかくす）/ 太陽の UI（集めたかけら）
//   花の丘と森 … 森の 3 つの入り口（遺跡・キノコの谷・水晶の洞くつ）の先に立つ光のすじ（道案内。大樹の広場は使わない）
//   花の丘 … 始まりの演出（太陽がわれて、かけらが 3 方向へ落ちる）/ とじた花・ホタル / エンディング（3 つそろったあと、太陽がもどる）
//   小川と滝 … 滝つぼの平たい岩にのると、滝のうらの水晶の洞くつへ移る（森が中心になってからは通らない道。小川と滝に来たときだけ動く）
// つなぎ方：各ページが window に出している確認用の入口（__hill・__plaza・__stream … と、area_kit.js の __walker・__dayNight）を使う。
//   __walker の update・placeCamera をここで包む ＝ 毎フレームの進行と、演出中のカメラ。エリアのページは書きかえていない
// 保存（localStorage）：sunGame_started（始まりを見た）/ sunCircle_ruins・sunCircle_mushroom・sunCircle_cave（magic_circle.js が書く）/ sunGame_ended（エンディングを見た）
// URL：?sun=reset（ぜんぶ消して最初から）/ ?sunpiece=ruins（テスト用。かけらを集めたことにする。mushroom・cave・all、コンマで複数）
// 確認用：window.__sun（.seek(秒)・.seekEnd(秒)・.step(dt)・.play()・.playEnding()・.collect(名前)・.preview()・.previewUI()・.previewEnding()・.state・.TL・.TLE）
// =====================================================================
import * as THREE from 'three';
import { createLightFairy3D } from './sun_fairy.js';      // 妖精の形：A1「お団子なし」を立体にした光の妖精（3D。sun_fairy.js は読んで使うだけ）

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, sstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z), D2R = Math.PI / 180;
const Q0 = new URLSearchParams(location.search);
const LITE = Q0.has('lite') ? Q0.get('lite') === '1' : (navigator.maxTouchPoints > 0);

// ---------------------------------------------------------------- 保存
export const SUN_GAME_KEY = 'sunGame_started', SUN_END_KEY = 'sunGame_ended';
const CIRCLE_KEYS = { ruins: 'sunCircle_ruins', mushroom: 'sunCircle_mushroom', cave: 'sunCircle_cave' };      // magic_circle.js と同じ名前
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* 保存できない設定のブラウザ */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* 同上 */ } },
};
export const SUN_SOUND_KEY = 'sunGame_sound';                    // 音のオン・オフ（"0" ＝ オフ。なければオン）。どのエリアのページでも同じ
export const SUN_LANG_KEY = 'sunGame_lang', SUN_SAID_KEY = 'sunGame_said3';      // 選んだ言語 / 「3 つそろった」のひとことを言った
const resetAll = () => { store.del(SUN_GAME_KEY); store.del(SUN_END_KEY); store.del(SUN_SAID_KEY); for (const k of Object.values(CIRCLE_KEYS)) store.del(k); };
// ---------------------------------------------------------------- 文字（このゲームで出る文字は、ここに書いたものだけ。言語を足すときは、ここに 1 つ足す）
//   name ＝ 最初の画面のボタン（その言語の文字で）/ html ＝ lang 属性 / title ＝ タイトル（ページの名前にもなる）/ font ＝ 字 / size ＝ 吹き出しの字の大きさ [小さい画面 px, 画面の幅の %, 大きい画面 px]
//   task ＝ 左上に出す「今やること」（0 妖精についていく・1 かけらを集める・2 花の丘にもどる）。字はセリフと同じフォント
//   talk ＝ 妖精のセリフ（0 使わない（「太陽がなんだかおかしいみたい…」は消した）・1 ど、どうしよう…・2 3 つそろった・3 いつまで寝てるの・4 もうお昼だよ・5 おうちに帰ろう・6 太陽が、われちゃった・7 エルフの力なら、元に戻せる？・8 じゃあ、とりあえずかけらを集めようか・9 集めたかけらを、エルフの力で太陽に返してあげて（エンディングの始め））。長いものは 2 行（スマホの縦画面で 2 行におさまる所で分けてある）
const TEXT = {
  ja: { name: '日本語', html: 'ja', title: 'おひさまのかけら', font: '"Hiragino Maru Gothic ProN", "Zen Maru Gothic", "Kosugi Maru", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", sans-serif', size: [14.5, 4.2, 18],
    talk: [null, ['ど、どうしよう…'], ['かけらがそろった！', '最初の丘にもどろう！'], ['いつまで寝てるの？'], ['もうお昼だよ'], ['おうちに帰ろう'], ['…太陽が、われちゃった'], ['エルフの力なら、元に戻せる？'], ['じゃあ、とりあえず', 'かけらを集めようか'], ['集めたかけらを、', 'エルフの力で太陽に返してあげて']], task: ['妖精についていく', '太陽のかけらを集める', '花の丘にもどる'], count: ['（', '/3）'] },
  en: { name: 'English', html: 'en', title: 'Pieces of Sunshine', font: '"Avenir Next", "Nunito", "Segoe UI", system-ui, sans-serif', size: [12.5, 3.55, 17],
    talk: [null, ['W-what do we do...'], ['We have all the pieces!', "Let's go back to the first hill!"], ['How long are you going to sleep?'], ["It's already noon!"], ["Let's go home"], ['...The sun... it broke.'], ['Could your elf magic fix it?'], ["Then let's gather", 'the pieces first.'], ['Use your elf magic to return', 'the pieces to the sun.']], task: ['Follow the fairy', 'Collect the pieces of the sun', 'Return to Flower Hill'], count: [' (', '/3)'] },
  zh: { name: '中文', html: 'zh-Hans', title: '太阳的碎片', font: '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif', size: [14.5, 4.2, 18],
    talk: [null, ['怎、怎么办…'], ['碎片集齐了！', '我们回到最初的山丘吧！'], ['你要睡到什么时候？'], ['已经中午啦'], ['回家吧'], ['…太阳，碎掉了'], ['精灵的力量，能让它恢复吗？'], ['那我们先去', '把碎片收集起来吧。'], ['用精灵的力量，', '把碎片还给太阳吧。']], task: ['跟着精灵走', '收集太阳的碎片', '回到花之丘'], count: ['（', '/3）'] },
  ko: { name: '한국어', html: 'ko', title: '해님의 조각', font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif', size: [14.5, 4.1, 18],
    talk: [null, ['어, 어떡하지…'], ['조각을 다 모았어!', '처음의 언덕으로 돌아가자!'], ['언제까지 잘 거야?'], ['벌써 점심이야'], ['집에 가자'], ['…해님이, 깨져 버렸어'], ['엘프의 힘이라면', '되돌릴 수 있을까?'], ['그럼 일단', '조각을 모으러 가자.'], ['엘프의 힘으로', '조각들을 해님에게 돌려줘.']], task: ['요정을 따라가기', '해님의 조각 모으기', '꽃의 언덕으로 돌아가기'], count: [' (', '/3)'] },
};
const LANGS = Object.keys(TEXT), START_LABEL = 'Start';
// オリジナルの字（fonts/ohisama_title.woff2「Ohisama Title」）：最初の画面のタイトル・言語ボタン・Start だけに使う（4 言語のタイトル・言語名・Start・ひらがな・英数字が入っている。セリフには使わない）。
// 読みこむ前・読めなかったとき・入っていない字は、うしろに書いた端末のフォントで出る（font-display: swap）。太さはどれを指定しても同じ字（にせの太字にしない）
// （前の字。今は使っていない ＝ セリフ・やることは UI 案 C の「Ohisama C Talk <言語>」fonts/ui_c_talk_*.woff2）妖精のセリフの字（fonts/sun_talk_<言語>.woff2。Google Fonts の字を、セリフに使う文字だけにしぼったもの。どれも SIL Open Font License 1.1）：
//   ja Mochiy Pop One / en Fredoka 600 / zh ZCOOL KuaiLe / ko Jua。選んだ言語のぶんだけ読みこむ。magic_circle.js の「E 拾う」（拾う / Pick up / 拾取 / 줍기）の字も入れてある。**セリフ・今やること（TEXT の talk・task）を変えたら、新しい字をこのファイルに足すこと**（入っていない字は、端末のフォントで出る）
let talkFontOff = false;                                            // 確認画像用：true の間は、端末のフォントで描く
const C_FB = { ja: '"Yu Mincho", "Hiragino Mincho ProN", serif', en: 'Georgia, serif', zh: '"Songti SC", "SimSun", serif', ko: '"AppleMyungjo", "Batang", serif' };      // UI 案 C の字が読めないときの、端末の字
const talkFont = (l) => (talkFontOff ? TEXT[l].font : `"Ohisama C Talk ${l}", ${C_FB[l]}`);      // セリフ・やること：UI 案 C「筆と和紙」の字（ui_design/ui_design.md）
const TITLE_FONT = '"Ohisama Title"', titleFont = (l) => `${TITLE_FONT}, ${TEXT[l].font}`;
// 言語：URL の ?lang= → 前に選んだもの → 端末の言語 → English
const pickLang = () => { const q = Q0.get('lang'); if (TEXT[q]) { store.set(SUN_LANG_KEY, q); return q; } const v = store.get(SUN_LANG_KEY); if (TEXT[v]) return v;
  const n = String(navigator.language || 'en').toLowerCase().slice(0, 2); return TEXT[n] ? n : 'en'; };
if (Q0.get('sun') === 'reset') resetAll();
const pieces = () => ({ ruins: store.get(CIRCLE_KEYS.ruins) === '1', mushroom: store.get(CIRCLE_KEYS.mushroom) === '1', cave: store.get(CIRCLE_KEYS.cave) === '1' });
const allOf = (p) => p.ruins && p.mushroom && p.cave;

// ---------------------------------------------------------------- 今いるエリア（ページが window に出している入口の名前で見分ける）
// 太陽ゲームでは、花の丘と森がひとつづきで、森の中に 遺跡・キノコの谷・水晶の洞くつ の入り口がある（大樹の広場は使わない）
const AREAS = [['__hill', 'hill'], ['__forest', 'forest'], ['__plaza', 'plaza'], ['__stream', 'stream'], ['__valley', 'valley'], ['__ruins', 'ruins'], ['__cliff', 'cliff'], ['__cave', 'cave']];
// かけらが落ちる所 ＝ 道案内の光のすじが立つ所：ページが入り口の一覧（window.__hill.gates ＝ [{ name: 'ruins' | 'valley' | 'cave', x, z, d? }]。forest_path.js の GATES と同じ形）を出していれば、その入り口の先。
// 出していなければ、花の丘では森のほう（+z）へ、下の角度（+z から +x へ測った度）と距離（m）でならべる
const GATE_NAME = { ruins: 'ruins', valley: 'mushroom', mushroom: 'mushroom', cave: 'cave' }, GATE_FAR = 45;
const FALLBACK = { cave: [-20, 430], ruins: [4, 470], mushroom: [28, 430] };
// 太陽の UI のかけら：われ目は 90°・210°・330°（始まりの演出の太陽と同じ）。左上＝キノコの谷（北西）、右上＝遺跡（北東）、下＝水晶の洞くつ（地面の下）
const PIECES = [{ name: 'mushroom', a0: 90 }, { name: 'cave', a0: 210 }, { name: 'ruins', a0: 330 }];

const def = AREAS.find(([g]) => window[g]);
if (def && window.__walker && !window.__sun) init(def);

function init([gName, area]) {
  const G = window[gName], walker = window.__walker, dayNight = window.__dayNight;
  const { scene, camera, player, controls, renderer } = G;
  const isHill = area === 'hill', hill = isHill ? G : null;
  const st = { area, phase: 'wait', s: 0, started: store.get(SUN_GAME_KEY) === '1', ended: store.get(SUN_END_KEY) === '1', cutW: 0, yaw: 0, pitch: 0, camH: 0.8, camD: 3, shake: 0, going: false, uiK: -1 };
  if (!st.started && !isHill) return;                               // ゲームを始めていない（始まりは花の丘だけ）
  const U = { uS: { value: 999 }, uT: { value: 0 }, uClose: { value: 0 }, uPR: { value: 1 }, uWave: { value: new THREE.Vector4(0, 0, 26, 0) } };      // uWave ＝ 花がとじる波（x, y ＝ 波の出る所の x, z。z ＝ 波がとどく距離 m。w ＝ 1 で波・0 でばらばら）
  const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
  const byName = (n) => scene.getObjectByName(n);
  const GOLD = 'vec3(1.0, 0.74, 0.28)', PALE = 'vec3(1.0, 0.96, 0.8)';


  // ================================================================ 画面の部品（太陽の UI・かくすボタン）
  let lang = pickLang(), onLang = () => {}; document.documentElement.lang = TEXT[lang].html;
  const UI = 80, UIY = 10 + UI / 2, UIS = UI / 60;                 // 太陽の UI の大きさ（px）・まん中の高さ・飛んでくるかけら（60 px）との比
  const css = document.createElement('style');
  css.textContent = `/* UI 案 C「筆と和紙」の字（ui_design/ui_c_fonts.css から）。選んだ言語のぶんだけ読まれる */
    @font-face { font-family: "Ohisama C Talk ja"; src: url("./fonts/ui_c_talk_ja.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }   /* Klee One SemiBold */
    @font-face { font-family: "Ohisama C Talk en"; src: url("./fonts/ui_c_talk_en.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }   /* Klee One SemiBold */
    @font-face { font-family: "Ohisama C Talk zh"; src: url("./fonts/ui_c_talk_zh.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }   /* LXGW WenKai TC Regular */
    @font-face { font-family: "Ohisama C Talk ko"; src: url("./fonts/ui_c_talk_ko.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }   /* Gowun Batang Bold */
    @font-face { font-family: "Ohisama C Title ja"; src: url("./fonts/ui_c_title_ja.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }  /* Yuji Syuku */
    @font-face { font-family: "Ohisama C Title en"; src: url("./fonts/ui_c_title_en.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }  /* Yuji Syuku */
    @font-face { font-family: "Ohisama C Title zh"; src: url("./fonts/ui_c_title_zh.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }  /* LXGW WenKai TC Regular */
    @font-face { font-family: "Ohisama C Title ko"; src: url("./fonts/ui_c_title_ko.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }  /* Song Myung */
    @font-face { font-family: "Ohisama Title"; src: url("./fonts/ohisama_title.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
    #timeBtn, #help { display: none !important; }      /* ゲーム中は、昼と夜のスイッチと、文字の説明を出さない */
    #sunUI { position: fixed; left: 50%; top: calc(10px + env(safe-area-inset-top)); width: ${UI}px; height: ${UI}px; margin-left: -${UI / 2}px; z-index: 6; pointer-events: none; opacity: 0; transition: opacity 1.2s ease, transform .7s cubic-bezier(.3,1.5,.5,1); transform-origin: 50% 50%; }
    #sunUI.show { opacity: 1; } #sunUI.full { transform: scale(1.15); }
    @media (orientation: portrait) { #sunUI { top: calc(8px + env(safe-area-inset-top)); width: 64px; height: 64px; margin-left: -32px; } }
    #sunUI svg, .sunFly svg { display: block; width: 100%; height: 100%; overflow: visible; }
    #sunUI .on { animation: sunPulse 3.4s ease-in-out infinite; }
    @keyframes sunPulse { 0%, 100% { opacity: .8; } 50% { opacity: 1; } }
    .sunFly, .sunFlash { position: fixed; left: 0; top: 0; width: 60px; height: 60px; z-index: 8; pointer-events: none; }
    .sunFly > * { position: absolute; left: 0; top: 0; width: 60px; height: 60px; } .sunFly .glow { border-radius: 50%; background: radial-gradient(circle, rgba(255,250,232,.95), rgba(240,222,170,.5) 34%, rgba(240,222,170,0) 70%); }
    .sunDot { position: fixed; left: 0; top: 0; width: 36px; height: 36px; margin: -18px 0 0 -18px; z-index: 8; pointer-events: none; border-radius: 50%; background: radial-gradient(circle, rgba(255,252,236,1), rgba(240,222,170,.75) 40%, rgba(240,222,170,0) 70%); }
    .sunFlash { border-radius: 50%; background: radial-gradient(circle, rgba(255,250,232,.95), rgba(240,222,170,.55) 45%, rgba(240,222,170,0) 70%); }
    body.shot #sunUI, body.sun-intro #viewBtn, body.sun-intro #soundBtn { opacity: 0 !important; pointer-events: none; }
    #viewBtn, #soundBtn { transition: opacity .8s ease; }
    /* 妖精の吹き出し（UI 案 C）：左右が消えていく墨の帯 ＋ 上と下に 1 px の淡い金の線。字は「Ohisama C Talk <言語>」 */
    #sunTalk { position: fixed; left: 50%; bottom: calc(30px + env(safe-area-inset-bottom)); transform: translate(-50%, 14px); z-index: 9; box-sizing: border-box; max-width: min(94vw, 560px); padding: 14px 70px 14px 60px;
      display: flex; align-items: center; gap: 14px; background: linear-gradient(90deg, rgba(8,8,24,0), rgba(8,8,24,.62) 16%, rgba(8,8,24,.62) 84%, rgba(8,8,24,0));
      color: #f6f0e0; font-weight: 400; font-synthesis: none; line-height: 1.85; letter-spacing: .08em; white-space: nowrap; text-shadow: 0 0 8px rgba(8,8,24,.8), 0 1px 2px rgba(8,8,24,.9);
      opacity: 0; pointer-events: none; transition: opacity .35s ease, transform .35s ease; cursor: pointer; -webkit-tap-highlight-color: transparent; min-height: 56px; }
    #sunTalk.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    #sunTalk::before, #sunTalk .ln { content: ''; position: absolute; left: 6%; right: 6%; height: 1px; pointer-events: none; opacity: .55; transition: opacity .15s ease;
      background: linear-gradient(90deg, rgba(240,222,170,0), rgb(240,222,170) 20%, rgb(240,222,170) 80%, rgba(240,222,170,0)); }
    #sunTalk::before { top: 0; } #sunTalk .ln { bottom: 0; }
    #sunTalk.flash::before, #sunTalk.flash .ln { opacity: .85; }      /* 押して次へ：上下の線が少しだけ明るくなる */
    /* まっくらな場面のセリフ：画面の下のまん中に、横に広い会話らん */
    #sunTalk.wide { width: min(94vw, 760px); max-width: none; min-height: 108px; padding: 20px 96px 22px 92px; }
    #sunTalk .rest { visibility: hidden; }                              /* まだ出ていない字（場所だけ取っておく ＝ 字が出る間、らんの大きさが変わらない） */
    /* 進められる合図：右下で点めつする ▼（三角の輪かく。字が出きって、押すのを待っている間だけ） */
    #sunTalk .nxt { position: absolute; right: 74px; bottom: 16px; width: 10px; height: 8px; opacity: 0; pointer-events: none; }
    #sunTalk .nxt svg { display: block; width: 10px; height: 8px; }
    #sunTalk.next .nxt { opacity: 1; animation: sunNext 1s ease-in-out infinite; }
    @keyframes sunNext { 0%, 100% { transform: translateY(0); opacity: 1; } 50% { transform: translateY(3px); opacity: .3; } }
    #sunTalk > svg { flex: none; width: 30px; height: 30px; }
    @media (orientation: portrait) {
      #sunTalk { bottom: calc(20px + env(safe-area-inset-bottom)); padding: 14px 40px 16px 36px; gap: 10px; letter-spacing: .04em; }
      #sunTalk.wide { width: 94vw; min-height: 96px; padding: 14px 40px 16px 36px; }
      #sunTalk > svg { width: 26px; height: 26px; } #sunTalk .nxt { right: 22px; bottom: 12px; } }
    body.shot #sunTalk { display: none; }
    /* タイトル画面（花の丘の 3D の景色の上）：ロゴは上、ボタンは下。背景の絵（スライドショー）は使わない */
    #gate.sunTitle { background: none !important; }
    /* ===== UI 案 C のタイトル画面（ui_design/ui_c_title.html の <style id="c-title-css"> をそのまま）===== */
    と ui_c_fonts.css を差しこむだけ）。
      ★ sun_game.js の担当へ：<style id="c-title-css"> の中身が、そのまま使える C のタイトル画面の CSS。HTML の形（cMarkup）も下の script にある。
      撮り方：http://localhost:8770/ui_design/ui_c_title.html を 1600×1000 で開く。
    -->
    <style id="c-title-css">
    /* ===== C「筆と和紙」タイトル画面のボタン（sun_game.js の #gate.sunTitle .sunBot の中）===== */
    #gate.sunTitle .sunBot { position: relative; }
    /* ボタンの列のうしろに、ごくうすい墨のにじみ（明るい花畑の上でも字が読める・押せる所のまとまりがわかる） */
    #gate.sunTitle .sunBot::before { content: ''; position: absolute; left: 50%; top: 50%; width: 560px; max-width: 120vw; height: 260px; transform: translate(-50%, -50%); z-index: -1; pointer-events: none;
      background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(8,8,24,.38), rgba(8,8,24,.18) 55%, rgba(8,8,24,0) 100%); }
    /* 言語ボタン：線も面もない字だけ。押せる範囲は 92×48px（スマホ縦 76×48px） */
    #gate.sunTitle .sunLangs { display: flex; justify-content: center; gap: 4px; }
    #gate.sunTitle .sunLangs button { position: relative; min-width: 92px; height: 48px; padding: 0 12px; border: 0; border-radius: 24px; background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent;
      color: rgba(251,246,230,.8); font-size: 19px; font-weight: 400; font-synthesis: none; line-height: 48px; letter-spacing: .12em; text-indent: .12em;
      text-shadow: 0 0 10px rgba(8,8,24,.85), 0 1px 3px rgba(8,8,24,.9); transition: color .25s ease, background-color .25s ease, transform .12s ease; }
    /* 選んでいないボタン：字の下に、短い細い線（押せる印） */
    #gate.sunTitle .sunLangs button::after { content: ''; position: absolute; left: 50%; bottom: 8px; width: 22px; height: 1px; margin-left: -11px; background: rgba(251,246,230,.38); transition: all .25s ease; }
    /* マウスを乗せた：線がのびて淡い金に */
    #gate.sunTitle .sunLangs button:hover::after { width: 40px; margin-left: -20px; background: rgba(240,222,170,.7); }
    /* 選んだ：字が白く光り、下に筆の線（淡い金） */
    #gate.sunTitle .sunLangs button.on { color: #fffaf0; text-shadow: 0 0 12px rgba(255,233,176,.5), 0 0 10px rgba(8,8,24,.8), 0 1px 3px rgba(8,8,24,.9); }
    #gate.sunTitle .sunLangs button.on::after { left: 12px; right: 12px; width: auto; margin-left: 0; bottom: 6px; height: 6px; opacity: .9; filter: drop-shadow(0 0 4px rgba(240,222,170,.55));
      background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 6' preserveAspectRatio='none'><path d='M1 3.6 C20 2.2 50 2.4 99 2.8 L98 3.6 C60 4.2 25 4.6 2 4.4Z' fill='%23f0deaa'/></svg>") center / 100% 100% no-repeat; }
    /* 押している間：うすい光の面がふわっと出て、少し小さく */
    #gate.sunTitle .sunLangs button:active, #gate.sunTitle .sunLangs button.press { background-color: rgba(255,248,230,.16); transform: scale(.96); }
    #gate.sunTitle .sunLangs button:focus-visible, #gate.sunTitle .sunStart:focus-visible, #gate.sunTitle .sunSound:focus-visible { outline: 1px solid rgba(240,222,170,.75); outline-offset: -3px; }
    /* Start：押せる範囲 280×56px（スマホ縦 240×52px）。墨のにじみの面 ＋ 左右に細い金の線。字はゆっくり光る（押すのを待っている合図） */
    #gate.sunTitle .sunStart { position: relative; margin-top: 22px; width: 280px; height: 56px; padding: 0; border: 0; border-radius: 28px; cursor: pointer; -webkit-tap-highlight-color: transparent;
      background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(8,8,24,.42), rgba(8,8,24,0) 100%); color: #fffaf0;
      font-size: 26px; font-weight: 400; font-synthesis: none; line-height: 56px; letter-spacing: .4em; text-indent: .4em;
      text-shadow: 0 0 12px rgba(255,233,176,.35), 0 1px 4px rgba(8,8,24,.85); animation: cStartGlow 2.8s ease-in-out infinite; transition: background .2s ease, transform .12s ease; }
    #gate.sunTitle .sunStart::before, #gate.sunTitle .sunStart::after { content: ''; position: absolute; top: 50%; width: 44px; height: 1px; background: linear-gradient(90deg, rgba(240,222,170,0), rgba(240,222,170,.8)); }
    #gate.sunTitle .sunStart::before { left: 16px; } #gate.sunTitle .sunStart::after { right: 16px; transform: scaleX(-1); }
    #gate.sunTitle .sunStart:hover { background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,246,220,.12), rgba(8,8,24,.25) 60%, rgba(8,8,24,0) 100%); }
    #gate.sunTitle .sunStart:active, #gate.sunTitle .sunStart.press { background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,246,220,.24), rgba(255,246,220,0) 100%); transform: scale(.97); animation: none; }
    @keyframes cStartGlow { 0%, 100% { text-shadow: 0 0 8px rgba(255,233,176,.2), 0 1px 4px rgba(8,8,24,.85); } 50% { text-shadow: 0 0 16px rgba(255,233,176,.55), 0 1px 4px rgba(8,8,24,.85); } }
    /* 音のオン・オフ：右上のすみ。44×44px の丸、線 1px。オフは全体をうすく（アイコンは × つき） */
    #gate.sunTitle .sunSound { position: fixed; top: calc(14px + env(safe-area-inset-top)); right: calc(14px + env(safe-area-inset-right)); margin: 0; width: 44px; height: 44px; padding: 0; border-radius: 50%; cursor: pointer;
      border: 1px solid rgba(251,246,230,.34); background: rgba(8,8,24,.24); color: rgba(251,246,230,.92); transition: background .2s ease, opacity .2s ease, transform .12s ease; -webkit-tap-highlight-color: transparent; }
    #gate.sunTitle .sunSound svg { display: block; width: 20px; height: 20px; margin: auto; filter: drop-shadow(0 1px 3px rgba(8,8,24,.8)); }
    #gate.sunTitle .sunSound svg path { stroke-width: 1.3; }
    #gate.sunTitle .sunSound .off { display: none; } #gate.sunTitle .sunSound.muted .on { display: none; } #gate.sunTitle .sunSound.muted .off { display: block; }
    #gate.sunTitle .sunSound.muted { opacity: .6; border-color: rgba(251,246,230,.22); }
    #gate.sunTitle .sunSound:hover { background: rgba(255,248,230,.12); }
    #gate.sunTitle .sunSound:active, #gate.sunTitle .sunSound.press { background: rgba(255,248,230,.2); transform: scale(.94); }
    /* 字（ui_c_fonts.css）：言語ボタンは、そのボタンの言語の字。Start は "Ohisama C Title en" */
    #gate.sunTitle .sunLangs [data-lang="ja"] { font-family: "Ohisama C Title ja", "Yu Mincho", serif; }
    #gate.sunTitle .sunLangs [data-lang="en"] { font-family: "Ohisama C Title en", Georgia, serif; }
    #gate.sunTitle .sunLangs [data-lang="zh"] { font-family: "Ohisama C Title zh", "SimSun", serif; }
    #gate.sunTitle .sunLangs [data-lang="ko"] { font-family: "Ohisama C Title ko", "Batang", serif; }
    #gate.sunTitle .sunStart { font-family: "Ohisama C Title en", Georgia, serif; }
    /* スマホの縦画面：4 つを 1 列のまま少しせまく */
    @media (orientation: portrait) {
      #gate.sunTitle .sunLangs { gap: 0; }
      #gate.sunTitle .sunLangs button { min-width: 76px; padding: 0 6px; font-size: 17px; letter-spacing: .06em; text-indent: .06em; }
      #gate.sunTitle .sunStart { width: 240px; height: 52px; line-height: 52px; font-size: 24px; margin-top: 16px; }
      #gate.sunTitle .sunStart::before { left: 12px; } #gate.sunTitle .sunStart::after { right: 12px; }
      #gate.sunTitle .sunStart::before, #gate.sunTitle .sunStart::after { width: 36px; }
    }
    #gate.sunTitle .sunBot { zoom: 1 !important; }      /* 大きさは C の値のまま（前の --k の倍率は使わない） */
    body.sun-title #viewBtn, body.sun-title #soundBtn, body.sun-title #sunTask, body.sun-title #sunUI, body.sun-title #sunVig { visibility: hidden !important; }
    #gate.sunTitle::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(rgba(6,10,34,.32), rgba(6,10,34,0) 34%, rgba(6,10,34,0) 58%, rgba(6,10,34,.5)); }
    #gate.sunTitle .sunBgs, #gate.sunTitle .sunTop { display: none !important; }
    #gate.sunTitle .sunBox { width: 100% !important; margin-left: 0 !important; align-self: stretch; justify-content: space-between !important; box-sizing: border-box; padding: 11vh 0 6vh !important; }
    .sunLogo { display: block; height: 8.6vw; max-height: 22vh; width: auto; max-width: 92vw; object-fit: contain; opacity: 0; transition: opacity 2.4s ease .4s; pointer-events: none; user-select: none; }
    .sunLogo.on { opacity: 1; }
    @media (orientation: portrait) { .sunLogo { height: 13.7vw; } }
    /* Start のあと：静かに黒へ（オープニングの最初の真っ暗につなぐ）。2 回目からは、黒から花の丘へもどる */
    #sunFade { position: fixed; inset: 0; z-index: 19; background: #000; opacity: 0; pointer-events: none; transition: opacity 1.6s ease; } body.shot #sunFade { display: none; }
    /* さいごの「END」（UI 案 C・ロゴ F の感じ）：細い筆の字・広い字間・白から淡い金・かすかな光。ふち・板なし。まん中より少し下。4 言語とも同じ */
    #sunEnd { position: fixed; left: 0; right: 0; top: 57%; z-index: 18; text-align: center; pointer-events: none; opacity: 0; transition: opacity 2.6s ease; }
    #sunEnd span { display: inline-block; padding-left: .62em; font: 400 clamp(30px, 5.2vw, 52px)/1.2 "Ohisama C Title en", Georgia, serif; letter-spacing: .62em; color: #fff8e4;
      background: linear-gradient(180deg, #ffffff 15%, #fff3d2 55%, #f3dc9c 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 1px 12px rgba(24,36,44,.4)) drop-shadow(0 0 10px rgba(255,236,180,.45)) drop-shadow(0 0 26px rgba(255,226,150,.22)); }      /* いちばん前の影：明るい景色の上でも字が沈まないように、ごく淡く */
    #sunEnd.show { opacity: 1; } body.shot #sunEnd { display: none; }
    /* 暗い世界の「ぼんやり」：四すみを暗く落とす（まん中は、ごくうすい青黒さ）。--v ＝ 暗さ 0〜1。どのページにも */
    #sunVig { position: fixed; inset: 0; z-index: 3; pointer-events: none; opacity: var(--v, 0); background: radial-gradient(ellipse 78% 74% at 50% 54%, rgba(10,16,44,.06) 0%, rgba(8,12,36,.16) 52%, rgba(4,7,24,.6) 100%); } body.shot #sunVig { display: none; }
    /* 今やること（左上に 1 行）。枠や下地の板はなし ＝ 文字だけ（暗い紺のふちどりと影で、明るい世界でも暗い世界でも読める）。上まん中の太陽マークと重ならないよう、幅のせまい画面ではマークの下の段に出す */
    #sunTask { position: fixed; left: calc(28px + env(safe-area-inset-left)); top: calc(26px + env(safe-area-inset-top)); z-index: 6; display: flex; align-items: center; gap: 12px; height: 24px;
      color: #f6f0e0; font-size: 16px; font-weight: 400; font-synthesis: none; line-height: 1; letter-spacing: .12em; white-space: nowrap; pointer-events: none;
      text-shadow: 0 0 8px rgba(8,8,24,.8), 0 1px 2px rgba(8,8,24,.9); opacity: 0; transform: translateY(-6px); transition: opacity .4s ease, transform .4s ease; }
    #sunTask.show { opacity: 1; transform: none; }
    #sunTask i { flex: none; width: 1px; height: 20px; background: linear-gradient(transparent, #f0deaa 30%, #f0deaa 70%, transparent); box-shadow: 0 0 6px rgba(240,222,170,.7); transform-origin: 50% 100%; }
    #sunTask.new i { animation: sunTaskLine .6s ease-out, sunTaskGlow 1.2s ease-out; }      /* 新しいやること：線が下から上へのびて、光が 1 回強まる */
    @keyframes sunTaskLine { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    @keyframes sunTaskGlow { 0%, 100% { box-shadow: 0 0 6px rgba(240,222,170,.7); } 45% { box-shadow: 0 0 14px rgba(240,222,170,1), 0 0 4px #fffaf0; } }
    @media (orientation: portrait) { #sunTask { left: calc(18px + env(safe-area-inset-left)); top: calc(84px + env(safe-area-inset-top)); font-size: 15px; letter-spacing: .08em; gap: 10px; } #sunTask i { height: 18px; } }
    body.shot #sunTask { display: none; }
    #sunTask b { font-weight: inherit; display: inline-block; }      /* 集めた数（1 のやることだけ）。増えたら、数字だけ静かに光って、ふわっと入れかわる */
    #sunTask b.bump { animation: sunCntIn .9s ease-out, sunCntGlow 1.6s ease-out; }
    @keyframes sunCntIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: none; } }
    @keyframes sunCntGlow { 0%, 100% { color: inherit; text-shadow: none; } 35% { color: #ffe9b0; text-shadow: 0 0 8px rgba(255,226,150,.9), 0 0 2px #fffaf0; } }
    #sunLids { position: fixed; left: 0; top: 0; width: 100%; height: 100%; z-index: 4; pointer-events: none; display: none; } body.shot #sunLids { display: none !important; }
    #gate.sunTitle { gap: 0; cursor: default; background: linear-gradient(#0a1034, #1c2a62 62%, #33407a); overflow: hidden; }      /* 絵を読みこむ前・読めなかったときは、この紺色 */
    /* 背景：3 つのエリアの絵（title_bg/）を、ゆっくり入れかえる。絵は少しずつ寄りながら横へ流れる。上に、文字とボタンを読みやすくする うすい暗さ */
    .sunBgs { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
    .sunBgs i { position: absolute; inset: -4%; background-size: cover; background-position: 50% 50%; opacity: 0; transition: opacity 1.8s ease; }
    .sunBgs i.on { opacity: 1; } .sunBgs i.mv { animation: sunKb 9s linear forwards; }
    @keyframes sunKb { from { transform: scale(1) translateX(-1.2%); } to { transform: scale(1.07) translateX(1.2%); } }
    .sunBgs::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(6,10,34,.84), rgba(6,10,34,.6) 36%, rgba(6,10,34,0) 62%); }
    @media (orientation: portrait) { .sunBgs::after { background: linear-gradient(rgba(6,10,34,.78), rgba(6,10,34,0) 34%, rgba(6,10,34,0) 50%, rgba(6,10,34,.84) 78%); } }
    /* ならべ方：横長の画面 ＝ 左半分にまとめる（絵の主役は右）。縦長の画面 ＝ タイトルは上、ボタンは下（絵の主役はまん中） */
    .sunBox { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; align-self: flex-start; width: 50%; height: 100%; margin-left: var(--pad, 0px); }
    .sunTop, .sunBot { display: flex; flex-direction: column; align-items: center; zoom: var(--k, 1); }
    @media (orientation: portrait) { .sunBox { width: 100%; justify-content: space-between; box-sizing: border-box; padding: 5vh 0 4.5vh; } .sunBox .sunMark { width: 72px !important; height: 72px !important; } #gate .sunBox h1 { margin: 10px 0 0 !important; } }
    .sunLangs.two { grid-template-columns: repeat(2, 140px) !important; }
    #gate .sunBox h1 { text-shadow: 0 2px 14px rgba(4,8,30,.9); }
    .sunBox .sunMark { width: 96px; height: 96px; } .sunBox .sunMark svg { display: block; width: 100%; height: 100%; overflow: visible; animation: none; filter: none; }
    #gate .sunBox h1 { margin: 16px 0 24px; padding: 0 12px; font-size: var(--fs, 30px); line-height: 1.5; letter-spacing: .08em; text-indent: 0; font-weight: 700; color: #fffdf2; white-space: nowrap; }
    .sunLangs { display: grid; grid-template-columns: repeat(4, 124px); gap: 10px; }
    @media (orientation: portrait) { .sunLangs { grid-template-columns: repeat(2, 140px); } }
    .sunBox.short .sunMark { width: 54px; height: 54px; } #gate .sunBox.short h1 { margin: 4px 0 10px; } .sunBox.short .sunSound { margin-top: 12px; width: 46px; height: 46px; } .sunBox.short .sunStart { margin-top: 12px; height: 48px; }
    .sunLangs button { height: 46px; padding: 0; border-radius: 23px; border: 1.5px solid rgba(255,255,255,.45); background: rgba(255,255,255,.08); color: #fff; font: 600 18px/1 system-ui, sans-serif; cursor: pointer; }
    .sunLangs button.on { background: #ffe08a; color: #2a2140; border-color: #fff3c4; }
    .sunSound { margin-top: 20px; width: 52px; height: 52px; padding: 0; border-radius: 50%; border: 1.5px solid #fff3c4; background: #ffe08a; color: #2a2140; cursor: pointer; }
    .sunSound svg { display: block; width: 26px; height: 26px; margin: auto; animation: none !important; filter: none !important; } .sunSound .off { display: none; }
    .sunSound.muted { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.45); color: rgba(255,255,255,.7); } .sunSound.muted .on { display: none; } .sunSound.muted .off { display: block; }
    .sunStart { margin-top: 20px; width: 210px; height: 56px; padding: 0; border-radius: 28px; border: 1.5px solid #fff; background: rgba(255,255,255,.16); color: #fff; font: 700 22px/1 ${TITLE_FONT}, system-ui, sans-serif; letter-spacing: .12em; cursor: pointer; }`;
  document.head.append(css);
  // かけら 1 つの形（まん中から、ぎざぎざのわれ目 → 円のふち → われ目）。g ＝ すき間（そろうと 0）
  const piecePath = (a0, R = 22) => { const pt = (r, a) => `${(r * Math.cos(a * D2R)).toFixed(2)} ${(-r * Math.sin(a * D2R)).toFixed(2)}`;
    return `M0 0L${pt(R * 0.5, a0 + 13)}L${pt(R, a0)}A${R} ${R} 0 0 0 ${pt(R, a0 + 120)}L${pt(R * 0.5, a0 + 133)}Z`; };
  // on：{ ruins, mushroom, cave }。only：そのかけらだけ描く。id：1 つのページに何個も置くときの名前
  //   UI 案 C：まだのかけら ＝ 細い淡い線だけ / 集めたかけら ＝ 淡い金 / 外に、上に小さなすき間のある筆の円（only のとき ＝ 飛んでくるかけらは、円なし）
  function sunSVG(on, { full = false, only = null, id = 'a', size = 60 } = {}) {
    const g = full ? 0 : 1.9;
    const body = PIECES.filter((p) => !only || p.name === only).map((p) => {
      const b = (p.a0 + 60) * D2R, tr = `translate(${(g * Math.cos(b)).toFixed(2)} ${(-g * Math.sin(b)).toFixed(2)})`, d = piecePath(p.a0);
      return on[p.name]
        ? `<path class="on" d="${d}" transform="${tr}" fill="url(#sg${id})" stroke="rgba(255,248,226,.9)" stroke-width=".6" stroke-linejoin="round" filter="url(#sf${id})"/>`
        : `<path d="${d}" transform="${tr}" fill="rgba(200,214,255,.05)" stroke="rgba(246,236,210,.74)" stroke-width="1.2" stroke-linejoin="round" style="filter: drop-shadow(0 0 2px rgba(6,10,30,.9))"/>`;
    }).join('');
    const ring = only ? '' : '<path d="M -8.6 -28.2 A 29.5 29.5 0 1 0 6.5 -28.8" stroke="rgba(240,222,170,.42)" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M 6.5 -28.8 q 4 1 6.5 3" stroke="rgba(240,222,170,.25)" stroke-width=".8" stroke-linecap="round" fill="none"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-34 -34 68 68" width="${size}" height="${size}"><defs>
      <radialGradient id="sg${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="24"><stop offset="0" stop-color="#fffdf4"/><stop offset=".6" stop-color="#f3e2b0"/><stop offset="1" stop-color="#d9b46a"/></radialGradient>
      <filter id="sf${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      ${full ? '<circle r="27" fill="rgba(255,226,160,.12)"/>' : ''}${ring}${body}</svg>`;
  }
  const uiEl = document.createElement('div'); uiEl.id = 'sunUI'; document.body.append(uiEl);
  const ui = { on: pieces(), full: false, busy: 0 };
  ui.full = allOf(ui.on);
  const drawUI = () => { uiEl.innerHTML = sunSVG(ui.on, { full: ui.full }); uiEl.classList.toggle('full', ui.full); };
  const showUI = (b) => uiEl.classList.toggle('show', b);
  drawUI();
  const slot = () => { const r = uiEl.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function flash(k = 1) {
    const [x, y] = slot(), f = document.createElement('div'); f.className = 'sunFlash'; document.body.append(f);
    f.animate([{ transform: `translate(${x - 30}px, ${y - 30}px) scale(.5)`, opacity: 0.95 }, { transform: `translate(${x - 30}px, ${y - 30}px) scale(${3.2 * k})`, opacity: 0 }], { duration: 650 * k, easing: 'ease-out' }).onfinish = () => f.remove();
  }
  // ---- かけらが、画面の (x, y)（エルフの手元）から、上の太陽マークの「そのかけらの場所」へ、尾を引いて飛んでいき、カチッとはまる（FLY.ms ミリ秒）。はまってから、UI を「集めた」に変える
  //   出だしは、魔法陣の 3D のかけらと同じ見た目（金色のひし形の結晶 ＋ にじむ光）・同じ場所・同じ大きさ（size ＝ 結晶の見かけの高さ px）。フェードインも、はじける光もなし。
  //   飛びながら、ひし形が太陽マークのくさび形へ入れかわり、向きと大きさを合わせて、はまる
  const FLY = { ms: 1300, dots: 6, lag: 0.05, gemH: 40, size: 34, morph: [0.18, 0.6], rot: -150, glow: 3.2 };      // 時間・尾の光の数・尾のおくれ・ひし形の絵の高さ（60 px の絵の中）・size がないときの大きさ・くさび形へ入れかわる間（0〜1）・くさび形のはじめのかたむき・にじむ光の大きさ（結晶の何倍）
  const GEM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 60 60" width="60" height="60"><path d="M0 -20L12 0L0 20L-12 0Z" fill="#fff0c2"/><path d="M0 -20L12 0L0 20Z" fill="#ffe7a8"/><path d="M0 -20L-12 0L0 0Z" fill="#fff9e4"/></svg>';
  const ease = (k) => { k = clamp(k, 0, 1); return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k); };
  // 道すじ（k：0〜1）：ゆっくり出て、ふくらんだ弧をえがき、すっと入る。返すのは { x, y, sc（60 px の絵にかける倍率）, rot（くさび形のかたむき）, gem（ひし形のこさ）, wedge（くさび形のこさ）, glow（にじむ光のこさ）}
  function flyAt(k, x0, y0, tx, ty, size = FLY.size) {
    const e = ease(k), dx = tx - x0, dy = ty - y0, cx = (x0 + tx) / 2 - dy * 0.24, cy = (y0 + ty) / 2 + dx * 0.24, a = (1 - e) * (1 - e), b = 2 * e * (1 - e), c = e * e, m = sstep(clamp(k, 0, 1), FLY.morph[0], FLY.morph[1]);
    return { x: a * x0 + b * cx + c * tx, y: a * y0 + b * cy + c * ty, sc: lerp(size / FLY.gemH, UIS, e), rot: FLY.rot * (1 - e), gem: 1 - m, wedge: m, glow: lerp(0.75, 0.35, e) };
  }
  const flying = {};                                                // 今、飛んでいるかけら（二重に飛ばさない）
  function flyPiece(name, from, size) {
    snd.pickup();                                                   // かけらを拾う（手元から飛び立つ）
    if (ui.on[name] || flying[name]) return; if (openWait[name]) openWait[name]();
    size = Number.isFinite(size) && size > 4 ? clamp(size, 8, 160) : FLY.size;
    const [tx, ty] = slot(), [x, y] = from || [window.innerWidth / 2, window.innerHeight * 0.62], N = 16, els = [];
    const fr = (lag, f) => Array.from({ length: N + 1 }, (_, i) => f(flyAt(i / N - lag, x, y, tx, ty, size), i / N));
    const el = document.createElement('div'); el.className = 'sunFly'; els.push(el);
    el.innerHTML = `<div class="glow"></div><div class="gem">${GEM_SVG}</div><div class="wedge">${sunSVG({ [name]: true }, { only: name, id: `f${name}` })}</div>`;
    const [glow, gem, wedge] = el.children, opt = { duration: FLY.ms, fill: 'both' };
    flying[name] = { el, from: [x, y], to: [tx, ty], size, t0: performance.now() }; ui.busy++;
    for (let d = FLY.dots; d >= 1; d--) {                              // 尾：かけらの少しあとを追う、だんだん小さい光（出だしは見えない）
      const dot = document.createElement('div'); dot.className = 'sunDot'; els.push(dot); document.body.append(dot);
      dot.animate(fr(d * FLY.lag, (q, u) => ({ transform: `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) scale(${(1.3 - d * 0.15).toFixed(2)})`, opacity: (u < 0.12 ? u / 0.12 : u > 0.9 ? (1 - u) / 0.1 : 1) * (0.9 - d * 0.11) })), opt);
    }
    document.body.append(el);
    glow.animate(fr(0, (q) => ({ transform: `scale(${(FLY.glow * FLY.gemH / 60).toFixed(2)})`, opacity: q.glow })), opt);
    gem.animate(fr(0, (q) => ({ opacity: q.gem })), opt);
    wedge.animate(fr(0, (q) => ({ opacity: q.wedge, transform: `rotate(${q.rot.toFixed(1)}deg)` })), opt);
    el.animate(fr(0, (q) => ({ transform: `translate(${(q.x - 30).toFixed(1)}px, ${(q.y - 30).toFixed(1)}px) scale(${q.sc.toFixed(3)})` })), opt).onfinish = () => {
      for (const n of els) n.remove(); ui.busy--; flying[name] = null; ui.on[name] = true; drawUI(); refreshBeams();
      const s0 = ui.full ? 1.15 : 1;                                   // はまった：太陽マークが少しふくらんで光る ＋ 短い音
      uiEl.animate([{ transform: `scale(${s0})` }, { transform: `scale(${s0 * 1.24})`, offset: 0.3 }, { transform: `scale(${s0})` }], { duration: 420, easing: 'ease-out' });
      flash(); snd.later('set');
      if (allOf(ui.on) && !ui.full) setTimeout(complete, 1100);
    };
  }
  // 3 つそろった：丸い太陽のしるしになって強く光る → 妖精「かけらがそろった！ 最初の丘にもどろう！」（1 回だけ）。エンディング（かけらを空へ解き放つ）は、自分で歩いて丘の上にもどると始まる
  function complete() {
    ui.full = true; drawUI(); flash(1.8); snd.later('full'); hillHome();
    say.need = !st.ended && store.get(SUN_SAID_KEY) !== '1'; say.wait = 0;      // ひとことは sayTick が出す（「言った」しるしは、言い終わったときに付ける）
  }

  // ================================================================ 音（Web Audio で合成。エリアの音とは別の出口）
  // ================================================================ 音（Suno で作った音のファイル。assets/audio/。前の Web Audio の合成音はやめた）
  //   BGM：explore（暗い世界の探索。ループ 37.2〜91.4 秒）・ending（エンディング。95 秒。29 秒から盛り上がり、58 秒が山）
  //   環境音：hill（昼の丘）・dark（暗い世界）・cave（水晶の洞くつ）。どれもループ / 効果音：rumble（地鳴り）・shatter（太陽が割れる）・pickup（かけらを拾う）・fairy（妖精がそばに来る・飛び立つ）
  //   タイトル画面は無音（Start のあとから鳴らす）。大きさは控えめ（VOL）。音のオン・オフは area_kit.js の音のボタン（G.audio.isMuted）にそろえる
  //   ★ まだ音がない所（来月 Suno で足す）：snd.later('名前') を呼んでいる所。今は何も鳴らさない（下の LATER の一覧）
  const snd = (() => {
    const DIR = './assets/audio/';
    const FILES = { explore: ['sun_bgm_explore.mp3', 37.2, 91.4], ending: ['sun_bgm_ending.mp3'], hill: ['sun_amb_hill.mp3', 0.5, 41.1052], dark: ['sun_amb_dark.mp3', 0.5, 44.639], cave: ['sun_amb_cave.mp3', 0.5, 40.5931],
      rumble: ['sun_sfx_rumble.mp3'], shatter: ['sun_sfx_shatter.mp3'], pickup: ['sun_sfx_pickup.mp3'], fairy: ['sun_sfx_fairy.mp3'] };
    const VOL = { bgm: 0.3, amb: 0.4, rumble: 0.6, shatter: 0.5, pickup: 0.5, fairy: 0.26 };
    const LATER = ['voice（セリフの声）', 'next（セリフ送り）', 'start（Start）', 'crack（太陽のひび）', 'fly（かけらが飛ぶ）', 'land（かけらが森に落ちる）', 'pillar（光の柱が立つ）', 'set（かけらが印におさまる）', 'full（3 つそろう）', 'circle（魔法陣）', 'merge（かけらが 1 つになる）', 'bloom（花が開く）'];
    const POS_KEY = 'sunGame_bgmPos';                                 // エリアを移るとき：BGM のどこまで鳴ったか（次のページで、そこから続ける）
    let ctx = null, master = null, lastFairy = -99; const bus = {}, buf = {}, loading = {}, cur = { bgm: null, amb: null }, want = { bgm: null, amb: null }, log = [];
    const now = () => (ctx ? ctx.currentTime : 0);
    const note = (what) => { log.push([+(performance.now() / 1000).toFixed(2), what]); if (log.length > 80) log.shift(); };
    function load(k) {
      if (!ctx || buf[k] || loading[k]) return;
      loading[k] = fetch(DIR + FILES[k][0]).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((d) => { buf[k] = d; apply(); }).catch(() => { note(`load failed ${k}`); });
    }
    const loopPos = (f, d, off) => (f[2] && off > f[2] ? f[1] + (off - f[1]) % (f[2] - f[1]) : Math.min(Math.max(off, 0), d.duration - 0.05));
    function stopLayer(c, fade) { if (!c) return; const t = now(); c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0.0001, t + Math.max(fade, 0.05)); try { c.s.stop(t + Math.max(fade, 0.05) + 0.1); } catch (e) {} }
    function apply() {                                                // ほしい状態（want）に合わせる。ファイルがまだ読めていなければ、読めたときにもう一度
      if (!ctx) return;
      for (const layer of ['bgm', 'amb']) {
        const w = want[layer], c = cur[layer];
        if (!w) { if (c) { stopLayer(c, c.outFade || 2); cur[layer] = null; } continue; }
        if (c && c.key === w.key && c.id === w.id) { continue; }
        if (c && c.key === w.key && !w.restart) { c.id = w.id; const t = now(); c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(Math.max(VOL[layer] * w.vol, 0.0001), t + w.fade); continue; }
        const d = buf[w.key]; if (!d) { load(w.key); continue; }
        if (c) stopLayer(c, w.fade);
        const f = FILES[w.key], src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = d; if (f[2]) { src.loop = true; src.loopStart = f[1]; src.loopEnd = f[2]; }
        const t = now(), late = (performance.now() - w.at) / 1000, off = loopPos(f, d, w.offset + late);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(VOL[layer] * w.vol, 0.0001), t + w.fade); src.connect(g).connect(bus[layer]); src.start(t, off);
        cur[layer] = { key: w.key, id: w.id, s: src, g, t0: t - off }; note(`${layer} ${w.key} @${off.toFixed(1)}s fade ${w.fade}s`);
      }
    }
    let wid = 0;
    const set = (layer, key, o = {}) => { want[layer] = key ? { key, id: ++wid, fade: o.fade ?? 2, vol: o.vol ?? 1, offset: o.offset ?? 0, restart: !!o.restart, at: performance.now() } : null; if (!key && cur[layer]) cur[layer].outFade = o.fade ?? 2; apply(); };
    function sfx(k, vol = 1) { if (!ctx || ctx.state !== 'running') return; const d = buf[k]; if (!d) { load(k); return; } const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = d; g.gain.value = VOL[k] * vol; src.connect(g).connect(bus.sfx); src.start(now() + 0.01); note(`sfx ${k}`); }
    const darkAmb = () => (area === 'cave' ? 'cave' : 'dark');
    return {
      get ready() { return !!ctx && ctx.state === 'running'; }, LATER, log: () => log.slice(),
      unlock() {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
          for (const k of ['bgm', 'amb', 'sfx']) { bus[k] = ctx.createGain(); bus[k].connect(master); }
          for (const k of Object.keys(FILES)) load(k);              // 先に全部読んでおく（どれも小さい）
        }
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
      },
      mute(b) { if (master) master.gain.setTargetAtTime(b ? 0 : 0.8, now(), 0.08); },
      // ---- 場面ごと
      hill(fade = 2) { set('amb', 'hill', { fade }); },              // 昼の丘（オープニング・エンディングのあと）
      night(on = true) {                                              // 暗い世界：環境音（洞くつは洞くつの音）＋ 探索の BGM（静かにフェードイン。エリアを移ってきたときは、前のページの続きから短いフェードで）
        if (!on) { set('amb', 'hill', { fade: 6 }); return; }
        let p = null; try { p = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null'); } catch (e) {}
        const cont = p && p.key === 'explore' && Date.now() - p.t < 30000;
        set('amb', darkAmb(), { fade: cont ? 1.2 : 4 });
        if (!cur.bgm || cur.bgm.key !== 'explore') set('bgm', 'explore', cont ? { fade: 1.5, offset: p.pos + (Date.now() - p.t) / 1000 } : { fade: 10, offset: 0 });
      },
      quake() { if (want.amb) set('amb', want.amb.key, { fade: 1, vol: 0.35 }); },      // 地面がゆれる：丘の環境音を小さく（風が止まる）
      shatterOut() { set('amb', null, { fade: 1.5 }); },               // 太陽が割れた：昼の環境音を消す（このあと暗い世界の音）
      endingBgm(peakIn) {                                             // エンディングの曲：探索の BGM を消して、曲の山（58 秒）が peakIn 秒後に来る所から
        set('bgm', 'ending', { fade: 2.5, offset: Math.max(0, 58 - peakIn), restart: true });
      },
      fadeBgm(sec) { set('bgm', null, { fade: sec }); },
      save() { const c = cur.bgm; if (!c || !ctx) return; try { sessionStorage.setItem(POS_KEY, JSON.stringify({ key: c.key, pos: ctx.currentTime - c.t0, t: Date.now() })); } catch (e) {} },
      // ---- 効果音
      rumble() { sfx('rumble'); },
      shatter() { sfx('shatter'); },
      pickup() { sfx('pickup'); },
      fairyFx(gap = 4) { const t = performance.now() / 1000; if (t - lastFairy < gap) return; lastFairy = t; sfx('fairy'); },      // 妖精がそばに来る・飛び立つ（4 秒以内には重ねない）
      // ---- まだ音がない所（何も鳴らさない）
      later() {},
      // 前の合成音の名前（呼んでいる所が残っていても、何も鳴らさない）
      fairy() {}, sparkle() {}, whoosh() {}, land() {}, click() {}, full() {}, dawn() {}, tick() {},
    };
  })();
  window.addEventListener('pagehide', () => snd.save());
  const firstTouch = () => snd.unlock();
  window.addEventListener('pointerdown', firstTouch, true); window.addEventListener('keydown', firstTouch, true);

  // ================================================================ エリアを移る（area_kit.js の createTravel と同じ形の URL。フェードの板 #areaFade を使う）
  function go(url, from) {
    if (st.going) return; st.going = true; controls.lock(true);
    const f = document.getElementById('areaFade'); if (f) f.classList.add('on');
    const q = new URLSearchParams(); for (const k of ['lite', 'wc', 'debug']) if (Q0.has(k)) q.set(k, Q0.get(k));
    q.set('game', 'sun'); q.set('from', from); if (walker.mode === 'fp') q.set('view', 'fp'); if (isDark()) q.set('time', 'night');
    snd.save(); setTimeout(() => { location.href = `${url}?${q}`; }, 560);
  }
  const isDark = () => st.started && !st.ended;

  // ================================================================ 暗い世界（どのエリアも）：area_kit.js の昼と夜のしくみに、0〜1 の値を入れる
  let nightV = -1;
  function setNight(x) {
    x = clamp(x, 0, 1); if (!dayNight || (x === nightV && (x <= 0 || x >= 1))) return; nightV = x;      // とちゅうの値は、毎フレーム入れなおす（昼と夜のしくみが、自分で夜へ進めてしまうため）
    if (x >= 1) dayNight.set(true, true);
    else { dayNight.set(false, true); if (x > 0) { dayNight.set(true); dayNight.update(x * dayNight.night.secs); } }
    hillDark(x);
  }

  // ================================================================ 暗い世界の「ぼんやり」（花の丘と森のページ）：四すみを暗く落とす板。暗さ（nightV）に合わせて出す。全画面のぼかしは使わない
  const vigEl = document.createElement('div');                       // どのページにも（暗い世界のときだけ出る）
  { vigEl.id = 'sunVig'; document.body.append(vigEl); }
  const VIG = { stops: [[0, 'rgba(10,16,44,.06)'], [0.52, 'rgba(8,12,36,.16)'], [1, 'rgba(4,7,24,.6)']], rx: 0.78, ry: 0.74, cy: 0.54 };      // 確認画像用に、CSS と同じ数値
  let vigV = -1; const vigTick = () => { if (!vigEl) return; const v = nightV >= 0 ? nightV : isDark() ? 1 : 0; if (Math.abs(v - vigV) > 0.004) { vigV = v; vigEl.style.setProperty('--v', v.toFixed(3)); } };
  function drawVig(g, x, y, w, h, v) {
    if (!vigEl || v <= 0.01) return; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x + w / 2, y + h * VIG.cy); g.scale(w * VIG.rx, h * VIG.ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, c] of VIG.stops) gr.addColorStop(o, c); g.globalAlpha = v; g.fillStyle = gr; g.fillRect(-2, -2, 4, 4); g.restore();
  }

  // ================================================================ 光のすじ：森の 3 つの入り口の先に 1 本ずつ（集めたかけらのぶんは消える）。花の丘・森のページだけ。3 つのエリアの中では出さない
  const REF = isHill ? [G.trailX(-50), -50] : [player.x, player.z];                 // 向きを測るもとの場所（花の丘 ＝ エルフが立つ所）
  const gateList = (G.gates || []).filter((g) => GATE_NAME[g.name] && Number.isFinite(g.x) && Number.isFinite(g.z));
  const SHARDS = !(isHill || area === 'forest') ? [] : ['cave', 'ruins', 'mushroom'].map((name) => {
    const g = gateList.find((gt) => GATE_NAME[gt.name] === name);
    if (g) { let dx = g.x - REF[0], dz = g.z - REF[1]; const dl = Math.hypot(dx, dz) || 1; if (g.d) { dx = g.d[0]; dz = g.d[1]; } else { dx /= dl; dz /= dl; }      // 入り口の先（入っていく向きへ GATE_FAR m）
      return { name, p2: V3(g.x + dx * GATE_FAR, isHill ? 6 : 0, g.z + dz * GATE_FAR), p1: V3(0, 0, 0) }; }
    if (!isHill) return null;
    const [az, dist] = FALLBACK[name]; return { name, p2: V3(REF[0] + Math.sin(az * D2R) * dist, 6, REF[1] + Math.cos(az * D2R) * dist), p1: V3(0, 0, 0) };
  }).filter(Boolean);
  // 始まりの演出の時間（秒）：木にもたれて寝ている → 起きる → 妖精「ひびが入ってるみたい」（風が止まり、光がゆらぎ、2 人で見上げる）→ 太陽がわれて、かけらが飛ぶ
  //   → 夜になり、大きく引く（花がつぼみになる。かけらの光だけが残る）→ 妖精「集めにいこう」→ 操作開始
  // 始まりの演出の時間（秒）：真っ暗 → 妖精の声 talkA → 目を開ける（1 人称。まぶた・ぼやけ）→ 目の前の妖精 talkB → 立ち上がる（wake）→ 1 人称から後ろ・上へ抜けて引く（pull）
  //   → 操作開始：妖精についていく（follow。丘の上の木から、森の手前まで）→ 地面がゆれる・こわい音・少しかげる → エルフがきょろきょろ → 空を見上げて、気づく → 太陽にひび → われて、かけらが飛ぶ
  //   → 真っ暗になり、大きく引く（花がつぼみになる）→ 妖精 talk2「集めにいこう」→ 操作開始
  // 間の取り方：1 つの時点で始まることは 1 つ。「動きが落ちつく → ひと呼吸（0.6 秒前後）→ セリフ」。押して送ったあとは「ふきだしが消える（0.35 秒）→ ひと呼吸 → 次の動き」
  //   セリフの [出はじめ, 押して送ったあとに進む先]。押すのを待つ所（hold）は LINES。follow から先は、ついていく場面のあと（Q ＝ follow）
  const TL = { talkA: [1.4, 3.4],                                    // 最初の画面が消えきってから（0.9 秒）→ ひと呼吸 →「いつまで寝てるの？」
    open: [4.2, 7.4],                                                // 目を開ける（ゆっくり。まばたき 2 回。ぼやけは 7.8 まで）
    talkB: [8.4, 10.0],                                              // はっきり見えて、ひと呼吸 →「もうお昼だよ」
    wake: [10.6, 14.6], pull: [14.9, 18.9],                          // 立ち上がる（4 秒）→ カメラが引く（4 秒）
    talkH: [19.5, 20.9],                                             // 引ききって、ひと呼吸 →「おうちに帰ろう」。押すと、エルフが道のほうを向き、カメラが後ろへ回る（〜 follow）
    follow: 21.7,                                                    // ここで時間を止めて、操作開始（明るい丘で、妖精についていく）。決めた所まで来たら、ここから続きが流れる（Q）
    // ---- Q ＝ follow から先（ついていく場面のあと）。カメラの切りかえは、向きが大きく変わる所だけ（太陽はエルフの後ろ 130° にあるので、回さずに切りかえる）
    look: 25.3,                                                      // Q：ゆれる（3 秒。カメラはそのまま、画面がゆれて かげるだけ）→ ゆれがおさまって、ひと呼吸 → エルフの顔が見える絵（look。切りかえ。カメラは固定）
    turn: [29.6, 30.9],                                              //   きょろきょろ（idle_look 4.2 秒）→ 後ろ（太陽のあるほう）へふり向く（turn）
    notice: 31.0, cut: 32.6, quake: 34.4, crack: 36.8,               //   ふり向いた顔の絵（notice。切りかえ。固定）で空を見上げる（look_up）→ 見上げたまま、視線の先の太陽の絵（cut。切りかえ。固定）→ ふつうの太陽の「静かな間」1.8 秒 → ひびが 3 本（quake）→ われる（crack）
    dark: [37.0, 38.2],                                              // われたら、すぐ真っ暗（1.2 秒）。われた 3 つは、空に残る
    talkC: [39.2, 40.6],                                             // 静けさ 1 秒 →「…太陽が、われちゃった」
    fly0: 41.1, wide: 42.0, fly: 3.5, stagger: 0.35,                 // 送ると、ひと呼吸 → 3 つの光が太陽の所から飛び立つ（fly0）→ 森の向こうまで見わたす高い引きの絵（wide。切りかえ）で、3 つの光が空から落ちてくる（44.6〜45.3 に着く）
    rise: 46.1, riseGap: 1.0,                                        //   着いて、ひと呼吸 → 光の柱が 1 本ずつ立つ（左 → まん中 → 右。1 秒おき。のびきるまで 1.6 秒 ＝ 49.7 に 3 本そろう）
    bud: 51.4, close: [52.4, 55.4], cut2: 56.0,                      // 3 本そろった絵のまま、静かな間（1.7 秒）→ 花に寄った低い絵（bud。切りかえ）→ 1 秒おいて、花が手前から奥へ順にとじる（3 秒）→ ひと呼吸 → エルフと妖精の絵（cut2。切りかえ。固定）
    panic: [56.3, 58.8], talk2: [56.8, 58.2],                         // 妖精の光がふるえる →「ど、どうしよう…」
    talkE: [59.0, 60.4], nod: [61.0, 62.3], talkF: [62.9, 64.3],      // ひと呼吸 →「エルフの力なら、元に戻せる？」→ 送ると、ひと呼吸 → エルフがうなずく（セリフなし）→「じゃあ、とりあえずかけらを集めようか」
    backCut: 64.8, fairy: { out: [64.8, 66.4] }, end: 66.6 };         // 送ると、ひと呼吸 → いつもの後ろからのカメラ（切りかえ）で、妖精が森のほうへ飛んでいく → 操作開始（やること「太陽のかけらを集める」）
  const shU = { uP0: { value: V3(0, 0, 0) }, uS: U.uS, uT: U.uT, uT0: { value: TL.fly0 }, uDur: { value: TL.fly }, uNear: { value: 0 }, uEase: { value: 1 }, uRise: { value: TL.rise }, uGap: { value: TL.riseGap }, uFat: { value: 1 } };      // uRise・uGap ＝ 光の柱が 1 本ずつ立つ時刻、uFat ＝ 柱の太さ・明るさ（始まりの演出の間だけ太く）      // uNear ＝ 1：エンディング（手元から空へ。近くでは小さく、遠くでは大きく ＝ 見かけの大きさをそろえる）
  const SH_GLSL = `uniform vec3 uP0; uniform float uS, uT, uT0, uDur, uNear, uEase, uRise, uGap, uFat;
    float ease(float p){ return mix(pow(p, 1.5), 1.0 - (1.0 - p) * (1.0 - p), uEase); }
    attribute vec3 iP1, iP2; attribute vec3 iD;
    vec3 bez(float u){ return mix(mix(uP0, iP1, u), mix(iP1, iP2, u), u); }
    float prog(){ return clamp((uS - uT0 - iD.x) / uDur, 0.0, 1.0); }`;
  const iD = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS.flatMap((s, i) => [i * TL.stagger, i * 0.37 + 0.1, 1])), 3);      // ずれ・乱数・出すかどうか
  const inst = (geo) => {
    const g = new THREE.InstancedBufferGeometry(); g.index = geo.index; g.setAttribute('position', geo.attributes.position);
    g.setAttribute('iP1', new THREE.InstancedBufferAttribute(new Float32Array(SHARDS.length * 3), 3)); g.setAttribute('iP2', new THREE.InstancedBufferAttribute(new Float32Array(SHARDS.flatMap((s) => s.p2.toArray())), 3));
    g.setAttribute('iD', iD); g.instanceCount = SHARDS.length; return g;
  };
  const mesh = (geo, mat, name, order) => { const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ ...add, uniforms: shU, side: THREE.DoubleSide, ...mat })); m.frustumCulled = false; m.renderOrder = order; m.name = name; scene.add(m); return m; };
  const beamGeo = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1], 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); return g;
  })();
  // 地平の光（z ＝ 1 の板）と、空へのびる細い光のすじ（z ＝ 0 の板。カメラのほうを向く たての板）。太さは、遠くても近くても同じくらいに見える
  const beams = mesh(inst(beamGeo), {
    vertexShader: `${SH_GLSL} varying vec3 vQ; varying float vA;
      void main(){
        float landT = uT0 + iD.x + uDur, on = smoothstep(landT - 0.05, landT + 0.5, uS) * iD.z, flash = exp(-max(uS - landT, 0.0) * 1.6) * step(landT, uS);
        float rk = gl_InstanceID == 1 ? 0.0 : gl_InstanceID == 0 ? 1.0 : 2.0, riseT = max(uRise + rk * uGap, landT + 0.3);      // 柱の立つ順：遺跡（左）→ 洞窟（まん中）→ きのこ（右）
        float up = smoothstep(riseT - 0.05, riseT + 0.4, uS) * iD.z, flash2 = exp(-max(uS - riseT, 0.0) * 1.1) * step(riseT, uS);
        float dist = length(iP2.xz - cameraPosition.xz), k = clamp(dist / 500.0, 0.25, 1.2);
        vQ = position;
        if (position.z < 0.5) {
          vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), iP2 - cameraPosition));
          vec3 wp = iP2 + vec3(0.0, position.y * 440.0 * smoothstep(riseT, riseT + 1.6, uS), 0.0) + rt * position.x * 17.0 * k * uFat;
          vA = up * (0.85 + 0.1 * sin(uT * 1.7 + iD.y * 20.0) + 0.6 * flash2) * mix(1.0, 1.35, uFat - 1.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        } else {
          vec4 mv = viewMatrix * vec4(iP2 + vec3(0.0, 12.0, 0.0), 1.0); mv.xy += position.xy * (80.0 + 170.0 * max(flash, flash2)) * k * mix(1.0, 1.4, uFat - 1.0);
          vA = on * (0.6 + 1.3 * flash + 0.8 * flash2);
          gl_Position = projectionMatrix * mv;
        } }`,
    fragmentShader: `varying vec3 vQ; varying float vA;
      void main(){
        float a, core;
        if (vQ.z < 0.5) { float w = 1.0 - abs(vQ.x); core = pow(w, 7.0); a = (core + pow(w, 2.0) * 0.22) * pow(1.0 - vQ.y, 1.3); }
        else { float d = length(vQ.xy); core = smoothstep(0.35, 0.0, d); a = pow(max(1.0 - d, 0.0), 2.5); }
        gl_FragColor = vec4(mix(${GOLD}, ${PALE}, core), a * vA); }` }, 'sun_beams', 3);
  function refreshBeams() {
    SHARDS.forEach((s, i) => iD.setZ(i, ui.on[s.name] ? 0 : 1)); iD.needsUpdate = true;
    beams.visible = SHARDS.length > 0 && !st.ended && U.uS.value > TL.fly0 + TL.fly - 0.1;
  }

  // ================================================================ 花の丘だけの物（太陽・かけら・とじる花・ホタル・エルフの光・演出）。ほかのエリアでは、下の入れ物は空のまま
  // ================================================================ 音のオン・オフ：エリアの音（area_kit.js の audio）の消音を、ただ 1 つのもとにする
  //   sun_game.js の音（snd）は毎フレームそれに合わせ、魔法陣の音（magic_circle.js）は各ページが muted: () => audio.isMuted() を渡しているので、同じく鳴らない
  //   ゲーム中の切りかえは、画面の右上の音のボタン（#soundBtn。もとからある）。最初の画面のボタンと同じ設定を読み書きする
  const SPK = (on) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;
  const soundBtn = document.getElementById('soundBtn'); let onSound = () => {};
  const soundOn = () => (st.hush ? !st.userMuted : !(G.audio && G.audio.isMuted()));
  function setSound(on) {
    store.set(SUN_SOUND_KEY, on ? '1' : '0');
    if (st.hush) st.userMuted = !on; else if (G.audio) G.audio.setMuted(!on);
    if (soundBtn) soundBtn.classList.toggle('muted', !on);
    if (snd.ready) snd.mute(!on); onSound();
  }
  if (store.get(SUN_SOUND_KEY) === '0') setSound(false);
  if (soundBtn) soundBtn.addEventListener('click', () => { store.set(SUN_SOUND_KEY, G.audio && G.audio.isMuted() ? '0' : '1'); onSound(); });      // ゲーム中に切りかえた（消音そのものは area_kit.js がする）

  // ================================================================ 妖精（小さな光の玉に、うすい羽が 2 枚。板 1 枚、羽ばたきはシェーダー。飛ぶと光の粉の尾を引く）と、吹き出し（セリフは TEXT の talk）
  //   ほかの所は fairy.visible（見えるか）・fairyU.uPos（行き先）・fairyU.uA（うすさ）に書きこむだけ。画面に出す場所は fairySync が毎フレーム決める：
  //   行き先へ、ゆるやかに加速・減速しながら飛ぶ（1 コマで別の場所に出ない）。遠すぎる所（FAIRY_FAR m より先）へは、光が小さくなって消え、新しい場所でふわっと現れる
  const fairyU = { uPos: { value: V3(0, 0, 0) }, uA: { value: 0 } }, fairy = { visible: false };
  const fairyS = { uPos: { value: V3(0, 0, 0) }, uA: { value: 0 }, uK: { value: 1 }, uT: U.uT };      // 画面に出している場所・こさ・大きさ
  const fairyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...add, depthTest: true, uniforms: fairyS,      // 深さを見る：エルフや木の後ろにいるときは、かくれる（手前にいるときは、今までどおり見える）
    vertexShader: 'uniform vec3 uPos; uniform float uK; varying vec2 vP; void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); mv.xy += position.xy * 0.46 * uK; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uA, uT; varying vec2 vP;
      void main(){ float d = length(vP), core = smoothstep(0.2, 0.0, d) * 1.7 + pow(max(1.0 - d, 0.0), 3.0) * 0.75, fl = 0.45 + 0.55 * (0.5 + 0.5 * sin(uT * 36.0));
        vec2 w = vec2((abs(vP.x) - 0.12 - 0.22 * fl) / (0.24 * fl), (vP.y - 0.2 + 0.25 * (abs(vP.x) - 0.3)) / 0.36);      // 羽 2 枚（左右。ななめ上へひらく）
        float wing = smoothstep(1.0, 0.55, length(w)) * 0.6;
        gl_FragColor = vec4(vec3(0.92, 1.0, 0.74) * core + vec3(0.8, 1.0, 0.9) * wing, uA); }` }));
  fairyMesh.frustumCulled = false; fairyMesh.renderOrder = 20; fairyMesh.name = 'sun_fairy_ball'; fairyMesh.visible = false;      // 前の光の玉（もう描かない。場所・こさの計算にだけ使う）
  // 妖精の形：C「蝶の羽」（芯 ＋ 細い胴と触角 ＋ 羽 2 対。顔なし。ゆっくり羽をとじてひらく）。物の後ろではかくれる。場所・こさ・大きさは、下の fairySync が前と同じ計算で決めて渡す
  const FB = createLightFairy3D({ scale: 1.4, farSize: 0.1 }); FB.group.visible = false; scene.add(FB.group); const _fbLast = V3(0, 0, 0);      // 物の後ろではかくれる（xray なし）。遠くでは見かけの大きさを部品が保つ
  // 光の粉：飛んでいる間、後ろに残る小さな光（少し落ちながら消える）
  const DUST = 56, dustPos = new Float32Array(DUST * 3), dustB = new Float32Array(DUST * 2).fill(-99), dustU = { uT: U.uT, uPx: { value: 400 } };
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3)); dustGeo.setAttribute('aB', new THREE.BufferAttribute(dustB, 2));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({ ...add, depthTest: true, uniforms: dustU,
    vertexShader: `attribute vec2 aB; uniform float uT, uPx; varying float vK;
      void main(){ float age = uT - aB.x, k = age / (0.9 + 0.5 * aB.y); vK = k;
        vec3 p = position; p.y -= 0.1 * age + 0.12 * age * age; p.x += sin(age * 3.0 + aB.y * 40.0) * 0.03; p.z += cos(age * 2.6 + aB.y * 17.0) * 0.03;
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max((0.05 + 0.04 * aB.y) * (1.0 - 0.5 * k) * uPx / max(-mv.z, 0.1), 1.5);
        if (k < 0.0 || k >= 1.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`,      // 消えた粒は、画面の外へ
    fragmentShader: `varying float vK;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = pow(max(1.0 - d, 0.0), 2.0) * (1.0 - clamp(vK, 0.0, 1.0)); if (a < 0.004) discard; gl_FragColor = vec4(vec3(0.95, 1.0, 0.76), a * 0.9); }` }));
  dust.frustumCulled = false; dust.renderOrder = 19; dust.name = 'sun_fairy_dust';      // 前の光の粉（もう描かない。蝶の羽の妖精は、自分の光の粉を持っている）
  const _dsz = new THREE.Vector2();
  dust.onBeforeRender = (r, _s, cam) => { const rt = r.getRenderTarget(), h = rt ? rt.height : r.getDrawingBufferSize(_dsz).y; dustU.uPx.value = h * cam.projectionMatrix.elements[5] * 0.5; };
  let dustI = 0, dustAcc = 0;
  const FAIRY_FAR = 9, FAIRY_TIME = 0.5;                             // これより遠い行き先へは「消えて、現れる」・飛ぶときの追いつく早さ（秒。小さいほど速い）
  const fs = { pos: V3(0, 0, 0), vel: V3(0, 0, 0), k: 0, on: false, out: false, pulse: 0 }, _fc = V3(0, 0, 0), _ft = V3(0, 0, 0);
  let frameDt = 0;
  function fairySync(dt) {                                           // 毎フレーム 1 回、カメラを置いたあとに呼ぶ
    const tgt = fairyU.uPos.value, want = fairy.visible && fairyU.uA.value > 0.01;
    if (st.fairySnap && fs.on && want) { st.fairySnap = false; fs.pos.copy(tgt); fs.vel.set(0, 0, 0); fs.out = false; } else st.fairySnap = false;
    if (st.phase === 'seek') { fs.pos.copy(tgt); fs.vel.set(0, 0, 0); fs.on = want; fs.out = false; fs.k = want ? 1 : 0; }      // 止め絵：その場所にそのまま
    else if (!want) { fs.k = Math.max(0, fs.k - dt / 0.35); if (fs.k <= 0) fs.on = false; }
    else if (!fs.on) { fs.on = true; fs.out = false; fs.k = 0; fs.pos.copy(tgt); fs.vel.set(0, 0, 0); }      // 出る：行き先で、ふわっと現れる
    else if (fs.out || fs.pos.distanceTo(tgt) > FAIRY_FAR) {         // 遠すぎる：光が小さくなって消え、新しい場所で現れる
      fs.out = true; fs.k -= dt / 0.3; if (fs.k <= 0) { fs.k = 0; fs.out = false; fs.pos.copy(tgt); fs.vel.set(0, 0, 0); }
    } else {                                                         // 飛ぶ：ゆるやかに加速して、減速して着く（行きすぎない）
      fs.k = Math.min(1, fs.k + dt / 0.5);
      const om = 2 / FAIRY_TIME, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      _fc.copy(fs.pos).sub(tgt); _ft.copy(fs.vel).addScaledVector(_fc, om).multiplyScalar(dt); fs.vel.sub(_ft.clone().multiplyScalar(om)).multiplyScalar(e); fs.pos.copy(tgt).add(_fc.add(_ft).multiplyScalar(e));
      const sp = fs.vel.length(); dustAcc += dt * clamp(sp * 9, 0, 42);      // 速く飛ぶほど、光の粉が多い
      while (dustAcc >= 1) { dustAcc -= 1; const i = dustI; dustI = (dustI + 1) % DUST;
        dustPos[i * 3] = fs.pos.x + (Math.random() - 0.5) * 0.12; dustPos[i * 3 + 1] = fs.pos.y + (Math.random() - 0.5) * 0.12; dustPos[i * 3 + 2] = fs.pos.z + (Math.random() - 0.5) * 0.12; dustB[i * 2] = U.uT.value; dustB[i * 2 + 1] = Math.random();
        dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.aB.needsUpdate = true; }
    }
    fs.pulse = Math.max(0, fs.pulse - dt * 1.6);
    const ek = fs.k * fs.k * (3 - 2 * fs.k);
    fairyMesh.visible = fs.on && ek > 0.001; fairyS.uA.value = fairyU.uA.value * ek; fairyS.uK.value = (0.35 + 0.65 * ek) * (1 + 0.45 * fs.pulse);
    fairyS.uPos.value.copy(fs.pos); fairyS.uPos.value.y += Math.sin(U.uT.value * 2.3) * (0.02 + 0.035 * Math.min(1, fs.vel.length()));      // 飛んでいる間も、上下にふわふわ
    const pk = st.panic || 0; if (pk > 0) { const T = U.uT.value; fairyS.uPos.value.x += pk * (Math.sin(T * 47) * 0.018 + Math.sin(T * 5.3) * 0.07); fairyS.uPos.value.z += pk * (Math.cos(T * 41) * 0.018 + Math.cos(T * 4.1) * 0.05); fairyS.uPos.value.y += pk * Math.sin(T * 53) * 0.015; fairyS.uK.value *= 1 + 0.06 * pk * Math.sin(T * 31); }      // あわてている：小きざみにふるえて、左右にゆれる
    const fbWas = FB.group.visible; FB.group.visible = fairyMesh.visible; FB.setAlpha(fairyS.uA.value);      // 出る・消えるときは、うすさだけ（大きさは遠さで部品が決める）
    if (!fbWas || _fbLast.distanceToSquared(fairyS.uPos.value) > 1) FB.warpTo(fairyS.uPos.value); else FB.setPosition(fairyS.uPos.value);      // 出るとき・絵が切りかわったときは、尾を引かずに
    _fbLast.copy(fairyS.uPos.value); FB.setDark(Math.max(nightV, 0)); FB.setTalking(!!st.talkOn); if (FB.setTremble) FB.setTremble(pk > 0.3); FB.update(dt, camera);      // 向きは部品まかせ：飛ぶ間は進む向き、話す間・止まったらカメラ（エルフ）のほう
  }
  const fairyPlay = (name, to) => { if (fairy.visible && st.phase !== 'seek') { fs.pulse = name === 'point' ? 0.5 : 1; FB.play(name, to ? { to } : {}); } };      // しぐさのかわり：光がぽんとふくらむ（joy 喜ぶ・surprise おどろく は大きく、point は小さく）
  // 吹き出し・セリフ枠の左の印：妖精 A1（光の小さな女の子・お団子なし）のシルエット。右向き、羽 2 枚はうしろ（左）。単色の淡い金（羽はすける）。小さくても 頭・羽・すそ が読める形
  const FAIRY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40">'
    + '<g fill="rgba(242,224,172,.42)" stroke="#f0deaa" stroke-width=".9"><ellipse cx="-7.2" cy="-8.4" rx="8.6" ry="3.5" transform="rotate(33 -7.2 -8.4)"/><ellipse cx="-7" cy="0.6" rx="6.6" ry="2.7" transform="rotate(-24 -7 0.6)"/></g>'
    + '<g fill="#f4e4b4"><circle cx="3.4" cy="-9.2" r="5.4"/><path d="M1.6 -4.1 C 4.6 -3.4 6.4 1.2 9.6 9.2 Q 2.6 11.6 -6.4 9.6 C -3.4 4.6 -1.2 -0.6 1.6 -4.1 Z"/></g>'
    + '<path d="M1.6 10.4 L 0.6 16" stroke="#ead08e" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>';
  const talkEl = document.createElement('div'); talkEl.id = 'sunTalk'; document.body.append(talkEl);
  const NEXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 8"><path d="M1 1 L9 1 L5 7 Z" fill="rgba(240,222,170,.15)" stroke="#f0deaa" stroke-width="1" stroke-linejoin="round"/></svg>';      // 進められる合図 ▼
  // i 番めのセリフを出す（-1 で消す）。字と大きさは、今の言語のもの
  const talkLog = [];                                                // 確認用：セリフが出た・消えた時刻（__sun.talkLog()）
  //   セリフは時間で消えない。字が 1 つずつ出て、出きったら ▼ が点めつし、Enter（PC）か画面のタップ（スマホ）で次へ進む。字が出きる前に押すと、全文が出る
  const WIDE = new Set([3, 6, 1, 7, 8, 9]);                                      // まっくらな場面のセリフ（「いつまで寝てるの？」「集めにいこう！」）：下の広い会話らんで出す
  const LINES = [{ i: 3, w: TL.talkA, hold: TL.talkA[0] + 1.0, jump: true }, { i: 4, w: TL.talkB, hold: TL.talkB[0] + 1.0, jump: true }, { i: 5, w: TL.talkH, hold: TL.talkH[0] + 1.0, jump: true },
    { i: 6, w: TL.talkC, hold: TL.talkC[0] + 1.2, jump: true }, { i: 1, w: TL.talk2, hold: TL.talk2[0] + 1.2, jump: true },
    { i: 7, w: TL.talkE, hold: TL.talkE[0] + 1.2, jump: true }, { i: 8, w: TL.talkF, hold: TL.talkF[0] + 1.2, jump: true }];
  //   始まりのセリフ：w ＝ 出ている間（演出の秒）、hold ＝ ここで演出を止めて、押すのを待つ、jump ＝ 押したら w の終わりへ進む（false ＝ その場から続きが流れる）
  const talk = { n: 0, total: 0, full: true, lines: [], drawn: -1, str: '', acc: 0, pause: 0 }; st.done = {};
  const talkDraw = () => { let left = Math.floor(talk.n); talk.drawn = left;
    talkEl.querySelector('span').innerHTML = talk.lines.map((t) => { const k = Math.min(left, t.length); left -= k; return `${t.slice(0, k)}<span class="rest">${t.slice(k)}</span>`; }).join('<br>'); };
  const showTalk = (i) => {
    if (i >= 0 && (st.talkI !== i || st.talkL !== lang || !st.talkOn)) { const L = TEXT[lang]; st.talkI = i; st.talkL = lang; talkEl.lang = L.html; talkEl.style.fontFamily = talkFont(lang);
      talkEl.style.fontSize = `clamp(${Math.min(15, L.size[0])}px, ${L.size[1]}vw, 18px)`; talkEl.innerHTML = `${FAIRY_SVG}<span></span><i class="ln"></i><i class="nxt">${NEXT_SVG}</i>`; talkEl.classList.toggle('wide', WIDE.has(i));
      talk.lines = L.talk[i]; talk.str = talk.lines.join(''); talk.total = talk.str.length; talk.acc = 0; talk.pause = 0; talk.n = st.phase === 'seek' ? talk.total : 0; talk.full = talk.n >= talk.total; talkDraw(); }
    const on = i >= 0; if (on !== !!st.talkOn) { st.talkOn = on; talkLog.push({ line: st.talkI, on, t: +(performance.now() / 1000).toFixed(2), s: +(st.s || 0).toFixed(2) }); if (talkLog.length > 60) talkLog.shift(); }
    talkEl.classList.toggle('show', on); if (!on) talkEl.classList.remove('next');
  };
  function talkTick(dt) {                                            // 字を 1 つずつ出す（1 秒に 18 字。「…」で 0.4 秒、句読点で 0.22 秒止まる）。出きって、押すのを待っている間は ▼
    if (!st.talkOn) return;
    if (talk.n < talk.total) { talk.pause -= dt;
      if (talk.pause <= 0) { talk.acc += dt * 18;
        while (talk.acc >= 1 && talk.n < talk.total) { talk.acc -= 1; talk.n++; const ch = talk.str[talk.n - 1];
          if (talk.n < talk.total && '…、。，！？!?,.'.includes(ch)) { talk.pause = ch === '…' ? 0.4 : 0.22; talk.acc = 0; break; } }
        if (talk.n !== talk.drawn) talkDraw(); } }
    talk.full = talk.n >= talk.total;
    talkEl.classList.toggle('next', talk.full && (((st.phase === 'intro' || st.phase === 'ending') && !!st.wait) || (say.i >= 0 && say.hold)));
  }
  // 押して進める：始まりの演出の間（操作は止まっている）は、Enter・Space・画面のどこのタップでも。自由に歩ける間（3 つそろったひとこと）は、Enter か、会話らんのタップだけ（移動やカメラのタップでは進まない）
  function pressNext(e) {
    if (e.type === 'keydown' && (e.repeat || !(e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space'))) return;
    if (!st.talkOn) return;
    const intro = st.phase === 'intro' || st.phase === 'ending';      // エンディングの始めのひと言も、同じように押して送る
    if (!intro && (e.type === 'keydown' ? e.code === 'Space' : !(e.target && e.target.closest && e.target.closest('#sunTalk')))) return;
    if (!talk.full) { talk.n = talk.total; talk.full = true; talkDraw(); return; }      // 字が出きる前：全文を出す
    talkEl.classList.add('flash'); setTimeout(() => talkEl.classList.remove('flash'), 150);      // 押した：上下の線が 0.15 秒だけ明るくなる
    if (intro) { const L = st.wait; if (L) { st.done[L.i] = true; if (L.jump) st.s = L.w[1]; st.wait = null; talkEl.classList.remove('next'); } }
    else if (say.i >= 0 && say.hold) { say.hold = false; say.t = SAY.talk[1]; }
  }
  window.addEventListener('pointerdown', pressNext, true); window.addEventListener('keydown', pressNext, true);
  // 確認画像用：吹き出しを絵に描く（画面の幅 vw px のときの大きさで。まん中 cx、下のはし bottom）。返すのは、幅と、92% の幅におさまるか
  async function drawBubble(g, cx, bottom, vw, i, old = false) {     // old ＝ 使わない（前の形は、もう描かない）
    const L = TEXT[lang], lines = L.talk[i], port = vw < 700, fs = clamp(vw * L.size[1] / 100, Math.min(15, L.size[0]), 18), lh = fs * 1.85, img = await svgImage(FAIRY_SVG.replace('<svg ', '<svg width="80" height="80" ')), wide = WIDE.has(i);
    if (!talkFontOff) await document.fonts.load(`400 ${fs}px "Ohisama C Talk ${lang}"`, lines.join('')).catch(() => {});
    g.save(); g.font = `400 ${fs}px ${talkFont(lang)}`; g.letterSpacing = `${((port ? 0.04 : 0.08) * fs).toFixed(2)}px`; g.textBaseline = 'middle';
    const [pt, pr, pb, pl] = port ? [14, 40, 16, 36] : wide ? [20, 96, 22, 92] : [14, 70, 14, 60], ic = port ? 26 : 30, gap = port ? 10 : 14;
    const tw = Math.max(...lines.map((t) => g.measureText(t).width)), need = pl + ic + gap + tw + pr;
    const bw = wide ? (port ? vw * 0.94 : Math.min(vw * 0.94, 760)) : Math.min(need, vw * 0.94, 560), bh = Math.max(pt + pb + lh * lines.length, wide ? (port ? 96 : 108) : 56), bx = cx - bw / 2, by = bottom - bh;
    const band = g.createLinearGradient(bx, 0, bx + bw, 0); band.addColorStop(0, 'rgba(8,8,24,0)'); band.addColorStop(0.16, 'rgba(8,8,24,.62)'); band.addColorStop(0.84, 'rgba(8,8,24,.62)'); band.addColorStop(1, 'rgba(8,8,24,0)');
    g.fillStyle = band; g.fillRect(bx, by, bw, bh);
    const line = g.createLinearGradient(bx + bw * 0.06, 0, bx + bw * 0.94, 0); line.addColorStop(0, 'rgba(240,222,170,0)'); line.addColorStop(0.2, 'rgba(240,222,170,.55)'); line.addColorStop(0.8, 'rgba(240,222,170,.55)'); line.addColorStop(1, 'rgba(240,222,170,0)');
    g.fillStyle = line; g.fillRect(bx + bw * 0.06, by, bw * 0.88, 1); g.fillRect(bx + bw * 0.06, by + bh - 1, bw * 0.88, 1);
    const cw = ic + gap + tw, cx0 = wide ? bx + pl : bx + (bw - cw) / 2 + (pl - pr) / 2, cy = by + bh / 2;
    g.drawImage(img, cx0, cy - ic / 2, ic, ic);
    g.shadowColor = 'rgba(8,8,24,.8)'; g.shadowBlur = 8; g.fillStyle = '#f6f0e0'; lines.forEach((t, k) => g.fillText(t, cx0 + ic + gap, cy + lh * (k + 0.5 - lines.length / 2)));
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    const nx = bx + bw - (port ? 22 : 74) - 10, ny = by + bh - (port ? 12 : 16) - 8; g.fillStyle = 'rgba(240,222,170,.15)'; g.strokeStyle = '#f0deaa'; g.lineWidth = 1; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(nx + 1, ny + 1); g.lineTo(nx + 9, ny + 1); g.lineTo(nx + 5, ny + 7); g.closePath(); g.fill(); g.stroke();      // ▼
    g.restore(); return { width: Math.round(bw), fits: bw <= vw * 0.94 };
  }
  const warmTalk = () => { if (document.fonts && document.fonts.load) document.fonts.load(`700 16px "Ohisama C Talk ${lang}"`, TEXT[lang].talk.flat().join('')).catch(() => {}); };      // セリフの字を、先に読んでおく（選んだ言語のぶんだけ）
  warmTalk();
  function setLang(l) { if (!TEXT[l]) return; lang = l; warmTalk(); store.set(SUN_LANG_KEY, l); document.documentElement.lang = TEXT[l].html; onLang(); if (talkEl.classList.contains('show')) showTalk(st.talkI); }
  // 妖精のひとこと（演出の外で、エルフのそばに来て話す）：3 つそろったとき
  // 「言った」しるし（sunGame_said3）は、言い終わったときに付ける。3 つそろっていない状態で開いたら（魔法陣をやり直した）、しるしを消す ＝ 次にそろったとき、また言う。
  // 3 つそろっていて・まだ言っていなくて・エンディング前なら、ページを開いたとき（花の丘でもエリアでも）に言う（need）
  if (!ui.full) store.del(SUN_SAID_KEY);
  const SAY = { talk: [1.0, 5.2], hold: 2.0, end: 6.8, wait: 1.0 }, say = { i: -1, t: 0, voice: false, wait: 0, need: ui.full && !st.ended && store.get(SUN_SAID_KEY) !== '1' };
  function sayAt(t) {
    const av = walker.avatar, y0 = av ? av.root.position.y : camera.position.y - 1.45, f = av ? av.state.facing : player.yaw + Math.PI, fx = Math.sin(f), fz = Math.cos(f);
    const a = sstep(t, 0, 1.0), o = sstep(t, SAY.talk[1], SAY.end - 0.3), d = 0.5 + 2.6 * (1 - a);
    fairy.visible = true; fairyU.uA.value = sstep(t, 0, 0.5) * (1 - sstep(t, SAY.end - 0.5, SAY.end));
    fairyU.uPos.value.set(player.x + fx * d - fz * 0.7, y0 + 1.5 + 2.2 * (1 - a) * (1 - a) + 1.6 * o + Math.sin(U.uT.value * 2.6) * 0.05, player.z + fz * d + fx * 0.7);
    showTalk(t >= SAY.talk[0] && t < SAY.talk[1] ? say.i : -1);
  }
  function startSay(i) { say.i = i; say.t = 0; say.voice = false; say.hold = true; snd.fairyFx(); st.sayJoy = i === 2; }
  function sayTick(dt) {
    if (say.i < 0) {                                                 // まだ言っていないひとことがあれば、動ける状態になって SAY.wait 秒後に出す（最初の画面・始まり・エンディングの間は待つ）
      const gate = document.getElementById('gate'), ok = say.need && ui.full && !st.ended && !st.going && ui.busy === 0 && (st.phase === 'free' || !isHill) && (!gate || gate.classList.contains('off') || document.body.classList.contains('shot'));
      say.wait = ok ? say.wait + dt : 0; if (ok && say.wait >= SAY.wait) startSay(2);
      return;
    }
    say.t += dt; if (say.hold && say.t >= SAY.hold) say.t = SAY.hold;      // セリフが出たら、押すまで待つ（その間も歩ける）
    if (!say.voice && say.t >= SAY.talk[0]) { say.voice = true; snd.later('voice'); if (st.sayJoy) { st.sayJoy = false; fairyPlay('joy'); } }      // 「かけらがそろった！」は、くるっと喜んでから
    if (say.i === 2 && say.need && say.t >= SAY.talk[1]) { say.need = false; store.set(SUN_SAID_KEY, '1'); }      // 言い終わった
    if (say.t >= SAY.end) { say.i = -1; fairy.visible = false; showTalk(-1); } else sayAt(say.t);
  }


  // ---- 今やること（左上に 1 行）：0 妖精についていく（始まりの、操作できる間）/ 1 太陽のかけらを集める（3 つそろうまで）/ 2 花の丘にもどる（そろってから、丘の上に着くまで）
  //   出さないとき：最初の画面・演出の間（操作が止まっている間）・かけらが飛んでいる間・妖精が話している間・エリアを移る間・エンディングのあと。保存されている進行から決めるので、開きなおしても同じ
  const taskEl = document.createElement('div'); taskEl.id = 'sunTask'; taskEl.innerHTML = '<i></i><span></span>'; document.body.append(taskEl);
  let ctlLocked = false; { const lk = controls.lock.bind(controls); controls.lock = (b) => { ctlLocked = !!b; lk(b); }; }      // 操作が止まっているか（始まり・エンディング・かけらを取る演出）
  const task = { now: -1, shown: -1, lang: '', t: 0, cnt: -1 };
  const taskCount = () => Object.values(ui.on).filter(Boolean).length;      // 集めた数（ui.on ＝ 保存されている進行から決まる。かけらが太陽マークにはまったときに増える）
  const taskId = () => { const gate = document.getElementById('gate');
    if (st.ended || st.going || ctlLocked || ui.busy > 0 || (gate && !gate.classList.contains('off') && !document.body.classList.contains('shot'))) return -1;
    if (st.phase === 'follow') return 0;
    if (st.phase !== 'free' || !st.started) return -1;
    return !ui.full ? (allOf(ui.on) ? -1 : 1) : say.i >= 0 || say.need ? -1 : 2; };      // 3 つめがはまってから妖精が話し終わるまでは、出さない
  function taskTick(dt) {
    const id = taskId(); if (id !== task.now) { task.now = id; task.t = 0; taskEl.classList.remove('show'); }      // 変わったら、いちど消して、少し間をおいて新しいものを出す
    task.t += dt; if (task.now < 0 || task.t < 0.5) return;
    const cnt = task.now === 1 ? taskCount() : -1;
    if (taskEl.classList.contains('show') && (cnt === task.cnt || task.now !== 1)) return;
    if (task.shown !== task.now || task.lang !== lang || cnt !== task.cnt) { const fresh = task.shown !== task.now, up = !fresh && cnt > task.cnt && task.cnt >= 0; task.shown = task.now; task.lang = lang; task.cnt = cnt;
      const L = TEXT[lang]; taskEl.lang = L.html; taskEl.style.fontFamily = talkFont(lang); const sp = taskEl.lastChild; sp.textContent = L.task[task.now];
      if (cnt >= 0) { const b = document.createElement('b'); b.textContent = `${L.count[0]}${cnt}${L.count[1]}`; sp.append(b); if (up) { void b.offsetWidth; b.classList.add('bump'); } }      // 「（1/3）」：増えたときだけ、数字が静かに光る
      if (fresh) { taskEl.classList.remove('new'); void taskEl.offsetWidth; taskEl.classList.add('new'); } }      // 新しいタスク：印が小さく光る
    taskEl.classList.add('show');
  }
  // 確認画像用：今やることを絵に描く（画面の幅 vw px のときの場所と大きさで）
  async function drawTask(g, vw, i, l, vh = 0) {
    const port = vh > vw, fs = port ? 15 : 16, text = TEXT[l].task[i] + (i === 1 ? `${TEXT[l].count[0]}${taskCount()}${TEXT[l].count[1]}` : ''), x = port ? 18 : 28, y = port ? 84 : 26, bh = 24, lineH = port ? 18 : 20, gap = port ? 10 : 12;
    await document.fonts.load(`400 ${fs}px "Ohisama C Talk ${l}"`, text).catch(() => {});
    g.save(); g.font = `400 ${fs}px ${talkFont(l)}`; g.letterSpacing = `${((port ? 0.08 : 0.12) * fs).toFixed(2)}px`; g.textBaseline = 'middle'; const bw = Math.round(1 + gap + g.measureText(text).width);
    const ln = g.createLinearGradient(0, y + bh / 2 - lineH / 2, 0, y + bh / 2 + lineH / 2); ln.addColorStop(0, 'rgba(240,222,170,0)'); ln.addColorStop(0.3, '#f0deaa'); ln.addColorStop(0.7, '#f0deaa'); ln.addColorStop(1, 'rgba(240,222,170,0)');
    g.shadowColor = 'rgba(240,222,170,.7)'; g.shadowBlur = 6; g.fillStyle = ln; g.fillRect(x, y + bh / 2 - lineH / 2, 1, lineH);
    g.shadowColor = 'rgba(8,8,24,.8)'; g.shadowBlur = 8; g.fillStyle = '#f6f0e0'; g.fillText(text, x + 1 + gap, y + bh / 2 + 0.5); g.restore();
    return { right: x + bw, bottom: y + bh };
  }

  let hillDark = () => {}, hillTick = () => {}, hillPlace = () => {}, hillAfter = () => {}, hillHome = () => {}, hillApi = {};
  // ---- 暗い世界の霧（どのページにも）：夜は、少し濃くして（近くにもうすくかかる）、遠くほど青黒くとける。
  //   エリアごとに夜の明るさがちがう（area_kit の NIGHT の値）ので、ここで夜の明るさをそろえる（DARK_DIM ＝ 夜のとき景色にかける明るさ。花の丘・森 ＝ 1）。自分で光る物（かけら・光の柱・水晶・キノコ）は霧を使わないので、暗くならない
  const DARK_DIM = { ruins: 0.62, valley: 0.7, cave: 0.66 }[area] ?? 1;
  { const anchor = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, kfC, kfF );', ch = THREE.ShaderChunk.fog_fragment;
    if (ch.includes(anchor) && ch.includes('kfNight') && !ch.includes('sunDark')) {
      // 光の波（エンディングで太陽がもどるとき）：丘の上の木から外へ、夜の度合いを場所ごとに消していく。fogNear ＝ 波の半径 m（0 より小さい ＝ 波なし。fogNear は霧の計算では使われていない）
      const WC = (G.HILL && G.HILL.tree) || { x: 0, z: 0 }, wc = `vec2( ${(+WC.x).toFixed(2)}, ${(+WC.z).toFixed(2)} )`;
      THREE.ShaderChunk.fog_fragment = ch.replace(/kfNight/g, 'kfN').replace('#ifdef USE_FOG', `#ifdef USE_FOG\n      float kfWd = length( vFogWorld.xz - ${wc} ) - fogNear, kfN = kfNight * ( fogNear < 0.0 ? 1.0 : smoothstep( -8.0, 3.0, kfWd ) );   // sunWave`)
        .replace(anchor, `gl_FragColor.rgb *= mix( 1.0, ${DARK_DIM.toFixed(3)}, kfN ) * ( fogNear >= 0.0 ? mix( 1.0, 0.5, kfN ) : 1.0 ); kfF = min( 1.0, kfF * ( 1.0 + 0.5 * kfN ) + 0.05 * kfN ); kfC = mix( kfC, vec3( 0.016, 0.028, 0.075 ), kfN * 0.9 );   // sunDark
      if ( fogNear >= 0.0 ) gl_FragColor.rgb += vec3( 1.0, 0.8, 0.48 ) * exp( - kfWd * kfWd / 40.0 ) * 0.14 * kfNight;   // 波の先：地面をなでる金色の光
      ${anchor}`);
      const seen = new Set();
      scene.traverse((o) => { for (const m of [].concat(o.material || [])) { if (seen.has(m)) continue; seen.add(m);
        const pk = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => `${pk()}|sunDark`; m.needsUpdate = true; } });
    } }
  if (scene.fog) scene.fog.near = -1;                                 // 光の波なし
  if (isHill) setupHill();
  refreshBeams();

  function setupHill() {
    const START = { z: -50, pitch: 0.12 };                                   // エルフが立つ所（丘の中ほど。ふみ分け道の上）
    const SUN_DIST = 800, SUN_SIZE = 330;                                     // 太陽までの距離・光の板の半径（まん中の 1/5.5 が太陽の丸）
    const CAM = { yaw0: 0.62, pitch0: 0.42, dist: 3.0, side: 0.25 };           // 始まりの構図：エルフの後ろの低い所から、空の太陽を見上げる
    // エンディングの時間（秒）：丘に着く → 足もとに魔法陣が広がる（circle）→ かけらが 1 つずつマークから外れて手元へ（take）→ さし出す（raise）→ かけらが魔法陣の上で回りながら寄りあう（spin）→ 1 つにくっつく（merge）
    //   → 1 つになった太陽が空へのぼる（cut 〜、fly 秒）→ 一気に明るく（dawn）・花が開く（open）・よろこぶ（joy。face ＝ 顔の見える絵）→ カメラが上がって丘全体（crane）→ 操作へ（back）
    const TLE = { circle: [0.8, 2.4], cup: 2.2, take: [3.0, 4.0, 5.0], takeDur: 1.5, raise: 7.0, spin: 7.8, merge: 11.0, cut: 11.7, fly: 3.0, dawn: [14.7, 15.5], open: [14.9, 24.0], joy: 16.6, face: [15.3, 19.0], crane: [19.0, 28.0], wave: [14.7, 24.5], sky: [15.0, 21.5], endcard: 26.6, back: [1e4, 1e4 + 2.6], end: 1e4 + 3 };
    // 始めに、妖精のひと言（talk0。押すまで待つ）→ エルフがうなずく（nod）を入れる。上の時刻は、そのぶん（END_PRE 秒）うしろへずらす（takeDur・fly は長さなので、そのまま）
    const END_PRE = 5.4; for (const k of Object.keys(TLE)) if (k !== 'takeDur' && k !== 'fly') TLE[k] = Array.isArray(TLE[k]) ? TLE[k].map((v) => v + END_PRE) : TLE[k] + END_PRE;
    Object.assign(TLE, { talk0: [1.8, 3.2], nod: [3.6, 4.9] });      // 着いて、カメラが切りかわり、妖精が出て、ひと呼吸 →「集めたかけらを…」→ 送ると、ひと呼吸 → うなずく → ひと呼吸 → 魔法陣（circle）
    const END_LINE = { i: 9, w: TLE.talk0, hold: TLE.talk0[0] + 1.2, jump: true };      // crane のあと、静かな間（1.6 秒）→「END」がゆっくり出る（endcard）。そのまま残る（操作にはもどらない）
    const TAKE = ['ruins', 'mushroom', 'cave'];                              // マークから外れる順
    START.x = hill.trailX(START.z);
    const [ex, ez] = hill.constrain(START.x, START.z), E = V3(ex, hill.groundH(ex, ez), ez), SUN = hill.HILL.sun.clone().normalize();
    // 始まりの場所：丘の上の花の木（つつじの木）の根もと。F0 ＝ 寝ているときに体が向くほう（幹を背にする）、R0 ＝ その右
    const HTc = hill.HILL.tree, SPOT = { lean: 1.3, stand: 1.95, dir: [-0.954, -0.3] };      // 幹のまん中から：もたれる所・立つ所（m）、向き（x, z）
    const F0 = V3(SPOT.dir[0], 0, SPOT.dir[1]).normalize(), R0 = V3(-F0.z, 0, F0.x), onG = (v) => { v.y = hill.groundH(v.x, v.z); return v; };
    const PL = onG(V3(HTc.x + F0.x * SPOT.lean, 0, HTc.z + F0.z * SPOT.lean)), P1 = onG(V3(HTc.x + F0.x * SPOT.stand, 0, HTc.z + F0.z * SPOT.stand));
    const sunH = V3(SUN.x, 0, SUN.z).normalize(), S0 = onG(V3(HTc.x + sunH.x * 10.5, 0, HTc.z + sunH.z * 10.5)); S0.y += 1.4;      // 太陽を見上げるカメラ（枝の外）
    const P0 = S0.clone().addScaledVector(SUN, SUN_DIST); shU.uP0.value.copy(P0);
    // かけらの道すじ：太陽（西の空）から、南の空をまわって、それぞれの方角へ（真上は通らない ＝ カメラが目で追いやすい）
    SHARDS.forEach((s, i) => { s.p1.copy(P0).lerp(s.p2, 0.5).add(V3(-330 + i * 70, 250 + i * 80, 0)); });
    const mid = SHARDS.reduce((a, s) => a.add(s.p2), V3(0, 0, 0)).multiplyScalar(1 / SHARDS.length).sub(E);
    const YAW_END = Math.atan2(-mid.x, -mid.z) + Math.PI * 2;                 // 操作開始の向き：3 本の光のまん中
    const atStart = () => { [player.x, player.z] = [E.x, E.z]; };
    const gm = SHARDS.reduce((a, s) => a.add(s.p2), V3(0, 0, 0)).multiplyScalar(1 / SHARDS.length);
    const F1 = V3(gm.x - P1.x, 0, gm.z - P1.z).normalize(), R1 = V3(-F1.z, 0, F1.x); let YAW1 = Math.atan2(-F1.x, -F1.z);      // 森（かけらが落ちた所）のほう・その右・操作開始の向き
    const Wp = onG(P1.clone().addScaledVector(F1, -21).addScaledVector(R1, 13)); Wp.y = P1.y + 15;                           // 大きく引いたカメラ：丘の上の木のわきの高い所
    const Wt = P1.clone().addScaledVector(F1, 46); Wt.y = P1.y + 1.0;
    const H1 = P1.clone().addScaledVector(F0, 0.45).addScaledVector(R0, 0.75).add(V3(0, 1.5, 0)), H2 = P1.clone().addScaledVector(F1, 0.4).addScaledVector(R1, 0.75).add(V3(0, 1.5, 0));      // 妖精が話す所（1 回め・2 回め）
    const atSpot = () => { [player.x, player.z] = [P1.x, P1.z]; };
    const HA = H1.clone();                                             // 引きの間に、妖精が行く所（木の下のエルフの顔の横）
    // 妖精についていく道すじ：丘の上の木から、ふみ分け道を森のほうへ（z ＝ −58 → −46 → −34。森のはしは z ＝ −9 なので、太陽の見える丘の上で止まる）。約 35 m ＝ 歩いて 14 秒くらい
    const WPS = [-58, -46, -34].map((z) => { const [x, zz] = hill.constrain(hill.trailX(z), z); return V3(x, hill.groundH(x, zz), zz); });
    const WD = V3(WPS[0].x - P1.x, 0, WPS[0].z - P1.z).normalize(), angd = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // 後半のもとになる所：B ＝ ゆれが始まった時にエルフがいた所、BF0 ＝ 太陽のあるほう（エルフが見上げる向き）、BR0 ＝ その右。F1・R1・Wp・Wt・H1・H2・S0・かけらの道すじ も、B から決めなおす（setBase）
    const B = V3(0, 0, 0), BF0 = sunH.clone(), BR0 = V3(-sunH.z, 0, sunH.x);
    st.fFrom = V3(0, 0, 0); st.fpos = V3(0, 0, 0); const BUD = V3(0, 0, 0), BUDD = V3(0, 0, -1);
    // 始まりの 1 人称と、そこから引くカメラの数値：LK ＝ 目が向くほう（体の正面を、太陽のあるほうへ少し回した向き）、PB ＝ 弧の手がかり 2（幹のわきの上）、PW ＝ 引ききった所（エルフの横・少しうしろ。幹がエルフにかぶらない側で、たれる花房より低い高さ）、PT ＝ そこで見る先（エルフの少し前）
    const LK = F0.clone().addScaledVector(sunH, 0.45).normalize(), eye = V3(0, 0, 0), lookV = V3(0, 0, 0);
    const PB = P1.clone().addScaledVector(F0, -0.9).addScaledVector(R0, 2.4); PB.y = P1.y + 3.4;
    const PW = P1.clone().addScaledVector(F0, -0.6).addScaledVector(R0, 6.2); PW.y = Math.max(P1.y + 3.3, hill.groundH(PW.x, PW.z) + 2.4);
    const PT = P1.clone().addScaledVector(F0, 0.8); PT.y = P1.y + 1.0;
    const lidsEl = document.createElement('canvas'); lidsEl.id = 'sunLids'; document.body.append(lidsEl);
    // まぶた：黒い面に、目の形（アーモンド形）のすきまをあける。lid ＝ あき具合（0 とじている 〜 1 あいている）
    //   上まぶた・下まぶたは弓なりの曲線（上のほうが大きく動く）。左右のはしはすぼまる。ふちは、まつ毛のかげのようににじませる。
    //   形の横幅は画面の幅に、たての開きは「画面の高さ」と「画面の幅」の小さいほうに合わせる（縦長の画面でも、たてに細長くならない）。0.55 から先は一気に画面の外まで広がる
    const _eye = document.createElement('canvas');
    function eyeMask(w, h, lid, c = _eye) {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.clearRect(0, 0, w, h);
      if (lid >= 0.995) return c;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); if (lid <= 0.004) return c;
      const ref = Math.min(h, w), big = sstep(lid, 0.55, 1), hw = w * (0.4 + 0.25 * lid + 2.6 * big), up = ref * 0.62 * lid + h * 2.6 * big, dn = ref * 0.34 * lid + h * 2.6 * big;
      const cx = w / 2, cy = h * 0.5 + ref * 0.07 * (1 - lid), OFF = w * 8 + 4000;      // 形は画面の外に描き、そのかげ（ぼかし）だけを画面に落とす ＝ やわらかいふち
      g.globalCompositeOperation = 'destination-out'; g.shadowColor = '#000'; g.shadowBlur = ref * (0.05 + 0.07 * lid); g.shadowOffsetX = OFF;
      g.beginPath(); g.moveTo(cx - hw - OFF, cy); g.quadraticCurveTo(cx - OFF, cy - 2 * up, cx + hw - OFF, cy); g.quadraticCurveTo(cx - OFF, cy + 2 * dn, cx - hw - OFF, cy); g.fill();
      g.globalCompositeOperation = 'source-over'; g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0;
      return c;
    }
    const EB = E.clone(), HOME_R = 20;                                // エンディングの場所（歩いてもどったときは、着いた所）・エンディングが始まる、木からの距離（m）
    // 丘の目じるし：3 つそろったあと、始まりの木の所に立つ、やわらかい光の柱（森の木ごしにも見える。文字なしの「ここへもどろう」）
    const homeU = { uT: U.uT, uA: { value: 1 }, uBase: { value: onG(V3(HTc.x, 0, HTc.z)) } };
    const homeGeo = new THREE.BufferGeometry(); homeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3)); homeGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const home = new THREE.Mesh(homeGeo, new THREE.ShaderMaterial({ ...add, depthTest: false, side: THREE.DoubleSide, uniforms: homeU,
      vertexShader: `uniform vec3 uBase; varying vec2 vQ;
        void main(){ vQ = position.xy; vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), uBase - cameraPosition));
          gl_Position = projectionMatrix * viewMatrix * vec4(uBase + vec3(0.0, position.y * 75.0, 0.0) + rt * position.x * 5.5, 1.0); }`,
      fragmentShader: `uniform float uT, uA; varying vec2 vQ;
        void main(){ float w = 1.0 - abs(vQ.x), a = (pow(w, 3.0) * 0.5 + pow(w, 1.3) * 0.16) * pow(1.0 - vQ.y, 1.25) * smoothstep(0.0, 0.03, vQ.y);
          gl_FragColor = vec4(1.0, 0.94, 0.74, a * uA * (0.85 + 0.15 * sin(uT * 1.4))); }` }));
    home.frustumCulled = false; home.renderOrder = 4; home.name = 'sun_home_light'; home.visible = false; scene.add(home);
    hillHome = () => { home.visible = ui.full && !st.ended; homeU.uA.value = 1; };
    walker.cam.ground = Math.max(walker.cam.ground, 0.9);      // 3 人称のカメラを、草の先より上に（丘の斜面で、カメラが背の高い草の中にもぐらない。ゲーム中のこのページだけ）

    // ---- 景色への手入れ（flower_hill.js の物を、名前でさがす。見つからなければ何もしない）
    // 空：夜の月を消す。地平の桃色の明るさをおさえ、地平までしっかり夜の色に（太陽のない世界）
    const SKY_DAWN = { value: 0 };
    { const sky = byName('sky_dome');
      if (sky) { let f = sky.material.fragmentShader;
        f = f.replace(/float mo = [^;]+;/, 'float mo = 0.0;')
          .replace(/(nc \+= vec3\([^)]*\) \* low \* \(0\.05 \+ 0\.5 \* toTree \* toTree \* toTree\));/, '$1 * 0.08; nc *= mix(0.3, 1.0, smoothstep(0.0, 0.5, y));')
          .replace(/(nc = mix\(nc, vec3\([^)]*\), smoothstep\(0\.0, -0\.2, y\)\));/, '$1 * 0.3;');
        // 夜明け：夜 → 金色 → 昼の青（uSunDawn ＝ 金色のこさ。太陽のがわほど強い）
        const sd = SUN, dawnGLSL = `float sdS = max(dot(d, vec3(${sd.x.toFixed(4)}, ${sd.y.toFixed(4)}, ${sd.z.toFixed(4)})), 0.0);
          vec3 dawn = mix(vec3(1.0, 0.7, 0.42), vec3(0.98, 0.86, 0.64), smoothstep(0.0, 0.35, y)); dawn = mix(dawn, vec3(0.62, 0.68, 0.9), smoothstep(0.3, 0.9, y));
          dawn += vec3(1.0, 0.78, 0.45) * (pow(sdS, 3.0) * 0.45 + pow(sdS, 24.0) * 0.4);
          col = mix(col, dawn, uSunDawn * smoothstep(-0.25, 0.05, y));
          gl_FragColor = vec4(col, 1.0); }`;
        f = f.replace('uniform float uFpTime, uNight;', 'uniform float uFpTime, uNight, uSunDawn;').replace(/gl_FragColor = vec4\(col, 1\.0\); \}\s*$/, dawnGLSL);
        sky.material.uniforms.uSunDawn = SKY_DAWN;
        if (f !== sky.material.fragmentShader) { sky.material.fragmentShader = f; sky.material.needsUpdate = true; } } }
    // 野の花：uClose（0〜1）でとじる（花が小さくなり、茎がうなだれ、色がしずむ）。始まりは、カメラの手前から奥へ波のように順に（uWave）。エンディングで開くときは、ばらばらに少しずつずらす。光る花は、とじない
    { const fl = byName('meadow_flowers'), anchor = 'vec3 tip = fRoot + vec3(0.0, fh, 0.0) + tipOff;';
      if (fl) {
        const m = fl.material, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = (sh, r) => {
          prev.call(m, sh, r);
          if (!sh.vertexShader.includes(anchor)) return;
          sh.uniforms.uSunClose = U.uClose; sh.uniforms.uSunWave = U.uWave;
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSunClose; uniform vec4 uSunWave;')
            .replace(anchor, `float sRnd = fract(aB.w * 5.3), sWd = clamp(length(fRoot.xz - uSunWave.xy) / uSunWave.z, 0.0, 1.0), sE = mix(sRnd * 0.55, sWd * 0.62 + sRnd * 0.08, uSunWave.w);
            float sc = smoothstep(sE, sE + mix(0.45, 0.3, uSunWave.w), uSunClose);
            fs *= 1.0 - 0.58 * sc; fh *= 1.0 - 0.2 * sc; headCol *= 1.0 - 0.3 * sc;
            tipOff = tipOff * (1.0 - 0.6 * sc) + vec3(sin(fph) * 0.36, -0.12, cos(fph) * 0.36) * fh * sc;
            ${anchor}`);
        };
        m.customProgramCacheKey = () => `${prevKey()}|sunClose2`; m.needsUpdate = true;
      } }
    const butterflies = byName('butterflies'), petalStream = byName('petal_stream');
    // 花の開き具合：flower_hill.js の setBloom（本当につぼみに閉じる花）があれば、それで。uClose（縮む・うつむく）は 0 のまま。なければ、前の uClose
    const BLOOM = typeof hill.setBloom === 'function';
    const setOpen = (t, wave, spread = 0.3) => { if (BLOOM) { U.uClose.value = 0; hill.setBloom(t, { spread, wave }); } else U.uClose.value = 1 - t; };
    // 地平線の大樹：暗い世界では、黒っぽい影になる（まわりのにじむ光も弱める）
    const farMats = [], farTree = byName('far_bigtree'), farGlow = byName('far_bigtree_glow');
    if (farTree) farTree.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) farMats.push(o.material); });
    const glow0 = farGlow && farGlow.material.uniforms && farGlow.material.uniforms.uAmt ? farGlow.material.uniforms.uAmt.value : null;
    const lumen = ['lumen_flowers', 'lumen_glow'].map(byName).filter(Boolean), floraGlow = byName('flora_glow');
    const flora0 = floraGlow && floraGlow.material.uniforms && floraGlow.material.uniforms.uAmt ? floraGlow.material.uniforms.uAmt.value : null;
    hillDark = (v) => {
      for (const m of farMats) m.color.setRGB(lerp(1, 0.2, v), lerp(1, 0.2, v), lerp(1, 0.34, v));
      if (glow0 !== null) farGlow.material.uniforms.uAmt.value = glow0 * lerp(1, 0.1, v);
      if (petalStream) petalStream.visible = v < 0.5;
      for (const m of lumen) m.visible = v < 0.6;                    // 光る花・花や入り口のにじむ光も消す（かけらの光だけが残る）
      if (flora0 !== null) floraGlow.material.uniforms.uAmt.value = flora0 * lerp(1, 0.08, v);
    };

    // ---- 太陽（板 1 枚。まん中の丸が 3 つの かけら にわれる。われ目は UI と同じ 90°・210°・330°）
    const sunU = { uPos: { value: V3(0, 0, 0) }, uT: U.uT, uCrack: { value: 0 }, uSplit: { value: 0 }, uAlive: { value: 1 }, uFlash: { value: 0 }, uShake: { value: 0 }, uRays: { value: 0 }, uDim: { value: 1 } };
    const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...add, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, uniforms: sunU,
      vertexShader: `uniform vec3 uPos; varying vec2 vP;
        void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); mv.xy += position.xy * ${SUN_SIZE.toFixed(1)}; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT, uCrack, uSplit, uAlive, uFlash, uShake, uRays, uDim; varying vec2 vP;
        float jag(float r){ return 0.11 * sin(r * 9.0 + 1.0) + 0.05 * sin(r * 23.0); }
        float sector(vec2 v){ return mod(floor((atan(v.y, v.x) - 1.5708 + jag(length(v))) / 2.0944), 3.0); }
        void main(){
          vec2 p = vP * 5.5 + vec2(sin(uT * 47.0), cos(uT * 53.0)) * 0.05 * uShake;
          float r = length(p), ang = atan(p.y, p.x), k = sector(p), bis = 1.5708 + (k + 0.5) * 2.0944;
          vec2 q = p - vec2(cos(bis), sin(bis)) * uSplit;                                        // われたあと：かけらは外へはなれる
          float disc = smoothstep(1.0, 0.93, length(q)) * step(abs(sector(q) - k), 0.5) * uAlive;
          float f = fract((ang - 1.5708 + jag(r)) / 2.0944), d = min(f, 1.0 - f) * 2.0944 * r;
          float bi = mod(floor((ang - 1.5708 + jag(r)) / 2.0944 + 0.5), 3.0), cl = clamp(uCrack * 3.0 - bi, 0.0, 1.0) * 1.25;                      // ひびは 1 本ずつ：1 本め → 2 本め → 3 本め
          float crack = (1.0 - smoothstep(0.02, 0.05 + 0.06 * uCrack, d)) * step(r, cl) * step(0.001, cl) * (1.0 - step(0.02, uSplit));   // まん中から外へのびる（こい だいだい色の線）
          vec3 body = mix(vec3(1.0, 0.9, 0.55) * 1.3, vec3(0.8, 0.36, 0.06), crack) * (1.0 + 0.3 * uShake * sin(uT * 31.0));
          float glow = (exp(-r * r * 0.22) * 0.4 + pow(max(1.0 - r / 5.5, 0.0), 3.0) * 0.3) * (1.0 - smoothstep(0.0, 0.45, uSplit)) * (1.0 + 0.6 * uShake) * uAlive;
          float ray = (pow(0.5 + 0.5 * sin(ang * 7.0 + uT * 0.12), 5.0) + 0.6 * pow(0.5 + 0.5 * sin(ang * 13.0 - uT * 0.2 + 1.3), 8.0)) * exp(-r * 0.42) * smoothstep(0.9, 1.6, r) * uRays;   // 太陽からさす光のすじ
          vec3 col = (body * disc + vec3(1.0, 0.82, 0.5) * (glow + ray) * (1.0 - disc)) * uDim;
          col += vec3(1.0, 0.97, 0.88) * uFlash * (exp(-r * 0.9) * 2.0 + 0.25 * smoothstep(1.0, 0.0, length(vP)));   // 強い光（われるしゅんかん・もどるしゅんかん）
          float edge = smoothstep(1.0, 0.75, length(vP));
          gl_FragColor = vec4(col * edge, disc * edge); }` }));                                 // 色は足し算、太陽の丸の中だけは上書き（ひびを暗い線で描ける）
    sunMesh.frustumCulled = false; sunMesh.renderOrder = -850; sunMesh.name = 'sun_disc'; scene.add(sunMesh);

    // ---- エルフが空を見上げる（首と頭の骨を後ろへたおす。GLB に look_up のクリップができたら、ここを入れかえる）
    let bones = null; const _bq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _bx = V3(1, 0, 0);
    hillAfter = () => {
      const av = walker.avatar; if (!av) return;
      if (!bones) bones = ['Neck', 'Head'].map((n) => av.model.getObjectByName(n)).filter(Boolean).map((b) => ({ b, q: new THREE.Quaternion() }));
      for (const o of bones) if (!o.set || o.b.quaternion.angleTo(o.set) > 1e-5) o.q.copy(o.b.quaternion);      // アニメーションが入れた向きをおぼえる（自分がたおした向きは、おぼえない）
    };
    // ---- 風と時間：風が止まる間は、景色の時間（草・花・蝶・花びら・雲のゆれ）をほとんど止める。flower_hill.js が毎フレーム入れる時間から、止めたぶんを引く
    const bfly = byName('butterflies'), fpTime = bfly && bfly.material.uniforms ? bfly.material.uniforms.uFpTime : null;
    let windU = null; const WIND0 = hill.HILL.wind;
    import('./nature.js').then((m) => { windU = m.windU; }).catch(() => {});
    const calmAt = (s) => sstep(s, TL.follow, TL.follow + 0.8) * (1 - sstep(s, TL.crack - 0.1, TL.crack + 0.5));      // 1 ＝ 風が止まっている
    const HOLD = [0]; for (let i = 1; i <= Math.ceil(TL.end / 0.05) + 1; i++) HOLD.push(HOLD[i - 1] + 0.94 * calmAt((i - 0.5) * 0.05) * 0.05);      // 止めた時間の合計（s ごと）
    const holdAt = (s) => { const k = clamp(s, 0, TL.end) / 0.05, i = Math.min(Math.floor(k), HOLD.length - 2); return lerp(HOLD[i], HOLD[i + 1], k - i); };

    // ---- かけら（尾・頭の光）。3 つを 1 回ずつで描く。落ちた先は、上の光のすじ
    const trailGeo = (() => {
      const N = 22, pos = [], idx = [];
      for (let j = 0; j <= N; j++) pos.push(j / N, -1, 0, j / N, 1, 0);
      for (let j = 0; j < N; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
    })();
    const trails = mesh(inst(trailGeo), {
      vertexShader: `${SH_GLSL} varying vec2 vQ; varying float vA;
        void main(){
          float pr = prog(), uh = ease(pr);
          float len = 0.24 * smoothstep(0.0, 0.25, pr) * (1.0 - smoothstep(0.86, 1.0, pr));
          float u = max(uh - position.x * len, 0.0);
          vec3 c = bez(u), tg = normalize(bez(u + 0.004) - bez(u - 0.004)), sd = normalize(cross(tg, c - cameraPosition));
          vQ = position.xy; vA = step(0.0001, pr) * step(pr, 0.9999);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + sd * position.y * (12.0 * pow(1.0 - position.x, 1.3) + 1.0) * mix(1.0, length(c - cameraPosition) * 0.0016, uNear), 1.0); }`,
      fragmentShader: `varying vec2 vQ; varying float vA;
        void main(){ float w = 1.0 - abs(vQ.y), a = pow(w, 1.5) * pow(1.0 - vQ.x, 1.5) * vA;
          gl_FragColor = vec4(mix(${GOLD}, ${PALE}, pow(w, 4.0) * (1.0 - vQ.x)) * 1.3, a); }` }, 'sun_shard_trails', 8);
    const heads = mesh(inst(new THREE.PlaneGeometry(2, 2)), {
      vertexShader: `${SH_GLSL} varying vec2 vQ; varying float vA;
        void main(){
          float pr = prog(); vQ = position.xy; vA = smoothstep(0.0, 0.05, pr) * (1.0 - smoothstep(0.95, 1.0, pr));
          vec4 mv = viewMatrix * vec4(bez(ease(pr)), 1.0); mv.xy += position.xy * mix(52.0, -mv.z * 0.05, uNear) * (1.0 + 0.12 * sin(uT * 28.0 + iD.y * 9.0));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec2 vQ; varying float vA;
        void main(){ float d = length(vQ), g = pow(max(1.0 - d, 0.0), 3.0);
          float a = g + smoothstep(0.2, 0.0, d) * 1.6 + pow(max(1.0 - d, 0.0), 2.0) * smoothstep(0.07, 0.0, min(abs(vQ.x), abs(vQ.y))) * 0.9;   // にじみ ＋ しん ＋ 十字のかがやき
          gl_FragColor = vec4(mix(${GOLD}, ${PALE}, smoothstep(0.5, 0.0, d)), a * vA); }` }, 'sun_shard_heads', 9);
    function setBase(x, z) {
      B.set(x, hill.groundH(x, z), z);
      BUDD.copy(LK).setY(0).normalize(); BUD.copy(P1).addScaledVector(F0, 0.9).addScaledVector(R0, 0.4); BUD.y = hill.groundH(BUD.x, BUD.z) + 0.95;      // 花がつぼみになる絵のカメラ：目ざめた木の下の花畑（手前に大きな花）、丘のほうを向く
      F1.set(gm.x - x, 0, gm.z - z).normalize(); R1.set(-F1.z, 0, F1.x); YAW1 = Math.atan2(-F1.x, -F1.z);
      onG(Wp.copy(B).addScaledVector(F1, -21).addScaledVector(R1, 13)); Wp.y = B.y + 15; Wt.copy(B).addScaledVector(F1, 46); Wt.y = B.y + 1.0;
      H1.copy(B).addScaledVector(BF0, 0.45).addScaledVector(BR0, 0.75); H1.y += 1.5; H2.copy(B).addScaledVector(F1, 0.4).addScaledVector(R1, 0.75); H2.y += 1.5;
      onG(S0.copy(B).addScaledVector(BF0, 3)); S0.y += 1.4;            // 太陽を見上げるカメラ
      P0.copy(S0).addScaledVector(SUN, SUN_DIST); shU.uP0.value.copy(P0);
      SHARDS.forEach((s, i) => { s.p1.copy(P0).lerp(s.p2, 0.5).add(V3(-330 + i * 70, 250 + i * 80, 0)); });
      for (const m of [trails, heads, beams]) { const a = m.geometry.attributes.iP1; SHARDS.forEach((s, i) => a.setXYZ(i, s.p1.x, s.p1.y, s.p1.z)); a.needsUpdate = true; }
      st.yawQ = YAW1; st.pitchQ = START.pitch; st.fFrom.copy(H1);
    }
    setBase(WPS[WPS.length - 1].x, WPS[WPS.length - 1].z);

    // ---- ホタル（カメラのまわりの箱の中。暗くなってから出る）と、エルフのまわりのほのかな光
    const fireU = { uT: U.uT, uPR: U.uPR, uFire: { value: 0 } };
    const fireflies = (() => {
      const n = LITE ? 45 : 80, s = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) s[i] = Math.random();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 4));
      const pts = new THREE.Points(g, new THREE.ShaderMaterial({ ...add, uniforms: fireU,
        vertexShader: `attribute vec4 aS; uniform float uT, uPR, uFire; varying float vA;
          void main(){
            vec3 box = vec3(30.0, 3.4, 30.0);
            vec3 base = aS.xyz * box + vec3(sin(uT * 0.31 + aS.w * 40.0) * 1.3, sin(uT * 0.47 + aS.x * 30.0) * 0.4, cos(uT * 0.27 + aS.y * 50.0) * 1.3);
            vec3 p = cameraPosition + mod(base - cameraPosition + 0.5 * box, box) - 0.5 * box; p.y -= 0.5;
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            float dist = -mv.z; gl_PointSize = clamp(0.1 * 900.0 * uPR / max(dist, 0.5), 2.0 * uPR, 12.0 * uPR);
            float bl = pow(max(sin(uT * (0.9 + aS.w * 1.3) + aS.x * 40.0), 0.0), 2.0);                       // ゆっくり明滅
            vA = uFire * bl * smoothstep(0.6, 2.0, dist) * (1.0 - smoothstep(11.0, 15.0, dist)); }`,
        fragmentShader: `varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = pow(max(1.0 - d, 0.0), 2.0) * vA; if (a < 0.005) discard; gl_FragColor = vec4(vec3(0.86, 1.0, 0.45) * 1.3, a); }` }));
      pts.frustumCulled = false; pts.renderOrder = 7; pts.name = 'sun_fireflies'; scene.add(pts); return pts;
    })();
    // 光の粒：夜明けに、丘の上の地面から ふわっと舞い上がる金色の粒（カメラのまわりではなく、丘の上の 26 m の円の中）
    const moteU = { uT: U.uT, uPR: U.uPR, uA: { value: 0 }, uC: { value: V3(HTc.x, hill.groundH(HTc.x, HTc.z), HTc.z) } };
    const moteObj = (() => {
      const n = LITE ? 70 : 130, a = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) a[i] = Math.random();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(a, 4));
      const pts = new THREE.Points(g, new THREE.ShaderMaterial({ ...add, uniforms: moteU,
        vertexShader: `attribute vec4 aS; uniform float uT, uPR, uA; uniform vec3 uC; varying float vA;
          void main(){ float r = sqrt(aS.x) * 26.0, an = aS.y * 6.2832, life = 7.0 + aS.w * 4.0, ph = fract(uT / life + aS.z);
            vec3 p = uC + vec3(cos(an) * r + sin(uT * 0.4 + aS.z * 20.0) * 0.6, -0.5 + ph * (5.0 + aS.w * 4.0), sin(an) * r + cos(uT * 0.33 + aS.w * 20.0) * 0.6);
            vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float dist = -mv.z;
            gl_PointSize = clamp(0.09 * 900.0 * uPR / max(dist, 0.5), 1.5 * uPR, 9.0 * uPR);
            vA = uA * smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.6, 1.0, ph)) * smoothstep(0.5, 2.0, dist); }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0, a = pow(max(1.0 - d, 0.0), 2.0) * vA; if (a < 0.004) discard; gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * 1.2, a); }` }));
      pts.frustumCulled = false; pts.renderOrder = 7; pts.name = 'sun_dawn_motes'; pts.visible = false; scene.add(pts); return pts;
    })();
    const motes = (a) => { moteU.uA.value = a; moteObj.visible = a > 0.003; };
    const haloU = { uPos: { value: V3(0, 0, 0) }, uA: { value: 0 }, uT: U.uT };
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...add, uniforms: haloU,
      vertexShader: 'uniform vec3 uPos; varying vec2 vP; void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(uPos, 1.0); mv.xy += position.xy * 2.6; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uA, uT; varying vec2 vP; void main(){ float a = pow(max(1.0 - length(vP), 0.0), 2.0) * uA * (0.9 + 0.1 * sin(uT * 1.3)); gl_FragColor = vec4(1.0, 0.9, 0.66, a); }' }));
    halo.frustumCulled = false; halo.renderOrder = 6; halo.name = 'sun_elf_halo'; scene.add(halo);

    // ---- 始まりの演出（s 秒めの見た目を、ぜんぶ s だけから決める ＝ どの時点でも止め絵にできる）
    const _b = V3(0, 0, 0), _c = V3(0, 0, 0), _sum = V3(0, 0, 0);
    const bez = (s, u, out) => out.copy(P0).lerp(s.p1, u).lerp(_b.copy(s.p1).lerp(s.p2, u), u);
    const END = 999;                                                    // 演出のあと（暗い花の丘。光のすじは出たまま）
    const clipOK = (n) => { const av = walker.avatar; return !!(av && av.info && av.info.clips && av.info.clips.includes(n)); };      // エルフの GLB に、そのしぐさがあるか
    const _f = V3(0, 0, 0), _fd = V3(0, 0, 0), headPos = V3(0, 0, 0);
    st.cpos = V3(0, 0, 0); st.ctgt = V3(0, 0, 0); st.fbase = V3(0, 0, 0);
    const LOOKD = 4.2;                                                // idle_look（左右を見まわす）の長さ
    const _qf = V3(0, 0, 0), qFwd = () => _qf.set(-Math.sin(st.yawQ || 0), 0, -Math.cos(st.yawQ || 0));      // ゆれた時に、エルフが向いていたほう（歩いてきた向き）。右 ＝ (−z, x)
    function apply(s) {
      st.s = s; U.uS.value = s; st.shot = s < TL.end;                 // shot ＝ 始まりの演出のカメラ（場面ごとに、場所と見る先を決める）
      st.endG = false; st.endShot = 0; st.uiA = null; if (st.pathMode === 'end') introPath(); if (circle) circle.set({ amount: 0 }); shU.uNear.value = 0; shU.uEase.value = 1; shU.uT0.value = TL.fly0; shU.uDur.value = TL.fly; shU.uFat.value = s < TL.end ? 1.7 : 1; U.uWave.value.set(BUD.x, BUD.z, 26, 1);
      // 地面がゆれると、風が止まり（景色の時間をほとんど止める）、急に日がかげる（1 段階め）。妖精が知らせるころ、太陽にひび → 広がる → われる → 真っ暗（2 段階め）
      sunU.uShake.value = st.shake = s < TL.crack ? sstep(s, TL.quake + 0.5, TL.crack - 0.2) : 0;
      sunU.uCrack.value = s < TL.quake ? 0 : lerp(0.12, 1, clamp((s - TL.quake) / (TL.crack - 0.15 - TL.quake), 0, 1)); sunU.uRays.value = 0;
      st.hold = holdAt(s); if (windU) windU.uWind.value = lerp(WIND0, 0.06, calmAt(s));
      const pre = s < TL.crack + 0.3 ? 1 - sstep(s, TL.crack - 0.05, TL.crack + 0.3) : 0, dim = sstep(s, TL.follow + 0.6, TL.follow + 1.4) * pre;
      st.quakeK = s > TL.follow ? sstep(s, TL.follow, TL.follow + 0.25) * (1 - sstep(s, TL.follow + 2.2, TL.follow + 3.2)) : 0;      // 地面のゆれ（カメラ）
      sunU.uDim.value = 1 - 0.42 * dim;
      sunU.uSplit.value = sstep(s, TL.crack, TL.crack + 0.9) * 1.4; sunU.uAlive.value = 1 - sstep(s, TL.fly0 - 0.1, TL.fly0 + 0.5);      // われた 3 つは、飛び立つまで空に残る
      sunU.uFlash.value = s < TL.crack ? Math.pow(sstep(s, TL.crack - 0.4, TL.crack), 3) * 0.6 : Math.exp(-(s - TL.crack) * 7.0) * 1.5;
      sunMesh.visible = sunU.uAlive.value > 0 || sunU.uFlash.value > 0.01;
      trails.visible = heads.visible = s > TL.fly0 && s < TL.fly0 + TL.fly + TL.stagger * SHARDS.length + 0.2;
      const night = Math.max(0.34 * dim, sstep(s, TL.dark[0], TL.dark[1])); setNight(night);
      { const k = clamp((s - TL.close[0]) / (TL.close[1] - TL.close[0]), 0, 1); if (BLOOM) setOpen(1 - k, [BUD.x + BUDD.x * 70, BUD.z + BUDD.z * 70, 80]); else U.uClose.value = k; }      // 花がつぼみに：手前から奥へ（setBloom の波の中心を、カメラの向く先の遠くにおく）
      if (scene.fog) scene.fog.near = -1;
      if (butterflies) butterflies.visible = s < TL.dark[0] + 1.6;
      fireU.uFire.value = 0; fireflies.visible = false;               // 光のない世界：ホタルは出さない
      // エルフ：寝ている → 起きる → 見上げる → かけらを追って、森のほうへふり返る。しぐさのクリップ（sleep_lean・wake_up・look_up）があれば使い、なければ体と首のかたむきで代える
      const wake = clamp((s - TL.wake[0]) / (TL.wake[1] - TL.wake[0]), 0, 1);
      st.gest = s < TL.wake[0] ? ['sleep_lean', s, 'loop'] : s < TL.wake[1] ? ['wake_up', wake, 'frac'] : s >= TL.look + 0.2 && s < TL.look + 0.2 + LOOKD ? ['idle_look', s - TL.look - 0.2, 'sec'] : s >= TL.notice && s < TL.crack + 2.0 ? ['look_up', s - TL.notice, 'sec'] : s >= TL.nod[0] && s < TL.nod[1] && clipOK('nod') ? ['nod', (s - TL.nod[0]) / (TL.nod[1] - TL.nod[0]), 'frac'] : null;
      { const u = clamp((s - TL.nod[0]) / (TL.nod[1] - TL.nod[0]), 0, 1); st.nodK = u < 0.32 ? sstep(u, 0, 0.32) : 1 - sstep(u, 0.42, 1); }      // うなずく（nod のクリップがないときは、首と頭を前へたおして もどす）
      st.panic = sstep(s, TL.panic[0], TL.panic[0] + 0.3) * (1 - sstep(s, TL.panic[1] - 0.5, TL.panic[1]));      // 妖精の光がふるえる（あわてている）
      st.lean = 1 - sstep(wake, 0.15, 0.8);                           // 1 ＝ 木にもたれている、0 ＝ 立っている
      // 目（1 人称）：lid ＝ まぶたのあき具合（0 とじている 〜 1 あいている。ゆっくりあく → いちど とじかける → あく → まばたき 1 回）、blur ＝ ぼやけ（px）
      const O = TL.open[0], seg = (a, b, v0, v1) => lerp(v0, v1, sstep(s, O + a, O + b));
      st.lid = s < O ? 0 : s < O + 0.9 ? seg(0, 0.9, 0, 0.42) : s < O + 1.3 ? seg(0.9, 1.3, 0.42, 0.06) : s < O + 2.2 ? seg(1.3, 2.2, 0.06, 0.85) : s < O + 2.5 ? seg(2.2, 2.5, 0.85, 1) : s < O + 2.7 ? seg(2.5, 2.7, 1, 0.12) : seg(2.7, 3.0, 0.12, 1);
      st.blur = s < TL.open[1] + 0.4 ? 16 * (1 - sstep(s, O, TL.open[1] + 0.4)) : 0;
      st.eyes = 1 - sstep(s, O + 1.3, O + 2.2);                       // エルフの目（外から見えるのは、引いてから）
      st.lookK = sstep(s, TL.notice, TL.notice + 1.4) * (1 - sstep(s, TL.crack + 0.9, TL.crack + 2.0));
      const turn = sstep(s, TL.wide + 0.3, TL.wide + 2.3);              // 引きの絵の間に、エルフと妖精は森のほうへ向きなおる
      if (st.shot && s < TL.follow) {                                 // 前半：木の下。引きの終わりに、妖精が待つほう（道の先）を向く
        _fd.copy(F0).lerp(WD, sstep(s, TL.talkH[1], TL.follow)).normalize(); player.x = P1.x; player.z = P1.z; player.yaw = Math.atan2(-_fd.x, -_fd.z); player.pitch = START.pitch;
      } else if (st.shot && s > TL.follow) {                          // 後半：見上げるまでは、歩いてきた向きのまま（カメラを回さない）。見上げる絵からは太陽のほう → かけらが散らばる間に、森のほうへ
        player.x = B.x; player.z = B.z;
        if (s < TL.wide) { const sy = Math.atan2(-BF0.x, -BF0.z), k = sstep(s, TL.turn[0], TL.turn[1]); player.yaw = st.yawQ + angd(sy - st.yawQ) * k; player.pitch = s < TL.look ? st.pitchQ : START.pitch; }
        else { _fd.copy(BF0).lerp(F1, turn).normalize(); player.yaw = Math.atan2(-_fd.x, -_fd.z); player.pitch = START.pitch; }
      }
      // カメラ：演出のカメラ（1）か、いつもの後ろからのカメラ（0）か。なめらかに混ぜず、向きが大きく変わる所で切りかえる。
      //   ついていく間・ゆれ・「おかしいみたい…」までは、いつものカメラのまま（場所も向きも変えない。画面がゆれるだけ）
      st.cutW = s < TL.follow ? 1 : s < TL.look ? 0 : s < TL.backCut ? 1 : 0;
      { const id = s < TL.follow ? 0 : s < TL.look ? 1 : s < TL.notice ? 2 : s < TL.cut ? 8 : s < TL.wide ? 3 : s < TL.bud ? 4 : s < TL.cut2 ? 5 : s < TL.backCut ? 6 : 7; if (id !== st.shotId) { st.shotId = id; st.fairySnap = true; } }      // 絵が切りかわったコマ：妖精は、新しい場所にそのまま出す
      st.uiK = -1; showUI(s > TL.cut2); if (hill.clearArea) hill.clearArea(0, 0, 0, false);                                // 上の太陽マークは、かけらが落ちきってから出す
      // 妖精：はじめは目の前（1 人称の顔のすぐ前。場所は hillPlace が、目の場所から決める）→ カメラが引く間に、エルフの顔の横へ →（ついていく間は followTick）→ ゆれたら、エルフのそばへもどる → ひとこと → 森のほうを向く → ひとこと → 森のほうへ飛び、小さくはねて消える
      const Fy = TL.fairy, on = s < Fy.out[1]; let fa = 0, away = 0;
      fairy.visible = on; st.fm = sstep(s, TL.pull[0] + 0.6, TL.pull[1] - 0.8);      // 0 ＝ 目の前、1 ＝ いつもの場所
      if (on) {
        const bob = Math.sin(U.uT.value * 2.6) * 0.05; away = sstep(s, Fy.out[0], Fy.out[1] - 0.4);
        if (s <= TL.follow) _f.copy(HA);
        else if (s < TL.notice) { const f = qFwd(); _f.set(B.x + f.x * 0.6 - f.z * 1.0, B.y + 1.6, B.z + f.z * 0.6 + f.x * 1.0); _f.lerpVectors(st.fFrom, _f, sstep(s, TL.follow + 1.0, TL.follow + 2.4)); }      // ゆれたら 1 秒止まってから、エルフの右ななめ前へ（エルフの頭にかさならない所）
        else if (s < TL.wide) _f.copy(H1);                         // ふり向いたあと：太陽のがわの、エルフのそば      // ゆれたら 1 秒、その場でぴたっと止まる（ため）→ エルフのななめ前（後ろからのカメラに映る所）へ
        else _f.copy(H1).lerp(H2, turn).addScaledVector(F1, 7 * away);
        _f.y += 0.9 * away + bob + 0.22 * st.lookK + 0.25 * Math.sin(Math.PI * clamp((s - Fy.out[1] + 0.9) / 0.5, 0, 1));
        fa = 1 - sstep(s, Fy.out[1] - 0.4, Fy.out[1]);
        st.fbase.copy(_f); fairyU.uPos.value.copy(_f); fairyU.uA.value = fa; haloU.uPos.value.copy(_f);
      }
      haloU.uA.value = fa * night * 0.3; st.elfLit = fa * night * (1 - away);      // 暗い世界では、妖精の小さな光がエルフを照らす
      { const ln = LINES.find((l) => s >= l.w[0] && s < l.w[1] && (st.phase === 'seek' || !st.done[l.i])); showTalk(ln ? ln.i : -1); }      // 押して送ったセリフは、もう出さない
      refreshBeams();
    }
    // 場面ごとのカメラ（場所 st.cpos・見る先 st.ctgt）。1 つの絵で、カメラの動きは 1 つだけ：1 人称 → 引く（ひとつづきの弧）→［いつものカメラ：ついていく・ゆれ］→ 見上げる顔 → 太陽（固定）→ 丘の引き（固定）→ エルフと妖精 →［いつものカメラ］
    const _pd = V3(0, 0, 0);
    // 引きの絵のカメラ：B の後ろ・上から、3 か所のまん中を見る。画面の形（横長・縦長）に合わせて、3 か所が左右の 80% におさまる所まで下がる。柱の根もとは画面の下 1/3 あたり（上は、光の落ちてくる空）
    const WF = { asp: 0, fov: 0, back: 0, c: V3(0, 0, 0), d: V3(0, 0, 0), f: V3(0, 0, 0) };
    function wideFit() {
      if (WF.asp === camera.aspect && WF.fov === camera.fov && WF.bx === B.x && WF.bz === B.z) return;
      WF.asp = camera.aspect; WF.fov = camera.fov; WF.bx = B.x; WF.bz = B.z;
      const f = WF.f.set(gm.x - B.x, 0, gm.z - B.z).normalize(), r = V3(-f.z, 0, f.x), th = Math.tan(camera.fov * D2R / 2), hh = Math.atan(th * camera.aspect) * 0.8;
      for (let back = 20; back <= 400; back += 5) {
        WF.back = back; onG(WF.c.copy(B).addScaledVector(f, -back)); WF.c.y = Math.max(WF.c.y + 6, B.y + 26 + back * 0.12);      // 森の木の上から見わたす高さ
        if (SHARDS.every((sh) => { const v = V3(sh.p2.x - WF.c.x, 0, sh.p2.z - WF.c.z), z = v.dot(f); return z > 1 && Math.abs(Math.atan2(v.dot(r), z)) < hh; })) break;
      }
      const dist = Math.hypot(gm.x - WF.c.x, gm.z - WF.c.z), down = Math.atan2(WF.c.y - B.y - 6, dist), pitch = -down + Math.atan(th * 0.36);      // 根もとが画面のまん中より 36% 下
      WF.d.copy(f).multiplyScalar(Math.cos(pitch)); WF.d.y = Math.sin(pitch);
    }
    function shotCam(s, t) {
      const Y = B.y, c = st.cpos, g = st.ctgt;
      if (s < TL.follow) {
        // 1 人称（エルフの目）：目 ＝ 頭の骨の少し前・上（顔や髪がカメラに入らない所）。前（太陽のある空のほう）を見る。寝ている間は少し見上げ、立つと水平に近く
        const wk = sstep(s, TL.wake[0], TL.wake[1]), pt = lerp(0.36, 0.12, wk), pk = sstep(s, TL.pull[0], TL.pull[1]);
        eye.copy(headPos).addScaledVector(LK, 0.2); eye.y += 0.07;
        lookV.copy(LK).multiplyScalar(Math.cos(pt)); lookV.y = Math.sin(pt);
        // 引く：目の所から、頭の上へ抜けて、幹のわきを通り、後ろ・横の高い所へ（ひとつづきの弧。カットなし）。見る先は、前の遠くから、エルフの少し先の丘へ
        _c.copy(eye).addScaledVector(LK, -0.3); _c.y += 0.95;                                  // 弧の手がかり 1：頭の上
        const k = pk * pk * (3 - 2 * pk), a = (1 - k) ** 3, b = 3 * k * (1 - k) ** 2, d = 3 * k * k * (1 - k), e = k ** 3;
        c.set(a * eye.x + b * _c.x + d * PB.x + e * PW.x, a * eye.y + b * _c.y + d * PB.y + e * PW.y, a * eye.z + b * _c.z + d * PB.z + e * PW.z);
        // 向き：1 人称の向き（lookV）から、引ききった所でエルフの少し前を見る向きへ、同じ早さの配分で回す（1 秒に 45° まで）。引ききったあとは動かさない
        _pd.copy(PT).sub(PW).normalize(); const om = Math.acos(clamp(lookV.dot(_pd), -1, 1)), so = Math.sin(om);
        if (so > 1e-4) _pd.multiplyScalar(Math.sin(pk * om) / so).addScaledVector(lookV, Math.sin((1 - pk) * om) / so); else _pd.copy(lookV);
        g.copy(c).addScaledVector(_pd, 10); st.pullDeg = om * 180 / Math.PI;
      } else if (s < TL.notice) {                                                                         // きょろきょろ：エルフの正面ななめ（左前）。カメラは固定
        const f = qFwd(); c.set(B.x + f.x * 2.3 + f.z * 0.9, Y + 1.4, B.z + f.z * 2.3 - f.x * 0.9); g.set(B.x, Y + 1.2, B.z);
      } else if (s < TL.cut) {                                                                            // ふり向いて見上げる顔（太陽のがわの正面ななめ）。カメラは固定
        c.copy(B).addScaledVector(BF0, 1.9).addScaledVector(BR0, -0.85); c.y = Y + 1.45; g.copy(B).addScaledVector(BR0, 0.3); g.y = Y + 1.45;
      } else if (s < TL.wide) {                                                                           // 太陽：カメラは固定（ひびが入る間、画面がふるえるだけ）
        c.copy(S0); g.copy(c).addScaledVector(SUN, 600);
        g.x += Math.sin(t * 43) * 2.4 * st.shake; g.y += Math.cos(t * 37) * 2.4 * st.shake;
      } else if (s < TL.bud) {                                                                            // 森の向こうまで見わたす高い引き：3 か所（光の落ちる所）が、横にも縦にも画面に入る所まで下がる。ゆっくり前へ寄るだけ
        wideFit(); const k = sstep(s, TL.wide, TL.bud); c.copy(WF.c).addScaledVector(WF.f, WF.back * 0.07 * k); g.copy(c).addScaledVector(WF.d, 100);
      } else if (s < TL.cut2) {                                                                           // 花に寄った低い絵（手前に花、奥に丘の花畑）。ごくゆっくり寄るだけ
        c.copy(BUD).addScaledVector(BUDD, 0.35 * (s - TL.bud) / (TL.cut2 - TL.bud)); g.copy(c).addScaledVector(BUDD, 5); g.y = c.y - 0.75;      // 手前の花を少し見おろす
      } else {                                                                                            // エルフと妖精（正面ななめ）。カメラは固定
        c.copy(B).addScaledVector(F1, 2.0).addScaledVector(R1, -1.0); c.y = Y + 1.3; g.copy(B).addScaledVector(R1, 0.3); g.y = Y + 1.3;
      }
      c.y = Math.max(c.y, hill.groundH(c.x, c.z) + 0.3);
    }
    // しぐさ（player_avatar.js の playOnce）を、演出の時間に合わせて動かす。クリップがなければ何もしない
    function applyGesture() {
      const av = walker.avatar; if (!av || !av.playOnce) return;
      const [name, v, mode] = (st.shot || st.endG) && st.gest ? st.gest : [null], on = av.state.once;
      if (!name || !clipOK(name)) { if (on && on.sun) on.out = true; return; }
      if (!on || on.name !== name) { av.playOnce(name, { hold: true, fadeIn: name === 'sleep_lean' ? 0.01 : 0.3, fadeOut: 0.4 }); if (av.state.once) av.state.once.sun = true; }
      const o = av.state.once; if (!o) return;
      o.speed = 0; o.out = false; o.t = Math.min(mode === 'loop' ? v % o.dur : mode === 'frac' ? v * o.dur : v, o.dur - 0.002);
    }
    // ---- エンディング（s 秒め）：集めたかけらを、花の丘の魔法陣で 1 つにくっつけて、空へ返す。見た目は、ぜんぶ s だけから決める
    const fE = V3(-Math.sin(CAM.yaw0), 0, -Math.cos(CAM.yaw0)), rE = V3(Math.cos(CAM.yaw0), 0, -Math.sin(CAM.yaw0));      // エルフが向くほう（太陽のある空）・その右
    const PE = V3(0, 0, 0), HND = V3(0, 0, 0), _h1 = V3(0, 0, 0), _h2 = V3(0, 0, 0), _hp = V3(0, 0, 0), hand = V3(0, 0, 0);
    const CIRCLE_R = 2.2, MERGE_H = 2.25;                              // 魔法陣の半径（m）・かけらが 1 つになる高さ（エルフの頭の上）
    // 魔法陣の絵（magic_circle.js の createCircleArt を借りる。絵だけ。読めなければ、魔法陣なしで流れる）
    let circle = null, circleP = null;
    const circleReady = () => circleP || (circleP = import('./magic_circle.js').then((m) => { circle = m.createCircleArt({ scene, position: [EB.x, EB.y + 0.06, EB.z], radius: CIRCLE_R, pattern: 'ruins', color: '#ffd36a', color2: '#fff0c0' }); circle.set({ amount: 0 }); }).catch(() => {}));
    // 1 つになった太陽の光（尾・頭）の道すじ：エンディングでは「エルフの頭の上 → 太陽の場所」を 1 つだけ、始まりでは「太陽 → 森の 3 か所」
    function endPath() {
      st.pathMode = 'end'; HND.set(EB.x, EB.y + MERGE_H, EB.z); PE.copy(EB).addScaledVector(SUN, SUN_DIST); PE.y += 1.4; shU.uP0.value.copy(HND);
      _b.copy(HND).lerp(PE, 0.3); _b.y += 60;
      for (const m of [trails, heads]) { const a1 = m.geometry.attributes.iP1, a2 = m.geometry.attributes.iP2; a1.setXYZ(0, _b.x, _b.y, _b.z); a2.setXYZ(0, PE.x, PE.y, PE.z); a1.needsUpdate = a2.needsUpdate = true; m.geometry.instanceCount = 1; }
    }
    function introPath() {
      st.pathMode = 'intro'; shU.uP0.value.copy(P0);
      for (const m of [trails, heads]) { const a1 = m.geometry.attributes.iP1, a2 = m.geometry.attributes.iP2;
        SHARDS.forEach((sh, i) => { a1.setXYZ(i, sh.p1.x, sh.p1.y, sh.p1.z); a2.setXYZ(i, sh.p2.x, sh.p2.y, sh.p2.z); }); a1.needsUpdate = a2.needsUpdate = true; m.geometry.instanceCount = SHARDS.length; }
    }
    // しぐさ circle_unlock（10 秒）の中の時間：0〜2.5 両手を胸の前で合わせる（かけらを受ける）→ 2.5〜6 両手を上げて広げる（さし出す。ここは速めに）→ そのまま
    const cuAt = (s) => (s < TLE.raise ? Math.min(s - TLE.cup, 2.5) : Math.min(2.5 + (s - TLE.raise) * 1.75, 6.0) + Math.min(Math.max(s - TLE.raise - 2, 0) * 0.25, 1.8));
    function applyEnd(s) {
      st.s = s; U.uS.value = END; st.uiK = -1; st.endG = true; st.shot = false;      // 始まりの演出のカメラは使わない（ページを開いてすぐエンディングを流したときも）
      if (s < TLE.back[0]) { player.x = EB.x; player.z = EB.z; player.vx = player.vz = 0; }      // エルフは、着いた所（＝魔法陣のまん中）から動かない
      if (st.pathMode !== 'end') endPath();
      if (s < END) circleReady();
      U.uWave.value.w = 0; shU.uNear.value = 1; shU.uEase.value = 0; shU.uT0.value = END - (s - TLE.cut); shU.uDur.value = TLE.fly;      // 1 つになった太陽の光：cut から fly 秒で、空の太陽の所へ
      // 魔法陣：足もとに広がる → かけらが来るたびに線がともる → 寄りあう間は速く回り、くっつくと金色に光って光の柱 → 明るくなったあと、消える
      if (circle) { const ck = clamp((s - TLE.circle[0]) / (TLE.circle[1] - TLE.circle[0]), 0, 1), mk = clamp((s - TLE.merge) / 1.4, 0, 1), on = s < END ? sstep(s, TLE.circle[0], TLE.circle[1]) * (1 - sstep(s, TLE.crane[0], TLE.crane[0] + 3.5)) : 0;
        circle.moveTo(EB.x, EB.y + 0.06, EB.z);
        circle.set({ amount: on, lit: sstep(s, TLE.take[0] + 0.8, TLE.take[2] + TLE.takeDur), gold: sstep(s, TLE.merge - 0.4, TLE.merge + 0.3), pillar: sstep(s, TLE.merge, TLE.merge + 0.5) * (1 - sstep(s, TLE.dawn[0] - 0.2, TLE.dawn[0] + 0.9)),      // 魔法陣の光の柱：太陽が着いたら消す（顔の絵に かからない）
          flash: s >= TLE.merge ? Math.exp(-(s - TLE.merge) * 2.2) : 0, spin: 0.25 + 1.6 * sstep(s, TLE.spin, TLE.merge) * (1 - sstep(s, TLE.merge, TLE.merge + 1.5)) });
        if (s >= TLE.merge && mk < 1) circle.wave(CIRCLE_R * 3 * mk, 1 - mk); else if (ck > 0 && ck < 1) circle.wave(CIRCLE_R * 1.6 * ck, 1 - ck); else circle.wave(0, 0); }
      // 太陽：光が着くと、ひびのない丸い太陽が現れ、強く光って、世界が一気に明るくなる
      sunU.uShake.value = st.shake = 0; sunU.uAlive.value = sstep(s, TLE.dawn[0] - 0.35, TLE.dawn[0] + 0.15); sunU.uSplit.value = 0; sunU.uCrack.value = 0;
      sunU.uFlash.value = s >= TLE.dawn[0] ? Math.exp(-(s - TLE.dawn[0]) * 0.9) * 1.5 : Math.pow(sstep(s, TLE.dawn[0] - 0.8, TLE.dawn[0]), 2) * 0.9;
      sunU.uRays.value = sstep(s, TLE.dawn[0], TLE.dawn[0] + 3) * (0.55 + 0.3 * (1 - sstep(s, TLE.crane[0], TLE.crane[1]))); sunU.uDim.value = 1;      // 太陽からの光の筋（明るくなる間は少し強く）
      sunMesh.visible = sunU.uAlive.value > 0 || sunU.uFlash.value > 0.01;
      trails.visible = heads.visible = s > TLE.cut && s < TLE.cut + TLE.fly + 0.2;
      talkEl.classList.remove('show'); if (windU) windU.uWind.value = WIND0; st.shot = false; st.lean = 0; st.eyes = 0; st.elfLit = 0;
      fairy.visible = s > 0.6 && s < TLE.crane[0] + 5; fairyU.uA.value = sstep(s, 0.6, 1.6) * (1 - sstep(s, TLE.crane[0] + 3.5, TLE.crane[0] + 5));      // 妖精：エルフのななめ前で見まもる
      fairyU.uPos.value.copy(EB).addScaledVector(rE, 0.8).addScaledVector(fE, 0.45); fairyU.uPos.value.y = EB.y + 1.5 + 0.35 * sstep(s, TLE.spin, TLE.merge);
      // エルフ：空を見上げる（look_up）→ 両手を胸の前で合わせて、おりてくるかけらを受ける → 両手を上げてさし出す（circle_unlock）→ 明るくなったら、よろこぶ（joy）
      const nu = clamp((s - TLE.nod[0]) / (TLE.nod[1] - TLE.nod[0]), 0, 1), lu0 = TLE.circle[0] - 0.6;      // うなずく（nod のクリップがなければ、首と頭の骨で）
      st.gest = s < TLE.nod[0] ? null : s < TLE.nod[1] ? (clipOK('nod') ? ['nod', nu, 'frac'] : null) : s < lu0 ? null : s < TLE.cup ? ['look_up', s - lu0, 'sec'] : s < TLE.dawn[0] - 0.3 ? ['circle_unlock', cuAt(s), 'sec'] : s < TLE.joy ? ['look_up', 1.2 + s - TLE.dawn[0], 'sec'] : s < TLE.joy + 3.4 ? ['joy', s - TLE.joy, 'sec'] : null;
      st.headK = clipOK('nod') ? 0 : -1.3 * (nu < 0.32 ? sstep(nu, 0, 0.32) : 1 - sstep(nu, 0.42, 1));      // ふだんは 0。頭の向きは、しぐさのクリップにまかせる（クリップの上に骨のかたむきを重ねると、向きがずれていく）
      // 夜明け：空は 夜 → 金色 → 昼の青（sky）。地面は、丘の上の木から外へ、光の波（wave）が通った所から明るく・色がもどる。花は、その波に合わせて開く
      const skyP = sstep(s, TLE.sky[0], TLE.sky[1]), wu = clamp((s - TLE.wave[0]) / (TLE.wave[1] - TLE.wave[0]), 0, 1), waving = s >= TLE.wave[0] && wu < 1;
      setNight(1 - skyP); SKY_DAWN.value = Math.sin(Math.PI * skyP) * 0.85 * (s < END ? 1 : 0);
      if (scene.fog) { if (waving) { scene.fog.near = 260 * wu * wu * wu; scene.fog.far = 1; } else { scene.fog.near = -1; scene.fog.far = 1 - skyP; } }      // 波の間：夜の度合いは 1 のまま、波の内がわだけ明るい
      setOpen(s >= END ? 1 : sstep(s, TLE.open[0], TLE.open[1]), [HTc.x, HTc.z, 200], 0.25);
      motes(s >= TLE.dawn[0] && s < END ? sstep(s, TLE.dawn[0] + 0.3, TLE.dawn[0] + 2) * (1 - sstep(s, TLE.crane[1] - 1, TLE.crane[1] + 2)) : 0);
      st.endLit = s < END ? 0.3 * sstep(s, TLE.dawn[0], TLE.dawn[0] + 0.6) * (1 - sstep(s, TLE.face[1] - 1.2, TLE.face[1] + 0.8)) : 0;      // 光がエルフの顔に差す
      if (butterflies) butterflies.visible = s > TLE.dawn[0] + 1.6;
      fireU.uFire.value = 0; fireflies.visible = false;
      const held = TAKE.filter((_, i) => s >= TLE.take[i] + TLE.takeDur).length;      // かけらの光が、エルフのまわりをほのかに照らす
      haloU.uA.value = s < TLE.cut ? 0.2 * held / 3 + 0.25 * sstep(s, TLE.merge - 0.3, TLE.merge + 0.2) : 0; haloU.uPos.value.set(EB.x, EB.y + lerp(1.15, MERGE_H, sstep(s, TLE.spin, TLE.merge)), EB.z).addScaledVector(fE, 0.24 * (1 - sstep(s, TLE.spin, TLE.merge)));
      // カメラ：1 つになるまでは、エルフの顔が見える正面ななめ（endShot 1。endCam）→ 太陽がのぼる間は、エルフの後ろの低い所から空を見上げる → 明るくなったら、よろこぶ顔（endShot 2）→ ゆっくり後ろへ上がって、丘全体を見わたす
      st.endShot = s >= END ? 0 : s < TLE.cut ? 1 : s >= TLE.face[0] && s < TLE.face[1] ? 2 : s >= TLE.crane[0] ? 3 : 0;      // 3 ＝ 光が広がる丘を見わたす引き（ゆっくり 1 つの動き）
      st.yaw = CAM.yaw0; st.pitch = CAM.pitch0; st.camH = 0.8; st.camD = CAM.dist;
      const tin = st.endIn ? sstep(s, 0, 1.5) : 1;                    // 歩いてきたとき：はじめの 1.5 秒で、エルフが空のほうへ向きなおる
      st.cutW = s >= END ? 0 : 1 - sstep(s, TLE.back[0], TLE.back[1]);      // エンディングのあと（END）：いつもの後ろからのカメラ
      if (!Number.isFinite(st.endYaw0)) st.endYaw0 = Number.isFinite(player.yaw) ? player.yaw : CAM.yaw0;      // エンディングのあとにページを開いたとき（まだ決まっていない）
      player.yaw = st.endYaw0 + (((CAM.yaw0 - st.endYaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * tin; player.pitch = lerp(0.06, 0, st.cutW);
      st.endWide = 0;
      homeU.uA.value = 1 - sstep(s, 0.5, 3.0); home.visible = homeU.uA.value > 0 && s < END;
      st.uiA = 1 - sstep(s, TLE.take[2] + 0.2, TLE.take[2] + 1.2);    // 上の太陽マーク：かけらが 3 つとも外れたら、役目を終えて消える
      beams.visible = false;
      if (hill.clearArea) {                                            // 魔法陣の中の草・花を消す（魔法陣が広がるのに合わせて中心から。魔法陣が消えるとき、ふちから生えもどる）
        const cc = window.__sunCircle, ck = s < END ? sstep(s, TLE.circle[0] - 0.2, TLE.circle[1]) * (1 - sstep(s, TLE.crane[0] + 1.5, TLE.crane[0] + 4.5)) : 0;
        hill.clearArea(cc ? cc.center.x : EB.x, cc ? cc.center.z : EB.z, (cc ? cc.radius : CIRCLE_R) * 1.25, ck > 0.001 ? ck : false); }
      showTalk(s >= END_LINE.w[0] && s < END_LINE.w[1] && !st.done[9] ? 9 : -1);      // 妖精のひと言（押して送ったら、もう出さない）
    }
    // 正面のカメラ（どれもエルフの顔が見えるがわ）：① 足もとの魔法陣が入る、少し高い引き → ② 寄って、顔と手元 → ③ 少し引いて見上げ、頭の上で回るかけらを入れる。よろこぶ顔（endShot 2）は、明るい丘を背にした ななめ前
    const camKey = (out, f, r, h) => { out.copy(EB).addScaledVector(fE, f).addScaledVector(rE, r); out.y = EB.y + h; return out; };
    const _k1 = V3(0, 0, 0), _k2 = V3(0, 0, 0);
    function endCam(s) {
      const c = st.cpos, g = st.ctgt;
      if (s < TLE.circle[0] - 0.3) {                                  // 着いてすぐ（妖精のひと言・うなずく）：エルフと妖精が見える、近めの正面ななめ。固定 → 魔法陣の前に、いつもの引きへ切りかえ
        camKey(c, 2.4, -0.2, 1.4); g.copy(EB).addScaledVector(rE, 0.4); g.y = EB.y + 1.3; c.y = Math.max(c.y, hill.groundH(c.x, c.z) + 0.9); return; }
      if (st.endShot === 3) {                                          // 光の波が広がる丘：木のわきの高い所から、森のほうを見わたす。ゆっくり前へ・上へ（1 つの動き）
        const k = sstep(s, TLE.crane[0], TLE.crane[1] + 2), d = _k1.set(gm.x - HTc.x, 0, gm.z - HTc.z).normalize(), r = _k2.set(-d.z, 0, d.x), gy = hill.groundH(HTc.x, HTc.z);
        c.set(HTc.x, 0, HTc.z).addScaledVector(d, 4 + 5 * k).addScaledVector(r, 11); c.y = gy + 8 + 2.5 * k;
        g.set(HTc.x, 0, HTc.z).addScaledVector(d, 60).addScaledVector(r, 2); g.y = gy - 3; c.y = Math.max(c.y, hill.groundH(c.x, c.z) + 2); return; }
      if (st.endShot === 2) { const k = sstep(s, TLE.face[0], TLE.face[1]); camKey(c, 2.0 - 0.3 * k, 0.9 - 0.3 * k, 1.15); g.set(EB.x, EB.y + 1.35, EB.z); }      // 太陽を見上げる顔（太陽はカメラの後ろ ＝ 光が顔に差す）。ごくゆっくり寄る
      else {                                                            // 魔法陣が見せ場：円ぜんたいとエルフが入る正面ななめ。縦長の画面は、そのぶん下がる
        const pf = clamp(0.7 / camera.aspect, 1, 1.5);
        if (s < TLE.raise) { const a = sstep(s, TLE.circle[0], TLE.raise); camKey(c, (4.4 - 0.7 * a) * pf, -1.6 * pf, 2.6 + 0.4 * (pf - 1)); g.set(EB.x, EB.y + 0.75, EB.z); }      // ① 円が広がる・かけらが手元へ：少し高い所から、ゆっくり寄る
        else { const b = sstep(s, TLE.raise, TLE.cut); camKey(c, (4.8 - 0.6 * b) * pf, -1.0 * pf, 2.2); g.set(EB.x, EB.y + 0.95, EB.z); } }      // ② さし出す・頭の上で回って 1 つに：低い所から、足もとの円と頭の上の光を両方入れる
      c.y = Math.max(c.y, hill.groundH(c.x, c.z) + 0.9);
    }
    function faceElf(force = false) { const av = walker.avatar; if (av && (st.cutW > 0 || force)) { av.state.facing = player.yaw + Math.PI; av.root.rotation.y = av.state.facing; } }

    // ---- エンディングのかけら（画面の上の絵）：上の太陽マークから 1 つずつ外れて、エルフの手元へおりてくる（各エリアで「手元 → マーク」にはめたのと逆の動き：くさび形 → ひし形の結晶）。
    //   手元で浮いたまま、手の動きについていく → さし出すと、エルフの頭の上で回りながら寄りあい（spin 〜 merge）、1 つの太陽になる（丸い太陽の絵）→ のぼりはじめ（cut）に、3D の光（尾を引く太陽）へ入れかわる
    const _v = V3(0, 0, 0); let handB = null;
    function handsMid() {                                              // 両手のまん中（骨がなければ、胸の前）
      const av = walker.avatar; if (av && !handB) handB = ['Left_Hand', 'Right_Hand'].map((n) => av.model.getObjectByName(n)).filter(Boolean);
      if (handB && handB.length === 2) { handB[0].getWorldPosition(_h1); handB[1].getWorldPosition(_h2); hand.copy(_h1).add(_h2).multiplyScalar(0.5).addScaledVector(fE, 0.06); }
      else { hand.copy(EB).addScaledVector(fE, 0.24); hand.y = EB.y + 1.03; }
      return hand;
    }
    // 3D の点 → 画面の場所。返すのは [x, y, カメラからの距離, tan(画角 / 2)]。live ＝ 今の画面（カメラの行列をそのまま使う）/ そうでなければ、w×h の絵の中
    function scr(v, w, h, live) {
      const t = Math.tan((live ? camera.fov : hill.HILL.fov + (w < h ? 6 : 0)) * D2R / 2), asp = live ? camera.aspect : w / h;
      camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();      // 今のフレームのカメラで（描く前なので、自分で入れなおす）
      _v.copy(v).applyMatrix4(camera.matrixWorldInverse); const d = Math.max(-_v.z, 0.05);
      return [w / 2 + (_v.x / d) / (t * asp) * w / 2, h / 2 - (_v.y / d) / t * h / 2, d, t];
    }
    // i 番めのかけらの、s 秒めの見た目（flyAt と同じ形。まだマークの中・もう 1 つになったあとは null）。tx, ty ＝ マークのまん中
    function endPose(i, s, w, h, tx, ty, live) {
      if (s < TLE.take[i] || s >= TLE.merge) return null;
      _hp.copy(handsMid()).addScaledVector(rE, (i - 1) * 0.13); _hp.y += 0.09 + (i === 1 ? 0.05 : 0) + Math.sin(U.uT.value * 2.2 + i * 2.1) * 0.012;
      if (s > TLE.spin) { const tt = s - TLE.spin, ang = i * 2.0944 + 1.3 * tt + 0.5 * tt * tt, rad = 0.72 * (1 - sstep(s, TLE.spin + 1.0, TLE.merge));      // 頭の上で、回りながら寄りあう（だんだん速く、だんだん小さい輪）
        _h1.set(EB.x + Math.cos(ang) * rad, EB.y + lerp(1.8, MERGE_H, sstep(s, TLE.spin, TLE.merge)), EB.z + Math.sin(ang) * rad); _hp.lerp(_h1, sstep(s, TLE.spin, TLE.spin + 0.9)); }
      const [hx, hy, d, t] = scr(_hp, w, h, live), size = clamp(0.13 / d / t * h / 2, 10, 120);
      return flyAt(1 - clamp((s - TLE.take[i]) / TLE.takeDur, 0, 1), hx, hy, tx, ty, size);
    }
    // 1 つになった太陽（丸い太陽の絵）：{ x, y, d ＝ 直径 px, a ＝ こさ }。くっついたしゅんかんに、ぽんとふくらむ
    function endSun(s, w, h, live) {
      if (s < TLE.merge - 0.05 || s >= TLE.cut + 0.25) return null;
      _hp.set(EB.x, EB.y + MERGE_H, EB.z); const [x, y, d, t] = scr(_hp, w, h, live), k = clamp((s - TLE.merge) / 0.5, 0, 1);
      return { x, y, d: 0.36 / d / t * h / 2 * (0.5 + 0.5 * k + 0.35 * Math.sin(Math.PI * k)), a: sstep(s, TLE.merge - 0.05, TLE.merge + 0.1) * (1 - sstep(s, TLE.cut, TLE.cut + 0.25)) };
    }
    const endEls = []; let endSunEl = null;
    function placeUI() {
      if (st.uiA == null) { if (uiEl.style.transition === 'none') { uiEl.style.transition = ''; uiEl.style.opacity = ''; } }
      else { uiEl.style.transition = 'none'; uiEl.style.opacity = String(st.uiA); }
      const s = st.s, taken = st.endG ? TAKE.filter((_, i) => s >= TLE.take[i]).length : 0;
      if (taken !== (st.endTaken || 0)) { st.endTaken = taken;       // マークの絵：外れたかけらは、白い輪かくだけになる
        if (!taken) drawUI(); else { const o = {}; TAKE.forEach((n, i) => { o[n] = i >= taken; }); uiEl.innerHTML = sunSVG(o, {}); uiEl.classList.remove('full'); } }
      const on = st.endG && s >= TLE.take[0] && s < TLE.cut + 0.25;
      if (!on) { if (st.endElsOn) { st.endElsOn = false; for (const e of endEls) e.style.display = 'none'; endSunEl.style.display = 'none'; } return; }
      if (!endEls.length) { TAKE.forEach((name) => { const el = document.createElement('div'); el.className = 'sunFly'; el.style.display = 'none';
        el.innerHTML = `<div class="glow"></div><div class="gem">${GEM_SVG}</div><div class="wedge">${sunSVG({ [name]: true }, { only: name, id: `e${name}` })}</div>`;
        el.children[0].style.transform = `scale(${(FLY.glow * FLY.gemH / 60).toFixed(2)})`; document.body.append(el); endEls.push(el); });
        endSunEl = document.createElement('div'); endSunEl.className = 'sunFly'; endSunEl.style.display = 'none'; endSunEl.innerHTML = `<div class="glow"></div><div>${sunSVG(ALL3, { full: true, id: 'em' })}</div>`; endSunEl.children[0].style.transform = 'scale(2.4)'; document.body.append(endSunEl); }
      st.endElsOn = true; const [tx, ty] = slot();
      endEls.forEach((el, i) => { const q = endPose(i, s, window.innerWidth, window.innerHeight, tx, ty, true);
        if (!q) { el.style.display = 'none'; return; }
        el.style.display = 'block'; el.style.transform = `translate(${(q.x - 30).toFixed(1)}px, ${(q.y - 30).toFixed(1)}px) scale(${q.sc.toFixed(3)})`;
        el.children[0].style.opacity = q.glow.toFixed(2); el.children[1].style.opacity = q.gem.toFixed(2); el.children[2].style.opacity = q.wedge.toFixed(2); el.children[2].style.transform = `rotate(${q.rot.toFixed(1)}deg)`; });
      const m = endSun(s, window.innerWidth, window.innerHeight, true);
      if (!m) endSunEl.style.display = 'none'; else { endSunEl.style.display = 'block'; endSunEl.style.opacity = m.a.toFixed(2); endSunEl.style.transform = `translate(${(m.x - 30).toFixed(1)}px, ${(m.y - 30).toFixed(1)}px) scale(${(m.d / 51).toFixed(3)})`; }
    }
    // 確認画像用：マーク・かけら・1 つになった太陽を、絵（x, y から pw×ph）に描く
    async function drawEndUI(g, x, y, pw, ph, s) {
      const taken = TAKE.filter((_, i) => s >= TLE.take[i]).length, a = st.uiA == null ? 1 : st.uiA;
      const glowAt = (gx, gy, r, al) => { const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, 'rgba(255,246,216,.95)'); gr.addColorStop(0.34, 'rgba(255,211,106,.5)'); gr.addColorStop(0.7, 'rgba(255,200,90,0)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
        g.globalAlpha = al; g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, r, 0, 7); g.fill(); };
      if (a > 0.01) { const o = {}; TAKE.forEach((n, i) => { o[n] = i >= taken; }); const img = await svgImage(sunSVG(o, { full: taken === 0, id: 'p', size: 240 })), d = UI * (taken === 0 ? 1.15 : 1);
        g.globalAlpha = a; g.drawImage(img, x + pw / 2 - d / 2, y + UIY - d / 2, d, d); g.globalAlpha = 1; }
      for (let i = 0; i < TAKE.length; i++) { const q = endPose(i, s, pw, ph, pw / 2, UIY, false); if (!q) continue;
        const gx = x + q.x, gy = y + q.y, d = 60 * q.sc; glowAt(gx, gy, 30 * q.sc * FLY.glow * FLY.gemH / 60, q.glow);
        if (q.gem > 0.01) { g.globalAlpha = q.gem; g.drawImage(await svgImage(GEM_SVG.replace('width="60" height="60"', 'width="240" height="240"')), gx - d / 2, gy - d / 2, d, d); }
        if (q.wedge > 0.01) { g.globalAlpha = q.wedge; g.save(); g.translate(gx, gy); g.rotate(q.rot * D2R); g.drawImage(await svgImage(sunSVG({ [TAKE[i]]: true }, { only: TAKE[i], id: `q${i}`, size: 240 })), -d / 2, -d / 2, d, d); g.restore(); }
        g.globalAlpha = 1; }
      const m = endSun(s, pw, ph, false);
      if (m) { glowAt(x + m.x, y + m.y, m.d * 1.4, m.a * 0.8); g.globalAlpha = m.a; const d = m.d * 68 / 58; g.drawImage(await svgImage(sunSVG(ALL3, { full: true, id: 'pm', size: 240 })), x + m.x - d / 2, y + m.y - d / 2, d, d); g.globalAlpha = 1; }
    }

    // ---- 進行
    const CUES = [[TL.talkA[0] - 0.4, () => snd.fairyFx()], [TL.talkA[0], () => snd.later('voice')], [TL.talkB[0], () => snd.later('voice')], [TL.talkH[0], () => snd.later('voice')], [TL.follow + 0.02, () => { snd.rumble(); snd.quake(); }], [TL.quake, () => snd.rumble()], [TL.quake, () => snd.later('crack')],
      [TL.crack, () => { snd.shatter(); snd.shatterOut(); }], [TL.crack + 0.05, () => fairyPlay('surprise')], [TL.dark[1], () => snd.night()], [TL.talkC[0], () => snd.later('voice')],
      [TL.fly0, () => snd.later('fly')], [TL.fly0 + TL.fly, () => snd.later('land')], ...SHARDS.map((_, i) => [TL.rise + i * TL.riseGap, () => snd.later('pillar')]),
      [TL.talk2[0], () => snd.later('voice')], [TL.panic[0], () => fairyPlay('surprise')], [TL.talkE[0], () => snd.later('voice')], [TL.talkF[0], () => snd.later('voice')], [TL.fairy.out[0], () => snd.fairyFx()]].sort((a, b) => a[0] - b[0]);
    //   エンディングの音：妖精が出る → ひと言（声はまだない）→ うなずいたら、探索の BGM を消して、エンディングの曲（山の 58 秒め ＝ 太陽がもどって 0.8 秒あと）→ 太陽がもどると、暗い世界の環境音から昼の丘の環境音へ → END のあと、曲を静かに消す
    const CUES_E = [[0.6, () => snd.fairyFx()], [TLE.talk0[0], () => snd.later('voice')], [TLE.nod[1], () => snd.endingBgm(TLE.dawn[0] + 0.8 - TLE.nod[1])], [TLE.circle[0], () => snd.later('circle')], ...TAKE.map((_, i) => [TLE.take[i] + TLE.takeDur, () => snd.later('set')]),
      [TLE.merge, () => snd.later('merge')], [TLE.merge + 0.2, () => fairyPlay('joy')], [TLE.joy + 0.3, () => fairyPlay('joy')], [TLE.cut + 0.05, () => snd.later('fly')],
      [TLE.dawn[0], () => snd.night(false)], [TLE.open[0] + 0.6, () => snd.later('bloom')], [TLE.endcard + 1.2, () => snd.fadeBgm(8)]].sort((a, b) => a[0] - b[0]);
    const gateEl = document.getElementById('gate');
    // ---- 妖精についていく（操作できる。文字の説明なし）：妖精は次の所へ飛んで、小さくはねながら待つ。近づくと、また先へ。動かないでいると、もどってきて まわりを回り、また先へ
    const fo = { i: 0, idle: 0, ret: 0, t: 0 };
    function startFollow() {
      st.phase = 'follow'; st.s = TL.follow; apply(TL.follow); fo.i = 0; fo.idle = 0; fo.ret = 0; fo.t = 0; fo.pt = 0.6;
      // 木の下から少しはなれて始める：後ろからのカメラへ切りかわるコマで、エルフを道の 5 m 先へ（木はカメラの後ろになるので、動いたのは見えない。幹が画面のはしに大きく入らない）
      { const [x, z] = hill.constrain(P1.x + WD.x * 5, P1.z + WD.z * 5); player.x = x; player.z = z; player.vx = player.vz = 0; player.yaw = Math.atan2(-WD.x, -WD.z); faceElf(true); if (walker.sync) walker.sync();
        fairyU.uPos.value.set(x + WD.x * 3, hill.groundH(x, z) + 1.6, z + WD.z * 3); st.fairySnap = true; }      // 妖精も、エルフの少し先へ
      st.fpos.copy(fairyU.uPos.value);
      controls.lock(false); document.body.classList.remove('sun-intro');
    }
    // 道すじ（木の下 → WPS）の上で、プレイヤーにいちばん近い所から lead m 先の点
    const PATH = [P1], _pa = V3(0, 0, 0);
    for (let z = Math.ceil(P1.z) + 3; z < WPS[WPS.length - 1].z - 1; z += 3) { const [x, zz] = hill.constrain(hill.trailX(z), z); PATH.push(V3(x, hill.groundH(x, zz), zz)); }
    PATH.push(WPS[WPS.length - 1]);
    function leadPoint(lead, out) {
      let best = 1e9, bi = 0, bt = 0;
      for (let i = 0; i < PATH.length - 1; i++) { const a = PATH[i], b = PATH[i + 1], dx = b.x - a.x, dz = b.z - a.z, t = clamp(((player.x - a.x) * dx + (player.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1), d = Math.hypot(a.x + dx * t - player.x, a.z + dz * t - player.z); if (d < best) { best = d; bi = i; bt = t; } }
      let i = bi, t = bt, left = lead;
      for (;;) { const a = PATH[i], b = PATH[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), rem = len * (1 - t); if (left <= rem || i === PATH.length - 2) { t = Math.min(1, t + left / len); out.set(lerp(a.x, b.x, t), 0, lerp(a.z, b.z, t)); break; } left -= rem; i++; t = 0; }
      out.y = hill.groundH(out.x, out.z); return out;
    }
    function followTick(dt) {
      const last = WPS.length - 1, w = WPS[fo.i], d = Math.hypot(player.x - w.x, player.z - w.z), T = U.uT.value; fo.t += dt;
      if (d < 3.2 && fo.i < last) { fo.i++; fo.ret = 0; fo.idle = 0; fo.pt = 1.4; }
      if (fo.pt > 0) { fo.pt -= dt; if (fo.pt <= 0) fairyPlay('point', WPS[Math.min(fo.i + 1, last)]); }      // 次の所に着いたら、その先を指す（ついてきて）
      fo.idle = player.moving < 0.3 ? fo.idle + dt : 0; if (player.moving >= 0.3) fo.ret = Math.min(fo.ret, 0.3);
      if (fo.ret <= 0 && fo.idle > 3.5 && Math.hypot(player.x - st.fpos.x, player.z - st.fpos.z) > 3.5) fo.ret = 3.2;
      const t = WPS[fo.i];
      if (fo.ret > 0) { fo.ret -= dt; if (fo.ret <= 0) fo.idle = 0; _f.set(player.x + Math.cos(T * 2.4) * 1.3, hill.groundH(player.x, player.z) + 1.5 + Math.sin(T * 3.1) * 0.12, player.z + Math.sin(T * 2.4) * 1.3); }
      else { leadPoint(4.5, _f); _f.y += 2.05 + Math.sin(T * 2.2) * 0.07; }      // 高さ 2.05 m：後ろからのカメラで、エルフの頭にかくれない（1.45 m だと頭のちょうど後ろに入った）      // プレイヤーの少し先で、ふわふわ（はなれると待ち、近づくと先へ）
      st.fpos.lerp(_f, 1 - Math.exp(-dt * 2.6));
      fairy.visible = true; fairyU.uA.value = 1; fairyU.uPos.value.copy(st.fpos); haloU.uA.value = 0;
      if ((fo.i === last && d < 2.4) || player.z > WPS[last].z + 5) startQuake();      // 決めた所まで来た（先へ行きすぎても、その場で）
    }
    function startQuake() {
      fairyPlay('surprise');                                         // 地面がゆれる：びくっ
      setBase(player.x, player.z); st.yawQ = player.yaw; st.pitchQ = player.pitch; st.fFrom.copy(st.fpos);
      controls.lock(true); document.body.classList.add('sun-intro'); st.phase = 'intro'; st.followed = true; st.s = TL.follow + 0.001;
    }
    function begin() { snd.hill(1.5); st.phase = 'intro'; st.cue = 0; st.done = {}; st.wait = null; st.followed = false; setBase(WPS[WPS.length - 1].x, WPS[WPS.length - 1].z); atSpot(); controls.lock(true); document.body.classList.add('sun-intro'); apply(0); }
    function finish() {
      if (st.hush) { st.hush = false; hill.audio.setMuted(st.userMuted); }
      st.phase = 'free'; store.set(SUN_GAME_KEY, '1'); st.started = true; controls.lock(false); document.body.classList.remove('sun-intro');
      apply(END); player.x = B.x; player.z = B.z; player.yaw = YAW1; player.pitch = START.pitch;
    }
    function beginEnding(walked = false) { st.phase = 'ending'; st.cue = 0; st.done[9] = false; st.wait = null; st.endCard = false; st.endOut = false; endEl.classList.remove('show'); if (walked) EB.set(player.x, hill.groundH(player.x, player.z), player.z); else { atStart(); EB.copy(E); }
      st.endIn = walked; st.endYaw0 = walked ? player.yaw : CAM.yaw0; st.pathMode = null; if (walker.mode === 'fp' && walker.setMode) walker.setMode('tp'); controls.lock(true); document.body.classList.add('sun-intro'); ui.full = true; drawUI(); showUI(true); applyEnd(0); }
    // さいごの「END」：エンディングの終わりの絵（明るい丘の引き。カメラはとまったまま、花や草は動いている）の上に、ゆっくり出る。そのまま残る
    //   出きったあと（2.6 秒）に、画面のタップ・Enter・Space で、静かに黒へ（1.6 秒）→ 最初の画面（タイトル）へ。タイトルの Start からは、明るい花の丘を自由に歩ける
    const endEl = document.createElement('div'); endEl.id = 'sunEnd'; endEl.innerHTML = '<span>END</span>'; document.body.append(endEl);
    function showEnd() {
      st.endCard = true; st.endT = performance.now(); store.set(SUN_END_KEY, '1');
      if (document.fonts && document.fonts.load) document.fonts.load('400 40px "Ohisama C Title en"', 'END').catch(() => {});
      endEl.classList.add('show');
    }
    function endLeave(e) {
      if (!st.endCard || st.endOut || performance.now() - st.endT < 2600) return;
      if (e.type === 'keydown' && !(e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) return;
      st.endOut = true; fadeEl.style.opacity = '1'; endEl.style.transition = 'opacity 1.2s ease'; endEl.classList.remove('show');
      setTimeout(() => { const q = new URLSearchParams(location.search); q.delete('sun'); q.delete('sunpiece'); location.replace(location.pathname + (q.toString() ? `?${q}` : '')); }, 1750);
    }
    window.addEventListener('pointerdown', endLeave, true); window.addEventListener('keydown', endLeave, true);
    function finishEnding() {
      st.phase = 'free'; store.set(SUN_END_KEY, '1'); st.ended = true; controls.lock(false); document.body.classList.remove('sun-intro');
      applyEnd(END); st.uiK = -1; showUI(false); refreshBeams(); hillHome();
    }
    hillApi = { beginEnding };
    // ---- 最初の画面：タイトル（仮）・言語（その言語の文字で）・Start だけ。Start（か Enter・スペース）で始まる。ほかの所をタップしても始まらない
    const ALL3 = { ruins: true, mushroom: true, cave: true };
    const logoUrl = (l) => `./title_logo/logo_F${l === 'ja' ? '' : `_${l}`}.png`;      // タイトルのロゴ（4 言語。同じ倍率で出す ＝ 高さをそろえる）
    for (const l of LANGS) if (l !== lang) { const im = new Image(); im.src = logoUrl(l); }      // ほかの言語のロゴも、先に読んでおく（言語を切りかえた時に、すぐ出る）
    const TITLE_BG = ['ruins', 'valley', 'cave'], titleBgUrl = (name, port) => `./title_bg/${name}_${port ? 'p' : 'l'}.webp`;      // 最初の画面の背景（ゲーム画面から撮った絵。縦長用 _p・横長用 _l）
    if (gateEl) {
      gateEl.classList.add('sunTitle'); gateEl.removeAttribute('aria-label');
      gateEl.innerHTML = `<div class="sunBgs"><i></i><i></i></div><div class="sunBox"><img class="sunLogo" alt="" draggable="false"><div class="sunTop"><div class="sunMark">${sunSVG(ALL3, { full: true, id: 't', size: 96 })}</div><h1></h1></div><div class="sunBot"><div class="sunLangs">${LANGS.map((l) => `<button type="button" data-lang="${l}" lang="${TEXT[l].html}">${TEXT[l].name}</button>`).join('')}</div><button type="button" class="sunSound" role="switch" aria-label="Sound"><span class="on">${SPK(true)}</span><span class="off">${SPK(false)}</span></button><button type="button" class="sunStart">${START_LABEL}</button></div></div>`;
      const box = gateEl.querySelector('.sunBox'), fit = () => { const L = titleLayout(window.innerWidth, window.innerHeight);
        box.classList.toggle('short', L.short); gateEl.querySelector('.sunLangs').classList.toggle('two', L.cols === 2); box.style.setProperty('--k', L.k.toFixed(3)); box.style.setProperty('--pad', `${L.pad}px`); box.style.setProperty('--fs', `${L.fs}px`); };
      // 背景は、花の丘の 3D の景色（タイトルのカメラ。hillPlace）。前の背景の絵（title_bg の切りかえ）は使わない
      window.addEventListener('resize', fit);
      if (document.fonts && document.fonts.load) Promise.all(LANGS.map((l) => document.fonts.load(`400 19px "Ohisama C Title ${l}"`, TEXT[l].name + (l === 'en' ? START_LABEL : '')))).then(fit, () => {});      // 言語ボタンと Start の字（C）      // 字が読めたら、大きさを合わせなおす
      const sb = gateEl.querySelector('.sunSound'); onSound = () => { sb.classList.toggle('muted', !soundOn()); sb.setAttribute('aria-checked', String(soundOn())); }; onSound();
      const h1 = gateEl.querySelector('h1'), onFit = fit, logo = gateEl.querySelector('.sunLogo');
      onLang = () => { document.title = TEXT[lang].title; setTimeout(() => onFit(), 0); logo.alt = TEXT[lang].title; logo.lang = TEXT[lang].html; const src = logoUrl(lang); if (!logo.src.endsWith(src.slice(1))) { logo.classList.remove('on'); logo.onload = () => logo.classList.add('on'); logo.src = src; } h1.textContent = TEXT[lang].title; h1.lang = TEXT[lang].html; h1.style.fontFamily = titleFont(lang); for (const b of gateEl.querySelectorAll('[data-lang]')) { b.classList.toggle('on', b.dataset.lang === lang); b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); } };
      onLang();
      gateEl.addEventListener('pointerdown', (e) => { const el = e.target.closest ? e.target : null, b = el && el.closest('[data-lang]');
        if (b) setLang(b.dataset.lang); if (el && el.closest('.sunSound')) setSound(!soundOn()); if (!el || !el.closest('.sunStart')) e.stopImmediatePropagation(); }, true);
      window.addEventListener('keydown', (e) => { if (!gateEl.classList.contains('off') && e.code !== 'Enter' && e.code !== 'Space') e.stopPropagation(); }, true);
    }
    // 確認画像用：最初の画面を絵に描く（CSS と同じ数値でならべる）
    // 最初の画面のならべ方（CSS と同じ数値）。k ＝ 大きさの倍率（ボタンの高さは、いつも 44 px 以上になる）。short ＝ たてに短い画面（スマホの横持ち）は、つめる
    //   横長：左半分（colW）にまとめる。入らなければ言語は 2 列 / 縦長：タイトルは上、ボタンは下。まん中（画面の高さの 26% 以上）は絵の主役のためにあける
    const _tg = document.createElement('canvas').getContext('2d');
    const TITLE_SCALE = 0.8; let titleOld = false;                      // titleOld ＝ 確認画像用（小さくする前のならべ方で描く）
    function titleLayout(W, H) {
      const port = true, short = W >= H && H < 520, colW = W, fs = port ? clamp(W * 0.074, 27, 44) : short ? 30 : clamp(colW * 0.075, 30, 46);
      _tg.font = `700 ${fs}px ${titleFont(lang)}`; const titleW = _tg.measureText(TEXT[lang].title).width + 0.08 * fs * TEXT[lang].title.length + 24;
      const cols = W < H || colW - 24 < 526 ? 2 : 4, rows = LANGS.length / cols, lw = cols === 2 ? 140 : 124;
      const L = { port, short, colW, fs, th: fs * 1.5, cols, lw, lh: rows * 46 + (rows - 1) * 10, mark: port ? 72 : short ? 54 : 96, m1: port ? 10 : short ? 4 : 16, m2: port ? 0 : short ? 10 : 24, m3: short ? 12 : 20, snd: short ? 46 : 52, st: short ? 48 : 56 };
      L.w = cols * lw + (cols - 1) * 10; L.top = L.mark + L.m1 + L.th + L.m2; L.bot = L.lh + L.m3 + L.snd + L.m3 + L.st; L.h = L.top + L.bot;
      L.k = clamp(Math.min((colW - 24) / Math.max(L.w, titleW), (port ? H * 0.645 : H - 24) / L.h), 0.8, port ? 1.35 : 1.7);
      L.pad = 0;
      if (!titleOld) {                                               // ひとまわり小さく（8 割。ただしボタンの高さは 44 px より小さくしない）。横長の画面は、左の余白を画面の幅の 6% 広げる
        L.k = Math.max(L.k * TITLE_SCALE, Math.min(L.k, 44 / 46)); L.pad = port ? 0 : Math.round(W * 0.06);
      }
      L.left = Math.round((port ? W / 2 : L.pad + colW / 2) - L.w * L.k / 2);      // いちばん左のボタンの、画面の左はしからの距離
      return L;
    }
    // 確認画像用：最初の画面を絵に描く。layers ＝ [[背景の絵, こさ 0〜1], …]（なければ紺色だけ）
    async function drawTitle(g, W, H, layers = [], sound = true) {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0a1034'); bg.addColorStop(0.62, '#1c2a62'); bg.addColorStop(1, '#33407a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
      for (const [im, a] of layers) { const k = Math.max(W / im.width, H / im.height) * 1.05; g.globalAlpha = a; g.drawImage(im, W / 2 - im.width * k / 2, H / 2 - im.height * k / 2, im.width * k, im.height * k); }
      g.globalAlpha = 1; const L = titleLayout(W, H), C = 'rgba(6,10,34,';
      const sc = L.port ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, 0, W, 0);
      if (L.port) { sc.addColorStop(0, `${C}.78)`); sc.addColorStop(0.34, `${C}0)`); sc.addColorStop(0.5, `${C}0)`); sc.addColorStop(0.78, `${C}.84)`); sc.addColorStop(1, `${C}.84)`); }
      else { sc.addColorStop(0, `${C}.84)`); sc.addColorStop(0.36, `${C}.6)`); sc.addColorStop(0.62, `${C}0)`); sc.addColorStop(1, `${C}0)`); }
      g.fillStyle = sc; g.fillRect(0, 0, W, H); g.restore();
      const cx = L.pad + L.colW / 2, mark = await svgImage(sunSVG(ALL3, { full: true, id: 'd', size: 240 })), spk = await svgImage(SPK(sound).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" color="${sound ? '#2a2140' : '#c8cbe0'}" `));
      const top = (y) => { g.drawImage(mark, -L.mark / 2, y, L.mark, L.mark); y += L.mark + L.m1;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fffdf2'; g.font = `700 ${L.fs}px ${titleFont(lang)}`; g.letterSpacing = `${(0.08 * L.fs).toFixed(1)}px`;
        g.shadowColor = 'rgba(4,8,30,.9)'; g.shadowBlur = 14; g.shadowOffsetY = 2; g.fillText(TEXT[lang].title, 0, y + L.th / 2); g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; g.letterSpacing = '0px'; };
      const bot = (y) => { g.textAlign = 'center'; g.textBaseline = 'middle';
        LANGS.forEach((l, i) => { const x = -L.w / 2 + (i % L.cols) * (L.lw + 10), yy = y + Math.floor(i / L.cols) * 56, on = l === lang;
          g.fillStyle = on ? '#ffe08a' : 'rgba(255,255,255,.08)'; g.strokeStyle = on ? '#fff3c4' : 'rgba(255,255,255,.45)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x, yy, L.lw, 46, 23); g.fill(); g.stroke();
          g.fillStyle = on ? '#2a2140' : '#ffffff'; g.font = `600 18px ${titleFont(l)}`; g.fillText(TEXT[l].name, x + L.lw / 2, yy + 24); });
        y += L.lh + L.m3;
        g.fillStyle = sound ? '#ffe08a' : 'rgba(255,255,255,.08)'; g.strokeStyle = sound ? '#fff3c4' : 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(0, y + L.snd / 2, L.snd / 2, 0, Math.PI * 2); g.fill(); g.stroke();
        g.drawImage(spk, -13, y + L.snd / 2 - 13, 26, 26); y += L.snd + L.m3;
        g.fillStyle = 'rgba(255,255,255,.16)'; g.strokeStyle = '#ffffff'; g.beginPath(); g.roundRect(-105, y, 210, L.st, L.st / 2); g.fill(); g.stroke();
        g.fillStyle = '#ffffff'; g.font = `700 22px ${TITLE_FONT}, system-ui, sans-serif`; g.letterSpacing = '2.6px'; g.fillText(START_LABEL, 0, y + L.st / 2 + 1); g.letterSpacing = '0px'; };
      const at = (x, y, f) => { g.save(); g.translate(x, y); g.scale(L.k, L.k); f(); g.restore(); };
      if (L.port) { at(cx, H * 0.05, () => top(0)); at(cx, H - H * 0.045, () => bot(-L.bot)); }
      else at(cx, H / 2, () => { top(-L.h / 2); bot(-L.h / 2 + L.top); });
      g.textAlign = 'left'; return L;
    }

    const CAM0 = { height: walker.cam.height, pitch: walker.cam.pitch }, CAMF = { height: CAM0.height + 0.75, pitch: CAM0.pitch - 0.26 };      // ついていく間：手前の大きな花の上から、エルフを少し見おろす
    // ---- タイトル（最初の画面が出ている間）：花の丘を、丘の下のほうから大きな花の木に向けて見る。ごくゆっくり横へ流れる。エルフ・妖精は出さない
    //   Start：ロゴとボタンが消える（0.9 秒）のと同時に、静かに黒へ（1.6 秒）→ 1 回目は、オープニングの最初（真っ暗）へ。2 回目からは、黒から花の丘へもどって、そのまま操作
    const fadeEl = document.createElement('div'); fadeEl.id = 'sunFade'; document.body.append(fadeEl);
    st.title = !!(gateEl && !gateEl.classList.contains('off')); st.titleT = 0; st.titleOut = -1; if (st.title) document.body.classList.add('sun-intro', 'sun-title');      // タイトルの間は、右上の音・視点のボタンも出さない
    const _tc = V3(0, 0, 0), _tt = V3(0, 0, 0);
    function titleCam(t) {
      const side = V3(-WD.z, 0, WD.x), k = Math.sin(t * 0.045) * 3.5;
      _tc.set(HTc.x, 0, HTc.z).addScaledVector(WD, 27).addScaledVector(side, 7 + k); _tc.y = hill.groundH(_tc.x, _tc.z) + 3.2;
      _tt.set(HTc.x, 0, HTc.z).addScaledVector(side, 2 + k * 0.3); _tt.y = hill.groundH(HTc.x, HTc.z) + 5.5;
      camera.position.copy(_tc); camera.lookAt(_tt); camera.updateMatrixWorld();
    }
    function titleTick(dt) {
      if (!st.title) return false;
      st.titleT += dt;
      if (st.titleOut < 0) { if (gateEl && gateEl.classList.contains('off')) { st.titleOut = 0; controls.lock(true); fadeEl.style.opacity = '1'; } return true; }
      st.titleOut += dt;
      if (st.titleOut < 1.75) return true;                           // 黒になりきるまで待つ
      st.title = false; document.body.classList.remove('sun-title'); const av = walker.avatar; if (av && av.setVisible) av.setVisible(true);
      fadeEl.style.transition = 'none'; fadeEl.style.opacity = '0'; void fadeEl.offsetWidth; fadeEl.style.transition = '';
      if (!st.started) { begin(); return true; }                     // 1 回目：オープニングの最初（真っ暗）は、もう黒い
      fadeEl.style.opacity = '1'; void fadeEl.offsetWidth; fadeEl.style.transition = 'opacity 1.2s ease'; fadeEl.style.opacity = '0';      // 2 回目から：黒から花の丘へ
      st.phase = 'free'; controls.lock(false); document.body.classList.remove('sun-intro'); if (isDark()) snd.night(); else snd.hill(); return true;
    }
    // ---- 幹がカメラとエルフの間に入ったら、カメラをエルフのほうへ寄せる（ついていく間・歩いている間。花の丘と森）
    //   頭から カメラへの線を、木の幹（丘の上の大きな花の木・すその木・森の手前の木・アーチ）に当てて調べる（3 コマに 1 回）。寄るときは速く、もどるときはゆっくり（ガクッと動かない）
    const occRC = new THREE.Raycaster(), _oh = V3(0, 0, 0), _od = V3(0, 0, 0), _os = V3(0, 0, 0), _oo = V3(0, 0, 0); let occList = null, occK = 0, occWant = -1, occD = -1, occT = performance.now();
    function camOcclude() {
      const av = walker.avatar, now = performance.now(), dt = Math.min(0.1, (now - occT) / 1000); occT = now;
      if (!av || walker.mode !== 'tp') { occD = -1; return; }
      if (!occList) { occList = []; scene.traverse((o) => { if (o.isMesh && /^(giant_tree_\d+(_mid)?|giant_roots|tree5_v0_near|return_arch)$/.test(o.name)) occList.push(o); }); }
      const hb = av.model.getObjectByName('Head'); if (hb) { hb.getWorldPosition(_oh); _oh.y -= 0.25; } else _oh.set(player.x, av.root.position.y + 1.2, player.z);
      _od.copy(camera.position).sub(_oh); const full = _od.length(); if (full < 0.2) return; _od.multiplyScalar(1 / full);
      if (occWant < 0 || ++occK % 3 === 0) {                        // 頭と、左右の肩（横に 0.45 m）から、カメラのほうへ。どれかが幹に当たれば、いちばん近い所まで寄る
        occWant = full; _os.set(-_od.z, 0, _od.x).normalize();
        for (const k of [0, 1, -1]) { _oo.copy(_oh).addScaledVector(_os, 0.45 * k); if (k) _oo.y -= 0.25;
          occRC.set(_oo, _od); occRC.near = 0.05; occRC.far = full; const hit = occRC.intersectObjects(occList, false)[0]; if (hit) occWant = Math.min(occWant, Math.max(0.9, hit.distance - 0.45)); }
        for (let d = 1.5; d <= full + 0.01; d += 0.1) { if (Math.hypot(_oh.x + _od.x * d - HTc.x, _oh.z + _od.z * d - HTc.z) < 1.35) { occWant = Math.min(occWant, Math.max(1.5, d - 0.1)); break; } }      // 丘の上の大きな花の木：カメラは幹の中・幹のすぐそば（中心から 1.35 m）へは入らない
      }
      const want = Math.min(occWant, full);
      occD = occD < 0 ? want : occD + (want - occD) * (1 - Math.exp(-dt * (want < occD ? 9 : 2.2)));
      if (occD < full - 0.01) { camera.position.copy(_oh).addScaledVector(_od, occD); camera.updateMatrixWorld(); }
    }
    hillTick = (dt) => {
      if (titleTick(dt)) return;
      { const hi = st.phase === 'follow' || (st.phase === 'intro' && st.followed && st.s < TL.look), w = hi ? CAMF : CAM0; walker.cam.height = w.height; walker.cam.pitch = w.pitch; }      // ついていく間は、カメラを少し高く
      if (st.phase === 'wait') {
        if (st.waitSnd || (gateEl && !gateEl.classList.contains('off'))) return;        // 最初のタップを待つ
        if (!st.started) begin(); else { st.phase = 'free'; if (isDark()) snd.night(); else snd.hill(); }
      } else if (st.phase === 'free' && say.i >= 0 && say.hold && say.t >= SAY.hold && talk.full && player.z < hill.HILL.exitZ - 6 && Math.hypot(player.x - HTc.x, player.z - HTc.z) < HOME_R) {
        say.hold = false; say.t = SAY.talk[1];                       // 3 つそろったひとことを出したまま丘の上に着いた：送って、エンディングへ
      } else if (st.phase === 'free' && ui.full && !st.ended && say.i < 0 && !say.need && ui.busy === 0 && player.z < hill.HILL.exitZ - 6 && Math.hypot(player.x - HTc.x, player.z - HTc.z) < HOME_R) {
        beginEnding(true);                                           // 3 つそろえて、丘の上（始まりの木の近く）にもどってきた
      } else if (st.phase === 'follow') { followTick(dt);
      } else if (st.phase === 'intro') {
        let s = st.s + dt; const WL = LINES.find((l) => !st.done[l.i] && st.s <= l.hold && s >= l.hold); st.wait = WL || null; if (WL) s = WL.hold;      // セリフが出たら、演出をそこで止めて、押すのを待つ
        { const cs = st.followed ? s : Math.min(s, TL.follow); while (st.cue < CUES.length && CUES[st.cue][0] <= cs) CUES[st.cue++][1](); }      // ついていく場面より前は、follow の先のきっかけ（地鳴り）を鳴らさない
        if (!st.followed && s >= TL.follow) { startFollow(); faceElfNext = true; return; }      // 引きが終わった：操作開始（妖精についていく）
        const hush = s > TL.follow + 0.05 && s < TL.crack;         // 地面がゆれたら：エリアの音（風・鳥・草）を消し、われるしゅんかんにもどす
        if (hush !== !!st.hush) { if (hush) { st.userMuted = hill.audio.isMuted(); st.hush = true; hill.audio.setMuted(true); } else { st.hush = false; hill.audio.setMuted(st.userMuted); } }
        if (s >= TL.end) finish(); else apply(s);
      } else if (st.phase === 'ending') {
        let s = st.s + dt; const WL = !st.done[9] && st.s <= END_LINE.hold && s >= END_LINE.hold ? END_LINE : null; st.wait = WL; if (WL) s = WL.hold;      // ひと言が出たら、そこで止めて、押すのを待つ
        while (st.cue < CUES_E.length && CUES_E[st.cue][0] <= s) CUES_E[st.cue++][1]();
        if (s >= TLE.endcard && !st.endCard) showEnd();
        applyEnd(Math.min(s, TLE.endcard + 60)); st.s = s;
      }
      applyGesture(); faceElfNext = true;
      if (circle) circle.update(dt, U.uT.value);
    };
    let faceElfNext = false;
    const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = V3(0, 0, 0);
    // 演出中のカメラ：エルフの後ろ（向いている方の反対がわ）。終わりに、いつもの 3 人称のカメラへなめらかにもどる
    const _m = new THREE.Matrix4(), UP = V3(0, 1, 0), _tp = V3(0, 0, 0), _tq = new THREE.Quaternion();
    hillPlace = (t) => {
      const av = walker.avatar;
      if (faceElfNext) { faceElf(); faceElfNext = false; }
      if (st.hold) { if (fpTime) fpTime.value -= st.hold; if (windU) windU.uTime.value -= st.hold; }
      if (av) {
        if (st.shot && st.s < TL.pull[0]) {                           // 木にもたれる：根もとに置き、クリップがないときは体を後ろへたおす
          const k = 1 - st.lean, x = lerp(PL.x, P1.x, k), z = lerp(PL.z, P1.z, k);
          av.root.position.set(x, hill.groundH(x, z), z); av.root.rotation.order = 'YXZ'; av.root.rotation.x = clipOK('sleep_lean') || clipOK('wake_up') ? 0 : -0.2 * st.lean;
        } else if (av.root.rotation.x) av.root.rotation.x = 0;
        const ey = st.shot ? st.eyes : 0;                              // 目をとじる
        if (ey > 0.02) { av.setBlink(ey); if (av.setEyesClosed) av.setEyesClosed(ey > 0.5); st.eyeSet = true; } else if (st.eyeSet) { av.setBlink(0); if (av.setEyesClosed) av.setEyesClosed(false); st.eyeSet = false; }
        const lit = st.shot ? st.elfLit : st.endG ? (st.endLit || 0) : 0;                           // 妖精の光に照らされる
        if (lit !== st.litSet && walker.state.mats) { for (const m of walker.state.mats) m.color.setScalar(1 + 1.5 * lit); st.litSet = lit; }
      }
      if (bones) {                                                   // 首と頭を、エルフの左右の軸（ワールド）のまわりにたおす（＋ 後ろへ ＝ 見上げる、− 前へ ＝ うなだれる）：骨の向き ＝ 親の逆 × 回転 × 親 × もとの向き
        const hk = st.shot ? (clipOK('sleep_lean') || clipOK('wake_up') ? 0 : -1.3 * st.lean) + (clipOK('look_up') ? 0 : st.lookK) - (clipOK('nod') ? 0 : 1.3 * (st.nodK || 0)) : (st.headK || 0);
        const f = av.root.rotation.y; _bx.set(-Math.cos(f), 0, Math.sin(f)); _bq.setFromAxisAngle(_bx, 0.19 * hk);
        for (const o of bones) { o.b.parent.updateWorldMatrix(true, false); o.b.parent.getWorldQuaternion(_pq);
          o.b.quaternion.copy(_pq).invert().multiply(_bq).multiply(_pq).multiply(o.q); (o.set || (o.set = new THREE.Quaternion())).copy(o.b.quaternion); }
        const hb = bones[bones.length - 1]; if (hb) { hb.b.updateWorldMatrix(true, false); hb.b.getWorldPosition(headPos); }
      } else headPos.set(PL.x, PL.y + 1.25, PL.z);
      if (st.cutW > 0) {
        if (st.shot) { shotCam(st.s, t); _p.copy(st.cpos); _m.lookAt(_p, st.ctgt, UP); _q.setFromRotationMatrix(_m); }
        else {
          const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
          _p.set(EB.x + sy * st.camD + cy * CAM.side, EB.y + st.camH, EB.z + cy * st.camD - sy * CAM.side);
          _p.y = Math.max(_p.y, hill.groundH(_p.x, _p.z) + 0.35);
          _e.set(st.pitch + Math.sin(t * 43) * 0.004 * st.shake, st.yaw + Math.cos(t * 37) * 0.004 * st.shake, 0); _q.setFromEuler(_e);
          if (st.endWide > 0) { _tp.copy(Wp).addScaledVector(R1, 1.4 * st.endWide); _m.lookAt(_tp, Wt, UP); _tq.setFromRotationMatrix(_m); _p.lerp(_tp, st.endWide); _q.slerp(_tq, st.endWide); }
          if (st.endShot > 0) { endCam(st.s); _p.copy(st.cpos); _m.lookAt(_p, st.ctgt, UP); _q.setFromRotationMatrix(_m); }      // エンディングの a〜c：エルフの正面ななめ
        }
        const w = st.cutW * st.cutW * (3 - 2 * st.cutW);
        camera.position.lerp(_p, w); camera.quaternion.slerp(_q, w); camera.updateMatrixWorld();
      }
      if (st.shot && st.quakeK > 0) { const q = st.quakeK;              // 地面がゆれる
        camera.position.x += Math.sin(t * 61) * 0.06 * q; camera.position.y += Math.sin(t * 47 + 1) * 0.05 * q; camera.rotateZ(Math.sin(t * 53) * 0.012 * q); camera.updateMatrixWorld(); }
      if (st.shot && st.fm < 1 && fairy.visible) {                    // 目の前の妖精：目の 1.25 m 先（立つと少しはなれる）。ふわふわ動く
        const wk = sstep(st.s, TL.wake[0], TL.wake[1]), T = U.uT.value;
        _tp.copy(eye).addScaledVector(lookV, 1.25 + 0.35 * wk).addScaledVector(R0, 0.05 + Math.sin(T * 1.3) * 0.05); _tp.y += -0.03 + Math.sin(T * 2.3) * 0.035;
        fairyU.uPos.value.lerpVectors(_tp, st.fbase, st.fm); haloU.uPos.value.copy(fairyU.uPos.value);
      }
      if (st.title) { titleCam(st.titleT); fairy.visible = false; if (av && av.setVisible) av.setVisible(false); }
      const lidOn = st.shot && !st.title && st.s < TL.open[1] + 0.5;  // まぶた（目の形のすきま）と、ぼやけ
      if (lidOn !== !!st.lidOn) { st.lidOn = lidOn; lidsEl.style.display = lidOn ? 'block' : 'none'; st.lidDrawn = -1; if (!lidOn) renderer.domElement.style.filter = ''; }
      if (lidOn) { const lw = Math.ceil(window.innerWidth / 3), lh = Math.ceil(window.innerHeight / 3);      // 絵は画面の 1/3 の細かさで足りる（ふちはぼかすので）
        if (st.lidDrawn !== st.lid || lidsEl.width !== lw || lidsEl.height !== lh) { st.lidDrawn = st.lid; eyeMask(lw, lh, st.lid, lidsEl); }
        renderer.domElement.style.filter = st.blur > 0.3 ? `blur(${st.blur.toFixed(1)}px)` : ''; }
      if (st.phase === 'follow' || st.phase === 'free') camOcclude();
      sunU.uPos.value.copy(camera.position).addScaledVector(SUN, SUN_DIST);
      placeUI();
    };

    // ---- はじめの状態
    const direct = !Q0.has('from');                                   // sun_start.html を直接開いた（ほかのエリアから歩いてきたのではない）
    if (!st.started) { atSpot(); apply(0); showUI(false); }                       // 1 回目：昼の丘の木の下で寝ている（タップを待つ）
    else if (st.ended) { applyEnd(END); st.uiK = -1; showUI(false); }             // エンディングのあと：明るい花の丘
    else { apply(END); showUI(true); if (direct) { atStart(); player.yaw = YAW_END; player.pitch = START.pitch; } }      // ゲーム中：暗い花の丘（3 つそろっていれば、丘の上に目じるしの光。木の近くに行くとエンディング）
    hillHome();
    if (ui.full && !st.ended) circleReady();                           // 3 つそろっている：エンディングの魔法陣を先に読んでおく

    // ---- 確認用（花の丘）
    const label = (g, x, y, w, LH, key, text) => {
      g.fillStyle = '#17302f'; g.fillRect(x, y, w, LH);
      g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.font = '700 50px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(key, x + 22, y + LH / 2 + 2);
      g.font = `700 ${text.length > 12 ? 30 : 36}px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif`; g.fillText(text, x + 74, y + LH / 2 + 2);
    };
    async function sheet(panels, cols, w, h, setup) {
      await walker.setMode('tp');
      const LH = 78, gap = 8, rows = Math.ceil(panels.length / cols), c = document.createElement('canvas'); c.width = w * cols + gap * (cols - 1); c.height = (h + LH) * rows + gap * (rows - 1);
      const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < panels.length; i++) {
        const [key, text, s] = panels[i], x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (h + LH + gap);
        atStart(); const over = setup(s);
        for (let k = 0; k < 45; k++) { walker.update(1 / 30); faceElf(true); walker.placeCamera(0, 0); }      // 髪などのゆれものを落ちつかせる（止め絵にするとき、向きが急に変わるため）
        walker.update(0); faceElf(true); const img = G.shot(w, h);
        label(g, x, y, w, LH, key, text); g.drawImage(img, x, y + LH);
        if (over) await over(g, x, y + LH, w, h);
      }
      return c;
    }
    Object.assign(hillApi, {
      TLE, END, E,
      seek(s) { st.phase = 'seek'; apply(s); if (s >= TL.end) { player.x = B.x; player.z = B.z; player.yaw = YAW1; player.pitch = START.pitch; } applyGesture(); faceElf(true); },      // 始まりの s 秒めの止め絵にする（音・保存なし）
      seekEnd(s) { st.phase = 'seek'; st.endIn = false; st.endYaw0 = CAM.yaw0; EB.copy(E); st.pathMode = null; applyEnd(s); faceElf(true); },                                                                    // エンディングの s 秒めの止め絵
      play() { resetAll(); st.started = st.ended = false; ui.on = pieces(); ui.full = false; drawUI(); begin(); },                        // 始まりを最初から流す
      playEnding() { for (const k of Object.values(CIRCLE_KEYS)) store.set(k, '1'); store.del(SUN_END_KEY); st.ended = false; ui.on = pieces(); beginEnding(); },
      // 確認画像：始まりの後半（①〜⑨、3 列 3 段。① ＝ 前の暗い世界の絵（old で受けとる）、② から直したあと）
      preview(w = 640, h = 400, old = null) {                        // old ＝ ① に入れる「今まで」の絵（なければ、今の絵のまま）
        return sheet([['①', '「…太陽が、われちゃった」', TL.talkC[0] + 1.3], ['②', '光が森の向こうへ落ちる', TL.fly0 + 2.7], ['③', '光の柱が 1 本ずつ立つ', TL.rise + TL.riseGap + 0.9],
          ['④', '3 本そろう（静かな間）', TL.bud - 0.6], ['⑤', '花がつぼみに', TL.close[1] + 0.3], ['⑥', '「ど、どうしよう…」', TL.talk2[0] + 1.1],
          ['⑦', '「エルフの力なら…」', TL.talkE[0] + 1.1], ['⑧', 'エルフがうなずく', TL.nod[0] + 0.4], ['⑨', '「じゃあ…集めようか」', TL.talkF[0] + 1.1]], 3, w, h, (s) => {
          if (s === 'dark') { hillApi.seek(END); return (g, x, y, pw, ph) => drawVig(g, x, y, pw, ph, 1); }
          if (s === 'old') { hillApi.seek(END); return (g, x, y, pw, ph) => { if (old) g.drawImage(old, x, y, pw, ph); }; }
          if (s === 'follow') { hillApi.seek(TL.follow); const a = WPS[0], b = WPS[1]; player.x = lerp(a.x, b.x, 0.25); player.z = lerp(a.z, b.z, 0.25); player.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); player.pitch = 0.1;
            fairy.visible = true; fairyU.uA.value = 1; fairyU.uPos.value.set(b.x, b.y + 1.6, b.z); return null; }
          hillApi.seek(s);
          return async (g, x, y, pw, ph) => {                        // まぶた・ぼやけ・吹き出しを絵に入れる
            g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
            if (st.blur > 0.3) { g.filter = `blur(${(st.blur * pw / 640).toFixed(1)}px)`; g.drawImage(g.canvas, x, y, pw, ph, x, y, pw, ph); g.filter = 'none'; }
            if (s < TL.open[1] + 0.5) g.drawImage(eyeMask(pw, ph, st.lid), x, y);
            g.restore(); drawVig(g, x, y, pw, ph, nightV >= 0 ? nightV : 0);
            if (talkEl.classList.contains('show')) await drawBubble(g, x + pw / 2, y + ph - 22, 640, st.talkI);
          };
        }).then((c) => { atStart(); hillApi.seek(END); return c; });
      },
      // 確認画像：目を開ける形の比較（3 列 2 段。① ＝ 前のまっすぐな帯、②〜④ ＝ 目の形。下の段に縦向き）
      async previewEye(w = 560, h = 420) {
        await walker.setMode('tp');
        const PN = [['①', '今まで（まっすぐ）', 0.42, 'old', 0], ['②', '少し開いた', 0.22, 'new', 0], ['③', '半分開いた', 0.5, 'new', 0], ['②', '少し開いた（縦）', 0.22, 'new', 1], ['③', '半分開いた（縦）', 0.5, 'new', 1], ['④', '大きく開いた', 0.62, 'new', 0]];
        const LH = 78, gap = 8, cols = 3, rows = Math.ceil(PN.length / cols), c = document.createElement('canvas'); c.width = w * cols + gap * (cols - 1); c.height = (h + LH) * rows + gap * (rows - 1);
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < PN.length; i++) {
          const [key, text, lid, mode, port] = PN[i], x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (h + LH + gap), sw = port ? Math.round(h * 375 / 812) : w, px = x + Math.round((w - sw) / 2), py = y + LH;
          atStart(); hillApi.seek(TL.open[0] + 0.85);
          for (let k = 0; k < 45; k++) { walker.update(1 / 30); faceElf(true); walker.placeCamera(0, 0); }
          walker.update(0); faceElf(true); const img = G.shot(sw, h);
          label(g, x, y, w, LH, key, text); g.fillStyle = '#0c1024'; g.fillRect(x, py, w, h);
          g.save(); g.beginPath(); g.rect(px, py, sw, h); g.clip();
          g.filter = `blur(${(14 * (1 - lid * 0.7) * h / 420).toFixed(1)}px)`; g.drawImage(img, px, py, sw, h); g.filter = 'none';
          if (mode === 'old') { const hh = (1 - lid) * 0.64 * h, t = g.createLinearGradient(0, py, 0, py + hh); t.addColorStop(0, '#000'); t.addColorStop(0.78, '#000'); t.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = t; g.fillRect(px, py, sw, hh);
            const b = g.createLinearGradient(0, py + h - hh, 0, py + h); b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(0.22, '#000'); b.addColorStop(1, '#000'); g.fillStyle = b; g.fillRect(px, py + h - hh, sw, hh);
          } else g.drawImage(eyeMask(sw, h, lid), px, py);
          g.restore();
        }
        atStart(); hillApi.seek(END); return c;
      },
      // 確認画像：今やること（左上の 1 行）。①〜③ ＝ 3 つのタスク（720×540 の画面）/ ④ スマホ横（844×390）/ ⑤ 英語 / ⑥ スマホ縦（375×812）。上の太陽マークも入れる（重ならないことを見る）
      async previewTask(w = 560, h = 420) {
        await walker.setMode('tp'); const keep = { on: { ...ui.on }, full: ui.full }, info = {};
        const PN = [['①', '明るい世界（妖精についていく）', 0, 'ja', 720, 540], ['②', '暗い世界（かけらを集める）', 1, 'ja', 720, 540], ['③', '暗い世界（花の丘にもどる）', 2, 'ja', 720, 540], ['④', 'スマホ横', 1, 'ja', 844, 390], ['⑤', '英語', 1, 'en', 720, 540], ['⑥', 'スマホ縦', 2, 'ja', 375, 812]];
        const LH = 78, gap = 8, cols = 3, rows = Math.ceil(PN.length / cols), c = document.createElement('canvas'); c.width = w * cols + gap * (cols - 1); c.height = (h + LH) * rows + gap * (rows - 1);
        const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < PN.length; i++) {
          const [key, text, tk, l, dw, dh] = PN[i], x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (h + LH + gap), k = Math.min(w / dw, h / dh), sw = Math.round(dw * k), sh = Math.round(dh * k), px = x + Math.round((w - sw) / 2), py = y + LH + Math.round((h - sh) / 2);
          atStart(); showTalk(-1);
          if (tk === 0) { hillApi.seek(TL.follow); const a = WPS[0], b = WPS[1]; player.x = lerp(a.x, b.x, 0.25); player.z = lerp(a.z, b.z, 0.25); player.yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z)); player.pitch = 0.1; fairy.visible = true; fairyU.uA.value = 1; fairyU.uPos.value.set(b.x, b.y + 1.6, b.z); }
          else { hillApi.seek(END); fairy.visible = false; ui.on = tk === 2 ? { ...ALL3 } : { ruins: true, mushroom: false, cave: false }; ui.full = tk === 2; home.visible = tk === 2; homeU.uA.value = 1; refreshBeams(); }
          for (let n = 0; n < 45; n++) { walker.update(1 / 30); faceElf(true); walker.placeCamera(0, 0); }
          walker.update(0); faceElf(true); const img = G.shot(sw, sh);
          label(g, x, y, w, LH, key, text); g.fillStyle = '#0c1024'; g.fillRect(x, y + LH, w, h); g.drawImage(img, px, py, sw, sh);
          g.save(); g.translate(px, py); g.scale(k, k);
          if (tk > 0) { const d = UI * (ui.full ? 1.15 : 1); g.drawImage(await svgImage(sunSVG(ui.on, { full: ui.full, id: `t${i}`, size: 240 })), dw / 2 - d / 2, UIY - d / 2, d, d); }
          const r = await drawTask(g, dw, tk, l, dh); g.restore();
          info[`${key} ${text}`] = { right: r.right, bottom: r.bottom, markLeft: Math.round(dw / 2 - UI * 1.15 / 2), clear: r.bottom <= 8 || r.right < dw / 2 - UI * 1.15 / 2 || 100 >= 8 + UI * 1.075 && r.bottom > 92 };
        }
        ui.on = keep.on; ui.full = keep.full; hillHome(); refreshBeams(); atStart(); if (st.ended) hillApi.seekEnd(END); else if (st.started) hillApi.seek(END); else hillApi.seek(0);
        c.info = info; return c;
      },
      // 確認画像：エンディング（①〜⑥ の流れの順、3 列 2 段）。上の太陽マーク・かけら・1 つになった太陽も絵に入れる
      async previewEnding(w = 640, h = 400) {
        const keep = { on: { ...ui.on }, full: ui.full }; EB.copy(E); await circleReady();
        return sheet([['①', '丘に着く', 0.5], ['②', '魔法陣が広がる', TLE.circle[1] + 0.2], ['③', 'かけらが手元へ', TLE.take[2] + 0.7],
          ['④', '1つにくっつく', TLE.merge - 1.0], ['⑤', '空へのぼる', TLE.cut + 1.7], ['⑥', '明るくなった世界', TLE.joy + 1.6]], 3, w, h, (s) => {
          fairy.visible = false; showTalk(-1); ui.on = { ...ALL3 }; ui.full = true; hillApi.seekEnd(s);
          return (g, x, y, pw, ph) => drawEndUI(g, x, y, pw, ph, s);
        }).then((c) => { ui.on = keep.on; ui.full = keep.full; hillHome(); refreshBeams(); return c; }).then((c) => { if (st.ended) hillApi.seekEnd(END); else if (st.started) hillApi.seek(END); else hillApi.seek(0); return c; });
      },
      // 確認画像：妖精のセリフの字（A 今 ＝ 端末のフォント（基準）/ B〜E 4 言語・縦 / F 日本語・横持ち）。どれも、始まりの 2 つめのセリフの画面。3 列 2 段、パネル 520×720
      async previewFont() {
        const PW = 520, PH = 720, LH = 78, gap = 8, c = document.createElement('canvas'); c.width = PW * 3 + gap * 2; c.height = (PH + LH) * 2 + gap;
        const g = c.getContext('2d'), info = {}, keep = lang; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        const P = [['A', '今（基準・日本語）', 390, 844, 'ja', true], ['B', '日本語', 390, 844, 'ja'], ['C', 'English', 390, 844, 'en'], ['D', '中文', 390, 844, 'zh'], ['E', '한국어', 390, 844, 'ko'], ['F', '日本語・横持ち', 844, 390, 'ja']];
        await walker.setMode('tp');
        for (let i = 0; i < P.length; i++) {
          const [key, text, W, H, l, old] = P[i], x = (i % 3) * (PW + gap), y = Math.floor(i / 3) * (PH + LH + gap), k = Math.min(PW / W, PH / H);
          g.fillStyle = '#17302f'; g.fillRect(x, y, PW, LH); g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
          g.font = '700 50px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(key, x + 20, y + LH / 2 + 2);
          g.font = '700 36px "Yu Gothic UI", "Malgun Gothic", "Microsoft YaHei", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(text, x + 70, y + LH / 2 + 2);
          g.fillStyle = '#0c1020'; g.fillRect(x, y + LH, PW, PH);
          lang = l; hillApi.seek((TL.talk2[0] + TL.talk2[1]) / 2);
          for (let n = 0; n < 45; n++) { walker.update(1 / 30); faceElf(true); walker.placeCamera(0, 0); }
          walker.update(0); faceElf(true); const img = G.shot(W, H);
          g.save(); g.translate(x + (PW - W * k) / 2, y + LH + (PH - H * k) / 2); g.scale(k, k); g.drawImage(img, 0, 0);
          talkFontOff = !!old; const r = await drawBubble(g, W / 2, H - 26, W, 1); talkFontOff = false; g.restore();
          info[key] = { ...r, loaded: old ? null : document.fonts.check(`700 16px "Ohisama C Talk ${l}"`, TEXT[l].talk.flat().join('')) };
        }
        for (const l of LANGS) { lang = l; const t = document.createElement('canvas').getContext('2d'); info[`${l}_w375`] = []; for (let ti = 0; ti < 3; ti++) info[`${l}_w375`].push((await drawBubble(t, 200, 200, 375, ti)).width); }      // どのセリフも、幅 375 の画面（92% ＝ 345 px）におさまるか
        lang = keep; hillApi.seek(st.started ? END : 0); c.info = info;
        return c;
      },
      // 確認画像：最初の画面の大きさと左の余白（① 今まで / ② 直したあと。上の段 ＝ 縦、下の段 ＝ 横持ち）。3 列 2 段、パネル 520×720
      async previewTitle() {
        const PW = 520, PH = 720, LH = 78, gap = 8, c = document.createElement('canvas'); c.width = PW * 3 + gap * 2; c.height = (PH + LH) * 2 + gap;
        const g = c.getContext('2d'), info = {}, keep = lang; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
        const load = (u) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
        await document.fonts.load(`700 30px ${TITLE_FONT}`, LANGS.map((l) => TEXT[l].title + TEXT[l].name).join('') + START_LABEL);
        const P = [['① 今まで（縦）', 390, 844, 'ruins', 'ja', true], ['② 直したあと（縦）', 390, 844, 'ruins', 'ja'], ['② 直したあと・English', 390, 844, 'valley', 'en'],
          ['① 今まで（横）', 844, 390, 'ruins', 'ja', true], ['② 直したあと（横）', 844, 390, 'ruins', 'ja'], ['② 直したあと・한국어', 844, 390, 'cave', 'ko']];
        for (let i = 0; i < P.length; i++) {
          const [text, W, H, bgn, l, old] = P[i], x = (i % 3) * (PW + gap), y = Math.floor(i / 3) * (PH + LH + gap);
          g.fillStyle = '#17302f'; g.fillRect(x, y, PW, LH); g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
          g.font = '700 38px "Yu Gothic UI", "Malgun Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(text, x + 20, y + LH / 2 + 2);
          g.fillStyle = '#0c1020'; g.fillRect(x, y + LH, PW, PH);
          lang = l; titleOld = !!old; const k = Math.min(PW / W, PH / H); g.save(); g.translate(x + (PW - W * k) / 2, y + LH + (PH - H * k) / 2); g.scale(k, k); const L = await drawTitle(g, W, H, [[await load(titleBgUrl(bgn, W < H)), 1]]); g.restore(); titleOld = false;
          info[text] = { k: +L.k.toFixed(2), title: Math.round(L.fs * L.k), button: Math.round(46 * L.k), left: L.left };
        }
        for (const l of LANGS) for (const [W, H] of [[375, 812], [844, 390]]) { lang = l; const L = titleLayout(W, H); _tg.font = `700 ${L.fs}px ${titleFont(l)}`; const tw = (_tg.measureText(TEXT[l].title).width + 0.08 * L.fs * TEXT[l].title.length) * L.k;
          info[`${l} ${W}`] = { titleW: Math.round(tw), room: Math.round(L.colW), fits: tw <= L.colW - 16 && L.h * L.k <= H }; }
        lang = keep; c.info = info;
        return c;
      },
    });
  }

  // ================================================================ 小川と滝：滝つぼの平たい岩 → 滝のうらの水晶の洞くつ（洞くつから戻ると、平たい岩の上に立つ）
  let streamTick = () => {};
  if (area === 'stream' && G.places && G.places.ROCK) {
    const R = G.places.ROCK, F = G.places.FOOT; let armed = true;
    if (Q0.get('from') === 'cave') { player.x = R.x; player.z = R.z; player.yaw = Math.PI; armed = false; }
    if (F) {                                                          // 目じるし：滝のうらから、金色の光がもれる（洞くつのかけらを集めるまで）
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.4, 'rgba(255,200,90,.45)'); gr.addColorStop(1, 'rgba(255,190,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.75 }));
      sp.position.set(F.x, F.y + 2.2, F.z - 0.4); sp.scale.setScalar(6.5); sp.name = 'sun_cave_glow'; sp.visible = !ui.on.cave; scene.add(sp);
    }
    streamTick = () => {
      const d = Math.hypot(player.x - R.x, player.z - R.z);
      if (!armed) { if (d > R.r + 0.6) armed = true; return; }
      if (d < R.r * 0.55) go('crystal_cave.html', 'stream');
    };
  }

  // ================================================================ 魔法陣の開放（magic_circle.js のイベント）→ かけらがエルフの手元に来て → 上の太陽マークへ飛んで、はまる
  //   'sunpiece:release'（detail: { id: 'ruins' | 'mushroom' | 'cave', x, y, size }。size ＝ その時の結晶の見かけの高さ px。なくてもよい）＝ かけらが手元から飛び立った瞬間。x・y はその時の画面上の場所（CSS px）。ここから flyPiece が引きつぐ（3D のかけらは魔法陣の側が消す）
  //   'suncircle:open' ＝ 開放した（保存された）。このあと 'sunpiece:release' が来なかったとき（魔法陣の側が古い など）のために、開放の演出が終わるのを待ってから、かわりに飛ばす
  const _w = V3(0, 0, 0), openWait = {}, nameOf = { ruins: 'ruins', mushroom: 'mushroom', valley: 'mushroom', cave: 'cave' };
  window.addEventListener('sunpiece:release', (e) => {
    const d = e.detail || {}, name = nameOf[d.id]; if (!name) return;
    flyPiece(name, Number.isFinite(d.x) && Number.isFinite(d.y) ? [clamp(d.x, 0, window.innerWidth), clamp(d.y, 0, window.innerHeight)] : null, d.size);
  });
  window.addEventListener('suncircle:open', (e) => {
    const name = Object.keys(CIRCLE_KEYS).find((n) => CIRCLE_KEYS[n] === (e.detail && e.detail.key)); if (!name || ui.on[name] || flying[name] || openWait[name]) return;
    const t0 = performance.now(), circle = G.circle;
    const iv = setInterval(() => {                                   // 開放の演出が終わって 1.5 秒（演出のようすがわからないときは 14 秒）たっても合図がなければ、エルフのあたりから飛ばす
      const el = performance.now() - t0, done = circle && circle.state === 'open';
      if (done && !openWait[name].t) openWait[name].t = el;
      if (el > 20000 || (done ? el - openWait[name].t > 1500 : !circle && el > 14000)) {
        const av = walker.avatar; let from = null;
        if (av) { _w.copy(av.root.position); _w.y += 1.05; _w.project(camera); if (_w.z < 1 && Math.abs(_w.x) < 1 && Math.abs(_w.y) < 1) from = [(_w.x * 0.5 + 0.5) * window.innerWidth, (0.5 - _w.y * 0.5) * window.innerHeight]; }
        flyPiece(name, from);
      }
    }, 200);
    openWait[name] = () => { clearInterval(iv); openWait[name] = null; };
  });
  // テスト用：?sunpiece=ruins（mushroom・cave・all。コンマで複数）＝ そのかけらを集めたことにする（保存して、UI へ飛んでくる）
  if (Q0.has('sunpiece') && st.started) {
    const list = Q0.get('sunpiece') === 'all' ? Object.keys(CIRCLE_KEYS) : Q0.get('sunpiece').split(',').filter((n) => CIRCLE_KEYS[n]);
    list.filter((n) => !ui.on[n]).forEach((n, i) => setTimeout(() => { store.set(CIRCLE_KEYS[n], '1'); flyPiece(n); }, 1500 + i * 1900));
  }

  // ================================================================ 毎フレーム（walker は各ページと同じ物なので、ここで包めば向こうの呼び出しに入る）
  const origUpdate = walker.update, origPlace = walker.placeCamera;
  walker.update = (dt) => { frameDt += dt; U.uT.value += dt; if (snd.ready && G.audio) snd.mute(st.hush ? st.userMuted : G.audio.isMuted()); hillTick(dt); streamTick(); origUpdate(dt); hillAfter(); sayTick(dt); talkTick(dt); taskTick(dt); };
  walker.placeCamera = (t, dt) => {
    origPlace(t, dt); U.uPR.value = renderer.domElement.height / 800;
    hillPlace(t);
    fairySync(frameDt); frameDt = 0; vigTick();
  };

  // はじめの状態（花の丘は setupHill の中で決めた）
  if (!isHill) { st.phase = 'free'; if (isDark()) setNight(1); else if (dayNight) dayNight.set(false, true); showUI(!st.ended); if (isDark()) { const n = () => { window.removeEventListener('pointerdown', n, true); window.removeEventListener('keydown', n, true); snd.unlock(); snd.night(); }; window.addEventListener('pointerdown', n, true); window.addEventListener('keydown', n, true); } }

  // ================================================================ 確認用
  const svgImage = (svg) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  window.__sun = { talkLog: () => talkLog.slice(), bubble: (g, cx, bottom, vw, i, l) => { const k = lang; if (l) lang = l; return drawBubble(g, cx, bottom, vw, i).finally(() => { lang = k; }); },      // 確認画像用：吹き出し・セリフ枠を絵に描く fairyShown: () => ({ x: fairyS.uPos.value.x, y: fairyS.uPos.value.y, z: fairyS.uPos.value.z, a: fairyMesh.visible ? fairyS.uA.value : 0 }),
    state: st, TL, SHARDS, snd, ui, KEY: SUN_GAME_KEY, area,
    step(dt) { walker.update(dt); },                                                    // 1 コマぶん進める
    collect(name) { store.set(CIRCLE_KEYS[name], '1'); flyPiece(name); },                 // かけらを集めたことにする（UI へ飛んでくる）
    reset: resetAll, go,
    // 確認用：コンソールから合図を出す。例 __sun.release('cave') ＝ エルフの手元から飛ばす
    release(id, x, y, size) { const av = walker.avatar; if (x === undefined && av) { _w.copy(av.root.position); _w.y += 1.05; _w.project(camera); x = (_w.x * 0.5 + 0.5) * window.innerWidth; y = (0.5 - _w.y * 0.5) * window.innerHeight; }
      window.dispatchEvent(new CustomEvent('sunpiece:release', { detail: { id, x, y, size } })); },
    // 確認画像：実際に魔法陣を開放して、手元 → 太陽マークを連続コマにとる（合図 sunpiece:release の時刻を 0 として、times 秒のコマ）。魔法陣の上に立ってから呼ぶ。
    //   ゲームの画面（3D）は、そのコマの canvas をそのまま写し、画面側のかけら・太陽マーク（DOM）は、その時の実際の状態から描く。返す canvas の .info に、各コマの「3D のかけらが見えているか・画面側のかけらがあるか」
    recordRelease(times = [-0.2, 0, 0.2, 0.5, 0.9, 1.4], labels = ['手元にある', '飛び立つ瞬間', '0.2 秒後', '0.5 秒後', '0.9 秒後', 'はまった']) {
      return new Promise((resolve) => {
        const W = window.innerWidth, H = window.innerHeight, shots = [], hist = []; let t0 = null, name = null, done = false;
        const grab = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(renderer.domElement, 0, 0, W, H);
          const sh = scene.getObjectByName('sun_shard'), gm = scene.getObjectByName('sun_shard_gem'), f = name && flying[name];
          const st3 = !!(sh && sh.visible && gm && gm.scale.y > 0.01), q = f ? flyAt((performance.now() - f.t0) / FLY.ms, f.from[0], f.from[1], f.to[0], f.to[1], f.size) : null;
          return { c, t: performance.now(), three: st3, q, on: { ...ui.on }, full: ui.full, uiS: new DOMMatrix(getComputedStyle(uiEl).transform).a }; };
        const onRel = (e) => { t0 = performance.now(); name = nameOf[e.detail.id]; };
        window.addEventListener('sunpiece:release', onRel, { once: true });
        const loop = () => {
          if (done) return; requestAnimationFrame(loop);
          const fr = grab(); hist.push(fr); if (hist.length > 40) hist.shift();
          if (t0 === null) return;
          while (shots.length < times.length) { const want = t0 + times[shots.length] * 1000;
            if (want <= fr.t) { let best = hist[0]; for (const h of hist) if (Math.abs(h.t - want) < Math.abs(best.t - want)) best = h; shots.push({ ...best, dt: ((best.t - t0) / 1000) }); } else break; }
          if (shots.length === times.length) { done = true; finish(); }
        };
        const finish = async () => {
          const PW = 520, PH = 720, LH = 78, gap = 8, cols = 3, rows = Math.ceil(shots.length / cols), c = document.createElement('canvas'); c.width = PW * cols + gap * (cols - 1); c.height = (PH + LH) * rows + gap * (rows - 1);
          const g = c.getContext('2d'), k = Math.min(PW / W, PH / H), info = []; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
          const gemImg = await svgImage(GEM_SVG), wedgeImg = await svgImage(sunSVG({ [name]: true }, { only: name, id: 'rw', size: 240 }));
          for (let i = 0; i < shots.length; i++) {
            const s = shots[i], x = (i % cols) * (PW + gap), y = Math.floor(i / cols) * (PH + LH + gap);
            g.fillStyle = '#17302f'; g.fillRect(x, y, PW, LH); g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left';
            g.font = '700 50px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText('ABCDEFGH'[i], x + 20, y + LH / 2 + 2);
            g.font = '700 34px "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif'; g.fillText(labels[i] || `${times[i]} 秒`, x + 70, y + LH / 2 + 2);
            g.fillStyle = '#0c1020'; g.fillRect(x, y + LH, PW, PH);
            g.save(); g.translate(x + (PW - W * k) / 2, y + LH + (PH - H * k) / 2); g.scale(k, k); g.beginPath(); g.rect(0, 0, W, H); g.clip(); g.drawImage(s.c, 0, 0);
            const d = UI * s.uiS; g.drawImage(await svgImage(sunSVG(s.on, { full: s.full, id: `r${i}`, size: 240 })), W / 2 - d / 2, UIY - d / 2, d, d);
            if (s.q) { const q = s.q, sz = 60 * q.sc, gr = FLY.glow * FLY.gemH / 60 * sz / 2, rg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, gr);
              rg.addColorStop(0, `rgba(255,246,216,${0.95 * q.glow})`); rg.addColorStop(0.34, `rgba(255,211,106,${0.5 * q.glow})`); rg.addColorStop(0.7, 'rgba(255,200,90,0)'); g.fillStyle = rg; g.beginPath(); g.arc(q.x, q.y, gr, 0, 7); g.fill();
              g.globalAlpha = q.gem; g.drawImage(gemImg, q.x - sz / 2, q.y - sz / 2, sz, sz);
              g.globalAlpha = q.wedge; g.save(); g.translate(q.x, q.y); g.rotate(q.rot * D2R); g.drawImage(wedgeImg, -sz / 2, -sz / 2, sz, sz); g.restore(); g.globalAlpha = 1; }
            g.restore(); info.push({ t: +s.dt.toFixed(2), three: s.three, dom: !!s.q, pieces: (s.three ? 1 : 0) + (s.q ? 1 : 0), ui: s.on[name] });
          }
          c.info = info; resolve(c);
        };
        requestAnimationFrame(loop);
      });
    },
    ...hillApi,
  };
}
