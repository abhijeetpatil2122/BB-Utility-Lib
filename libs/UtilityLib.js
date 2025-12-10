/*
 * UtilityLib v12 — Stable Membership Checker (final)
 *
 * Admin Panel:
 *  - publicChannels    (comma-separated usernames)
 *  - privateChannels   (comma-separated id=link pairs)
 *  - successCallback
 *  - failCallback
 *  - batchDelay (seconds)
 *
 * API:
 *  - mcSetup()
 *  - mcCheck(passed_options)
 *  - isMember(customFail)
 *  - mcGetChats()
 *  - mcGetMissing()
 *
 * Notes:
 *  - Max 10 channels
 *  - Batch size 2 for safety
 *  - Uses JSON-encoded params for batch Bot.run (safe)
 */

const MC_PANEL = "SimpleMembershipPanel_v12";
const PREFIX = "SMC12_";
const STATE_KEY = PREFIX + "states";
const SESSION_KEY = PREFIX + "session";
const MAX_CHANNELS = 10;
const BATCH_SIZE = 2;

/* --------------------- Admin panel --------------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker v12",
    description: "Public (usernames) + Private (id=link) channels + callbacks",
    icon: "person-add",
    fields: [
      { name: "publicChannels", title: "Public Channels (usernames)", description: "Comma separated, e.g. @ParadoxBackup", type: "string", placeholder: "@ParadoxBackup, @Another", icon: "globe" },
      { name: "privateChannels", title: "Private Channels (id=link)", description: "Comma separated id=link pairs, e.g. -1001954742543=https://t.me/+Invite", type: "string", placeholder: "-1001954742543=https://t.me/+Invite", icon: "lock-closed" },
      { name: "successCallback", title: "Success Callback", description: "Command when user joined all", type: "string", placeholder: "/menu", icon: "checkmark-circle" },
      { name: "failCallback", title: "Fail Callback", description: "Command when user missing any", type: "string", placeholder: "/start", icon: "close-circle" },
      { name: "batchDelay", title: "Batch delay (seconds)", description: "Used only when channels > 2", type: "integer", placeholder: "1", value: 1, icon: "timer" }
    ]
  };

  AdminPanel.setPanel({ panel_name: MC_PANEL, data: panel });
  Bot.sendMessage("Membership Checker v12: Admin panel created.");
}

/* --------------------- Helpers --------------------- */
function _panel() { return AdminPanel.getPanelValues(MC_PANEL) || {}; }

function _parsePublic() {
  const p = _panel();
  if(!p.publicChannels) return [];
  return p.publicChannels.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_CHANNELS);
}

function _parsePrivateMap() {
  const p = _panel();
  const res = {};
  if(!p.privateChannels) return res;
  const parts = p.privateChannels.split(",").map(s => s.trim()).filter(Boolean);
  parts.forEach(item => {
    // split only on first =
    const idx = item.indexOf("=");
    if(idx === -1) {
      const id = item.trim();
      if(id) res[id] = null;
      return;
    }
    const id = item.slice(0, idx).trim();
    const link = item.slice(idx+1).trim();
    if(id) res[id] = link || null;
  });
  return res;
}

function mcGetChats() {
  const pub = _parsePublic();
  const privMap = _parsePrivateMap();
  const privIds = Object.keys(privMap);
  return pub.concat(privIds).slice(0, MAX_CHANNELS);
}

function _getStates() { return User.getProperty(STATE_KEY) || {}; }
function _saveStates(st) { User.setProperty(STATE_KEY, st, "json"); }

/* get missing from stored states */
function mcGetMissing() {
  const chats = mcGetChats();
  const st = _getStates();
  return chats.filter(c => st[c] !== true);
}

