/*
 * UtilityLib v18.2 — Final stable
 * - Sequential, cached, raw tg_status, source field ("fresh"|"cached")
 * - Admin panel: SimpleMembershipPanel_v18
 * - Public API: mcSetup, mcCheck, isMember, mcGetChats, mcGetMissing
 */

const PANEL = "SimpleMembershipPanel_v18";
const PREFIX = "UtilityMC_";
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds between sequential checks

/* ---------------- Admin panel setup ---------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker v18.2",
    description: "Public usernames + private id=link mapping, callbacks",
    icon: "person-add",
    fields: [
      {
        name: "publicChannels",
        title: "Public Channels (usernames)",
        description: "Comma-separated, e.g. @ParadoxBackup",
        type: "string",
        placeholder: "@ParadoxBackup, @Other",
        icon: "globe"
      },
      {
        name: "privateChannels",
        title: "Private Channels (id=link)",
        description: "Comma-separated, e.g. -100123=https://t.me/+invite",
        type: "string",
        placeholder: "-100123=https://t.me/+invite",
        icon: "lock-closed"
      },
      {
        name: "successCallback",
        title: "Success Callback",
        type: "string",
        placeholder: "/menu",
        icon: "checkmark"
      },
      {
        name: "failCallback",
        title: "Fail Callback",
        type: "string",
        placeholder: "/start",
        icon: "warning"
      }
    ]
  };

  AdminPanel.setPanel({ panel_name: PANEL, data: panel });
  Bot.sendMessage("Membership Checker v18.2 panel created.");
}

function _panel() { return AdminPanel.getPanelValues(PANEL) || {}; }

/* ---------------- Parsers ---------------- */
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

function mcGetChats() {
  const pub = _parsePublic();
  const priv = Object.keys(_parsePrivateMap());
  return pub.concat(priv).slice(0, MAX_CH);
}

/* ---------------- State storage ---------------- */
function _getStates() { return User.getProperty(STATES_KEY) || {}; }
function _saveStates(obj) { User.setProperty(STATES_KEY, obj, "json"); }

/* ---------------- Build payload ---------------- */
/* resultsMap: { "<chat>": { ok:bool, tg_status: string|null, api_error: object|null, source: "fresh"|"cached" } } */
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

/* enriched missing helper */
function mcGetMissing() {
  const states = _getStates();
  const map = {};
  Object.keys(states).forEach(ch => {
    map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" };
  });
  return _buildPayloadFromResults(map).missing;
}

/* ---------------- safe fail wrapper ---------------- */
function _safeRunFail(payload) {
  const p = _panel();
  if (!p.failCallback) return;
  try { Bot.run({ command: p.failCallback, options: payload }); } catch (e) { throw new Error("UtilityLib v18.2: fail callback run error: " + (e && e.message)); }
}

