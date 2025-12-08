/*
 * Utility Library — v4 (Stable Production)
 * Features:
 *   ping()
 *   iteration(mode)   // formatted, inspect, pick-mode
 *   setupOwner()
 *   onlyAdmin()
 *   addAdmin()
 *   removeAdmin()
 *   showAdminList()
 *
 * Added: Simplified Membership Checker (MembershipCheckerSimple)
 *   - mcSetup()
 *   - mcHandle()
 *   - mcCheck()
 *   - mcIsMember(chat_id)
 *   - mcNotJoined()
 *   - mcGetChats()
 *
 * Internal prefix for membership module: UtilityLib_MC_
 */

let LIB = "UtilityLib_";

const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";

/* ------------------------------
   Membership Checker internal
-------------------------------- */
const MC_PREFIX = "UtilityLib_MC_";
const MC_PANEL  = "MembershipCheckerSimple";
const MC_USER_DATA_KEY = MC_PREFIX + "Data";

/* Basic sender */
function send(to, text) {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: "HTML" });
}

/* Helpers */
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

/* ------------------------------
   OWNER SETUP (run once)
-------------------------------- */
function setupOwner() {
  let owner = getOwner();

  if (owner) {
    send(user.telegramid, "ℹ️ <b>Owner already set:</b> <code>" + owner + "</code>");
    return true;
  }

  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");

  send(user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>."
  );

  return true;
}

/* ------------------------------
   ADMIN CHECK
-------------------------------- */
function onlyAdmin() {
  let owner = getOwner();

  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    );
    return false;
  }

  let admins = getAdmins();

  if (!admins.includes(user.telegramid)) {
    send(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }

  return true;
}

/* ------------------------------
   ADD ADMIN
-------------------------------- */
function addAdmin(id) {
  if (!onlyAdmin()) return false;

  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }

  id = Number(id);

  let admins = getAdmins();

  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is already admin.</b>");
    return false;
  }

  admins.push(id);
  setAdmins(admins);

  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You are now an Admin!</b>");

  return true;
}

/* ------------------------------
   REMOVE ADMIN
-------------------------------- */
function removeAdmin(id) {
  if (!onlyAdmin()) return false;

  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }

  id = Number(id);

  let owner = getOwner();
  if (id === owner) {
    send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>");
    return false;
  }

  let admins = getAdmins();

  if (!admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is not an admin.</b>");
    return false;
  }

  admins = admins.filter(a => a !== id);
  setAdmins(admins);

  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You are no longer an Admin.</b>");

  return true;
}

