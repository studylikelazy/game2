// ============================================================
// ABYSS FRONTIER - ゲームデータ定義
// ここを編集するとバランス調整ができる（ロジックは src/core/engine.js）
// ============================================================

/**
 * 状態異常の定義
 * decay: 'turn' = 自分の手番終了ごとに1減る / 'tick' = ターン開始時ダメージ後に1減る / 'none' = 減らない
 */
export const STATUSES = {
  strength: { name: '力', icon: '⚔', good: true, decay: 'none', desc: '攻撃力 +値' },
  guard: { name: '守', icon: '🛡', good: true, decay: 'none', desc: '防御力 +値' },
  regen: { name: '再生', icon: '✚', good: true, decay: 'turn', desc: '手番終了時に値のHPを回復' },
  poison: { name: '毒', icon: '☠', good: false, decay: 'tick', desc: 'ターン開始時に値のダメージ、その後1減少' },
  burn: { name: '燃焼', icon: '🔥', good: false, decay: 'tick', desc: 'ターン開始時に値のダメージ、その後半減' },
  weaken: { name: '虚弱', icon: '▽', good: false, decay: 'turn', desc: '与ダメージ -25%' },
  vulnerable: { name: '脆化', icon: '◈', good: false, decay: 'turn', desc: '被ダメージ +30%' },
  stun: { name: '麻痺', icon: '✧', good: false, decay: 'turn', desc: '手番を失う' },
  thorns: { name: '棘', icon: '❖', good: true, decay: 'turn', desc: '攻撃を受けると相手に値のダメージ' },
};

