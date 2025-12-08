/*
 * UtilityLib v6 — MembershipChecker + Admin + Tools
 *
 * Methods exported:
 *  - setupMembership(options)   // options.channels: array of channels (strings), callbacks, checkDelay (minutes)
 *  - handle(passed_options)     // call in @ command for soft checking with delay
 *  - check(passed_options)      // manual check now (background)
 *  - checkMembership(chat_id)   // internal - runs getChatMember
 *  - isMember(chat_id)          // check cached result (or global)
 *  - getChats()                 // returns configured channels array
 *  - getNotJoinedChats()        // returns list of missing channels from cache
 *
 * - admin utilities: setupOwner(), addAdmin(id), removeAdmin(id), showAdminList(), onlyAdmin()
 * - tools: ping(), iteration()
 *
 * Notes:
 *  - Developer should set callbacks via setupMembership(options). Callbacks are bot commands strings.
 *  - Bot must be admin in channels for getChatMember to work reliably for private channels.
 */

const LIB_PREFIX = "UtilityLib_v6_";
const OWNER_KEY  = LIB_PREFIX + "owner";
const ADMINS_KEY = LIB_PREFIX + "admins";
const OPTS_KEY   = LIB_PREFIX + "options";       // stores membership config
const USERDATA_PREFIX = LIB_PREFIX + "UserData_"; // per-user cached data prefix
const RUN_PREFIX = LIB_PREFIX + "run_";           // aggregator runs

/* ------------------------------
   Helpers
--------------------------------*/
function _send(to, text, parse_mode = "HTML") {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: parse_mode });
}
function _isNumeric(v) { return /^-?\d+$/.test(String(v)); }
function _normalizeChannelRaw(ch) {
  if (!ch && ch !== 0) return null;
  ch = String(ch).trim();

  // Accept -100... id
  if (_isNumeric(ch) && String(ch).startsWith("-100")) return ch;

  // Accept numeric id without prefix
  if (_isNumeric(ch) && !String(ch).startsWith("-100")) return ch;

  // Convert t.me or https://t.me/whatever to @whatever
  try {
    let u = ch.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    if (u.startsWith("t.me/")) {
      let name = u.split("/")[1];
      if (name) return "@" + name;
    }
  } catch (e) {}

  // If already username with @
  if (ch.startsWith("@")) return ch;

  // fallback — try adding @
  if (/^[A-Za-z0-9_]{5,}$/.test(ch)) return "@" + ch;

  return ch;
}

/* ------------------------------
   Per-bot admin system
--------------------------------*/
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }

function setupOwner() {
  if (getOwner()) {
    _send(user.telegramid, `ℹ️ <b>Owner already set:</b>\n<code>${getOwner()}</code>`);
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  _send(user.telegramid, "🎉 <b>Owner setup complete — you are Owner & first Admin.</b>");
  return true;
}

function onlyAdmin() {
  const owner = getOwner();
  if (!owner) {
    _send(user.telegramid,
      "⚠️ <b>Admin system not initialized. Run:</b>\n<code>Libs.UtilityLib.setupOwner()</code>");
    return false;
  }
  const admins = getAdmins();
  if (!admins.includes(user.telegramid)) {
    _send(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}
function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!_isNumeric(id)) { _send(user.telegramid, "⚠️ <b>ID must be numeric.</b>"); return false; }
  id = Number(id);
  let list = getAdmins();
  if (list.includes(id)) { _send(user.telegramid, "⚠️ <b>Already admin.</b>"); return false; }
  list.push(id); setAdmins(list);
  _send(user.telegramid, `✅ <b>Added admin:</b> <code>${id}</code>`);
  _send(id, "🎉 <b>You are now admin for this bot.</b>");
  return true;
}
function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!_isNumeric(id)) { _send(user.telegramid, "⚠️ <b>ID must be numeric.</b>"); return false; }
  id = Number(id);
  const owner = getOwner();
  if (id === owner) { _send(user.telegramid, "❌ <b>Cannot remove Owner.</b>"); return false; }
  let list = getAdmins();
  if (!list.includes(id)) { _send(user.telegramid, "⚠️ <b>Not an admin.</b>"); return false; }
  list = list.filter(x => x !== id); setAdmins(list);
  _send(user.telegramid, `🗑 <b>Removed admin:</b> <code>${id}</code>`);
  _send(id, "⚠️ <b>You were removed from admins.</b>");
  return true;
}
function showAdminList() {
  const owner = getOwner();
  if (!owner) { _send(user.telegramid, "⚠️ Admin system not initialized. Run setupOwner()"); return; }
  const list = getAdmins();
  if (!list.length) { _send(user.telegramid, "⚠️ No admins"); return; }
  let txt = "👮 <b>Admins</b>\n\n";
  list.forEach((id, i) => {
    const role = (id === owner ? " (Owner)" : "");
    txt += `${i+1}. <code>${id}</code>${role}\n`;
  });
  _send(user.telegramid, txt);
}

