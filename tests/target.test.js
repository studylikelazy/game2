import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.js';

test('死亡した敵を対象指定しても生存敵に自動で切り替わる', () => {
  const e = new Engine();
  e.newRun('arcanist', 'target-fallback');
  e.run.map[0] = 'battle';
  e.enterRoom(0);
  const base = e.run.combat.enemies[0];
  e.run.combat.enemies = [
    { ...base, id: 'a', hp: 0, maxHp: 35, statuses: {} },
    { ...base, id: 'b', hp: 35, maxHp: 35, statuses: {} },
  ];
  e.run.player.energy = 4;
  const res = e.useSkill(0, 0);
  assert.equal(res.ok, true);
  assert.ok(e.run.combat.enemies[1].hp < 35, '生存敵にダメージが入っていない');
});