/* ---------------- isMember (hybrid strict) ----------------
 - All cached true -> true
 - Any cached false -> call fail callback with cache payload and return false
 - Any unknown -> call mcCheck({forced: true}) and return false
----------------------------------------------------------------*/
function isMember() {
  const channels = mcGetChats();
  if (channels.length === 0) { Bot.sendMessage("❌ No channels configured in panel."); return false; }

  const states = _getStates();
  const panel = _panel();

  // unknowns? -> force fresh check
  const unknown = channels.filter(ch => (states[ch] === undefined));
  if (unknown.length > 0) {
    mcCheck({ forced: true });
    return false;
  }

  // any cached false? -> fail callback with cached payload
  const cachedMissing = channels.filter(ch => states[ch] !== true);
  if (cachedMissing.length > 0) {
    if (panel.failCallback) {
      const map = {};
      channels.forEach(ch => { map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" }; });
      const payload = _buildPayloadFromResults(map);
      payload.passed = {}; payload.forced = false;
      try { Bot.run({ command: panel.failCallback, options: payload }); } catch (e) { throw new Error("UtilityLib v18.2: isMember fail run error: " + (e && e.message)); }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck(passedOptions) ----------------
 - Check only channels that are not cached true (speed)
 - Sequential checking of must-check list
 - Builds session stored in USER session key
----------------------------------------------------------------*/
function mcCheck(passedOptions) {
  const panel = _panel();
  const allChats = mcGetChats();
  if (!panel.successCallback || !panel.failCallback) { throw new Error("Please set successCallback and failCallback in Admin Panel."); }
  if (allChats.length === 0) { Bot.sendMessage("❌ No channels configured in panel."); return; }

  const states = _getStates();
  const mustCheck = allChats.filter(ch => states[ch] !== true);

  // immediate success if nothing to check
  if (mustCheck.length === 0) {
    // build payload from cache
    const map = {};
    allChats.forEach(ch => { map[ch] = { ok: !!states[ch], tg_status: states[ch] ? "member" : "left", api_error: null, source: "cached" }; });
    const payload = _buildPayloadFromResults(map);
    payload.passed = passedOptions || {}; payload.passed.multiple = allChats.length > 2;
    payload.forced = !!(passedOptions && passedOptions.forced);
    try { Bot.run({ command: panel.successCallback, options: payload }); } catch (e) { throw new Error("UtilityLib v18.2: mcCheck immediate success run error: " + (e && e.message)); }
    return;
  }

  // create session
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const session = {
    token: token,
    allChats: allChats,
    toCheck: mustCheck,
    index: 0,
    results: {}, // per-channel result objects with ok,tg_status,api_error,source
    passed: passedOptions || {}
  };
  session.passed = session.passed || {};
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SES_KEY, session, "json");

  // schedule first check step
  try {
    Bot.run({ command: PREFIX + "checkNext", run_after: 0.01, options: { token: token } });
  } catch (e) {
    throw new Error("UtilityLib v18.2: mcCheck schedule failed: " + (e && e.message));
  }
}

/* ---------------- Sequential next check handler ---------------- */
function UtilityMC_checkNext() {
  try {
    const opts = options || {};
    const token = opts.token;
    if (!token) return;
    const sess = User.getProperty(SES_KEY);
    if (!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.toCheck || [];
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
    throw new Error("UtilityLib v18.2: checkNext failed: " + (e && e.message));
  }
}
on(PREFIX + "checkNext", UtilityMC_checkNext);

/* ---------------- Api success handler ---------------- */
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const tg_status = options.result?.status || null;
    const ok = ["member", "administrator", "creator"].includes(tg_status);

    sess.results[ch] = { ok: !!ok, tg_status: tg_status, api_error: null, source: "fresh" };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.toCheck || []).length) {
      Bot.run({ command: PREFIX + "checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finalizeSession();
    }
  } catch (e) {
    throw new Error("UtilityLib v18.2: onOne error: " + (e && e.message));
  }
}
on(PREFIX + "onOne", UtilityMC_onOne);

/* ---------------- Api error handler ---------------- */
function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;
    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const api_error = options || { message: "Unknown API error" };

    sess.results[ch] = { ok: false, tg_status: null, api_error: api_error, source: "fresh" };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.toCheck || []).length) {
      Bot.run({ command: PREFIX + "checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finalizeSession();
    }
  } catch (e) {
    throw new Error("UtilityLib v18.2: onErr error: " + (e && e.message));
  }
}
on(PREFIX + "onErr", UtilityMC_onErr);

/* ---------------- Finalize session: merge results, persist safe states, call callbacks ---------------- */
function _finalizeSession() {
  const sess = User.getProperty(SES_KEY);
  if (!sess) return;
  const panel = _panel();

  // Build merged results covering allChats
  const merged = {};
  (sess.allChats || []).forEach(ch => {
    if (sess.results && sess.results[ch]) merged[ch] = sess.results[ch];
    else {
      // fallback to cached state if exists, else unknown -> treat as not joined
      const cached = _getStates();
      if (cached[ch] === true) merged[ch] = { ok: true, tg_status: "member", api_error: null, source: "cached" };
      else if (cached[ch] === false) merged[ch] = { ok: false, tg_status: "left", api_error: null, source: "cached" };
      else merged[ch] = { ok: false, tg_status: null, api_error: null, source: "cached" };
    }
  });

  const payloadCore = _buildPayloadFromResults(merged);
  payloadCore.passed = sess.passed || {};
  payloadCore.forced = !!(sess.passed && sess.passed.forced);

  // set status
  let status = "ok";
  if (payloadCore.errors && payloadCore.errors.length > 0) status = "error";
  else if (payloadCore.missing && payloadCore.missing.length > 0) status = "missing";
  payloadCore.status = status;

  // persist safe states (do NOT overwrite when api_error present)
  const persistent = _getStates();
  Object.keys(merged).forEach(ch => {
    const r = merged[ch];
    if (r.api_error) return; // skip
    persistent[ch] = !!r.ok;
  });
  _saveStates(persistent);

  // clear session
  User.setProperty(SES_KEY, null);

  // call callback (success if ok else fail)
  try {
    if (status === "ok") Bot.run({ command: panel.successCallback, options: payloadCore });
    else Bot.run({ command: panel.failCallback, options: payloadCore });
  } catch (e) {
    throw new Error("UtilityLib v18.2: finalize callback run failed: " + (e && e.message));
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
