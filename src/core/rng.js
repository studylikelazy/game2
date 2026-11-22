// 決定的な乱数。シードを保存できるため、リロード後も同じ展開を再現できる。

/** 文字列シードを32bit整数のハッシュ関数へ変換する (xmur3)。 */
export function hashSeed(input) {
  const str = String(input);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export class Rng {
  /** @param {number|string} seed */
  constructor(seed = Date.now()) {
    this.state = (typeof seed === 'string' ? hashSeed(seed)() : seed >>> 0) || 1;
  }

  /** 0以上1未満の小数 (mulberry32)。 */
  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min以上max以下の整数。 */
  int(min, max) {
    if (max < min) throw new Error(`invalid range: ${min}..${max}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min, max) {
    return min + this.next() * (max - min);
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(list) {
    if (!list || list.length === 0) throw new Error('pick() on empty list');
    return list[Math.floor(this.next() * list.length)];
  }

  /** entries: [{ weight, ...}] から重み付き抽選。 */
  weighted(entries) {
    const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight ?? 1), 0);
    if (total <= 0) return entries[0];
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= Math.max(0, entry.weight ?? 1);
      if (roll < 0) return entry;
    }
    return entries[entries.length - 1];
  }

  /** 元配列を変更せずにシャッフルした新しい配列を返す。 */
  shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** 保存・復元用。 */
  snapshot() {
    return this.state;
  }

  restore(state) {
    this.state = state >>> 0;
    return this;
  }
}
