/*
 * UtilityLib v14 — FINAL STABLE MEMBERSHIP CHECKER (FIXED)
 * -------------------------------------------------------
 * Fixed: mcGetMissing function implemented and exported.
 *
 * Features:
 *  - Admin panel (publicChannels, privateChannels, successCallback, failCallback, batchDelay)
 *  - Hybrid isMember()
 *  - mcCheck() with safe batching
 *  - Global handlers: UtilityMC_runBatch / UtilityMC_onOne / UtilityMC_onErr
 *  - Returns full payload to callbacks
 */

const PANEL = "SimpleMembershipPanel_v14";
const PREFIX = "UtilityMC_";
const ST_KEY = PREFIX + "states";
const SES_KEY = PREFIX + "session";

const MAX_CH = 10;
const BATCH_SIZE = 2;

/* ---------------------- Admin Panel Setup ---------------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker v14",
    description: "Public + Private channels, batching & callbacks",
    icon: "person-add",
    fields: [
      {
        name: "publicChannels",
        title: "Public Channels (usernames)",
        type: "string",
        placeholder: "@Channel1, @Channel2",
        icon: "megaphone"
      },
      {
        name: "privateChannels",
        title: "Private Channels (id=link)",
        type: "string",
        placeholder: "-100id=inviteLink",
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
      },
      {
        name: "batchDelay",
        title: "Batch Delay (seconds)",
        type: "integer",
        value: 1,
        icon: "time"
      }
    ]
  };

  AdminPanel.setPanel({ panel_name: PANEL, data: panel });
  Bot.sendMessage("Membership Checker v14 installed.");
}

function _panel() { return AdminPanel.getPanelValues(PANEL) || {}; }

/* ---------------------- Parsing ---------------------- */
function _parsePublic() {
  const p = _panel();
  if (!p.publicChannels) return [];
  return p.publicChannels
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_CH);
}

function _parsePrivateMap() {
  const p = _panel();
  const out = {};
  if (!p.privateChannels) return out;

  p.privateChannels.split(",").map(s => s.trim()).filter(Boolean).forEach(item => {
    const eq = item.indexOf("=");
    if (eq === -1) {
      out[item.trim()] = null;
      return;
    }
    const id = item.slice(0, eq).trim();
    const link = item.slice(eq + 1).trim();
    out[id] = link || null;
  });

  return out;
}

function mcGetChats() {
  return [].concat(_parsePublic(), Object.keys(_parsePrivateMap())).slice(0, MAX_CH);
}

/* ---------------------- State Management ---------------------- */
function _getStates() { return User.getProperty(ST_KEY) || {}; }
function _saveStates(s) { User.setProperty(ST_KEY, s, "json"); }

/* ---------------------- mcGetMissing (fixed) ---------------------- */
function mcGetMissing() {
  const chats = mcGetChats();
  const st = _getStates();
  const missing = chats.filter(c => st[c] !== true);
  // return enriched missing objects (id + join_link) for convenience
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  return missing.map(ch => ({
    id: ch,
    join_link: pub.includes(ch) ? ("https://t.me/" + ch.replace(/^@/, "")) : (priv[ch] || null)
  }));
}

/* ---------------------- Build Payload ---------------------- */
function _buildPayloadFromResults(res) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();

  const joined = [], missing = [];

  chats.forEach(ch => {
    const ok = res[ch] === true;
    const link = pub.includes(ch)
      ? "https://t.me/" + ch.replace(/^@/, "")
      : priv[ch] || null;

    const obj = { id: ch, join_link: link };
    if (ok) joined.push(obj);
    else missing.push(obj);
  });

  return {
    joined: joined,
    missing: missing,
    multiple: chats.length > 2
  };
}

function _missingPlaceholders() {
  return mcGetChats().map(ch => ({
    id: ch,
    join_link:
      _parsePublic().includes(ch)
        ? "https://t.me/" + ch.replace(/^@/, "")
        : (_parsePrivateMap()[ch] || null)
  }));
}

/* ---------------------- Fail Wrapper ---------------------- */
function _safeFail(payload) {
  const p = _panel();
  if (!p.failCallback) return;
  try { Bot.run({ command: p.failCallback, options: payload }); } catch (e) {}
}

