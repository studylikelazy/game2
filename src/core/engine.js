// ============================================================
// ABYSS FRONTIER - ゲームエンジン
// DOM に依存しない純粋ロジック。node --test で検証できる。
// ============================================================
import { Rng } from './rng.js';
import {
  CLASSES, SKILLS, ENEMIES, RELICS, ITEMS, EVENTS,
  ENCOUNTERS, BOSSES, STATUSES, ROOM_TYPES, FLOORS_PER_ACT,
} from './data.js';

export const SAVE_VERSION = 1;
const MAX_ACT = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function withLog(run, text, kind = 'info') {
  run.log.push({ text, kind });
  if (run.log.length > 120) run.log.splice(0, run.log.length - 120);
}

/** run.rng (シード数値) から決定的な乱数器を作る。 */
function rngOf(run) {
  return new Rng(run.rng);
}

function statusOf(actor, id) {
  return actor.statuses?.[id] ?? 0;
}

function addStatus(actor, id, amount) {
  if (!STATUSES[id] || !amount) return;
  actor.statuses[id] = Math.max(0, (actor.statuses[id] ?? 0) + amount);
  if (actor.statuses[id] === 0) delete actor.statuses[id];
}

function clearStatus(actor, id) {
  delete actor.statuses[id];
}

function isAlive(actor) {
  return actor.hp > 0;
}

function skillLevelPlayer(run, skillId) {
  const entry = run.player.skills.find((s) => s.id === skillId);
  return entry ? entry.level : 0;
}

/** プレイヤーの実効攻撃力・防御力（レリック込み）。 */
export function playerStats(run) {
  const p = run.player;
  const relics = p.relics.map((id) => RELICS[id]).filter(Boolean);
  const atk = p.baseAtk + relics.reduce((s, r) => s + (r.atk ?? 0), 0);
  const def = p.baseDef + relics.reduce((s, r) => s + (r.def ?? 0), 0);
  const energy = p.baseEnergy + relics.reduce((s, r) => s + (r.energy ?? 0), 0);
  return { atk, def, energy };
}

function hasRelic(run, id) {
  return run.player.relics.includes(id);
}

function relicDamageMul(run, attacker, target) {
  let mul = 1;
  const p = run.player;
  if (attacker.side === 'player') {
    if (hasRelic(run, 'bloodOath')) mul *= RELICS.bloodOath.damageMul;
    if (hasRelic(run, 'survivor') && p.hp / p.maxHp <= 0.25) mul *= 1.3;
    if (hasRelic(run, 'hunterEye') && statusOf(target, 'vulnerable') > 0) mul *= 1.25;
    if (hasRelic(run, 'echoPrism') && run.combat && run.combat.skillsThisTurn >= 4) mul *= 1.2;
  }
  return mul;
}

/**
 * ダメージ計算。
 * raw = atk * scale * hits? -> 1ヒット分を返す
 */
function computeRaw(attacker, target, skill, run, level) {
  const lv = level ?? 0;
  const upgrade = skill.upgrade ?? {};
  const scale = (skill.scale ?? 0) + (upgrade.scale ?? 0) * lv;
  const power = (skill.power ?? 0) + (upgrade.power ?? 0) * lv;
  const atk = attacker.side === 'player' ? playerStats(run).atk : attacker.atk;
  const base = atk * scale + power;

  let strength = statusOf(attacker, 'strength');
  if (attacker.side === 'player' && run.combat?.permStrength) strength += run.combat.permStrength;
  let value = base + strength;

  if (statusOf(attacker, 'weaken') > 0) value *= 0.75;
  if (statusOf(target, 'vulnerable') > 0) value *= 1.3;
  value *= relicDamageMul(run, attacker, target);

  const def = target.side === 'player' ? playerStats(run).def : target.def;
  // 防御は実効値の4割まで軽減、ただし元ダメージの25%は必ず通す
  const reduced = Math.max(value - def * 0.4, value * 0.25);
  return Math.max(1, Math.round(reduced));
}

/** ダメージを適用（障壁 → HP）。実際に減ったHP量を返す。 */
function applyDamage(target, amount, run, source) {
  let remaining = amount;
  let absorbed = 0;
  if (target.block > 0) {
    absorbed = Math.min(target.block, remaining);
    target.block -= absorbed;
    remaining -= absorbed;
  }
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - remaining);
  const hpLost = hpBefore - target.hp;
  if (target.side === 'player') run.stats.damageTaken += hpLost;
  else run.stats.damageDealt += hpLost;
  if (target.thornsHint) { /* noop */ }
  return { hpLost, absorbed };
}

function healActor(actor, amount) {
  const before = actor.hp;
  actor.hp = Math.min(actor.maxHp, actor.hp + Math.max(0, Math.round(amount)));
  return actor.hp - before;
}

/** アビス・スキルの1回分の解決。 */
function resolveHit(run, attacker, target, skill, level, logPrefix) {
  const dmg = computeRaw(attacker, target, skill, run, level);
  const isPlayer = attacker.side === 'player';
  const label = `${logPrefix}${skill.name}`;
  addLog(run, `${label} → ${target.name} に ${dmg} ダメージ`, isPlayer ? 'player' : 'enemy');
  const { hpLost, absorbed } = applyDamage(target, dmg, run, attacker);
  if (absorbed > 0) addLog(run, `${target.name} の障壁が ${absorbed} 吸収`, 'muted');
  if (target.thorns > 0 && hpLost >= 0) { /* handled via statuses */ }
  // 棘
  const thorns = statusOf(target, 'thorns');
  if (thorns > 0 && isPlayer !== (target.side === 'player')) {
    const back = Math.max(1, Math.round(thorns));
    addLog(run, `${target.name} の棘が ${attacker.name} に ${back} ダメージ`, 'muted');
    applyDamage(attacker, back, run, target);
  }
  return hpLost;
}

