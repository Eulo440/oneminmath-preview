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
    // fact stats per mode/level: key -> [seen, missed]
    recordFact(mode, level, key, correct) {
      const k = id(mode, level);
      const f = (data.facts[k] = data.facts[k] || {});
      const s = (f[key] = f[key] || [0, 0]);
      s[0]++;
      if (!correct) s[1]++;
      else if (s[1] > 0 && s[0] > 3) s[1] = Math.max(0, s[1] - 0.5); // forgive slowly after correct answers
    },
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
