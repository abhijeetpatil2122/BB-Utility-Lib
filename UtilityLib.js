/*
 *  BB UTILITY LIBRARY — FINAL VERSION
 *  Author: Paradox
 *  Provides: Ping, Iteration Stats, Admin System
 */

let LIB = "UtilityLib_";

/* ---------------------------------------------------
 * 1️⃣ PING — Measure Latency
 * --------------------------------------------------- */
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
    on_result: "UtilityLib_ping"
  });
}

/* bind callback */
on("UtilityLib_ping", ping);


/* ---------------------------------------------------
 * 2️⃣ BB ITERATION STATS
 * --------------------------------------------------- */
function bbIteration() {
  const BAR = 25,
    FULL = "█",
    EMPTY = "░";

  let used = iteration_quota.progress || 0;
  let limit = iteration_quota.limit || 1;
  let pct = ((used / limit) * 100).toFixed(2);
  let filled = Math.round((pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(filled)}${EMPTY.repeat(BAR - filled)} ]`;

  let msg =
    `<b>⚙️ BB Iteration Quota</b>\n\n` +
    `• <b>Total:</b> <code>${limit}</code>\n` +
    `• <b>Used:</b> <code>${used}</code>\n` +
    `• <b>Usage:</b> <code>${pct}%</code>\n\n` +
    `${bar}`;

  Api.sendMessage({
    chat_id: request.chat.id,
    text: msg,
    parse_mode: "HTML"
  });
}


/* ---------------------------------------------------
 * 3️⃣ ADMIN SYSTEM
 * --------------------------------------------------- */

function getAdmins() {
  return Bot.getProperty(LIB + "admins", []) || [];
}

function saveAdmins(list) {
  Bot.setProperty(LIB + "admins", list, "json");
}

function isAdmin(id) {
  return getAdmins().includes(id);
}

function requireAdmin() {
  if (!isAdmin(user.telegramid)) {
    Bot.sendMessage("❌ <b>Admin only command.</b>", { parse_mode: "HTML" });
    return false;
  }
  return true;
}

/* -------- Add Admin Flow -------- */

function addAdminFlow() {
  if (!requireAdmin()) return;

  Bot.sendMessage("➕ <b>Send Telegram ID to add as admin:</b>", {
    parse_mode: "HTML"
  });

  Bot.run({
    command: "UtilityLib_doAddAdmin"
  });
}

function doAddAdmin() {
  let id = parseInt(message);
  if (!id) {
    Bot.sendMessage("⚠️ <b>Invalid ID. Please send a valid number.</b>", {
      parse_mode: "HTML"
    });
    return;
  }

  let list = getAdmins();
  if (list.includes(id)) {
    Bot.sendMessage("ℹ️ <b>ID already exists in admin list.</b>", {
      parse_mode: "HTML"
    });
    return;
  }

  list.push(id);
  saveAdmins(list);

  Bot.sendMessage(`✅ <b>Admin added:</b> <code>${id}</code>`, {
    parse_mode: "HTML"
  });
}

on("UtilityLib_doAddAdmin", doAddAdmin);


/* -------- Remove Admin Flow -------- */

function removeAdminFlow() {
  if (!requireAdmin()) return;

  Bot.sendMessage("➖ <b>Send Telegram ID to remove:</b>", {
    parse_mode: "HTML"
  });

  Bot.run({
    command: "UtilityLib_doRemoveAdmin"
  });
}

function doRemoveAdmin() {
  let id = parseInt(message);
  if (!id) {
    Bot.sendMessage("⚠️ <b>Invalid ID.</b>", { parse_mode: "HTML" });
    return;
  }

  let list = getAdmins();
  if (!list.includes(id)) {
    Bot.sendMessage("❌ <b>ID is not an admin.</b>", {
      parse_mode: "HTML"
    });
    return;
  }

  list = list.filter(a => a !== id);
  saveAdmins(list);

  Bot.sendMessage(`🗑 <b>Admin removed:</b> <code>${id}</code>`, {
    parse_mode: "HTML"
  });
}

on("UtilityLib_doRemoveAdmin", doRemoveAdmin);


/* -------- Show Admin List -------- */

function showAdmins() {
  if (!requireAdmin()) return;

  let list = getAdmins();
  if (list.length === 0) {
    Bot.sendMessage("📭 <b>No admins added yet.</b>", {
      parse_mode: "HTML"
    });
    return;
  }

  let msg = "<b>👮 Admin List:</b>\n\n";
  list.forEach(id => {
    msg += `• <code>${id}</code>\n`;
  });

  Bot.sendMessage(msg, { parse_mode: "HTML" });
}


/* ---------------------------------------------------
 * EXPORT
 * --------------------------------------------------- */
publish({
  ping: ping,
  bbIteration: bbIteration,

  addAdmin: addAdminFlow,
  removeAdmin: removeAdminFlow,
  showAdmins: showAdmins,

  isAdmin: isAdmin,
  requireAdmin: requireAdmin
});
