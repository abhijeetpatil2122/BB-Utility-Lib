/*
 UtilityLib v3
 - ping()
 - iteration(mode)
 - admin system (owner/admins)
 - membership system (setup/update/remove/check + callbacks)
*/

let LIB = "UtilityLib_";
const OWNER_KEY = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const JOIN_MSG_KEY = LIB + "join_msg";
const CHANNELS_KEY = LIB + "membership_channels";
const CHECK_PREFIX = LIB + "CHECK_";

function send(to, text, parse = "HTML") {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: parse });
}

/* -----------------------
   Admin / Owner Helpers
   ----------------------- */
function getOwner() {
  return Bot.getProperty(OWNER_KEY);
}
function getAdmins() {
  return Bot.getProperty(ADMINS_KEY) || [];
}
function setAdmins(list) {
  Bot.setProperty(ADMINS_KEY, list, "json");
}
function setupOwner() {
  let owner = getOwner();
  if (owner) {
    send(user.telegramid, `ℹ️ <b>Owner already set:</b>\n<code>${owner}</code>`);
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  send(user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> and first <b>Admin</b>."
  );
  return true;
}
function onlyAdmin() {
  let owner = getOwner();
  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin System Not Set Up!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>");
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
  id = parseInt(id);
  if (!id) {
    send(user.telegramid, "⚠️ <b>Invalid Telegram ID</b>");
    return false;
  }
  let admins = getAdmins();
  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is already an admin.</b>");
    return false;
  }
  admins.push(id);
  setAdmins(admins);
  send(user.telegramid, `✅ <b>Admin Added</b>\nUser: <code>${id}</code>`);
  send(id, "🎉 <b>You have been promoted to Admin!</b>");
  return true;
}
function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  id = parseInt(id);
  if (!id) {
    send(user.telegramid, "⚠️ <b>Invalid Telegram ID</b>");
    return false;
  }
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
  send(user.telegramid, `🗑 <b>Admin Removed</b>\nUser: <code>${id}</code>`);
  send(id, "⚠️ <b>You have been removed from Admin role.</b>");
  return true;
}
function showAdminList() {
  let owner = getOwner();
  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>");
    return;
  }
  let admins = getAdmins();
  if (admins.length === 0) {
    send(user.telegramid, "⚠️ <b>No admins found.</b>");
    return;
  }
  let msg = "👮 <b>Admins List</b>\n\n";
  admins.forEach((id, idx) => {
    let role = (id === owner) ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${idx + 1}. <code>${id}</code>${role}\n`;
  });
  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;
  send(user.telegramid, msg);
}

/* -----------------------
   Ping & Iteration
   ----------------------- */
function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start;
    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`,
      parse_mode: "HTML"
    });
    return;
  }
  Api.sendMessage({
    chat_id: request.chat.id,
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
  // single value mode: iteration("limit") => 3000000
  if (mode && typeof mode === "string" && mode !== "raw") {
    return enriched[mode];
  }
  if (mode === "raw") {
    let raw = JSON.stringify(d, null, 2);
    send(request.chat.id, "<b>📦 Raw Iteration Data:</b>\n<code>" + raw + "</code>");
    return d;
  }
  // formatted output
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t){ try{ return new Date(t).toLocaleString(); } catch(e){ return t; } }
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
  send(request.chat.id, msg);
  return enriched;
}

/* -----------------------
   Membership System
   ----------------------- */

/* Storage format for channels:
  [
    { type: "public", username: "CryptoNews" },
    { type: "private", id: "-100123...", invite: "https://t.me/+" }
  ]
*/

function _getChannels() {
  return Bot.getProperty(CHANNELS_KEY) || [];
}
function _setChannels(arr) {
  Bot.setProperty(CHANNELS_KEY, arr, "json");
}
function setJoinMessage(text) {
  Bot.setProperty(JOIN_MSG_KEY, text, "string");
}
function getJoinMessage() {
  return Bot.getProperty(JOIN_MSG_KEY) || "📢 Please join our required channels:";
}
function getRequiredChannels() {
  return _getChannels();
}
function membershipList() {
  const ch = _getChannels();
  if (!ch || ch.length === 0) {
    send(user.telegramid, "ℹ️ <b>No membership channels configured.</b>");
    return;
  }
  let msg = "<b>📜 Required Channels</b>\n\n";
  ch.forEach((c, i) => {
    if (c.type === "public") msg += `${i+1}. @${c.username}\n`;
    else msg += `${i+1}. Private: <code>${c.id}</code>\n`;
  });
  send(user.telegramid, msg);
}

