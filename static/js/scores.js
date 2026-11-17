// Hall of Fame: Supabase via its REST API (no extra library needed).
// Reads are public; writes go only through the submit_score() database function.
(function () {
  "use strict";
  const cfg = window.OMM_CONFIG || {};
  const url = (cfg.SUPABASE_URL || "").replace(/\/$/, "");
  const key = cfg.SUPABASE_ANON_KEY || "";
  const configured = /^https:\/\/.+/.test(url) && !/YOUR-PROJECT-REF/.test(url) && key && !/YOUR-SUPABASE/.test(key);
  // Fractions/Decimals boards need migration_fractions_decimals.sql in the database first; until
  // NEW_MODE_BOARDS is true those modes still play, they just have no Hall of Fame.
  const NEW_MODES = ["fractions", "decimals"];
  const hasBoard = (mode) => !!configured && (!NEW_MODES.includes(mode) || cfg.NEW_MODE_BOARDS === true);
  // READ_ONLY (used by the preview copy): show the boards, never submit.
  const readOnly = cfg.READ_ONLY === true;

  // Arcade initials: exactly 3 letters A–Z, minus a blocklist.
  // Must match public.initials_ok() in supabase.sql / migration_initials.sql (the database enforces it too).
  const BLOCKED = new Set(("ANL,ANS,ASS,AZZ,BBW,BJB,BJS,BUM,BUT,CNT,COC,COK,CRP,CUC,CUK,CUM,CUN,DCK,DIC,DIE,DIK,DMN,DTF,FAG,FAK,FAP,FCK,FFS,FGT,FKN,FKU,FUC,FUG,FUK,FUQ,GAY,GDM,GOK,GUN,HIV,HOE,HOR,JEW,JIZ,JZZ,KIL,KKK,KLL,KNT,KOK,KYK,KYS,LMF,LSD,MLF,NAZ,NGA,NGR,NIG,NSF,PEE,PIS,PMS,PNS,POO,PRN,PSS,PUS,RAP,RET,RPE,RTD,SEX,SHT,SLT,SLU,SPC,SPK,STD,SUC,SUK,SXY,THC,TIT,TRD,TTS,TWT,VAG,WNK,WOG,WTF,XXX").split(","));
  const cleanInitials = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const initialsOk = (s) => /^[A-Z]{3}$/.test(s) && !BLOCKED.has(s);
  // Would this score place in the top 10? Ties go to the earlier score, so it must beat the 10th.
  const qualifies = (board, score) => score > 0 && (board.length < 10 || score > board[board.length - 1].score);

  // New-style publishable keys (sb_publishable_…) are not JWTs, so send them only in the apikey header.
  // Legacy JWT anon keys (eyJ…) also work with an Authorization header.
  const headers = () => (key.startsWith("eyJ")
    ? { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    : { apikey: key, "Content-Type": "application/json" });

  async function withTimeout(p, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try { return await p(ctrl.signal); } finally { clearTimeout(t); }
  }

  const Scores = {
    configured,
    hasBoard,
    readOnly,
    cleanInitials,
    initialsOk,
    qualifies,
    async top(mode, level, limit = 10) {
      if (!configured) throw new Error("offline");
      const q = `${url}/rest/v1/scores?select=initials,score,created_at&mode=eq.${encodeURIComponent(mode)}&difficulty=eq.${level}&score=gt.0&order=score.desc,created_at.asc&limit=${limit}`;
      const res = await withTimeout((signal) => fetch(q, { headers: headers(), signal }));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async submit({ mode, level, score, attempts, durationMs, initials }) {
      if (!configured) throw new Error("offline");
      if (readOnly || !hasBoard(mode)) throw new Error("read-only");
      const res = await withTimeout((signal) => fetch(`${url}/rest/v1/rpc/submit_score`, {
        method: "POST", headers: headers(), signal,
        body: JSON.stringify({ p_mode: mode, p_difficulty: level, p_score: score, p_attempts: attempts, p_duration_ms: durationMs, p_initials: initials })
      }));
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j && j.message) msg = j.message; } catch (e) { /* not JSON */ }
        throw new Error(msg);
      }
      return true;
    }
  };
  window.OMM = window.OMM || {};
  window.OMM.Scores = Scores;
})();
