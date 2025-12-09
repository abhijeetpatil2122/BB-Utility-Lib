/*
 * UtilityLib v10 — FINAL SIMPLE MEMBERSHIP CHECKER
 * ------------------------------------------------
 * Features:
 *   - Admin Panel: channels, successCallback, failCallback
 *   - Manual-only membership checking (mcCheck)
 *   - isMember() for protecting commands
 *   - Hybrid system:
 *       * Uses user stored states for speed
 *       * If no stored states → performs fresh check
 *   - Passes { joined:[], missing:[], passed:{} } to callbacks
 */

const PANEL = "SimpleMembershipPanel_v10";
const PREFIX = "SMC10_";
const STATE_KEY = PREFIX + "states";     // user-level memberships
const SESSION_KEY = PREFIX + "session";  // temporary check session

/* ------------------------------------------------
   1) Admin Panel Setup
--------------------------------------------------*/
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Simple Membership Checker v10",
      description: "Define channels and callback commands.",
      icon: "person-add",
      fields: [
        {
          name: "channels",
          title: "Channels to Check",
          description: "Comma separated (@c1, -100id)",
          type: "string",
          placeholder: "@channel1, -10012345",
          icon: "chatbubbles"
        },
        {
          name: "successCallback",
          title: "Success Callback",
          description: "Command when user joined all",
          type: "string",
          placeholder: "/menu",
          icon: "checkmark-circle"
        },
        {
          name: "failCallback",
          title: "Fail Callback",
          description: "Command when user missing any channel",
          type: "string",
          placeholder: "/start",
          icon: "close-circle"
        }
      ]
    }
  });

  Bot.sendMessage("Membership Checker v10 Admin Panel Installed ✔");
}

/* ------------------------------------------------
   2) Helpers
--------------------------------------------------*/
function _opt() {
  return AdminPanel.getPanelValues(PANEL) || {};
}

function mcGetChats() {
  const o = _opt();
  if (!o.channels) return [];
  return o.channels.split(",").map(s => s.trim()).filter(Boolean);
}

function _getStoredStates() {
  return User.getProperty(STATE_KEY) || {};
}

function _saveStoredStates(obj) {
  User.setProperty(STATE_KEY, obj, "json");
}

/* ------------------------------------------------
   3) public: mcGetMissing()
--------------------------------------------------*/
function mcGetMissing() {
  const chats = mcGetChats();
  const st = _getStoredStates();
  return chats.filter(c => st[c] !== true);
}

/* ------------------------------------------------
   4) public: isMember()
      - fast check using stored states
      - if no data stored → force mcCheck()
--------------------------------------------------*/
function isMember(customFail) {
  const o = _opt();
  const failCmd = customFail || o.failCallback;

  const chats = mcGetChats();
  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels set in Admin Panel.");
    return false;
  }

  const st = _getStoredStates();

  // if no stored states → force fresh check
  if (Object.keys(st).length === 0) {
    mcCheck();
    return false; // callback will handle redirect
  }

  // If any missing → run failCallback
  let missing = chats.filter(c => st[c] !== true);
  if (missing.length > 0) {
    if (failCmd) {
      Bot.run({
        command: failCmd,
        options: { missing: missing, joined: [], forced: true }
      });
    }
    return false;
  }

  return true; // all ok
}

/* ------------------------------------------------
   5) mcCheck()
--------------------------------------------------*/
function mcCheck(passed) {
  const chats = mcGetChats();
  const o = _opt();

  if (chats.length === 0) {
    Bot.sendMessage("❌ No channels set for checking.");
    return;
  }

  const token = PREFIX + "tk_" + Date.now();

  User.setProperty(SESSION_KEY, {
    token: token,
    total: chats.length,
    pending: chats.length,
    results: {},
    passed: passed
  }, "json");

  chats.forEach(ch => {
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: PREFIX + "onOne " + encodeURIComponent(ch),
      on_error: PREFIX + "onErr " + encodeURIComponent(ch),
      bb_options: { token: token }
    });
  });
}

/* ------------------------------------------------
   6) Internal: Handle Success Response
--------------------------------------------------*/
function onOne() {
  let ch = decodeURIComponent(params);

  let sess = User.getProperty(SESSION_KEY);
  if (!sess) return;

  if (options.bb_options.token !== sess.token) return;

  let status = options.result?.status;
  let joined = ["member","administrator","creator"].includes(status);

  sess.results[ch] = joined;
  sess.pending--;

  User.setProperty(SESSION_KEY, sess, "json");

  if (sess.pending === 0) _finish();
}

/* ------------------------------------------------
   7) Internal: Handle Error Response
--------------------------------------------------*/
function onErr() {
  let ch = decodeURIComponent(params);

  let sess = User.getProperty(SESSION_KEY);
  if (!sess) return;

  if (options.bb_options.token !== sess.token) return;

  sess.results[ch] = false;
  sess.pending--;

  User.setProperty(SESSION_KEY, sess, "json");

  if (sess.pending === 0) _finish();
}

/* ------------------------------------------------
   8) Finish membership check
--------------------------------------------------*/
function _finish() {
  let sess = User.getProperty(SESSION_KEY);
  if (!sess) return;

  let o = _opt();
  let chats = mcGetChats();

  let missing = [];
  let joined = [];

  chats.forEach(ch => {
    if (sess.results[ch] === true) joined.push(ch);
    else missing.push(ch);
  });

  // save permanent states
  _saveStoredStates(sess.results);

  // clear session
  User.setProperty(SESSION_KEY, null);

  if (missing.length === 0) {
    if (o.successCallback) {
      Bot.run({
        command: o.successCallback,
        options: { joined: joined, missing: [], passed: sess.passed }
      });
    }
  } else {
    if (o.failCallback) {
      Bot.run({
        command: o.failCallback,
        options: { joined: joined, missing: missing, passed: sess.passed }
      });
    }
  }
}

/* ------------------------------------------------
   Export
--------------------------------------------------*/
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

on(PREFIX + "onOne", onOne);
on(PREFIX + "onErr", onErr);
