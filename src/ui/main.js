// ============================================================
// ABYSS FRONTIER - UI 層
// エンジンは純粋ロジック、ここは表示と入力のみ。
// ============================================================
import { Engine, RELICS, ITEMS, EVENTS, STATUSES, ROOM_TYPES, CLASSES, SKILLS, describeSkill } from '../core/engine.js';
import { storage } from '../core/storage.js';
import { h, clear, fmt, $ } from './dom.js';
import { sfx } from './audio.js';

const engine = new Engine();

const ui = {
  screen: 'title',       // title | game
  target: 0,
  selectedUpgrade: null,
  eventId: null,
  eventText: null,
  overlay: null,         // null | 'help' | 'menu' | 'result' | 'class' | 'ranking' | 'log' | 'shop-done'
  result: null,
  shopMessage: null,
  lastEnemyHp: new Map(),
  logOpen: false,
  busy: false,
};

// ---------------------------------------------------------
// 保存
// ---------------------------------------------------------
let saveTimer = null;
function scheduleSave() {
  if (!engine.run || engine.run.finished) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.saveRun(engine.serialize()), 120);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (engine.run && !engine.run.finished) storage.saveRun(engine.serialize());
}

// ---------------------------------------------------------
// 小物
// ---------------------------------------------------------
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('toast--show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => { el.hidden = true; }, 220);
  }, 1600);
}

function bar(cls, value, max) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { class: `bar ${cls}` }, h('i', { style: { width: `${pct}%` } }));
}

function chips(statuses) {
  const entries = Object.entries(statuses || {}).filter(([, v]) => v > 0);
  if (entries.length === 0) return h('div', { class: 'status-row' });
  return h('div', { class: 'status-row' }, entries.map(([id, v]) => {
    const def = STATUSES[id];
    if (!def) return null;
    return h('span', {
      class: `chip ${def.good ? 'chip--good' : 'chip--bad'}`,
      title: def.desc,
    }, `${def.icon}${def.name}${v}`);
  }));
}

function skillTags(tags) {
  const map = { attack: '攻撃', defend: '防御', buff: '強化', debuff: '弱体', heal: '回復' };
  return (tags || []).map((t) => map[t]).filter(Boolean).join(' / ');
}

