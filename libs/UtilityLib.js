/*
 * UtilityLib v17 — FINAL FIXED RELEASE
 * - Sequential checks (MCL-style)
 * - Caching of per-user joined states (speeds repeat checks)
 * - mcCheck(passedOptions) supports optional passed data
 * - Callbacks ALWAYS receive full payload: { joined, missing, multiple, passed, forced }
 * - Safer error handling: critical errors are thrown so they appear in Error tab
 */

const PANEL = "SimpleMembershipPanel_v17";
const PREFIX = "UtilityMC_";
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds between sequential checks

/* ---------------- Admin Panel ---------------- */
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Membership Checker v17",
      description: "Public usernames + Private id=link mapping, callbacks",
      icon: "person-add",
      fields: [
        { name: "publicChannels", title: "Public Channels", type: "string", placeholder: "@ParadoxBackup, @Other", icon: "globe" },
        { name: "privateChannels", title: "Private Channels (id=link)", type: "string", placeholder: "-100id=https://t.me/+Invite", icon: "lock-closed" },
        { name: "successCallback", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
        { name: "failCallback", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" }
      ]
    }
  });
  Bot.sendMessage("Membership Checker v17 admin panel created.");
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
  return [].concat(_parsePublic(), Object.keys(_parsePrivateMap())).slice(0, MAX_CH);
}

/* ---------------- States (per-user) ---------------- */
function _getStates() { return User.getProperty(STATES_KEY) || {}; }
function _saveStates(obj) { User.setProperty(STATES_KEY, obj, "json"); }

/* ---------------- Payload builder ---------------- */
function _buildPayloadFromResults(results) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();
  const joined = [], missing = [];

  chats.forEach(ch => {
    const ok = results[ch] === true;
    const link = pub.includes(ch) ? "https://t.me/" + ch.replace(/^@/, "") : (priv[ch] || null);
    const it = { id: ch, join_link: link };
    if (ok) joined.push(it); else missing.push(it);
  });

  return { joined: joined, missing: missing, multiple: chats.length > 2 };
}

/* ---------------- helper: enriched missing for caller ---------------- */
function mcGetMissing() {
  const states = _getStates();
  const payload = _buildPayloadFromResults(states);
  return payload.missing;
}

/* ---------------- safe fail callback ---------------- */
function _safeFail(payload) {
  const p = _panel();
  if (!p.failCallback) return;
  try {
    Bot.run({ command: p.failCallback, options: payload });
  } catch (e) {
    // Critical: surface to Error tab for debugging
    throw new Error("UtilityLib: _safeFail Bot.run failed: " + (e && e.message));
  }
}

