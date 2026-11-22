import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, describeSkill, playerStats, SKILLS_FOR_CLASS } from '../src/core/engine.js';
import { Rng } from '../src/core/rng.js';
import { CLASSES, SKILLS, ENEMIES, RELICS, EVENTS, ITEMS } from '../src/core/data.js';

function newEngine(classId = 'vanguard', seed = 'test-seed') {
  const e = new Engine();
  e.newRun(classId, seed);
  return e;
}

test('Rng は同じシードで同じ列を返す', () => {
  const a = new Rng('abc');
  const b = new Rng('abc');
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  const c = new Rng('abd');
  assert.notDeepEqual(seqA, Array.from({ length: 20 }, () => c.next()));
});

test('Rng.int は範囲内に収まる', () => {
  const r = new Rng(42);
  for (let i = 0; i < 500; i += 1) {
    const v = r.int(3, 7);
    assert.ok(v >= 3 && v <= 7, `out of range: ${v}`);
    assert.equal(Number.isInteger(v), true);
  }
});

test('全クラスでランを開始でき、初期状態が正しい', () => {
  for (const [id, cls] of Object.entries(CLASSES)) {
    const e = newEngine(id);
    const run = e.run;
    assert.equal(run.classId, id);
    assert.equal(run.player.hp, cls.hp);
    assert.equal(run.player.maxHp, cls.hp);
    assert.equal(run.map.length, 5);
    assert.equal(run.map[run.map.length - 1], 'boss');
    assert.ok(run.combat, '最初の部屋は戦闘かイベントのはず');
  }
});

test('データ整合性：スキル参照・敵の行動・レリックのフック過不足', () => {
  for (const e of Object.values(ENEMIES)) {
    for (const m of e.moves) {
      assert.ok(SKILLS[m.skill], `${e.name} が未知スキル ${m.skill} を参照`);
    }
  }
  for (const [id, cls] of Object.entries(CLASSES)) {
    for (const s of [...cls.skills, ...cls.pool]) {
      assert.ok(SKILLS[s], `${id} が未知スキル ${s}`);
    }
  }
  for (const ev of Object.values(EVENTS)) {
    assert.ok(ev.choices.length > 0);
    for (const c of ev.choices) assert.ok(c.effect?.type, 'choice に effect.type がない');
  }
  for (const item of Object.values(ITEMS)) assert.ok(item.name);
  for (const relic of Object.values(RELICS)) assert.ok(relic.desc);
  assert.ok(SKILLS_FOR_CLASS('arcanist').includes('fireball'));
});

test('スキル使用で行動力が減り、敵HPが減る', () => {
  const e = newEngine('vanguard');
  const run = e.run;
  if (!run.combat) { run.map[0] = 'battle'; e.enterRoom(0); }
  const enemy = run.combat.enemies[0];
  const hpBefore = enemy.hp;
  const energyBefore = e.energy;
  const res = e.useSkill(0, 0);
  assert.equal(res.ok, true);
  assert.equal(e.energy, energyBefore - SKILLS.strike.cost);
  assert.ok(enemy.hp + enemy.block < hpBefore + enemy.block, 'HPが減っていない');
});

test('行動力不足ならスキルは使えない', () => {
  const e = newEngine('vanguard');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  e.run.player.energy = 0;
  const res = e.useSkill(0, 0);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-energy');
});

test('ターン終了で敵が行動し、次のターンが始まる', () => {
  const e = newEngine('vanguard', 'turn-test');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  const turnBefore = e.run.combat.turn;
  e.endTurn();
  assert.equal(e.run.combat.turn, turnBefore + 1);
  assert.ok(e.run.player.energy > 0, '行動力が回復していない');
  assert.ok(e.run.combat.enemies.every((en) => en.intent), '敵の予告がない');
});

test('敵を倒すと報酬が発生し、レリックが重複しない', () => {
  const e = newEngine('arcanist', 'reward-test');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  const enemy = e.run.combat.enemies[0];
  enemy.hp = 1;
  e.useSkill(0, 0);
  e.checkCombatEnd();
  assert.equal(e.run.combat.over, true);
  assert.ok(e.run.reward, '報酬がない');
  assert.ok(e.run.reward.gold > 0);
  assert.ok(e.run.reward.cards.length > 0);

  const first = e.rollRelic();
  e.addRelic(first);
  const second = e.rollRelic();
  assert.notEqual(second, first);
  assert.equal(e.addRelic(first), false, '同じレリックを再取得できてしまう');
});

