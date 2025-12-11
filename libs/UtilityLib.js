/*
 * UtilityLib v18.1 — Stable + Hybrid + Error reporting + cache-tagging
 *
 * Improvements:
 *  - cache results are tagged with tg_status = "cached"
 *  - per-channel result format is consistent
 *  - API errors are collected under errors[] and included in final payload
 *  - persistent states are NOT overwritten when an API error occurred
 *  - critical errors throw so they appear in BB Error tab
 *  - short comments and clean constants
 */

const PANEL = "SimpleMembershipPanel_v18";
const PREFIX = "UtilityMC_";
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;    // maximum channels allowed
const STAGGER = 0.1;  // seconds between sequential checks

/* ---------------- Admin panel setup ---------------- */
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Membership Checker v18.1",
      description: "Public usernames + Private id=link, callbacks, hybrid isMember",
      icon: "person-add",
      fields: [
        { name: "publicChannels", title: "Public Channels", type: "string", placeholder: "@ParadoxBackup, @Other", icon: "globe" },
        { name: "privateChannels", title: "Private Channels (id=link)", type: "string", placeholder: "-100id=https://t.me/+Invite", icon: "lock-closed" },
        { name: "successCallback", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
        { name: "failCallback", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" }
      ]
    }
  });
  Bot.sendMessage("Membership Checker v18.1 admin panel created.");
}

/* ---------------- Helpers: parse panel values ---------------- */
function _panel(){ return AdminPanel.getPanelValues(PANEL) || {} }

function _parsePublic() {
  const p = _panel();
  if (!p.publicChannels) return [];
  return p.publicChannels.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_CH);
}

function _parsePrivateMap() {
  const p = _panel();
  const out = {};
  if (!p.privateChannels) return out;
  p.privateChannels.split(",").map(s => s.trim()).filter(Boolean).forEach(item => {
    const idx = item.indexOf("=");
    if (idx === -1) { out[item.trim()] = null; return; }
    const id = item.slice(0, idx).trim();
    const link = item.slice(idx + 1).trim();
    out[id] = link || null;
  });
  return out;
}

/* Return full chat list (public usernames + private ids) */
function mcGetChats() {
  return [].concat(_parsePublic(), Object.keys(_parsePrivateMap())).slice(0, MAX_CH);
}

/* ---------------- Persistent per-user states ---------------- */
function _getStates(){ return User.getProperty(STATES_KEY) || {} }   // { "<chat>": true|false }
function _saveStates(obj){ User.setProperty(STATES_KEY, obj, "json") }

/* ---------------- Build payload from resultsMap ----------------
   resultsMap: { "<chat>": { ok: bool, tg_status: string|null, api_error: object|null } }
   returns: { joined:[], missing:[], errors:[], multiple: bool }
-----------------------------------------------------------------*/
function _buildPayloadFromResults(resultsMap) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();

  const joined = [], missing = [], errors = [];

  chats.forEach(ch => {
    const r = resultsMap[ch] || { ok: false, tg_status: null, api_error: null };
    const tg_status = r.tg_status || null;
    const api_error = r.api_error || null;
    const ok = !!r.ok;

    const join_link = pub.includes(ch) ? "https://t.me/" + ch.replace(/^@/, "") : (priv[ch] || null);
    const base = { id: ch, join_link: join_link, tg_status: tg_status };

    if (api_error) {
      errors.push({ id: ch, join_link: join_link, api_error: api_error });
    } else if (ok) {
      joined.push(base);
    } else {
      missing.push(base);
    }
  });

  return { joined: joined, missing: missing, errors: errors, multiple: chats.length > 2 };
}

/* Convenience: get enriched missing from persistent states */
function mcGetMissing() {
  const states = _getStates();
  if (!states || Object.keys(states).length === 0) return [];
  const resultsMap = {};
  Object.keys(states).forEach(ch => { resultsMap[ch] = { ok: !!states[ch], tg_status: "cached", api_error: null }; });
  return _buildPayloadFromResults(resultsMap).missing;
}

/* ---------------- safe fail runner (throws on critical failure) ---------------- */
function _safeFail(payload){
  const panel = _panel();
  if (!panel.failCallback) return;
  try {
    Bot.run({ command: panel.failCallback, options: payload });
  } catch (e) {
    // critical: surface to error tab
    throw new Error("UtilityLib v18.1: failCallback run failed: " + (e && e.message));
  }
}

