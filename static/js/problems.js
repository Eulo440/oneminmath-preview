// Problem generation for One Minute Math.
// Design goals: fair, varied practice. Small fact sets use a shuffled "deck"
// (every fact once before any repeat, no back-to-back duplicates); large ranges
// use random draws with a recent-history filter. Trivial facts (0 and 1) appear
// rarely. Facts the player missed before come back a little more often.
(function () {
  "use strict";

  const OPS = {
    add: { sym: "+", name: "Addition" },
    subtract: { sym: "−", name: "Subtraction" },
    multiply: { sym: "×", name: "Multiplication" },
    divide: { sym: "÷", name: "Division" },
    fractions: { sym: "½", name: "Fractions" },
    decimals: { sym: ".5", name: "Decimals" },
    smarty: { sym: "?", name: "Mixed" }
  };

  const LEVELS = {
    add:      { 1: "Facts to 10 + 10", 2: "Two-digit sums to 100", 3: "Two-digit + two-digit" },
    subtract: { 1: "Facts within 20", 2: "Within 100, answers to 50", 3: "Within 200" },
    multiply: { 1: "Tables 1–5", 2: "Tables 2–10", 3: "Tables to 12 × 12" },
    divide:   { 1: "Tables 1–5", 2: "Tables 2–10", 3: "Tables to 12 × 12" },
    fractions: { 1: "Add & subtract, same bottom number", 2: "Add & subtract, different bottoms", 3: "Multiply & divide" },
    decimals:  { 1: "Tenths: add & subtract", 2: "Hundredths: add & subtract", 3: "Multiply & divide" },
    smarty:   { 1: "All four, level 1", 2: "All four, level 2", 3: "All four, level 3" }
  };

  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function mk(op, a, b) {
    let answer;
    if (op === "add") answer = a + b;
    else if (op === "subtract") answer = a - b;
    else if (op === "multiply") answer = a * b;
    else answer = a / b;
    return { op, a, b, answer, key: `${a}${OPS[op].sym}${b}`, text: `${a} ${OPS[op].sym} ${b}` };
  }

  // Probability of keeping a "trivial" fact when building a deck.
  const TRIVIAL_KEEP = 0.25;

  // Enumerate the base facts for small (deck-based) sets, or null for random-range sets.
  function factSet(op, level, table) {
    const out = [];
    const isTrivial = (x, y) => x <= 1 || y <= 1;
    if (op === "multiply" || op === "divide") {
      let pairs = [];
      if (table) {
        for (let k = 0; k <= 12; k++) pairs.push(Math.random() < 0.5 ? [table, k] : [k, table]);
      } else if (level === 1) {
        for (let x = 0; x <= 5; x++) for (let y = 1; y <= 5; y++) pairs.push([x, y]);
      } else if (level === 2) {
        for (let x = 1; x <= 10; x++) for (let y = 2; y <= 10; y++) pairs.push([x, y]);
      } else {
        for (let x = 6; x <= 12; x++) for (let y = 2; y <= 12; y++) pairs.push(Math.random() < 0.5 ? [x, y] : [y, x]);
      }
      for (const [x, y] of pairs) {
        if (isTrivial(x, y) && Math.random() > TRIVIAL_KEEP) continue;
        if (op === "multiply") out.push(mk("multiply", x, y));
        else {
          // a ÷ b = c built from b × c; never divide by 0.
          const divisor = y === 0 ? x : y, quotient = y === 0 ? y : x;
          if (divisor === 0) continue;
          out.push(mk("divide", divisor * quotient, divisor));
        }
      }
      return out;
    }
    if (level !== 1) return null;
    if (op === "add") {
      for (let x = 0; x <= 10; x++) for (let y = 0; y <= 10; y++) {
        if ((x === 0 && y === 0)) continue;
        if (isTrivial(x, y) && Math.random() > TRIVIAL_KEEP) continue;
        out.push(mk("add", x, y));
      }
      return out;
    }
    if (op === "subtract") {
      // inverse of the addition facts: (b + c) − b = c
      for (let b = 0; b <= 10; b++) for (let c = 0; c <= 10; c++) {
        if (b === 0 && c === 0) continue;
        if (isTrivial(b, c) && Math.random() > TRIVIAL_KEEP) continue;
        out.push(mk("subtract", b + c, b));
      }
      return out;
    }
    return null;
  }

  // Is this op/level a small fact set (deck) rather than a random range?
  const isDeck = (op, level, table) => BASIC.includes(op) && (op === "multiply" || op === "divide" || !!table || level === 1);
  const BASIC = ["add", "subtract", "multiply", "divide"];

  function randomRangeProblem(op, level) {
    if (op === "fractions") return fractionProblem(level);
    if (op === "decimals") return decimalProblem(level);
    if (op === "add") {
      if (level === 2) { // sums to 100, mix of 2-digit + 1-digit and 2-digit + 2-digit
        const a = ri(10, 89);
        const b = Math.random() < 0.35 ? ri(2, 9) : ri(10, Math.max(10, 99 - a));
        return mk("add", a, Math.min(b, 100 - a));
      }
      return mk("add", ri(20, 99), ri(20, 99));
    }
    if (op === "subtract") {
      if (level === 2) { const b = ri(2, 50), c = ri(1, 50); return mk("subtract", b + c, b); }
      const b = ri(10, 99), c = ri(1, 100); return mk("subtract", b + c, b);
    }
    return null;
  }

  // A problem source for one round.
  // weakKeys: array of fact keys the player has missed before for this mode/level.
  function createSource({ mode, level, table = null, weakKeys = [] }) {
    const recent = [];
    const RECENT_MAX = 8;
    const decks = {};
    let opBag = [];

    function nextOp() {
      if (mode !== "smarty") return mode;
      if (!opBag.length) opBag = shuffle(["add", "subtract", "multiply", "divide"]);
      return opBag.pop();
    }
    // Mixed level 3 keeps add/subtract at level 2 so each item takes similar time.
    const levelFor = (op) => (mode === "smarty" && level === 3 && (op === "add" || op === "subtract")) ? 2 : level;

    function freshDeck(op, lvl) {
      const base = factSet(op, lvl, mode === "smarty" ? null : table) || [];
      // weak facts get one extra copy each
      const extras = base.filter((p) => weakKeys.includes(p.key)).map((p) => ({ ...p }));
      return shuffle(base.concat(extras));
    }
    function drawFromDeck(op, lvl) {
      const id = op + lvl;
      if (!decks[id] || !decks[id].length) decks[id] = freshDeck(op, lvl);
      const deck = decks[id];
      // avoid anything seen in the last few problems (and its commutative twin)
      const pickFresh = () => { for (let i = deck.length - 1; i >= 0; i--) if (!isRecent(deck[i])) return deck.splice(i, 1)[0]; return null; };
      let p = pickFresh();
      if (!p) { // only recent facts left (end of deck): top up with a new shuffle rather than repeat
        deck.unshift(...freshDeck(op, lvl));
        p = pickFresh();
      }
      return p || deck.pop();
    }

    function twinKey(p) {
      if (p.twin) return p.twin;
      return (p.op === "add" || p.op === "multiply") ? `${p.b}${OPS[p.op].sym}${p.a}` : p.key;
    }
    function isRecent(p) {
      const window = recent.slice(-Math.min(RECENT_MAX, 4));
      return window.some((k) => k === p.key || k === twinKey(p));
    }

    function next() {
      const op = nextOp();
      const lvl = levelFor(op);
      let p = null;
      // revisit a missed fact now and then on random-range levels
      if (weakKeys.length && Math.random() < 0.15 && !isDeck(op, lvl, null)) {
        const k = weakKeys[Math.floor(Math.random() * weakKeys.length)];
        p = parseKey(k);
        if (p && (p.op !== op || isRecent(p))) p = null;
      }
      if (!p) {
        if (isDeck(op, lvl, mode === "smarty" ? null : table)) p = drawFromDeck(op, lvl);
        else {
          for (let tries = 0; tries < 40; tries++) {
            p = randomRangeProblem(op, lvl);
            if (!isRecent(p)) break;
          }
        }
      }
      recent.push(p.key);
      if (recent.length > RECENT_MAX) recent.shift();
      return p;
    }
    return { next };
  }

  function parseKey(key) {
    if (/^[FD]/.test(String(key))) return parseNewKey(key);
    const m = /^(\d+)([+−×÷])(\d+)$/.exec(key);
    if (!m) return null;
    const op = { "+": "add", "−": "subtract", "×": "multiply", "÷": "divide" }[m[2]];
    const p = mk(op, +m[1], +m[3]);
    return Number.isInteger(p.answer) && p.answer >= 0 ? p : null;
  }

  // ---------- fractions (exact integer math; every answer is in simplest form) ----------
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  const Fr = (n, d = 1) => { const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
  const frStr = (f) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);
  const frSimplest = (n, d) => gcd(n, d) === 1;
  function frCalc(a, sub, b) {
    if (sub === "+") return Fr(a.n * b.d + b.n * a.d, a.d * b.d);
    if (sub === "−") return Fr(a.n * b.d - b.n * a.d, a.d * b.d);
    if (sub === "×") return Fr(a.n * b.n, a.d * b.d);
    return Fr(a.n * b.d, a.d * b.n); // ÷
  }
  function mkFrac(a, sub, b) {
    const ans = frCalc(a, sub, b);
    const A = frStr(a), B = frStr(b);
    const comm = sub === "+" || sub === "×";
    return { op: "fractions", kind: "frac", sub, a, b, ans, answer: frStr(ans), key: `F${A}${sub}${B}`, twin: comm ? `F${B}${sub}${A}` : `F${A}${sub}${B}`, text: `${A} ${sub} ${B}` };
  }
  // a random proper fraction n/d in simplest form
  function properFrac(d) { let n; do { n = ri(1, d - 1); } while (!frSimplest(n, d)); return { n, d }; }
  const L2_PAIRS = [[2, 3], [2, 4], [2, 5], [2, 6], [2, 8], [2, 10], [2, 12], [3, 4], [3, 6], [3, 12], [4, 6], [4, 8], [4, 12], [5, 10], [6, 12]];
  function fractionProblem(level) {
    for (let guard = 0; guard < 200; guard++) {
      let p = null;
      if (level === 1) {
        // same denominator; the answer never needs simplifying (or is exactly 1)
        const d = ri(3, 12), sub = Math.random() < 0.5 ? "+" : "−";
        const a = ri(1, d - 1), b = ri(1, d - 1);
        const r = sub === "+" ? a + b : a - b;
        if (r < 1 || r > d) continue;
        if (r !== d && !frSimplest(r, d)) continue;
        if (r === d && Math.random() < 0.7) continue; // "= 1" now and then, not often
        p = { a: { n: a, d }, b: { n: b, d }, sub, raw: true };
      } else if (level === 2) {
        // different (small) denominators, common denominator at most 12
        const pair = L2_PAIRS[ri(0, L2_PAIRS.length - 1)];
        const [d1, d2] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
        const x = properFrac(d1), y = properFrac(d2);
        const sub = Math.random() < 0.5 ? "+" : "−";
        const r = frCalc(x, sub, y);
        if (r.n <= 0 || r.n > r.d) continue; // positive, at most 1
        p = { a: x, b: y, sub };
      } else {
        const kind = ri(0, 4);
        if (kind === 0) { // fraction × fraction
          const x = properFrac(ri(2, 6)), y = properFrac(ri(2, 6));
          p = { a: x, b: y, sub: "×" };
        } else if (kind === 1) { // whole × fraction = whole ("3/4 of 12")
          const x = properFrac(ri(2, 6)), k = ri(1, 5);
          const w = { n: x.d * k, d: 1 };
          p = Math.random() < 0.5 ? { a: w, b: x, sub: "×" } : { a: x, b: w, sub: "×" };
        } else if (kind === 2) { // fraction ÷ whole
          p = { a: properFrac(ri(2, 6)), b: { n: ri(2, 5), d: 1 }, sub: "÷" };
        } else if (kind === 3) { // whole ÷ unit fraction
          p = { a: { n: ri(1, 8), d: 1 }, b: { n: 1, d: ri(2, 5) }, sub: "÷" };
        } else { // unit fraction ÷ larger unit fraction (answer below 1)
          const d = ri(2, 6), m = ri(2, 4);
          if (d * m > 12) continue;
          p = { a: { n: 1, d: d * m }, b: { n: 1, d }, sub: "÷" };
        }
      }
      const out = mkFrac(p.a, p.sub, p.b);
      if (out.ans.n <= 0) continue;
      return out;
    }
    return mkFrac({ n: 1, d: 4 }, "+", { n: 2, d: 4 });
  }

  // ---------- decimals (scaled integers: { v, s } means v / 10^s; no floating point) ----------
  const P10 = [1, 10, 100, 1000, 10000];
  function decParse(str) {
    const m = /^(\d*)(?:\.(\d*))?$/.exec(String(str));
    if (!m || (m[1] === "" && !m[2])) return null;
    const frac = (m[2] || "").replace(/0+$/, "");
    if (frac.length > 4) return null;
    return { v: Number(m[1] || "0") * P10[frac.length] + Number(frac || "0"), s: frac.length };
  }
  function decStr({ v, s }) {
    while (s > 0 && v % 10 === 0) { v /= 10; s--; }
    if (s === 0) return String(v);
    const t = String(v).padStart(s + 1, "0");
    return `${t.slice(0, -s)}.${t.slice(-s)}`;
  }
  const decNorm = (x) => (x.v < 0 ? x : decParse(decStr(x))); // canonical scale (negatives only appear mid-check)
  function decCalc(a, sub, b) {
    const s = Math.max(a.s, b.s), av = a.v * P10[s - a.s], bv = b.v * P10[s - b.s];
    if (sub === "+") return decNorm({ v: av + bv, s });
    if (sub === "−") return decNorm({ v: av - bv, s });
    if (sub === "×") return decNorm({ v: a.v * b.v, s: a.s + b.s });
    // ÷: only used when exact; find q with q × b = a
    for (let qs = 0; qs <= 4; qs++) {
      const num = a.v * P10[qs] * P10[b.s], den = b.v * P10[a.s];
      if (num % den === 0) return decNorm({ v: num / den, s: qs });
    }
    return null;
  }
  function mkDec(a, sub, b) {
    const ans = decCalc(a, sub, b);
    const A = decStr(a), B = decStr(b);
    const comm = sub === "+" || sub === "×";
    return { op: "decimals", kind: "dec", sub, a, b, ans, answer: ans ? decStr(ans) : "", key: `D${A}${sub}${B}`, twin: comm ? `D${B}${sub}${A}` : `D${A}${sub}${B}`, text: `${A} ${sub} ${B}` };
  }
  const D = (v, s) => decNorm({ v, s });
  const notWhole = (lo, hi) => { let v; do { v = ri(lo, hi); } while (v % 10 === 0); return v; };
  function decimalProblem(level) {
    for (let guard = 0; guard < 200; guard++) {
      let p;
      if (level === 1) { // tenths, sums to 19.8
        const x = notWhole(1, 99), y = notWhole(1, 99);
        if (Math.random() < 0.5) p = mkDec(D(x, 1), "+", D(y, 1));
        else { if (x === y) continue; p = mkDec(D(Math.max(x, y), 1), "−", D(Math.min(x, y), 1)); }
      } else if (level === 2) { // hundredths (sometimes with a tenths number), under 10
        const x = notWhole(101, 999);
        const yb = Math.random() < 0.4 ? D(notWhole(1, 99), 1) : D(notWhole(11, 999), 2);
        const xb = D(x, 2);
        if (Math.random() < 0.5) p = mkDec(xb, "+", yb);
        else {
          const diff = decCalc(xb, "−", yb);
          if (diff.v === 0) continue;
          p = diff.v > 0 ? mkDec(xb, "−", yb) : mkDec(yb, "−", xb);
        }
      } else {
        const kind = ri(0, 4);
        if (kind === 0) { // tenths × one-digit whole
          const a = D(notWhole(1, 49), 1), n = D(ri(2, 9), 0);
          p = Math.random() < 0.5 ? mkDec(a, "×", n) : mkDec(n, "×", a);
        } else if (kind === 1) { // tenths × tenths
          p = mkDec(D(ri(1, 9), 1), "×", D(ri(1, 9), 1));
        } else if (kind === 2) { // × or ÷ by 10 or 100
          const ten = Math.random() < 0.5, t = D(ten ? 10 : 100, 0);
          if (Math.random() < 0.5) p = mkDec(Math.random() < 0.6 ? D(notWhole(1, 99), 1) : D(notWhole(101, 999), 2), "×", t);
          else if (ten) p = mkDec(Math.random() < 0.5 ? D(notWhole(1, 99), 1) : D(notWhole(11, 99), 0), "÷", t); // 4.5 ÷ 10, 36 ÷ 10
          else p = mkDec(D(notWhole(2, 99), 0), "÷", t); // 45 ÷ 100
        } else if (kind === 3) { // decimal ÷ one-digit whole, exact answer in tenths
          const q = D(notWhole(1, 29), 1), n = D(ri(2, 9), 0);
          p = mkDec(decCalc(q, "×", n), "÷", n);
        } else { // whole ÷ 0.1, 0.2 or 0.5
          const d = [D(1, 1), D(2, 1), D(5, 1)][ri(0, 2)];
          p = mkDec(D(ri(1, 9), 0), "÷", d);
        }
      }
      if (!p.ans || p.ans.v <= 0 || p.a.v === 0 || p.b.v === 0) continue;
      return p;
    }
    return mkDec(D(15, 1), "+", D(12, 1));
  }

  function parseNewKey(key) {
    let m = /^F(\d+(?:\/\d+)?)([+−×÷])(\d+(?:\/\d+)?)$/.exec(key);
    if (m) {
      const f = (t) => { const [n, d = "1"] = t.split("/"); return { n: +n, d: +d }; };
      const a = f(m[1]), b = f(m[3]);
      if (!a.d || !b.d || (m[2] === "÷" && !b.n)) return null;
      const p = mkFrac(a, m[2], b);
      return p.ans.n > 0 ? p : null;
    }
    m = /^D(\d+(?:\.\d+)?)([+−×÷])(\d+(?:\.\d+)?)$/.exec(key);
    if (m) {
      const a = decParse(m[1]), b = decParse(m[3]);
      if (!a || !b || (m[2] === "÷" && !b.v)) return null;
      const p = mkDec(a, m[2], b);
      return p.ans && p.ans.v > 0 ? p : null;
    }
    return null;
  }

  // ---------- answer checking for the new types ----------
  // Decimal answers: accept 0.5, .5, 0.50, and "," as the decimal point. Returns canonical string or null.
  function normDecimal(typed) {
    const t = String(typed || "").replace(",", ".");
    if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
    const [w, f = ""] = t.split(".");
    if (f.replace(/0+$/, "").length > 4) return null;
    return decStr(decParse((w || "0") + (f ? "." + f : "")));
  }
  // Could more typing still turn t into the answer? (0.4 -> 0.45 yes; 0.5 -> 0.50 yes; 0.6 -> 0.45 no)
  function decimalViable(t, answer) {
    t = String(t).replace(",", ".");
    const reps = [answer]; if (answer.startsWith("0.")) reps.push(answer.slice(1));
    return reps.some((c) => { const full = c.includes(".") ? c : c + "."; return full.startsWith(t) || (t.startsWith(full) && /^0*$/.test(t.slice(full.length))); });
  }
  // Fraction answers: top box n, bottom box d ("" = whole number). Must be in simplest form.
  function checkFraction(p, nStr, dStr) {
    const n = Number(nStr), d = dStr === "" ? 1 : Number(dStr);
    if (nStr === "" || !Number.isInteger(n) || !Number.isInteger(d) || d === 0) return { ok: false, equivalent: false };
    const ok = n === p.ans.n && d === p.ans.d;
    const equivalent = !ok && n * p.ans.d === p.ans.n * d;
    return { ok, equivalent };
  }

  window.OMM = window.OMM || {};
  window.OMM.Problems = { OPS, LEVELS, BASIC, createSource, parseKey, normDecimal, decimalViable, checkFraction, _factSet: factSet, _random: randomRangeProblem, _dec: { decParse, decStr, decCalc }, _fr: { gcd, Fr, frStr } };
})();
