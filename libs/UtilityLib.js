/*
 UtilityLib — v5
 - ping()
 - iteration(mode)
 - setupOwner(), onlyAdmin(), addAdmin(), removeAdmin(), showAdminList()
 - Membership: setupMembership(), onMembershipSetup(msg),
               updateMembership(), removeMembership(index),
               showMembershipList(), membershipCheck(), membershipDebug()
*/

let LIB = "UtilityLib_";
const OWNER_KEY = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEMBERSHIP_KEY = LIB + "membership_channels";       // Bot prop (array)
const MEMBERSHIP_CACHE = LIB + "membership_cache_";       // per-user (User prop prefix)
const MEMBERSHIP_AWAIT = LIB + "membership_await_";       // temporary await flag per user

/* small sender helper */
function send(to, text, opts = {}) {
  Api.sendMessage(Object.assign({ chat_id: to, text: text, parse_mode: "HTML" }, opts));
}

/* --------------------
   Admin core (unchanged)
   -------------------- */
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

function setupOwner() {
  if (getOwner()) {
    send(user.telegramid, "ℹ️ <b>Owner already set:</b>\n<code>" + getOwner() + "</code>");
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  send(user.telegramid, "🎉 <b>Owner Setup Complete!</b>\nYou are now Owner & first Admin.");
  return true;
}

function onlyAdmin() {
  const owner = getOwner();
  if (!owner) {
    send(user.telegramid, "⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>");
    return false;
  }
  if (!getAdmins().includes(user.telegramid)) {
    send(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}

function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) { send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>"); return false; }
  id = Number(id);
  let admins = getAdmins();
  if (admins.includes(id)) { send(user.telegramid, "⚠️ <b>User is already admin.</b>"); return false; }
  admins.push(id); setAdmins(admins);
  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`); send(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) { send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>"); return false; }
  id = Number(id);
  const owner = getOwner(); if (id === owner) { send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>"); return false; }
  let admins = getAdmins(); if (!admins.includes(id)) { send(user.telegramid, "⚠️ <b>User is not an admin.</b>"); return false; }
  admins = admins.filter(a => a !== id); setAdmins(admins);
  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`); send(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

function showAdminList() {
  const owner = getOwner();
  if (!owner) { send(user.telegramid, "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"); return; }
  let admins = getAdmins(); if (!admins || admins.length === 0) return send(user.telegramid, "⚠️ <b>No admins found.</b>");
  let msg = "👮 <b>Admins List</b>\n\n"; let idx = 1;
  admins.forEach(id => { let role = (id === owner) ? " (<b>Owner</b>)" : " (<i>Admin</i>)"; msg += `${idx}. <code>${id}</code>${role}\n`; idx++; });
  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;
  send(user.telegramid, msg);
}

/* ------------------------------
   Ping & Iteration (same as v4)
   ------------------------------ */
function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start;
    Api.editMessageText({ chat_id: options.result.chat.id, message_id: options.result.message_id, text: `🏓 <b>${latency} ms</b>`, parse_mode: "HTML" });
    return;
  }
  Api.sendMessage({ chat_id: request.chat.id, text: "<b>Ping…</b>", parse_mode: "HTML", bb_options: { start: Date.now() }, on_result: LIB + "onPing" });
}
on(LIB + "onPing", ping);

function iteration(mode) {
  const d = iteration_quota; if (!d) return null;
  const enriched = Object.assign({}, d, { pct: ((d.progress / d.limit) * 100).toFixed(2), type: d.quotum_type?.name || "Unknown", base_limit: d.quotum_type?.base_limit });
  // pick mode: comma-separated keys
  if (mode && typeof mode === "string" && mode.includes(",")) {
    let keys = mode.split(",").map(k => k.trim()); let obj = {}; keys.forEach(k => { obj[k] = enriched[k]; }); return obj;
  }
  if (mode && mode !== "inspect") { return enriched[mode]; }
  if (mode === "inspect") { send(user.telegramid, "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>"); return d; }
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR); let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t) { try { return new Date(t).toLocaleString(); } catch (e) { return t; } }
  let msg = `⚙️ <b>BB Iteration Quota</b>\n\n` + `<b>ID:</b> <code>${enriched.id}</code>\n` + `<b>Type:</b> <code>${enriched.type}</code>\n` + `<b>Base Limit:</b> <code>${enriched.base_limit}</code>\n` + `<b>Ads Enabled:</b> <code>${enriched.have_ads}</code>\n` + `<b>Extra Points:</b> <code>${enriched.extra_points}</code>\n\n` + `<b>Limit:</b> <code>${enriched.limit}</code>\n` + `<b>Used:</b> <code>${enriched.progress}</code>\n` + `<b>Usage:</b> <code>${enriched.pct}%</code>\n\n` + `${bar}\n\n` + `<b>Started:</b> ${fmt(enriched.started_at)}\n` + `<b>Ends:</b> ${fmt(enriched.ended_at)}`;
  send(user.telegramid, msg);
  return enriched;
}