/* ------------------------------
   Options storage (per-bot)
   options = {
     channels: ["@a", "-100..."],
     onJoining, onNeedJoining, onAllJoining, onNeedAllJoining, onStillJoined, onError,
     checkDelay: minutes (integer)
   }
--------------------------------*/
function setupMembership(opts) {
  if (!opts || !opts.channels || !Array.isArray(opts.channels) || opts.channels.length === 0) {
    _send(user.telegramid, "⚠️ <b>Provide channels array in options.channels</b>");
    return false;
  }
  // normalize channels
  const normalized = opts.channels.map(c => _normalizeChannelRaw(c)).filter(Boolean);
  opts.channels = normalized;
  // default checkDelay
  if (!opts.checkDelay) opts.checkDelay = 10;
  Bot.setProperty(OPTS_KEY, opts, "json");
  _send(user.telegramid, `✅ <b>Membership configured:</b>\nChannels: ${normalized.join(", ")}\nDelay: ${opts.checkDelay} min`);
  return true;
}

function _getOptions() {
  return Bot.getProperty(OPTS_KEY) || {};
}

/* ------------------------------
   Per-user cache helpers
   store object under prop USERDATA_PREFIX + user.id
   structure:
   { chats: { channel: ts_or_negative_ts }, lastCheckTime: ts, ... }
--------------------------------*/
function _getUserData(u) {
  const uid = u || (user && user.id);
  if (!uid) return null;
  let data = User.getProp(USERDATA_PREFIX + uid);
  if (!data) data = { chats: {} };
  if (!data.chats) data.chats = {};
  return data;
}
function _saveUserData(u, data) {
  const uid = u || (user && user.id);
  if (!uid) return;
  User.setProp(USERDATA_PREFIX + uid, data, "json");
}

/* ------------------------------
   Internal helpers used by checks
--------------------------------*/
function _isJoinedResponse(resp) {
  // options/result structure may vary: official getChatMember has result.status OR status
  try {
    let status = null;
    if (resp && resp.result && resp.result.status) status = resp.result.status;
    else if (resp && resp.status) status = resp.status;
    return ["member", "administrator", "creator"].includes(status);
  } catch (e) { return false; }
}

/* ------------------------------
   Single-channel getChatMember call
   on_result => LIB_PREFIX + "onCheck" + encodedChannel
--------------------------------*/
function checkMembership(chat_id_raw) {
  const opts = _getOptions();
  const chat_id = _normalizeChannelRaw(chat_id_raw);
  if (!chat_id) { _send(user.telegramid, "⚠️ <b>Invalid channel</b>"); return false; }

  Api.getChatMember({
    chat_id: chat_id,
    user_id: user.telegramid,
    on_result: LIB_PREFIX + "onCheck " + encodeURIComponent(chat_id),
    on_error:  LIB_PREFIX + "onError " + encodeURIComponent(chat_id),
    bb_options: { caller: "UtilityLib.checkMembership" }
  });
  return true;
}

/* on_result handler for single check */
function _onCheck() {
  const enc = params.split(" ")[0] || "";
  const channel = decodeURIComponent(enc);
  // options contains telegram response object
  try {
    const joined = _isJoinedResponse(options);
    // store per-user userData.chats[channel] = positive timestamp for joined, negative to mark not-joined
    let ud = _getUserData(user.id);
    ud.chats = ud.chats || {};
    ud.chats[channel] = joined ? Date.now() : -Date.now();
    ud.lastCheckTime = Date.now();
    _saveUserData(user.id, ud);

    const cfg = _getOptions();
    if (joined && cfg.onJoining) Bot.run({ command: cfg.onJoining, options: { channel: channel, result: options } });
    if (!joined && cfg.onNeedJoining) Bot.run({ command: cfg.onNeedJoining, options: { channel: channel, result: options } });

  } catch (e) {
    const cfg = _getOptions();
    if (cfg.onError) Bot.run({ command: cfg.onError, options: { channel: channel, error: String(e), raw: options } });
  }
}
on(LIB_PREFIX + "onCheck", _onCheck);

