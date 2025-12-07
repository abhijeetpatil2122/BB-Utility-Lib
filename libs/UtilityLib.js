/* UtilityLib v5 — corrected membership handlers + existing features
   (only membership code updated to fix session/params bug)
*/

let LIB = "UtilityLib_";
const OWNER_KEY = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEMBERSHIP_KEY = LIB + "membership_channels";
const CHECK_SESSION_PREFIX = LIB + "checksess_";

function _sendHtml(chat_id, text, reply_markup) {
  let params = { chat_id: chat_id, text: text, parse_mode: "HTML" };
  if (reply_markup) params.reply_markup = reply_markup;
  Api.sendMessage(params);
}

/* ----------------- Admin helpers (unchanged) ----------------- */
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

function setupOwner() {
  let owner = getOwner();
  if (owner) {
    _sendHtml(user.telegramid, `ℹ️ <b>Owner already set:</b>\n<code>${owner}</code>`);
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  _sendHtml(user.telegramid, "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>.");
  return true;
}

function onlyAdmin() {
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>`);
    return false;
  }
  let admins = getAdmins();
  if (!admins.includes(user.telegramid)) {
    _sendHtml(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}

function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) { _sendHtml(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>"); return false; }
  id = Number(id);
  let admins = getAdmins();
  if (admins.includes(id)) { _sendHtml(user.telegramid, "⚠️ <b>User is already admin.</b>"); return false; }
  admins.push(id);
  setAdmins(admins);
  _sendHtml(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  _sendHtml(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) { _sendHtml(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>"); return false; }
  id = Number(id);
  let owner = getOwner();
  if (id === owner) { _sendHtml(user.telegramid, "❌ <b>You cannot remove the Owner.</b>"); return false; }
  let admins = getAdmins();
  if (!admins.includes(id)) { _sendHtml(user.telegramid, "⚠️ <b>User is not an admin.</b>"); return false; }
  admins = admins.filter(a => a !== id);
  setAdmins(admins);
  _sendHtml(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  _sendHtml(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

function showAdminList() {
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>`);
    return;
  }
  let admins = getAdmins();
  if (!admins || admins.length === 0) return _sendHtml(user.telegramid, "⚠️ <b>No admins found.</b>");
  let msg = "👮 <b>Admins List</b>\n\n";
  let idx = 1;
  admins.forEach(id => {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${idx}. <code>${id}</code>${role}\n`; idx++;
  });
  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;
  _sendHtml(user.telegramid, msg);
}

/* ----------------- Ping / iteration (unchanged) ----------------- */
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
  const enriched = { ...d, pct: ((d.progress / d.limit) * 100).toFixed(2), type: d.quotum_type?.name || "Unknown", base_limit: d.quotum_type?.base_limit };
  if (mode && typeof mode === "string" && mode.includes(",")) {
    let keys = mode.split(",").map(k => k.trim()); let obj = {}; keys.forEach(k => { obj[k] = enriched[k]; }); return obj;
  }
  if (mode && mode !== "inspect") return enriched[mode];
  if (mode === "inspect") { _sendHtml(user.telegramid, "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>"); return d; }
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR); let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
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
  _sendHtml(user.telegramid, msg);
  return enriched;
}

/* ----------------- Membership system (FIXED) ----------------- */

function _getMembershipChannels() { return Bot.getProperty(MEMBERSHIP_KEY) || []; }
function _setMembershipChannels(arr) { Bot.setProperty(MEMBERSHIP_KEY, arr, "json"); }

function membershipList() {
  let arr = _getMembershipChannels();
  if (!arr || arr.length === 0) return _sendHtml(user.telegramid, "📭 <b>No membership channels configured.</b>");
  let text = "📢 <b>Required channels</b>\n\n";
  arr.forEach((ch, i) => {
    if (ch.type === "public") {
      text += `${i+1}. <b>@${ch.username}</b> — <a href="https://t.me/${ch.username}">Join</a>\n`;
    } else {
      text += `${i+1}. <i>Private Channel</i> — <a href="${ch.invite}">Join Private Channel ${i+1}</a>\n`;
    }
  });
  _sendHtml(user.telegramid, text);
  return arr;
}

function _parseMembershipInput(raw) {
  if (!raw) return { error: "Empty input" };
  let lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "No channels provided" };
  let out = [];
  for (let i=0;i<lines.length;i++){
    let ln = lines[i];
    if (ln.includes("|")) {
      let parts = ln.split("|").map(p => p.trim());
      if (parts.length < 2) return { error: `Invalid private line: ${ln}` };
      let id = parts[0];
      let invite = parts[1];
      if (!/^(-?\d+)$/.test(id)) return { error: `Invalid private id: ${id}` };
      if (!/^https?:\/\/t\.me\/\+/.test(invite)) return { error: `Invalid invite link (must be t.me/+...): ${invite}` };
      out.push({ type: "private", id: id, invite: invite });
      continue;
    }
    if (ln.startsWith("@")) {
      let username = ln.replace(/^@+/, "");
      if (!/^[A-Za-z0-9_]{5,}$/.test(username)) return { error: `Invalid public username: ${ln}` };
      out.push({ type: "public", username: username });
      continue;
    }
    return { error: `Unknown line format: ${ln}` };
  }
  if (out.length > 10) return { error: "Max 10 channels allowed" };
  return { value: out };
}

function membershipSetup() {
  if (!onlyAdmin()) return;
  Bot.run({ command: "/onMembershipSetup", options: { from_lib: true } });
  _sendHtml(user.telegramid,
    "📥 <b>Membership setup started.</b>\n\n" +
    "Please paste channels list in /onMembershipSetup (one per line):\n\n" +
    "<b>Public:</b> @ChannelName\n<b>Private:</b> -1001234567890 | https://t.me/+InviteLink\n\nMax 10 channels."
  );
}

function onSetupCommand(rawText) {
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin system not set.</b>\nRun: <code>Libs.UtilityLib.setupOwner()</code>`);
    return false;
  }
  if (user.telegramid !== owner) {
    _sendHtml(user.telegramid, "❌ <b>Only owner can run membership setup.</b>");
    return false;
  }
  let parsed = _parseMembershipInput(rawText);
  if (parsed.error) {
    _sendHtml(user.telegramid, `<b>❌ Error parsing input:</b>\n<code>${parsed.error}</code>`);
    return false;
  }
  _setMembershipChannels(parsed.value);
  _sendHtml(user.telegramid, `✅ <b>Saved ${parsed.value.length} channels.</b>`);
  return true;
}