// ---------------------------------------------------------
// デイリー挑戦（日付シード）
// ---------------------------------------------------------
function dailyKey(now = new Date()) {
  // JST (UTC+9) 基準の日付。全プレイヤーが同じシードで挑戦できる。
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function dailyState() {
  const key = dailyKey();
  const saved = storage.loadDaily();
  return saved.date === key ? saved : { date: key, best: 0, plays: 0 };
}

// ---------------------------------------------------------
// タイトル
// ---------------------------------------------------------
function renderTitle() {
  ui.screen = 'title';
  $('#screen-title').hidden = false;
  $('#screen-game').hidden = true;
  $('#log-panel').classList.add('log-panel--hidden');

  const actions = clear($('#title-actions'));
  const save = storage.loadRun();
  const meta = storage.loadMeta();

  if (save) {
    actions.append(
      h('button', {
        class: 'btn btn--primary',
        onclick: () => { sfx.click(); continueRun(save); },
      }, `潜行を続ける ─ 第${save.act}層 B${save.act}-${save.floor}`),
      h('button', {
        class: 'btn btn--ghost',
        onclick: () => openClassSelect(),
      }, '新しい潜行を始める'),
    );
  } else {
    actions.append(h('button', {
      class: 'btn btn--primary',
      onclick: () => openClassSelect(),
    }, '深淵へ潜る'));
  }
  const daily = dailyState();
  actions.append(h('button', {
    class: 'btn btn--gold',
    onclick: () => { sfx.click(); startDailyRun(); },
  }, `記録挑戦（${daily.date}）${daily.best ? ` ─ 自己ベスト ${fmt(daily.best)}` : ''}`));
  actions.append(h('button', {
    class: 'btn btn--ghost',
    onclick: () => { ui.overlay = 'ranking'; renderOverlay(); },
  }, 'ローカル記録を見る'));

  const metaEl = clear($('#title-meta'));
  metaEl.append(
    h('div', {}, h('b', {}, fmt(meta.runs)), '潜行回数'),
    h('div', {}, h('b', {}, fmt(meta.bestScore)), '最高スコア'),
    h('div', {}, h('b', {}, `B${meta.deepest}`), '最深到達'),
    h('div', {}, h('b', {}, fmt(meta.wins)), '踏破回数'),
  );
}

function openClassSelect() {
  ui.overlay = 'class';
  renderOverlay();
}

function startNewRun(classId, seed, options = {}) {
  engine.newRun(classId, seed, options);
  ui.overlay = null;
  ui.target = 0;
  ui.eventId = null;
  ui.eventText = null;
  enterGame();
  sfx.reward();
}

function startDailyRun() {
  const key = dailyKey();
  const state = storage.loadDaily();
  if (state.date === key && state.plays > 0) {
    const modal = h('div', { class: 'modal' },
      h('h2', {}, '本日の記録挑戦'),
      h('p', {}, `${key} のシードには既に挑戦しています（自己ベスト ${fmt(state.best)}）。同じ日付シードで再挑戦できます。`),
      h('div', { class: 'modal-actions' },
        h('button', {
          class: 'btn btn--primary',
          onclick: () => { ui.overlay = null; renderOverlay(); startDailyRunConfirmed(key); },
        }, '再挑戦する'),
        h('button', { class: 'btn', onclick: () => { ui.overlay = 'class'; renderOverlay(); } }, '通常の潜行へ'),
      ),
    );
    showOverlayNode(modal);
    return;
  }
  ui.overlay = 'class-daily';
  renderOverlay();
}

function startDailyRunConfirmed(key) {
  ui.overlay = 'class-daily';
  renderOverlay();
}

function continueRun(save) {
  if (!engine.loadSave(save)) {
    storage.clearRun();
    toast('セーブデータを読み込めませんでした');
    renderTitle();
    return;
  }
  ui.overlay = null;
  ui.target = 0;
  enterGame();
}

function enterGame() {
  ui.screen = 'game';
  $('#screen-title').hidden = true;
  $('#screen-game').hidden = false;
  $('#log-panel').classList.remove('log-panel--hidden');
  if (engine.run?.room?.type === 'shop') engine.generateShop();
  if (engine.run?.room?.type === 'event' && !ui.eventId) ui.eventId = engine.randomEvent();
  render();
  scheduleSave();
}

// ---------------------------------------------------------
// HUD
// ---------------------------------------------------------
function renderHud() {
  const run = engine.run;
  $('#hud-act').textContent = String(run.act);
  $('#hud-floor').textContent = `B${run.act}-${run.floor}`;
  $('#hud-gold').textContent = `◎ ${fmt(run.gold)}`;

  const map = clear($('#hud-map'));
  run.map.forEach((type, index) => {
    const meta = ROOM_TYPES[type];
    const cls = [
      'map-node',
      index < run.roomIndex ? 'map-node--done' : '',
      index === run.roomIndex ? 'map-node--current' : '',
      type === 'boss' ? 'map-node--boss' : '',
    ].filter(Boolean).join(' ');
    map.append(h('span', { class: cls, title: meta?.name ?? type }, meta?.icon ?? '·'));
  });
}

// ---------------------------------------------------------
// メイン描画
// ---------------------------------------------------------
function render() {
  const run = engine.run;
  if (!run) return renderTitle();
  if (run.finished) return renderResult();

  renderHud();
  renderLog();
  const stage = clear($('#stage'));

  if (run.reward) {
    stage.append(renderReward());
    return;
  }
  if (run.combat && !run.combat.over) {
    stage.append(renderCombat());
    return;
  }
  const type = run.room?.type;
  if (type === 'rest') stage.append(renderRest());
  else if (type === 'treasure') stage.append(renderTreasure());
  else if (type === 'shop') stage.append(renderShop());
  else if (type === 'event') stage.append(renderEvent());
  else stage.append(renderFallback());
}

// ---------------- 戦闘 ----------------
function renderCombat() {
  const run = engine.run;
  const combat = run.combat;
  const wrap = h('div', { class: 'combat-wrap' });

  // 敵
  const enemies = combat.enemies;
  if (!enemies[ui.target] || enemies[ui.target].hp <= 0) {
    const firstAlive = enemies.findIndex((e) => e.hp > 0);
    ui.target = firstAlive >= 0 ? firstAlive : 0;
  }
  const zone = h('div', { class: 'enemy-zone' });
  enemies.forEach((enemy, index) => {
    const alive = enemy.hp > 0;
    const def = SKILLS[enemy.intent?.skill];
    const intentKind = def?.tags?.includes('attack') ? 'attack'
      : def?.tags?.includes('heal') ? 'heal' : 'buff';
    const hpChange = ui.lastEnemyHp.get(enemy.id) ?? enemy.hp;
    const hitClass = hpChange > enemy.hp ? 'enemy-card--hit' : '';
    ui.lastEnemyHp.set(enemy.id, enemy.hp);
    zone.append(h('div', {
      class: [
        'enemy-card',
        enemy.tier === 'boss' ? 'enemy-card--boss' : '',
        !alive ? 'enemy-card--dead' : '',
        ui.target === index && alive ? 'enemy-card--target' : '',
        hitClass,
      ].filter(Boolean).join(' '),
      onclick: () => selectTarget(index),
      role: 'button',
      tabindex: alive ? '0' : '-1',
      'aria-label': `${enemy.name} を選択`,
    },
      enemy.block > 0 ? h('span', { class: 'block-badge' }, `🛡${enemy.block}`) : null,
      h('div', { class: 'enemy-icon' }, enemy.icon),
      h('div', { class: 'enemy-name' }, enemy.name),
      enemy.tier !== 'normal' ? h('div', { class: 'enemy-tag' }, enemy.tier) : null,
      bar('bar--hp', enemy.hp, enemy.maxHp),
      h('div', { class: 'bar-label' }, h('span', {}, `HP ${Math.max(0, enemy.hp)}`), h('span', {}, `/ ${enemy.maxHp}`)),
      chips(enemy.statuses),
      alive && def ? h('div', {
        class: `enemy-intent ${intentKind === 'attack' ? '' : `enemy-intent--${intentKind}`}`,
        title: describeSkill(def, 0),
      }, h('span', {}, '▸'), h('b', {}, def.name), h('span', {}, previewIntent(enemy, def))) : null,
    ));
  });
  wrap.append(zone);

  // プレイヤー
  const stats = engineStats();
  const p = run.player;
  const playerPanel = h('div', { class: 'player-panel' },
    h('div', { class: 'player-head' },
      h('span', { class: 'player-icon' }, p.icon),
      h('div', { style: { flex: '1' } },
        h('div', { class: 'player-name' }, p.name),
        h('div', { class: 'player-role' }, `${CLASSES[run.classId].role} ・ turn ${combat.turn}`),
      ),
      p.block > 0 ? h('span', { class: 'block-badge' }, `🛡${p.block}`) : null,
    ),
    bar('bar--player', p.hp, p.maxHp),
    h('div', { class: 'bar-label' }, h('span', {}, `HP ${Math.max(0, p.hp)}`), h('span', {}, `/ ${p.maxHp}`)),
    h('div', { class: 'player-stats' },
      h('span', {}, '攻 ', h('b', {}, stats.atk)),
      h('span', {}, '防 ', h('b', {}, stats.def)),
      h('span', {}, '力 ', h('b', {}, p.statuses.strength ?? 0)),
      h('span', {}, '◎ ', h('b', {}, fmt(run.gold))),
    ),
    chips(p.statuses),
    h('div', { class: 'energy-row' },
      h('span', { class: 'energy-label' }, '行動力'),
      Array.from({ length: Math.max(stats.energy, p.energy) }, (_, i) => h('span', {
        class: `energy-pip ${i < p.energy ? '' : 'energy-pip--spent'}`,
      })),
      h('span', { class: 'energy-label', style: { marginLeft: '4px' } }, `${p.energy} / ${stats.energy}`),
    ),
  );

  // レリック
  if (p.relics.length) {
    playerPanel.append(h('div', { class: 'relic-list' }, p.relics.map((id) => h('span', {
      class: 'relic-dot', title: `${RELICS[id].name}：${RELICS[id].desc}`,
    }, RELICS[id].icon))));
  }

  // アイテム
  if (p.items.length) {
    playerPanel.append(h('div', { class: 'action-row', style: { marginTop: '8px', flexWrap: 'wrap' } },
      p.items.map((it) => h('button', {
        class: 'btn btn--sm',
        title: ITEMS[it.id].desc,
        onclick: () => { sfx.click(); engine.useItem(it.id); refresh(); },
      }, `${ITEMS[it.id].icon} ${ITEMS[it.id].name}×${it.count}`)),
    ));
  }
  wrap.append(playerPanel);

  // スキル
  const skills = engine.playerSkills();
  const grid = h('div', { class: 'skill-grid' });
  skills.forEach((s) => {
    grid.append(h('button', {
      class: [
        'skill-card',
        !s.affordable ? 'skill-card--unaffordable' : '',
        s.upgraded ? 'skill-card--upgraded' : '',
      ].filter(Boolean).join(' '),
      disabled: !s.affordable,
      onclick: () => useSkill(s.index),
      title: `${s.desc}\nコスト: 行動力${s.cost} / ${skillTags(s.tags)}`,
    },
      s.level > 0 ? h('span', { class: 'skill-lv' }, `Lv${s.level + 1}`) : null,
      h('div', { class: 'skill-card-head' },
        h('span', {}, s.icon), h('span', {}, s.name),
        h('span', { class: 'cost' }, `◈${s.cost}`),
      ),
      h('div', { class: 'skill-card-desc' }, s.desc),
    ));
  });
  wrap.append(grid);

  wrap.append(h('div', { class: 'action-row' },
    h('button', {
      class: 'btn btn--primary',
      onclick: () => endTurn(),
    }, `ターンを終える（残り行動力 ${p.energy}）`),
  ));
  wrap.append(h('div', { class: 'room-kicker', style: { textAlign: 'center', marginTop: '-4px', fontSize: '10px', color: 'var(--text-dim)' } },
    '敵をタップで対象変更 ・ 数字キーでスキル ・ スペースでターン終了'));

  return wrap;
}

function previewIntent(enemy, skill) {
  if (!skill.tags?.includes('attack')) return '';
  const atk = enemy.atk + (enemy.statuses?.strength ?? 0);
  const hits = skill.hits ?? 1;
  const raw = atk * (skill.scale ?? 0) + (skill.power ?? 0);
  const dmg = Math.max(1, Math.round(raw * 0.9));
  return hits > 1 ? `×${hits}回 各${dmg}` : `≈${dmg}`;
}

function engineStats() {
  // playerStats はエンジン内部関数だがUIでも必要（実効値表示用）
  const run = engine.run;
  const relics = run.player.relics.map((id) => RELICS[id]);
  return {
    atk: run.player.baseAtk + relics.reduce((s, r) => s + (r.atk ?? 0), 0),
    def: run.player.baseDef + relics.reduce((s, r) => s + (r.def ?? 0), 0),
    energy: run.player.baseEnergy + relics.reduce((s, r) => s + (r.energy ?? 0), 0),
  };
}

function selectTarget(index) {
  const enemy = engine.run.combat?.enemies[index];
  if (!enemy || enemy.hp <= 0) return;
  ui.target = index;
  sfx.click();
  render();
}

function useSkill(index) {
  const res = engine.useSkill(index, ui.target);
  if (!res.ok) {
    sfx.deny();
    if (res.reason === 'no-energy') toast('行動力が足りない');
    return;
  }
  sfx.hit();
  refresh();
}

function endTurn() {
  const before = engine.run.player.hp;
  engine.endTurn();
  if (engine.run.player.hp < before) sfx.hit();
  else sfx.click();
  refresh();
}

function refresh() {
  render();
  scheduleSave();
  const run = engine.run;
  if (run.finished) {
    setTimeout(() => {
      storage.clearRun();
      const meta = storage.recordRunEnd(run);
      storage.addScore({
        classId: run.classId,
        score: run.score,
        act: run.act,
        victory: run.victory,
        seed: run.seed,
        daily: !!run.daily,
      });
      if (run.daily) {
        const key = dailyKey();
        const d = dailyState();
        storage.saveDaily({ date: key, plays: (d.plays ?? 0) + 1, best: Math.max(d.best ?? 0, run.score) });
      }
      ui.result = { run: engine.serialize(), meta };
      ui.overlay = 'result';
      if (run.victory) sfx.victory(); else sfx.defeat();
      renderOverlay();
      renderLog();
    }, 450);
  }
}

// ---------------- 報酬 ----------------
function renderReward() {
  const run = engine.run;
  const reward = run.reward;
  const panel = h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' },
      h('span', { class: 'room-icon' }, '✦'),
      h('div', {}, h('div', { class: 'room-kicker' }, 'REWARD'), h('div', { class: 'room-title' }, reward.boss ? '主を討ち取った' : '戦利品')),
    ),
    h('p', { class: 'room-text' }, `ゴールド +${reward.gold}。スキルを1つ選べ。`),
  );

  if (reward.relic) {
    const relic = RELICS[reward.relic];
    panel.append(h('div', { class: 'pick-card', style: { marginBottom: '10px' } },
      h('div', { class: 'pk-kind' }, 'RELIC'),
      h('div', { class: 'pk-name' }, `${relic.icon} ${relic.name}`),
      h('div', { class: 'pk-desc' }, relic.desc),
    ));
  }

  const cards = h('div', { class: 'card-pick' });
  (reward.cards || []).forEach((card) => {
    const full = run.player.skills.length >= 6 && card.kind === 'new';
    cards.append(h('button', {
      class: 'pick-card',
      onclick: () => pickCard(card.id, card.kind, full),
    },
      h('div', { class: 'pk-kind' }, card.kind === 'upgrade' ? 'UPGRADE' : 'NEW SKILL'),
      h('div', { class: 'pk-name' }, `${card.icon} ${card.name}`),
      h('div', { class: 'pk-cost' }, `行動力 ${card.cost}`),
      h('div', { class: 'pk-desc' }, card.desc),
    ));
  });
  panel.append(cards);
  panel.append(h('div', { class: 'room-actions', style: { marginTop: '12px' } },
    h('button', { class: 'btn btn--ghost', onclick: () => { engine.chooseRewardCard('skip'); sfx.click(); refresh(); } },
      reward.relic ? 'スキルは見送って先へ進む' : 'スキルを見送る'),
    h('div', { class: 'room-kicker', style: { fontSize: '10px', color: 'var(--text-dim)', textAlign: 'center' } },
      '取得スキルは最大6つ（スキル枠がいっぱいの場合は入れ替え）'),
  ));
  return panel;
}