/* Validate one channel line:
 - public: @username
 - private: -100123... | https://t.me/+Invite
*/
function _parseLine(line) {
  line = line.trim();
  if (!line) return null;
  // public
  if (line.startsWith("@")) {
    let username = line.replace(/^@+/, "").trim();
    if (!username) return null;
    return { type: "public", username: username };
  }
  // private format: id | invite
  const parts = line.split("|").map(s => s.trim()).filter(Boolean);
  if (parts.length === 1 && /^-?\d+$/.test(parts[0])) {
    // id-only private (owner must ensure invite exists)
    return { type: "private", id: parts[0], invite: null };
  }
  if (parts.length === 2 && /^-?\d+$/.test(parts[0]) && parts[1].startsWith("http")) {
    return { type: "private", id: parts[0], invite: parts[1] };
  }
  return null;
}

// owner-only interactive setup
function membershipSetup() {
  if (!onlyAdmin()) return;
  Bot.setProperty(LIB + "waiting_setup_for", user.telegramid, "integer");
  send(user.telegramid,
    "<b>Membership Setup</b>\n\n" +
    "Send required channels (one per line) in this format:\n\n" +
    "• Public: @ChannelName\n" +
    "• Private: -1001234567890 | https://t.me/+InviteLink\n\n" +
    "Max 10 lines.\n\n" +
    "When ready — reply using the command:\n<code>/onMembershipSetup</code>"
  );
}

// command hook — owner replies with channel list
function onMembershipSetup() {
  // ensure owner
  const waiting = Bot.getProperty(LIB + "waiting_setup_for");
  if (!waiting || waiting !== user.telegramid) {
    send(user.telegramid, "⚠️ <b>Not expecting setup input. Run membershipSetup() first.</b>");
    return;
  }
  if (!message) {
    send(user.telegramid, "⚠️ <b>No input received.</b>");
    return;
  }
  const lines = message.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 10);
  if (lines.length === 0) {
    send(user.telegramid, "⚠️ <b>Please send at least 1 channel.</b>");
    return;
  }
  const parsed = [];
  for (let ln of lines) {
    const p = _parseLine(ln);
    if (!p) {
      send(user.telegramid, `⚠️ <b>Invalid line:</b>\n<code>${ln}</code>\n\nSetup aborted.`);
      return;
    }
    parsed.push(p);
  }
  _setChannels(parsed);
  Bot.removeProperty(LIB + "waiting_setup_for");
  send(user.telegramid, `✅ <b>Membership channels saved:</b> ${parsed.length} channel(s).`);
}

// update — owner sends new full list (same flow)
function membershipUpdate() {
  if (!onlyAdmin()) return;
  Bot.setProperty(LIB + "waiting_update_for", user.telegramid, "integer");
  send(user.telegramid,
    "<b>Membership Update</b>\n\nSend new full list (same format as setup). Then reply using:\n<code>/onMembershipSetup</code>"
  );
}
// Reuse onMembershipSetup for the update as well
// (owner just calls membershipUpdate then replies with /onMembershipSetup)

/* Remove a channel by index (1-based) */
function membershipRemove(index) {
  if (!onlyAdmin()) return false;
  index = parseInt(index);
  if (!index || index < 1) {
    send(user.telegramid, "⚠️ <b>Invalid index.</b>");
    return false;
  }
  const ch = _getChannels();
  if (index > ch.length) {
    send(user.telegramid, "⚠️ <b>Index out of range.</b>");
    return false;
  }
  const removed = ch.splice(index - 1, 1)[0];
  _setChannels(ch);
  send(user.telegramid, `🗑 <b>Removed channel #${index}.</b>`);
  return true;
}