/* --------------------- isMember (hybrid) --------------------- */
function isMember(customFail) {
  const panel = _panel();
  const failCmd = customFail || panel.failCallback;
  const chats = mcGetChats();

  if(chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return false;
  }

  const st = _getStates();

  // If no stored state -> force a fresh check
  if(Object.keys(st).length === 0) {
    // pass forced true
    mcCheck({ forced: true });
    return false;
  }

  // check using stored states
  const missing = chats.filter(ch => st[ch] !== true);
  if(missing.length > 0) {
    // build full payload and call failCallback if configured
    if(failCmd) {
      const payload = _payloadFromStates(st);
      Bot.run({ command: failCmd, options: payload });
    }
    return false;
  }

  return true;
}

/* --------------------- mcCheck (manual) --------------------- */
function mcCheck(passed_options) {
  const panel = _panel();
  const chats = mcGetChats();
  if(chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return;
  }

  // create session
  const token = PREFIX + Date.now() + "_" + Math.floor(Math.random()*10000);
  const sess = { token: token, total: chats.length, pending: chats.length, results: {}, passed: passed_options || {}, multiple: chats.length > 2 };
  User.setProperty(SESSION_KEY, sess, "json");

  // small lists (<=2): direct getChatMember calls
  if(chats.length <= 2) {
    try {
      chats.forEach(ch => {
        Api.getChatMember({
          chat_id: ch,
          user_id: user.telegramid,
          on_result: PREFIX + "onOne " + encodeURIComponent(ch),
          on_error: PREFIX + "onErr " + encodeURIComponent(ch),
          bb_options: { token: token }
        });
      });
    } catch (e) {
      // log & call failCallback with empty payload
      try { throw e; } catch (err) { /* ensure shown in error tab */ }
      _safeFailCallback({ joined: [], missing: _buildMissingPlaceholders(chats), multiple: sess.multiple, passed: sess.passed, forced: !!sess.passed.forced });
    }
    return;
  }

  // >2 channels -> batching
  const batches = [];
  for(let i=0;i<chats.length;i+=BATCH_SIZE) batches.push(chats.slice(i, i+BATCH_SIZE));
  const delay = parseFloat(panel.batchDelay || 1);

  for(let i=0;i<batches.length;i++){
    const paramObj = { token: token, channels: batches[i] };
    const paramsStr = JSON.stringify(paramObj);
    const runAfter = i === 0 ? 0.01 : delay * i;
    try {
      Bot.run({
        command: PREFIX + "runBatch",
        params: paramsStr,
        run_after: runAfter
      });
    } catch (e) {
      // logging
      try { throw e; } catch (err) {}
      // fail all safely
      _safeFailCallback({ joined: [], missing: _buildMissingPlaceholders(chats), multiple: true, passed: sess.passed, forced: !!sess.passed.forced });
      return;
    }
  }
}

/* --------------------- runBatch handler (params is JSON) --------------------- */
function runBatch() {
  try {
    if(!params) throw new Error("runBatch: missing params");
    let data;
    try { data = JSON.parse(params); } catch(e) { throw new Error("runBatch: invalid params JSON: " + params); }

    const token = data.token;
    const channels = data.channels || [];
    if(!token) throw new Error("runBatch: missing token");

    channels.forEach(ch => {
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: PREFIX + "onOne " + encodeURIComponent(ch),
        on_error: PREFIX + "onErr " + encodeURIComponent(ch),
        bb_options: { token: token }
      });
    });
  } catch (err) {
    // Option A: log error (error tab) and call fail callback with placeholders
    try { throw err; } catch (e) {}
    const panel = _panel();
    const fail = panel.failCallback;
    if(fail) {
      try {
        Bot.run({ command: fail, options: { joined: [], missing: [], multiple: true, passed: {}, forced: false } });
      } catch (e2) { try { throw e2; } catch (e3) {} }
    }
  }
}

