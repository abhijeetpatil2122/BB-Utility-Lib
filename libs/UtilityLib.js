/*
 * UtilityLib v13 — Final Stable Membership Checker
 * 
 * Safe batching, safe bb_options, correct multi-channel logic.
 * MCL-style callback reliability.
 */

const PANEL = "SimpleMembershipPanel_v13";
const PREFIX = "SMC13_";
const ST_KEY = PREFIX + "states";
const SES_KEY = PREFIX + "session";

const MAX_CH = 10;
const BATCH_SIZE = 2;

/* ---------------------- Admin Panel Setup ---------------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker v13 (Stable)",
    description: "Public usernames + Private id=link, callbacks & batching",
    icon: "person-add",
    fields: [
      {
        name: "publicChannels",
        title: "Public Channels (usernames)",
        description: "Comma separated (e.g. @ParadoxBackup)",
        type: "string",
        placeholder: "@ParadoxBackup, @Another",
        icon: "globe"
      },
      {
        name: "privateChannels",
        title: "Private Channels (id=link)",
        description: "Comma separated id=link pairs",
        type: "string",
        placeholder: "-100id=https://invite",
        icon: "lock-closed"
      },
      {
        name: "successCallback",
        title: "Success Callback",
        type: "string",
        placeholder: "/menu",
        icon: "checkmark-circle"
      },
      {
        name: "failCallback",
        title: "Fail Callback",
        type: "string",
        placeholder: "/start",
        icon: "close-circle"
      },
      {
        name: "batchDelay",
        title: "Batch delay (seconds)",
        type: "integer",
        placeholder: "1",
        value: 1,
        icon: "timer"
      }
    ]
  };

  AdminPanel.setPanel({ panel_name: PANEL, data: panel });
  Bot.sendMessage("Membership Checker v13 panel created.");
}

/* ---------------------- Helpers ---------------------- */
function _panel() { return AdminPanel.getPanelValues(PANEL) || {}; }

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
    if (eq === -1) {
      const id = item.trim();
      if(id) out[id] = null;
      return;
    }
    const id = item.slice(0, eq).trim();
    const link = item.slice(eq+1).trim();
    if(id) out[id] = link || null;
  });

  return out;
}

function mcGetChats() {
  const pub = _parsePublic();
  const privMap = _parsePrivateMap();
  const privIds = Object.keys(privMap);
  return pub.concat(privIds).slice(0, MAX_CH);
}

function _getStates() { return User.getProperty(ST_KEY) || {}; }
function _saveStates(obj) { User.setProperty(ST_KEY, obj, "json"); }

function mcGetMissing() {
  const st = _getStates();
  const chats = mcGetChats();
  return chats.filter(c => st[c] !== true);
}

/* ---------------------- Build Callback Payload ---------------------- */
function _buildPayloadFromResults(resultsMap) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();

  const joined = [];
  const missing = [];

  chats.forEach(ch => {
    const ok = resultsMap[ch] === true;
    let link = null;
    if(pub.includes(ch)) link = "https://t.me/" + ch.replace(/^@/, "");
    else link = priv[ch] || null;

    const obj = { id: ch, join_link: link };
    if(ok) joined.push(obj); else missing.push(obj);
  });

  return {
    joined: joined,
    missing: missing,
    multiple: chats.length > 2
  };
}

function _buildMissingPlaceholders(chats) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();

  return chats.map(ch => {
    let link = pub.includes(ch) ? ("https://t.me/" + ch.replace(/^@/, "")) : (priv[ch] || null);
    return { id: ch, join_link: link };
  });
}

/* ---------------------- Safe Fail Callback ---------------------- */
function _safeFail(payload) {
  const p = _panel();
  if(!p.failCallback) return;

  try {
    Bot.run({ command: p.failCallback, options: payload });
  } catch(e) { try { throw e; } catch(err){} }
}

