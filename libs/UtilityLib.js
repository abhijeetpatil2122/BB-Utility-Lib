/*
 * UtilityLib v19.1 — Robust final
 * - Mode A (always re-check on mcCheck)
 * - Sequential checks, raw tg_status, source field
 * - Flexible AdminPanel discovery + normalized fields
 * - Publish: mcSetup, mcCheck, isMember, mcGetChats, mcGetMissing
 */

const PANEL_CANDIDATES = [
  "UtilityMembershipPanel_v19",
  "UtilityMembershipPanel",
  "UtilityMembershipChecker",
  "SimpleMembershipPanel_v18",
  "SimpleMembershipPanel_v19",
  "SimpleMembershipPanel"
];

const PREFIX = "UtilityMC_";
const SESS_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds between sequential checks

/* ---------------- Admin panel creation (single canonical) ---------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker v19",
    description: "Public usernames + private id=link mapping, callbacks",
    icon: "person-add",
    fields: [
      { name: "publicChannels", title: "Public Channels (usernames)", type: "string", placeholder: "@ParadoxBackup, @Other", icon: "globe" },
      { name: "privateChannels", title: "Private Channels (id=link)", type: "string", placeholder: "-100123=https://t.me/+invite", icon: "lock-closed" },
      { name: "successCallback", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
      { name: "failCallback", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" }
    ]
  };

  // create canonical panel name (first in candidates)
  AdminPanel.setPanel({ panel_name: PANEL_CANDIDATES[0], data: panel });
  Bot.sendMessage("Membership Checker panel installed as: " + PANEL_CANDIDATES[0] + "\nNow open Admin Panel > " + PANEL_CANDIDATES[0] + " and fill fields.");
}

/* ---------------- Utility: find and normalize admin panel values ---------------- */
function _findPanelRaw() {
  for (let i = 0; i < PANEL_CANDIDATES.length; i++) {
    try {
      const v = AdminPanel.getPanelValues(PANEL_CANDIDATES[i]);
      if (v && Object.keys(v).length > 0) {
        v.__panel_name = PANEL_CANDIDATES[i];
        return v;
      }
    } catch (e) {
      // ignore and continue
    }
  }
  return null;
}

function _normalizePanel() {
  // try to find panel under different names and normalize keys
  const raw = _findPanelRaw();
  if (!raw) return null;

  const map = (k1, k2) => (raw[k1] !== undefined ? raw[k1] : (raw[k2] !== undefined ? raw[k2] : null));

  return {
    panel_name: raw.__panel_name || null,
    publicChannels: map("publicChannels", "public_channels"),
    privateChannels: map("privateChannels", "private_channels"),
    successCallback: map("successCallback", "success_callback"),
    failCallback: map("failCallback", "fail_callback"),
    __raw: raw
  };
}

/* ---------------- Channel parsing helpers ---------------- */
function _parsePublicFromPanel(panel) {
  if (!panel || !panel.publicChannels) return [];
  return panel.publicChannels.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_CH);
}

function _parsePrivateMapFromPanel(panel) {
  const res = {};
  if (!panel || !panel.privateChannels) return res;
  panel.privateChannels.split(",").map(s => s.trim()).filter(Boolean).forEach(item => {
    const eq = item.indexOf("=");
    if (eq === -1) { res[item.trim()] = null; return; }
    const id = item.slice(0, eq).trim();
    const link = item.slice(eq + 1).trim();
    res[id] = link || null;
  });
  return res;
}

/* ---------------- Public API helpers ---------------- */
function _getPanelNormalizedOrThrow() {
  const panel = _normalizePanel();
  if (!panel) {
    throw new Error("MembershipChecker: Admin Panel not found. Run /setupMC and configure the panel.");
  }
  return panel;
}

function mcGetChats() {
  const panel = _normalizePanel();
  if (!panel) return [];
  const pub = _parsePublicFromPanel(panel);
  const priv = Object.keys(_parsePrivateMapFromPanel(panel));
  return pub.concat(priv).slice(0, MAX_CH);
}

/* ---------------- Persisted states ---------------- */
function _getStates() { return User.getProperty(STATES_KEY) || {}; }
function _saveStates(obj) { User.setProperty(STATES_KEY, obj, "json"); }

/* ---------------- Build payload from results ----------------
   resultsMap: { "<chat>": { ok:bool, tg_status: string|null, api_error:null|object, source: "fresh"|"cached" } }
----------------------------------------------------------------*/
function _buildPayloadFromResults(resultsMap) {
  const panel = _normalizePanel();
  if (!panel) return { joined: [], missing: [], errors: [], multiple: false }; // defensive
  const pub = _parsePublicFromPanel(panel);
  const priv = _parsePrivateMapFromPanel(panel);
  const chats = mcGetChats();
  const joined = [], missing = [], errors = [];

  chats.forEach(ch => {
    const r = resultsMap[ch] || { ok: false, tg_status: null, api_error: null, source: "cached" };
    const link = pub.includes(ch) ? "https://t.me/" + ch.replace(/^@/, "") : (priv[ch] || null);
    const item = { id: ch, join_link: link, tg_status: r.tg_status, source: r.source };

    if (r.api_error) {
      errors.push({ id: ch, join_link: link, api_error: r.api_error });
    } else if (r.ok) {
      joined.push(item);
    } else {
      missing.push(item);
    }
  });

  return { joined: joined, missing: missing, errors: errors, multiple: chats.length > 2 };
}

/* Convenience: get missing based on persistent states */
function mcGetMissing() {
  const states = _getStates();
  const map = {};
  Object.keys(states).forEach(ch => {
    map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" };
  });
  return _buildPayloadFromResults(map).missing;
}

