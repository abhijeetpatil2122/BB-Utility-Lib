/*
 UtilityLib — Membership v3
 Provides: membershipSetup, onMembershipSetup, membershipList,
          removeMembership, membershipCheck, membershipDebug,
          setJoinMessage, getJoinMessage, membershipRawCheck
*/

let LIB = "UtilityLib_";
const MEMBERS_KEY = LIB + "memberships";         // bot prop: array of channels
const JOIN_MSG_KEY = LIB + "join_msg";           // bot prop: custom header
const CHECK_RESULTS = LIB + "results_";          // user prop prefix for membership results
const MAX_CHANNELS = 10;

function send(to, text, opts = {}) {
  Api.sendMessage(Object.assign({ chat_id: to, text: text, parse_mode: "HTML" }, opts));
}

function isAdmin() {
  const owner = Bot.getProperty(LIB + "owner");
  return user && owner && user.telegramid === owner;
}

// ---------------------- Helpers ----------------------
function parseChannelLine(line) {
  line = (line || "").trim();
  if (!line) return null;

  // Private format: -1001234567890 | https://t.me/+InviteLink
  const parts = line.split("|").map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    // public username or raw id
    const v = parts[0];
    if (v.startsWith("@")) {
      return { type: "public", username: v.replace(/^@+/, "") };
    }
    if (/^-?\d+$/.test(v)) {
      return { type: "private", id: v };
    }
    // if it looks like a t.me link, try parse
    if (v.includes("t.me/+") || v.includes("t.me/")) {
      // treat as private invite/username
      if (v.includes("+")) return { type: "private", invite: v };
      const name = v.split("/").pop().replace(/^@+/, "");
      return { type: "public", username: name };
    }
    return null;
  } else {
    // two parts: id | invite OR @name | invite
    const a = parts[0], b = parts[1];
    if (/^-?\d+$/.test(a)) {
      return { type: "private", id: a, invite: b };
    }
    if (a.startsWith("@")) {
      return { type: "public", username: a.replace(/^@+/, ""), invite: b };
    }
    return null;
  }
}

function saveChannels(arr) {
  Bot.setProperty(MEMBERS_KEY, arr, "json");
}

function loadChannels() {
  return Bot.getProperty(MEMBERS_KEY) || [];
}

function setJoinHeader(text) {
  Bot.setProperty(JOIN_MSG_KEY, text, "string");
}

function getJoinHeader() {
  return Bot.getProperty(JOIN_MSG_KEY) || "📢 Please join our required channels:";
}

function userResultsKey(uid) {
  return CHECK_RESULTS + String(uid);
}

function saveUserResults(uid, obj) {
  User.setProperty({ name: userResultsKey(uid), value: obj, user_id: uid });
}

function loadUserResults(uid) {
  return User.getProperty({ name: userResultsKey(uid), user_id: uid }) || {};
}

// ---------------------- Setup flow ----------------------
function membershipSetup() {
  // Only bot owner allowed to setup. If owner not set, create it as caller.
  let owner = Bot.getProperty(LIB + "owner");
  if (!owner) {
    Bot.setProperty(LIB + "owner", user.telegramid, "integer");
    owner = user.telegramid;
  }

  if (user.telegramid !== owner) {
    send(user.telegramid, "❌ <b>Only bot owner</b> can run setup.");
    return;
  }

  // send instructions and ask owner to reply to /onMembershipSetup
  const inst =
    "<b>Membership Setup</b>\n\n" +
    "Send the list of channels (one per line).\n\n" +
    "<b>Public:</b>\n@ChannelName\n\n" +
    "<b>Private (id + invite):</b>\n-1001234567890 | https://t.me/+InviteLink\n\n" +
    `<b>Max:</b> ${MAX_CHANNELS} channels.\n\n` +
    "Now open the command <code>/onMembershipSetup</code> and paste the list as a reply.\n\n" +
    "Example:\n@CryptoNews\n@AirdropWorld\n-1009876543210 | https://t.me/+InviteLink";

  send(user.telegramid, inst);

  // run developer's capture command so owner has the command opened (optional)
  // We run it so the bot triggers the developer's capture command if they implement it.
  Bot.run({
    command: "/onMembershipSetup",
    run_after: 1
  });
}