/* ===========================
   Membership System
   - stores channels (Bot prop)
   - caches per-user join state (User prop)
   - background checks with Api.getChatMember callbacks
   =========================== */

/* Helpers: channel parsing/validation */
function _getChannels() {
  return Bot.getProperty(MEMBERSHIP_KEY) || [];
}
function _setChannels(arr) {
  Bot.setProperty(MEMBERSHIP_KEY, arr, "json");
}
function _userCacheKey(uid) { return MEMBERSHIP_CACHE + String(uid); }
function _getUserCache(uid) {
  return User.getProperty({ name: _userCacheKey(uid) }) || { lastCheck: 0, channels: {} };
}
function _setUserCache(uid, cache) {
  User.setProperty({ name: _userCacheKey(uid), value: cache, type: "json" });
}
function _validateChannelLine(line) {
  line = line.trim();
  if (!line) return null;
  // public: @username
  if (line.startsWith("@")) {
    const username = line.replace(/^@+/, "");
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
    return { type: "public", username: username };
  }
  // private: -100123... | https://t.me/+abcd
  if (line.includes("|")) {
    const parts = line.split("|").map(s => s.trim());
    const id = parts[0];
    const invite = parts[1];
    if (!/^(-100\d+)$/.test(id)) return null;
    if (!/^https?:\/\/t\.me\/\+/.test(invite)) return null;
    return { type: "private", id: id, invite: invite };
  }
  // allow just numeric -100 id (no invite) - still accept
  if (/^-100\d+$/.test(line)) {
    return { type: "private", id: line, invite: null };
  }
  return null;
}

/* Public: start setup (owner/admin runs) */
// This sends instructions and sets an awaiting flag for the caller
function setupMembership() {
  if (!onlyAdmin()) return;
  const example =
    "Send channels (one per line). Public: @channel\nPrivate: -1001234567890 | https://t.me/+INVITELINK\n\nMax 10 channels.\n\nExample:\n@CryptoNews\n@AirdropWorld\n-1009876543210 | https://t.me/+AbCdEfGh\n\nNow send this list as the reply to /onMembershipSetup command.";
  send(user.telegramid, "<b>📋 Membership Setup</b>\n\n" + example);
  // mark awaiting state (owner who invoked)
  Bot.setProperty(MEMBERSHIP_AWAIT + user.telegramid, true, "boolean");
  // developer must implement /onMembershipSetup command that calls onMembershipSetup(message)
}

/* Called by bot dev inside their /onMembershipSetup command */
function onMembershipSetup(text) {
  // ensure caller was the one started setup
  const awaiting = Bot.getProperty(MEMBERSHIP_AWAIT + user.telegramid);
  if (!awaiting) {
    send(user.telegramid, "⚠️ <b>No setup requested. First run /setupMembership</b>");
    return false;
  }

  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) {
    send(user.telegramid, "⚠️ <b>Empty list. Send at least one channel.</b>");
    return false;
  }
  const channels = [];
  for (let ln of lines) {
    const ch = _validateChannelLine(ln);
    if (!ch) {
      send(user.telegramid, "⚠️ <b>Invalid line:</b>\n<code>" + ln + "</code>\nSetup aborted.");
      return false;
    }
    channels.push(ch);
    if (channels.length >= 10) break;
  }
  _setChannels(channels);
  Bot.deleteProp ? Bot.deleteProp(MEMBERSHIP_AWAIT + user.telegramid) : Bot.setProperty(MEMBERSHIP_AWAIT + user.telegramid, null, "boolean");
  send(user.telegramid, "✅ <b>Membership channels saved.</b>\nUse <code>Libs.UtilityLib.showMembershipList()</code> to view.");
  return true;
}

/* Replace whole list (admin only) */
function updateMembership(text) {
  if (!onlyAdmin()) return false;
  return onMembershipSetup.call({ user }, text);
}