function pickCard(id, kind, full) {
  if (kind === 'new' && full) {
    openReplaceDialog(id);
    return;
  }
  const res = engine.chooseRewardCard(id);
  if (!res.ok) {
    if (res.reason === 'full') openReplaceDialog(id);
    else toast('選択できません');
    return;
  }
  sfx.reward();
  refresh();
}

function openReplaceDialog(newSkillId) {
  const run = engine.run;
  const modal = h('div', { class: 'modal' },
    h('h2', {}, 'スキルを入れ替える'),
    h('p', {}, `スキル枠がいっぱいです。${SKILLS[newSkillId].name} と入れ替えるスキルを選んでください。`),
  );
  const list = h('div', { class: 'modal-actions' });
  run.player.skills.forEach((s, i) => {
    list.append(h('button', {
      class: 'choice',
      onclick: () => {
        engine.replaceSkill(i, newSkillId);
        ui.overlay = null;
        renderOverlay();
        sfx.reward();
        refresh();
      },
    }, `${SKILLS[s.id].icon} ${SKILLS[s.id].name} Lv${s.level + 1}`, h('small', {}, SKILLS[s.id].desc)));
  });
  list.append(h('button', {
    class: 'btn btn--ghost',
    onclick: () => { ui.overlay = null; renderOverlay(); },
  }, 'やめる'));
  modal.append(list);
  showOverlayNode(modal);
}

