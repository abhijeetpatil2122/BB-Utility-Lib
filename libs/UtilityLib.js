/*
 * UtilityLib v16 — Sequential Membership Checker (final)
 *
 * - Sequential engine (MCL-style): checks channels one-by-one
 * - Admin panel: publicChannels, privateChannels (id=link), successCallback, failCallback
 * - mcCheck(), isMember(), mcGetChats(), mcGetMissing()
 * - Safe for 1..10 channels (no "too many sub commands" errors)
 */

const PANEL = "SimpleMembershipPanel_v16";
const PREFIX = "UtilityMC_"; // used for keys
const SES_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";

const MAX_CH = 10;
const STAGGER = 0.1; // seconds between scheduled next checks

/* ---------------- Admin panel ---------------- */
function mcSetup(){
  AdminPanel.setPanel({
    panel_name: PANEL,
    data: {
      title: "Membership Checker v16",
      description: "Public + Private channels (id=link), callbacks",
      icon: "person-add",
      fields: [
        { name: "publicChannels", title: "Public Channels", type: "string", placeholder: "@ParadoxBackup, @Another", icon: "globe" },
        { name: "privateChannels", title: "Private Channels (id=link)", type: "string", placeholder: "-100id=https://t.me/+Invite", icon: "lock-closed" },
        { name: "successCallback", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
        { name: "failCallback", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" },
        { name: "batchDelay", title: "Batch delay (unused)", type: "integer", placeholder: "1", value: 1, icon: "time" }
      ]
    }
  });
  Bot.sendMessage("Membership Checker v16: Admin panel created.");
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
  const map = {};
  if(!p.privateChannels) return map;
  p.privateChannels.split(",").map(s=>s.trim()).filter(Boolean).forEach(pair=>{
    const idx = pair.indexOf("=");
    if(idx === -1){ map[pair.trim()] = null; return; }
    const id = pair.slice(0, idx).trim();
    const link = pair.slice(idx+1).trim();
    map[id] = link || null;
  });
  return map;
}

function mcGetChats(){
  const pub = _parsePublic();
  const priv = Object.keys(_parsePrivateMap());
  return pub.concat(priv).slice(0, MAX_CH);
}

/* ---------------- State storage ---------------- */
function _getStates(){ return User.getProperty(STATES_KEY) || {}; }
function _saveStates(o){ User.setProperty(STATES_KEY, o, "json"); }

/* ---------------- Payload builder ---------------- */
function _buildPayload(results){
  const pub = _parsePublic();
  const privMap = _parsePrivateMap();
  const chats = mcGetChats();
  const joined = [], missing = [];

  chats.forEach(ch=>{
    const ok = results[ch] === true;
    const link = pub.includes(ch) ? "https://t.me/" + ch.replace(/^@/,"") : (privMap[ch] || null);
    const obj = { id: ch, join_link: link };
    if(ok) joined.push(obj); else missing.push(obj);
  });

  return { joined: joined, missing: missing, multiple: chats.length > 2 };
}

function mcGetMissing(){
  const states = _getStates();
  const payload = _buildPayload(states);
  return payload.missing;
}

/* ---------------- Safe fail ---------------- */
function _safeFail(payload){
  const panel = _panel();
  if(!panel.failCallback) return;
  try{ Bot.run({ command: panel.failCallback, options: payload }); } catch(e){ try{ throw e; } catch(err){} }
}

/* ---------------- isMember (hybrid) ---------------- */
function isMember(customFail){
  const chats = mcGetChats();
  const panel = _panel();
  const fail = customFail || panel.failCallback;

  if(chats.length === 0){
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return false;
  }

  const states = _getStates();

  if(Object.keys(states).length === 0){
    // no cached data — force manual check
    mcCheck({ forced: true });
    return false;
  }

  const missing = chats.filter(ch => states[ch] !== true);
  if(missing.length > 0){
    if(fail){
      const payload = _buildPayload(states);
      payload.passed = {};
      payload.forced = false;
      try{ Bot.run({ command: fail, options: payload }); } catch(e){ try{ throw e; } catch(err){} }
    }
    return false;
  }

  return true;
}

/* ---------------- mcCheck (sequential) ---------------- */
function mcCheck(passed_options){
  const panel = _panel();
  const chats = mcGetChats();

  if(chats.length === 0){
    Bot.sendMessage("❌ No channels configured.");
    return;
  }

  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random()*9999);

  const session = {
    token: token,
    chats: chats,
    index: 0,
    results: {},
    passed: passed_options || {},
    multiple: chats.length > 2
  };

  User.setProperty(SES_KEY, session, "json");

  // schedule first check via Bot.run (background) to avoid nesting
  try{
    Bot.run({
      command: "UtilityMC_checkNext",
      run_after: 0.01,
      options: { token: token }
    });
  } catch(e){
    // fallback: call fail callback
    _safeFail({ joined: [], missing: _buildPayload({}).missing, multiple: session.multiple, passed: session.passed, forced: !!session.passed.forced });
  }
}

/* ---------------- UtilityMC_checkNext (runs one channel) ---------------- */
function UtilityMC_checkNext(){
  try{
    const opts = options || {};
    const token = opts.token;
    const session = User.getProperty(SES_KEY);
    if(!session || session.token !== token) return;

    const idx = session.index || 0;
    const chats = session.chats || [];
    if(idx >= chats.length){
      // nothing to do
      _finish();
      return;
    }

    const ch = chats[idx];

    // perform direct Api.getChatMember for this channel
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: "UtilityMC_onOne",
      on_error:  "UtilityMC_onErr",
      bb_options: { token: token, channel: ch, index: idx }
    });

  } catch(e){
    // on error, fail safe
    try{ throw e; } catch(err){}
    const sessionTmp = User.getProperty(SES_KEY) || {};
    _safeFail({ joined: [], missing: _buildPayload({}).missing, multiple: sessionTmp.multiple || false, passed: sessionTmp.passed || {}, forced: !!(sessionTmp.passed && sessionTmp.passed.forced) });
  }
}

