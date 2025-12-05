/*
 * Utility Library — FINAL v3
 * Features:
 *    ping()
 *    iteration(mode)  ← 3-mode: formatted, inspect, pick values
 *    setupOwner()
 *    onlyAdmin()
 *    addAdmin()
 *    removeAdmin()
 *    showAdminList()
*/

let LIB = "UtilityLib_";

const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";

function send(to, text) {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: "HTML" });
}

/* ============================
       INTERNAL HELPERS
============================ */
function getOwner() {
  return Bot.getProperty(OWNER_KEY);
}

function getAdmins() {
  return Bot.getProperty(ADMINS_KEY) || [];
}

function setAdmins(list) {
  Bot.setProperty(ADMINS_KEY, list, "json");
}

/* ============================
       OWNER SETUP
============================ */
function setupOwner() {
  let owner = getOwner();

  if (owner) {
    send(
      user.telegramid,
      "ℹ️ <b>Owner already set:</b>\n<code>" + owner + "</code>"
    );
    return true;
  }

  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");

  send(
    user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\n" +
    "You are now the <b>Owner</b> and first <b>Admin</b>."
  );

  return true;
}

/* ============================
        ADMIN CHECK
============================ */
function onlyAdmin() {
  let owner = getOwner();
  if (!owner) {
    send(
      user.telegramid,
      "⚠️ <b>Admin System Not Set Up!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
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

/* ============================
        ADD ADMIN
============================ */
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

/* ============================
        REMOVE ADMIN
============================ */
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

/* ============================
        SHOW ADMIN LIST
============================ */
function showAdminList() {
  let owner = getOwner();

  if (!owner) {
    send(
      user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    );
    return;
  }

  let admins = getAdmins();

  if (admins.length === 0) {
    send(user.telegramid, "⚠️ <b>No admins found.</b>");
    return;
  }

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

/* ============================
             PING
============================ */
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

/* ============================
   ITERATION — FINAL v3
============================ */
function iteration(mode) {
  const raw = iteration_quota;
  if (!raw) return null;

  const enriched = {
    ...raw,
    pct: ((raw.progress / raw.limit) * 100).toFixed(2),
    type: raw.quotum_type?.name || "Unknown",
    base_limit: raw.quotum_type?.base_limit
  };

  if (typeof mode === "string" && mode.includes(",")) {
    let keys = mode.split(",").map(s => s.trim());
    let result = {};
    keys.forEach(k => {
      if (raw.hasOwnProperty(k)) result[k] = raw[k];
    });
    return result;
  }

  if (typeof mode === "string" && mode !== "inspect") {
    return raw[mode];
  }

  if (mode === "inspect") {
    let txt = JSON.stringify(raw, null, 2);
    send(
      request.chat.id,
      "<b>📦 Iteration Inspect Data:</b>\n<code>" + txt + "</code>"
    );
    return raw;
  }

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

  send(request.chat.id, msg);
  return enriched;
}

/* ============================
        EXPORT API
============================ */
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