// ---------------- 野営地 ----------------
function renderRest() {
  const run = engine.run;
  const resolved = run.room.resolved;
  const panel = h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' },
      h('span', { class: 'room-icon' }, '🔥'),
      h('div', {}, h('div', { class: 'room-kicker' }, 'CAMPFIRE'), h('div', { class: 'room-title' }, '野営地')),
    ),
    h('p', { class: 'room-text' }, resolved
      ? '焚き火の残り火が揺れている。先へ進もう。'
      : '崩れた祭壇の陰で、小さな焚き火を起こした。傷を癒すか、刃を研ぐか。'),
  );
  if (!resolved) {
    const actions = h('div', { class: 'room-actions' },
      h('button', {
        class: 'choice',
        onclick: () => { engine.restHeal(); sfx.heal(); refresh(); },
      }, `休む（HPを最大の35%回復：+${Math.round(run.player.maxHp * 0.35)}）`),
    );
    const upgradable = run.player.skills.filter((s) => s.level < 2);
    if (upgradable.length) {
      const list = h('div', { class: 'card-pick', style: { marginTop: '8px' } });
      run.player.skills.forEach((s, i) => {
        if (s.level >= 2) return;
        list.append(h('button', {
          class: 'pick-card', style: { minHeight: 'auto' },
          onclick: () => { engine.restUpgrade(i); sfx.reward(); refresh(); },
        },
          h('div', { class: 'pk-kind' }, `UPGRADE Lv${s.level + 2}`),
          h('div', { class: 'pk-name' }, `${SKILLS[s.id].icon} ${SKILLS[s.id].name}`),
          h('div', { class: 'pk-desc' }, describeSkill(SKILLS[s.id], s.level + 1)),
        ));
      });
      actions.append(h('div', { class: 'room-kicker', style: { fontSize: '10px', marginTop: '6px' } }, 'または刃を研ぐ'));
      actions.append(list);
    }
    panel.append(actions);
  } else {
    panel.append(h('div', { class: 'room-actions' }, advanceButton()));
  }
  return panel;
}