/* Remove membership by index (admin only). index is 1-based */
function removeMembership(index) {
  if (!onlyAdmin()) return false;
  index = Number(index);
  if (!Number.isInteger(index) || index < 1) { send(user.telegramid, "⚠️ <b>Invalid index.</b>"); return false; }
  const channels = _getChannels();
  if (index > channels.length) { send(user.telegramid, "⚠️ <b>Index out of range.</b>"); return false; }
  const removed = channels.splice(index - 1, 1)[0];
  _setChannels(channels);
  send(user.telegramid, `🗑 <b>Removed:</b> <code>${removed.type === "public" ? "@" + removed.username : removed.id}</code>`);
  return true;
}

/* Show stored channels (all users can view) */
function showMembershipList() {
  const channels = _getChannels();
  if (!channels || channels.length === 0) { send(user.telegramid, "ℹ️ <b>No membership channels configured.</b>"); return; }
  let txt = "📢 <b>Required channels</b>\n\n";
  channels.forEach((c, i) => {
    if (c.type === "public") txt += `${i + 1}. @${c.username}\n`; else txt += `${i + 1}. <a href="${c.invite || '#'}">Private: ${c.id}</a>\n`;
  });
  send(user.telegramid, txt);
}

/* ---------
   Checking
   ---------
   membershipCheck(): if cached and fresh -> returns true
   otherwise schedules background checks and sends join message + buttons, returns false
*/
function membershipCheck() {
  const channels = _getChannels();
  if (!channels || channels.length === 0) return true; // nothing to check

  // cached per-user data
  let cache = _getUserCache(user.telegramid);
  const CACHE_TTL = 1000 * 60 * 2; // 2 minutes
  const now = Date.now();
  // Quick accept if cache says all joined and fresh
  const joinedAll = channels.every(ch => {
    const key = (ch.type === "public" ? ("@" + ch.username) : ch.id);
    return !!cache.channels[key];
  });
  if (joinedAll && (now - (cache.lastCheck || 0) < CACHE_TTL)) {
    return true;
  }

  // schedule full background check (like MCL)
  Bot.run({ command: LIB + "checkMemberships", run_after: 1, options: { user_telegramid: user.telegramid } });
  // send join message with dynamic inline buttons
  _sendJoinPrompt(user.telegramid, channels);
  return false;
}

/* internal: send nice join message + buttons */
function _sendJoinPrompt(chatId, channels) {
  let header = "📢 <b>Please join the required channels:</b>\n\n";
  let list = "";
  channels.forEach((c, i) => {
    if (c.type === "public") list += `${i + 1}. @${c.username}\n`; else list += `${i + 1}. <a href="${c.invite || '#'}">Private: ${c.id}</a>\n`;
  });
  const kb = [];
  // two buttons per row
  for (let i = 0; i < channels.length; i += 2) {
    const row = [];
    for (let j = 0; j < 2 && (i + j) < channels.length; j++) {
      const idx = i + j;
      const c = channels[idx];
      let text = `Join ${idx + 1}`;
      let url = (c.type === "public") ? `https://t.me/${c.username}` : (c.invite || `https://t.me/${c.id}`);
      row.push({ text: text, url: url });
    }
    kb.push(row);
  }
  // Check again button
  kb.push([{ text: "🔄 Check Again", callback_data: "/onMembershipCheck" }]);
  send(chatId, header + list + "\nAfter joining press «Check Again»", { reply_markup: { inline_keyboard: kb } });
}

/* -----------------------------
   Background: iterate and call Api.getChatMember
   Called by Bot.run command: LIB + "checkMemberships"
   ----------------------------- */
function checkMemberships() {
  // options is passed by Bot.run
  const targetTelegramId = options?.user_telegramid || (request?.chat?.id) || user.telegramid;
  const channels = _getChannels();
  if (!channels || channels.length === 0) return;
  // for each channel spawn getChatMember (use on_result/on_error handlers)
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const param = ch.type === "public" ? ("@" + ch.username) : ch.id;
    Api.getChatMember({
      chat_id: param,
      user_id: targetTelegramId,
      on_result: LIB + "onCheckResult " + i,
      on_error: LIB + "onCheckError " + i,
      bb_options: { target: targetTelegramId, index: i }
    });
  }
}

