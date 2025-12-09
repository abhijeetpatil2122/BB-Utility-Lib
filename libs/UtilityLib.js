/*
 * UtilityLib v9 — Simple Membership Checker
 * -----------------------------------------
 * Features:
 *  - Admin Panel: channels, successCallback, failCallback
 *  - Manual-only checking (mcCheck())
 *  - No delays, no batching, no background tasks
 *  - Sends joined[] and missing[] in options
 */

const MC_PANEL = "SimpleMembershipPanel_v9";
const MC_PREFIX = "SMC9_";

/* ------------------------------
   1) ADMIN PANEL SETUP
-------------------------------- */
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: MC_PANEL,
    data: {
      title: "Simple Membership Checker",
      description: "Define channels and callback commands",
      icon: "person-add",
      fields: [
        {
          name: "channels",
          title: "Channels to Check",
          description: "Comma separated (ex: @c1, -10012345)",
          type: "string",
          placeholder: "@channel1, -1001234567890",
          icon: "chatbubbles"
        },
        {
          name: "successCallback",
          title: "Success Callback Command",
          description: "When user joined ALL channels",
          type: "string",
          placeholder: "/onAllJoined",
          icon: "checkmark-circle"
        },
        {
          name: "failCallback",
          title: "Fail Callback Command",
          description: "When user missing ANY channel",
          type: "string",
          placeholder: "/onMissingJoin",
          icon: "close-circle"
        }
      ]
    }
  });

  Bot.sendMessage("Simple Membership Checker Panel Installed ✔");
}

/* ------------------------------
   2) HELPERS
-------------------------------- */
function _opts() {
  return AdminPanel.getPanelValues(MC_PANEL) || {};
}

function _normalizeList() {
  const o = _opts();
  if (!o.channels) return [];

  return o.channels
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

/* ------------------------------
   3) MAIN CHECK — mcCheck()
-------------------------------- */
function mcCheck(passed_options) {
  const channels = _normalizeList();
  const opts = _opts();

  if (channels.length === 0) {
    Bot.sendMessage("❌ No channels defined in Membership Panel");
    return;
  }

  const token = MC_PREFIX + Date.now();

  User.setProperty(MC_PREFIX + "session", {
    token: token,
    total: channels.length,
    pending: channels.length,
    results: {},
    passed: passed_options
  }, "json");

  channels.forEach(ch => {
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: MC_PREFIX + "onCheckOne " + encodeURIComponent(ch),
      on_error: MC_PREFIX + "onCheckErr " + encodeURIComponent(ch),
      bb_options: { token: token }
    });
  });
}

/* ------------------------------
   4) HANDLE SUCCESS RESULT
-------------------------------- */
function onCheckOne() {
  let ch = decodeURIComponent(params);

  let sess = User.getProperty(MC_PREFIX + "session");
  if (!sess) return;
  if (sess.token !== options.bb_options.token) return;

  let status = options.result?.status;
  let ok = ["member", "administrator", "creator"].includes(status);

  sess.results[ch] = ok;
  sess.pending--;
  User.setProperty(MC_PREFIX + "session", sess, "json");

  if (sess.pending === 0) _finish();
}

/* ------------------------------
   5) HANDLE ERROR RESULT
-------------------------------- */
function onCheckErr() {
  let ch = decodeURIComponent(params);

  let sess = User.getProperty(MC_PREFIX + "session");
  if (!sess) return;
  if (sess.token !== options.bb_options.token) return;

  sess.results[ch] = false;
  sess.pending--;
  User.setProperty(MC_PREFIX + "session", sess, "json");

  if (sess.pending === 0) _finish();
}

/* ------------------------------
   6) FINAL RESOLUTION
-------------------------------- */
function _finish() {
  let sess = User.getProperty(MC_PREFIX + "session");
  if (!sess) return;

  let opts = _opts();
  let channels = _normalizeList();

  let missing = [];
  let joined = [];

  channels.forEach(ch => {
    if (sess.results[ch]) joined.push(ch);
    else missing.push(ch);
  });

  User.setProperty(MC_PREFIX + "session", null);

  if (missing.length === 0) {
    if (opts.successCallback) {
      Bot.run({
        command: opts.successCallback,
        options: { joined: joined, missing: [], passed: sess.passed }
      });
    }
  } else {
    if (opts.failCallback) {
      Bot.run({
        command: opts.failCallback,
        options: { joined: joined, missing: missing, passed: sess.passed }
      });
    }
  }
}

/* ------------------------------
   EXPORT API
-------------------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck
});

on(MC_PREFIX + "onCheckOne", onCheckOne);
on(MC_PREFIX + "onCheckErr", onCheckErr);
