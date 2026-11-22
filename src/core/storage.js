// ローカル保存。ブラウザのlocalStorageは端末・ブラウザ単位で、
// 容量制限や削除の対象になり得る（運用プランの注意点を反映）。
const KEY_RUN = 'abyss-frontier:run:v1';
const KEY_META = 'abyss-frontier:meta:v1';
const KEY_SCORES = 'abyss-frontier:scores:v1';
const KEY_DAILY = 'abyss-frontier:daily:v1';

/** localStorageが使えない環境（プライベートモード等）のフォールバック。 */
const memory = new Map();

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    memory.set(key, value);
    return false;
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

function readJson(key, fallback) {
  const raw = safeGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const storage = {
  saveRun(run) {
    return safeSet(KEY_RUN, JSON.stringify(run));
  },
  loadRun() {
    return readJson(KEY_RUN, null);
  },
  clearRun() {
    safeRemove(KEY_RUN);
  },

  loadMeta() {
    return {
      runs: 0,
      wins: 0,
      bestScore: 0,
      deepest: 0,
      lastClass: 'vanguard',
      totalKills: 0,
      ...readJson(KEY_META, {}),
    };
  },
  saveMeta(meta) {
    safeSet(KEY_META, JSON.stringify(meta));
  },
  recordRunEnd(run) {
    const meta = this.loadMeta();
    meta.runs += 1;
    if (run.victory) meta.wins += 1;
    meta.bestScore = Math.max(meta.bestScore, run.score ?? 0);
    meta.deepest = Math.max(meta.deepest, run.act ?? 1);
    meta.totalKills += run.kills ?? 0;
    meta.lastClass = run.classId;
    this.saveMeta(meta);
    return meta;
  },

  // ローカルランキング（サーバー検証なし・将来Supabaseへ差し替える想定）
  loadScores() {
    return readJson(KEY_SCORES, []);
  },
  addScore(entry) {
    const list = this.loadScores();
    list.push({ ...entry, at: Date.now() });
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, 10);
    safeSet(KEY_SCORES, JSON.stringify(trimmed));
    return trimmed;
  },
  clearScores() {
    safeRemove(KEY_SCORES);
  },

  // デイリー挑戦（シードはJST基準の日付から作る＝全員同じ展開）
  loadDaily() {
    return readJson(KEY_DAILY, {});
  },
  saveDaily(daily) {
    safeSet(KEY_DAILY, JSON.stringify(daily));
  },
};