/* on_error handler for single check */
function _onError() {
  const enc = params.split(" ")[0] || "";
  const channel = decodeURIComponent(enc);
  // store negative
  let ud = _getUserData(user.id);
  ud.chats = ud.chats || {};
  ud.chats[channel] = -Date.now();
  ud.lastCheckTime = Date.now();
  _saveUserData(user.id, ud);
  const cfg = _getOptions();
  if (cfg.onError) Bot.run({ command: cfg.onError, options: { channel: channel, error: options } });
}
on(LIB_PREFIX + "onError", _onError);

/* ------------------------------
   Aggregator: check many channels (background)
   check(channels) will dispatch getChatMember for each and track results via runId
--------------------------------*/
function check(channels_or_opts) {
  const cfg = _getOptions();
  let channels = [];
  if (!channels_or_opts) {
    if (!cfg.channels || !cfg.channels.length) { _send(user.telegramid, "⚠️ No channels configured. Use setupMembership()."); return false; }
    channels = cfg.channels;
  } else if (Array.isArray(channels_or_opts)) {
    channels = channels_or_opts.map(c => _normalizeChannelRaw(c));
  } else if (typeof channels_or_opts === "object" && channels_or_opts.channels) {
    channels = channels_or_opts.channels.map(c => _normalizeChannelRaw(c));
  } else {
    _send(user.telegramid, "⚠️ Invalid channels param for check()");
    return false;
  }

  channels = channels.filter(Boolean);
  if (channels.length === 0) { _send(user.telegramid, "⚠️ No valid channels to check"); return false; }

  const runId = RUN_PREFIX + Date.now() + "_" + Math.floor(Math.random()*9999);
  let runState = { total: channels.length, results: {}, okCount: 0, runId: runId, userId: user.id };
  User.setProp(runId, runState, "json");

  channels.forEach(ch => {
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: LIB_PREFIX + "onCheckAllResult " + runId + " " + encodeURIComponent(ch),
      on_error:  LIB_PREFIX + "onCheckAllError " + runId + " " + encodeURIComponent(ch),
      bb_options: { caller: "UtilityLib.checkAll" }
    });
  });

  return true;
}

/* aggregator on_result */
function _onCheckAllResult() {
  // params: "<runId> <encodedChannel>"
  const parts = params.split(" ");
  const runId = parts[0];
  const enc = parts.slice(1).join(" ");
  const channel = decodeURIComponent(enc);

  try {
    let run = User.getProp(runId) || { total: 0, results: {} };
    const joined = _isJoinedResponse(options);
    run.results[channel] = { ok: !!joined, result: options };
    run.okCount = Object.values(run.results).filter(r => r.ok).length;
    User.setProp(runId, run, "json");

    // update per-user cache
    let ud = _getUserData(user.id);
    ud.chats = ud.chats || {};
    ud.chats[channel] = joined ? Date.now() : -Date.now();
    ud.lastCheckTime = Date.now();
    _saveUserData(user.id, ud);

    // finalize if finished
    if (Object.keys(run.results).length >= run.total) _finalizeRun(runId, run);
  } catch (e) {
    _finalizeRun(runId, null, e);
  }
}
on(LIB_PREFIX + "onCheckAllResult", _onCheckAllResult);

/* aggregator on_error */
function _onCheckAllError() {
  const parts = params.split(" ");
  const runId = parts[0];
  const enc = parts.slice(1).join(" ");
  const channel = decodeURIComponent(enc);

  let run = User.getProp(runId) || { total: 0, results: {} };
  run.results[channel] = { ok: false, error: options };
  User.setProp(runId, run, "json");

  // cache negative
  let ud = _getUserData(user.id);
  ud.chats = ud.chats || {};
  ud.chats[channel] = -Date.now();
  ud.lastCheckTime = Date.now();
  _saveUserData(user.id, ud);

  if (Object.keys(run.results).length >= run.total) _finalizeRun(runId, run);
}
on(LIB_PREFIX + "onCheckAllError", _onCheckAllError);