// Button callback handler for inline "remove" buttons
function onMembershipRemove() {
  // params can include index passed by callback (example callback_data: "/onMembershipRemove 2")
  let idx = params ? params.trim().split(" ")[0] : null;
  if (!idx) {
    send(user.telegramid, "⚠️ <b>No index provided.</b>");
    return;
  }
  membershipRemove(idx);
}

// Build join message + buttons and send to user
function _sendJoinUI(chat_id, notJoinedList) {
  const base = getJoinMessage();
  let text = `<b>${base}</b>\n\n`;
  notJoinedList.forEach((c, i) => {
    if (c.type === "public") text += `${i+1}. @${c.username}\n`;
    else text += `${i+1}. Private: <code>${c.id}</code>\n`;
  });
  text += `\nAfter joining, press "🔄 Check Again".`;
  // build buttons (2 per row)
  const keyboard = [];
  for (let i = 0; i < notJoinedList.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < notJoinedList.length; j++) {
      const c = notJoinedList[j];
      let url = null;
      if (c.type === "public") url = `https://t.me/${c.username}`;
      else url = c.invite || `https://t.me/${c.id}`;
      row.push({ text: `Join ${j+1}`, url: url });
    }
    keyboard.push(row);
  }
  // final row: Check Again
  keyboard.push([{ text: "🔄 Check Again", callback_data: "/onMembershipCheckAgain" }]);
  Api.sendMessage({
    chat_id: chat_id,
    text: text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });
}

/* -----------------------
   Async checking machinery
   We'll perform Api.getChatMember for each channel and track results in Bot properties using request id (reqId).
   ----------------------- */

function _startAsyncCheck(chat_id) {
  const channels = _getChannels();
  if (!channels || channels.length === 0) {
    send(chat_id, "ℹ️ <b>No membership channels configured.</b>");
    return null;
  }
  // max 10 channels
  if (channels.length > 10) {
    send(chat_id, "⚠️ <b>Max 10 channels supported.</b>");
    return null;
  }
  const reqId = String(Date.now()) + "_" + Math.floor(Math.random() * 1000);
  const meta = {
    total: channels.length,
    done: 0,
    results: [], // each: { idx, ok, status, channel }
    chat_id: chat_id
  };
  Bot.setProperty(CHECK_PREFIX + reqId, meta, "json");
  // request all
  channels.forEach((c, idx) => {
    let chatIdentifier = (c.type === "public") ? ("@" + c.username) : c.id;
    Api.getChatMember({
      chat_id: chatIdentifier,
      user_id: chat_id,
      on_result: LIB + "onCheck " + reqId + " " + idx + " " + chatIdentifier,
      on_error: LIB + "onCheckError " + reqId + " " + idx + " " + chatIdentifier
    });
  });
  return reqId;
}

// handler: successful getChatMember
on(LIB + "onCheck", function onCheckHandler() {
  // params: "<reqId> <idx> <chatIdentifier>"
  const parts = (params || "").split(" ");
  const reqId = parts[0];
  const idx = parseInt(parts[1]);
  const chatIdentifier = parts.slice(2).join(" ");
  if (!reqId) return;
  let meta = Bot.getProperty(CHECK_PREFIX + reqId);
  if (!meta) return;
  // parse result
  const status = options?.result?.status;
  const ok = ["member", "administrator", "creator"].includes(status);
  meta.results[idx] = {
    idx: idx,
    ok: ok,
    status: status || null,
    channel: chatIdentifier
  };
  meta.done = (meta.results.filter(Boolean)).length;
  Bot.setProperty(CHECK_PREFIX + reqId, meta, "json");
  // when finished
  if (meta.done >= meta.total) {
    _finalizeCheck(reqId);
  }
});

// handler: error from API (treat as not joined/invalid)
on(LIB + "onCheckError", function onCheckError() {
  const parts = (params || "").split(" ");
  const reqId = parts[0];
  const idx = parseInt(parts[1]);
  const chatIdentifier = parts.slice(2).join(" ");
  if (!reqId) return;
  let meta = Bot.getProperty(CHECK_PREFIX + reqId);
  if (!meta) return;
  meta.results[idx] = {
    idx: idx,
    ok: false,
    status: "error",
    channel: chatIdentifier
  };
  meta.done = (meta.results.filter(Boolean)).length;
  Bot.setProperty(CHECK_PREFIX + reqId, meta, "json");
  if (meta.done >= meta.total) {
    _finalizeCheck(reqId);
  }
});

