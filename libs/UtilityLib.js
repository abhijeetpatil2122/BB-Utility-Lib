/*
 * UtilityLib v17 — Final (cache + sequential + passed options)
 *
 * - Sequential checking (MCL-style)
 * - Skips channels already stored as joined (user-level cache)
 * - mcCheck(passedOptions) supports passed data; passed.multiple auto-set
 * - isMember() hybrid (cached; triggers mcCheck if unknown)
 * - Callbacks always get full payload
 */

const PANEL = "SimpleMembershipPanel_v17";
const PREFIX = "UtilityMC_";
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // sec

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

/* ---------------- State management ---------------- */
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

/* ---------------- Convenience: mcGetMissing (enriched) ---------------- */
function mcGetMissing() {
  const states = _getStates();
  const payload = _buildPayloadFromResults(states);
  return payload.missing;
}

/* ---------------- Safe fail helper ---------------- */
function _safeFail(payload) {
  const p = _panel();
  if (!p.failCallback) return;
  try { Bot.run({ command: p.failCallback, options: payload }); } catch (e) { try { throw e; } catch (err) {} }
}

/* ---------------- isMember() hybrid ---------------- */
function isMember(customFail) {
  const chats = mcGetChats();
  const panel = _panel();
  const fail = customFail || panel.failCallback;

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in Admin Panel.");
    return false;
  }

  const states = _getStates();

  // find which channels have undefined state -> need check
  const unknown = chats.filter(ch => (states[ch] === undefined));
  if (unknown.length > 0) {
    // force check for missing ones
    mcCheck({ forced: true });
    return false;
  }

  // All known: check if any false
  const missing = chats.filter(ch => states[ch] !== true);
  if (missing.length > 0) {
    if (fail) {
      const payload = _buildPayloadFromResults(states);
      payload.passed = {};
      payload.forced = false;
      try { Bot.run({ command: fail, options: payload }); } catch (e) { try { throw e; } catch (err) {} }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck(passedOptions) ----------------
   - speed improvement: skip channels that are already true in user states
   - sequential checking of MUST_CHECK channels only
--------------------------------------------------------*/
function mcCheck(passedOptions) {
  const panel = _panel();
  const allChats = mcGetChats();

  if (allChats.length === 0) {
    Bot.sendMessage("❌ No channels configured in Admin Panel.");
    return;
  }

  const states = _getStates();

  // Determine channels we actually need to check
  // Must-check = channels that are undefined OR false
  const mustCheck = allChats.filter(ch => states[ch] !== true);

  // If nothing to check -> finish immediately with success (all joined)
  if (mustCheck.length === 0) {
    // build payload from states
    const payload = _buildPayloadFromResults(states);
    payload.passed = passedOptions || {};
    payload.passed.multiple = allChats.length > 2;
    payload.forced = !!(passedOptions && passedOptions.forced);
    // save states to ensure consistency
    _saveStates(states);
    // call successCallback
    if (panel.successCallback) {
      try { Bot.run({ command: panel.successCallback, options: payload }); } catch (e) { try { throw e; } catch (err) {} }
    }
    return;
  }

  // prepare session with mustCheck list but keep full chat list too
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random()*9999);
  const session = {
    token: token,
    allChats: allChats,
    chats: mustCheck,
    index: 0,
    results: Object.assign({}, states), // copy existing known states (so final payload merges)
    passed: passedOptions || {}
  };
  // mark passed.multiple
  session.passed.multiple = allChats.length > 2;

  User.setProperty(SES_KEY, session, "json");

  // schedule first check
  try {
    Bot.run({
      command: "UtilityMC_checkNext",
      run_after: 0.01,
      options: { token: token }
    });
  } catch (e) {
    // fallback fail
    _safeFail({ joined: [], missing: _buildPayloadFromResults({}).missing, multiple: session.passed.multiple, passed: session.passed, forced: !!session.passed.forced });
    try { throw e; } catch (err) {}
  }
}

/* ---------------- UtilityMC_checkNext ----------------
   sequentially checks session.chats[ index ]
-----------------------------------------------------*/
function UtilityMC_checkNext() {
  try {
    const opt = options || {};
    const token = opt.token;
    if (!token) return;
    const sess = User.getProperty(SES_KEY);
    if (!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.chats || [];
    if (idx >= list.length) {
      _finish(); // nothing to do
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
    try { throw e; } catch (err) {}
    // safe fail
    const sessTmp = User.getProperty(SES_KEY) || {};
    _safeFail({ joined: [], missing: _buildPayloadFromResults({}).missing, multiple: !!sessTmp.passed?.multiple, passed: sessTmp.passed || {}, forced: !!sessTmp.passed?.forced });
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

    // write result (merge with any existing)
    sess.results[ch] = ok === true;

    // increment index and persist
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    // schedule next check or finish
    if (sess.index < (sess.chats || []).length) {
      Bot.run({
        command: "UtilityMC_checkNext",
        run_after: STAGGER,
        options: { token: sess.token }
      });
    } else {
      _finish();
    }

  } catch (e) { try { throw e; } catch (err) {} }
}

function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;

    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    sess.results[ch] = false;

    // increment index
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if (sess.index < (sess.chats || []).length) {
      Bot.run({
        command: "UtilityMC_checkNext",
        run_after: STAGGER,
        options: { token: sess.token }
      });
    } else {
      _finish();
    }
  } catch (e) { try { throw e; } catch (err) {} }
}

/* ---------------- finish ---------------- */
function _finish() {
  const sess = User.getProperty(SES_KEY);
  if (!sess) return;
  const panel = _panel();

  // build payload merging known results (sess.results) for all chats
  const mergedResults = Object.assign({}, sess.results || {});
  // ensure we have entries for allChats (if missing -> false)
  (sess.allChats || []).forEach(ch => { if (mergedResults[ch] === undefined) mergedResults[ch] = false; });

  const core = _buildPayloadFromResults(mergedResults);
  core.passed = sess.passed || {};
  core.forced = !!(sess.passed && sess.passed.forced);

  // save persistent states (id => bool)
  const states = {};
  (core.joined || []).forEach(j => states[j.id] = true);
  (core.missing || []).forEach(m => states[m.id] = false);
  _saveStates(states);

  // clear session
  User.setProperty(SES_KEY, null);

  // call appropriate callback with full payload
  try {
    if ((core.missing || []).length === 0) {
      if (panel.successCallback) Bot.run({ command: panel.successCallback, options: core });
    } else {
      if (panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    }
  } catch (e) { try { throw e; } catch (err) {} }
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