/* finalize aggregator run - call configured callbacks */
function _finalizeRun(runId, runState, err) {
  const cfg = _getOptions();
  if (err) {
    if (cfg.onError) Bot.run({ command: cfg.onError, options: { runId: runId, error: String(err) } });
    return;
  }
  // check all ok?
  const allOk = Object.values(runState.results).every(r => r.ok === true);
  if (allOk) {
    if (cfg.onAllJoining) Bot.run({ command: cfg.onAllJoining, options: { runId: runId, results: runState.results } });
  } else {
    if (cfg.onSomeMissing) Bot.run({ command: cfg.onSomeMissing, options: { runId: runId, results: runState.results } });
  }
  User.setProp(runId, null); // cleanup
}

/* ------------------------------
   requireCached helpers
   - isMember(chat) checks cached ud.chats[chat] > 0
   - isMemberAll checks all
--------------------------------*/
function isMember(chat_id) {
  const opts = _getOptions();
  const ud = _getUserData(user.id);
  if (chat_id) {
    const ch = _normalizeChannelRaw(chat_id);
    return !!(ud && ud.chats && ud.chats[ch] && ud.chats[ch] > 0);
  }
  // no chat given -> check all configured channels
  if (!opts.channels || opts.channels.length === 0) return false;
  const notJoined = getNotJoinedChats();
  return !(notJoined && notJoined.length > 0);
}

function getChats() {
  const opts = _getOptions();
  return opts.channels || [];
}

function getNotJoinedChats() {
  const opts = _getOptions();
  const ud = _getUserData(user.id) || { chats: {} };
  const result = [];
  const channels = opts.channels || [];
  channels.forEach(chRaw => {
    const ch = _normalizeChannelRaw(chRaw);
    const val = ud.chats && ud.chats[ch];
    if (!(val && val > 0)) result.push(ch);
  });
  return result;
}

/* ------------------------------
   handle() — the "before all" flow with delay guard (similar to MCL)
   - call Libs.UtilityLib.handle() in @ command for private chat only
--------------------------------*/
function handle(passed_options) {
  // only in private chat
  if (!chat || chat.chat_type !== "private") return;
  const opts = _getOptions();
  if (!opts.channels || opts.channels.length === 0) return;

  let ud = _getUserData(user.id);
  if (!ud) ud = { chats: {} };
  const last = ud.lastCheckTime || 0;

  // spam guard: at least 2 seconds
  if (last && (Date.now() - last) < 2000) return;

  const delay = (opts.checkDelay || 10) * 60 * 1000;
  if (!last || (Date.now() - last) > delay) {
    // run background aggregator check
    check(opts.channels);
  }
}

/* ------------------------------
   iteration() and ping() helpers (from earlier lib)
--------------------------------*/
function iteration() {
  const d = iteration_quota;
  if (!d) { _send(user.telegramid, "<b>❌ Can't load iteration quota</b>"); return null; }
  const BAR = 25, FULL = "█", EMPTY = "░";
  let used = d.progress || 0, limit = d.limit || 1;
  let pct = ((used / limit) * 100).toFixed(2);
  let fill = Math.round((pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t) { try { return new Date(t).toLocaleString() } catch (e) { return t } }
  let msg =
    `⚙️ <b>BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${d.id}</code>\n` +
    `<b>Type:</b> <code>${d.quotum_type?.name}</code>\n` +
    `<b>Base Limit:</b> <code>${d.quotum_type?.base_limit}</code>\n` +
    `<b>Ads Enabled:</b> <code>${d.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${d.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${limit}</code>\n` +
    `<b>Used:</b> <code>${used}</code>\n` +
    `<b>Usage:</b> <code>${pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> ${fmt(d.started_at)}\n` +
    `<b>Ends:</b> ${fmt(d.ended_at)}`;
  _send(user.telegramid, msg);
  return d;
}

function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start;
    Api.editMessageText({ chat_id: options.result.chat.id, message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`, parse_mode: "HTML" });
    return;
  }
  Api.sendMessage({ chat_id: user.telegramid, text: "<b>Ping…</b>", parse_mode: "HTML",
    bb_options: { start: Date.now() }, on_result: LIB_PREFIX + "onPing" });
}
on(LIB_PREFIX + "onPing", ping);

/* ------------------------------
   Publish public API
--------------------------------*/
publish({
  // admin
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  showAdminList: showAdminList,

  // membership config
  setupMembership: setupMembership,
  getChats: getChats,

  // methods
  handle: handle,
  check: check,
  checkMembership: checkMembership,
  isMember: isMember,
  getNotJoinedChats: getNotJoinedChats,

  // tools
  ping: ping,
  iteration: iteration
});