/** スキル。target: enemy / allEnemies / self。cost は行動力(EP)。 */
export const SKILLS = {
  // --- 汎用（全クラスが報酬で取得可能） ---
  strike: {
    name: '斬撃', icon: '🗡', cost: 1, target: 'enemy', tags: ['attack'],
    desc: '敵1体に攻撃力60%+4のダメージ。',
    power: 4, scale: 0.6, upgrade: { power: 3, scale: 0.15 },
  },
  guardUp: {
    name: '盾構え', icon: '🛡', cost: 1, target: 'self', tags: ['defend'],
    desc: '防御力×2の障壁を得る。',
    blockScale: 2, upgrade: { blockScale: 0.8 },
  },
  focus: {
    name: '集中', icon: '◎', cost: 0, target: 'self', tags: ['buff'],
    desc: '力を2得る。行動力を1回復。',
    statuses: [{ id: 'strength', amount: 2 }], energyGain: 1,
    upgrade: { statusAmount: 1 },
  },
  jab: {
    name: '連刺', icon: '✳', cost: 1, target: 'enemy', tags: ['attack'],
    desc: '敵1体に攻撃力35%のダメージを2回。',
    hits: 2, power: 0, scale: 0.35, upgrade: { scale: 0.08 },
  },
  venomEdge: {
    name: '毒刃', icon: '☠', cost: 1, target: 'enemy', tags: ['attack', 'debuff'],
    desc: '攻撃力40%のダメージを与え、毒4を付与。',
    power: 0, scale: 0.4, statuses: [{ id: 'poison', amount: 4 }],
    upgrade: { statusAmount: 2, scale: 0.1 },
  },
  emberBurst: {
    name: '燐火', icon: '🔥', cost: 2, target: 'allEnemies', tags: ['attack'],
    desc: '敵全体に攻撃力80%のダメージと燃焼3。',
    power: 0, scale: 0.8, statuses: [{ id: 'burn', amount: 3 }],
    upgrade: { scale: 0.2, statusAmount: 1 },
  },
  mend: {
    name: '応急手当', icon: '✚', cost: 1, target: 'self', tags: ['heal'],
    desc: '最大HPの20%+4を回復。',
    healPercent: 0.2, healFlat: 4, upgrade: { healPercent: 0.08 },
  },
  shatter: {
    name: '破甲撃', icon: '◈', cost: 2, target: 'enemy', tags: ['attack', 'debuff'],
    desc: '攻撃力90%のダメージ。脆化3を付与。',
    power: 0, scale: 0.9, statuses: [{ id: 'vulnerable', amount: 3 }],
    upgrade: { scale: 0.15, statusAmount: 1 },
  },

  // --- ヴァンガード（剣士） ---
  cleave: {
    name: '薙ぎ払い', icon: '⚔', cost: 2, target: 'allEnemies', tags: ['attack'],
    desc: '敵全体に攻撃力75%+2のダメージ。',
    power: 2, scale: 0.75, upgrade: { scale: 0.15 },
  },
  bulwark: {
    name: '大盾', icon: '🛡', cost: 2, target: 'self', tags: ['defend', 'buff'],
    desc: '防御力×3の障壁を得て、守3を得る。',
    blockScale: 3, statuses: [{ id: 'guard', amount: 3 }], upgrade: { blockScale: 1 },
  },
  reckless: {
    name: '捨て身', icon: '💥', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '攻撃力170%のダメージ。自分は6ダメージ受ける。',
    power: 0, scale: 1.7, selfDamage: 6, upgrade: { scale: 0.15 },
  },
  rally: {
    name: '号令', icon: '📢', cost: 1, target: 'self', tags: ['buff'],
    desc: '力3を得て、障壁を防御力分得る。',
    statuses: [{ id: 'strength', amount: 3 }], blockScale: 1, upgrade: { statusAmount: 1 },
  },

  // --- アルケミスト（術師） ---
  fireball: {
    name: '火球', icon: '🔥', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '攻撃力120%のダメージと燃焼4。',
    power: 0, scale: 1.2, statuses: [{ id: 'burn', amount: 4 }],
    upgrade: { scale: 0.15, statusAmount: 2 },
  },
  frostBind: {
    name: '氷縛', icon: '❄', cost: 1, target: 'enemy', tags: ['debuff'],
    desc: '敵1体に虚弱2と脆化2を付与し、攻撃力30%のダメージ。',
    power: 0, scale: 0.3, statuses: [{ id: 'weaken', amount: 2 }, { id: 'vulnerable', amount: 2 }],
    upgrade: { statusAmount: 1 },
  },
  drain: {
    name: '吸命', icon: '🩸', cost: 2, target: 'enemy', tags: ['attack', 'heal'],
    desc: '攻撃力90%のダメージ。与えたダメージの60%を回復。',
    power: 0, scale: 0.9, lifesteal: 0.6, upgrade: { scale: 0.15, lifesteal: 0.15 },
  },
  chant: {
    name: '詠唱', icon: '◇', cost: 1, target: 'self', tags: ['buff', 'defend'],
    desc: '力を2、再生4を得て、障壁を防御力×1.5得る。',
    blockScale: 1.5,
    statuses: [{ id: 'strength', amount: 2 }, { id: 'regen', amount: 4 }],
    upgrade: { statusAmount: 1, blockScale: 0.4 },
  },

  // --- スカウト（斥候） ---
  backstab: {
    name: '急所突き', icon: '🎯', cost: 1, target: 'enemy', tags: ['attack'],
    desc: '攻撃力70%のダメージ。脆化している敵なら追加で攻撃力×1.1。',
    power: 3, scale: 0.7, bonusVsVulnerable: 1.1, upgrade: { scale: 0.15 },
  },
  smokebomb: {
    name: '煙玉', icon: '🌫', cost: 1, target: 'allEnemies', tags: ['debuff', 'defend'],
    desc: '敵全体に虚弱2。防御力×2の障壁を得る。',
    statuses: [{ id: 'weaken', amount: 2 }], blockScale: 2, upgrade: { statusAmount: 1 },
  },
  flurry: {
    name: '乱れ打ち', icon: '✳', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '攻撃力40%のダメージを3回。',
    hits: 3, power: 0, scale: 0.4, upgrade: { scale: 0.07 },
  },
  riposte: {
    name: '見切り', icon: '❖', cost: 1, target: 'self', tags: ['defend', 'buff'],
    desc: '障壁を防御力×1.8得て、棘4を得る。',
    blockScale: 1.8, statuses: [{ id: 'thorns', amount: 4 }], upgrade: { statusAmount: 1, blockScale: 0.4 },
  },

  // --- 敵専用 ---
  e_bite: {
    name: '噛みつき', icon: '🦷', cost: 1, target: 'enemy', tags: ['attack'],
    desc: '攻撃。', power: 2, scale: 0.9,
  },
  e_slam: {
    name: '叩きつけ', icon: '🪨', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '強い攻撃。', power: 4, scale: 1.3,
  },
  e_spit: {
    name: '毒吐き', icon: '☠', cost: 1, target: 'enemy', tags: ['attack', 'debuff'],
    desc: '攻撃と毒。', power: 0, scale: 0.7, statuses: [{ id: 'poison', amount: 4 }],
  },
  e_roar: {
    name: '咆哮', icon: '📢', cost: 1, target: 'self', tags: ['buff'],
    desc: '力を得る。', statuses: [{ id: 'strength', amount: 4 }],
  },
  e_heal: {
    name: '粘液修復', icon: '✚', cost: 1, target: 'self', tags: ['heal'],
    desc: '回復。', healPercent: 0.12,
  },
  e_curse: {
    name: '呪詛', icon: '◈', cost: 1, target: 'enemy', tags: ['debuff'],
    desc: '脆化を付与。', statuses: [{ id: 'vulnerable', amount: 2 }, { id: 'weaken', amount: 2 }],
  },
  e_sweep: {
    name: '薙ぎ払い', icon: '⚔', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '全体攻撃。', power: 3, scale: 1.0,
  },
  e_guard: {
    name: '防御姿勢', icon: '🛡', cost: 1, target: 'self', tags: ['defend'],
    desc: '障壁。', blockScale: 2,
  },
  e_multi: {
    name: '連撃', icon: '✳', cost: 2, target: 'enemy', tags: ['attack'],
    desc: '2回攻撃。', hits: 2, power: 0, scale: 0.7,
  },
  e_beam: {
    name: '虚無光線', icon: '☄', cost: 3, target: 'enemy', tags: ['attack'],
    desc: '大ダメージ。', power: 6, scale: 1.6,
  },
};

