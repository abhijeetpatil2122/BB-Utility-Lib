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
 */

let LIB = "UtilityLib_";

const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";

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
   EXPORT API
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
  owner: getOwner
});