function addLog(run, text, kind = 'info') {
  withLog(run, text, kind);
}

/** 敵の行動予告を決定する。 */
function rollIntent(run, enemy) {
  const def = ENEMIES[enemy.type];
  const available = def.moves.filter((m) => (enemy.cooldowns[m.skill] ?? 0) <= 0);
  const pool = available.length > 0 ? available : def.moves;
  const choice = rngOf(run).weighted(pool.map((m) => ({ ...m, weight: m.weight ?? 1 })));
  enemy.intent = { skill: choice.skill, cd: choice.cooldown ?? 0 };
  for (const key of Object.keys(enemy.cooldowns)) {
    enemy.cooldowns[key] = Math.max(0, enemy.cooldowns[key] - 1);
  }
  if (choice.cooldown) enemy.cooldowns[choice.skill] = choice.cooldown + 1;
}

function makeEnemy(typeId, run, tierBonus = 0) {
  const def = ENEMIES[typeId];
  const scale = 1 + 0.12 * (run.act - 1) + 0.05 * (run.floor - 1) + tierBonus;
  const hp = Math.round(def.hp * scale);
  return {
    id: `${typeId}-${rngOf(run).int(1000, 9999)}`,
    type: typeId,
    name: def.name,
    icon: def.icon,
    tier: def.tier,
    side: 'enemy',
    maxHp: hp,
    hp,
    atk: Math.round(def.atk * (1 + 0.08 * (run.act - 1) + 0.03 * (run.floor - 1))),
    def: def.def + (run.act - 1),
    block: 0,
    statuses: {},
    cooldowns: {},
    intent: null,
  };
}

export class Engine {
  constructor() {
    this.run = null;
  }

  // ---------------------------------------------------------
  // ラン開始 / セーブ
  // ---------------------------------------------------------
  newRun(classId, seedInput, options = {}) {
    const cls = CLASSES[classId];
    if (!cls) throw new Error(`unknown class: ${classId}`);
    const seed = seedInput || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const rng = new Rng(seed);
    const maxHp = cls.hp;
    const run = {
      version: SAVE_VERSION,
      seed,
      rng: rng.snapshot(),
      classId,
      act: 1,
      floor: 1,
      roomIndex: 0,
      gold: 30,
      roomsCleared: 0,
      kills: 0,
      startedAt: Date.now(),
      player: {
        name: cls.name,
        icon: cls.icon,
        side: 'player',
        maxHp,
        hp: maxHp,
        baseAtk: cls.atk,
        baseDef: cls.def,
        baseEnergy: cls.energy,
        gold: 30,
        block: 0,
        statuses: {},
        skills: cls.skills.map((id) => ({ id, level: 0 })),
        relics: [],
        items: [{ id: 'potion', count: 2 }],
      },
      map: [],
      room: null,
      combat: null,
      log: [],
      stats: { damageDealt: 0, damageTaken: 0, skillsUsed: 0, upgraded: 0, relicsTaken: 0 },
      reward: null,
      pendingChoice: null,
      finished: false,
      victory: false,
      score: 0,
      daily: options.daily ?? null,
      dailyLabel: options.dailyLabel ?? null,
    };
    this.run = run;
    if (run.dailyLabel) addLog(run, `記録挑戦：${run.dailyLabel}`, 'system');
    addLog(run, `── 第${run.act}層 / ${cls.name} として深淵へ降りる ──`, 'system');
    this.generateMap();
    this.enterRoom(0);
    return run;
  }

  /** マップ（部屋の並び）を生成する。最後はボス。 */
  generateMap() {
    const run = this.run;
    const rng = new Rng((run.rng ^ (run.act * 7919)) >>> 0);
    const types = [];
    const middleCount = FLOORS_PER_ACT - 1;
    const pool = ['battle', 'battle', 'battle', 'event', 'rest', 'treasure', 'shop', 'elite'];
    for (let i = 0; i < middleCount; i += 1) {
      let pick = pool[rng.int(0, pool.length - 1)];
      if (i === 0) pick = rng.chance(0.7) ? 'battle' : 'event';
      if (i === middleCount - 1 && pick === 'shop') pick = 'rest';
      types.push(pick);
    }
    types.push('boss');
    run.map = types;
    run.roomIndex = 0;
    run.rng = rng.snapshot();
    addLog(run, `第${run.act}層に足を踏み入れた。残る部屋は ${types.length}。`, 'system');
  }

  get currentRoomType() {
    return this.run?.map[this.run.roomIndex] ?? null;
  }

  /** 部屋へ入る。戦闘なら combat を組む。 */
  enterRoom(index) {
    const run = this.run;
    run.roomIndex = index;
    const type = run.map[index];
    run.combat = null;
    run.reward = null;
    run.pendingChoice = null;
    if (type === 'battle' || type === 'elite' || type === 'boss') {
      this.startCombat(type);
    } else {
      run.room = { type, resolved: false };
      addLog(run, `${ROOM_TYPES[type].name} に到着した。`, 'system');
    }
    return run;
  }

