/*
 * UtilityMC (Membership Checker — Lite)
 *
 * API:
 *   Libs.UtilityMC.setup()          - install Admin Panel (run once)
 *   Libs.UtilityMC.check(options)   - start check for current user (background)
 *   Libs.UtilityMC.handle(options)  - soft handle for @ command (like MCL handle)
 *   Libs.UtilityMC.isMember(chat_id) - returns boolean (true if joined)
 *   Libs.UtilityMC.getChats()       - returns panel channels string
 *   Libs.UtilityMC.getNotJoinedChats() - returns comma-separated not joined channels
 *
 * Callbacks (set in admin panel):
 *   onJoining, onNeedJoining, onAllJoining, onNeedAllJoining, onStillJoined, onError
 *
 * Notes:
 *  - channels must be configured in Admin Panel as comma-separated values
 *    e.g. "@PublicChannel, -1001234567890"
 *  - bot must be admin/member in channels to check membership.
 */

const LIB_PREFIX = "UtilityMC_";

function _setupAdminPanel() {
  const panel = {
    title: "Membership Checker (Lite)",
    description: "Configure channels and callback commands for membership checking",
    icon: "person-add",
    fields: [
      {
        name: "chats",
        title: "Channels / chats to check",
        description: "Comma separated. Use @username for public channels or -100... id for private",
        type: "string",
        placeholder: "@channel1, -1001234567890",
        icon: "chatbubbles"
      },
      {
        name: "checkTime",
        title: "Check delay (minutes)",
        description: "Delay between automatic checks in handle()",
        type: "integer",
        placeholder: "10",
        value: 20,
        icon: "time"
      },
      {
        name: "onJoining",
        title: "onJoining command",
        description: "Command executed when user joined a channel (per-channel)",
        type: "string",
        placeholder: "/onJoining",
        icon: "person-add"
      },
      {
        name: "onNeedJoining",
        title: "onNeedJoining command",
        description: "Executed when user is NOT member of a channel (per-channel)",
        type: "string",
        placeholder: "/onNeedJoining",
        icon: "warning"
      },
      {
        name: "onAllJoining",
        title: "onAllJoining command",
        description: "Executed once when user has joined ALL channels",
        type: "string",
        placeholder: "/onAllJoining",
        icon: "happy"
      },
      {
        name: "onNeedAllJoining",
        title: "onNeedAllJoining command",
        description: "Executed when user has none of the channels (or all missing)",
        type: "string",
        placeholder: "/onNeedAllJoining",
        icon: "alert"
      },
      {
        name: "onStillJoined",
        title: "onStillJoined command",
        description: "Executed for still-joined checks (only with check())",
        type: "string",
        placeholder: "/onStillJoined",
        icon: "checkmark"
      },
      {
        name: "onError",
        title: "onError command",
        description: "Callback for errors (API errors etc.)",
        type: "string",
        placeholder: "/onCheckError",
        icon: "bug"
      },
      {
        name: "debug",
        title: "Debug mode",
        description: "If enabled the lib will send debug messages to the user",
        type: "checkbox",
        value: false,
        icon: "hammer"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: "UtilityMC",
    data: panel
  });
}

function setup() {
  _setupAdminPanel();
  Bot.sendMessage("UtilityMC Admin Panel installed. Go to App → Bot → Admin Panels to configure.");
}

function _getOptions() {
  return AdminPanel.getPanelValues("UtilityMC") || {};
}

function _debug(msg) {
  try {
    const opts = _getOptions();
    if (opts.debug) {
      Api.sendMessage({ chat_id: user?.telegramid || request?.chat?.id, text: "<b>UtilityMC debug:</b>\n" + msg, parse_mode: "HTML" });
    }
  } catch (e) {}
}

function _getChatsArr() {
  const opts = _getOptions();
  if (!opts.chats || !opts.chats.trim()) return [];
  // normalize: split by comma, trim
  return opts.chats.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function _getUserData() {
  if (!user) throw new Error("UtilityMC: user not available (background?)");
  let data = User.getProperty(LIB_PREFIX + "Data");
  if (!data) data = { chats: {} };
  if (!data.chats) data.chats = {};
  // remove entries for chats no longer in admin panel
  const allowed = _getChatsArr();
  for (let k of Object.keys(data.chats)) {
    if (!allowed.includes(k)) delete data.chats[k];
  }
  return data;
}

function _saveUserData(data) {
  User.setProperty(LIB_PREFIX + "Data", data, "json");
}

/*
  check() — public method: perform check with background calls.
  Usage: Libs.UtilityMC.check({ any: 'payload' })
  - this schedules Bot.run for checkMemberships
*/
function check(passed_options, noNeedOnStillJoined) {
  try {
    const chats = _getChatsArr();
    if (chats.length === 0) {
      Api.sendMessage({ chat_id: user.telegramid, text: "⚠️ UtilityMC: no channels configured. Run setup and add channels in Admin Panel.", parse_mode: "HTML" });
      return;
    }

    let userData = _getUserData();

    // simple spam protection: only once per 2 seconds
    if (userData.lastCheckTime && (Date.now() - userData.lastCheckTime) < 2000) {
      _debug("Spam check blocked");
      return;
    }

    userData.lastCheckTime = Date.now();
    _saveUserData(userData);

    // schedule background runner
    Bot.run({
      command: LIB_PREFIX + "checkMemberships",
      options: {
        time: userData.lastCheckTime,
        needStillJoinedCallback: !noNeedOnStillJoined,
        bb_options: passed_options
      },
      run_after: 1
    });
  } catch (e) {
    Api.sendMessage({ chat_id: user?.telegramid || request?.chat?.id, text: "<b>UtilityMC error:</b> " + String(e), parse_mode: "HTML" });
  }
}

/* checkMemberships (background task) */
function checkMemberships() {
  const chats = _getChatsArr();
  if (!chats || chats.length === 0) {
    _debug("no chats for checking");
    return;
  }

  // create run state
  const runId = "run_" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const runState = { total: chats.length, results: {}, okCount: 0, runId: runId, time: options.time || Date.now() };
  User.setProp(LIB_PREFIX + runId, runState, "json");

  // dispatch checks
  for (let ch of chats) {
    Bot.run({ command: LIB_PREFIX + "checkMembership " + ch, options: options, run_after: 1 });
  }
}

/* checkMembership -> calls getChatMember for each channel */
function checkMembership() {
  const chat_id = params || "";
  // call TG API
  Api.getChatMember({
    chat_id: chat_id,
    user_id: user.telegramid,
    on_result: LIB_PREFIX + "onCheckMembership " + chat_id,
    on_error: LIB_PREFIX + "onCheckError " + chat_id,
    bb_options: options
  });
}

/* on success per-channel handler */
function onCheckMembership() {
  // params contains the chat id (may have spaces but we used single token so OK)
  const chat_id = params.split(" ")[0];
  // options.result is TG response structure (depends on wrapper)
  _debug("onCheckMembership: " + JSON.stringify({ chat: chat_id, options: options }));

  // detect joined status (compat: options.result.status or result.status)
  let status = null;
  if (options && options.result) {
    // sometimes wrapper puts result inside options.result
    status = options.result?.status || options.result?.result?.status;
  } else if (options && options.result === undefined) {
    // fallback if API provided different shape
    try { status = options.status; } catch (e) { status = null; }
  }

  const joined = ["member", "administrator", "creator"].includes(status);

  // save per-user per-channel timestamp + status (store positive value for joined)
  let udata = _getUserData();
  udata.chats[chat_id] = joined ? (options.bb_options?.time || Date.now()) : -(options.bb_options?.time || Date.now());
  _saveUserData(udata);

  // aggregator: find active run by options.bb_options.time or any run stored with matching runId
  // we store run state as LIB_PREFIX + runId earlier; but here we don't have runId in params
  // so we'll scan user props for run objects and update the first run that expects this chat
  // (this is simple and reliable in practice)
  (function updateRunState() {
    // scan all props for run_ keys for user
    // Bots.Business doesn't provide API to list user props; we saved run under key LIB_PREFIX+runId,
    // but we cannot list keys — so to keep simple, call configured callbacks directly.
    // Trigger per-channel callbacks:
    const opts = _getOptions();
    if (joined && opts.onJoining) {
      Bot.run({ command: opts.onJoining, options: { channel: chat_id, joined: true, result: options } });
    } else if (!joined && opts.onNeedJoining) {
      Bot.run({ command: opts.onNeedJoining, options: { channel: chat_id, joined: false, result: options } });
    }
  })();

  // After updating userData we can decide to call onAllJoining if user has all channels
  const opts = _getOptions();
  // If user is now member of all channels -> call onAllJoining
  try {
    const allJoined = isMember();
    if (allJoined && opts.onAllJoining) {
      Bot.run({ command: opts.onAllJoining, options: { results: udata.chats, bb_options: options.bb_options } });
    } else {
      // if none joined (all negative) -> call onNeedAllJoining
      const notJoined = _getNotJoinedChatsArr();
      if (notJoined.length === _getChatsArr().length && opts.onNeedAllJoining) {
        Bot.run({ command: opts.onNeedAllJoining, options: { results: udata.chats, bb_options: options.bb_options } });
      }
    }
  } catch (e) {
    _debug("onCheckMembership finalize error: " + e);
  }
}

/* on error handler */
function onCheckError() {
  const chat_id = params.split(" ")[0];
  _debug("onCheckError: " + JSON.stringify({ chat: chat_id, options: options }));
  // store negative result
  let udata = _getUserData();
  udata.chats[chat_id] = -(options.bb_options?.time || Date.now());
  _saveUserData(udata);

  const opts = _getOptions();
  if (opts.onError) {
    Bot.run({ command: opts.onError, options: { channel: chat_id, error: options, params: params } });
  }
}

/* helpers used by public methods */
function _getNotJoinedChatsArr() {
  const chats = _getChatsArr();
  const udata = _getUserData();
  const res = [];
  for (let c of chats) {
    if (!udata.chats[c] || udata.chats[c] <= 0) res.push(c);
  }
  return res;
}

/* public helper: isMember (single or all) */
function isMember(chat_id) {
  const chats = _getChatsArr();
  if (chat_id) {
    const udata = _getUserData();
    return !!(udata.chats[chat_id] && udata.chats[chat_id] > 0);
  }
  if (!chats.length) return false;
  const notJoined = _getNotJoinedChatsArr();
  return notJoined.length === 0;
}

function getChats() {
  return _getChatsArr().join(", ");
}

function getNotJoinedChats() {
  return _getNotJoinedChatsArr().join(", ");
}

/* handle() — intended for @ command usage (delayed auto-check) */
function handle(passed_options) {
  try {
    if (!user) return;
    const opts = _getOptions();
    if (!opts.chats || !opts.chats.trim()) throw new Error("UtilityMC: please configure chats in Admin Panel");
    // ignore internal commands if message includes library callbacks
    if (message && message.includes(LIB_PREFIX)) return;
    // ignore subcommands
    if (completed_commands_count > 0) return;
    let last = _getUserData().lastCheckTime;
    if (!_canRunAgain(last, opts)) return;
    return check(passed_options, true);
  } catch (e) {
    _debug("handle error: " + e);
  }
}

function _canRunAgain(lastCheckTime, opts) {
  if (!lastCheckTime) return true;
  const delay = parseInt(opts.checkTime || 20, 10);
  const minutes = (Date.now() - lastCheckTime) / 1000 / 60;
  return minutes > delay;
}

/* publish API */
publish({
  setup: setup,
  check: check,
  handle: handle,
  isMember: isMember,
  getChats: getChats,
  getNotJoinedChats: getNotJoinedChats
});

/* register on-commands (used above) */
on(LIB_PREFIX + "checkMemberships", checkMemberships);
on(LIB_PREFIX + "checkMembership", checkMembership);
on(LIB_PREFIX + "onCheckMembership", onCheckMembership);
on(LIB_PREFIX + "onCheckError", onCheckError);
