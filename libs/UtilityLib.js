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
 * Added: Simplified Membership Checker (fast & grouped)
 *   - mcSetup()
 *   - mcHandle()
 *   - mcCheck(passed_options)
 *   - mcIsMember(chat_id)
 *   - mcNotJoined()
 *   - mcGetChats()
 *   - mcRequireAll()  // helper to protect commands (returns true if allowed)
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
const MC_MAX_CHATS = 10;

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
   Membership Checker - Improved Simple
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
        description: "must be separated by commas (e.g. @channel1, @chat2 or -100123... )",
        type: "string",
        placeholder: "@myChannel, -100123456789",
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
        description: "if the user does not have membership to ANY chat, this command will be executed (single call, options.missing = [..])",
        type: "string",
        placeholder: "/onNeedJoin",
        icon: "warning"
      },
      {
        name: "onJoined",
        title: "onJoined command",
        description: "if the user just received membership to any chat this command will be executed once (options.newly_joined = [..])",
        type: "string",
        placeholder: "/onJoined",
        icon: "person-add"
      },
      {
        name: "onAllJoined",
        title: "onAllJoined command",
        description: "if the user just received membership for ALL chats this command will be executed once",
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
  if (!userData) userData = { lastCheck: 0, chats: {}, token: null, pending: 0 };
  if (!userData.chats) userData.chats = {};
  return userData;
}

function _mcSaveUserData(userData) {
  _mcDebug("_mcSaveUserData: " + JSON.stringify(userData));
  User.setProperty(MC_USER_DATA_KEY, userData, "json");
}

/* split chats string into array (and validation) */
function _mcGetChatsArr() {
  const opts = _mcGetLibOptions();
  if (!opts.chats) return [];
  let chats = opts.chats.split(",").map(c => c.trim()).filter(Boolean);

  // enforce max channels
  if (chats.length > MC_MAX_CHATS) {
    throw new Error("MembershipChecker: maximum allowed channels is " + MC_MAX_CHATS);
  }

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
   passed_options can be any object forwarded to callbacks
*/
function mcCheck(passed_options) {
  const userData = _mcGetUserData();

  _mcDebug("mcCheck start for user: " + user.telegramid);

  if (_mcIsSpamCall(userData.lastCheck)) {
    _mcDebug("mcCheck spam - skipped");
    return;
  }

  const chats = _mcGetChatsArr();
  if (!chats.length) {
    throw new Error("MembershipChecker: no chats configured in Admin Panel");
  }

  // prepare a unique token for this check (to ignore late/old responses)
  const token = Date.now() + "_" + Math.round(Math.random() * 10000);

  // set pending & token & temp storage in userData
  userData.lastCheck = Date.now();
  userData.token = token;
  userData.pending = chats.length;
  userData.temp = { results: {} }; // per-chat boolean
  _mcSaveUserData(userData);

  // launch parallel checks (very small delay)
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    Bot.run({
      command: MC_PREFIX + "checkMembership " + chat,
      options: {
        token: token,
        time: userData.lastCheck,
        bb_options: passed_options
      },
      run_after: 0.01
    });
  }
}

/* Public: handle for before-all (@) command - runs only if delay passed.
   This method is optional for developers.
*/
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
    // pass through token and user bb_options
    on_result: MC_PREFIX + "onCheckMembership " + chat_id,
    on_error: MC_PREFIX + "onError " + chat_id,
    bb_options: options
  });
}

/* Determine membership from Api response object */
function _mcIsMemberFromApiResponse(resp) {
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
  const resp = options; // options contains Api response and our bb_options
  const token = options.bb_options && options.bb_options.token ? options.bb_options.token : options.token;

  // load up-to-date userData
  let userData = _mcGetUserData();

  // validate token (ignore old checks)
  const respToken = options.token || (options.bb_options && options.bb_options.token);
  if (!respToken || respToken !== userData.token) {
    _mcDebug("onCheckMembership: token mismatch or expired for chat " + chat_id + " respToken=" + respToken + " userToken=" + userData.token);
    return;
  }

  // compute membership result
  const isNowMember = _mcIsMemberFromApiResponse(options);

  // save temp results
  if (!userData.temp) userData.temp = { results: {} };
  userData.temp.results[chat_id] = isNowMember;

  // decrement pending
  userData.pending = (userData.pending || 1) - 1;

  _mcDebug("onCheckMembership: chat=" + chat_id + " isMember=" + isNowMember + " pending=" + userData.pending);

  // save progress
  _mcSaveUserData(userData);

  // if still waiting for other responses -> wait
  if (userData.pending > 0) return;

  // all responses collected -> finalize single grouped callback
  _mcFinalizeCheck(options);
}

/* Called on Api error */
function onMCError() {
  // simply decrement pending if token matches and continue
  let chat_id = params.split(" ")[0];
  let userData = _mcGetUserData();

  const respToken = options.token || (options.bb_options && options.bb_options.token);
  if (!respToken || respToken !== userData.token) {
    _mcDebug("onMCError: token mismatch/old for chat " + chat_id);
    return;
  }

  // treat error as "not joined" (safe)
  if (!userData.temp) userData.temp = { results: {} };
  userData.temp.results[chat_id] = false;
  userData.pending = (userData.pending || 1) - 1;
  _mcDebug("onMCError: chat=" + chat_id + " marked not-joined, pending=" + userData.pending);
  _mcSaveUserData(userData);

  if (userData.pending > 0) return;
  _mcFinalizeCheck(options);
}

