/*
 * UtilityLib v5 — Membership + Admin + Tools
 *
 * Features:
 *  - Admin system (owner + admins)
 *  - ping()
 *  - iteration()
 *  - membership checker:
 *      setJoinCallbacks({ onJoined, onNotJoined, onError, onAllJoined, onSomeMissing })
 *      checkJoin(channel)         // async -> triggers callbacks; stores result in User prop
 *      checkJoinAll([channels])   // async -> triggers aggregated callbacks; stores results
 *      requireJoin(channel)       // uses cached result; if missing -> triggers check and returns false
 *      requireJoinAll([channels]) // same for multiple
 *
 * Notes:
 *  - Callbacks are developer commands (strings). If not set, no callback is called.
 *  - Channel can be public username (e.g. "@channel") or chat id (e.g. "-1001234567890").
 *  - Bot must be admin in the target channel for checks to work properly.
 */

const LIB = "UtilityLib_";
const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const CB_KEY     = LIB + "callbacks";      // stores callbacks mapping
const CHECK_CACHE_KEY = LIB + "checkcache_"; // per-user cache prefix

/* ------------------------------
   Small helpers
--------------------------------*/
function send(to, text, parse = "HTML") {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: parse });
}
function isNumeric(v){ return /^-?\d+$/.test(String(v)); }
function normalizeChannel(ch){
  if(!ch && ch !== 0) return null;
  ch = String(ch).trim();
  // if looks like -100... or numeric -> use as-is
  if(isNumeric(ch) && String(ch).startsWith("-100")) return ch;
  if(isNumeric(ch)) return ch;
  // ensure starts with @ for username
  if(ch.startsWith("@")) return ch;
  return (ch.startsWith("t.me/")? ch : ch); // fallback
}
function cacheKeyFor(userId){ return CHECK_CACHE_KEY + String(userId); }

/* ------------------------------
   Admin system (per-bot)
--------------------------------*/
function getOwner(){ return Bot.getProperty(OWNER_KEY); }
function getAdmins(){ return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list){ Bot.setProperty(ADMINS_KEY, list, "json"); }

