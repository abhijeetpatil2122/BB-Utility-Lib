// UtilityLib v3 - Membership module
// Exposes:
// membershipSetup(), membershipUpdate(arr), membershipRemove(idx), membershipList()
// membershipCheck(), membershipRawCheck()
// setJoinMessage(text), getJoinMessage(), getRequiredChannels()

const LIB_PREFIX = "UtilityLib_MCL_";
const KEY_CH = "UtilityLib_membership_channels";
const KEY_MSG = "UtilityLib_membership_join_msg";
const KEY_DEBUG = "UtilityLib_membership_debug";
const SESSION_USER_PREFIX = "UtilityLib_mcl_user_";

function _send(chat_id, text, reply_markup) {
  const p = { chat_id, text, parse_mode: "HTML" };
  if (reply_markup) p.reply_markup = reply_markup;
  Api.sendMessage(p);
}
function _dbg(...args) {
  if (Bot.getProperty(KEY_DEBUG)) {
    try {
      Api.sendMessage({
        chat_id: request.chat?.id || (user && user.telegramid),
        text: "<b>UtilityLib MCL DEBUG</b>\n<pre>" + JSON.stringify(args, null, 2) + "</pre>",
        parse_mode: "HTML"
      });
    } catch (e) {}
  }
}

/* -----------------------------
   Storage helpers
   ----------------------------- */
function membershipSetup() {
  if (!Bot.getProperty(KEY_CH)) {
    Bot.setProperty(KEY_CH, [], "json");
    Bot.setProperty(KEY_MSG, "📢 <b>Please join the required channels:</b>", "string");
    Bot.setProperty(KEY_DEBUG, false, "boolean");
    _send(user.telegramid, "✅ Membership system initialized.");
    return true;
  }
  _send(user.telegramid, "ℹ️ Membership system already initialized.");
  return true;
}

function _getChannels() {
  return Bot.getProperty(KEY_CH) || [];
}
function membershipList() {
  return _getChannels();
}
function getRequiredChannels() { return membershipList(); }

function _normalizeItem(item) {
  if (typeof item === "string") {
    const u = item.trim().replace(/^@+/, "");
    if (!u) throw new Error("Invalid channel username");
    return { type: "public", username: u };
  }
  if (typeof item === "object" && item !== null) {
    if (item.username) return { type: "public", username: ("" + item.username).replace(/^@+/, "") };
    if (item.id) return { type: "private", id: "" + item.id, invite: item.invite || null, title: item.title || null };
  }
  throw new Error("Invalid channel format");
}

/* Replace all channels (arr = array of items) */
function membershipUpdate(arr) {
  if (!Array.isArray(arr)) throw new Error("membershipUpdate: array required");
  if (arr.length > 10) throw new Error("membershipUpdate: max 10 channels allowed");
  const out = arr.map(_normalizeItem);
  Bot.setProperty(KEY_CH, out, "json");
  return out;
}

/* Remove channel by index (0-based) */
function membershipRemove(index) {
  const cur = _getChannels();
  const idx = parseInt(index);
  if (isNaN(idx) || idx < 0 || idx >= cur.length) throw new Error("membershipRemove: invalid index");
  cur.splice(idx, 1);
  Bot.setProperty(KEY_CH, cur, "json");
  return cur;
}

/* join message header */
function setJoinMessage(txt) {
  Bot.setProperty(KEY_MSG, txt, "string");
  return txt;
}
function getJoinMessage() {
  return Bot.getProperty(KEY_MSG) || "📢 <b>Please join the required channels:</b>";
}
function setDebug(flag) { Bot.setProperty(KEY_DEBUG, !!flag, "boolean"); }

/* -----------------------------
   Buttons builder (2 per row)
   ----------------------------- */