  startCombat(kind) {
    const run = this.run;
    run.room = { type: kind, resolved: false };
    const enemies = [];
    if (kind === 'boss') {
      const bossId = BOSSES[Math.min(run.act - 1, BOSSES.length - 1)];
      enemies.push(makeEnemy(bossId, run, 0));
    } else if (kind === 'elite') {
      const pick = rngOf(run).weighted(ENCOUNTERS.elite);
      enemies.push(makeEnemy(pick.id, run, 0.1));
    } else {
      const table = run.act === 1
        ? (run.floor <= 2 ? ENCOUNTERS.early : ENCOUNTERS.mid)
        : (run.floor <= 2 ? ENCOUNTERS.mid : ENCOUNTERS.late);
      const count = rngOf(run).chance(0.25 + 0.1 * run.act) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const pick = rngOf(run).weighted(table);
        enemies.push(makeEnemy(pick.id, run, 0));
      }
    }

    const combat = {
      kind,
      enemies,
      turn: 1,
      skillsThisTurn: 0,
      permStrength: run.player.permanentStrength ?? 0,
      over: false,
    };
    run.player.block = 0;
    run.player.statuses = {};
    run.combat = combat;
    run.player.energy = playerStats(run).energy;
    run.stats.skillsUsed = run.stats.skillsUsed ?? 0;