/**
 * 敵。moves は重み付き。intent は行動予告に表示される。
 * moves[].cooldown で連続使用を制限できる。
 */
export const ENEMIES = {
  slime: {
    name: '粘液這い', icon: '🟢', tier: 'normal',
    hp: 24, atk: 4, def: 1, moves: [
      { skill: 'e_bite', weight: 3 },
      { skill: 'e_spit', weight: 2 },
      { skill: 'e_heal', weight: 1, cooldown: 3 },
    ],
  },
  bat: {
    name: '洞窟蝙蝠', icon: '🦇', tier: 'normal',
    hp: 18, atk: 5, def: 0, moves: [
      { skill: 'e_multi', weight: 3 },
      { skill: 'e_bite', weight: 2 },
    ],
  },
  skeleton: {
    name: '骸骨兵', icon: '💀', tier: 'normal',
    hp: 32, atk: 5, def: 3, moves: [
      { skill: 'e_slam', weight: 3 },
      { skill: 'e_guard', weight: 1, cooldown: 2 },
      { skill: 'e_sweep', weight: 1 },
    ],
  },
  wraith: {
    name: '嘆きの霊', icon: '👻', tier: 'normal',
    hp: 30, atk: 5, def: 1, moves: [
      { skill: 'e_curse', weight: 2 },
      { skill: 'e_spit', weight: 2 },
      { skill: 'e_beam', weight: 1, cooldown: 2 },
    ],
  },
  hound: {
    name: '深淵の猟犬', icon: '🐺', tier: 'elite',
    hp: 54, atk: 7, def: 3, moves: [
      { skill: 'e_multi', weight: 3 },
      { skill: 'e_roar', weight: 1, cooldown: 3 },
      { skill: 'e_slam', weight: 2 },
    ],
  },
  golem: {
    name: '岩窟ゴーレム', icon: '🗿', tier: 'elite',
    hp: 70, atk: 6, def: 7, moves: [
      { skill: 'e_slam', weight: 3 },
      { skill: 'e_guard', weight: 2, cooldown: 1 },
      { skill: 'e_sweep', weight: 1 },
    ],
  },
  warden: {
    name: '深淵の番人', icon: '🔱', tier: 'boss',
    hp: 120, atk: 8, def: 5, moves: [
      { skill: 'e_sweep', weight: 3 },
      { skill: 'e_beam', weight: 2, cooldown: 2 },
      { skill: 'e_roar', weight: 1, cooldown: 2 },
      { skill: 'e_guard', weight: 1, cooldown: 1 },
    ],
  },
  maw: {
    name: '虚無の顎', icon: '👹', tier: 'boss',
    hp: 170, atk: 10, def: 7, moves: [
      { skill: 'e_beam', weight: 2, cooldown: 1 },
      { skill: 'e_sweep', weight: 3 },
      { skill: 'e_curse', weight: 1, cooldown: 2 },
      { skill: 'e_roar', weight: 1, cooldown: 2 },
    ],
  },
  leviathan: {
    name: '深層のリヴァイアサン', icon: '🐉', tier: 'boss',
    hp: 240, atk: 12, def: 9, moves: [
      { skill: 'e_beam', weight: 2 },
      { skill: 'e_multi', weight: 2 },
      { skill: 'e_roar', weight: 1, cooldown: 2 },
      { skill: 'e_guard', weight: 1, cooldown: 1 },
      { skill: 'e_sweep', weight: 2 },
    ],
  },
};