// ---------------- 宝箱 ----------------
function renderTreasure() {
  const run = engine.run;
  const panel = h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' },
      h('span', { class: 'room-icon' }, '📦'),
      h('div', {}, h('div', { class: 'room-kicker' }, 'TREASURE'), h('div', { class: 'room-title' }, '古びた宝箱')),
    ),
    h('p', { class: 'room-text' }, run.room.resolved ? '宝箱は空になった。' : '埃を被った宝箱が、鍵もかからずに置かれている。'),
  );
  if (!run.room.resolved) {
    panel.append(h('div', { class: 'room-actions' }, h('button', {
      class: 'choice',
      onclick: () => {
        const res = engine.openTreasure();
        if (res.ok) {
          sfx.reward();
          toast(res.type === 'relic' ? `レリック：${res.name}` : res.type === 'gold' ? `ゴールド +${res.gold}` : `アイテム：${res.name}`);
        }
        refresh();
      },
    }, '宝箱を開ける')));
  } else {
    panel.append(h('div', { class: 'room-actions' }, advanceButton()));
  }
  return panel;
}

// ---------------- イベント ----------------
function renderEvent() {
  const run = engine.run;
  const event = EVENTS[ui.eventId] ?? EVENTS.altar;
  const panel = h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' },
      h('span', { class: 'room-icon' }, event.icon),
      h('div', {}, h('div', { class: 'room-kicker' }, 'ENCOUNTER'), h('div', { class: 'room-title' }, event.title)),
    ),
    h('p', { class: 'room-text' }, ui.eventText ?? event.text),
  );
  if (run.room.resolved) {
    panel.append(h('div', { class: 'room-actions' }, advanceButton()));
    return panel;
  }
  const actions = h('div', { class: 'room-actions' });
  event.choices.forEach((choice, index) => {
    actions.append(h('button', {
      class: 'choice',
      onclick: () => chooseEvent(index),
    }, choice.label, choice.hint ? h('small', {}, choice.hint) : null));
  });
  panel.append(actions);
  return panel;
}

function chooseEvent(index) {
  const res = engine.chooseEvent(ui.eventId, index);
  if (!res.ok) return;
  sfx.click();
  ui.eventText = res.text;
  if (res.needsUpgradeChoice) {
    const run = engine.run;
    const list = h('div', { class: 'card-pick', style: { marginTop: '8px' } });
    run.player.skills.forEach((s, i) => {
      if (s.level >= 2) return;
      list.append(h('button', {
        class: 'pick-card', style: { minHeight: 'auto' },
        onclick: () => {
          const r = engine.resolveUpgradeChoice(i);
          if (r.ok) { ui.eventText = r.text; sfx.reward(); refresh(); }
        },
      },
        h('div', { class: 'pk-kind' }, `UPGRADE Lv${s.level + 2}`),
        h('div', { class: 'pk-name' }, `${SKILLS[s.id].icon} ${SKILLS[s.id].name}`),
        h('div', { class: 'pk-desc' }, describeSkill(SKILLS[s.id], s.level + 1)),
      ));
    });
    ui.overlay = null;
    renderOverlay();
    render();
    const panel = $('#stage .room-panel');
    if (panel) panel.append(list);
    return;
  }
  if (engine.run.player.hp <= 0 && !engine.run.finished) engine.finishRun(false);
  refresh();
}

// ---------------- ショップ ----------------
function renderShop() {
  const run = engine.run;
  if (!run.shop) engine.generateShop();
  const shop = run.shop;
  const panel = h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' },
      h('span', { class: 'room-icon' }, '🛒'),
      h('div', {}, h('div', { class: 'room-kicker' }, 'MERCHANT'), h('div', { class: 'room-title' }, '行商人')),
    ),
    h('p', { class: 'room-text' }, `「深淵で金が物を言うのは、地の底でも同じさ」　所持金：◎ ${fmt(run.gold)}`),
  );
  if (ui.shopMessage) {
    panel.append(h('div', { class: 'chip chip--good', style: { marginBottom: '10px', display: 'inline-flex' } }, ui.shopMessage));
  }
  const list = h('div', { class: 'card-pick' });
  shop.cards.forEach((card, index) => {
    const affordable = run.gold >= card.price && !card.sold;
    list.append(h('button', {
      class: 'pick-card',
      disabled: card.sold,
      style: { opacity: card.sold ? '0.35' : '1' },
      onclick: () => buy(index),
    },
      h('div', { class: 'pk-kind' }, card.kind === 'skill' ? 'SKILL' : card.kind === 'relic' ? 'RELIC' : 'ITEM'),
      h('div', { class: 'pk-name' }, `${card.icon} ${card.name}`),
      h('div', { class: 'pk-desc' }, card.desc),
      h('div', { class: 'pk-cost', style: { color: affordable ? 'var(--gold)' : 'var(--red)' } }, card.sold ? '売約済' : `◎ ${card.price}`),
    ));
  });
  panel.append(list);
  panel.append(h('div', { class: 'room-actions', style: { marginTop: '12px' } }, advanceButton('店を出る')));
  return panel;
}