/* ---------------------- isMember() Hybrid ---------------------- */
function isMember(customFail) {
  const st = _getStates();
  const chats = mcGetChats();
  const fail = customFail || _panel().failCallback;

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels defined.");
    return false;
  }

  // No saved states → force check
  if (Object.keys(st).length === 0) {
    mcCheck({ forced: true });
    return false;
  }

  const missing = chats.filter(c => st[c] !== true);
  if (missing.length > 0) {
    if (fail) {
      const payload = _buildPayloadFromResults(st);
      payload.passed = {};
      payload.forced = false;
      Bot.run({ command: fail, options: payload });
    }
    return false;
  }

  return true;
}

/* ---------------------- mcCheck() ---------------------- */
function mcCheck(passed) {
  const panel = _panel();
  const chats = mcGetChats();

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const token = PREFIX + Date.now() + "_" + Math.floor(Math.random() * 9999);

  const sess = {
    token: token,
    total: chats.length,
    pending: chats.length,
    results: {},
    passed: passed || {},
    multiple: chats.length > 2
  };
  User.setProperty(SES_KEY, sess, "json");

  // Direct mode for 1–2 channels → no batching
  if (chats.length <= 2) {
    chats.forEach(ch => {
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: "UtilityMC_onOne",
        on_error: "UtilityMC_onErr",
        bb_options: { token: token, channel: ch, ts: Date.now() }
      });
    });
    return;
  }

  // Batch mode: 3–10 channels
  const delay = parseFloat(panel.batchDelay || 1);

  const batches = [];
  for (let i = 0; i < chats.length; i += BATCH_SIZE)
    batches.push(chats.slice(i, i + BATCH_SIZE));

  batches.forEach((batch, idx) => {
    Bot.run({
      command: "UtilityMC_runBatch",
      params: JSON.stringify({ token: token, channels: batch }),
      run_after: idx === 0 ? 0.01 : delay * idx
    });
  });
}

/* ---------------------- Batch Runner ---------------------- */
function UtilityMC_runBatch() {
  try {
    if (!params) throw new Error("No params provided to runBatch");
    const data = JSON.parse(params);
    const token = data.token;
    const channels = data.channels || [];

    channels.forEach(ch => {
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: "UtilityMC_onOne",
        on_error: "UtilityMC_onErr",
        bb_options: { token: token, channel: ch, ts: Date.now() }
      });
    });

  } catch (e) {
    // fallback fail
    _safeFail({
      joined: [],
      missing: _missingPlaceholders(),
      multiple: true,
      passed: {},
      forced: false
    });
    try { throw e; } catch(err){}
  }
}

/* ---------------------- onOne / onErr ---------------------- */
function UtilityMC_onOne() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;

    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const ok = ["member", "administrator", "creator"].includes(
      options.result?.status
    );

    sess.results[ch] = ok;
    sess.pending--;

    User.setProperty(SES_KEY, sess, "json");
    if (sess.pending <= 0) _finish();

  } catch (e) { try { throw e; } catch(err){} }
}

function UtilityMC_onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if (!sess) return;

    const bb = options.bb_options;
    if (!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    sess.results[ch] = false;
    sess.pending--;

    User.setProperty(SES_KEY, sess, "json");
    if (sess.pending <= 0) _finish();

  } catch (e) { try { throw e; } catch(err){} }
}

/* ---------------------- finalize session ---------------------- */
function _finish() {
  const panel = _panel();
  const sess = User.getProperty(SES_KEY);
  if (!sess) return;

  const payload = _buildPayloadFromResults(sess.results);
  payload.passed = sess.passed || {};
  payload.forced = !!(sess.passed && sess.passed.forced);

  // save user state
  const st = {};
  payload.joined.forEach(j => st[j.id] = true);
  payload.missing.forEach(m => st[m.id] = false);
  _saveStates(st);

  User.setProperty(SES_KEY, null);

  try {
    if (payload.missing.length === 0) {
      if (panel.successCallback)
        Bot.run({ command: panel.successCallback, options: payload });
    } else {
      if (panel.failCallback)
        Bot.run({ command: panel.failCallback, options: payload });
    }
  } catch (e) { try { throw e; } catch(err){} }
}

/* ---------------------- Export API ---------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

/* Handlers */
on("UtilityMC_runBatch", UtilityMC_runBatch);
on("UtilityMC_onOne", UtilityMC_onOne);
on("UtilityMC_onErr", UtilityMC_onErr);
