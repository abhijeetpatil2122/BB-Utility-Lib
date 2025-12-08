/*
 * Utility Library — v4 (Stable Production)
 * Features:
 *   ping(), iteration(), setupOwner(), onlyAdmin(), addAdmin(), removeAdmin(), showAdminList()
 *
 * Membership Checker — FAST batch-based (direct Api.getChatMember calls)
 * - Batches of 3 channels to avoid BB timeout
 * - Max 10 channels
 * - Admin Panel controls: chats, checkTime, batchDelay (seconds), onNeedJoin, onJoined, onAllJoined, debug
 * - Public API:
 *    mcSetup()
 *    mcCheckAll(passed_options)   // starts fast check (batches)
 *    mcHandle(passed_options)     // optional auto-handle in @ (uses checkTime)
 *    mcIsMember(chat_id)          // check stored state
 *    mcNotJoined()
 *    mcGetChats()
 *    mcRequire()                  // protect command, shows check button and returns false if not joined
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
const MC_BATCH_SIZE = 3; // 3 per batch to avoid BB timeouts

/* Basic sender */
function send(to, text) {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: "HTML" });
}

/* ------------------------------
   Admin / Owner utils (unchanged)
-------------------------------- */
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

function setupOwner() {
  let owner = getOwner();
  if (owner) {
    send(user.telegramid, "ℹ️ <b>Owner already set:</b> <code>" + owner + "</code>");
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  send(user.telegramid, "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>.");
  return true;
}

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

function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let admins = getAdmins();
  if (admins.includes(id)) { send(user.telegramid, "⚠️ <b>User is already admin.</b>"); return false; }
  admins.push(id);
  setAdmins(admins);
  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let owner = getOwner();
  if (id === owner) { send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>"); return false; }
  let admins = getAdmins();
  if (!admins.includes(id)) { send(user.telegramid, "⚠️ <b>User is not an admin.</b>"); return false; }
  admins = admins.filter(a => a !== id);
  setAdmins(admins);
  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

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
   PING & ITERATION (unchanged)
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

function iteration(mode) {
  const d = iteration_quota;
  if (!d) return null;
  const enriched = {
    ...d,
    pct: ((d.progress / d.limit) * 100).toFixed(2),
    type: d.quotum_type?.name || "Unknown",
    base_limit: d.quotum_type?.base_limit
  };
  if (mode && mode.includes(",")) {
    let keys = mode.split(",").map(k => k.trim());
    let obj = {};
    keys.forEach(k => { obj[k] = enriched[k]; });
    return obj;
  }
  if (mode && mode !== "inspect") {
    return enriched[mode];
  }
  if (mode === "inspect") {
    send(user.telegramid, "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>");
    return d;
  }
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t) { try { return new Date(t).toLocaleString(); } catch { return t; } }
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
   Membership Checker - Fast batch design
-------------------------------- */

/* Admin Panel setup */
function mcSetup() {
  const panel = {
    title: "Membership checker (fast, batched)",
    description: "Configure chats and callbacks for fast membership checking. Max 10 chats.",
    icon: "person-add",
    fields: [
      {
        name: "chats",
        title: "Chats or channels for checking",
        description: "must be separated by commas (e.g. @channel1, -100123456789)",
        type: "string",
        placeholder: "@myChannel, -100123456789",
        icon: "chatbubbles"
      },
      {
        name: "checkTime",
        title: "checking delay in minutes",
        description: "the bot will check the user membership for incoming messages once per this interval (used by mcHandle())",
        type: "integer",
        placeholder: "10",
        value: 20,
        icon: "time"
      },
      {
        name: "batchDelay",
        title: "batch delay in seconds",
        description: "delay between batches; set 1 (one second) or 0.5 etc. Use integer seconds if you prefer.",
        type: "integer",
        placeholder: "1",
        value: 1,
        icon: "timer"
      },
      {
        name: "onNeedJoin",
        title: "onNeedJoin command",
        description: "if the user misses ANY chat, this command will be executed (options.missing = [...])",
        type: "string",
        placeholder: "/onNeedJoin",
        icon: "warning"
      },
      {
        name: "onJoined",
        title: "onJoined command",
        description: "if the user joined some channels but not all, this command will be executed (options.newly_joined = [...])",
        type: "string",
        placeholder: "/onJoined",
        icon: "person-add"
      },
      {
        name: "onAllJoined",
        title: "onAllJoined command",
        description: "if the user has joined ALL channels, this command will be executed",
        type: "string",
        placeholder: "/onAllJoined",
        icon: "happy"
      },
      {
        name: "debug",
        title: "debug info",
        description: "turn on for debug info messages",
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

  Bot.sendMessage("Membership checker (fast): Admin panel created.");
}

/* Get options */
function _mcGetLibOptions() {
  return AdminPanel.getPanelValues(MC_PANEL) || {};
}

/* Debug helper */
function _mcDebug(info) {
  const opts = _mcGetLibOptions();
  if (!opts.debug) return;
  try { Api.sendMessage({ text: "<b>MC Debug</b>\n\n" + String(info), parse_mode: "HTML" }); }
  catch (e) { /* ignore debug failures */ }
}

/* User data helpers */
function _mcGetUserData() {
  if (!user) throw new Error("MembershipChecker: user context required");
  let userData = User.getProperty(MC_USER_DATA_KEY);
  if (!userData) userData = { lastCheck: 0, chats: {}, token: null, pending: 0, temp: null };
  if (!userData.chats) userData.chats = {};
  return userData;
}
function _mcSaveUserData(userData) {
  _mcDebug("_mcSaveUserData: " + JSON.stringify(userData));
  User.setProperty(MC_USER_DATA_KEY, userData, "json");
}

/* parse chats and validate */
function _mcGetChatsArr() {
  const opts = _mcGetLibOptions();
  if (!opts.chats) return [];
  let chats = opts.chats.split(",").map(c => c.trim()).filter(Boolean);
  if (chats.length > MC_MAX_CHATS) throw new Error("MembershipChecker: maximum allowed channels is " + MC_MAX_CHATS);
  return chats;
}

/* can run handle again? */
function _mcCanRunHandleAgain(curTime) {
  if (!curTime) return false;
  const opts = _mcGetLibOptions();
  if (!opts.checkTime) throw new Error("MembershipChecker: please setup checking delay in Admin Panel");
  let duration = Date.now() - curTime; // ms
  duration = duration / 1000 / 60; // minutes
  return duration > parseInt(opts.checkTime);
}

/* spam guard: only 1 check per 2 seconds per user */
function _mcIsSpamCall(lastCheck) {
  if (!lastCheck) return false;
  return (Date.now() - lastCheck) < 2000;
}

/* Public: mcCheckAll - fast batched check */
function mcCheckAll(passed_options) {
  const userData = _mcGetUserData();
  if (_mcIsSpamCall(userData.lastCheck)) {
    _mcDebug("mcCheckAll: spam skip");
    return;
  }

  const chats = _mcGetChatsArr();
  if (!chats.length) throw new Error("MembershipChecker: no chats configured in Admin Panel");

  // prepare token and pending count
  const token = Date.now() + "_" + Math.round(Math.random() * 10000);
  userData.token = token;
  userData.pending = chats.length;
  userData.temp = { results: {} };
  userData.lastCheck = Date.now();
  _mcSaveUserData(userData);

  const opts = _mcGetLibOptions();
  const batchDelay = parseFloat(opts.batchDelay || 1);

  // split into batches of MC_BATCH_SIZE
  const batches = [];
  for (let i = 0; i < chats.length; i += MC_BATCH_SIZE) {
    batches.push(chats.slice(i, i + MC_BATCH_SIZE));
  }

  _mcDebug("mcCheckAll: scheduling " + batches.length + " batches, token=" + token);

  // schedule batches using Bot.run with cumulative run_after
  for (let i = 0; i < batches.length; i++) {
    const runAfter = i === 0 ? 0.01 : batchDelay * i;
    Bot.run({
      command: MC_PREFIX + "checkBatch " + i,
      options: {
        token: token,
        batchIndex: i,
        chats: batches[i],
        bb_options: passed_options
      },
      run_after: runAfter
    });
  }
}

/* mcHandle - optional to use in @ (uses checkTime) */
function mcHandle(passed_options) {
  if (!user) return;
  const opts = _mcGetLibOptions();
  if (!opts.chats) { _mcDebug("mcHandle: no chats"); return; }
  if (message && message.indexOf(MC_PREFIX) === 0) { _mcDebug("mcHandle: internal"); return; }
  const userData = _mcGetUserData();
  if (_mcCanRunHandleAgain(userData.lastCheck)) return mcCheckAll(passed_options);
  _mcDebug("mcHandle: skip - not time yet");
}

/* checkBatch command - checks up to 3 chats using direct Api.getChatMember calls */
function checkBatch() {
  // params: batchIndex (not critical here)
  // options: { token, chats: [..], bb_options }
  const chats = options.chats || [];
  const token = options.token;
  if (!token) {
    _mcDebug("checkBatch: missing token, abort");
    return;
  }

  _mcDebug("checkBatch: idx=" + options.batchIndex + " chats=" + JSON.stringify(chats));

  // For each chat in batch call Api.getChatMember with bb_options containing token
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    Api.getChatMember({
      chat_id: chat,
      user_id: user.telegramid,
      on_result: MC_PREFIX + "onCheckMember " + chat,
      on_error: MC_PREFIX + "onCheckError " + chat,
      bb_options: { token: token, batchIndex: options.batchIndex, bb_options: options.bb_options }
    });
  }
}

/* onCheckMember - called by Api.getChatMember success */
function onCheckMember() {
  const chat_id = params.split(" ")[0];
  const apiResp = options; // this object contains .result and .bb_options
  const respToken = (options.bb_options && options.bb_options.token) || options.token;

  let userData = _mcGetUserData();
  if (!respToken || respToken !== userData.token) {
    _mcDebug("onCheckMember: token mismatch for chat " + chat_id);
    return;
  }

  const isMember = _mcIsMemberFromApiResponse(apiResp);
  if (!userData.temp) userData.temp = { results: {} };
  userData.temp.results[chat_id] = isMember;
  userData.pending = (userData.pending || 1) - 1;
  _mcDebug("onCheckMember: chat=" + chat_id + " isMember=" + isMember + " pending=" + userData.pending);
  _mcSaveUserData(userData);

  if (userData.pending > 0) return;
  // all done -> finalize
  _mcFinalizeCheck(apiResp);
}

/* onCheckError - treat as not joined and continue */
function onCheckError() {
  const chat_id = params.split(" ")[0];
  const respToken = (options.bb_options && options.bb_options.token) || options.token;
  let userData = _mcGetUserData();
  if (!respToken || respToken !== userData.token) {
    _mcDebug("onCheckError: token mismatch for chat " + chat_id);
    return;
  }
  if (!userData.temp) userData.temp = { results: {} };
  userData.temp.results[chat_id] = false;
  userData.pending = (userData.pending || 1) - 1;
  _mcDebug("onCheckError: chat=" + chat_id + " marked not-joined, pending=" + userData.pending);
  _mcSaveUserData(userData);

  if (userData.pending > 0) return;
  _mcFinalizeCheck(options);
}

/* helper to interpret Api response */
function _mcIsMemberFromApiResponse(resp) {
  try {
    const status = resp.result.status;
    return ["member", "administrator", "creator"].includes(status);
  } catch (e) { return false; }
}

/* finalize after all checks */
function _mcFinalizeCheck(apiOptions) {
  let userData = _mcGetUserData();
  const opts = _mcGetLibOptions();
  const chats = _mcGetChatsArr();
  const results = (userData.temp && userData.temp.results) ? userData.temp.results : {};

  let missing = [];
  let newlyJoined = [];

  for (let i = 0; i < chats.length; i++) {
    const ch = chats[i];
    const prev = !!userData.chats[ch];
    const now = !!results[ch];
    if (!now) missing.push(ch);
    if (!prev && now) newlyJoined.push(ch);
    userData.chats[ch] = now;
  }

  // cleanup
  userData.token = null;
  userData.pending = 0;
  userData.temp = null;
  userData.lastCheck = Date.now();
  _mcSaveUserData(userData);

  _mcDebug("_mcFinalizeCheck: missing=" + JSON.stringify(missing) + " newlyJoined=" + JSON.stringify(newlyJoined));

  // callbacks logic:
  // 1) If missing exist -> onNeedJoin once
  if (missing.length > 0) {
    if (opts.onNeedJoin) {
      Bot.run({ command: opts.onNeedJoin, options: { missing: missing, bb_options: apiOptions.bb_options } });
    } else { _mcDebug("onNeedJoin not configured - skip"); }
    return;
  }

  // 2) No missing -> user is member of all
  // If newlyJoined > 0 and user previously had missing -> call onAllJoined (only) to avoid double messages
  // If newlyJoined > 0 but still had some missing earlier? Already handled by missing branch.
  // So here: either newlyJoined>0 or 0 but all joined -> in both cases call onAllJoined (single)
  if (opts.onAllJoined) {
    Bot.run({ command: opts.onAllJoined, options: { newly_joined: newlyJoined, bb_options: apiOptions.bb_options } });
  } else {
    _mcDebug("onAllJoined not configured - skip");
  }
}

/* Public: isMember / notJoined / getChats */
function mcIsMember(chat_id) {
  const userData = _mcGetUserData();
  if (chat_id) return !!userData.chats[chat_id];
  const chats = _mcGetChatsArr();
  if (!chats.length) throw new Error("MembershipChecker: no chats configured in Admin Panel");
  return chats.every(c => !!userData.chats[c]);
}
function mcNotJoined() {
  const chats = _mcGetChatsArr();
  const userData = _mcGetUserData();
  const notJoined = chats.filter(c => !userData.chats[c]);
  return notJoined.join(", ");
}
function mcGetChats() { const opts = _mcGetLibOptions(); return opts.chats || ""; }

/* mcRequire: helper to protect a command; returns true if allowed, otherwise shows a single join prompt + check button and returns false */
function mcRequire() {
  if (!user) { _mcDebug("mcRequire: no user"); return false; }
  const chats = _mcGetChatsArr();
  if (!chats.length) throw new Error("MembershipChecker: no chats configured in Admin Panel");
  const userData = _mcGetUserData();
  const missing = chats.filter(c => !userData.chats[c]);
  if (missing.length === 0) return true;
  // send single prompt
  let text = "⛔ <b>Access blocked</b>\nYou must join the following channels to use this command:\n\n";
  missing.forEach(m => { text += "• " + m + "\n"; });
  Api.sendMessage({
    chat_id: user.telegramid,
    text: text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "✅ CHECK", callback_data: "check_membership" }]] }
  });
  return false;
}

/* Register background handlers */
on(MC_PREFIX + "checkBatch", checkBatch);
on(MC_PREFIX + "onCheckMember", onCheckMember);
on(MC_PREFIX + "onCheckError", onCheckError);

/* export API */
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
  mcCheckAll: mcCheckAll,
  mcIsMember: mcIsMember,
  mcNotJoined: mcNotJoined,
  mcGetChats: mcGetChats,
  mcRequire: mcRequire
});