function buy(index) {
  const res = engine.buyShop(index);
  if (!res.ok) {
    sfx.deny();
    toast(res.reason === 'gold' ? 'ゴールドが足りない'
      : res.reason === 'full' ? 'スキル枠がいっぱい'
        : res.reason === 'owned' ? 'すでに所持している' : '購入できません');
    return;
  }
  sfx.reward();
  ui.shopMessage = '購入した。';
  refresh();
}

// ---------------- 汎用 ----------------
function renderFallback() {
  return h('div', { class: 'room-panel' },
    h('div', { class: 'room-head' }, h('span', { class: 'room-icon' }, '▽'),
      h('div', {}, h('div', { class: 'room-kicker' }, 'DESCEND'), h('div', { class: 'room-title' }, '深淵へ'))),
    h('div', { class: 'room-actions' }, advanceButton()),
  );
}

function advanceButton(label = '次の部屋へ進む') {
  const run = engine.run;
  const isBoss = run.map[run.roomIndex] === 'boss';
  return h('button', {
    class: 'btn btn--primary btn--wide',
    onclick: () => {
      sfx.click();
      const res = engine.advance();
      if (res.victory) { refresh(); return; }
      if (engine.run.room?.type === 'event') ui.eventId = engine.randomEvent();
      ui.eventText = null;
      ui.shopMessage = null;
      ui.lastEnemyHp.clear();
      ui.target = 0;
      if (engine.run.room?.type === 'shop') engine.generateShop();
      refresh();
    },
  }, isBoss && run.act < 3 ? '層を下りる' : label);
}

// ---------------- ログ ----------------
function renderLog() {
  const run = engine.run;
  const panel = $('#log-panel');
  if (!run) return;
  clear(panel);
  const lines = run.log.slice(-7);
  for (const line of lines) {
    panel.append(h('div', { class: `log-line log-line--${line.kind}` }, line.text));
  }
  panel.scrollTop = panel.scrollHeight;
}

// ---------------------------------------------------------
// オーバーレイ
// ---------------------------------------------------------
function renderOverlay() {
  const el = $('#overlay');
  if (!ui.overlay) {
    el.hidden = true;
    clear(el);
    return;
  }
  el.hidden = false;
  clear(el);
  if (ui.overlay === 'help') el.append(helpModal());
  else if (ui.overlay === 'menu') el.append(menuModal());
  else if (ui.overlay === 'class') el.append(classModal(false));
  else if (ui.overlay === 'class-daily') el.append(classModal(true));
  else if (ui.overlay === 'ranking') el.append(rankingModal());
  else if (ui.overlay === 'result') el.append(resultModal());
  else if (ui.overlay === 'confirm-abandon') el.append(confirmAbandonModal());
}

function showOverlayNode(node) {
  const el = $('#overlay');
  el.hidden = false;
  clear(el).append(node);
}

function closeOverlay() {
  ui.overlay = null;
  renderOverlay();
}

function helpModal() {
  return h('div', { class: 'modal' },
    h('h2', {}, '遊び方'),
    h('p', {}, '深淵を3層潜り、各層の主を討つのが目的です。各部屋は5つ。倒れるか踏破すれば1回の潜行が終わり、スコアが記録されます。'),
    h('h3', {}, '戦闘'),
    h('ul', {},
      h('li', {}, '行動力（◈）を消費してスキルを使います。足りなければ「ターンを終える」。'),
      h('li', {}, '敵カードをタップすると対象を変更できます。'),
      h('li', {}, '敵の行動は予告されています。障壁（🛡）はターン開始時に消えるので、受けすぎに注意。'),
    ),
    h('h3', {}, '状態異常'),
    h('ul', {}, Object.entries(STATUSES).map(([id, s]) => h('li', {}, `${s.icon} ${s.name}：${s.desc}`))),
    h('h3', {}, '成長'),
    h('ul', {},
      h('li', {}, '戦闘後はスキルを1つ獲得または強化（最大Lv3・6枠）。'),
      h('li', {}, 'レリックは所持しているだけで効果を発揮します。'),
      h('li', {}, '野営地では回復か強化のどちらか一方。'),
    ),
    h('h3', {}, '保存について'),
    h('p', {}, '進行状況はこのブラウザのローカルストレージに保存されます。端末やブラウザごとの保存で、サーバー同期はありません。ブラウザのデータ削除で消える場合があります。'),
    h('h3', {}, 'ショートカット'),
    h('p', {}, '1〜6：スキル　スペース/Enter：ターン終了　Esc：メニュー'),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn btn--primary', onclick: closeOverlay }, '閉じる'),
    ),
  );
}

