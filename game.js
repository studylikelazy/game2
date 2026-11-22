(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#battleCanvas');
  const ctx = canvas.getContext('2d');
  const portrait = $('#portraitCanvas');
  const pctx = portrait.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  pctx.imageSmoothingEnabled = false;

  const ui = {
    enemyFill: $('#enemyHpFill'),
    enemyText: $('#enemyHpText'),
    targetName: $('#targetName'),
    encounter: $('#encounterTitle'),
    stage: $('#stageLabel'),
    stageName: $('#stageName'),
    timer: $('#timerText'),
    danger: $('#dangerText'),
    cooldowns: [$('#cooldown0'), $('#cooldown1'), $('#cooldown2')],
    skills: [$('#skill0'), $('#skill1'), $('#skill2')],
    log: $('#combatLog'),
    pause: $('#pauseButton'),
    speed: $('#speedButton'),
    speedText: $('#speedText'),
    autoState: $('#autoState'),
    footer: $('#footerStatus'),
    toast: $('#toast'),
    chain: $('#chainNotice'),
    sector: $('#sectorFill'),
    sectorPercent: $('#sectorPercent'),
    remaining: $('#remainingEncounters'),
    crystals: $('#crystals'),
    xp: $('#heroXp'),
    xpText: $('#xpText'),
    heroLevel: $('#heroLevel'),
    statAtk: $('#statAtk')
  };

  const enemies = [
    { name: '苔鎧のゴーレム', hp: 3120, type: 'golem', danger: 'MODERATE', color: '#e66a73' },
    { name: '黒曜のガーディアン', hp: 3860, type: 'guardian', danger: 'ELEVATED', color: '#f08b64' },
    { name: '翠嵐の守護獣', hp: 4620, type: 'beast', danger: 'HIGH', color: '#ff718e' }
  ];

  const state = {
    paused: false,
    speed: 2,
    elapsed: 102,
    phase: 0,
    wave: 3,
    sector: 9,
    sectorProgress: 72,
    enemyIndex: 0,
    enemyHp: 3120,
    enemyMax: 3120,
    basicTimer: 0.28,
    skills: [1.2, 7.5, 3.6],
    skillMax: [12.5, 10, 7.5],
    killDelay: 0,
    hitFlash: 0,
    slash: 0,
    impact: 0,
    combo: 12,
    xp: 640,
    crystals: 1280,
    heroes: { mage: 0, knight: 0, ranger: 0 },
    projectiles: [],
    particles: [],
    lastFrame: performance.now(),
    logClock: 0,
    popTimer: 0,
    latestEvent: '最適な行動を選択しています'
  };

  function fmt(n) { return new Intl.NumberFormat('ja-JP').format(Math.round(n)); }
  function clock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
  }
  function setFooter(text) {
    state.latestEvent = text;
    ui.footer.textContent = text;
  }
  function tagFor(kind) {
    return { skill: ['skill', 'SKILL'], crit: ['crit', 'CRIT'], auto: ['sys', 'AUTO'], hit: ['hit', 'HIT'], loot: ['sys', 'LOOT'] }[kind];
  }
  function addLog(kind, text) {
    const [className, label] = tagFor(kind);
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = clock(state.elapsed);
    const tag = document.createElement('span');
    tag.className = `tag ${className}`;
    tag.textContent = label;
    const p = document.createElement('p');
    p.innerHTML = text;
    li.append(time, tag, p);
    ui.log.prepend(li);
    while (ui.log.children.length > 6) ui.log.lastElementChild.remove();
  }

  function particles(x, y, amount, color, spread = 18) {
    for (let i = 0; i < amount; i += 1) {
      state.particles.push({
        x: x + (Math.random() - .5) * 8,
        y: y + (Math.random() - .5) * 8,
        dx: (Math.random() - .5) * spread,
        dy: -Math.random() * spread * .65 - 3,
        life: .35 + Math.random() * .45,
        max: .8,
        color,
        size: Math.random() > .55 ? 2 : 1
      });
    }
  }
  function hitEnemy(amount, source, crit = false) {
    if (state.killDelay > 0) return;
    state.enemyHp = Math.max(0, state.enemyHp - amount);
    state.hitFlash = .13;
    state.impact = .2;
    state.combo += 1;
    particles(248, 111, crit ? 22 : 12, crit ? '#ffd56b' : '#a8e56c', crit ? 30 : 20);
    addLog(crit ? 'crit' : 'hit', `${source} <b>${fmt(amount)}</b> ダメージ`);
    if (crit) {
      ui.chain.textContent = `CHAIN +${Math.min(40, state.combo)}%`;
      ui.chain.classList.add('show');
      setTimeout(() => ui.chain.classList.remove('show'), 900);
    }
    if (state.enemyHp <= 0) {
      enemyDefeated();
    }
  }
  function castSkill(index) {
    if (state.killDelay > 0) return;
    state.skills[index] = state.skillMax[index];
    ui.skills[index].classList.remove('ready');
    if (index === 0) {
      state.slash = .7;
      particles(223, 80, 30, '#b9a8ff', 40);
      hitEnemy(498, '星環ノヴァ', true);
      addLog('skill', 'アステルが <b>星環ノヴァ</b> を発動');
      setFooter('広域魔法を自動詠唱しました');
    } else if (index === 1) {
      particles(102, 105, 15, '#63e7e2', 20);
      addLog('skill', 'ヴァンが <b>蒼天の結界</b> を展開');
      setFooter('防御結界を自動更新しました');
    } else {
      state.projectiles.push({ x: 108, y: 107, targetX: 237, targetY: 107, life: .42, max: .42, shots: 6 });
      hitEnemy(386, '閃影連射', true);
      addLog('skill', 'リラが <b>閃影連射</b> を発動');
      setFooter('弱点を検知し、連射を実行しました');
    }
  }
  function enemyDefeated() {
    state.killDelay = 2.3;
    state.hitFlash = .6;
    state.crystals += 58;
    state.xp += 110;
    particles(244, 105, 50, '#f8c579', 47);
    addLog('loot', `<b>${enemies[state.enemyIndex].name}</b> を撃破`);
    toast('ENEMY CLEARED  //  報酬を回収しました');
    setFooter('対象を撃破。次のシグネチャを走査中です');
  }
  function nextEncounter() {
    state.enemyIndex = (state.enemyIndex + 1) % enemies.length;
    state.wave += 1;
    if (state.wave > 5) {
      state.wave = 1;
      state.sector += 1;
      state.sectorProgress = 8;
      toast(`SECTOR ${String(state.sector).padStart(2, '0')} へ到達`);
      addLog('auto', `セクター ${String(state.sector).padStart(2, '0')} の自動攻略を開始`);
    } else {
      state.sectorProgress = Math.min(96, state.sectorProgress + 6);
    }
    const enemy = enemies[state.enemyIndex];
    state.enemyHp = enemy.hp + (state.sector - 9) * 510;
    state.enemyMax = state.enemyHp;
    state.basicTimer = .5;
    state.skills = [2.1, 5.2, 3.1];
    state.combo = 0;
    state.killDelay = 0;
    addLog('auto', `新しい対象 <b>${enemy.name}</b> を捕捉`);
    setFooter('新しい対象を捕捉。攻撃シーケンスを最適化中です');
  }

  function update(dt) {
    if (state.paused) return;
    const step = dt * state.speed;
    state.phase += step;
    state.elapsed += step;
    state.basicTimer -= step;
    state.hitFlash = Math.max(0, state.hitFlash - step);
    state.slash = Math.max(0, state.slash - step);
    state.impact = Math.max(0, state.impact - step);
    state.killDelay = Math.max(0, state.killDelay - step);
    state.heroes.mage += step;
    state.heroes.knight += step;
    state.heroes.ranger += step;

    if (state.killDelay === 0 && state.enemyHp === 0) nextEncounter();
    for (let i = 0; i < state.skills.length; i += 1) {
      state.skills[i] -= step;
      if (state.skills[i] <= 0 && state.killDelay <= 0) castSkill(i);
    }
    if (state.basicTimer <= 0 && state.killDelay <= 0) {
      const crit = Math.random() < .22;
      const amount = crit ? 286 : 154 + Math.round(Math.random() * 35);
      state.basicTimer = .74;
      state.projectiles.push({ x: 104, y: 113, targetX: 236, targetY: 108, life: .34, max: .34, shots: 1 });
      hitEnemy(amount, crit ? 'リラの急所射撃' : '連携攻撃', crit);
    }
    if (state.killDelay === 0 && state.enemyHp === 0) nextEncounter();

    state.projectiles = state.projectiles.filter((p) => {
      p.life -= step;
      return p.life > 0;
    });
    state.particles = state.particles.filter((p) => {
      p.life -= step;
      p.x += p.dx * step;
      p.y += p.dy * step;
      p.dy += 19 * step;
      return p.life > 0;
    });
    syncUi();
  }
  function syncUi() {
    const enemy = enemies[state.enemyIndex];
    const percent = Math.max(0, state.enemyHp / state.enemyMax * 100);
    ui.enemyFill.style.width = `${percent}%`;
    ui.enemyText.textContent = `${fmt(state.enemyHp)} / ${fmt(state.enemyMax)}`;
    ui.targetName.textContent = enemy.name;
    ui.danger.textContent = enemy.danger;
    ui.encounter.innerHTML = `WAVE ${String(state.wave).padStart(2, '0')} <em>/</em> 05`;
    ui.stage.textContent = `${String(state.sector).padStart(2, '0')}-${String(state.wave).padStart(2, '0')}`;
    ui.stageName.textContent = state.sector > 9 ? '群青の断層' : '翠嵐の境界';
    ui.timer.textContent = clock(state.elapsed);
    ui.sector.style.width = `${state.sectorProgress}%`;
    ui.sectorPercent.textContent = `${state.sectorProgress}%`;
    ui.remaining.textContent = String(Math.max(1, 6 - state.wave));
    ui.crystals.textContent = fmt(state.crystals);
    const levelUp = state.xp >= 1000;
    if (levelUp) {
      state.xp -= 1000;
      $('#heroLevel').textContent = String(Number($('#heroLevel').textContent) + 1);
      ui.statAtk.textContent = String(Number(ui.statAtk.textContent) + 8);
      toast('LEVEL UP  //  アステルの解析レベルが上昇');
    }
    ui.xp.style.width = `${Math.min(100, state.xp / 10)}%`;
    ui.xpText.textContent = `${fmt(state.xp)} / 1,000`;
    for (let i = 0; i < state.skills.length; i += 1) {
      const ready = state.skills[i] < .15;
      ui.cooldowns[i].textContent = ready ? 'READY' : state.skills[i].toFixed(1).padStart(4, '0');
      ui.skills[i].classList.toggle('ready', ready);
    }
  }

  function r(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h)); }
  function drawBackground(t) {
    ctx.clearRect(0, 0, 320, 160);
    r(0, 0, 320, 160, '#071220');
    r(0, 0, 320, 49, '#0a1b31');
    // square stars and distant scan beacons
    const stars = [[21,23],[39,12],[62,31],[84,18],[105,28],[129,10],[148,25],[170,17],[196,34],[217,13],[252,22],[280,12],[299,35],[306,21],[13,43],[235,42]];
    stars.forEach(([x, y], i) => { const shine = ((Math.sin(t * 1.8 + i) + 1) / 2) > .65; r(x, y, shine ? 2 : 1, shine ? 2 : 1, shine ? '#8acfe1' : '#42658b'); });
    // constellation blocks
    r(164, 25, 1, 12, '#376789'); r(160, 30, 9, 1, '#376789'); r(159, 29, 2, 3, '#73c8d0'); r(168, 36, 2, 2, '#73c8d0');
    // far mountains
    const ridge = [[0,85],[19,65],[36,77],[57,51],[79,82],[101,64],[119,74],[139,49],[160,75],[183,63],[204,79],[230,45],[255,75],[280,56],[320,78]];
    ctx.beginPath(); ctx.moveTo(0, 115); ridge.forEach(([x,y]) => ctx.lineTo(x,y));ctx.lineTo(320,115);ctx.closePath();ctx.fillStyle='#122e43';ctx.fill();
    ridge.forEach(([x,y],i) => { if (i && i < ridge.length - 1) r(x - 2, y, 4, 3, '#205269'); });
    // horizon tree/shards
    for (let i = 0; i < 25; i += 1) {
      const x = (i * 17 + 5) % 320; const h = 8 + (i * 11) % 20;
      r(x, 106 - h, 2, h, '#174353');
      r(x - 2, 102 - h, 6, 5, i % 3 ? '#1e5e64' : '#2a7474');
    }
    // battlefield ground layers
    r(0, 108, 320, 52, '#102b34');
    r(0, 112, 320, 7, '#1c5960');
    r(0, 119, 320, 2, '#387a72');
    r(0, 121, 320, 39, '#173741');
    for (let x = -12; x < 340; x += 19) {
      const wobble = ((x * 3) % 9 + 9) % 9;
      r(x, 127 + wobble, 15, 2, '#285761'); r(x + 3, 130 + wobble, 11, 1, '#214c58');
      r(x + 10, 145 - wobble / 2, 2, 3, '#37705f');
    }
    // divide line
    r(158, 112, 1, 38, '#4b8076'); r(160, 116, 1, 35, '#2d5e5b');
    // edge stone clusters
    [[13,134],[28,142],[177,133],[293,137],[305,125],[190,149]].forEach(([x,y],i) => {
      r(x,y,7,4, i%2 ? '#2a5960' : '#315d56');r(x+2,y-2,4,2,'#4c7c70');
    });
  }
  function drawMage(x,y,t) {
    const bob = Math.round(Math.sin(t * 3) * 1.5);
    // staff back
    r(x+27,y+15+bob,2,31,'#805c54');r(x+28,y+15+bob,1,31,'#b88868');
    r(x+25,y+9+bob,7,7,'#65e7e0');r(x+26,y+8+bob,5,9,'#aefcf5');
    // cloak silhouette
    r(x+8,y+24+bob,17,20,'#362d77');r(x+5,y+35+bob,24,9,'#2a2969');r(x+8,y+28+bob,16,12,'#6553c1');r(x+11,y+31+bob,5,13,'#8674da');
    // head / hair
    r(x+10,y+12+bob,13,13,'#f2c3a0');r(x+8,y+11+bob,17,7,'#5b4dba');r(x+10,y+7+bob,12,6,'#7a6bd2');r(x+13,y+5+bob,6,4,'#bdb0ff');
    r(x+12,y+17+bob,2,2,'#28394f');r(x+20,y+17+bob,2,2,'#28394f');r(x+15,y+22+bob,4,1,'#e4858a');
    // spell hand
    r(x+22,y+27+bob,5,5,'#f2c3a0');r(x+25,y+25+bob,5,2,'#bda7ff');
  }
  function drawKnight(x,y,t) {
    const bob = Math.round(Math.sin(t*2.2 + 1) * 1);
    // sword back
    r(x+23,y-2+bob,2,24,'#9ec4dd');r(x+21,y-1+bob,6,3,'#e6f7ff');r(x+20,y+20+bob,8,2,'#c89356');
    // shield
    r(x+3,y+21+bob,10,17,'#245e76');r(x+1,y+24+bob,14,10,'#357f92');r(x+4,y+23+bob,4,12,'#85d1d1');
    // armor / head
    r(x+11,y+21+bob,13,18,'#426e8a');r(x+13,y+24+bob,9,13,'#6e9fba');
    r(x+12,y+10+bob,12,12,'#c4d4dd');r(x+10,y+12+bob,16,7,'#87a5b5');r(x+14,y+7+bob,8,5,'#b8d0d9');r(x+16,y+16+bob,2,2,'#223e57');
    r(x+9,y+39+bob,6,4,'#263f5b');r(x+20,y+39+bob,6,4,'#263f5b');
  }
  function drawRanger(x,y,t) {
    const bob = Math.round(Math.sin(t*2.7+3)*1);
    // bow
    r(x+23,y+12+bob,2,27,'#b48255');r(x+25,y+13+bob,2,7,'#ecc88a');r(x+25,y+31+bob,2,7,'#ecc88a');r(x+21,y+25+bob,8,1,'#d9f7e8');
    // coat
    r(x+7,y+24+bob,15,18,'#326c60');r(x+4,y+34+bob,22,8,'#295b53');r(x+11,y+27+bob,6,15,'#72a76c');
    // face/hair
    r(x+9,y+13+bob,12,12,'#f1c39f');r(x+6,y+10+bob,17,8,'#4c896b');r(x+9,y+7+bob,11,5,'#8dca71');r(x+11,y+17+bob,2,2,'#213d4c');r(x+18,y+17+bob,2,2,'#213d4c');
    r(x+8,y+42+bob,5,3,'#20394b');r(x+18,y+42+bob,5,3,'#20394b');
  }
  function drawEnemy(x,y,t) {
    const shake = state.impact > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
    const flash = state.hitFlash > 0 && Math.floor(t * 18) % 2 === 0;
    const stone = flash ? '#a3c2ad' : '#496b5d';
    const stone2 = flash ? '#779989' : '#36554c';
    x += shake;
    // ground shadow
    r(x+3,y+51,47,5,'#081820');
    // legs
    r(x+12,y+40,13,15,stone2);r(x+34,y+39,12,16,stone2);r(x+10,y+52,17,4,'#25453e');r(x+32,y+52,16,4,'#25453e');
    // arms
    r(x,y+22,13,21,stone2);r(x-3,y+31,15,11,stone);r(x+48,y+20,14,23,stone2);r(x+49,y+31,17,12,stone);
    // body / moss plates
    r(x+12,y+18,37,29,stone);r(x+17,y+16,28,32,'#527969');r(x+14,y+30,33,17,stone2);r(x+20,y+19,17,11,'#5f8e67');r(x+37,y+23,8,12,'#7a9b5b');
    // crystal core
    r(x+27,y+30,9,10,'#2c9590');r(x+29,y+29,5,12,'#8ff4df');r(x+30,y+31,3,5,'#d9fff2');
    // head
    r(x+17,y+4,28,20,stone2);r(x+20,y+1,22,7,'#58796a');r(x+16,y+9,31,13,stone);r(x+21,y+12,5,4,'#a9e473');r(x+37,y+12,5,4,'#a9e473');r(x+23,y+18,18,2,'#25473d');
    // horn/moss
    r(x+19,y-4,5,7,'#74a661');r(x+38,y-5,5,8,'#74a661');r(x+15,y+4,6,4,'#83b46b');
    // cracks
    r(x+15,y+25,2,7,'#243f3a');r(x+43,y+35,2,5,'#243f3a');r(x+23,y+43,2,4,'#243f3a');
  }
  function drawProjectiles() {
    state.projectiles.forEach((p) => {
      const v = 1 - p.life / p.max;
      const x = p.x + (p.targetX - p.x) * v;
      const y = p.y + (p.targetY - p.y) * v;
      r(x, y, 8, 1, '#fff4ba'); r(x+3, y-1, 3, 3, '#ffca6b');
    });
  }
  function drawEffects(t) {
    if (state.slash > 0) {
      const a = state.slash / .7;
      ctx.globalAlpha = Math.min(1, a * 1.4);
      r(162, 42, 2, 63, '#c3adff');r(150, 65, 30, 2, '#c3adff');r(145, 76, 40, 2, '#8a6cff');r(153, 54, 20, 2, '#f3eaff');
      ctx.globalAlpha = 1;
    }
    state.particles.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life / p.max);r(p.x,p.y,p.size,p.size,p.color); });
    ctx.globalAlpha = 1;
    // foreground grass
    for (let i=0; i<22; i+=1) { const x = (i*23+7)%320; const h = 3+(i%4);r(x,154-h,1,h,'#467a65');r(x+1,156-h,1,h-1,'#2d6258'); }
  }
  function render() {
    ctx.setTransform(4, 0, 0, 4, 0, 0);
    drawBackground(state.phase);
    drawMage(63, 83, state.phase);
    drawKnight(99, 96, state.phase);
    drawRanger(88, 110, state.phase);
    drawEnemy(232, 68, state.phase);
    drawProjectiles();
    drawEffects(state.phase);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawPortrait() {
    pctx.clearRect(0,0,112,112); pctx.fillStyle='#0a192a';pctx.fillRect(0,0,112,112);
    pctx.fillStyle='#102d45';pctx.fillRect(0,65,112,47);
    const s=4; const q=(x,y,w,h,c)=>{pctx.fillStyle=c;pctx.fillRect(x*s,y*s,w*s,h*s);};
    for(let i=0;i<9;i++){q((i*7+3)%28,(i*11+5)%17,1,1,'#476b86');}
    q(8,17,12,11,'#f0c09f');q(7,13,14,6,'#6a5ac6');q(9,10,10,5,'#9382e8');q(12,8,4,3,'#c8bdff');
    q(10,20,1,1,'#21394c');q(16,20,1,1,'#21394c');q(12,24,4,1,'#e58293');
    q(6,27,16,1,'#dba787');q(5,28,18,1,'#483c98');q(5,29,18,12,'#3c337e');q(3,37,22,8,'#2d2e73');q(8,30,8,13,'#7160ca');
    q(19,29,5,8,'#eebf9d');q(22,25,2,14,'#98745d');q(21,23,5,4,'#61e5e0');q(22,22,3,5,'#c7fff5');
    q(1,44,26,1,'#456a80');
  }

  $('#pauseButton').addEventListener('click', () => {
    state.paused = !state.paused;
    ui.pause.textContent = state.paused ? '▶' : 'Ⅱ';
    ui.autoState.textContent = state.paused ? '待機中 · 戦術解析を停止' : '稼働中 · 次の目標を追跡';
    setFooter(state.paused ? '自動戦闘を一時停止しています' : '自動戦闘を再開しました');
    toast(state.paused ? 'AUTO BATTLE PAUSED' : 'AUTO BATTLE RESUMED');
  });
  $('#speedButton').addEventListener('click', () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
    ui.speedText.textContent = `x${state.speed}`;
    toast(`戦闘速度を x${state.speed} に設定`);
  });
  $('#formationButton').addEventListener('click', () => { toast('AUTO FORMATION  //  最適編成を維持しています'); addLog('auto','パーティ配置を自動最適化'); });
  $('#clearLog').addEventListener('click', () => { ui.log.innerHTML = ''; toast('戦術ログをクリアしました'); });
  $('#settingsButton').addEventListener('click', () => { document.querySelector('.scanlines').classList.toggle('hidden'); toast('表示フィルターを切り替えました'); });
  $('#tipsButton').addEventListener('click', () => { toast('自動AIは敵の危険度とスキル回転を解析しています'); });
  $('#goTopButton').addEventListener('click', () => { document.querySelector('#battlefield').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('SECTOR 09 進行中 // 手動入力は不要です'); });
  document.querySelectorAll('.unit-row').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.unit-row').forEach((node) => node.classList.remove('active'));
    button.classList.add('active');
    toast(`${button.querySelector('b').textContent} の詳細を表示`);
  }));

  function frame(now) {
    const dt = Math.min(.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  drawPortrait();
  syncUi();
  requestAnimationFrame(frame);
})();