    // レリックの戦闘開始効果
    for (const relicId of run.player.relics) {
      if (relicId === 'emberHeart') {
        for (const e of enemies) addStatus(e, 'burn', 3);
        addLog(run, '燐火の心臓が脈打ち、敵全体に燃焼3。', 'relic');
      }
      if (relicId === 'ironskin') {
        run.player.block += 6;
        addLog(run, '鉄の皮膚が硬化し、障壁6。', 'relic');
      }
      if (relicId === 'thornMail') {
        addStatus(run.player, 'thorns', 4);
        addLog(run, '棘の外套が身を覆い、棘4。', 'relic');
      }
      if (relicId === 'lastStand' && run.player.hp <= run.player.maxHp / 2) {
        addStatus(run.player, 'strength', 5);
        addLog(run, '背水の陣：力5。', 'relic');
      }
    }
    for (const e of enemies) rollIntent(run, e);
    addLog(run, `${enemies.map((e) => e.name).join(' / ')} が立ちはだかる！`, 'enemy');
    return run;
  }

  /** 現在のプレイヤーの行動力。 */
  get energy() {
    return this.run?.player.energy ?? 0;
  }

  // ---------------------------------------------------------
  // プレイヤー行動
  // ---------------------------------------------------------
  /** 使用可能なスキル一覧（UI用に解決済みの情報を返す）。 */
  playerSkills() {
    return this.run.player.skills.map((entry, index) => {
      const base = SKILLS[entry.id];
      const up = base.upgrade ?? {};
      const lvl = entry.level;
      return {
        index,
        id: entry.id,
        level: lvl,
        name: base.name,
        icon: base.icon,
        cost: base.cost,
        target: base.target,
        tags: base.tags,
        desc: describeSkill(base, lvl),
        canUpgrade: lvl < 2,
        upgraded: lvl > 0,
        affordable: base.cost <= this.energy,
      };
    });
  }

  itemList() {
    return this.run.player.items.map((it) => ({ ...it, ...ITEMS[it.id] }));
  }

  useSkill(index, targetIndex = 0) {
    const run = this.run;
    const combat = run.combat;
    if (!combat || combat.over) return { ok: false, reason: 'no-combat' };
    const entry = run.player.skills[index];
    if (!entry) return { ok: false, reason: 'no-skill' };
    const skill = SKILLS[entry.id];
    if (skill.cost > run.player.energy) return { ok: false, reason: 'no-energy' };

    const alive = combat.enemies.filter(isAlive);
    if (alive.length === 0) return { ok: false, reason: 'no-target' };
    // targetIndex は enemies 配列のインデックス。死亡していたら生存している敵へ回す。
    let primary = combat.enemies[clamp(targetIndex, 0, combat.enemies.length - 1)];
    if (!primary || !isAlive(primary)) primary = alive[0];
    if (skill.target === 'enemy' && !primary) {
      return { ok: false, reason: 'no-target' };
    }

    run.player.energy -= skill.cost;
    combat.skillsThisTurn += 1;
    run.stats.skillsUsed += 1;
    addLog(run, `▶ ${skill.name}`, 'player');

    const level = entry.level;
    const up = skill.upgrade ?? {};

    // ダメージ
    if (skill.tags?.includes('attack') || (skill.scale ?? 0) > 0) {
      const targets = skill.target === 'allEnemies' ? alive : [primary];
      const hits = (skill.hits ?? 1) + (up.hits ?? 0) * level;
      for (let h = 0; h < hits; h += 1) {
        for (const t of targets) {
          if (!isAlive(t)) continue;
          resolveHit(run, run.player, t, skill, level, '');
          if (skill.lifesteal) {
            const healed = healActor(run.player, Math.round(computeRaw(run.player, t, skill, run, level) * (skill.lifesteal + (up.lifesteal ?? 0) * level)));
            if (healed > 0) addLog(run, `吸命で ${healed} 回復`, 'heal');
          }
          if (hasRelic(run, 'venomVial') && rngOf(run).chance(0.2)) {
            addStatus(t, 'poison', 2);
            addLog(run, `毒の小瓶：${t.name} に毒2`, 'relic');
          }
        }
      }
    }

    // 状態異常付与
    if (skill.statuses) {
      const targets = skill.target === 'allEnemies' ? alive
        : skill.target === 'self' ? [run.player]
          : [primary];
      for (const st of skill.statuses) {
        const amount = (st.amount ?? 0) + (up.statusAmount ?? 0) * level;
        for (const t of targets) {
          if (!t || (t.side === 'enemy' && !isAlive(t))) continue;
          addStatus(t, st.id, amount);
        }
      }
      const names = skill.statuses.map((s) => `${STATUSES[s.id].name}${(s.amount ?? 0) + (up.statusAmount ?? 0) * level}`).join('・');
      const tgt = skill.target === 'self' ? run.player.name : skill.target === 'allEnemies' ? '敵全体' : primary.name;
      addLog(run, `${tgt} に ${names}`, 'status');
    }

    // 障壁
    if (skill.blockScale) {
      const mul = (skill.blockScale + (up.blockScale ?? 0) * level)
        * (hasRelic(run, 'aegisRune') ? RELICS.aegisRune.blockMul : 1);
      const block = Math.round(playerStats(run).def * mul);
      run.player.block += block;
      addLog(run, `障壁 ${block} を得た`, 'defend');
    }

    // 回復
    if (skill.healPercent || skill.healFlat) {
      const amount = run.player.maxHp * (skill.healPercent + (up.healPercent ?? 0) * level) + (skill.healFlat ?? 0);
      const healed = healActor(run.player, amount);
      addLog(run, `${healed} 回復`, 'heal');
    }

    // 行動力・自傷
    if (skill.energyGain) {
      run.player.energy += skill.energyGain;
      addLog(run, `行動力 +${skill.energyGain}`, 'energy');
    }
    if (skill.selfDamage) {
      applyDamage(run.player, skill.selfDamage, run, run.player);
      addLog(run, `反動で ${skill.selfDamage} ダメージ`, 'enemy');
    }

    // 急所突き等の条件ボーナス
    if (skill.bonusVsVulnerable && statusOf(primary, 'vulnerable') > 0) {
      const extra = Math.round(playerStats(run).atk * skill.bonusVsVulnerable);
      addLog(run, `急所に刺さった！ 追加 ${extra} ダメージ`, 'crit');
      applyDamage(primary, extra, run, run.player);
    }

    this.checkCombatEnd();
    return { ok: true };
  }

  useItem(itemId) {
    const run = this.run;
    const combat = run.combat;
    if (!combat || combat.over) return { ok: false, reason: 'no-combat' };
    const held = run.player.items.find((i) => i.id === itemId && i.count > 0);
    if (!held) return { ok: false, reason: 'not-owned' };
    const item = ITEMS[itemId];
    const alive = combat.enemies.filter(isAlive);

    addLog(run, `▶ ${item.name}`, 'player');
    if (item.healPercent) {
      const healed = healActor(run.player, run.player.maxHp * item.healPercent);
      addLog(run, `${healed} 回復`, 'heal');
    }
    if (item.damage) {
      for (const e of alive) {
        applyDamage(e, item.damage, run, run.player);
        addLog(run, `${e.name} に ${item.damage} ダメージ`, 'player');
      }
    }
    if (item.energy) {
      run.player.energy += item.energy;
      addLog(run, `行動力 +${item.energy}`, 'energy');
    }
    if (item.statuses) {
      for (const st of item.statuses) {
        const targets = st.toEnemy ? alive : [run.player];
        for (const t of targets) addStatus(t, st.id, st.amount);
      }
    }
    if (item.cleanse) {
      for (const id of item.cleanse) clearStatus(run.player, id);
      addLog(run, '状態異常を浄化した', 'heal');
    }

    held.count -= 1;
    if (held.count <= 0) run.player.items = run.player.items.filter((i) => i.id !== itemId);
    this.checkCombatEnd();
    return { ok: true };
  }

  /** ターン終了 → 敵の行動 → 次ターン開始。 */
  endTurn() {
    const run = this.run;
    const combat = run.combat;
    if (!combat || combat.over) return { ok: false, reason: 'no-combat' };

    this.tickEndOfPlayerTurn();

    for (const enemy of combat.enemies) {
      if (!isAlive(enemy)) continue;
      this.enemyAct(enemy);
      if (run.player.hp <= 0) break;
    }

    if (run.player.hp <= 0) {
      this.finishRun(false);
      return { ok: true, gameOver: true };
    }

    this.startPlayerTurn();
    return { ok: true };
  }

  tickEndOfPlayerTurn() {
    const run = this.run;
    const p = run.player;
    const regen = statusOf(p, 'regen');
    if (regen > 0) {
      const healed = healActor(p, regen);
      if (healed > 0) addLog(run, `再生で ${healed} 回復`, 'heal');
    }
    for (const id of Object.keys(p.statuses)) {
      if (STATUSES[id]?.decay === 'turn' && id !== 'thorns') {
        p.statuses[id] -= 1;
        if (p.statuses[id] <= 0) delete p.statuses[id];
      }
    }
    // 燃焼・毒はターン開始時処理なのでここでは減らさない
    run.combat.skillsThisTurn = 0;
  }

  enemyAct(enemy) {
    const run = this.run;
    const def = ENEMIES[enemy.type];
    const intent = enemy.intent ?? { skill: def.moves[0].skill };
    const skill = SKILLS[intent.skill] ?? SKILLS[def.moves[0].skill];

    addLog(run, `◀ ${enemy.name} の ${skill.name}`, 'enemy');
    if (skill.tags?.includes('attack') || (skill.scale ?? 0) > 0) {
      const hits = skill.hits ?? 1;
      for (let i = 0; i < hits; i += 1) {
        if (run.player.hp <= 0) break;
        resolveHit(run, enemy, run.player, skill, 0, '');
      }
    }
    if (skill.statuses) {
      const targets = skill.target === 'self' ? [enemy] : [run.player];
      for (const st of skill.statuses) {
        for (const t of targets) addStatus(t, st.id, st.amount);
      }
      const names = skill.statuses.map((s) => `${STATUSES[s.id].name}${s.amount}`).join('・');
      addLog(run, `${skill.target === 'self' ? enemy.name : run.player.name} に ${names}`, 'status');
    }
    if (skill.blockScale) {
      const block = Math.round(enemy.def * skill.blockScale);
      enemy.block += block;
      addLog(run, `${enemy.name} は障壁 ${block} を張った`, 'muted');
    }
    if (skill.healPercent) {
      const healed = healActor(enemy, enemy.maxHp * skill.healPercent);
      if (healed > 0) addLog(run, `${enemy.name} は ${healed} 回復した`, 'muted');
    }
    // 敵の状態異常減少（手番終了）
    for (const id of Object.keys(enemy.statuses)) {
      if (STATUSES[id]?.decay === 'turn') {
        enemy.statuses[id] -= 1;
        if (enemy.statuses[id] <= 0) delete enemy.statuses[id];
      }
    }
  }

  startPlayerTurn() {
    const run = this.run;
    const combat = run.combat;
    const p = run.player;
    combat.turn += 1;

    // ターン開始時 DoT
    for (const enemy of combat.enemies) {
      if (!isAlive(enemy)) continue;
      this.tickDots(enemy);
    }
    if (run.player.hp > 0) this.tickDots(p);

    if (run.player.hp <= 0) {
      this.finishRun(false);
      return;
    }

    p.block = 0;
    p.energy = playerStats(run).energy;
    if (hasRelic(run, 'moonCharm')) {
      const healed = healActor(p, 2);
      if (healed > 0) addLog(run, '月光の護符で 2 回復', 'relic');
    }
    if (hasRelic(run, 'deepBattery') && rngOf(run).chance(0.25)) {
      p.energy += 1;
      addLog(run, '蓄電池が唸り、行動力 +1', 'relic');
    }
    for (const enemy of combat.enemies) {
      if (isAlive(enemy)) rollIntent(run, enemy);
    }
    this.checkCombatEnd();
  }

  tickDots(actor) {
    const run = this.run;
    const poison = statusOf(actor, 'poison');
    if (poison > 0) {
      applyDamage(actor, poison, run, null);
      addLog(run, `${actor.name} は毒で ${poison} ダメージ`, 'status');
      actor.statuses.poison = Math.floor(poison / 2);
      if (actor.statuses.poison <= 0) delete actor.statuses.poison;
    }
    const burn = statusOf(actor, 'burn');
    if (burn > 0) {
      applyDamage(actor, burn, run, null);
      addLog(run, `${actor.name} は燃焼で ${burn} ダメージ`, 'status');
      actor.statuses.burn = Math.floor(burn / 2);
      if (actor.statuses.burn <= 0) delete actor.statuses.burn;
    }
  }

  checkCombatEnd() {
    const run = this.run;
    const combat = run.combat;
    if (!combat || combat.over) return;
    const aliveEnemies = combat.enemies.filter(isAlive);
    if (aliveEnemies.length === 0) {
      combat.over = true;
      run.stats.kills += 1;
      run.roomsCleared += 1;
      addLog(run, '敵をすべて倒した！', 'system');
      this.grantBattleReward();
    } else if (run.player.hp <= 0) {
      combat.over = true;
      this.finishRun(false);
    }
  }

  // ---------------------------------------------------------
  // 報酬・進行
  // ---------------------------------------------------------
  grantBattleReward() {
    const run = this.run;
    const kind = run.combat.kind;
    let gold = rngOf(run).int(12, 22) + run.act * 4;
    if (kind === 'elite') gold += 15;
    if (kind === 'boss') gold += 30;
    if (hasRelic(run, 'greedPurse')) gold = Math.round(gold * RELICS.greedPurse.goldMul);
    run.gold += gold;
    run.player.gold = run.gold;

    const reward = { gold, cards: this.rollCardChoices(kind === 'boss' ? 3 : 3), relic: null, boss: kind === 'boss' };
    if (kind === 'elite') {
      reward.relic = this.rollRelic();
      if (reward.relic) {
        this.addRelic(reward.relic);
      }
    }
    if (kind !== 'boss') {
      const healed = healActor(run.player, run.player.maxHp * 0.08);
      if (healed > 0) addLog(run, `戦闘後、息を整えて ${healed} 回復。`, 'heal');
    }
    run.reward = reward;
    addLog(run, `${gold} ゴールドを得た。`, 'gold');
  }

  rollCardChoices(count = 3) {
    const run = this.run;
    const pool = new Set();
    for (const skillId of [...SKILLS_FOR_CLASS(run.classId)]) pool.add(skillId);
    const owned = new Set(run.player.skills.map((s) => s.id));
    // 未所持を優先しつつ、所持済みなら強化候補として出す
    const candidates = [];
    for (const id of pool) {
      if (!owned.has(id)) candidates.push({ id, kind: 'new' });
    }
    for (const s of run.player.skills) {
      if (s.level < 2) candidates.push({ id: s.id, kind: 'upgrade' });
    }
    const picks = [];
    const newOnes = rngOf(run).shuffle(candidates.filter((c) => c.kind === 'new')).slice(0, count);
    picks.push(...newOnes);
    if (picks.length < count) {
      const ups = rngOf(run).shuffle(candidates.filter((c) => c.kind === 'upgrade' && !picks.some((p) => p.id === c.id)));
      picks.push(...ups.slice(0, count - picks.length));
    }
    return picks.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: SKILLS[p.id].name,
      icon: SKILLS[p.id].icon,
      cost: SKILLS[p.id].cost,
      desc: p.kind === 'upgrade' ? describeSkill(SKILLS[p.id], skillLevelPlayer(run, p.id) + 1) : SKILLS[p.id].desc,
      tags: SKILLS[p.id].tags,
    }));
  }

  chooseRewardCard(id) {
    const run = this.run;
    if (!run.reward) return { ok: false };
    if (id === 'skip') {
      run.reward = null;
      return { ok: true, skipped: true };
    }
    const owned = run.player.skills.find((s) => s.id === id);
    if (owned) {
      if (owned.level >= 2) return { ok: false, reason: 'max-level' };
      owned.level += 1;
      run.stats.upgraded += 1;
      addLog(run, `${SKILLS[id].name} を Lv${owned.level + 1} に強化`, 'system');
    } else if (run.player.skills.length < 6) {
      run.player.skills.push({ id, level: 0 });
      addLog(run, `${SKILLS[id].name} を習得`, 'system');
    } else {
      // 枠がいっぱいなら強化として扱う（UI側で交換させる想定）
      return { ok: false, reason: 'full' };
    }
    run.reward = null;
    return { ok: true };
  }

  /** スキル枠がいっぱいの時の入れ替え。 */
  replaceSkill(index, newSkillId) {
    const run = this.run;
    if (!run.player.skills[index]) return { ok: false };
    const oldId = run.player.skills[index].id;
    run.player.skills[index] = { id: newSkillId, level: 0 };
    addLog(run, `${SKILLS[oldId].name} を捨て、${SKILLS[newSkillId].name} を習得`, 'system');
    run.reward = null;
    return { ok: true };
  }

  rollRelic() {
    const run = this.run;
    const owned = new Set(run.player.relics);
    const available = Object.keys(RELICS).filter((id) => !owned.has(id));
    if (available.length === 0) return null;
    const weights = available.map((id) => ({
      id,
      weight: RELICS[id].rarity === 'epic' ? 1 : RELICS[id].rarity === 'rare' ? 3 : 5,
    }));
    return rngOf(run).weighted(weights).id;
  }

  addRelic(relicId) {
    const run = this.run;
    if (!relicId || run.player.relics.includes(relicId)) return false;
    run.player.relics.push(relicId);
    run.stats.relicsTaken += 1;
    const relic = RELICS[relicId];
    if (relic.maxHp) {
      run.player.maxHp = Math.max(10, run.player.maxHp + relic.maxHp);
      run.player.hp = clamp(run.player.hp, 1, run.player.maxHp);
    }
    addLog(run, `レリック「${relic.name}」を獲得：${relic.desc}`, 'relic');
    return true;
  }

  /** 部屋の解決後、次の部屋へ。 */
  advance() {
    const run = this.run;
    if (run.finished) return { ok: false };
    const wasBoss = run.map[run.roomIndex] === 'boss';
    if (wasBoss) {
      if (run.act >= MAX_ACT) {
        this.finishRun(true);
        return { ok: true, victory: true };
      }
      run.act += 1;
      run.floor = 1;
      // 深淵の祝福：層を下りるたびに基礎能力が伸びる
      run.player.maxHp += 6;
      run.player.baseAtk += 2;
      run.player.baseDef += 1;
      const blessed = healActor(run.player, run.player.maxHp * 0.3);
      addLog(run, `── 第${run.act}層へ降りる ── 深淵の祝福：最大HP+8 / 攻撃+2 / 防御+1 / ${blessed}回復`, 'system');
      this.generateMap();
      this.enterRoom(0);
      return { ok: true, nextAct: true };
    }
    const next = run.roomIndex + 1;
    if (next >= run.map.length) {
      this.finishRun(false);
      return { ok: false };
    }
    run.floor = next + 1;
    this.enterRoom(next);
    return { ok: true };
  }

  // ---------------------------------------------------------
  // 休憩・宝箱・イベント・ショップ
  // ---------------------------------------------------------
  restHeal() {
    const run = this.run;
    if (run.room?.type !== 'rest' || run.room.resolved) return { ok: false };
    const healed = healActor(run.player, run.player.maxHp * 0.35);
    addLog(run, `野営地で ${healed} 回復した。`, 'heal');
    run.room.resolved = true;
    return { ok: true, healed };
  }

  restUpgrade(index) {
    const run = this.run;
    if (run.room?.type !== 'rest' || run.room.resolved) return { ok: false };
    const skill = run.player.skills[index];
    if (!skill || skill.level >= 2) return { ok: false, reason: 'cannot-upgrade' };
    skill.level += 1;
    run.stats.upgraded += 1;
    addLog(run, `${SKILLS[skill.id].name} を Lv${skill.level + 1} に強化した。`, 'system');
    run.room.resolved = true;
    return { ok: true };
  }

  openTreasure() {
    const run = this.run;
    if (run.room?.type !== 'treasure' || run.room.resolved) return { ok: false };
    run.room.resolved = true;
    const roll = rngOf(run).next();
    if (roll < 0.55) {
      const relicId = this.rollRelic();
      if (relicId) {
        this.addRelic(relicId);
        return { ok: true, type: 'relic', relic: relicId, name: RELICS[relicId].name, desc: RELICS[relicId].desc };
      }
    }
    if (roll < 0.8) {
      const gold = rngOf(run).int(35, 60);
      run.gold += gold;
      run.player.gold = run.gold;
      addLog(run, `宝箱から ${gold} ゴールド。`, 'gold');
      return { ok: true, type: 'gold', gold };
    }
    const itemId = rngOf(run).pick(Object.keys(ITEMS));
    this.addItem(itemId);
    return { ok: true, type: 'item', item: itemId, name: ITEMS[itemId].name, desc: ITEMS[itemId].desc };
  }

  addItem(itemId, count = 1) {
    const run = this.run;
    const held = run.player.items.find((i) => i.id === itemId);
    if (held) held.count += count;
    else run.player.items.push({ id: itemId, count });
    addLog(run, `${ITEMS[itemId].name} を入手。`, 'gold');
  }

  randomEvent() {
    const run = this.run;
    const ids = Object.keys(EVENTS);
    return ids[rngOf(run).int(0, ids.length - 1)];
  }

  /** イベント選択。needsTarget=true のときは後続の解決が必要。 */
  chooseEvent(eventId, choiceIndex) {
    const run = this.run;
    if (run.room?.type !== 'event' || run.room.resolved) return { ok: false };
    const event = EVENTS[eventId];
    if (!event) return { ok: false };
    const choice = event.choices[choiceIndex];
    if (!choice) return { ok: false };
    const effect = choice.effect;
    const result = { ok: true, type: effect.type, text: '', needsUpgradeChoice: false };

    switch (effect.type) {
      case 'none':
        result.text = '何も起こらなかった。';
        break;
      case 'sacrifice': {
        const dmg = Math.min(run.player.hp - 1, 12);
        applyDamage(run.player, dmg, run, null);
        run.player.maxHp += 6;
        const healed = healActor(run.player, 6);
        result.text = `HPを${dmg}捧げ、最大HPが6増えた。`;
        addLog(run, result.text, 'heal');
        break;
      }
      case 'payRelic': {
        if (run.gold < effect.gold) {
          result.text = 'ゴールドが足りず、祭壇は沈黙した。';
          break;
        }
        run.gold -= effect.gold;
        run.player.gold = run.gold;
        const relicId = this.rollRelic();
        if (relicId) {
          this.addRelic(relicId);
          result.text = `レリック「${RELICS[relicId].name}」を得た。`;
        } else {
          healActor(run.player, 15);
          result.text = '祭壇は光り、傷が癒えた。';
        }
        break;
      }
      case 'heal': {
        const healed = healActor(run.player, run.player.maxHp * (effect.percent ?? 0) + (effect.flat ?? 0));
        result.text = `${healed} 回復した。`;
        break;
      }
      case 'healPercentAndEnergy': {
        const healed = healActor(run.player, run.player.maxHp * (effect.percent ?? 0));
        run.player.energy = playerStats(run).energy;
        result.text = `${healed} 回復し、呼吸が整った。`;
        break;
      }
      case 'gambleRelic': {
        if (rngOf(run).chance(effect.chance)) {
          const relicId = this.rollRelic();
          if (relicId) {
            this.addRelic(relicId);
            result.text = `深淵が応えた！ レリック「${RELICS[relicId].name}」を得た。`;
          } else {
            result.text = '何も得られなかった。';
          }
        } else {
          applyDamage(run.player, effect.failDamage ?? 8, run, null);
          result.text = `黒い水が肌を蝕んだ。${effect.failDamage ?? 8} ダメージ。`;
        }
        if (run.player.hp <= 0) this.finishRun(false);
        break;
      }
      case 'gambleGold': {
        const bet = Math.floor(run.gold * 0.5);
        if (bet <= 0) {
          result.text = '賭けるゴールドがない。';
          break;
        }
        if (rngOf(run).chance(effect.chance)) {
          run.gold += bet;
          result.text = `勝負に勝ち、${bet} ゴールドを得た。`;
        } else {
          run.gold -= bet;
          result.text = `負けて ${bet} ゴールドを失った。`;
        }
        run.player.gold = run.gold;
        break;
      }
      case 'upgradeRandom': {
        const upgradable = run.player.skills.filter((s) => s.level < 2);
        if (upgradable.length === 0) {
          run.gold += 25;
          run.player.gold = run.gold;
          result.text = '強化できるスキルがないので、25ゴールドを受け取った。';
          break;
        }
        const target = rngOf(run).pick(upgradable);
        target.level += 1;
        run.stats.upgraded += 1;
        result.text = `${SKILLS[target.id].name} が Lv${target.level + 1} に強化された。`;
        addLog(run, result.text, 'system');
        break;
      }
      case 'chooseUpgrade': {
        result.needsUpgradeChoice = true;
        result.text = '強化するスキルを選べ。';
        break;
      }
      case 'maxHp': {
        run.player.maxHp += effect.amount;
        healActor(run.player, effect.amount);
        result.text = `最大HPが${effect.amount}増え、HPも回復した。`;
        break;
      }
      case 'goldDamage': {
        run.gold += effect.gold;
        run.player.gold = run.gold;
        applyDamage(run.player, effect.damage, run, null);
        result.text = `${effect.gold} ゴールドを得たが、${effect.damage} ダメージを受けた。`;
        break;
      }
      case 'permanentStrength': {
        run.player.permanentStrength = (run.player.permanentStrength ?? 0) + effect.amount;
        result.text = `以後の戦闘開始時、力${effect.amount}を得るようになった。`;
        break;
      }
      default:
        result.text = '何も起こらなかった。';
    }
    if (effect.type !== 'chooseUpgrade') run.room.resolved = true;
    return result;
  }

  /** chooseUpgrade イベントの後続処理。 */
  resolveUpgradeChoice(index) {
    const run = this.run;
    const skill = run.player.skills[index];
    if (!skill || skill.level >= 2) return { ok: false };
    skill.level += 1;
    run.stats.upgraded += 1;
    if (run.room) run.room.resolved = true;
    addLog(run, `${SKILLS[skill.id].name} を Lv${skill.level + 1} に強化した。`, 'system');
    return { ok: true, text: `${SKILLS[skill.id].name} を Lv${skill.level + 1} に強化した。` };
  }

  // ----- ショップ -----
  generateShop() {
    const run = this.run;
    const rng = new Rng((run.rng ^ 0x5eed) >>> 0);
    run.rng = rng.snapshot();
    const cards = [];
    const available = [...SKILLS_FOR_CLASS(run.classId)].filter((id) => !run.player.skills.some((s) => s.id === id));
    const shuffled = rng.shuffle(available).slice(0, 3);
    for (const id of shuffled) {
      const cost = 40 + SKILLS[id].cost * 12 + rng.int(-5, 8);
      cards.push({ kind: 'skill', id, name: SKILLS[id].name, icon: SKILLS[id].icon, desc: SKILLS[id].desc, price: Math.max(25, cost), sold: false });
    }
    const relicId = this.rollRelic();
    if (relicId) {
      cards.push({ kind: 'relic', id: relicId, name: RELICS[relicId].name, icon: RELICS[relicId].icon, desc: RELICS[relicId].desc, price: 85 + rng.int(0, 30), sold: false });
    }
    const itemIds = rng.shuffle(Object.keys(ITEMS)).slice(0, 2);
    for (const id of itemIds) {
      cards.push({ kind: 'item', id, name: ITEMS[id].name, icon: ITEMS[id].icon, desc: ITEMS[id].desc, price: 22 + rng.int(0, 10), sold: false });
    }
    run.shop = { cards, removed: false };
    return run.shop;
  }

  buyShop(index) {
    const run = this.run;
    const shop = run.shop;
    if (!shop) return { ok: false };
    const card = shop.cards[index];
    if (!card || card.sold) return { ok: false, reason: 'sold' };
    if (run.gold < card.price) return { ok: false, reason: 'gold' };
    if (card.kind === 'skill' && run.player.skills.length >= 6) return { ok: false, reason: 'full' };
    if (card.kind === 'relic' && run.player.relics.includes(card.id)) return { ok: false, reason: 'owned' };

    run.gold -= card.price;
    run.player.gold = run.gold;
    card.sold = true;
    if (card.kind === 'skill') {
      run.player.skills.push({ id: card.id, level: 0 });
      addLog(run, `${card.name} を購入した。`, 'gold');
    } else if (card.kind === 'relic') {
      this.addRelic(card.id);
    } else {
      this.addItem(card.id);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------
  // 終了・スコア
  // ---------------------------------------------------------
  finishRun(victory) {
    const run = this.run;
    if (run.finished) return;
    run.finished = true;
    run.victory = victory;
    run.score = this.calculateScore();
    addLog(run, victory ? '深淵の底で、光を見た。' : '深淵に飲み込まれた……', 'system');
  }

  calculateScore() {
    const run = this.run;
    const depth = (run.act - 1) * FLOORS_PER_ACT + run.roomsCleared % FLOORS_PER_ACT;
    return Math.max(0, Math.round(
      depth * 240
      + run.roomsCleared * 120
      + run.gold * 1.5
      + run.stats.upgraded * 90
      + run.player.relics.length * 160
      + (run.victory ? 5000 : 0),
    ));
  }

  // ---------------------------------------------------------
  // 保存・復元
  // ---------------------------------------------------------
  serialize() {
    const run = this.run;
    return JSON.parse(JSON.stringify(run));
  }

  loadSave(data) {
    if (!data || data.version !== SAVE_VERSION) return false;
    this.run = data;
    if (this.run.combat) {
      // 戦闘中セーブはターン開始時点に戻す（行動力だけ回復）
      this.run.player.energy = playerStats(this.run).energy;
    }
    return true;
  }
}

/** クラスが取得可能なスキルID一覧。 */
export function SKILLS_FOR_CLASS(classId) {
  const cls = CLASSES[classId];
  if (!cls) return [];
  return [...cls.skills, ...cls.pool];
}

/** スキル説明文（レベル反映）。 */
export function describeSkill(skill, level = 0) {
  const up = skill.upgrade ?? {};
  const has = (key) => (up[key] ?? 0) !== 0 || level > 0;
  if (!has('__never')) { /* noop */ }
  let text = skill.desc;
  const scale = (skill.scale ?? 0) + (up.scale ?? 0) * level;
  const power = (skill.power ?? 0) + (up.power ?? 0) * level;
  const pct = Math.round(scale * 100);
  if (skill.tags?.includes('attack')) {
    const pieces = [];
    if (skill.hits) pieces.push(`${pct}%×${skill.hits}回`);
    else if (pct > 0) pieces.push(`${pct}%${power > 0 ? `+${power}` : ''}`);
    if (pieces.length && level > 0) text = `${text}（現在：${pieces.join(' / ')}）`;
  }
  if (level > 0 && (up.statusAmount ?? 0) > 0) {
    const st = skill.statuses?.map((s) => `${STATUSES[s.id].name}${(s.amount ?? 0) + (up.statusAmount ?? 0) * level}`).join('・');
    if (st) text += `（状態異常 ${st}）`;
  }
  if (level > 0 && (up.blockScale ?? 0) > 0) {
    text += `（障壁 ${skill.blockScale + up.blockScale * level}倍）`;
  }
  if (level > 0 && (up.healPercent ?? 0) > 0) {
    text += `（回復 ${Math.round(((skill.healPercent ?? 0) + up.healPercent * level) * 100)}%）`;
  }
  return text;
}

export { RELICS, ITEMS, EVENTS, ROOM_TYPES, STATUSES, CLASSES, SKILLS, ENEMIES };
