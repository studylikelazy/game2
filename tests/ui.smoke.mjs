// jsdom を使ったUIスモークテスト（ブラウザ実行なしで描画と操作を検証）
// 実行: NODE_PATH=/tmp/node_modules node tests/ui.smoke.mjs
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require2 = createRequire(import.meta.url);
const { JSDOM } = require2(process.env.JSDOM_PATH || '/tmp/node_modules/jsdom/lib/api.js');

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:4173/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;
window.localStorage.clear();

const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
window.HTMLCanvasElement.prototype.getContext = () => null;
window.AudioContext = undefined;

// ES Modules をDOMへ流し込むため、依存を解決してから実行する
const { readFile: rf } = await import('node:fs/promises');
const engineSrc = await rf(new URL('../src/core/rng.js', import.meta.url), 'utf8');
const dataSrc = await rf(new URL('../src/core/data.js', import.meta.url), 'utf8');
const coreSrc = await rf(new URL('../src/core/engine.js', import.meta.url), 'utf8');
const storageSrc = await rf(new URL('../src/core/storage.js', import.meta.url), 'utf8');
const domSrc = await rf(new URL('../src/ui/dom.js', import.meta.url), 'utf8');
const audioSrc = await rf(new URL('../src/ui/audio.js', import.meta.url), 'utf8');
const mainSrc = await rf(new URL('../src/ui/main.js', import.meta.url), 'utf8');

function bundle(files) {
  return files.map((src) => src
    // 複数行 import をまとめて除去
    .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']*';?$/gm, '')
    .replace(/^import .*?;$/gm, '')
    .replace(/^export (class|function|const|let|\{)/gm, '$1')
    .replace(/export \{[^}]*\};?/g, '')).join('\n');
}

const combined = bundle([engineSrc, dataSrc, coreSrc, storageSrc, domSrc, audioSrc, mainSrc]);
window.eval(combined);

const { ui, engine, startNewRun } = window.__ABYSS__;
const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
const $ = (s) => window.document.querySelector(s);

assert($('#title-actions').children.length >= 1, 'タイトルにボタンがない');
console.log('✓ タイトル描画');

// クラス選択 → 開始
$('#title-actions .btn--primary').click();
assert(ui.overlay === 'class', 'クラス選択が出ない');
const classCards = window.document.querySelectorAll('.class-card');
assert(classCards.length === 3, `クラスが3つでない: ${classCards.length}`);
console.log('✓ クラス選択');

startNewRun('vanguard', 'ui-smoke-seed');
assert(ui.screen === 'game', 'ゲーム画面へ遷移しない');
assert($('#stage').children.length > 0, 'ステージが空');
console.log('✓ ゲーム開始');

// 部屋を進める（戦闘はスキル→ターン終了、非戦闘は選択肢を押す）
let steps = 0;
while (!engine.run.finished && !engine.run.reward && steps < 80) {
  steps += 1;
  const skillBtns = [...window.document.querySelectorAll('.skill-card:not([disabled])')];
  if (skillBtns.length) { skillBtns[0].click(); continue; }
  const endBtn = [...window.document.querySelectorAll('.btn--primary')].find((b) => b.textContent.includes('ターンを終える'));
  if (endBtn) { endBtn.click(); continue; }
  const choice = window.document.querySelector('.room-panel .choice');
  if (choice) { choice.click(); continue; }
  const anyBtn = [...window.document.querySelectorAll('.room-panel .btn, .room-panel .pick-card')][0];
  if (anyBtn) { anyBtn.click(); continue; }
  break;
}
assert(steps < 80, '部屋が進まない');
console.log(`✓ ${steps} 操作で戦闘/部屋を処理 (reward=${!!engine.run.reward}, finished=${engine.run.finished}, room=${engine.run.room?.type})`);

// 報酬画面 → カード選択
if (engine.run.reward) {
  const pick = window.document.querySelector('.card-pick .pick-card');
  assert(pick, '報酬カードがない');
  pick.click();
  assert(!engine.run.reward, 'カードを選んでも報酬が消えない');
  console.log('✓ 報酬カード選択');
  const adv = [...window.document.querySelectorAll('.btn--primary')].find((b) => b.textContent.includes('進む') || b.textContent.includes('下りる'));
  assert(adv, '進行ボタンがない');
  adv.click();
  console.log('✓ 次の部屋へ進行');
}

// 各画面種別を強制表示してクラッシュしないか
const forceRooms = ['rest', 'treasure', 'shop', 'event'];
for (const type of forceRooms) {
  engine.run.room = { type, resolved: false };
  engine.run.combat = null;
  engine.run.reward = null;
  ui.eventId = 'altar';
  ui.eventText = null;
  ui.screen = 'game';
  // render はモジュールスコープ内なので、DOM操作経由で再描画を促す
  if (type === 'shop') engine.generateShop();
  if (type === 'event') ui.eventId = engine.randomEvent();
  window.eval('render()');
  assert($('#stage').querySelector('.room-panel'), `${type} のパネルが描画されない`);
  assert($('#stage').textContent.length > 10, `${type} の内容が空`);
  console.log(`✓ ${type} 画面`);
}

// ヘルプ・メニュー・記録
$('#btn-help').click();
assert($('.modal'), 'ヘルプが出ない');
$('.modal .btn--primary').click();
$('#btn-menu').click();
assert($('.modal'), 'メニューが出ない');
$('.modal .btn').click();
console.log('✓ ヘルプ / メニュー');

// 記録挑戦（デイリー）の導線
window.eval('renderTitle()');
const dailyBtn = [...window.document.querySelectorAll('#title-actions .btn')].find((b) => b.textContent.includes('記録挑戦'));
assert(dailyBtn, '記録挑戦ボタンがない');
dailyBtn.click();
assert(ui.overlay === 'class-daily', `デイリーのクラス選択が出ない: ${ui.overlay}`);
const dailyCards = window.document.querySelectorAll('.class-card');
assert(dailyCards.length === 3, 'デイリーのクラスが3つでない');
dailyCards[0].click();
assert(engine.run.daily === true, 'デイリーランになっていない');
assert(engine.run.seed.endsWith('-daily'), `デイリーシードでない: ${engine.run.seed}`);
console.log('✓ 記録挑戦（デイリー）導線');

// セーブ→再読込
window.__ABYSS__.storage.saveRun(engine.serialize());
assert(window.localStorage.getItem('abyss-frontier:run:v1'), 'セーブが書かれない');
console.log('✓ セーブ');

// リザルト演出
engine.run.player.hp = 0;
engine.run.combat = { over: true, enemies: [], turn: 1 };
engine.finishRun(false);
console.log('✓ 終了処理');

assert(errors.length === 0, `JSエラー: ${errors.join(' | ')}`);
console.log('\nALL UI SMOKE TESTS PASSED');