function membershipUpdate(newRawText) {
  if (!onlyAdmin()) return false;
  let parsed = _parseMembershipInput(newRawText);
  if (parsed.error) { _sendHtml(user.telegramid, `<b>❌ Error:</b> ${parsed.error}`); return false; }
  _setMembershipChannels(parsed.value);
  _sendHtml(user.telegramid, `✅ <b>Membership channels updated (${parsed.value.length}).</b>`);
  return true;
}

function membershipRemove(index) {
  if (!onlyAdmin()) return false;
  index = parseInt(index);
  if (!index || index < 1) { _sendHtml(user.telegramid, "⚠️ <b>Provide 1-based index.</b>"); return false; }
  let arr = _getMembershipChannels();
  if (index > arr.length) { _sendHtml(user.telegramid, "⚠️ <b>Index out of range.</b>"); return false; }
  let removed = arr.splice(index-1, 1);
  _setMembershipChannels(arr);
  _sendHtml(user.telegramid, `🗑 <b>Removed:</b> ${(removed[0].type==="public") ? "@" + removed[0].username : "Private"}\nTotal now: ${arr.length}`);
  return true;
}

/* membershipCheck: starts per-user session, fires Api.getChatMember for each channel, stores results
   Returns false immediately; processCheck will evaluate and send UI or success. */
function membershipCheck() {
  let channels = _getMembershipChannels();
  if (!channels || channels.length === 0) return true;
  if (channels.length > 10) channels = channels.slice(0,10);

  let sessionId = String(Date.now()) + "_" + user.telegramid;
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  // initial meta: expected, received, results, user_telegramid (store for process)
  let meta = { expected: channels.length, received: 0, results: {}, user_telegramid: user.telegramid, created_at: Date.now() };
  Bot.setProperty(metaKey, meta, "json");

  for (let i=0;i<channels.length;i++){
    let ch = channels[i];
    let cb = LIB + "onMemberRes " + sessionId + " " + i;
    let chat_id = (ch.type === "public") ? ("@" + ch.username) : ch.id;
    Api.getChatMember({
      chat_id: chat_id,
      user_id: user.telegramid,
      on_result: cb,
      on_error: cb
    });
  }

  // Schedule processing in background (2s). processCheck will read params for sessionId.
  Bot.run({ command: LIB + "processCheck " + sessionId, run_after: 2 });
  return false;
}

/* onMemberRes receives Api.getChatMember responses.
   params = "<sessionId> <index>"
*/
function onMemberRes() {
  let parts = params.split(" ");
  let sessionId = parts[0];
  let idx = parseInt(parts[1]);
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  let meta = Bot.getProperty(metaKey);
  if (!meta) { return; }
  // Save result (options global contains result or error)
  if (options && options.result) {
    meta.results[idx] = { result: options.result };
  } else {
    meta.results[idx] = { status: "invalid", info: options };
  }
  meta.received = (meta.received || 0) + 1;
  Bot.setProperty(metaKey, meta, "json");
}