/* ---------------- isMember() hybrid (Mode A logic) ----------------
 - If any cached false -> immediate fail callback and return false
 - Otherwise -> force a fresh mcCheck({ forced: true }) and return false
 - never returns true unless a fresh mcCheck succeeded and callback executed
------------------------------------------------------------------*/
function isMember() {
  const panel = _normalizePanel();
  if (!panel) { Bot.sendMessage("MembershipChecker: admin panel not found. Run /setupMC"); return false; }

  const channels = mcGetChats();
  if (channels.length === 0) { Bot.sendMessage("❌ No channels configured."); return false; }

  const states = _getStates();
  const cachedMissing = channels.filter(ch => states[ch] === false);

  if (cachedMissing.length > 0) {
    // fast fail using cached info
    if (panel.failCallback) {
      const map = {};
      channels.forEach(ch => { map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" }; });
      const payload = _buildPayloadFromResults(map);
      payload.passed = {}; payload.forced = false;
      try { Bot.run({ command: panel.failCallback, options: payload }); } catch (e) { throw new Error("MembershipChecker: isMember fail callback run error: " + (e && e.message)); }
    }
    return false;
  }

  // otherwise force fresh check and return false (developer must return)
  mcCheck({ forced: true });
  return false;
}

/* ---------------- mcCheck(passedOptions) Mode A - always recheck all channels ---------------- */
function mcCheck(passedOptions) {
  const panel = _normalizePanel();
  if (!panel) { throw new Error("MembershipChecker: Admin Panel not found. Run /setupMC"); }

  const allChats = mcGetChats();
  if (allChats.length === 0) { Bot.sendMessage("❌ No channels configured."); return; }

  if (!panel.successCallback || !panel.failCallback) {
    // don't throw blindly — provide clear instruction
    throw new Error("MembershipChecker: successCallback or failCallback is not set in Admin Panel. Open Admin Panel and fill callbacks.");
  }

  // Create fresh session to check ALL channels sequentially
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random()*9999);
  const session = {
    token: token,
    allChats: allChats.slice(), // copy
    index: 0,
    results: {}, // per-channel { ok, tg_status, api_error, source }
    passed: passedOptions || {}
  };
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SESS_KEY, session, "json");

  // schedule first sequential check
  try {
    Bot.run({ command: PREFIX + "checkNext", run_after: 0.01, options: { token: token } });
  } catch (e) {
    throw new Error("MembershipChecker: failed to schedule checks: " + (e && e.message));
  }
}

/* ---------- Sequential check step ---------- */
function UtilityMC_checkNext() {
  try {
    const opt = options || {};
    const token = opt.token;
    if (!token) return;
    const sess = User.getProperty(SESS_KEY);
    if (!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.allChats || [];
    if (idx >= list.length) {
      _finalizeSession();
      return;
    }

    const ch = list[idx];

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: PREFIX + "onOne",
      on_error: PREFIX + "onErr",
      bb_options: { token: token, channel: ch }
    });

  } catch (e) {
    throw new Error("MembershipChecker: checkNext failed: " + (e && e.message));
  }
}
on(PREFIX + "checkNext", UtilityMC_checkNext);

/* ---------- API success handler ---------- */
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SESS_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const tg_status = options.result?.status || null; // raw TG status
    const ok = ["member","administrator","creator"].includes(tg_status);

    sess.results[ch] = { ok: !!ok, tg_status: tg_status, api_error: null, source: "fresh" };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SESS_KEY, sess, "json");

    if (sess.index < (sess.allChats || []).length) {
      Bot.run({ command: PREFIX + "checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finalizeSession();
    }
  } catch (e) {
    throw new Error("MembershipChecker: onOne error: " + (e && e.message));
  }
}
on(PREFIX + "onOne", UtilityMC_onOne);

/* ---------- API error handler ---------- */
function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SESS_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const api_error = options || { message: "Unknown API error" };

    sess.results[ch] = { ok: false, tg_status: null, api_error: api_error, source: "fresh" };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SESS_KEY, sess, "json");

    if (sess.index < (sess.allChats || []).length) {
      Bot.run({ command: PREFIX + "checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finalizeSession();
    }
  } catch (e) {
    throw new Error("MembershipChecker: onErr error: " + (e && e.message));
  }
}
on(PREFIX + "onErr", UtilityMC_onErr);

/* ---------- Finalize: build payload, persist safe states, call callbacks ---------- */
function _finalizeSession() {
  const sess = User.getProperty(SESS_KEY);
  if (!sess) return;

  const merged = {};
  (sess.allChats || []).forEach(ch => {
    if (sess.results && sess.results[ch]) merged[ch] = sess.results[ch];
    else merged[ch] = { ok: false, tg_status: null, api_error: null, source: "fresh" };
  });

  const payload = _buildPayloadFromResults(merged);
  payload.passed = sess.passed || {};
  payload.forced = !!(sess.passed && sess.passed.forced);

  payload.status = (payload.errors && payload.errors.length > 0) ? "error" : (payload.missing && payload.missing.length > 0 ? "missing" : "ok");

  // persist states when no api_error
  const persistent = _getStates();
  Object.keys(merged).forEach(ch => {
    const r = merged[ch];
    if (r.api_error) return;
    persistent[ch] = !!r.ok;
  });
  _saveStates(persistent);

  // clear session
  User.setProperty(SESS_KEY, null);

  // call callback
  const panel = _normalizePanel();
  try {
    if (!panel) throw new Error("MembershipChecker: panel missing at finalize (unexpected).");
    if (payload.status === "ok") Bot.run({ command: panel.successCallback, options: payload });
    else Bot.run({ command: panel.failCallback, options: payload });
  } catch (e) {
    throw new Error("MembershipChecker: finalize callback run failed: " + (e && e.message));
  }
}

/* ---------- Export API ---------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});