/** クラス定義。装備スキルは run 開始時のスキル。 */
export const CLASSES = {
  vanguard: {
    name: 'ヴァンガード', role: '前衛 / 高耐久', icon: '🗡',
    desc: '障壁で受け止めながら力で押し切る。扱いやすい近接型。',
    hp: 64, atk: 9, def: 4, energy: 3,
    skills: ['strike', 'guardUp', 'cleave', 'rally'],
    pool: ['reckless', 'bulwark', 'shatter', 'focus', 'jab', 'mend'],
  },
  arcanist: {
    name: 'アルケミスト', role: '後衛 / 範囲と状態異常', icon: '🔥',
    desc: '燃焼と毒を積み、再生で粘る。火力は高いが脆い。',
    hp: 62, atk: 10, def: 3, energy: 4,
    skills: ['fireball', 'frostBind', 'drain', 'chant'],
    pool: ['emberBurst', 'venomEdge', 'mend', 'focus', 'strike', 'shatter'],
  },
  scout: {
    name: 'スカウト', role: '斥候 / 手数と搦め手', icon: '🎯',
    desc: '脆化を入れて急所を突く。手数が多く小回りが利く。',
    hp: 66, atk: 8, def: 3, energy: 4,
    skills: ['backstab', 'jab', 'smokebomb', 'riposte'],
    pool: ['flurry', 'venomEdge', 'focus', 'mend', 'shatter', 'strike'],
  },
};

