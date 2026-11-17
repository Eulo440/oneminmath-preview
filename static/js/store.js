// Local progress: everything about a player stays on this device (localStorage).
(function () {
  "use strict";
  const KEY = "omm.v1";
  const blank = () => ({ bests: {}, history: {}, facts: {}, initials: "", migrated: false });
  let data;
  try { data = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { data = blank(); }

  // One-time import of personal bests saved by the old site (same domain, key "highScores").
  if (!data.migrated) {
    try {
      const old = JSON.parse(localStorage.getItem("highScores") || "{}");
      for (const [k, v] of Object.entries(old)) {
        if (/^(add|subtract|multiply|divide|smarty)_[123]$/.test(k) && Number.isInteger(v) && v > (data.bests[k] || 0)) data.bests[k] = v;
      }
    } catch (e) { /* ignore */ }
    data.migrated = true;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ } }
  save();

  const id = (mode, level) => `${mode}_${level}`;

  const Store = {
    best(mode, level) { return data.bests[id(mode, level)] || 0; },
    history(mode, level) { return data.history[id(mode, level)] || []; },
    recordRound(mode, level, { score, attempts }) {
      const k = id(mode, level);
      const prevBest = data.bests[k] || 0;
      if (score > prevBest) data.bests[k] = score;
      (data.history[k] = data.history[k] || []).push({ t: Date.now(), score, attempts });
      if (data.history[k].length > 50) data.history[k].shift();
      save();
      return prevBest;
    },
    // fact stats per mode/level: key -> [seen, missed, right-in-a-row]
    recordFact(mode, level, key, correct) {
      const k = id(mode, level);
      const f = (data.facts[k] = data.facts[k] || {});
      const s = (f[key] = f[key] || [0, 0, 0]);
      s[0]++;
      if (!correct) { s[1]++; s[2] = 0; }
      else {
        s[2] = (s[2] || 0) + 1;
        if (s[1] > 0 && s[0] > 3) s[1] = Math.max(0, s[1] - 0.5); // forgive slowly after correct answers
      }
    },
    // "Missed questions": facts missed on this device that haven't been answered right
    // MISSED_CLEAR times in a row since the last miss. Most-missed first.
    missedFacts(mode, level, max = 40) {
      const f = data.facts[id(mode, level)] || {};
      return Object.entries(f)
        .filter(([, s]) => s[1] > 0 && (s[2] || 0) < Store.MISSED_CLEAR)
        .sort((a, b) => b[1][1] - a[1][1] || a[0].localeCompare(b[0]))
        .slice(0, max)
        .map(([k]) => k);
    },
    // every board/level on this device: [{ mode, level, key }]
    allMissed(max = 40) {
      const out = [];
      for (const k of Object.keys(data.facts)) {
        const m = /^(.+)_([123])$/.exec(k); if (!m) continue;
        for (const key of Store.missedFacts(m[1], +m[2], 999)) out.push({ mode: m[1], level: +m[2], key, n: data.facts[k][key][1] });
      }
      // the same fact can have been missed in Mixed and Addition (or in two levels). Show it
      // only once, under the choice where it's most missed; that also prevents accidental repeats.
      const seen = new Set();
      return out.sort((a, b) => b.n - a.n).filter((x) => { if (seen.has(x.key)) return false; seen.add(x.key); return true; }).slice(0, max);
    },
    MISSED_CLEAR: 2,
    saveFacts() { save(); },
    weakFacts(mode, level, max = 12) {
      const f = data.facts[id(mode, level)] || {};
      return Object.entries(f)
        .filter(([, [seen, miss]]) => miss >= 1 && miss / seen >= 0.2)
        .sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0])
        .slice(0, max)
        .map(([k]) => k);
    },
    initials() { return data.initials || ""; },
    setInitials(v) { data.initials = v; save(); },
    resetAll() { data = blank(); data.migrated = true; save(); }
  };
  window.OMM = window.OMM || {};
  window.OMM.Store = Store;
})();
