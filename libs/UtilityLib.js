/*
 * UtilityLib v18 — Stable + Hybrid + Error reporting
 *
 * - Sequential checking (MCL-style)
 * - Cache per-user joined boolean states for speed
 * - isMember hybrid fixed:
 *     * all true -> returns true
 *     * any false -> runs failCallback immediately and returns false
 *     * any unknown -> runs mcCheck({forced:true}) and returns false
 * - mcCheck(passedOptions) supports passed data and sets passed.multiple automatically
 * - Per-channel result objects capture TG status and api_error (if any)
 * - Payload contains: joined[], missing[], errors[], multiple, passed, forced, status
 * - Persistent states updated only when there's a definitive ok/false (no api_error)
 */

const PANEL = "SimpleMembershipPanel_v18";
const PREFIX = "UtilityMC_";
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds

/* ---------------- Admin Panel ---------------- */
function mcSetup() {
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Membership Checker v18",
      description: "Public + Private (id=link) channels, callbacks, hybrid isMember",
      icon: "person-add",
      fields: [
        { name: "publicChannels", title: "Public Channels", type: "string", placeholder: "@ParadoxBackup, @Other", icon: "globe" },
        { name: "privateChannels", title: "Private Channels (id=link)", type: "string", placeholder: "-100id=https://t.me/+Invite", icon: "lock-closed" },
        { name: "successCallback", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
        { name: "failCallback", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" }
      ]
    }
  });
  Bot.sendMessage("Membership Checker v18 admin panel created.");
}
function _panel(){ return AdminPanel.getPanelValues(PANEL) || {}; }

/* ---------------- Parsers ---------------- */
function _parsePublic(){
  const p = _panel();
  if(!p.publicChannels) return [];
  return p.publicChannels.split(",").map(s=>s.trim()).filter(Boolean).slice(0, MAX_CH);
}
function _parsePrivateMap(){
  const p = _panel();
  const out = {};
  if(!p.privateChannels) return out;
  p.privateChannels.split(",").map(s=>s.trim()).filter(Boolean).forEach(item=>{
    const eq = item.indexOf("=");
    if(eq === -1){ out[item.trim()] = null; return; }
    const id = item.slice(0, eq).trim(); const link = item.slice(eq+1).trim();
    out[id] = link || null;
  });
  return out;
}
function mcGetChats(){ return [].concat(_parsePublic(), Object.keys(_parsePrivateMap())).slice(0, MAX_CH); }

/* ---------------- State storage ---------------- */
function _getStates(){ return User.getProperty(STATES_KEY) || {}; }
function _saveStates(obj){ User.setProperty(STATES_KEY, obj, "json"); }

/* ---------------- Build enriched payload from results map ----------------
   resultsMap: { "<chat>": { ok:bool, tg_status: string|null, api_error: object|null } }
   Returns: { joined:[], missing:[], errors:[], multiple: bool }
--------------------------------------------------------------------------*/
function _buildPayloadFromResults(resultsMap){
  const pub = _parsePublic();
  const priv = _parsePrivateMap();
  const chats = mcGetChats();

  const joined = [], missing = [], errors = [];

  chats.forEach(ch=>{
    const r = resultsMap[ch];
    const tg_status = r?.tg_status || null;
    const api_error = r?.api_error || null;
    const ok = !!(r && r.ok === true);

    const link = pub.includes(ch) ? "https://t.me/" + ch.replace(/^@/,"") : (priv[ch] || null);
    const obj = { id: ch, join_link: link, tg_status: tg_status };

    if(api_error){
      errors.push({ id: ch, join_link: link, api_error: api_error });
    } else if(ok){
      joined.push(obj);
    } else {
      missing.push(obj);
    }
  });

  return { joined: joined, missing: missing, errors: errors, multiple: chats.length > 2 };
}

/* ---------------- Helper: enriched missing for quick access ---------------- */
function mcGetMissing(){ const states = _getStates(); return _buildPayloadFromResults(Object.keys(states).length? (function(){ const m = {}; Object.keys(states).forEach(k=>m[k] = { ok: !!states[k], tg_status: null, api_error: null }); return m; })() : {}).missing; }