/** レリック。フックは engine.js の RELIC_HOOKS で実装。 */
export const RELICS = {
  emberHeart: { name: '燐火の心臓', icon: '❤‍🔥', desc: '戦闘開始時、敵全体に燃焼3。', rarity: 'common' },
  ironskin: { name: '鉄の皮膚', icon: '🛡', desc: '戦闘開始時、障壁6。', rarity: 'common' },
  fangCharm: { name: '獣牙の護符', icon: '🦷', desc: '攻撃力 +2。', rarity: 'common', atk: 2 },
  glassLens: { name: '深淵のレンズ', icon: '🔮', desc: '最大HP -6 するが、行動力 +1。', rarity: 'rare', maxHp: -6, energy: 1 },
  bloodOath: { name: '血の誓約', icon: '🩸', desc: '与ダメージ +15%。', rarity: 'rare', damageMul: 1.15 },
  thornMail: { name: '棘の外套', icon: '❖', desc: '戦闘開始時、棘4。', rarity: 'common' },
  greedPurse: { name: '強欲の財布', icon: '💰', desc: '戦闘勝利時、ゴールド +50%。', rarity: 'common', goldMul: 1.5 },
  moonCharm: { name: '月光の護符', icon: '🌙', desc: 'ターン開始時にHP2回復。', rarity: 'rare' },
  deepBattery: { name: '深淵の蓄電池', icon: '🔋', desc: 'ターン開始時、25%で行動力 +1。', rarity: 'rare' },
  hunterEye: { name: '狩人の眼', icon: '👁', desc: '脆化した敵への与ダメージ +25%。', rarity: 'rare' },
  survivor: { name: '生存者の意地', icon: '🕯', desc: 'HPが25%以下のとき与ダメージ +30%。', rarity: 'rare' },
  lastStand: { name: '背水の陣', icon: '⚑', desc: '戦闘開始時、HPが半分以下なら力5。', rarity: 'common' },
  venomVial: { name: '毒の小瓶', icon: '🧪', desc: '攻撃時、20%で毒2を追加。', rarity: 'rare' },
  echoPrism: { name: '反響のプリズム', icon: '💎', desc: '1ターンに4回以上スキルを使うと、そのターン中与ダメージ +20%。', rarity: 'epic' },
  abyssCore: { name: '深淵核', icon: '🌌', desc: '行動力 +1。最大HP -10。', rarity: 'epic', energy: 1, maxHp: -10 },
  aegisRune: { name: '守りのルーン', icon: '🔷', desc: '障壁獲得量 +40%。', rarity: 'rare', blockMul: 1.4 },
};

/** 消耗品。戦闘中のみ使用可。 */
export const ITEMS = {
  potion: { name: '治療薬', icon: '🧪', desc: 'HPを35%回復。', healPercent: 0.35 },
  bomb: { name: '炸裂弾', icon: '💣', desc: '敵全体に18ダメージ。', damage: 18 },
  elixir: { name: '魔力薬', icon: '⚗', desc: '行動力を3回復し、力を2得る。', energy: 3, statuses: [{ id: 'strength', amount: 2 }] },
  antidote: { name: '解毒剤', icon: '🌿', desc: '毒と燃焼を解除し、HPを10%回復。', cleanse: ['poison', 'burn'], healPercent: 0.1 },
  smoke: { name: '煙幕', icon: '🌫', desc: '敵全体に虚弱3。', statuses: [{ id: 'weaken', amount: 3, toEnemy: true }] },
};