/* Finalize after all responses arrived */
function _mcFinalizeCheck(apiOptions) {
  let userData = _mcGetUserData();
  const opts = _mcGetLibOptions();

  const chats = _mcGetChatsArr();
  const results = (userData.temp && userData.temp.results) ? userData.temp.results : {};

  // build lists
  let missing = [];
  let newlyJoined = [];

  for (let i = 0; i < chats.length; i++) {
    const ch = chats[i];
    const prev = !!userData.chats[ch];
    const now = !!results[ch];

    if (!now) missing.push(ch);
    if (!prev && now) newlyJoined.push(ch);

    // store final state
    userData.chats[ch] = now;
  }

  // cleanup temp fields
  userData.token = null;
  userData.pending = 0;
  userData.temp = null;
  userData.lastCheck = Date.now();
  _mcSaveUserData(userData);

  _mcDebug("_mcFinalizeCheck: missing=" + JSON.stringify(missing) + " newlyJoined=" + JSON.stringify(newlyJoined));

  // Run grouped callbacks (each executed at most once and only if installed)
  // Priority:
  // 1) if missing -> onNeedJoin (single call) with options.missing = [...]
  // 2) else if newlyJoined -> onJoined (single call) with options.newly_joined = [...]
  // 3) else -> onAllJoined (single call)

  if (missing.length > 0) {
    if (opts.onNeedJoin) {
      Bot.run({
        command: opts.onNeedJoin,
        options: {
          missing: missing,
          bb_options: apiOptions.bb_options
        }
      });
    } else {
      _mcDebug("onNeedJoin not configured - skip");
    }
    return;
  }

  // no missing -> all joined
  if (newlyJoined.length > 0) {
    if (opts.onJoined) {
      Bot.run({
        command: opts.onJoined,
        options: {
          newly_joined: newlyJoined,
          bb_options: apiOptions.bb_options
        }
      });
    } else {
      _mcDebug("onJoined not configured - skip");
    }

    // also if all are joined now -> fire onAllJoined as well (if installed)
    const isAllNow = chats.every(c => userData.chats[c]);
    if (isAllNow && opts.onAllJoined) {
      Bot.run({
        command: opts.onAllJoined,
        options: {
          bb_options: apiOptions.bb_options
        }
      });
    } else {
      _mcDebug("onAllJoined not configured or not all joined - skip");
    }
    return;
  }

  // nothing newly joined and not missing => still joined (all were already joined)
  if (opts.onAllJoined) {
    Bot.run({
      command: opts.onAllJoined,
      options: {
        bb_options: apiOptions.bb_options
      }
    });
  } else {
    _mcDebug("onAllJoined not configured - skip");
  }
}

/* Public helper: isMember (single chat or all) */
function mcIsMember(chat_id) {
  const userData = _mcGetUserData();

  if (chat_id) {
    return !!userData.chats[chat_id];
  }

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

/* Public: require all -> used to protect commands.
   If not joined all -> sends a default join prompt message and returns false.
   If joined -> returns true.
*/
function mcRequireAll() {
  // must be run in user context
  if (!user) {
    _mcDebug("mcRequireAll: no user context");
    return false;
  }

  const chats = _mcGetChatsArr();
  if (!chats.length) {
    throw new Error("MembershipChecker: no chats configured in Admin Panel");
  }

  const userData = _mcGetUserData();
  const missing = chats.filter(c => !userData.chats[c]);

  if (missing.length === 0) return true;

  // send a single combined join prompt (developer may still set callbacks but mcRequireAll shows a single message)
  let text = "⛔ <b>Access blocked</b>\nYou must join the following channels to use this command:\n\n";
  missing.forEach(m => { text += "• " + m + "\n"; });

  // default private channel join link is not known here - dev should include link in /start message
  Api.sendMessage({
    chat_id: user.telegramid,
    text: text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ CHECK", callback_data: "check_membership" }]
      ]
    }
  });

  return false;
}

/* Register membership background handlers */
on(MC_PREFIX + "checkMemberships", function() {
  // iterate chats and run small tasks (legacy)
  const chats = _mcGetChatsArr();
  _mcDebug("checkMemberships: will iterate " + JSON.stringify(chats));
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    Bot.run({
      command: MC_PREFIX + "checkMembership " + chat,
      options: options,
      run_after: 0.01
    });
  }
});

on(MC_PREFIX + "checkMembership", checkMembership);
on(MC_PREFIX + "onCheckMembership", onCheckMembership);
on(MC_PREFIX + "onError", onMCError);

/* ------------------------------
   EXPORT API (merge with existing)
-------------------------------- */
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
  mcGetChats: mcGetChats,
  mcRequireAll: mcRequireAll
});