function menuModal() {
  const run = engine.run;
  return h('div', { class: 'modal' },
    h('h2', {}, 'メニュー'),
    h('p', {}, `第${run.act}層 B${run.act}-${run.floor} ・ ${CLASSES[run.classId].name} ・ ◎${fmt(run.gold)}`),
    h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: () => { ui.overlay = 'help'; renderOverlay(); } }, '遊び方'),
      h('button', { class: 'btn', onclick: () => { flushSave(); toast('保存しました'); closeOverlay(); } }, '保存する'),
      h('button', {
        class: 'btn btn--ghost',
        onclick: () => { const on = sfx.toggle(); toast(on ? 'サウンド ON' : 'サウンド OFF'); },
      }, 'サウンド ON/OFF'),
      h('button', { class: 'btn btn--ghost', onclick: () => { ui.overlay = 'ranking'; renderOverlay(); } }, 'ローカル記録'),
      h('button', { class: 'btn btn--ghost', onclick: () => { flushSave(); ui.overlay = null; renderOverlay(); renderTitle(); } }, 'タイトルへ（進行は保存）'),
      h('button', { class: 'btn btn--danger', onclick: () => { ui.overlay = 'confirm-abandon'; renderOverlay(); } }, 'この潜行を諦める'),
      h('button', { class: 'btn', onclick: closeOverlay }, '閉じる'),
    ),
  );
}

function confirmAbandonModal() {
  return h('div', { class: 'modal' },
    h('h2', {}, '潜行を諦めますか？'),
    h('p', {}, '現在の進行は破棄されます（スコアは記録されません）。'),
    h('div', { class: 'modal-actions' },
      h('button', {
        class: 'btn btn--danger',
        onclick: () => {
          storage.clearRun();
          engine.run = null;
          ui.overlay = null;
          renderOverlay();
          renderTitle();
        },
      }, '諦めてタイトルへ'),
      h('button', { class: 'btn', onclick: () => { ui.overlay = 'menu'; renderOverlay(); } }, '戻る'),
    ),
  );
}

function classModal(daily = false) {
  const key = dailyKey();
  const modal = h('div', { class: 'modal' },
    h('h2', {}, daily ? `記録挑戦 ─ ${key}` : '誰として潜るか'),
    h('p', {}, daily
      ? '同じ日付シードで全員が同じ部屋・敵・報酬の並びに挑みます。今日の自己ベストを更新しよう。'
      : 'クラスごとに初期スキルと成長先が変わります。レリックとスキルは潜行ごとにリセットされます。'),
  );
  if (daily) modal.append(h('div', { class: 'chip chip--relic', style: { marginBottom: '8px' } }, `シード ${key}-daily`));
  const grid = h('div', { class: 'class-grid' });
  Object.entries(CLASSES).forEach(([id, cls]) => {
    grid.append(h('button', { class: 'class-card', onclick: () => startNewRun(id, daily ? `${key}-daily` : undefined, daily ? { daily: true, dailyLabel: key } : {}) },
      h('span', { class: 'class-icon' }, cls.icon),
      h('div', {},
        h('div', { class: 'class-name' }, cls.name),
        h('div', { class: 'class-role' }, cls.role),
        h('div', { class: 'class-desc' }, cls.desc),
        h('div', { class: 'class-stats' },
          h('span', {}, `HP ${cls.hp}`), h('span', {}, `攻 ${cls.atk}`),
          h('span', {}, `防 ${cls.def}`), h('span', {}, `◈ ${cls.energy}`),
        ),
      ),
    ));
  });
  modal.append(grid);
  modal.append(h('div', { class: 'modal-actions' },
    h('button', { class: 'btn btn--ghost', onclick: closeOverlay }, '戻る'),
  ));
  return modal;
}

function rankingModal() {
  const scores = storage.loadScores();
  const meta = storage.loadMeta();
  const modal = h('div', { class: 'modal' },
    h('h2', {}, 'ローカル記録'),
    h('p', {}, `潜行 ${meta.runs} 回 / 踏破 ${meta.wins} 回 / 最深 B${meta.deepest}。記録はこの端末のブラウザにのみ保存されます。`),
  );
  const dailyScores = scores.filter((s) => s.daily);
  const normalScores = scores.filter((s) => !s.daily);
  const daily = dailyState();
  modal.append(h('h3', {}, `記録挑戦 ${daily.date}`));
  modal.append(h('p', {}, `今日の自己ベスト：${fmt(daily.best)} / 挑戦 ${daily.plays} 回`));
  dailyScores.slice(0, 5).forEach((s, i) => {
    modal.append(h('div', { class: `rank-row ${i === 0 ? 'rank-row--me' : ''}` },
      h('span', {}, `${i + 1}. ${CLASSES[s.classId]?.name ?? '—'}`),
      h('span', {}, `B${s.act} ${s.victory ? '踏破' : '潜行'}`),
      h('span', {}, fmt(s.score)),
    ));
  });
  modal.append(h('h3', {}, '通常の潜行'));
  if (normalScores.length === 0) {
    modal.append(h('p', {}, 'まだ記録がありません。'));
  } else {
    normalScores.forEach((s, i) => {
      modal.append(h('div', { class: `rank-row ${i === 0 ? 'rank-row--me' : ''}` },
        h('span', {}, `${i + 1}. ${CLASSES[s.classId]?.name ?? '—'}`),
        h('span', {}, `B${s.act} ${s.victory ? '踏破' : '潜行'}`),
        h('span', {}, fmt(s.score)),
      ));
    });
  }
  modal.append(h('div', { class: 'modal-actions' },
    scores.length ? h('button', {
      class: 'btn btn--ghost',
      onclick: () => { storage.clearScores(); renderOverlay(); toast('記録を削除しました'); },
    }, '記録を削除') : null,
    h('button', { class: 'btn btn--primary', onclick: closeOverlay }, '閉じる'),
  ));
  return modal;
}