test('戦闘勝利 → 報酬 → 次部屋へ進める', () => {
  const e = newEngine('scout', 'advance-test');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  e.run.combat.enemies.forEach((en) => { en.hp = 0; });
  e.checkCombatEnd();
  assert.ok(e.run.reward);
  e.chooseRewardCard('skip');
  const res = e.advance();
  assert.equal(res.ok, true);
  assert.equal(e.run.roomIndex, 1);
});

test('アク3のボス撃破で勝利エンドになる', () => {
  const e = newEngine('vanguard', 'victory-test');
  e.run.act = 3;
  e.run.roomIndex = e.run.map.length - 1;
  e.run.map[e.run.map.length - 1] = 'boss';
  e.run.combat.enemies.forEach((en) => { en.hp = 0; });
  e.checkCombatEnd();
  const res = e.advance();
  assert.equal(res.ok, true);
  assert.equal(res.victory, true);
  assert.equal(e.run.finished, true);
  assert.equal(e.run.victory, true);
  assert.ok(e.run.score > 0);
});

test('HP0でゲームオーバー、スコアが記録される', () => {
  const e = newEngine('vanguard', 'death-test');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  e.run.player.hp = 1;
  e.run.combat.enemies.forEach((en) => { en.hp = 999; en.atk = 30; });
  e.run.player.block = 0;
  for (let i = 0; i < 20 && !e.run.finished; i += 1) e.endTurn();
  assert.equal(e.run.finished, true);
  assert.equal(e.run.victory, false);
  assert.ok(e.run.score >= 0);
});

test('セーブ → ロードで状態が完全に復元される', () => {
  const e = newEngine('arcanist', 'save-test');
  e.useSkill(0, 0);
  e.endTurn();
  const snapshot = e.serialize();
  const json = JSON.stringify(snapshot);

  const e2 = new Engine();
  assert.equal(e2.loadSave(JSON.parse(json)), true);
  assert.deepEqual(e2.serialize(), JSON.parse(json));
  assert.equal(e2.run.player.hp, e.run.player.hp);
  assert.equal(e2.run.combat.turn, e.run.combat.turn);
});

test('バージョン不一致のセーブは拒否される', () => {
  const e = new Engine();
  assert.equal(e.loadSave({ version: 999 }), false);
});

test('敵の状態異常（毒・燃焼）でダメージが入り、値が減衰する', () => {
  const e = newEngine('arcanist', 'dot-test');
  if (!e.run.combat) { e.run.map[0] = 'battle'; e.enterRoom(0); }
  const enemy = e.run.combat.enemies[0];
  enemy.statuses.poison = 5;
  const before = enemy.hp;
  e.startPlayerTurn();
  assert.ok(enemy.hp < before, '毒ダメージがない');
  assert.ok((enemy.statuses.poison ?? 0) < 5, '毒が減衰しない');
});

test('障壁はHPより先に減る', () => {
  const e = newEngine('vanguard', 'block-test');
  e.run.player.block = 999;
  const hp = e.run.player.hp;
  e.endTurn();
  assert.equal(e.run.player.hp, hp, '障壁があるのにHPが減った');
});

test('回復は最大HPを超えない', () => {
  const e = newEngine('arcanist', 'heal-test');
  e.run.player.hp = e.run.player.maxHp - 3;
  e.useSkill(2, 0); // drain
  e.useItem('potion');
  assert.ok(e.run.player.hp <= e.run.player.maxHp);
});

test('野営地：回復と強化の両立はできず、強化はLv2まで', () => {
  const e = newEngine('vanguard', 'rest-test');
  e.run.room = { type: 'rest', resolved: false };
  e.run.combat = null;
  assert.equal(e.restHeal().ok, true);
  assert.equal(e.restHeal().ok, false, '同じ野営地で二度回復できてしまう');

  e.run.room = { type: 'rest', resolved: false };
  assert.equal(e.restUpgrade(0).ok, true);
  e.run.room = { type: 'rest', resolved: false };
  assert.equal(e.restUpgrade(0).ok, true);
  e.run.room = { type: 'rest', resolved: false };
  assert.equal(e.restUpgrade(0).ok, false, 'Lv2を超えて強化できてしまう');
});

test('ショップ：所持金不足なら買えず、購入でゴールドが減る', () => {
  const e = newEngine('scout', 'shop-test');
  e.run.room = { type: 'shop', resolved: false };
  const shop = e.generateShop();
  assert.ok(shop.cards.length > 0);

  e.run.gold = 0;
  e.run.player.gold = 0;
  assert.equal(e.buyShop(0).ok, false);
  e.run.gold = 500;
  assert.equal(e.buyShop(0).ok, true);
  assert.ok(e.run.gold < 500);
  assert.equal(e.buyShop(0).ok, false, '同じ商品を二度買えてしまう');
});