/* ------------------------------
   SHOW ADMIN LIST
-------------------------------- */
function showAdminList() {
  let owner = getOwner();

  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    );
    return;
  }

  let admins = getAdmins();
  if (admins.length === 0) return send(user.telegramid, "⚠️ <b>No admins found.</b>");

  let msg = "👮 <b>Admins List</b>\n\n";
  let index = 1;

  admins.forEach(id => {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${index}. <code>${id}</code>${role}\n`;
    index++;
  });

  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;

  send(user.telegramid, msg);
}

/* ------------------------------
   PING
-------------------------------- */
function ping() {
  if (options?.result) {
    let latency = Date.now() - options.bb_options.start;

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  Api.sendMessage({
    chat_id: user.telegramid,
    text: "<b>Ping…</b>",
    parse_mode: "HTML",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  });
}

on(LIB + "onPing", ping);

/* ------------------------------
   ITERATION (3 modes)
-------------------------------- */
function iteration(mode) {
  const d = iteration_quota;
  if (!d) return null;

  const enriched = {
    ...d,
    pct: ((d.progress / d.limit) * 100).toFixed(2),
    type: d.quotum_type?.name || "Unknown",
    base_limit: d.quotum_type?.base_limit
  };

  /* PICK MODE (multiple comma-separated keys) */
  if (mode && mode.includes(",")) {
    let keys = mode.split(",").map(k => k.trim());
    let obj = {};
    keys.forEach(k => { obj[k] = enriched[k]; });
    return obj;
  }

  /* SINGLE VALUE MODE */
  if (mode && mode !== "inspect") {
    return enriched[mode];
  }

  /* RAW INSPECT MODE */
  if (mode === "inspect") {
    send(
      user.telegramid,
      "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>"
    );
    return d;
  }

  /* FORMATTED MESSAGE */
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;

  function fmt(t) {
    try { return new Date(t).toLocaleString(); }
    catch { return t; }
  }

  let msg =
    `⚙️ <b>BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${enriched.id}</code>\n` +
    `<b>Type:</b> <code>${enriched.type}</code>\n` +
    `<b>Base Limit:</b> <code>${enriched.base_limit}</code>\n` +
    `<b>Ads Enabled:</b> <code>${enriched.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${enriched.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${enriched.limit}</code>\n` +
    `<b>Used:</b> <code>${enriched.progress}</code>\n` +
    `<b>Usage:</b> <code>${enriched.pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> ${fmt(enriched.started_at)}\n` +
    `<b>Ends:</b> ${fmt(enriched.ended_at)}`;

  send(user.telegramid, msg);
  return enriched;
}

/* ------------------------------
   Membership Checker - Simple
-------------------------------- */

/* Admin Panel setup */
function mcSetup() {
  const panel = {
    title: "Membership checker (simple)",
    description: "Configure chats and callbacks for membership checking (simple version).",
    icon: "person-add",
    fields: [
      {
        name: "chats",
        title: "Chats or channels for checking",
        description: "must be separated by commas (e.g. @channel1, @chat2)",
        type: "string",
        placeholder: "@myChannel, @myChat",
        icon: "chatbubbles"
      },
      {
        name: "checkTime",
        title: "checking delay in minutes",
        description: "the bot will check the user membership for incoming messages once per this interval",
        type: "integer",
        placeholder: "10",
        value: 20,
        icon: "time"
      },
      {
        name: "onNeedJoin",
        title: "onNeedJoin command",
        description: "if the user does not have membership to ANY chat, this command will be executed",
        type: "string",
        placeholder: "/onNeedJoin",
        icon: "warning"
      },
      {
        name: "onJoined",
        title: "onJoined command",
        description: "if the user just received membership for ANY chat this command will be executed",
        type: "string",
        placeholder: "/onJoined",
        icon: "person-add"
      },
      {
        name: "onAllJoined",
        title: "onAllJoined command",
        description: "if the user just received membership for ALL chats this command will be executed",
        type: "string",
        placeholder: "/onAllJoined",
        icon: "happy"
      },
      {
        name: "debug",
        title: "debug info",
        description: "turn on for debug info",
        type: "checkbox",
        value: false,
        icon: "hammer"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: MC_PANEL,
    data: panel
  });

  Bot.sendMessage("Membership checker (simple): Admin panel created.");
}

/* Get lib options from admin panel */
function _mcGetLibOptions() {
  return AdminPanel.getPanelValues(MC_PANEL) || {};
}

/* Debug helper */
function _mcDebug(info) {
  const opts = _mcGetLibOptions();
  if (!opts.debug) return;
  try {
    Api.sendMessage({
      text: "<b>MC Debug</b>\n\n" + String(info),
      parse_mode: "HTML"
    });
  } catch (e) { /* ignore debug failures */ }
}

/* User data helpers */
function _mcGetUserData() {
  if (!user) {
    throw new Error("MembershipChecker: user is not exist. Use mcCheck only in user context.");
  }
  let userData = User.getProperty(MC_USER_DATA_KEY);
  if (!userData) userData = { lastCheck: 0, chats: {} };
  if (!userData.chats) userData.chats = {};
  return userData;
}

function _mcSaveUserData(userData) {
  _mcDebug("_mcSaveUserData: " + JSON.stringify(userData));
  User.setProperty(MC_USER_DATA_KEY, userData, "json");
}

/* split chats string into array */
function _mcGetChatsArr() {
  const opts = _mcGetLibOptions();
  if (!opts.chats) return [];
  let chats = opts.chats.split(",").map(c => c.trim()).filter(Boolean);
  return chats;
}

/* can run handle again? */
function _mcCanRunHandleAgain(curTime) {
  if (!curTime) return false;
  const opts = _mcGetLibOptions();
  if (!opts.checkTime) {
    throw new Error("MembershipChecker: please setup checking delay in Admin Panel");
  }
  let duration = Date.now() - curTime; // ms
  duration = duration / 1000 / 60; // minutes
  return duration > parseInt(opts.checkTime);
}

/* spam guard: only 1 check per 2 seconds per user */
function _mcIsSpamCall(lastCheck) {
  if (!lastCheck) return false;
  return (Date.now() - lastCheck) < 2000;
}

/* Public: manual check - runs immediate checks for all chats
   options can be any object to forward to callbacks
*/
function mcCheck(passed_options) {
  const userData = _mcGetUserData();

  _mcDebug("mcCheck for userData: " + JSON.stringify(userData));

  if (_mcIsSpamCall(userData.lastCheck)) {
    _mcDebug("mcCheck spam - skipped");
    return;
  }

  userData.lastCheck = Date.now();
  _mcSaveUserData(userData);

  const chats = _mcGetChatsArr();
  if (!chats.length) {
    throw new Error("MembershipChecker: no chats configured in Admin Panel");
  }

  // create background tasks for each chat
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    Bot.run({
      command: MC_PREFIX + "checkMembership " + chat,
      options: {
        time: userData.lastCheck,
        bb_options: passed_options
      },
      run_after: 1
    });
  }
}

/* Public: handle for before-all (@) command - runs only if delay passed */
function mcHandle(passed_options) {
  if (!user) return; // only for private user context

  const opts = _mcGetLibOptions();
  if (!opts.chats) {
    _mcDebug("mcHandle: no chats set - skip");
    return;
  }

  // prevent reacting to internal commands (simple)
  if (message && message.indexOf(MC_PREFIX) === 0) {
    _mcDebug("mcHandle: internal command - skip");
    return;
  }

  const userData = _mcGetUserData();
  if (_mcCanRunHandleAgain(userData.lastCheck)) {
    _mcDebug("mcHandle: delay passed -> mcCheck will be executed");
    return mcCheck(passed_options);
  }

  _mcDebug("mcHandle: checking not required (delay not passed)");
}

/* Check membership for a single chat (this command executed in background) */
function checkMembership() {
  // params contains chat id (with possible @) as first token
  let chat_id = params.split(" ")[0];

  Api.getChatMember({
    chat_id: chat_id,
    user_id: user.telegramid,
    on_result: MC_PREFIX + "onCheckMembership " + chat_id,
    on_error: MC_PREFIX + "onError " + chat_id,
    bb_options: options // pass options for callbacks
  });
}

/* Determine membership from Api response object */
function _mcIsMemberFromApiResponse(resp) {
  // resp.result.status may be 'member', 'administrator', 'creator', 'left', 'kicked', etc.
  try {
    const status = resp.result.status;
    return ["member", "administrator", "creator"].includes(status);
  } catch (e) {
    return false;
  }
}

/* Called when Api.getChatMember succeeded (background) */
function onCheckMembership() {
  let chat_id = params.split(" ")[0];

  let userData = _mcGetUserData();
  // ensure lastCheck from calling options.time if provided
  if (options && options.time) {
    userData.lastCheck = options.time;
  }

  _mcDebug("onCheckMembership: chat=" + chat_id + " options=" + JSON.stringify(options) + " userData=" + JSON.stringify(userData));

  const isNowMember = _mcIsMemberFromApiResponse(options);

  const prevState = !!userData.chats[chat_id];
  userData.chats[chat_id] = isNowMember;
  _mcSaveUserData(userData);

  const opts = _mcGetLibOptions();

  // If not member -> run onNeedJoin
  if (!isNowMember) {
    if (opts.onNeedJoin) {
      _mcDebug("Running onNeedJoin for " + chat_id);
      Bot.run({
        command: opts.onNeedJoin,
        options: {
          chat_id: chat_id,
          result: options.result,
          bb_options: options.bb_options
        }
      });
    }
    return;
  }

  // is member now
  // if previously not a member -> just joined
  if (!prevState && isNowMember) {
    if (opts.onJoined) {
      _mcDebug("Running onJoined for " + chat_id);
      Bot.run({
        command: opts.onJoined,
        options: {
          chat_id: chat_id,
          result: options.result,
          bb_options: options.bb_options
        }
      });
    }
  }

  // check if user joined ALL chats now
  const allChats = _mcGetChatsArr();
  const stillNotJoined = allChats.filter(c => !userData.chats[c]);
  if (stillNotJoined.length === 0) {
    // user is member of all chats
    if (opts.onAllJoined) {
      _mcDebug("Running onAllJoined (user joined all chats)");
      Bot.run({
        command: opts.onAllJoined,
        options: {
          result: options.result,
          bb_options: options.bb_options
        }
      });
    }
  }
}

/* Called on Api error */
function onMCError() {
  _mcDebug("onMCError: for chat=" + params + " options=" + JSON.stringify(options));
  const opts = _mcGetLibOptions();
  // no dedicated onError callback in minimal version - we won't run any command
  // But if someone put an "onNeedJoin" as error handler, we avoid executing it unexpectedly.
}

/* Public helper: isMember (single chat or all) */
function mcIsMember(chat_id) {
  const opts = _mcGetLibOptions();
  const userData = _mcGetUserData();

  if (chat_id) {
    return !!userData.chats[chat_id];
  }

  // all chats
  const chats = _mcGetChatsArr();
  if (!chats.length) {
    throw new Error("MembershipChecker: no chats configured in Admin Panel");
  }

  return chats.every(c => !!userData.chats[c]);
}

/* Public: get not joined chats */
function mcNotJoined() {
  const chats = _mcGetChatsArr();
  const userData = _mcGetUserData();
  const notJoined = chats.filter(c => !userData.chats[c]);
  return notJoined.join(", ");
}

/* Public: get chats (raw string from admin panel) */
function mcGetChats() {
  const opts = _mcGetLibOptions();
  return opts.chats || "";
}

/* Register membership background handlers */
on(MC_PREFIX + "checkMemberships", function() {
  // iterate chats and run small tasks
  const chats = _mcGetChatsArr();
  _mcDebug("checkMemberships: will iterate " + JSON.stringify(chats));
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    Bot.run({
      command: MC_PREFIX + "checkMembership " + chat,
      options: options,
      run_after: 1
    });
  }
});

on(MC_PREFIX + "checkMembership", checkMembership);
on(MC_PREFIX + "onCheckMembership", onCheckMembership);
on(MC_PREFIX + "onError", onMCError);

/* ------------------------------
   EXPORT API (merge with existing)
-------------------------------- */
/* Note: keep existing exported methods and append membership API */
publish({
  ping: ping,
  iteration: iteration,
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  adminList: getAdmins,
  showAdminList: showAdminList,
  owner: getOwner,

  /* membership API */
  mcSetup: mcSetup,
  mcHandle: mcHandle,
  mcCheck: mcCheck,
  mcIsMember: mcIsMember,
  mcNotJoined: mcNotJoined,
  mcGetChats: mcGetChats
});