function setupOwner(){
  if(getOwner()){
    send(user.telegramid, "ℹ️ <b>Owner already set:</b> <code>" + getOwner() + "</code>");
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  send(user.telegramid, "🎉 <b>Owner setup complete — you are Owner & first Admin.</b>");
  return true;
}

function onlyAdmin(){
  const owner = getOwner();
  if(!owner){
    send(user.telegramid, "⚠️ <b>Admin system not initialized. Run:</b>\n<code>Libs.UtilityLib.setupOwner()</code>");
    return false;
  }
  const admins = getAdmins();
  if(!admins.includes(user.telegramid)){
    send(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}
function addAdmin(id){
  if(!onlyAdmin()) return false;
  if(!isNumeric(id)){ send(user.telegramid, "⚠️ <b>ID must be numeric</b>"); return false; }
  id = Number(id);
  let list = getAdmins();
  if(list.includes(id)){ send(user.telegramid,"⚠️ <b>Already admin</b>"); return false; }
  list.push(id); setAdmins(list);
  send(user.telegramid, `✅ <b>Added admin:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You became an admin for this bot.</b>");
  return true;
}
function removeAdmin(id){
  if(!onlyAdmin()) return false;
  if(!isNumeric(id)){ send(user.telegramid, "⚠️ <b>ID must be numeric</b>"); return false; }
  id = Number(id);
  const owner = getOwner();
  if(id === owner){ send(user.telegramid, "❌ <b>Cannot remove Owner</b>"); return false; }
  let list = getAdmins();
  if(!list.includes(id)){ send(user.telegramid,"⚠️ <b>Not an admin</b>"); return false; }
  list = list.filter(x => x !== id); setAdmins(list);
  send(user.telegramid, `🗑 <b>Removed admin:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You were removed from admins of this bot.</b>");
  return true;
}
function showAdminList(){
  const owner = getOwner();
  if(!owner){ send(user.telegramid, "⚠️ Admin system not initialized. Run setupOwner()"); return; }
  const list = getAdmins();
  if(!list.length){ send(user.telegramid, "⚠️ No admins"); return; }
  let txt = "👮 <b>Admins</b>\n\n";
  list.forEach((id, i) => {
    const role = (id === owner ? " (Owner)" : "");
    txt += `${i+1}. <code>${id}</code>${role}\n`;
  });
  send(user.telegramid, txt);
}

/* ------------------------------
   Callbacks storage
--------------------------------*/
function setJoinCallbacks(obj){
  // expected keys: onJoined, onNotJoined, onError, onAllJoined, onSomeMissing
  Bot.setProperty(CB_KEY, obj, "json");
  return true;
}
function getJoinCallbacks(){
  return Bot.getProperty(CB_KEY) || {};
}

/* ------------------------------
   CHECK CACHE helpers
   store per-user per-channel result:
   User.setProp("UtilityLib_checkcache_<userId>", { channel1: { ok:true, ts:123 }, ... }, "json")
--------------------------------*/
function _readUserCache(u){
  return User.getProp(cacheKeyFor(u)) || {};
}
function _writeUserCache(u, obj){
  User.setProp(cacheKeyFor(u), obj, "json");
}
function _storeChannelResult(u, channel, ok){
  let cache = _readUserCache(u);
  cache[channel] = { ok: !!ok, ts: Date.now() };
  _writeUserCache(u, cache);
}
function _getCachedChannel(u, channel){
  let cache = _readUserCache(u);
  return cache[channel] || null;
}

/* ------------------------------
   Core: single channel check (async)
--------------------------------*/
function checkJoin(rawChannel){
  const channel = normalizeChannel(rawChannel);
  if(!channel){ send(user.telegramid, "⚠️ <b>Invalid channel</b>"); return false; }

  // Prepare on_result/on_error commands (encoded channel in params)
  const encoded = encodeURIComponent(channel);

  Api.getChatMember({
    chat_id: channel,
    user_id: user.telegramid,
    on_result: LIB + "onCheck " + encoded,
    on_error:  LIB + "onCheckError " + encoded,
    bb_options: { caller: "UtilityLib.checkJoin" }
  });

  // return true (request dispatched)
  return true;
}

/* on_result handler for single channel check */
function onCheckHandler(){
  // params contains encoded channel
  const channel = decodeURIComponent(params.split(" ")[0] || "");
  // options contains Telegram API response in options
  // options.result is Telegram's getChatMember result
  // determine membership
  try {
    const res = options.result; // structure from Api.getChatMember
    const status = res && res.status ? res.status : (res && res.result && res.result.status ? res.result.status : null);
    const joined = ["member","administrator","creator"].includes(status);
    _storeChannelResult(user.id, channel, joined);

    const cbs = getJoinCallbacks();
    if(joined && cbs.onJoined){
      // run developer's command with channel & result
      Bot.run({ command: cbs.onJoined, options: { channel: channel, joined: true, result: res } });
    } else if(!joined && cbs.onNotJoined){
      Bot.run({ command: cbs.onNotJoined, options: { channel: channel, joined: false, result: res } });
    }
  } catch(e){
    const cbs = getJoinCallbacks();
    if(cbs.onError){
      Bot.run({ command: cbs.onError, options: { channel: channel, error: String(e), raw: options } });
    }
  }
}
on(LIB + "onCheck", onCheckHandler);

/* on_error handler */
function onCheckErrorHandler(){
  const channel = decodeURIComponent(params.split(" ")[0] || "");
  _storeChannelResult(user.id, channel, false);
  const cbs = getJoinCallbacks();
  if(cbs.onError){
    Bot.run({ command: cbs.onError, options: { channel: channel, error: options, params: params } });
  }
}
on(LIB + "onCheckError", onCheckErrorHandler);

/* ------------------------------
   Multi-channel check (dispatch many) and collect results
--------------------------------*/
function checkJoinAll(channels){
  if(!Array.isArray(channels) || channels.length === 0){
    send(user.telegramid, "⚠️ <b>Provide channels array</b>");
    return false;
  }

  // Prepare aggregator id: unique key per run
  const runId = "run_" + Date.now() + "_" + Math.floor(Math.random()*9999);
  // store placeholder in User prop
  let runState = { total: channels.length, okCount: 0, results: {}, runId: runId, userId: user.id };
  // store on user prop under LIB+runId
  User.setProp(LIB + runId, runState, "json");

  channels.forEach(chRaw => {
    const ch = normalizeChannel(chRaw);
    const encoded = encodeURIComponent(ch);
    // call getChatMember with on_result referencing aggregator handler
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: LIB + "onCheckAllResult " + runId + " " + encoded,
      on_error:  LIB + "onCheckAllError " + runId + " " + encoded,
      bb_options: { caller: "UtilityLib.checkJoinAll" }
    });
  });

  return true;
}

/* aggregator result handler (success) */
function onCheckAllResult(){
  // params: "<runId> <encodedChannel>"
  const parts = params.split(" ");
  const runId = parts[0];
  const channel = decodeURIComponent(parts.slice(1).join(" "));
  try {
    const res = options.result;
    const status = res && res.status ? res.status : (res && res.result && res.result.status ? res.result.status : null);
    const joined = ["member","administrator","creator"].includes(status);
    // read runState
    let runState = User.getProp(LIB + runId) || null;
    if(!runState) runState = { total:0, okCount:0, results:{} };
    runState.results[channel] = { ok: !!joined, result: res };
    runState.okCount = Object.values(runState.results).filter(r=>r.ok).length;
    User.setProp(LIB + runId, runState, "json");

    // store per-channel cache
    _storeChannelResult(user.id, channel, joined);

    // if finished -> call callbacks
    if(Object.keys(runState.results).length >= runState.total){
      _finalizeRun(runId, runState);
    }
  } catch(e){
    // delegate to error handler
    _finalizeRun(runId, null, e);
  }
}
on(LIB + "onCheckAllResult", onCheckAllResult);

/* aggregator error handler */
function onCheckAllError(){
  const parts = params.split(" ");
  const runId = parts[0];
  const channel = decodeURIComponent(parts.slice(1).join(" "));
  // mark as not joined and store result
  let runState = User.getProp(LIB + runId) || { total:0, results:{} };
  runState.results[channel] = { ok: false, error: options || "error" };
  User.setProp(LIB + runId, runState, "json");
  // store cache
  _storeChannelResult(user.id, channel, false);

  if(Object.keys(runState.results).length >= runState.total){
    _finalizeRun(runId, runState);
  }
}
on(LIB + "onCheckAllError", onCheckAllError);

/* finalize aggregator run - call developer callbacks */
function _finalizeRun(runId, runState, err){
  const cbs = getJoinCallbacks();
  if(err){
    if(cbs.onError) Bot.run({ command: cbs.onError, options: { runId: runId, error: String(err) } });
    return;
  }
  const allOk = Object.values(runState.results).every(r => r.ok === true);
  if(allOk){
    if(cbs.onAllJoined) Bot.run({ command: cbs.onAllJoined, options: { runId: runId, results: runState.results } });
  } else {
    if(cbs.onSomeMissing) Bot.run({ command: cbs.onSomeMissing, options: { runId: runId, results: runState.results } });
  }
  // remove temporary prop
  User.setProp(LIB + runId, null);
}

/* ------------------------------
   requireJoin (cached-read)
   - returns boolean based on cached result
   - if no cached value -> triggers checkJoin() and returns false
--------------------------------*/
function requireJoin(rawChannel){
  const channel = normalizeChannel(rawChannel);
  if(!channel) return false;
  const cache = _getCachedChannel(user.id, channel);
  if(cache && typeof cache.ok !== "undefined"){
    return !!cache.ok;
  }
  // schedule async check and return false now
  checkJoin(channel);
  return false;
}

function requireJoinAll(channels){
  if(!Array.isArray(channels) || channels.length === 0) return false;
  let allOk = true, needCheck = [];
  channels.forEach(cRaw=>{
    const c = normalizeChannel(cRaw);
    const cache = _getCachedChannel(user.id, c);
    if(!(cache && typeof cache.ok !== "undefined")){
      needCheck.push(c);
      allOk = false;
    } else {
      if(!cache.ok) allOk = false;
    }
  });
  if(needCheck.length) checkJoinAll(needCheck);
  return allOk;
}

/* ------------------------------
   iteration() helper (existing)
--------------------------------*/
function iteration(){
  const d = iteration_quota;
  if(!d) { send(user.telegramid, "<b>❌ Can't load iteration quota</b>"); return null; }
  const BAR = 25, FULL="█", EMPTY="░";
  let used = d.progress||0, limit = d.limit||1;
  let pct = ((used/limit)*100).toFixed(2);
  let fill = Math.round((pct/100)*BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR-fill)} ]`;
  function fmt(t){ try { return new Date(t).toLocaleString() } catch(e){ return t } }
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
  send(user.telegramid, msg);
  // also return raw object for dev inspection
  return d;
}

/* ------------------------------
   ping() simple tool
--------------------------------*/
function ping(){
  if(options?.result){
    const latency = Date.now() - options.bb_options.start;
    Api.editMessageText({ chat_id: options.result.chat.id, message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`, parse_mode: "HTML" });
    return;
  }
  Api.sendMessage({ chat_id: user.telegramid, text: "<b>Ping…</b>", parse_mode:"HTML",
    bb_options: { start: Date.now() }, on_result: LIB + "onPing" });
}
on(LIB + "onPing", ping);

/* ------------------------------
   Export API
--------------------------------*/
publish({
  // admin
  setupOwner: setupOwner, onlyAdmin: onlyAdmin,
  addAdmin: addAdmin, removeAdmin: removeAdmin, showAdminList: showAdminList,

  // tools
  ping: ping, iteration: iteration,

  // callbacks - set/get
  setJoinCallbacks: setJoinCallbacks, getJoinCallbacks: getJoinCallbacks,

  // membership
  checkJoin: checkJoin,
  checkJoinAll: checkJoinAll,
  requireJoin: requireJoin,
  requireJoinAll: requireJoinAll
});