test('全イベントの全選択肢が例外なく解決できる', () => {
  const types = new Set();
  for (const eventId of Object.keys(EVENTS)) {
    for (let i = 0; i < EVENTS[eventId].choices.length; i += 1) {
      const e = newEngine('vanguard', `event-${eventId}-${i}`);
      e.run.room = { type: 'event', resolved: false };
      e.run.combat = null;
      e.run.gold = 100;
      e.run.player.gold = 100;
      const result = e.chooseEvent(eventId, i);
      assert.equal(result.ok, true, `${eventId}#${i} が失敗`);
      typeof result.text === 'string' && assert.ok(result.text.length > 0);
      types.add(result.type);
    }
  }
  assert.ok(types.size >= 8);
});

test('宝箱は1回しか開けられない', () => {
  const e = newEngine('vanguard', 'treasure-test');
  e.run.room = { type: 'treasure', resolved: false };
  e.run.combat = null;
  assert.equal(e.openTreasure().ok, true);
  assert.equal(e.openTreasure().ok, false);
});

test('スキル枠は6つまで、溢れたら入れ替えが必要', () => {
  const e = newEngine('vanguard', 'slot-test');
  e.run.player.skills = ['strike', 'guardUp', 'focus', 'jab', 'mend', 'shatter'].map((id) => ({ id, level: 0 }));
  e.run.reward = { gold: 0, cards: [{ id: 'cleave', kind: 'new' }], relic: null };
  assert.equal(e.chooseRewardCard('cleave').ok, false);
  assert.equal(e.replaceSkill(0, 'cleave').ok, true);
  assert.equal(e.run.player.skills[0].id, 'cleave');
});

test('レリックの効果（攻撃力・行動力）がステータスに反映される', () => {
  const e = newEngine('vanguard', 'relic-test');
  const before = playerStats(e.run);
  e.addRelic('fangCharm');
  assert.equal(playerStats(e.run).atk, before.atk + 2);
  e.addRelic('abyssCore');
  assert.equal(playerStats(e.run).energy, before.energy + 1);
});

test('describeSkill は全スキルで文字列を返す', () => {
  for (const [id, skill] of Object.entries(SKILLS)) {
    for (const lv of [0, 1, 2]) {
      const text = describeSkill(skill, lv);
      assert.equal(typeof text, 'string');
      assert.ok(text.length > 0, `${id} の説明が空`);
    }
  }
});

test('長期ランダムプレイ（200回）でクラッシュせず進行が破綻しない', () => {
  for (let t = 0; t < 200; t += 1) {
    const bot = new Rng(`bot-${t}`);
    const classIds = Object.keys(CLASSES);
    const e = new Engine();
    e.newRun(classIds[t % classIds.length], `fuzz-${t}`);
    let guard = 0;
    while (!e.run.finished && guard < 400) {
      guard += 1;
      const run = e.run;
      if (run.reward) {
        const card = bot.chance(0.7) ? (run.reward.cards[0]?.id ?? 'skip') : 'skip';
        if (!e.chooseRewardCard(card).ok) e.chooseRewardCard('skip');
        e.advance();
        continue;
      }
      if (run.combat && !run.combat.over) {
        const skills = e.playerSkills();
        const affordable = skills.filter((s) => s.affordable);
        if (affordable.length > 0 && bot.chance(0.8)) {
          const pick = bot.pick(affordable);
          e.useSkill(pick.index, bot.int(0, Math.max(0, run.combat.enemies.length - 1)));
        } else {
          e.endTurn();
        }
        continue;
      }
      const type = run.room?.type;
      if (type === 'rest') { e.restHeal(); e.advance(); continue; }
      if (type === 'treasure') { e.openTreasure(); e.advance(); continue; }
      if (type === 'shop') { e.generateShop(); e.advance(); continue; }
      if (type === 'event') {
        const evId = e.randomEvent();
        e.chooseEvent(evId, bot.int(0, EVENTS[evId].choices.length - 1));
        if (run.room && !run.room.resolved) e.advance();
        else e.advance();
        continue;
      }
      e.advance();
    }
    assert.ok(guard < 400, `fuzz-${t} が終了しない`);
    assert.ok(Number.isFinite(e.run.score));
  }
});
