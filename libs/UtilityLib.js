/*
 * UtilityLib v15 — FINAL PRODUCTION MEMBERSHIP CHECKER
 * -----------------------------------------------------
 * FIX: Per-channel background tasks (MCL-style)
 * FIX: Works for 1–10 channels
 * FIX: Reliable callbacks for 3+ channels
 * FIX: Payload ALWAYS correct
 * 
 * Features:
 *  - Admin panel: public, private(id=link), successCallback, failCallback
 *  - mcCheck() runs 1 check per channel (safe)
 *  - isMember() hybrid (cached + dynamic)
 *  - 0.1s stagger per channel for stability
 */

const PANEL = "SimpleMembershipPanel_v15";

const PREFIX = "UtilityMC_";  
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;

/* ---------------------------------------------------------
   Admin Panel Setup
--------------------------------------------------------- */
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Membership Checker v15",
      description: "Stable, fast, simple multi-channel membership checker",
      icon: "person-add",
      fields: [
        {
          name: "publicChannels",
          title: "Public Channels",
          type: "string",
          placeholder: "@channel1, @channel2",
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
        }
      ]
    }
  });

  Bot.sendMessage("Membership Checker v15 panel installed.");
}

function _panel() { return AdminPanel.getPanelValues(PANEL) || {}; }

/* ---------------------------------------------------------
   Parsing
--------------------------------------------------------- */
function _parsePublic() {
  const p = _panel();
  if (!p.publicChannels) return [];
  return p.publicChannels.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_CH);
}

function _parsePrivateMap() {
  const p = _panel();
  const out = {};
  if (!p.privateChannels) return out;

  p.privateChannels.split(",").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const eq = pair.indexOf("=");
    if (eq === -1) { out[pair.trim()] = null; return; }
    const id = pair.slice(0, eq).trim();
    const link = pair.slice(eq + 1).trim();
    out[id] = link || null;
  });

  return out;
}

function mcGetChats() {
  return [..._parsePublic(), ...Object.keys(_parsePrivateMap())].slice(0, MAX_CH);
}

/* ---------------------------------------------------------
   State Storage
--------------------------------------------------------- */
function _getStates() { return User.getProperty(STATES_KEY) || {}; }
function _saveStates(s) { User.setProperty(STATES_KEY, s, "json"); }

/* ---------------------------------------------------------
   Build Payload
--------------------------------------------------------- */
function _buildPayload(results) {
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();

  const joined = [];
  const missing = [];

  chats.forEach(ch => {
    const ok = results[ch] === true;
    const link = pub.includes(ch)
      ? "https://t.me/" + ch.replace(/^@/, "")
      : (priv[ch] || null);

    const obj = { id: ch, join_link: link };
    if (ok) joined.push(obj); else missing.push(obj);
  });

  return {
    joined: joined,
    missing: missing,
    multiple: chats.length > 2
  };
}

function _missingPlaceholders() {
  return _buildPayload({}).missing;
}

/* ---------------------------------------------------------
   Fail Callback Helper
--------------------------------------------------------- */
function _safeFail(payload) {
  const panel = _panel();
  if (!panel.failCallback) return;
  try { Bot.run({ command: panel.failCallback, options: payload }); } catch (e) {}
}

/* ---------------------------------------------------------
   isMember (cached check + forced refresh)
--------------------------------------------------------- */
function isMember(customFail) {
  const states = _getStates();
  const chats = mcGetChats();
  const fail = customFail || _panel().failCallback;

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured.");
    return false;
  }

  // No cache → force check
  if (Object.keys(states).length === 0) {
    mcCheck({ forced: true });
    return false;
  }

  const missing = chats.filter(c => states[c] !== true);

  if (missing.length > 0) {
    if (fail) {
      const payload = _buildPayload(states);
      payload.passed = {};
      payload.forced = false;
      Bot.run({ command: fail, options: payload });
    }
    return false;
  }

  return true;
}

/* ---------------------------------------------------------
   mcCheck() — Core Logic (v15 MCL-style)
--------------------------------------------------------- */
function mcCheck(passed) {
  const panel = _panel();
  const chats = mcGetChats();

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const token = PREFIX + "t" + Date.now();

  const session = {
    token: token,
    total: chats.length,
    pending: chats.length,
    results: {},
    passed: passed || {},
    multiple: chats.length > 2
  };

  User.setProperty(SES_KEY, session, "json");

  // MCL-style: 1 background task per channel
  chats.forEach((ch, index) => {
    Bot.run({
      command: "UtilityMC_checkOne",
      run_after: index * 0.1,   // fastest safe stagger
      options: { token: token, channel: ch }
    });
  });
}

/* ---------------------------------------------------------
   checkOne → 1 channel per task
--------------------------------------------------------- */
function UtilityMC_checkOne() {
  try {
    const token = options?.token;
    const ch = options?.channel;
    if (!token || !ch) return;

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: "UtilityMC_onOne",
      on_error: "UtilityMC_onErr",
      bb_options: { token: token, channel: ch }
    });

  } catch (e) { try { throw e; } catch(err){} }
}

/* ---------------------------------------------------------
   onOne / onErr — FINAL CALLBACKS
--------------------------------------------------------- */
function UtilityMC_onOne() {
  const session = User.getProperty(SES_KEY);
  if (!session) return;

  const bb = options.bb_options;
  if (!bb || bb.token !== session.token) return;

  const ch = bb.channel;
  const status = options.result?.status;
  const ok = ["member", "administrator", "creator"].includes(status);

  session.results[ch] = ok;
  session.pending--;

  User.setProperty(SES_KEY, session, "json");

  if (session.pending <= 0) _finish();
}

function UtilityMC_onErr() {
  const session = User.getProperty(SES_KEY);
  if (!session) return;

  const bb = options.bb_options;
  if (!bb || bb.token !== session.token) return;

  const ch = bb.channel;

  session.results[ch] = false;
  session.pending--;

  User.setProperty(SES_KEY, session, "json");

  if (session.pending <= 0) _finish();
}

/* ---------------------------------------------------------
   Finalize Check
--------------------------------------------------------- */
function _finish() {
  const session = User.getProperty(SES_KEY);
  if (!session) return;

  const panel = _panel();

  const payload = _buildPayload(session.results);
  payload.passed = session.passed || {};
  payload.forced = !!session.passed.forced;

  // Save user states
  const st = {};
  payload.joined.forEach(j => st[j.id] = true);
  payload.missing.forEach(m => st[m.id] = false);
  _saveStates(st);

  User.setProperty(SES_KEY, null);

  // Run callbacks
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

/* ---------------------------------------------------------
   Export API
--------------------------------------------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: function(){ 
    return _buildPayload(_getStates()).missing; 
  }
});

/* ---------------------------------------------------------
   Handler Registration
--------------------------------------------------------- */
on("UtilityMC_checkOne", UtilityMC_checkOne);
on("UtilityMC_onOne", UtilityMC_onOne);
on("UtilityMC_onErr", UtilityMC_onErr);
