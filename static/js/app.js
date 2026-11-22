// One Minute Math: UI and round logic.
(function () {
  "use strict";
  const P = window.OMM.Problems;
  const { OPS, LEVELS, createSource } = P;
  const Store = window.OMM.Store;
  const Scores = window.OMM.Scores;
  const $ = (id) => document.getElementById(id);
  const ROUND_MS = 60000;
  const PRACTICE_COUNT = 20;

  const state = {
    mode: "add", level: 1, numbers: "whole", clock: "timed", missedScope: "here", table: null, roundCount: 20, pending: null,
    running: false, locked: false, typed: "", typedD: "", typedW: "", kind: "int", slot: "num",
    problem: null, source: null, correct: 0, attempts: 0, missed: [],
    startAt: 0, endAt: 0, raf: 0, announced: {}, lastRound: null, hofBoard: null
  };

  // ---------- helpers ----------
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  }
  // "1/2 + 3/4 = 5/4" -> text with stacked fractions (top number over bottom number)
  // "94 2/3" (a whole number right before a fraction) is a mixed number: kept together, no gap
  function mathNodes(str) {
    const out = [], toks = String(str).split(" ");
    const fracEl = (m) => el("span", { class: "frac", role: "img", "aria-label": `${m[1]} over ${m[2]}` }, el("span", { class: "fn", text: m[1] }), el("span", { class: "fd", text: m[2] }));
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      if (i) out.push(document.createTextNode(" "));
      const m = /^(\d+)\/(\d+)$/.exec(tok), nx = /^(\d+)\/(\d+)$/.exec(toks[i + 1] || "");
      if (m) out.push(fracEl(m));
      else if (/^\d+$/.test(tok) && nx) { out.push(el("span", { class: "mixed", "aria-label": `${tok} and ${nx[1]} over ${nx[2]}` }, el("span", { class: "mw", text: tok }), fracEl(nx))); i++; }
      else out.push(document.createTextNode(tok));
    }
    return out;
  }
  const kindOf = (numbers) => (numbers === "frac" ? "frac" : numbers === "dec" ? "dec" : "int");
  // bests, history, facts and Hall of Fame use this key; whole numbers keep the original ones (add, divide, …)
  const bm = () => P.boardMode(state.mode, state.numbers);
  const withNumbers = (numbers) => (numbers === "frac" ? " with fractions" : numbers === "dec" ? " with decimals" : "");
  const labelFor = (op, numbers) => `${OPS[op].name}${withNumbers(numbers)}`;
  // "mix": a problem with a mixed number in it, answered in a whole box + fraction boxes
  const kindOfProblem = (p) => (p.kind === "frac" ? (p.mixed ? "mix" : "frac") : p.kind === "dec" ? "dec" : "int");
  const firstSlot = (kind) => (kind === "mix" ? "whole" : "num");
  const fracKind = () => state.kind === "frac" || state.kind === "mix";
  // facts this device has missed lately, for the current choice or everywhere
  function missedItems(scope = state.missedScope) {
    if (scope === "all") return Store.allMissed(20);
    return Store.missedFacts(bm(), state.level, 20).map((key) => ({ key, mode: bm(), level: state.level }));
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const keyText = (k) => { const p = P.parseKey(k); return p ? p.text : String(k).replace(/([+−×÷])/, " $1 "); };
  function show(view) {
    for (const v of ["home", "play", "results"]) $(v).hidden = v !== view;
    document.body.dataset.view = view;
    window.scrollTo(0, 0);
  }
  const modeLabel = () => `${labelFor(state.mode, state.numbers)} · Level ${state.level}`;
  const scored = () => state.clock === "timed" && !state.table;

  function sparkline(values, best) {
    if (values.length < 2) return el("p", { class: "muted small", text: values.length ? "Play another round to see your trend." : "" });
    const W = 260, H = 60, P = 6, max = Math.max(best, ...values, 1);
    const pts = values.map((v, i) => [P + (i * (W - 2 * P)) / (values.length - 1), H - P - (v / max) * (H - 2 * P)]);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "spark");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Last ${values.length} rounds: ${values.join(", ")}`);
    const path = document.createElementNS(ns, "polyline");
    path.setAttribute("points", pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" "));
    svg.append(path);
    const last = pts[pts.length - 1];
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", last[0]); dot.setAttribute("cy", last[1]); dot.setAttribute("r", 3.5);
    svg.append(dot);
    return svg;
  }

  // ---------- home ----------
  function syncSetup() {
    document.querySelectorAll("#opTiles .tile").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
    document.querySelectorAll("#lvlTiles .level").forEach((b) => {
      b.setAttribute("aria-pressed", String(+b.dataset.level === state.level));
      b.querySelector("small").textContent = P.levelText(state.mode, +b.dataset.level, state.numbers);
    });
    document.querySelectorAll("#numSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.numbers === state.numbers)));
    document.querySelectorAll("#clockSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.clock === state.clock)));
    const missed = state.clock === "missed";
    $("missedField").hidden = !missed;
    const nHere = missedItems("here").length, nAll = missedItems("all").length;
    document.querySelectorAll("#scopeSeg button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.scope === state.missedScope));
      b.textContent = `${b.dataset.scope === "all" ? "All my misses" : "Just this choice"} (${b.dataset.scope === "all" ? nAll : nHere})`;
    });
    const tableOk = state.numbers === "whole" && (state.mode === "multiply" || state.mode === "divide");
    $("tableField").hidden = !tableOk || state.clock === "missed";
    if (!tableOk) { state.table = null; $("tableSelect").value = ""; }
    const extra = state.numbers === "frac" && state.level === 3 && state.clock !== "missed" ? " Answer in simplest form. Mixed numbers like 3 1/2: whole part in the left box."
      : state.numbers === "frac" ? " Answer in simplest form (1/2, not 2/4). Whole numbers go in the top box."
      : state.numbers === "dec" ? " Use a dot for decimals, like 2.5." : "";
    $("setupHint").className = "hint muted";
    if (missed) {
      const n = state.missedScope === "all" ? nAll : nHere;
      $("setupHint").textContent = n
        ? `${plural(n, "question")} you missed lately, no clock. Each one drops off once you get it right ${Store.MISSED_CLEAR} times in a row.`
        : state.missedScope === "all" ? "No missed questions yet. Nice! Play a round and any misses will show up here."
          : "No missed questions for this choice. Nice! Play a round, or try All my misses.";
    } else $("setupHint").textContent = (scored()
      ? "60 seconds. Answers check themselves as you type."
      : state.clock === "practice" ? `${PRACTICE_COUNT} problems, no clock. Take your time.` : "Table practice isn't added to your bests.") + extra;
    renderProgress();
    loadHof();
  }

  function renderProgress() {
    $("progMode").textContent = `· ${modeLabel()}`;
    const box = $("progress"); box.replaceChildren();
    const hist = Store.history(bm(), state.level);
    const best = Store.best(bm(), state.level);
    if (!hist.length && !best) {
      box.append(el("p", { class: "muted", text: "No rounds yet at this level. Your best and your trend will show up here." }));
      return;
    }
    const last = hist.slice(-10).map((h) => h.score);
    box.append(
      el("div", { class: "stats" },
        el("div", {}, el("span", { class: "statnum", text: String(best) }), el("span", { class: "muted small", text: "best" })),
        el("div", {}, el("span", { class: "statnum", text: last.length ? String(last[last.length - 1]) : "–" }), el("span", { class: "muted small", text: "last round" })),
        el("div", {}, el("span", { class: "statnum", text: String(hist.length) }), el("span", { class: "muted small", text: "rounds" }))
      ),
      sparkline(last, best)
    );
    const weak = Store.weakFacts(bm(), state.level, 6);
    if (weak.length) box.append(el("p", { class: "small" }, "Facts to keep practicing: ", ...weak.map((k) => el("span", { class: "chip" }, ...mathNodes(keyText(k))))));
  }

  let hofReq = 0;
  async function loadHof() {
    $("hofMode").textContent = `· ${modeLabel()}`;
    const box = $("hof");
    const my = ++hofReq;
    state.hofBoard = null;
    if (!Scores.configured) {
      box.replaceChildren(el("p", { class: "muted", text: "The Hall of Fame is offline right now. Your own progress still saves on this device." }));
      return;
    }
    if (!Scores.hasBoard(bm())) {
      box.replaceChildren(el("p", { class: "muted", text: `The Hall of Fame for ${labelFor(state.mode, state.numbers).toLowerCase()} is coming soon. Your own progress still saves on this device.` }));
      return;
    }
    box.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
    try {
      const rows = await Scores.top(bm(), state.level, 10);
      if (my !== hofReq) return;
      state.hofBoard = rows;
      if (!rows.length) { box.replaceChildren(el("p", { class: "muted", text: "No scores yet at this level." })); if (Scores.readOnly) box.append(el("p", { class: "muted small", text: "Preview copy: rounds here aren't added to the Hall of Fame." })); return; }
      const ol = el("ol", { class: "board" });
      rows.forEach((r) => {
        const name = r.initials || "---";
        ol.append(el("li", {}, el("span", { class: "who initials-text", text: name }), el("span", { class: "pts", text: String(r.score) })));
      });
      box.replaceChildren(ol);
      if (Scores.readOnly) box.append(el("p", { class: "muted small", text: "Preview copy: rounds here aren't added to the Hall of Fame." }));
    } catch (e) {
      if (my !== hofReq) return;
      box.replaceChildren(el("p", { class: "muted", text: "Couldn't reach the Hall of Fame. Your own progress still saves on this device." }));
    }
  }

  // ---------- play ----------
  function startRound() {
    let missedSrc = null;
    if (state.clock === "missed") {
      const items = missedItems();
      if (!items.length) { // nothing to redo: say so kindly instead of starting
        if (document.body.dataset.view !== "home") { show("home"); syncSetup(); }
        $("setupHint").className = "hint notice";
        $("startBtn").focus();
        return;
      }
      missedSrc = P.createMissedSource(items);
    }
    if (Scores.hasBoard(bm()) && !Scores.readOnly && state.clock === "timed" && !state.table) loadHof(); // fresh top 10 for the initials check
    state.source = missedSrc || createSource({ mode: state.mode, level: state.level, numbers: state.numbers, table: state.table, weakKeys: Store.weakFacts(bm(), state.level) });
    state.roundCount = missedSrc ? missedSrc.count : PRACTICE_COUNT;
    // drawn one ahead so the answer box can change type (whole / fraction / mixed number / decimal)
    // inside the key event that ends the problem before it (phones keep the keyboard up)
    state.pending = state.source.next();
    state.correct = 0; state.attempts = 0; state.missed = []; state.typed = ""; state.typedD = ""; state.typedW = ""; state.announced = {};
    state.running = false; state.locked = true;
    state.kind = state.pending ? kindOfProblem(state.pending) : kindOf(state.numbers); state.slot = firstSlot(state.kind);
    setupAnswerUI(); swapping(false);
    show("play");
    answerEls().forEach((x) => { x.value = ""; x.classList.remove("good", "miss"); });
    input().focus({ preventScroll: true }); // inside the user's tap, so iOS/Android open the number keyboard
    $("timeText").textContent = state.clock === "timed" ? "60" : `0/${state.roundCount}`;
    $("timerFill").style.transform = "scaleX(1)";
    $("timerFill").parentElement.style.visibility = state.clock === "timed" ? "visible" : "hidden";
    $("feedback").textContent = ""; $("tally").textContent = "";
    renderAnswer();
    let n = 3;
    const tick = () => {
      if (document.body.dataset.view !== "play") return;
      if (n > 0) { $("problem").textContent = String(n); n--; state.countdown = setTimeout(tick, 700); }
      else begin();
    };
    tick();
  }

  function begin() {
    state.running = true; state.locked = false;
    focusInput();
    state.startAt = performance.now();
    state.endAt = state.startAt + ROUND_MS;
    nextProblem();
    clearTimeout(state.endTimer);
    if (state.clock === "timed") {
      frame();
      // backup in case animation frames pause (busy or hidden tab): the round still ends on time
      state.endTimer = setTimeout(() => { if (state.running) frame(); }, ROUND_MS + 50);
    }
  }

  function frame() {
    if (!state.running) return;
    const left = Math.max(0, state.endAt - performance.now());
    $("timerFill").style.transform = `scaleX(${left / ROUND_MS})`;
    const secs = Math.ceil(left / 1000);
    $("timeText").textContent = String(secs);
    for (const s of [30, 10]) if (secs === s && !state.announced[s]) { state.announced[s] = true; $("timeAnnounce").textContent = `${s} seconds left`; }
    document.body.classList.toggle("low-time", secs <= 10);
    if (left <= 0) return endRound();
    state.raf = requestAnimationFrame(frame);
  }

  // opacity only: a hidden (display/visibility) box would lose focus and close the phone keyboard
  const swapping = (on) => { for (const id of ["answerInput", "fracIn", "ansHint"]) $(id).classList.toggle("swap", on); };
  function nextProblem() {
    swapping(false);
    state.problem = state.pending || state.source.next();
    state.pending = null;
    if (kindOfProblem(state.problem) !== state.kind) switchKind(kindOfProblem(state.problem)); // fallback; normally done in judge()
    state.typed = ""; state.typedD = ""; state.typedW = "";
    $("problem").replaceChildren(...mathNodes(`${state.problem.text} =`));
    $("problem").setAttribute("aria-label", spoken(state.problem));
    renderAnswer();
  }
  function spoken(p) {
    const W = { "+": "plus", "−": "minus", "×": "times", "÷": "divided by" };
    if (p.sub) return p.text.replace(/(\d+) (\d+)\/(\d+)/g, "$1 and $2 over $3").replace(/(\d+)\/(\d+)/g, "$1 over $2").replace(/[+−×÷]/, (c) => W[c]);
    const w = { add: "plus", subtract: "minus", multiply: "times", divide: "divided by" }[p.op];
    return `${p.a} ${w} ${p.b}`;
  }
  // The answer box: one box for whole numbers and decimals; a top box over a bottom box for fractions.
  // Mixed numbers: a whole box on the left of the top/bottom boxes.
  const numBox = () => $("numInput"), denBox = () => $("denInput"), wholeBox = () => $("wholeInput");
  const answerEls = () => (state.kind === "mix" ? [wholeBox(), numBox(), denBox()] : state.kind === "frac" ? [numBox(), denBox()] : [$("answerInput")]);
  const isAnswerEl = (t) => t === $("answerInput") || t === numBox() || t === denBox() || t === wholeBox();
  const input = () => (fracKind() ? (state.slot === "den" ? denBox() : state.slot === "whole" && state.kind === "mix" ? wholeBox() : numBox()) : $("answerInput"));
  function setupAnswerUI() {
    const ai = $("answerInput"), frac = fracKind(), dec = state.kind === "dec";
    ai.hidden = frac; $("fracIn").hidden = !frac; wholeBox().hidden = state.kind !== "mix";
    $("fracIn").classList.toggle("withwhole", state.kind === "mix");
    ai.setAttribute("inputmode", dec ? "decimal" : "numeric");
    if (dec) ai.removeAttribute("pattern"); else ai.setAttribute("pattern", "[0-9]*"); // iOS: [0-9]* would hide the dot
    ai.maxLength = dec ? 7 : 4;
    ai.classList.toggle("wide", dec);
    $("ansHint").textContent = state.kind === "mix" ? "Simplest form: 3 1/2. Whole number? Left box only." : frac ? "Simplest form. Whole number? Use the top box only." : dec ? "Use a dot: 2.5 or .5" : "";
  }
  function renderAnswer() {
    if (state.kind === "mix" && wholeBox().value !== state.typedW) wholeBox().value = state.typedW;
    if (fracKind()) {
      if (numBox().value !== state.typed) numBox().value = state.typed;
      if (denBox().value !== state.typedD) denBox().value = state.typedD;
    } else if ($("answerInput").value !== state.typed) $("answerInput").value = state.typed;
  }
  function focusInput() {
    const i = input();
    if (document.body.dataset.view === "play" && document.activeElement !== i) i.focus({ preventScroll: true });
  }
  function moveTo(slot) {
    state.slot = slot;
    const i = input();
    if (document.activeElement !== i) i.focus({ preventScroll: true });
    const n = i.value.length; try { i.setSelectionRange(n, n); } catch (e) { /* ignore */ }
  }
  // change the answer box (whole / decimal / fraction) between two problems of a missed-questions round
  function switchKind(kind) {
    state.kind = kind; state.slot = firstSlot(kind); state.typed = ""; state.typedD = ""; state.typedW = "";
    setupAnswerUI();
    [$("answerInput"), wholeBox(), numBox(), denBox()].forEach((x) => { x.value = ""; x.classList.remove("good", "miss"); });
    if (document.body.dataset.view === "play") input().focus({ preventScroll: true });
  }
  function blurAnswer() { for (const x of [$("answerInput"), numBox(), denBox(), wholeBox()]) if (document.activeElement === x) x.blur(); }

  // Called on every change to the answer box. Digits only (no answer is ever negative).
  function onInput() {
    const i = $("answerInput");
    if (!state.running || state.locked) { i.value = state.typed; return; } // ignore keys during countdown/feedback
    if (state.kind === "dec") return onDecimalInput(i);
    let v = i.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 1) v = v.replace(/^0+(?=\d)/, "");
    state.typed = v;
    if (i.value !== v) i.value = v;
    if (!v) return;
    const ans = String(state.problem.answer);
    if (v === ans || v.length >= ans.length) judge();
  }
  // Decimals: digits and one dot ("," counts as a dot). Checks as soon as it's right, or once it
  // is as long as the answer and can no longer become right. 0.5 = .5 = 0.50.
  function onDecimalInput(i) {
    let v = i.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const k = v.indexOf(".");
    if (k >= 0) v = v.slice(0, k + 1) + v.slice(k + 1).replace(/\./g, "");
    v = v.replace(/^0+(?=\d)/, "").slice(0, 7);
    state.typed = v;
    if (i.value !== v) i.value = v;
    if (!v || v === ".") return;
    const ans = state.problem.answer;
    if (P.normDecimal(v) === ans) return judge();
    if (!P.decimalViable(v, ans) && v.replace(/^\./, "0.").length >= ans.length) judge();
  }
  // Fractions: top box then bottom box. The top box hands over to the bottom box once it has as
  // many digits as the answer's top number; the bottom box checks at the bottom number's length.
  function onFracInput(which) {
    const box = which === "whole" ? wholeBox() : which === "num" ? numBox() : denBox();
    if (!state.running || state.locked) { renderAnswer(); return; }
    let v = box.value.replace(/\D/g, "").slice(0, which === "num" ? 4 : 3);
    if (v.length > 1) v = v.replace(/^0+(?=\d)/, "");
    if (box.value !== v) box.value = v;
    if (which === "whole") state.typedW = v; else if (which === "num") state.typed = v; else state.typedD = v;
    if (!v) return;
    if (state.kind === "mix") return onMixedInput(which, v);
    const a = state.problem.ans;
    const nLen = String(a.n).length, dLen = a.d === 1 ? 1 : String(a.d).length;
    if (which === "num") {
      if (v.length < nLen) return;
      if (a.d === 1 && !state.typedD) return judge();
      if (state.typedD.length >= dLen) return judge();
      moveTo("den");
    } else if (state.typed && v.length >= dLen) {
      // someone typing an equal fraction (2/12 for 1/6) gets to finish it, then hears "simplify"
      const k = Number(state.typed), eq = (k * a.d) % a.n === 0 ? String((k * a.d) / a.n) : "";
      if (eq.length > v.length && eq.startsWith(v)) return;
      judge();
    }
  }
  // Mixed numbers: whole box -> top box -> bottom box. The whole box hands over at the answer's
  // whole-part length (or checks right away when the answer is a whole number); the top and bottom
  // boxes work as above, for whatever is left after the whole part typed (all of it, if blank).
  function onMixedInput(which, v) {
    const a = state.problem.ans, m = P.mixParts(a);
    if (which === "whole") {
      if (v.length < String(m.w).length) return;
      if (state.typed && state.typedD) return judge(); // went back to fix the whole part
      if (m.n === 0 && !state.typed) return judge();
      return moveTo("num");
    }
    const tn = a.n - Number(state.typedW || 0) * a.d; // what's left is tn / a.d
    const g = tn > 0 ? P._fr.gcd(tn, a.d) : 1;
    const nLen = tn > 0 ? String(tn / g).length : 1, dLen = tn > 0 ? String(a.d / g).length : 1;
    if (which === "num") {
      if (v.length < nLen) return;
      if (state.typedD.length >= dLen) return judge();
      return moveTo("den");
    }
    if (!state.typed || v.length < dLen) return;
    const k = Number(state.typed), eq = tn > 0 && (k * a.d) % tn === 0 ? String((k * a.d) / tn) : "";
    if (eq.length > v.length && eq.startsWith(v)) return;
    judge();
  }
  function submitEnter() {
    if (!state.running || state.locked) return;
    if (state.kind === "mix") {
      if (state.slot === "whole") return state.typedW ? moveTo("num") : undefined; // Enter in the whole box = go to the top box
      if (state.slot === "num") { if (state.typed) return moveTo("den"); return state.typedW ? judge() : moveTo("whole"); }
      if (!state.typed) return moveTo("num");
      return judge();
    }
    if (state.kind === "frac") {
      if (state.slot === "num" && state.typed) return moveTo("den"); // Enter in the top box = go to the bottom box
      if (!state.typed) return moveTo("num");
      return judge(); // empty bottom box = whole number
    }
    if (state.typed && state.typed !== ".") judge();
  }

  function judge() {
    if (state.clock === "timed" && performance.now() >= state.endAt) return endRound(); // no answers after time is up
    const p = state.problem;
    let ok, note = "";
    if (state.kind === "mix") {
      const r = P.checkFraction(p, state.typed, state.typedD, state.typedW);
      ok = r.ok;
      const said = [state.typedW, state.typed ? state.typed + (state.typedD ? "/" + state.typedD : "") : ""].filter(Boolean).join(" ");
      if (r.equivalent) note = P.mixParts(p.ans).n === 0 && !state.typedW ? `${said} is equal, but put whole numbers in the left box` : `${said} is equal, but simplify it`;
    } else if (state.kind === "frac") {
      const r = P.checkFraction(p, state.typed, state.typedD);
      ok = r.ok;
      if (r.equivalent) note = `${state.typed}${state.typedD ? "/" + state.typedD : ""} is equal, but simplify it`;
    } else if (state.kind === "dec") ok = P.normDecimal(state.typed) === p.answer;
    else ok = Number(state.typed) === p.answer;
    state.attempts++;
    Store.recordFact(p.origin ? p.origin.mode : bm(), p.origin ? p.origin.level : state.level, p.key, ok);
    state.locked = true; // ignore keys during feedback (old site counted them as extra wrong answers)
    const fb = $("feedback");
    if (ok) {
      state.correct++;
      fb.textContent = "✓"; fb.className = "feedback good";
      answerEls().forEach((x) => x.classList.add("good"));
    } else {
      if (!state.missed.includes(p.key)) state.missed.push(p.key);
      fb.replaceChildren(...mathNodes(`${p.text} = ${p.answer}`));
      if (note) fb.append(el("span", { class: "fb-note", text: note }));
      fb.className = "feedback miss";
      answerEls().forEach((x) => x.classList.add("miss"));
    }
    // fractions: go back to the first box now, inside the key event, so phones keep the keyboard up
    if (fracKind() && state.slot !== firstSlot(state.kind)) moveTo(firstSlot(state.kind));
    // if the next problem needs a different box (fraction <-> mixed number, or a missed-questions round
    // mixing whole numbers, fractions and decimals), switch now, inside the key event
    if (state.clock === "timed" || state.attempts < state.roundCount) {
      state.pending = state.source.next();
      if (state.pending && kindOfProblem(state.pending) !== state.kind) {
        switchKind(kindOfProblem(state.pending));
        swapping(true); // the new boxes stay invisible until their problem shows (the reveal is for the old one)
      }
    }
    $("tally").textContent = state.clock === "timed" ? `${state.correct} correct` : "";
    if (state.clock !== "timed") $("timeText").textContent = `${state.attempts}/${state.roundCount}`;
    setTimeout(() => {
      answerEls().forEach((x) => x.classList.remove("good", "miss"));
      if (ok) { fb.textContent = ""; fb.className = "feedback"; }
      if (!state.running) return;
      if (state.clock !== "timed" && state.attempts >= state.roundCount) return endRound();
      state.locked = false;
      nextProblem();
    }, ok ? 120 : 900);
  }

  function endRound() {
    state.running = false; state.locked = true;
    cancelAnimationFrame(state.raf);
    document.body.classList.remove("low-time");
    Store.saveFacts();
    const durationMs = Math.round(performance.now() - state.startAt);
    const r = { mode: bm(), op: state.mode, numbers: state.numbers, missedRound: state.clock === "missed" ? state.missedScope : null, level: state.level, score: state.correct, attempts: state.attempts, missed: state.missed.slice(), durationMs, scored: scored() };
    r.prevBest = r.scored && r.attempts > 0 ? Store.recordRound(r.mode, r.level, r) : Store.best(r.mode, r.level);
    state.lastRound = r;
    showResults(r); // focuses the initials box (keeping the phone keyboard up) when the score places
    blurAnswer();
  }

  function quitRound() {
    clearTimeout(state.countdown);
    state.running = false; state.locked = true;
    cancelAnimationFrame(state.raf);
    document.body.classList.remove("low-time");
    Store.saveFacts();
    blurAnswer();
    show("home"); syncSetup();
  }

  // ---------- results ----------
  function showResults(r) {
    show("results");
    const tag = r.scored ? "1 minute" : r.missedRound ? "missed questions" : state.table ? `${state.table}s table practice` : "practice";
    $("resMode").textContent = r.missedRound === "all" ? "All my missed questions" : `${labelFor(r.op, r.numbers)} · Level ${r.level} · ${tag}`;
    $("resScore").textContent = String(r.score);
    const acc = r.attempts ? Math.round((100 * r.score) / r.attempts) : 0;
    $("resDetail").textContent = r.attempts ? `${r.attempts} answered · ${acc}% accurate` : "No answers this time.";
    let line = "";
    if (r.scored && r.attempts) {
      if (r.prevBest === 0) line = "First round at this level. That's your starting point.";
      else if (r.score > r.prevBest) line = `${r.score - r.prevBest} more than your previous best (${r.prevBest}).`;
      else if (r.score === r.prevBest) line = `Matched your best (${r.prevBest}).`;
      else line = `Your best is ${r.prevBest}. Every round counts as practice.`;
    }
    const left = missedItems(r.missedRound || "here").length;
    if (r.missedRound) line = left ? `${plural(left, "missed question")} still to clear. Get each one right ${Store.MISSED_CLEAR} times in a row.` : "All cleared! Nothing left to redo here.";
    $("resBest").textContent = line;
    $("redoBtn").hidden = !left || !!r.missedRound; // (in a missed round, "Go again" already redoes them)
    $("redoBtn").textContent = `Redo my misses (${left})`;
    const spark = $("resSpark"); spark.replaceChildren();
    if (r.scored) { const h = Store.history(r.mode, r.level).slice(-10).map((x) => x.score); spark.append(sparkline(h, Store.best(r.mode, r.level))); }
    const m = $("resMissed"); m.replaceChildren();
    if (r.missed.length) {
      m.append(el("p", { class: "small" }, "Worth another look: ", ...r.missed.slice(0, 12).map((k) => {
        const p = P.parseKey(k);
        return el("span", { class: "chip" }, ...mathNodes(p ? `${p.text} = ${p.answer}` : k));
      })));
    }
    $("printMissedBtn").hidden = !r.missed.length;
    if (!maybeOfferHof(r)) $("againBtn").focus();
  }

  // ---------- arcade initials ----------
  const initialsInput = () => $("initialsInput");
  function renderSlots() {
    const v = initialsInput().value;
    const focused = document.activeElement === initialsInput();
    document.querySelectorAll("#initialsBox .slot").forEach((slot, i) => {
      slot.textContent = v[i] || "";
      slot.classList.toggle("filled", !!v[i]);
      slot.classList.toggle("active", focused && i === Math.min(v.length, 2) && !(v.length === 3 && i !== 2));
    });
  }
  function rankFor(board, score) { return board.filter((b) => b.score >= score).length + 1; }

  function maybeOfferHof(r) {
    const box = $("hofOffer"); box.hidden = true; $("hofMsg").textContent = ""; $("hofMsg").className = "init-msg";
    state.offerFor = null;
    if (!Scores.hasBoard(r.mode) || Scores.readOnly || !r.scored || r.score <= 0) return false;
    const decide = (board) => {
      if (state.lastRound !== r || !Scores.qualifies(board, r.score)) return false;
      state.offerFor = r;
      $("initRank").textContent = `You're #${rankFor(board, r.score)} for ${labelFor(r.op, r.numbers)}, Level ${r.level}. Enter your initials`;
      const i = initialsInput();
      i.value = Store.initials();
      i.disabled = false; $("hofAdd").disabled = false; $("hofSkip").disabled = false;
      box.hidden = false;
      i.focus({ preventScroll: true });
      i.select();
      renderSlots();
      box.scrollIntoView({ block: "nearest" });
      return true;
    };
    if (state.hofBoard) return decide(state.hofBoard);
    // board wasn't loaded yet: fetch it, then prompt (tap the boxes to bring up the keyboard)
    Scores.top(r.mode, r.level, 10).then((rows) => { state.hofBoard = rows; decide(rows); }).catch(() => {});
    return false;
  }

  function closeOffer() {
    $("hofOffer").hidden = true; state.offerFor = null;
    initialsInput().blur();
    $("againBtn").focus();
  }

  async function submitHof() {
    const r = state.offerFor; if (!r) return;
    const v = Scores.cleanInitials(initialsInput().value);
    const msg = $("hofMsg");
    if (v.length !== 3) { msg.textContent = "Enter 3 letters."; msg.className = "init-msg warn"; initialsInput().focus(); return; }
    if (!Scores.initialsOk(v)) { msg.textContent = "Those initials aren't allowed. Try different ones."; msg.className = "init-msg warn"; initialsInput().select(); return; }
    $("hofAdd").disabled = true; $("hofSkip").disabled = true; initialsInput().disabled = true;
    msg.textContent = "Saving…"; msg.className = "init-msg";
    try {
      await Scores.submit({ mode: r.mode, level: r.level, score: r.score, attempts: r.attempts, durationMs: r.durationMs, initials: v });
      Store.setInitials(v);
      msg.textContent = `Saved! ${v} is on the Hall of Fame.`; msg.className = "init-msg ok";
      state.offerFor = null;
      loadHof();
      setTimeout(() => { if (!state.offerFor) { $("hofOffer").hidden = true; if (document.body.dataset.view === "results") $("againBtn").focus(); } }, 1400);
    } catch (e) {
      const m = String(e && e.message || "");
      if (/top-10/.test(m)) msg.textContent = "Someone just beat that score, so it didn't make the top 10 this time.";
      else if (/initials/.test(m)) { msg.textContent = "Those initials aren't allowed. Try different ones."; initialsInput().disabled = false; $("hofAdd").disabled = false; $("hofSkip").disabled = false; initialsInput().focus(); initialsInput().select(); msg.className = "init-msg warn"; return; }
      else msg.textContent = "Couldn't save right now. Your score is still saved on this device.";
      msg.className = "init-msg warn";
      $("hofAdd").disabled = false; $("hofSkip").disabled = false; initialsInput().disabled = false;
    }
  }

  // ---------- printable worksheet ----------
  function buildSheet(problems, title) {
    const sheet = $("sheet"); sheet.replaceChildren();
    const page = (heading, withAnswers) => {
      const pg = el("div", { class: "page" });
      pg.append(el("div", { class: "sheet-head" },
        el("h1", { text: heading }),
        el("p", { text: withAnswers ? "Answer key" : "Name ____________________   Date __________   Correct ____ / " + problems.length }),
        ...(problems.some((p) => p.kind === "frac") && !withAnswers ? [el("p", { class: "sheet-note", text: problems.some((p) => p.mixed) ? "Write each answer in simplest form, like 3 1/2 (not 7/2)." : "Write each answer in simplest form." })] : [])));
      const grid = el("ol", { class: "sheet-grid" + (problems.some((p) => p.kind === "frac") ? " fracs" : "") });
      problems.forEach((p) => grid.append(el("li", {}, el("span", {}, ...mathNodes(`${p.text} =`), " "), el("span", { class: "blank" }, ...(withAnswers ? mathNodes(String(p.answer)) : [])))));
      pg.append(grid, el("p", { class: "sheet-foot", text: "oneminmath.com · try it in one minute" }));
      return pg;
    };
    sheet.append(page(title, false), page(title, true));
  }
  function printSheet(fromMissed) {
    let problems = [];
    if (fromMissed && state.lastRound && state.lastRound.missed.length) {
      const base = state.lastRound.missed.map((k) => P.parseKey(k)).filter(Boolean);
      const lr = state.lastRound;
      const src = createSource({ mode: lr.op, level: lr.level, numbers: lr.numbers, weakKeys: lr.missed });
      while (problems.length < 40) problems.push(problems.length % 2 === 0 && base.length ? base[(problems.length / 2) % base.length] : src.next());
      buildSheet(problems, `Practice sheet: ${labelFor(lr.op, lr.numbers)}, Level ${lr.level}`);
    } else {
      const src = createSource({ mode: state.mode, level: state.level, numbers: state.numbers, table: state.table });
      const n = state.numbers === "frac" ? 40 : 60; // stacked fractions need more room on the page
      for (let i = 0; i < n; i++) problems.push(src.next());
      buildSheet(problems, `${labelFor(state.mode, state.numbers)}, Level ${state.level}${state.table ? ` (${state.table}s)` : ""}: ${P.levelText(state.mode, state.level, state.numbers)}`);
    }
    window.print();
  }

  // ---------- wiring ----------
  function wire() {
    $("opTiles").addEventListener("click", (e) => { const b = e.target.closest(".tile"); if (b) { state.mode = b.dataset.mode; syncSetup(); } });
    $("lvlTiles").addEventListener("click", (e) => { const b = e.target.closest(".level"); if (b) { state.level = +b.dataset.level; syncSetup(); } });
    $("numSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.numbers = b.dataset.numbers; syncSetup(); } });
    $("clockSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.clock = b.dataset.clock; syncSetup(); } });
    const sel = $("tableSelect");
    for (let t = 2; t <= 12; t++) sel.append(el("option", { value: String(t), text: `${t}s` }));
    sel.addEventListener("change", () => { state.table = sel.value ? +sel.value : null; syncSetup(); });
    $("startBtn").addEventListener("click", startRound);
    $("redoBtn").addEventListener("click", () => { state.clock = "missed"; state.missedScope = "here"; state.table = null; startRound(); });
    $("scopeSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.missedScope = b.dataset.scope; syncSetup(); } });
    $("againBtn").addEventListener("click", startRound);
    $("menuBtn").addEventListener("click", () => { show("home"); syncSetup(); });
    $("quitBtn").addEventListener("click", quitRound);
    const ai = input();
    ai.addEventListener("input", onInput);
    ai.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitEnter(); }
      else if (e.key === "Escape") { e.preventDefault(); quitRound(); }
    });
    for (const [box, which] of [[wholeBox(), "whole"], [numBox(), "num"], [denBox(), "den"]]) {
      box.addEventListener("input", () => onFracInput(which));
      box.addEventListener("focus", () => { state.slot = which; });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); submitEnter(); }
        else if (e.key === "Escape") { e.preventDefault(); quitRound(); }
        else if (which === "whole" && (e.key === " " || e.key === "ArrowRight" || e.key === "/")) { e.preventDefault(); if (!state.locked) moveTo("num"); }
        else if (which === "num" && state.kind === "mix" && (e.key === "ArrowLeft" || (e.key === "Backspace" && !box.value))) { e.preventDefault(); moveTo("whole"); }
        else if (which === "num" && (e.key === "/" || e.key === "ArrowDown")) { e.preventDefault(); if (!state.locked) moveTo("den"); }
        else if (which === "den" && (e.key === "ArrowUp" || (e.key === "Backspace" && !box.value))) { e.preventDefault(); moveTo("num"); }
        else if (which === "den" && e.key === "/") e.preventDefault();
      });
    }
    // keep the box focused for the whole round
    for (const box of [ai, numBox(), denBox(), wholeBox()]) {
      box.addEventListener("blur", () => { if (document.body.dataset.view === "play") setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) focusInput(); }, 0); });
    }
    $("play").addEventListener("click", (e) => { if (!e.target.closest("button") && !isAnswerEl(e.target)) focusInput(); });
    // keep problem + box above the phone keyboard
    const vv = window.visualViewport;
    const fit = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
      if (document.body.dataset.view === "play") window.scrollTo(0, 0);
    };
    if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
    window.addEventListener("resize", fit);
    fit();
    const ii = initialsInput();
    ii.addEventListener("input", () => {
      const v = Scores.cleanInitials(ii.value);
      if (ii.value !== v) ii.value = v;
      $("hofMsg").textContent = ""; $("hofMsg").className = "init-msg";
      renderSlots();
    });
    ii.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submitHof(); }
      else if (e.key === "Escape") { e.preventDefault(); closeOffer(); }
    });
    ii.addEventListener("focus", renderSlots);
    ii.addEventListener("blur", () => setTimeout(renderSlots, 0));
    ["keyup", "click", "select"].forEach((ev) => ii.addEventListener(ev, () => { const n = ii.value.length; if (ii.selectionStart !== ii.selectionEnd && ii.selectionEnd - ii.selectionStart < n) ii.setSelectionRange(n, n); }));
    $("initialsBox").addEventListener("click", () => { ii.focus(); });
    $("hofAdd").addEventListener("click", submitHof);
    $("hofSkip").addEventListener("click", closeOffer);
    $("printNav").addEventListener("click", () => printSheet(false));
    $("printMissedBtn").addEventListener("click", () => printSheet(true));
    $("resetBtn").addEventListener("click", () => {
      if (window.confirm("Clear all your bests and history on this device?")) { Store.resetAll(); syncSetup(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const view = document.body.dataset.view;
      if (view === "play") {
        if (isAnswerEl(e.target)) return; // handled by the box itself
        if (e.key === "Escape") { e.preventDefault(); quitRound(); }
        else if (/^[\d.,]$/.test(e.key) || e.key === "Backspace" || e.key === "Enter") focusInput();
      } else if (e.key === "Enter" && (e.target === document.body || e.target === document.documentElement)) {
        e.preventDefault();
        if (view === "results" && !$("hofOffer").hidden) initialsInput().focus();
        else startRound();
      }
    });
  }

  // Optional presets from the address, e.g. ?op=multiply&level=2&numbers=frac&clock=practice&table=7
  // (used by the guide pages). Anything unknown is ignored, so a bad link just opens the normal setup.
  function applyPreset() {
    let q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return; }
    const op = { add: "add", subtract: "subtract", multiply: "multiply", divide: "divide", mixed: "smarty", smarty: "smarty" }[q.get("op")];
    if (op) state.mode = op;
    const lvl = +q.get("level");
    if (lvl === 1 || lvl === 2 || lvl === 3) state.level = lvl;
    const num = { whole: "whole", frac: "frac", fractions: "frac", dec: "dec", decimals: "dec" }[q.get("numbers")];
    if (num) state.numbers = num;
    if (q.get("clock") === "practice" || q.get("clock") === "timed") state.clock = q.get("clock");
    const t = +q.get("table");
    if (state.numbers === "whole" && (state.mode === "multiply" || state.mode === "divide") && t >= 2 && t <= 12 && Number.isInteger(t)) {
      state.table = t; $("tableSelect").value = String(t);
    }
  }

  wire();
  show("home");
  applyPreset();
  syncSetup();
  window.OMM.App = { state, endRound }; // exposed for testing
})();