/* ---------------- isMember (hybrid) ----------------
   - If there are unknown channels -> force mcCheck() and return false
   - If cached states present -> return quickly
--------------------------------------------------*/
function isMember(customFail) {
  const chats = mcGetChats();
  const panel = _panel();
  const fail = customFail || panel.failCallback;

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in Admin Panel.");
    return false;
  }

  const states = _getStates();

  // unknown channels => force check
  const unknown = chats.filter(ch => (states[ch] === undefined));
  if (unknown.length > 0) {
    mcCheck({ forced: true });
    return false; // caller must return
  }

  // if any false -> fail
  const missing = chats.filter(ch => states[ch] !== true);
  if (missing.length > 0) {
    if (fail) {
      const payload = _buildPayloadFromResults(states);
      payload.passed = {};
      payload.forced = false;
      try { Bot.run({ command: fail, options: payload }); } catch (e) { throw new Error("UtilityLib: isMember fail Bot.run failed: " + (e && e.message)); }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck(passedOptions) ----------------
   * Speed: only check channels that are not already true in user states
   * Sequential: run checks one-by-one (UtilityMC_checkNext)
---------------------------------------------------------*/
function mcCheck(passedOptions) {
  const panel = _panel();
  const allChats = mcGetChats();
  if (allChats.length === 0) {
    Bot.sendMessage("❌ No channels configured in Admin Panel.");
    return;
  }

  const states = _getStates();

  // mustCheck = unknown or false
  const mustCheck = allChats.filter(ch => states[ch] !== true);

  // if nothing to check -> success immediately
  if (mustCheck.length === 0) {
    const payload = _buildPayloadFromResults(states);
    payload.passed = passedOptions || {};
    payload.passed.multiple = allChats.length > 2;
    payload.forced = !!(passedOptions && passedOptions.forced);
    // save states to be safe
    _saveStates(states);
    if (panel.successCallback) {
      try { Bot.run({ command: panel.successCallback, options: payload }); }
      catch (e) { throw new Error("UtilityLib: mcCheck immediate success Bot.run failed: " + (e && e.message)); }
    }
    return;
  }

  // create session with mustCheck
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const session = {
    token: token,
    allChats: allChats,
    chats: mustCheck,
    index: 0,
    results: Object.assign({}, states), // merge existing known
    passed: passedOptions || {}
  };
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SES_KEY, session, "json");

  // schedule first sequential check
  try {
    Bot.run({ command: "UtilityMC_checkNext", run_after: 0.01, options: { token: token } });
  } catch (e) {
    // critical: surface error
    throw new Error("UtilityLib: mcCheck scheduling checkNext failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_checkNext ----------------
   Runs api.getChatMember for session.chats[session.index]
   Uses sequential scheduling to avoid BB nested-subcommand limits
-----------------------------------------------------*/
function UtilityMC_checkNext() {
  try {
    const opts = options || {};
    const token = opts.token;
    if (!token) return;
    const sess = User.getProperty(SES_KEY);
    if (!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.chats || [];
    if (idx >= list.length) {
      _finish();
      return;
    }

    const ch = list[idx];

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: "UtilityMC_onOne",
      on_error: "UtilityMC_onErr",
      bb_options: { token: token, channel: ch, index: idx }
    });
  } catch (e) {
    // critical: show error in Error tab so you can debug
    throw new Error("UtilityLib: UtilityMC_checkNext failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_onOne / onErr ---------------- */
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;

    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const ok = ["member", "administrator", "creator"].includes(options.result?.status);

    sess.results[ch] = ok === true;
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.chats || []).length) {
      // schedule next check
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }
  } catch (e) {
    throw new Error("UtilityLib: UtilityMC_onOne error: " + (e && e.message));
  }
}

function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;

    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    sess.results[ch] = false;
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.chats || []).length) {
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }
  } catch (e) {
    throw new Error("UtilityLib: UtilityMC_onErr error: " + (e && e.message));
  }
}

/* ---------------- finish ---------------- */
function _finish() {
  const sess = User.getProperty(SES_KEY);
  if (!sess) return;
  const panel = _panel();

  // ensure results for all chats in allChats
  const merged = Object.assign({}, sess.results || {});
  (sess.allChats || []).forEach(ch => { if (merged[ch] === undefined) merged[ch] = false; });

  const core = _buildPayloadFromResults(merged);
  core.passed = sess.passed || {};
  core.forced = !!(sess.passed && sess.passed.forced);

  // save persistent states
  const states = {};
  (core.joined || []).forEach(j => states[j.id] = true);
  (core.missing || []).forEach(m => states[m.id] = false);
  _saveStates(states);

  // clear session
  User.setProperty(SES_KEY, null);

  // call callback
  try {
    if ((core.missing || []).length === 0) {
      if (panel.successCallback) Bot.run({ command: panel.successCallback, options: core });
    } else {
      if (panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    }
  } catch (e) {
    throw new Error("UtilityLib: _finish callback run failed: " + (e && e.message));
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

/* ---------------- Handlers registration ---------------- */
on("UtilityMC_checkNext", UtilityMC_checkNext);
on("UtilityMC_onOne", UtilityMC_onOne);
on("UtilityMC_onErr", UtilityMC_onErr);