/* ---------------- isMember (hybrid fixed) ----------------
   - if all cached true -> returns true immediately
   - if any cached false -> calls failCallback (with cache payload) and returns false
   - if any unknown (undefined) -> triggers mcCheck({forced:true}) and returns false
------------------------------------------------------------------*/
function isMember(customFail) {
  const chats = mcGetChats();
  const panel = _panel();
  const fail = customFail || panel.failCallback;

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in Admin Panel.");
    return false;
  }

  const states = _getStates();

  // unknown channels? need fresh check
  const unknown = chats.filter(ch => (states[ch] === undefined));
  if (unknown.length > 0) {
    mcCheck({ forced: true });
    return false;
  }

  // any cached false?
  const cachedMissing = chats.filter(ch => states[ch] !== true);
  if (cachedMissing.length > 0) {
    if (fail) {
      // build payload using cached states (tagged as cached)
      const resultsMap = {};
      chats.forEach(ch => { resultsMap[ch] = { ok: !!states[ch], tg_status: states[ch] === undefined ? null : "cached", api_error: null }; });
      const payloadCore = _buildPayloadFromResults(resultsMap);
      payloadCore.passed = {};
      payloadCore.forced = false;
      try { Bot.run({ command: fail, options: payloadCore }); } catch (e) { throw new Error("UtilityLib v18.1: isMember fail Bot.run failed: " + (e && e.message)); }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck(passedOptions)
   - speed: check only unknown or false channels (skip cache-true)
   - sequential: check one by one via UtilityMC_checkNext
----------------------------------------------------------------*/
function mcCheck(passedOptions) {
  const panel = _panel();
  const allChats = mcGetChats();
  if (allChats.length === 0) {
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const persistent = _getStates();
  const mustCheck = allChats.filter(ch => persistent[ch] !== true); // undefined or false

  // If nothing to check -> return success immediately (payload based on cache)
  if (mustCheck.length === 0) {
    const resultsMap = {};
    allChats.forEach(ch => { resultsMap[ch] = { ok: !!persistent[ch], tg_status: persistent[ch] === undefined ? null : "cached", api_error: null }; });
    const payloadCore = _buildPayloadFromResults(resultsMap);
    payloadCore.passed = passedOptions || {};
    payloadCore.passed.multiple = allChats.length > 2;
    payloadCore.forced = !!(passedOptions && passedOptions.forced);
    if (panel.successCallback) {
      try { Bot.run({ command: panel.successCallback, options: payloadCore }); } catch (e) { throw new Error("UtilityLib v18.1: mcCheck immediate success run failed: " + (e && e.message)); }
    }
    return;
  }

  // create session for mustCheck sequential processing
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const session = {
    token: token,
    allChats: allChats,
    chats: mustCheck, // sequential list
    index: 0,
    results: {},      // will be filled per channel as { ok, tg_status, api_error }
    passed: passedOptions || {}
  };
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SES_KEY, session, "json");

  // schedule first check
  try {
    Bot.run({ command: "UtilityMC_checkNext", run_after: 0.01, options: { token: token } });
  } catch (e) {
    throw new Error("UtilityLib v18.1: mcCheck schedule failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_checkNext ----------------
   sequentially check current session.chats[session.index]
----------------------------------------------------------------*/
function UtilityMC_checkNext() {
  try {
    const opts = options || {};
    const token = opts.token;
    if (!token) return;
    const sess = User.getProperty(SES_KEY);
    if (!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.chats || [];
    if (idx >= list.length) { _finish(); return; }

    const ch = list[idx];

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: "UtilityMC_onOne",
      on_error: "UtilityMC_onErr",
      bb_options: { token: token, channel: ch, index: idx }
    });

  } catch (e) {
    throw new Error("UtilityLib v18.1: UtilityMC_checkNext failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_onOne / UtilityMC_onErr ----------------
   Normalize results into session.results[ch] = { ok, tg_status, api_error }
----------------------------------------------------------------*/
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const tg_status = options.result?.status || null;
    const ok = ["member", "administrator", "creator"].includes(tg_status);

    sess.results[ch] = { ok: !!ok, tg_status: tg_status, api_error: null };
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.chats || []).length) {
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }

  } catch (e) { throw new Error("UtilityLib v18.1: UtilityMC_onOne error: " + (e && e.message)); }
}

function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    // options may contain varying error formats; capture raw object/string for debug
    const api_error = options && (options.error || options.error_description || options.description || options) || { message: "Unknown error" };

    sess.results[ch] = { ok: false, tg_status: null, api_error: api_error };
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.chats || []).length) {
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }

  } catch (e) { throw new Error("UtilityLib v18.1: UtilityMC_onErr error: " + (e && e.message)); }
}

/* ---------------- _finish: merge, persist safe states, call callbacks ---------------- */
function _finish() {
  const sess = User.getProperty(SES_KEY);
  if (!sess) return;
  const panel = _panel();

  // Merge results: include allChats; if a chat wasn't checked it's considered not-joined (ok=false)
  const merged = {};
  (sess.allChats || []).forEach(ch => {
    if (sess.results && sess.results[ch]) merged[ch] = sess.results[ch];
    else merged[ch] = { ok: false, tg_status: "cached", api_error: null };
  });

  const core = _buildPayloadFromResults(merged);
  core.passed = sess.passed || {};
  core.forced = !!(sess.passed && sess.passed.forced);

  // status: error > missing > ok
  let status = "ok";
  if (core.errors && core.errors.length > 0) status = "error";
  else if (core.missing && core.missing.length > 0) status = "missing";
  core.status = status;

  // Persist safe states. Do NOT overwrite when api_error present.
  const persistent = _getStates();
  Object.keys(merged).forEach(ch => {
    const r = merged[ch];
    if (r.api_error) {
      // keep existing persistent[ch] if any
      return;
    }
    persistent[ch] = !!r.ok;
  });
  _saveStates(persistent);

  // clear session
  User.setProperty(SES_KEY, null);

  // Callbacks: pass full payload to dev callbacks
  try {
    if (core.errors && core.errors.length > 0) {
      if (panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    } else if (core.missing && core.missing.length > 0) {
      if (panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    } else {
      if (panel.successCallback) Bot.run({ command: panel.successCallback, options: core });
    }
  } catch (e) {
    throw new Error("UtilityLib v18.1: _finish callback run failed: " + (e && e.message));
  }
}

/* ---------------- Export API ---------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

/* ---------------- Register handlers ---------------- */
on("UtilityMC_checkNext", UtilityMC_checkNext);
on("UtilityMC_onOne", UtilityMC_onOne);
on("UtilityMC_onErr", UtilityMC_onErr);