// Called by bot owner command (/onMembershipSetup) — message text contains lines
function onMembershipSetup(text) {
  if (!text) {
    send(user.telegramid, "⚠️ No input provided. Please paste channels list.");
    return;
  }

  const owner = Bot.getProperty(LIB + "owner");
  if (!owner || user.telegramid !== owner) {
    send(user.telegramid, "❌ Only the bot owner can set membership channels.");
    return;
  }

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const arr = [];
  for (let ln of lines) {
    const parsed = parseChannelLine(ln);
    if (!parsed) {
      send(user.telegramid, `⚠️ Couldn't parse line:\n<code>${ln}</code>\nPlease follow the format.`);
      return;
    }
    arr.push(parsed);
    if (arr.length > MAX_CHANNELS) {
      send(user.telegramid, `⚠️ Max ${MAX_CHANNELS} channels allowed.`);
      return;
    }
  }

  saveChannels(arr);
  send(user.telegramid, `✅ Saved ${arr.length} channels for membership check.`);
}

// ---------------------- List / Remove ----------------------
function showMembershipList() {
  const ch = loadChannels();
  if (!ch || ch.length === 0) {
    send(user.telegramid, "ℹ️ No membership channels configured.");
    return;
  }

  let msg = "<b>📋 Membership Channels</b>\n\n";
  ch.forEach((c, idx) => {
    const i = idx + 1;
    if (c.type === "public") {
      msg += `${i}. @${c.username}${c.invite ? " (invite)" : ""}\n`;
    } else {
      msg += `${i}. Private: <code>${c.id || "ID?"}</code> ${c.invite ? "(invite)" : ""}\n`;
    }
  });

  send(user.telegramid, msg);
}

function removeMembership(indexRaw) {
  const owner = Bot.getProperty(LIB + "owner");
  if (!owner || user.telegramid !== owner) {
    send(user.telegramid, "❌ Only owner can remove channels.");
    return;
  }

  const idx = parseInt((indexRaw || "").trim());
  if (isNaN(idx) || idx < 1) {
    send(user.telegramid, "⚠️ Reply with numeric index to remove (e.g. 2).");
    return;
  }

  const ch = loadChannels();
  if (idx > ch.length) {
    send(user.telegramid, "⚠️ Index out of range.");
    return;
  }

  const removed = ch.splice(idx - 1, 1)[0];
  saveChannels(ch);
  send(user.telegramid, `🗑 Removed channel #${idx}.`);
}

// ---------------------- Background check runner ----------------------
// This schedules background work that runs Api.getChatMember for each channel.
// The callback handler below (`onCheckResult`) receives each result and stores it in user props.
function runBackgroundCheck(opts = {}) {
  // run a background command that will process checks (to reduce blocking)
  Bot.run({
    command: LIB + "checkAll",
    options: {
      bb_options: opts
    },
    run_after: 1
  });
}

// Command handler: LIB + "checkAll"
function checkAll() {
  if (!user) return;
  const channels = loadChannels();
  if (!channels || channels.length === 0) return;

  // mark last check time
  const ud = loadUserResults(user.telegramid);
  ud.__last_check = Date.now();
  saveUserResults(user.telegramid, ud);

  // fire getChatMember for each channel
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    let chat_id = "";
    // public: use @username, private: id or invite
    if (c.type === "public") {
      chat_id = "@" + c.username;
    } else if (c.type === "private") {
      // if id exists, check by id
      chat_id = c.id || c.invite || "";
    }
    if (!chat_id) {
      // store as invalid
      const tmp = loadUserResults(user.telegramid);
      tmp[chat_id || ("#" + i)] = { ok: false, error: "invalid_channel" };
      saveUserResults(user.telegramid, tmp);
      continue;
    }

    Api.getChatMember({
      chat_id: chat_id,
      user_id: user.telegramid,
      on_result: LIB + "onCheck " + chat_id,
      on_error: LIB + "onCheckError " + chat_id,
      bb_options: options // pass along options if any
    });
  }
}

// Handler for success result. 'params' contains chat_id appended in command string.
function onCheckResult() {
  // params: chat identifier (as string)
  const chat_id = params;
  // options.result contains Telegram API response object
  const res = options;
  const ud = loadUserResults(user.telegramid);

  // If Telegram returned result?.status
  try {
    const status = res.result && res.result.status;
    const joined = ["member", "administrator", "creator"].includes(status);
    ud[chat_id] = { ok: true, status: status, joined: !!joined, raw: res };
  } catch (e) {
    ud[chat_id] = { ok: false, error: "parse_error", raw: res };
  }

  saveUserResults(user.telegramid, ud);
}

