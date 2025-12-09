/*  
 * UtilityLib v10 — FINAL PRODUCTION VERSION
 * ------------------------------------------
 * Features:
 *  - Admin system (Owner + Admins)
 *  - Ping
 *  - Iteration
 *  - Membership Checker (MCL Lite):
 *      · Admin Panel setup
 *      · checkJoin(channel)
 *      · checkJoinAll(channels)
 *      · requireJoin(channel)
 *      · requireJoinAll(channels)
 *      · Callbacks stored in Admin Panel
 *
 */

const LIB = "UtilityLib_";

// Keys for internal storage
const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEM_PANEL  = LIB + "join_panel";
const MEM_CACHE  = LIB + "join_cache_";

/* ============================================================
    GENERAL HELPERS
============================================================ */

function send(to, text, parse = "HTML") {
  Api.sendMessage({ chat_id: to, text, parse_mode: parse });
}

function normalizeChannel(ch) {
  ch = String(ch).trim();
  if (ch.startsWith("@")) return ch;
  if (/^-100\d{10,}$/.test(ch)) return ch; // private channel ID
  return ch;
}

function isJoined(status) {
  return ["member", "administrator", "creator"].includes(status);
}

/* ============================================================
    ADMIN SYSTEM (same as your current system)
============================================================ */

function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(arr) { Bot.setProperty(ADMINS_KEY, arr, "json"); }

function setupOwner() {
  if (getOwner()) {
    send(user.id, "ℹ️ <b>Owner already set:</b> <code>" + getOwner() + "</code>");
    return;
  }

  Bot.setProperty(OWNER_KEY, user.id, "integer");
  Bot.setProperty(ADMINS_KEY, [user.id], "json");

  send(user.id, "🎉 <b>Owner setup complete!</b>\nYou are Owner and Admin.");
}

function onlyAdmin() {
  let owner = getOwner();
  if (!owner) {
    send(user.id, "⚠️ Run <code>Libs.UtilityLib.setupOwner()</code> first.");
    return false;
  }

  if (!getAdmins().includes(user.id)) {
    send(user.id, "❌ <b>You are not admin.</b>");
    return false;
  }
  return true;
}

function addAdmin(id) {
  if (!onlyAdmin()) return;
  id = Number(id);

  let list = getAdmins();
  if (!list.includes(id)) {
    list.push(id);
    setAdmins(list);
    send(user.id, "✅ Added admin: <code>" + id + "</code>");
  }
}

function removeAdmin(id) {
  if (!onlyAdmin()) return;
  id = Number(id);

  let owner = getOwner();
  if (id === owner) {
    send(user.id, "⚠️ Cannot remove Owner.");
    return;
  }

  let list = getAdmins().filter(a => a !== id);
  setAdmins(list);
  send(user.id, "🗑 Removed admin: <code>" + id + "</code>");
}

function showAdminList() {
  let owner = getOwner();
  let admins = getAdmins();
  let msg = "👮 <b>Admins List</b>\n\n";

  admins.forEach((id, i) => {
    let role = (id === owner) ? " (Owner)" : "";
    msg += `${i + 1}. <code>${id}</code>${role}\n`;
  });

  send(user.id, msg);
}

/* ============================================================
    MEMBERSHIP CHECK — ADMIN PANEL SETUP
============================================================ */

function setupJoin() {
  const panel = {
    title: "Membership Checker",
    description: "Configure channels & callback commands.",
    icon: "person-add",

    fields: [
      { name: "channels", title: "Channels", type: "string", placeholder: "@chan1, -100123456" },
      { name: "cmd_joined", title: "onJoined", type: "string", placeholder: "/onJoined" },
      { name: "cmd_missing", title: "onNotJoined", type: "string", placeholder: "/onNotJoined" },
      { name: "cmd_all", title: "onAllJoined", type: "string", placeholder: "/onAllJoined" },
      { name: "cmd_error", title: "onError", type: "string", placeholder: "/onError" }
    ]
  };

  AdminPanel.setPanel({ panel_name: MEM_PANEL, data: panel });
  send(user.id, "🛠 Membership Checker Panel Installed.\nGo to: Bot → Admin Panels");
}