function resultModal() {
  const data = ui.result;
  if (!data) return h('div');
  const run = data.run;
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'result-sub' }, run.victory ? 'ABYSS CONQUERED' : 'RUN ENDED'),
    h('h2', { style: { textAlign: 'center' } }, run.victory ? '深淵を踏破した' : '深淵に呑まれた'),
    h('div', { class: 'result-score' }, fmt(run.score)),
    data.meta && data.meta.bestScore === run.score
      ? h('div', { class: 'result-sub', style: { color: 'var(--gold)' } }, '★ 自己ベスト更新')
      : null,
    h('p', { style: { textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)' } },
      `第${run.act}層 ・ ${CLASSES[run.classId].name} ・ シード ${String(run.seed).slice(0, 12)}`),
    h('div', { class: 'result-stats' },
      h('div', {}, '到達深度', h('b', {}, `B${run.act}-${run.floor}`)),
      h('div', {}, '踏破部屋', h('b', {}, run.roomsCleared)),
      h('div', {}, '与ダメージ', h('b', {}, fmt(run.stats.damageDealt))),
      h('div', {}, '被ダメージ', h('b', {}, fmt(run.stats.damageTaken))),
      h('div', {}, 'スキル強化', h('b', {}, run.stats.upgraded)),
      h('div', {}, 'レリック', h('b', {}, run.player.relics.length)),
    ),
    run.daily ? h('div', { class: 'chip chip--relic', style: { marginTop: '10px' } }, `記録挑戦 ${run.dailyLabel}`) : null,
    h('h3', {}, 'ローカルランキング'),
  );
  const best = storage.loadScores();
  if (best.length === 0) modal.append(h('p', {}, '記録なし'));
  best.slice(0, 5).forEach((s, i) => {
    modal.append(h('div', { class: `rank-row ${s.score === run.score ? 'rank-row--me' : ''}` },
      h('span', {}, `${i + 1}. ${CLASSES[s.classId]?.name ?? '—'}`),
      h('span', {}, `B${s.act} ${s.victory ? '踏破' : '潜行'}`),
      h('span', {}, fmt(s.score)),
    ));
  });
  modal.append(h('div', { class: 'modal-actions' },
    h('button', {
      class: 'btn btn--primary',
      onclick: () => {
        engine.run = null;
        ui.result = null;
        ui.overlay = null;
        renderOverlay();
        renderTitle();
      },
    }, 'タイトルへ'),
    h('button', {
      class: 'btn',
      onclick: () => { startNewRun(run.classId); },
    }, `同じクラスでもう一度（${CLASSES[run.classId].name}）`),
  ));
  return modal;
}

function renderResult() {
  // 結果はオーバーレイで表示する（背景は最終状態のまま）
  renderHud();
  renderLog();
}

// ---------------------------------------------------------
// 入力
// ---------------------------------------------------------
function bindEvents() {
  $('#btn-help').addEventListener('click', () => { sfx.click(); ui.overlay = 'help'; renderOverlay(); });
  $('#btn-menu').addEventListener('click', () => { sfx.click(); ui.overlay = 'menu'; renderOverlay(); });

  $('#overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay' && ui.overlay && !['result', 'class'].includes(ui.overlay)) {
      closeOverlay();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (ui.overlay) {
      if (e.key === 'Escape' && !['result', 'class', 'class-daily'].includes(ui.overlay)) closeOverlay();
      return;
    }
    if (ui.screen !== 'game' || !engine.run || engine.run.finished) return;
    if (e.target instanceof HTMLButtonElement) e.target.blur();
    if (/^[1-6]$/.test(e.key)) {
      const index = Number(e.key) - 1;
      const skills = engine.playerSkills();
      if (skills[index]?.affordable) useSkill(index);
      else sfx.deny();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const combat = engine.run.combat;
      if (combat && !combat.over) endTurn();
      else {
        const advance = $('#stage .btn--primary');
        if (advance) advance.click();
      }
    } else if (e.key === 'Escape') {
      ui.overlay = 'menu';
      renderOverlay();
    } else if (e.key === 'Tab') {
      const enemies = engine.run.combat?.enemies.filter((en) => en.hp > 0) ?? [];
      if (enemies.length > 1) {
        e.preventDefault();
        const alive = engine.run.combat.enemies;
        let next = ui.target;
        for (let i = 0; i < alive.length; i += 1) {
          next = (next + 1) % alive.length;
          if (alive[next].hp > 0) break;
        }
        selectTarget(next);
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('beforeunload', flushSave);
}

// ---------------------------------------------------------
// 起動
// ---------------------------------------------------------
function boot() {
  bindEvents();
  renderTitle();
  renderOverlay();
  // デバッグ/テスト用フック（同シードで同じ展開を再現できる）
  window.__ABYSS__ = { engine, ui, storage, render, refresh, startNewRun };
}

boot();