// Handler for Api error
function onCheckError() {
  const chat_id = params;
  const ud = loadUserResults(user.telegramid);
  ud[chat_id] = { ok: false, error: options?.message || "api_error" };
  saveUserResults(user.telegramid, ud);
}

// ---------------------- Check API ----------------------
// Returns true if user already stored as joined for all required channels.
// If not joined → triggers background check and shows join UI. Returns false.
function membershipCheck() {
  const channels = loadChannels();
  if (!channels || channels.length === 0) {
    send(user.telegramid, "ℹ️ No membership channels configured.");
    return true; // nothing to require
  }

  // quick local test from stored user results
  const results = loadUserResults(user.telegramid);
  let allJoined = true;
  for (let i = 0; i < channels.length; i++) {
    const c = channels[i];
    const key = (c.type === "public" ? "@" + c.username : (c.id || c.invite || ""));
    const rec = results[key];
    if (!rec || !rec.joined) {
      allJoined = false;
      break;
    }
  }

  if (allJoined) {
    return true;
  }

  // not joined yet (or unknown) — run background check and show UI
  runBackgroundCheck();

  // Show join UI
  const header = getJoinHeader();
  let text = `<b>${header}</b>\n\n`;
  channels.forEach((c, idx) => {
    const i = idx + 1;
    if (c.type === "public") text += `${i}. @${c.username}\n`;
    else text += `${i}. Private: <code>${c.id || "private"}</code>\n`;
  });

  // build inline buttons: 2 per row, last row = Check Again
  const keyboard = [];
  let row = [];
  channels.forEach((c, idx) => {
    const label = `Join ${idx + 1}`;
    let url = null;
    if (c.type === "public") url = `https://t.me/${c.username}`;
    else if (c.invite) url = c.invite;
    // create button
    const btn = url ? { text: label, url: url } : { text: label, callback_data: "/noop" };
    row.push(btn);
    if (row.length === 2) {
      keyboard.push(row);
      row = [];
    }
  });
  if (row.length) keyboard.push(row);

  // Add Check Again button
  keyboard.push([{ text: "🔄 Check Again", callback_data: "/onMembershipCheck" }]);

  Api.sendMessage({
    chat_id: user.telegramid,
    text: text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard }
  });

  return false;
}

// membershipRawCheck - return results object for code usage
function membershipRawCheck() {
  return loadUserResults(user.telegramid);
}

// Debug: show stored results for current user
function membershipDebug() {
  const r = loadUserResults(user.telegramid);
  send(user.telegramid, "<b>📦 Membership Debug (stored results)</b>\n\n<pre>" + JSON.stringify(r, null, 2) + "</pre>");
}

// ---------------------- Small utilities ----------------------
function setOnAllJoinedCommand(cmd) {
  Bot.setProperty(LIB + "onAllJoined", cmd, "string");
}

function callOnAllJoined(uid, optionsParam) {
  const cmd = Bot.getProperty(LIB + "onAllJoined");
  if (!cmd) return false;
  Bot.run({ command: cmd, options: optionsParam || {}, run_after: 1 });
  return true;
}

// ---------------------- Publish API ----------------------
publish({
  membershipSetup: membershipSetup,       // call from /setupMembership
  onMembershipSetup: onMembershipSetup,   // call from /onMembershipSetup (owner's reply)
  membershipList: showMembershipList,
  removeMembership: removeMembership,     // pass index as message
  membershipCheck: membershipCheck,       // call in commands that require membership
  membershipRawCheck: membershipRawCheck,
  membershipDebug: membershipDebug,
  setJoinMessage: setJoinHeader,
  getJoinMessage: getJoinHeader,
  setOnAllJoinedCommand: setOnAllJoinedCommand
});

// ---------------------- Internal command handlers ----------------------
// They are invoked by the background Api.getChatMember callbacks
on(LIB + "checkAll", checkAll);
on(LIB + "onCheck", onCheckResult);
on(LIB + "onCheckError", onCheckError);