/* processCheck MUST read sessionId from params (Bots.Business passes params as global) */
function processCheck() {
  let sessionId = params;           // <-- IMPORTANT: read params global
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  let meta = Bot.getProperty(metaKey);
  if (!meta) {
    // meta missing => timeout/failed initial save
    // Try to inform the user who initiated (we don't have user context reliably) — just log to errors by throwing
    _sendHtml(user ? user.telegramid : 0, "⚠️ <b>Membership check timed out. Try again.</b>");
    return false;
  }

  // channel list
  let channels = _getMembershipChannels();
  if (!channels || channels.length === 0) {
    _sendHtml(meta.user_telegramid, "✅ <b>No membership required.</b>");
    Bot.deleteProp(metaKey);
    return true;
  }

  // Evaluate results
  let notJoined = [];
  let invalid = [];
  for (let i=0;i<channels.length;i++){
    let res = meta.results && meta.results[i];
    let ch = channels[i];
    if (!res || res.status === "invalid" || res.status === "error") {
      // If API returned invalid, mark invalid; otherwise not joined
      if (res && res.status === "invalid") invalid.push({ index: i, channel: ch });
      else notJoined.push({ index: i, channel: ch });
      continue;
    }
    if (!["member","administrator","creator"].includes(res.result.status)) {
      notJoined.push({ index: i, channel: ch });
    }
  }

  // All joined
  if (notJoined.length === 0 && invalid.length === 0) {
    _sendHtml(meta.user_telegramid, "✅ <b>All channels joined. Access granted.</b>");
    Bot.deleteProp(metaKey);
    return true;
  }

  // Build message (Public: show @ and link; Private: show invite link)
  let header = "📢 <b>Please join our required channels:</b>\n\n";
  let body = "";
  channels.forEach((ch, idx) => {
    if (ch.type === "public") {
      body += `${idx+1}. <b>@${ch.username}</b> — <a href="https://t.me/${ch.username}">Join</a>`;
    } else {
      body += `${idx+1}. <a href="${ch.invite}">Join Private Channel ${idx+1}</a>`;
    }
    let stat = " ⛔";
    let found = (meta.results && meta.results[idx] && meta.results[idx].result && ["member","administrator","creator"].includes(meta.results[idx].result.status));
    if (found) stat = " ✅";
    body += stat + "\n";
  });

  let msg = header + body + `\nAfter joining, press <b>Check Again</b>.`;

  // Build inline keyboard: 2 buttons per row, final row "Check Again"
  let kb = []; let row = [];
  for (let i=0;i<channels.length;i++) {
    let ch = channels[i];
    let btnText = `Join ${i+1}`;
    let url = (ch.type === "public") ? `https://t.me/${ch.username}` : ch.invite;
    row.push({ text: btnText, url: url });
    if (row.length === 2) { kb.push(row); row = []; }
  }
  if (row.length) kb.push(row);
  kb.push([{ text: "🔄 Check Again", callback_data: "/onMembershipCheck" }]);

  _sendHtml(meta.user_telegramid, msg, { inline_keyboard: kb });

  // keep meta a bit for debugging (remains in Bot props)
  Bot.setProperty(metaKey, meta, "json");
  return false;
}

/* membershipRawCheck - convenience to start a raw check and ask user to inspect later */
function membershipRawCheck() {
  let arr = _getMembershipChannels();
  if (!arr || arr.length === 0) { _sendHtml(user.telegramid, "<b>No membership channels configured.</b>"); return null; }
  membershipCheck();
  _sendHtml(user.telegramid, "<i>Check started. Wait ~2s then inspect logs or rerun membershipRawCheck()</i>");
  return null;
}

/* Export */
publish({
  // admin
  setupOwner: setupOwner, onlyAdmin: onlyAdmin, addAdmin: addAdmin, removeAdmin: removeAdmin,
  showAdminList: showAdminList, owner: getOwner, adminList: getAdmins,
  // ping/iteration
  ping: ping, iteration: iteration,
  // membership
  membershipSetup: membershipSetup, onSetupCommand: onSetupCommand,
  membershipList: membershipList, membershipRemove: membershipRemove, membershipUpdate: membershipUpdate,
  membershipCheck: membershipCheck, membershipRawCheck: membershipRawCheck
});

/* Bind internal handlers to be callable by Api/ Bot.run */
on(LIB + "onMemberRes", onMemberRes);
on(LIB + "processCheck", processCheck);