/* ---------------------- isMember() Hybrid ---------------------- */
function isMember(customFail) {
  const panel = _panel();
  const failCmd = customFail || panel.failCallback;
  const chats = mcGetChats();

  if(chats.length === 0) {
    Bot.sendMessage("❌ No channels configured.");
    return false;
  }

  const st = _getStates();

  if(Object.keys(st).length === 0) {
    mcCheck({ forced: true });
    return false;
  }

  const missing = chats.filter(c => st[c] !== true);
  if(missing.length > 0) {
    if(failCmd){
      const payload = _buildPayloadFromResults(st);
      payload.passed = {};
      payload.forced = false;
      Bot.run({ command: failCmd, options: payload });
    }
    return false;
  }

  return true;
}

/* ---------------------- mcCheck() ---------------------- */
function mcCheck(passed) {
  const panel = _panel();
  const chats = mcGetChats();
  if(chats.length === 0){
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const token = PREFIX + Date.now() + "_" + Math.floor(Math.random()*9999);
  const sess = {
    token: token,
    total: chats.length,
    pending: chats.length,
    results: {},
    passed: passed || {},
    multiple: chats.length > 2
  };
  User.setProperty(SES_KEY, sess, "json");

  // small list: direct calls
  if(chats.length <= 2){
    chats.forEach(ch => {
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: PREFIX + "onOne",
        on_error: PREFIX + "onErr",
        bb_options: { token: token, channel: ch, ts: Date.now() }
      });
    });
    return;
  }

  // batching
  const delay = parseFloat(panel.batchDelay || 1);

  const batches = [];
  for(let i = 0; i < chats.length; i += BATCH_SIZE)
    batches.push(chats.slice(i, i + BATCH_SIZE));

  batches.forEach((batch, idx) => {
    const paramStr = JSON.stringify({ token: token, channels: batch });

    Bot.run({
      command: PREFIX + "runBatch",
      params: paramStr,
      run_after: idx === 0 ? 0.01 : delay * idx
    });
  });
}

/* ---------------------- Batch Handler ---------------------- */
function runBatch() {
  try {
    if(!params) throw new Error("runBatch: missing params");
    let data = JSON.parse(params);
    const token = data.token;
    const channels = data.channels || [];

    channels.forEach(ch => {
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: PREFIX + "onOne",
        on_error: PREFIX + "onErr",
        bb_options: { token: token, channel: ch, ts: Date.now() }
      });
    });

  } catch (e) {
    try { throw e; } catch(err){}
    const chats = mcGetChats();
    _safeFail({
      joined: [],
      missing: _buildMissingPlaceholders(chats),
      multiple: chats.length > 2,
      passed: {},
      forced: false
    });
  }
}

/* ---------------------- onOne / onErr ---------------------- */
function onOne() {
  try {
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const status = options.result?.status;
    const ok = ["member","administrator","creator"].includes(status);

    sess.results[ch] = ok;
    sess.pending--;

    User.setProperty(SES_KEY, sess, "json");
    if(sess.pending <= 0) _finish();

  } catch(e){ try{ throw e; }catch(err){} }
}

function onErr() {
  try {
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    sess.results[ch] = false;
    sess.pending--;

    User.setProperty(SES_KEY, sess, "json");
    if(sess.pending <= 0) _finish();

  } catch(e){ try{ throw e; }catch(err){} }
}

/* ---------------------- finalize session ---------------------- */
function _finish() {
  const panel = _panel();
  const sess = User.getProperty(SES_KEY);
  if(!sess) return;

  const payload = _buildPayloadFromResults(sess.results);
  payload.passed = sess.passed || {};
  payload.forced = !!(sess.passed && sess.passed.forced);

  // save states
  const st = {};
  payload.joined.forEach(j => st[j.id] = true);
  payload.missing.forEach(m => st[m.id] = false);
  _saveStates(st);

  // clear session
  User.setProperty(SES_KEY, null);

  try {
    if(payload.missing.length === 0) {
      if(panel.successCallback)
        Bot.run({ command: panel.successCallback, options: payload });
    } else {
      if(panel.failCallback)
        Bot.run({ command: panel.failCallback, options: payload });
    }
  } catch(e){ try{ throw e; }catch(err){} }
}

/* ---------------------- Export API ---------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

/* Register handlers */
on(PREFIX + "runBatch", runBatch);
on(PREFIX + "onOne", onOne);
on(PREFIX + "onErr", onErr);