function _finalizeCheck(reqId) {
  let meta = Bot.getProperty(CHECK_PREFIX + reqId);
  if (!meta) return;
  const channels = _getChannels();
  const notJoined = [];
  const joined = [];
  const invalid = [];
  meta.results.forEach((r, i) => {
    if (!r) {
      invalid.push(channels[i]);
      return;
    }
    if (r.ok) joined.push(channels[i]);
    else {
      // if error or left => not joined
      notJoined.push(channels[i]);
    }
  });
  // store per-user small cache (User property)
  const uid = meta.chat_id;
  const userKey = LIB + "member_cache_" + uid;
  User.setProperty({
    name: userKey,
    value: { joined: joined.map(c => c.type === "public" ? ("@" + c.username) : c.id) },
    user_id: uid
  });
  // if all joined -> notify success
  if (notJoined.length === 0) {
    send(uid, "✅ <b>Access granted — you joined all required channels.</b>");
  } else {
    // send join UI only to this user
    _sendJoinUI(uid, notJoined);
  }
  // cleanup
  Bot.removeProperty(CHECK_PREFIX + reqId);
}

// public raw check (returns stored object) — runs async and returns request id or null
function membershipRawCheck() {
  // start async check for current user (user.telegramid)
  const reqId = _startAsyncCheck(user.telegramid);
  if (!reqId) {
    return null;
  }
  send(user.telegramid, "🔎 <b>Checking membership... Please wait.</b>");
  return reqId;
}

// main enforcement function used in commands
function membershipCheck() {
  // Quick cache test: if user previously cached 'joined all', accept.
  const uid = user.telegramid;
  const cacheKey = LIB + "member_cache_" + uid;
  const cache = User.getProperty({ name: cacheKey, user_id: uid });
  const channels = _getChannels();
  if (!channels || channels.length === 0) {
    // no restriction configured -> allow
    return true;
  }
  if (cache && cache.joined) {
    // ensure cached length == channels length
    if (cache.joined.length >= channels.length) return true;
  }
  // Not cached as joined => run async check and block command
  const reqId = _startAsyncCheck(uid);
  if (!reqId) {
    send(uid, "⚠️ <b>Unable to start membership check.</b>");
    return false;
  }
  send(uid, "🔎 <b>Checking membership... You will receive a message with instructions if join is required.</b>");
  return false;
}

// callback: Check Again button pressed — we start check for that user
function onMembershipCheckAgain() {
  const chatId = (options?.result?.chat?.id) || user.telegramid;
  const reqId = _startAsyncCheck(chatId);
  if (!reqId) {
    send(chatId, "⚠️ <b>Unable to start membership check.</b>");
    return;
  }
  send(chatId, "🔎 <b>Checking membership again...</b>");
}

// optional: log when user clicks a join button (not required for flow)
function onMembershipJoin() {
  // callback_data may include which channel etc. Not necessary — placeholder for devs.
  send(user.telegramid, "ℹ️ <b>Thank you — after joining press Check Again.</b>");
}

/* -----------------------
   Export public API
   ----------------------- */
publish({
  // ping / iteration
  ping: ping,
  iteration: iteration,
  // admin
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  showAdminList: showAdminList,
  adminList: getAdmins,
  owner: getOwner,
  // membership
  membershipSetup: membershipSetup,
  onMembershipSetup: onMembershipSetup, // command hook
  membershipUpdate: membershipUpdate,
  membershipRemove: membershipRemove,
  onMembershipRemove: onMembershipRemove, // callback hook
  membershipList: membershipList,

  membershipCheck: membershipCheck,
  membershipRawCheck: membershipRawCheck,

  onMembershipCheckAgain: onMembershipCheckAgain,
  onMembershipJoin: onMembershipJoin,

  setJoinMessage: setJoinMessage,
  getJoinMessage: getJoinMessage,
  getRequiredChannels: getRequiredChannels
});