/* ---------------- Safe fail wrapper (throws on critical failure so visible) ---------------- */
function _safeFail(payload){
  const pan = _panel();
  if(!pan.failCallback) return;
  try {
    Bot.run({ command: pan.failCallback, options: payload });
  } catch(e){
    // critical - show in error tab
    throw new Error("UtilityLib v18: failCallback Bot.run failed: " + (e && e.message));
  }
}

/* ---------------- isMember hybrid (fixed) ----------------
 - All true => true
 - Any false => immediately run fail callback with payload and return false
 - Any unknown => call mcCheck({ forced:true }) and return false
-------------------------------------------------------------------*/
function isMember(customFail){
  const chats = mcGetChats();
  const panel = _panel();
  const fail = customFail || panel.failCallback;

  if(chats.length === 0){
    Bot.sendMessage("❌ No channels configured.");
    return false;
  }

  const states = _getStates();

  // unknowns?
  const unknown = chats.filter(ch => (states[ch] === undefined));
  if(unknown.length > 0){
    // force a fresh check for unknown ones
    mcCheck({ forced: true });
    return false; // caller should return
  }

  // any cached false?
  const cachedMissing = chats.filter(ch => states[ch] !== true);
  if(cachedMissing.length > 0){
    if(fail){
      // build simple payload using cached states
      // construct resultsMap from states for _buildPayload...
      const resultsMap = {};
      chats.forEach(ch => { resultsMap[ch] = { ok: !!states[ch], tg_status: null, api_error: null }; });
      const payloadCore = _buildPayloadFromResults(resultsMap);
      payloadCore.passed = {};
      payloadCore.forced = false;
      try { Bot.run({ command: fail, options: payloadCore }); } catch(e){ throw new Error("UtilityLib v18: isMember fail Bot.run error: " + (e && e.message)); }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck(passedOptions) ----------------
 - Checks only unknown or false channels (speed)
 - session.chats contains the must-check list (subset of allChats)
 - resultsMap collects per-channel objects { ok, tg_status, api_error }
 ----------------------------------------------------------------*/
function mcCheck(passedOptions){
  const panel = _panel();
  const allChats = mcGetChats();
  if(allChats.length === 0){
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const persistent = _getStates();
  const mustCheck = allChats.filter(ch => persistent[ch] !== true);

  // immediate success if nothing to check
  if(mustCheck.length === 0){
    const resultsMap = {};
    // mark from persistent
    allChats.forEach(ch => { resultsMap[ch] = { ok: !!persistent[ch], tg_status: null, api_error: null }; });
    const payloadCore = _buildPayloadFromResults(resultsMap);
    payloadCore.passed = passedOptions || {};
    payloadCore.passed.multiple = allChats.length > 2;
    payloadCore.forced = !!(passedOptions && passedOptions.forced);
    // persist states already are fine
    if(panel.successCallback){
      try { Bot.run({ command: panel.successCallback, options: payloadCore }); } catch(e){ throw new Error("UtilityLib v18: mcCheck immediate success Bot.run failed: " + (e && e.message)); }
    }
    return;
  }

  // create session
  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random()*9999);
  const session = {
    token: token,
    allChats: allChats,
    chats: mustCheck,     // sequentially check these
    index: 0,
    results: {},          // will hold objects per channel (ok,tg_status,api_error)
    passed: passedOptions || {}
  };
  session.passed.multiple = allChats.length > 2;
  User.setProperty(SES_KEY, session, "json");

  // schedule first sequential check
  try {
    Bot.run({ command: "UtilityMC_checkNext", run_after: 0.01, options: { token: token } });
  } catch(e){
    throw new Error("UtilityLib v18: mcCheck schedule failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_checkNext ----------------
   Grab session, perform Api.getChatMember for session.chats[session.index]
   (sequential flow)
----------------------------------------------------------------*/
function UtilityMC_checkNext(){
  try {
    const opts = options || {};
    const token = opts.token;
    if(!token) return;
    const sess = User.getProperty(SES_KEY);
    if(!sess || sess.token !== token) return;

    const idx = sess.index || 0;
    const list = sess.chats || [];
    if(idx >= list.length){ _finish(); return; }

    const ch = list[idx];

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: "UtilityMC_onOne",
      on_error: "UtilityMC_onErr",
      bb_options: { token: token, channel: ch, index: idx }
    });
  } catch (e) {
    throw new Error("UtilityLib v18: UtilityMC_checkNext failed: " + (e && e.message));
  }
}

/* ---------------- UtilityMC_onOne / onErr ----------------
   onOne: options.result exists
   onErr: options.error or options.error_code may exist depending on BB
----------------------------------------------------------------*/
function UtilityMC_onOne(){
  try {
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const tg_status = options.result?.status || null;
    const ok = ["member","administrator","creator"].includes(tg_status);

    sess.results[ch] = { ok: !!ok, tg_status: tg_status, api_error: null };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if(sess.index < (sess.chats || []).length){
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }
  } catch (e) { throw new Error("UtilityLib v18: UtilityMC_onOne error: " + (e && e.message)); }
}

function UtilityMC_onErr(){
  try {
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    // options may contain error details depending on BB
    const api_error = options && (options.error || options.error_description || options.description || options) || { message: "Unknown error" };

    // store api_error for this channel
    sess.results[ch] = { ok: false, tg_status: null, api_error: api_error };

    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if(sess.index < (sess.chats || []).length){
      Bot.run({ command: "UtilityMC_checkNext", run_after: STAGGER, options: { token: sess.token } });
    } else {
      _finish();
    }
  } catch (e) { throw new Error("UtilityLib v18: UtilityMC_onErr error: " + (e && e.message)); }
}

/* ---------------- _finish: build payload, persist safe states, call callbacks ---------------- */
function _finish(){
  const sess = User.getProperty(SES_KEY);
  if(!sess) return;
  const panel = _panel();

  // Build merged results map covering all chats
  const merged = {};
  (sess.allChats || []).forEach(ch => {
    if(sess.results && sess.results[ch]) merged[ch] = sess.results[ch];
    else merged[ch] = { ok: false, tg_status: null, api_error: null };
  });

  const core = _buildPayloadFromResults(merged);
  core.passed = sess.passed || {};
  core.forced = !!(sess.passed && sess.passed.forced);

  // Determine overall status:
  // - "ok" if no missing and no errors
  // - "error" if any api_error present
  // - "missing" if missing exists but no api_error
  let status = "ok";
  if(core.errors && core.errors.length > 0) status = "error";
  else if(core.missing && core.missing.length > 0) status = "missing";
  core.status = status;

  // Persist safe states:
  // only update persistent states for channels that had definitive ok or definitive not-joined (and no api_error)
  const persistent = _getStates();
  Object.keys(merged).forEach(ch => {
    const r = merged[ch];
    if(r.api_error){
      // do not overwrite persistent state - leave old value if exists
      return;
    }
    // set true or false
    persistent[ch] = !!r.ok;
  });
  _saveStates(persistent);

  // clear session
  User.setProperty(SES_KEY, null);

  // Callbacks: send full payload to success or fail depending on missing/errors
  try {
    if(core.errors && core.errors.length > 0){
      // treat as error — call failCallback if exists (developer can inspect errors)
      if(panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    } else if(core.missing && core.missing.length > 0){
      if(panel.failCallback) Bot.run({ command: panel.failCallback, options: core });
    } else {
      if(panel.successCallback) Bot.run({ command: panel.successCallback, options: core });
    }
  } catch (e) {
    throw new Error("UtilityLib v18: _finish callback run failed: " + (e && e.message));
  }
}

/* ---------------- Export API ---------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

/* ---------------- Register handlers ---------------- */
on("UtilityMC_checkNext", UtilityMC_checkNext);
on("UtilityMC_onOne", UtilityMC_onOne);
on("UtilityMC_onErr", UtilityMC_onErr);