/* ---------------- UtilityMC_onOne / _onErr ---------------- */
function UtilityMC_onOne(){
  try{
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    const ok = ["member","administrator","creator"].includes(options.result?.status);

    sess.results[ch] = ok;

    // move to next
    sess.index = (sess.index || 0) + 1;

    User.setProperty(SES_KEY, sess, "json");

    // schedule next check or finish
    if(sess.index < (sess.chats || []).length){
      Bot.run({
        command: "UtilityMC_checkNext",
        run_after: STAGGER * sess.index,
        options: { token: sess.token }
      });
    } else {
      _finish();
    }

  } catch(e){
    try{ throw e; } catch(err){}
  }
}

function UtilityMC_onErr(){
  try{
    const sess = User.getProperty(SES_KEY);
    if(!sess) return;

    const bb = options.bb_options;
    if(!bb || bb.token !== sess.token) return;

    const ch = bb.channel;
    sess.results[ch] = false;

    // move to next
    sess.index = (sess.index || 0) + 1;
    User.setProperty(SES_KEY, sess, "json");

    if(sess.index < (sess.chats || []).length){
      Bot.run({
        command: "UtilityMC_checkNext",
        run_after: STAGGER * sess.index,
        options: { token: sess.token }
      });
    } else {
      _finish();
    }

  } catch(e){ try{ throw e; } catch(err){} }
}

/* ---------------- Finish ---------------- */
function _finish(){
  const sess = User.getProperty(SES_KEY);
  if(!sess) return;

  const panel = _panel();

  const payloadCore = _buildPayload(sess.results || {});
  payloadCore.passed = sess.passed || {};
  payloadCore.forced = !!(sess.passed && sess.passed.forced);

  // save persistent states
  const st = {};
  (payloadCore.joined || []).forEach(j => st[j.id] = true);
  (payloadCore.missing || []).forEach(m => st[m.id] = false);
  _saveStates(st);

  // clear session
  User.setProperty(SES_KEY, null);

  // call correct callback
  try {
    if((payloadCore.missing || []).length === 0){
      if(panel.successCallback) Bot.run({ command: panel.successCallback, options: payloadCore });
    } else {
      if(panel.failCallback) Bot.run({ command: panel.failCallback, options: payloadCore });
    }
  } catch(e){ try{ throw e; } catch(err){} }
}

/* ---------------- Export ---------------- */
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