function _buildButtons(channels) {
  const kb = [];
  for (let i = 0; i < channels.length; i += 2) {
    const row = [];
    for (let j = 0; j < 2; j++) {
      const idx = i + j;
      if (idx >= channels.length) break;
      const c = channels[idx];
      const label = c.title || (c.type === "public" ? "@" + c.username : "Private");
      if (c.type === "public") row.push({ text: label, url: "https://t.me/" + c.username });
      else if (c.type === "private" && c.invite) row.push({ text: label, url: c.invite });
      else row.push({ text: label, callback_data: "/" + LIB_PREFIX + "noinvite " + idx });
    }
    if (row.length) kb.push(row);
  }
  kb.push([{ text: "🔄 Check Again", callback_data: "/" + LIB_PREFIX + "check" }]);
  return { inline_keyboard: kb };
}

/* UI: show message + buttons */
function _showUI(chat_id, channels) {
  _send(chat_id, getJoinMessage() + "\n\n" + _formatChannelsList(channels), _buildButtons(channels));
}

/* helper to render channels list as lines with HTML links when possible */
function _formatChannelsList(channels) {
  if (!channels || channels.length === 0) return "";
  let txt = "";
  channels.forEach((c, i) => {
    const idx = i + 1;
    if (c.type === "public") txt += `${idx}. @${c.username}\n`;
    else if (c.type === "private") {
      if (c.invite) txt += `${idx}. <a href="${c.invite}">${c.title || c.id}</a>\n`;
      else txt += `${idx}. ${c.title || c.id} (invite link not set)\n`;
    }
  });
  return txt;
}

/* -----------------------------
   Core check flow
   membershipCheck(): returns boolean
   membershipRawCheck(): returns object with details
   Both perform checks (spawn background getChatMember calls) and finalize results.
   ----------------------------- */

/* create and store session in user property */
function _startSession(uid) {
  const channels = _getChannels();
  if (!channels || channels.length === 0) return { ok: true, details: [], missing: [] }; // nothing required
  const sid = Date.now();
  const uKey = SESSION_USER_PREFIX + uid;
  const session = { id: sid, pending: channels.length, results: {}, channelsCount: channels.length };
  User.setProperty(uKey, session, "json");
  // spawn background tasks
  channels.forEach(c => {
    const chatKey = c.type === "public" ? "@" + c.username : c.id;
    Bot.run({ command: LIB_PREFIX + "checkMember " + chatKey, options: { bb_options: { time: sid }, channel_meta: c }, run_after: 1 });
  });
  return session;
}

/* finalize session (called internally when background tasks complete) */
on(LIB_PREFIX + "finalize", function () {
  const sid = parseInt(params.split(" ")[0]);
  const uid = user.telegramid;
  const uKey = SESSION_USER_PREFIX + uid;
  const session = User.getProperty(uKey);
  if (!session || session.id !== sid) {
    _dbg("finalize: session mismatch", sid, session && session.id);
    return;
  }
  const channels = _getChannels();
  const results = session.results || {};
  const joined = [], missing = [];
  channels.forEach(c => {
    const key = c.type === "public" ? "@" + c.username : c.id;
    const r = results[key];
    if (r && r.joined) joined.push({ channel: c, status: r.status });
    else missing.push({ channel: c, status: r ? r.status : null });
  });

  // store last-results in user prop for membershipRawCheck to return
  session.summary = { joined, missing, results };
  User.setProperty(uKey, session, "json");

  // send UI to user if missing
  if (missing.length) _showUI(uid, channels);
  else _send(uid, "<b>✅ You are joined to all required channels.</b>");

  // nothing returned here (background)
});

/* worker that calls getChatMember */
on(LIB_PREFIX + "checkMember", function () {
  const chatKey = params.split(" ")[0];
  Api.getChatMember({
    chat_id: chatKey,
    user_id: user.telegramid,
    on_result: LIB_PREFIX + "onMemberResult " + chatKey,
    on_error: LIB_PREFIX + "onMemberError " + chatKey,
    bb_options: options.bb_options
  });
});