function getJoinSettings() {
  return AdminPanel.getPanelValues(MEM_PANEL) || {};
}

/* ============================================================
    MEMBERSHIP CHECK CORE
============================================================ */

function getUserCache() {
  return User.getProperty(MEM_CACHE + user.id) || {};
}

function setUserCache(obj) {
  User.setProperty(MEM_CACHE + user.id, obj, "json");
}

function cacheSave(channel, ok) {
  let cache = getUserCache();
  cache[channel] = { ok, ts: Date.now() };
  setUserCache(cache);
}

function checkJoin(channel) {
  channel = normalizeChannel(channel);
  Api.getChatMember({
    chat_id: channel,
    user_id: user.id,
    on_result: LIB + "onCheckOne " + encodeURIComponent(channel),
    on_error: LIB + "onCheckErr " + encodeURIComponent(channel)
  });
}

function onCheckOne() {
  const channel = decodeURIComponent(params.split(" ")[0]);
  const settings = getJoinSettings();
  const res = options.result;
  const status = res.status || res.result?.status;
  const ok = isJoined(status);

  cacheSave(channel, ok);

  if (ok && settings.cmd_joined) Bot.run({ command: settings.cmd_joined, options: { channel } });
  else if (!ok && settings.cmd_missing) Bot.run({ command: settings.cmd_missing, options: { channel } });
}
on(LIB + "onCheckOne", onCheckOne);

function onCheckErr() {
  const channel = decodeURIComponent(params.split(" ")[0]);
  const settings = getJoinSettings();
  cacheSave(channel, false);

  if (settings.cmd_error)
    Bot.run({ command: settings.cmd_error, options: { channel, error: options } });
}
on(LIB + "onCheckErr", onCheckErr);

/* ============================================================
    MULTI-CHANNEL CHECK
============================================================ */

function getChannelList() {
  let settings = getJoinSettings();
  if (!settings.channels) return [];
  return settings.channels.split(",").map(a => normalizeChannel(a.trim()));
}

function checkJoinAll() {
  let arr = getChannelList();
  if (!arr.length) return;

  arr.forEach(ch => checkJoin(ch));

  // If developer wants: they can detect "all joined" later via requireJoinAll()
}

/* ============================================================
    REQUIRE JOIN (Cached)
============================================================ */

function requireJoin(channel) {
  channel = normalizeChannel(channel);
  let cache = getUserCache()[channel];

  if (cache) return cache.ok;

  checkJoin(channel);
  return false;
}

function requireJoinAll() {
  let arr = getChannelList();
  let cache = getUserCache();

  let missing = [];
  arr.forEach(ch => {
    if (!cache[ch]) missing.push(ch);
    else if (!cache[ch].ok) missing.push(ch);
  });

  if (missing.length) {
    missing.forEach(ch => checkJoin(ch));
    return false;
  }
  return true;
}

/* ============================================================
    PING + ITERATION (unchanged)
============================================================ */

function ping() {
  if (options?.result) {
    let ms = Date.now() - options.bb_options.start;
    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${ms} ms</b>`,
      parse_mode: "HTML"
    });
    return;
  }

  Api.sendMessage({
    chat_id: user.id,
    text: "<b>Ping…</b>",
    parse_mode: "HTML",
    bb_options: { start: Date.now() },
    on_result: LIB + "pingAns"
  });
}
on(LIB + "pingAns", ping);

function iteration() {
  const d = iteration_quota;
  if (!d) { send(user.id, "❌ Cannot load iteration quota"); return; }

  const pct = ((d.progress / d.limit) * 100).toFixed(2);
  const bar = "█".repeat(pct / 4) + "░".repeat(25 - pct / 4);

  const msg =
    `⚙️ <b>BB Iteration</b>\n` +
    `<b>Limit:</b> ${d.limit}\n<b>Used:</b> ${d.progress}\n<b>${pct}%</b>\n` +
    `[ ${bar} ]`;

  send(user.id, msg);
}

/* ============================================================
    EXPORT API
============================================================ */

publish({
  setupOwner, onlyAdmin, addAdmin, removeAdmin, showAdminList,
  setupJoin, checkJoin, checkJoinAll, requireJoin, requireJoinAll,
  ping, iteration
});
