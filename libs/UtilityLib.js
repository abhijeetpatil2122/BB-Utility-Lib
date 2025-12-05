/*
 * Utility Library — Production Version
 * Features:
 *    ping()
 *    iteration()   <-- updated (returns raw object + prints formatted view)
 *    setupOwner()
 *    onlyAdmin()
 *    addAdmin()
 *    removeAdmin()
 *    adminList()
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
    "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> and first <b>Admin</b>."
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
      "⚠️ <b>Admin System Not Initialized</b>\n" +
      "Run:\n<code>Libs.UtilityLib.setupOwner()</code>"
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
    send(user.telegramid, "⚠️ <b>Invalid User ID</b>");
    return false;
  }

  let admins = getAdmins();

  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User already admin.</b>");
    return false;
  }

  admins.push(id);
  setAdmins(admins);

  send(
    user.telegramid,
    "✅ <b>Admin Added</b>\nUser: <code>" + id + "</code>"
  );

  send(
    id,
    "🎉 <b>You have been promoted to Admin!</b>"
  );

  return true;
}

/* ============================
        REMOVE ADMIN
============================ */
function removeAdmin(id) {
  if (!onlyAdmin()) return false;

  id = parseInt(id);

  if (!id) {
    send(user.telegramid, "⚠️ <b>Invalid User ID</b>");
    return false;
  }

  let owner = getOwner();

  if (id === owner) {
    send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>");
    return false;
  }

  let admins = getAdmins();

  if (!admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is not admin.</b>");
    return false;
  }

  admins = admins.filter(a => a !== id);
  setAdmins(admins);

  send(
    user.telegramid,
    "🗑 <b>Admin Removed</b>\nUser: <code>" + id + "</code>"
  );

  send(id, "⚠️ <b>You have been removed from Admin role.</b>");

  return true;
}

/* ============================
        ADMIN LIST
============================ */
function showAdminList() {
  let owner = getOwner();

  if (!owner) {
    send(
      user.telegramid,
      "⚠️ <b>Admin system is not set up.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
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
        ITERATION (UPDATED)
============================ */
function iteration() {
  const d = iteration_quota;

  if (!d) {
    send(request.chat.id, "<b>❌ Unable to load iteration quota.</b>");
    return null;
  }

  // Add useful derived values
  d.pct = ((d.progress / d.limit) * 100).toFixed(2);
  d.type = d.quotum_type?.name || "Unknown";
  d.base_limit = d.quotum_type?.base_limit;

  // Create progress bar
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((d.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;

  function fmt(t) {
    try { return new Date(t).toLocaleString(); }
    catch { return t; }
  }

  // FINAL formatted message
  let msg =
    `⚙️ <b>BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${d.id}</code>\n` +
    `<b>Type:</b> <code>${d.type}</code>\n` +
    `<b>Base Limit:</b> <code>${d.base_limit}</code>\n` +
    `<b>Ads Enabled:</b> <code>${d.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${d.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${d.limit}</code>\n` +
    `<b>Used:</b> <code>${d.progress}</code>\n` +
    `<b>Usage:</b> <code>${d.pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> ${fmt(d.started_at)}\n` +
    `<b>Ends:</b> ${fmt(d.ended_at)}`;

  send(request.chat.id, msg);

  // ALWAYS return raw object
  return d;
}

/* ============================
        EXPORT PUBLIC API
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