/* on result: update user cache; when all results come - evaluate and notify */
function onCheckResult() {
  // params: index
  const idx = parseInt(params.split(" ")[0]);
  const result = options.result;
  const bb_opt = options.bb_options || {};
  const target = bb_opt.target || user.telegramid;
  // get channels
  const channels = _getChannels();
  const ch = channels[idx];
  const key = ch.type === "public" ? ("@" + ch.username) : ch.id;
  const cache = _getUserCache(target);
  // mark joined if status in result
  const status = result?.result?.status;
  const joined = ["member", "administrator", "creator"].includes(status);
  cache.channels[key] = joined ? true : false;
  // save last check time
  cache.lastCheck = Date.now();
  _setUserCache(target, cache);
  // check if all processed: we inspect cache for all channels
  const allProcessed = channels.every(c => (cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)] !== undefined));
  if (allProcessed) {
    // final evaluation
    const joinedAll = channels.every(c => cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)]);
    if (joinedAll) {
      send(target, "✅ <b>All required channels joined. Thank you!</b>");
      // optional: run a developer callback command if they implemented it
      const devCommand = Bot.getProperty(LIB + "on_all_join_cmd");
      if (devCommand) Bot.run({ command: devCommand, options: { user_telegramid: target } });
    } else {
      // show which are missing (list)
      const missing = channels.filter(c => !cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)]);
      let txt = "🚫 <b>You still need to join:</b>\n\n";
      missing.forEach((m, i) => { txt += `${i + 1}. ${m.type === "public" ? ("@" + m.username) : (m.invite ? `<a href="${m.invite}">${m.id}</a>` : m.id)}\n`; });
      send(target, txt);
    }
  }
}

/* on error handler - treat as not joined */
function onCheckError() {
  const idx = parseInt(params.split(" ")[0]);
  const bb_opt = options.bb_options || {};
  const target = bb_opt.target || user.telegramid;
  const channels = _getChannels();
  const ch = channels[idx];
  const key = ch.type === "public" ? ("@" + ch.username) : ch.id;
  const cache = _getUserCache(target);
  cache.channels[key] = false;
  cache.lastCheck = Date.now();
  _setUserCache(target, cache);
  // same allProcessed check as in onCheckResult (to avoid duplicate code, we'll reuse)
  const allProcessed = channels.every(c => (cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)] !== undefined));
  if (allProcessed) {
    const joinedAll = channels.every(c => cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)]);
    if (joinedAll) send(target, "✅ <b>All required channels joined. Thank you!</b>");
    else {
      const missing = channels.filter(c => !cache.channels[(c.type === "public" ? ("@" + c.username) : c.id)]);
      let txt = "🚫 <b>You still need to join:</b>\n\n";
      missing.forEach((m, i) => { txt += `${i + 1}. ${m.type === "public" ? ("@" + m.username) : (m.invite ? `<a href="${m.invite}">${m.id}</a>` : m.id)}\n`; });
      send(target, txt);
    }
  }
}

/* Developer callable: show debug state (per-user) */
function membershipDebug(targetTelegramId) {
  const target = targetTelegramId || user.telegramid;
  const cache = _getUserCache(target);
  const channels = _getChannels();
  const details = channels.map(c => {
    const key = c.type === "public" ? ("@" + c.username) : c.id;
    return { channel: key, joined: !!cache.channels[key] };
  });
  const out = { user: target, lastCheck: cache.lastCheck, details: details };
  send(user.telegramid, "<b>🔍 Membership Debug:</b>\n<code>" + JSON.stringify(out, null, 2) + "</code>");
  return out;
}

/* optional: developer can store a command to be run when all joined */
function setOnAllJoinedCommand(cmd) {
  if (!onlyAdmin()) return;
  Bot.setProperty(LIB + "on_all_join_cmd", cmd, "string");
}

/* expose functions */
publish({
  // admin
  setupOwner: setupOwner, onlyAdmin: onlyAdmin, addAdmin: addAdmin, removeAdmin: removeAdmin,
  showAdminList: showAdminList, adminList: getAdmins, owner: getOwner,
  // ping/iteration
  ping: ping, iteration: iteration,
  // membership
  setupMembership: setupMembership,
  onMembershipSetup: onMembershipSetup,
  updateMembership: updateMembership,
  removeMembership: removeMembership,
  showMembershipList: showMembershipList,
  membershipCheck: membershipCheck,
  membershipDebug: membershipDebug,
  setOnAllJoinedCommand: setOnAllJoinedCommand
});

/* Register background commands handlers for Bot.run / Api callbacks */
on(LIB + "checkMemberships", checkMemberships);
on(LIB + "onCheckResult", onCheckResult);     // not used directly (we used LIB + "onCheckResult i" pattern)
on(LIB + "onCheckError", onCheckError);       // same as above