/* --------------------- onOne / onErr --------------------- */
function onOne() {
  try {
    const ch = decodeURIComponent(params || "");
    const sess = User.getProperty(SESSION_KEY);
    if(!sess) return;
    if(!options.bb_options || options.bb_options.token !== sess.token) return;

    const status = options.result?.status;
    const joined = ["member","administrator","creator"].includes(status);
    sess.results[ch] = joined === true;
    sess.pending = (sess.pending || 1) - 1;
    User.setProperty(SESSION_KEY, sess, "json");

    if(sess.pending <= 0) _finish();
  } catch (err) {
    try { throw err; } catch (e) {}
  }
}

function onErr() {
  try {
    const ch = decodeURIComponent(params || "");
    const sess = User.getProperty(SESSION_KEY);
    if(!sess) return;
    if(!options.bb_options || options.bb_options.token !== sess.token) return;

    sess.results[ch] = false;
    sess.pending = (sess.pending || 1) - 1;
    User.setProperty(SESSION_KEY, sess, "json");

    if(sess.pending <= 0) _finish();
  } catch (err) {
    try { throw err; } catch (e) {}
  }
}

/* --------------------- build enriched payload --------------------- */
function _buildPayloadFromResults(resultsMap) {
  const publicArr = _parsePublic();
  const privateMap = _parsePrivateMap();
  const chats = mcGetChats();
  const missing = [];
  const joined = [];

  chats.forEach(ch => {
    const ok = resultsMap[ch] === true;
    let link = null;
    if(publicArr.includes(ch)) {
      const uname = ch.replace(/^@/, "");
      link = "https://t.me/" + uname;
    } else {
      link = privateMap[ch] || null;
    }
    const obj = { id: ch, join_link: link };
    if(ok) joined.push(obj); else missing.push(obj);
  });

  return { joined: joined, missing: missing, multiple: chats.length > 2 };
}

function _buildMissingPlaceholders(chats) {
  // create simple objects for fallback reporting
  const privateMap = _parsePrivateMap();
  const publicArr = _parsePublic();
  const missing = [];
  chats.forEach(ch => {
    const isPub = publicArr.includes(ch);
    const link = isPub ? ("https://t.me/" + ch.replace(/^@/,"")) : (privateMap[ch] || null);
    missing.push({ id: ch, join_link: link });
  });
  return missing;
}

/* --------------------- finalize --------------------- */
function _finish() {
  const sess = User.getProperty(SESSION_KEY);
  if(!sess) return;
  const panel = _panel();

  const payload = _buildPayloadFromResults(sess.results || {});
  // save states permanently (map id->bool)
  const statesObj = {};
  (payload.joined || []).forEach(item => { statesObj[item.id] = true; });
  (payload.missing || []).forEach(item => { statesObj[item.id] = false; });
  _saveStates(statesObj);

  // build callback options (always include fields)
  const cbOptions = {
    joined: payload.joined || [],
    missing: payload.missing || [],
    multiple: !!sess.multiple,
    passed: sess.passed || {},
    forced: !!(sess.passed && sess.passed.forced)
  };

  // clear session
  User.setProperty(SESSION_KEY, null);
  // call appropriate callback
  try {
    if(cbOptions.missing.length === 0) {
      if(panel.successCallback) Bot.run({ command: panel.successCallback, options: cbOptions });
    } else {
      if(panel.failCallback) Bot.run({ command: panel.failCallback, options: cbOptions });
    }
  } catch (err) {
    try { throw err; } catch (e) {}
  }
}

/* --------------------- safe fail helper (Option A) --------------------- */
function _safeFailCallback(cbOptions) {
  const panel = _panel();
  try {
    if(panel.failCallback) Bot.run({ command: panel.failCallback, options: cbOptions || { joined: [], missing: [], multiple: false, passed: {}, forced: false } });
  } catch (e) {
    try { throw e; } catch (err) {}
  }
}

/* --------------------- export --------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

on(PREFIX + "runBatch", runBatch);
on(PREFIX + "onOne", onOne);
on(PREFIX + "onErr", onErr);
