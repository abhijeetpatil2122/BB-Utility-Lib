/*
 * UtilityLib v19 — Final (Mode A: always re-check on mcCheck)
 * - Sequential checks (MCL-style)
 * - isMember() forces fresh mcCheck unless cached false
 * - Raw Telegram statuses in tg_status
 * - source: "fresh" | "cached"
 * - Callbacks always receive full payload
 */

/* ---------- Constants ---------- */
const PANEL_NAME = "UtilityMembershipPanel_v19";
const PREFIX = "UtilityMC_";
const SESS_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds between each sequential check

/* ---------- Admin panel ---------- */
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

  AdminPanel.setPanel({ panel_name: PANEL_NAME, data: panel });
  Bot.sendMessage("Membership Checker v19 panel created.");
}

/* ---------- Panel helpers ---------- */
function _panel() { return AdminPanel.getPanelValues(PANEL_NAME) || {}; }

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
    const eq = item.indexOf("=");
    if (eq === -1) { out[item.trim()] = null; return; }
    const id = item.slice(0, eq).trim();
    const link = item.slice(eq + 1).trim();
    out[id] = link || null;
  });
  return out;
}

/* Return array of channel ids (public usernames + private ids) */
function mcGetChats() {
  return _parsePublic().concat(Object.keys(_parsePrivateMap())).slice(0, MAX_CH);
}

/* ---------- Persistent states (per-user) ---------- */
function _getStates() { return User.getProperty(STATES_KEY) || {}; } // { "<chat>": true|false }
function _saveStates(obj) { User.setProperty(STATES_KEY, obj, "json"); }

/* ---------- Build payload from results map ----------
   resultsMap: { "<chat>": { ok:bool, tg_status: string|null, api_error:null|object, source:"fresh"|"cached" } }
------------------------------------------------------*/
function _buildPayloadFromResults(resultsMap) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
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

/* Convenience: returns missing list based on cached states (enriched) */
function mcGetMissing() {
  const states = _getStates();
  const map = {};
  Object.keys(states).forEach(ch => {
    map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" };
  });
  return _buildPayloadFromResults(map).missing;
}

/* ---------- isMember() — hybrid strict ----------
   - If any cached false -> run fail callback with cached payload and return false
   - Otherwise -> force mcCheck({ forced: true }) and return false
   - Never return true unless a fresh check has just finished successfully
---------------------------------------------------*/
function isMember() {
  const panel = _panel();
  const channels = mcGetChats();
  if (channels.length === 0) { Bot.sendMessage("❌ No channels configured in panel."); return false; }

  const states = _getStates();
  // If any cached false -> immediate fail (fast)
  const cachedMissing = channels.filter(ch => states[ch] === false);
  if (cachedMissing.length > 0) {
    if (panel.failCallback) {
      const map = {};
      channels.forEach(ch => { map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" }; });
      const payload = _buildPayloadFromResults(map);
      payload.passed = {}; payload.forced = false;
      try { Bot.run({ command: panel.failCallback, options: payload }); } catch (e) { throw new Error("UtilityLib v19: isMember fail callback run error: " + (e && e.message)); }
    }
    return false;
  }

  // otherwise force fresh check (never assume cached true)
  mcCheck({ forced: true });
  return false;
}

/* ---------- mcCheck(passedOptions) ----------
   Mode A: Always re-check ALL channels sequentially (no skipping).
   Creates session and starts sequential check.
-----------------------------------------------*/
function mcCheck(passedOptions) {
  const panel = _panel();
  const allChats = mcGetChats();

  if (!panel.successCallback || !panel.failCallback) {
    throw new Error("UtilityLib v19: please set successCallback and failCallback in Admin Panel");
  }

  if (allChats.length === 0) {
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return;
  }

  // Session: will check all chats (Mode A)
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const session = {
    token: token,
    allChats: allChats,    // all channel ids to check
    index: 0,              // current index
    results: {},           // results map populated per-channel
    passed: passedOptions || {}
  };
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SESS_KEY, session, "json");

  // schedule first sequential check
  try {
    Bot.run({ command: PREFIX + "checkNext", run_after: 0.01, options: { token: token } });
  } catch (e) {
    throw new Error("UtilityLib v19: failed to schedule checks: " + (e && e.message));
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
    throw new Error("UtilityLib v19: checkNext failed: " + (e && e.message));
  }
}
on(PREFIX + "checkNext", UtilityMC_checkNext);

/* ---------- API result handler ---------- */
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SESS_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const tg_status = options.result?.status || null; // raw TG status
    const ok = ["member", "administrator", "creator"].includes(tg_status);

    sess.results[ch] = { ok: !!ok, tg_status: tg_status, api_error: null, source: "fresh" };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SESS_KEY, sess, "json");

    if (sess.index < (sess.allChats || []).length) {
      Bot.run({ command: PREFIX + "checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finalizeSession();
    }
  } catch (e) {
    throw new Error("UtilityLib v19: onOne error: " + (e && e.message));
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
    throw new Error("UtilityLib v19: onErr error: " + (e && e.message));
  }
}
on(PREFIX + "onErr", UtilityMC_onErr);

/* ---------- Finalize session: merge results, persist safe states, call callbacks ---------- */
function _finalizeSession() {
  const sess = User.getProperty(SESS_KEY);
  if (!sess) return;
  const panel = _panel();

  // Build merged map: prefer fresh results from sess.results; no fallback to cached here
  const merged = {};
  (sess.allChats || []).forEach(ch => {
    if (sess.results && sess.results[ch]) merged[ch] = sess.results[ch];
    else merged[ch] = { ok: false, tg_status: null, api_error: null, source: "fresh" }; // shouldn't happen
  });

  const core = _buildPayloadFromResults(merged);
  core.passed = sess.passed || {};
  core.forced = !!(sess.passed && sess.passed.forced);

  // status resolution
  let status = "ok";
  if (core.errors && core.errors.length > 0) status = "error";
  else if (core.missing && core.missing.length > 0) status = "missing";
  core.status = status;

  // persist definitive states (no api_error)
  const persistent = _getStates();
  Object.keys(merged).forEach(ch => {
    const r = merged[ch];
    if (r.api_error) return; // do not overwrite persistent when api error occurred
    persistent[ch] = !!r.ok;
  });
  _saveStates(persistent);

  // clear session
  User.setProperty(SESS_KEY, null);

  // call appropriate callback
  try {
    if (status === "ok") Bot.run({ command: panel.successCallback, options: core });
    else Bot.run({ command: panel.failCallback, options: core });
  } catch (e) {
    throw new Error("UtilityLib v19: callback run failed: " + (e && e.message));
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