on(LIB_PREFIX + "onMemberResult", function () {
  const chatKey = params.split(" ")[0];
  const uid = user.telegramid;
  const uKey = SESSION_USER_PREFIX + uid;
  let session = User.getProperty(uKey) || { id: options.bb_options?.time || Date.now(), pending: 0, results: {} };
  const status = (options.result && options.result.status) || null;
  const joined = ["member", "administrator", "creator"].includes(status);
  session.results[chatKey] = { joined, status };
  session.pending = Math.max((session.pending || _getChannels().length) - 1, 0);
  User.setProperty(uKey, session, "json");
  if (session.pending === 0) Bot.run({ command: LIB_PREFIX + "finalize " + session.id, run_after: 1 });
});

on(LIB_PREFIX + "onMemberError", function () {
  const chatKey = params.split(" ")[0];
  const uid = user.telegramid;
  const uKey = SESSION_USER_PREFIX + uid;
  let session = User.getProperty(uKey) || { id: options.bb_options?.time || Date.now(), pending: 0, results: {} };
  session.results[chatKey] = { joined: false, status: "error", error: options };
  session.pending = Math.max((session.pending || _getChannels().length) - 1, 0);
  User.setProperty(uKey, session, "json");
  if (session.pending === 0) Bot.run({ command: LIB_PREFIX + "finalize " + session.id, run_after: 1 });
});

/* callback for inline: check again */
on("/" + LIB_PREFIX + "check", function () {
  if (!user) return;
  membershipCheck(); // call directly
});

/* callback for inline: user clicked a private channel without invite */
on("/" + LIB_PREFIX + "noinvite", function () {
  const idx = parseInt(params.split(" ")[0]);
  const ch = _getChannels()[idx];
  if (!ch) return _send(user.telegramid, "⚠️ Channel not found.");
  _send(user.telegramid, "⚠️ This private channel has no invite link. Please contact the bot owner to get an invite.");
  // optionally notify owner if set
  try {
    if (bot && bot.owner) Api.sendMessage({ chat_id: bot.owner, text: `<b>Notice:</b> user ${user.telegramid} needs invite for channel ${ch.id}`, parse_mode: "HTML" });
  } catch(e){}
});

/* -----------------------------
   Public API
   membershipCheck(): starts check and returns boolean
     - If no channels configured => returns true
     - If channels configured: starts session and returns false immediately (UI shown).
       The final result will be sent to user when checks complete.
   membershipRawCheck(): starts full check and returns last summary object (if available)
   ----------------------------- */
function membershipCheck() {
  const channels = _getChannels();
  if (!channels || channels.length === 0) return true;
  const uid = user.telegramid;
  const session = _startSession(uid);
  // If channels exist we started background checks and show UI; return false now.
  return false;
}

/* membershipRawCheck returns stored summary object if available (not a blocking synchronous network call) */
function membershipRawCheck() {
  const uid = user.telegramid;
  const uKey = SESSION_USER_PREFIX + uid;
  const session = User.getProperty(uKey);
  if (!session) return { ok: false, msg: "No recent session" };
  // if finalize already created summary -> return it
  if (session.summary) return { ok: true, summary: session.summary };
  // still running
  return { ok: false, msg: "Check in progress", pending: session.pending || 0 };
}

/* convenience function to show join UI immediately */
function showJoinRequest() {
  const channels = _getChannels();
  if (!channels || channels.length === 0) return _send(user.telegramid, "⚠️ No channels configured.");
  _showUI(user.telegramid, channels);
}

/* small helpers */
function getNotJoined() {
  const uid = user.telegramid;
  const uKey = SESSION_USER_PREFIX + uid;
  const session = User.getProperty(uKey);
  if (!session || !session.summary) return [];
  return session.summary.missing.map(m => m.channel);
}

/* -----------------------------
   Expose methods
   ----------------------------- */
publish({
  membershipSetup: membershipSetup,
  membershipUpdate: membershipUpdate,
  membershipRemove: membershipRemove,
  membershipList: membershipList,
  membershipCheck: membershipCheck,
  membershipRawCheck: membershipRawCheck,
  setJoinMessage: setJoinMessage,
  getJoinMessage: getJoinMessage,
  getRequiredChannels: getRequiredChannels,
  showJoinRequest: showJoinRequest,
  setDebug: setDebug,
  getNotJoined: getNotJoined
});