/** イベント。choices[].effect は engine.js の applyEventEffect で処理。 */
export const EVENTS = {
  altar: {
    title: '古びた祭壇', icon: '🕯',
    text: '苔むした祭壇に、まだ温かい燭台が残っている。供物を捧げれば、深淵が応えるかもしれない。',
    choices: [
      { label: 'HPを12捧げる（最大HP+6）', effect: { type: 'sacrifice' }, hint: 'リスク：HP12減少' },
      { label: 'ゴールド40を捧げる（レリック獲得）', effect: { type: 'payRelic', gold: 40 }, hint: 'ゴールドが足りないと何も起きない' },
      { label: '立ち去る', effect: { type: 'none' } },
    ],
  },
  fountain: {
    title: '黒い泉', icon: '💧',
    text: '黒く濁った泉が、静かに脈打っている。一口すすれば傷が癒えるが、何かを失うかもしれない。',
    choices: [
      { label: '泉を飲む（HPを45%回復）', effect: { type: 'heal', percent: 0.45 } },
      { label: '泉に手を浸す（30%でレリック／70%でHP8減）', effect: { type: 'gambleRelic', chance: 0.3, failDamage: 8 } },
      { label: '立ち去る', effect: { type: 'none' } },
    ],
  },
  gambler: {
    title: '賽子の亡霊', icon: '🎲',
    text: '「賭けな、深淵の住人よ」亡霊が骰子を転がす。所持ゴールドの半分を賭けられる。',
    choices: [
      { label: 'ゴールドを賭ける（50%で2倍、50%で没収）', effect: { type: 'gambleGold', chance: 0.5 }, hint: '所持金の50%を賭ける' },
      { label: 'スキルを強化してもらう（無料）', effect: { type: 'upgradeRandom' } },
      { label: '立ち去る', effect: { type: 'none' } },
    ],
  },
  blacksmith: {
    title: '亡者の鍛冶屋', icon: '🔨',
    text: '「刃を研ぐか、鎧を打ち直すか。どちらか一つだ」亡者が鉄鎚を掲げている。',
    choices: [
      { label: '刃を研ぐ（スキル1つを強化）', effect: { type: 'chooseUpgrade' } },
      { label: '鎧を打ち直す（最大HP+10、HP10回復）', effect: { type: 'maxHp', amount: 10 } },
      { label: '立ち去る', effect: { type: 'none' } },
    ],
  },
  shrine: {
    title: '静かな祠', icon: '⛩',
    text: '小さな祠に、折れた刀と乾いた花が供えられている。手を合わせると、呼吸が整う。',
    choices: [
      { label: '手を合わせる（HPを25%回復、行動力回復）', effect: { type: 'healPercentAndEnergy', percent: 0.25 } },
      { label: '供物を奪う（ゴールド+60、HP8減）', effect: { type: 'goldDamage', gold: 60, damage: 8 } },
    ],
  },
  whisper: {
    title: '囁く壁', icon: '🫥',
    text: '壁が囁く。「もっと深く、もっと強く」耳を塞ぐか、聞き入るか。',
    choices: [
      { label: '聞き入る（力を5得る。以後の戦闘開始時も力2）', effect: { type: 'permanentStrength', amount: 2 } },
      { label: '耳を塞ぐ（HP12回復）', effect: { type: 'heal', percent: 0.2, flat: 12 } },
    ],
  },
};

/** 敵の出現テーブル（階層で重みが変わる） */
export const ENCOUNTERS = {
  early: [{ id: 'slime', weight: 3 }, { id: 'bat', weight: 3 }, { id: 'skeleton', weight: 2 }],
  mid: [{ id: 'skeleton', weight: 3 }, { id: 'wraith', weight: 3 }, { id: 'slime', weight: 1 }, { id: 'bat', weight: 2 }],
  late: [{ id: 'wraith', weight: 3 }, { id: 'hound', weight: 2 }, { id: 'skeleton', weight: 2 }, { id: 'golem', weight: 1 }],
  elite: [{ id: 'hound', weight: 2 }, { id: 'golem', weight: 1 }],
};

export const BOSSES = ['warden', 'maw', 'leviathan'];

export const ROOM_TYPES = {
  battle: { name: '戦闘', icon: '⚔', desc: '敵と戦う。ゴールドと報酬。' },
  elite: { name: '精鋭', icon: '☠', desc: '強敵。レリック確定。' },
  treasure: { name: '宝箱', icon: '📦', desc: 'レリックかゴールド。' },
  rest: { name: '野営地', icon: '🔥', desc: '回復、またはスキル強化。' },
  shop: { name: '行商人', icon: '🛒', desc: 'ゴールドで品を買う。' },
  event: { name: '出来事', icon: '❓', desc: '選択で結果が変わる。' },
  boss: { name: '深淵の主', icon: '👑', desc: 'フロアの主。撃破で次の層へ。' },
};

export const FLOORS_PER_ACT = 5;
