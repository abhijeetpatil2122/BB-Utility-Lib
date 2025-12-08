/*
 * UtilityLib — v8 FAST Membership Checker
 * ---------------------------------------
 * Admin Panel:
 *   - channels: comma-separated (@ch, -100id)
 *   - batchDelay: seconds (used only if channels > 3)
 *
 * Public API:
 *   mcSetup()                     → installs admin panel
 *   mcCheck(onSuccess, onFail)   → checks all channels, then runs 1 callback
 *   mcIsMember()                 → returns true/false (last stored result)
 *   mcRequire(onFail)            → protect any command
 *   mcGetMissing()               → get list of missing channels
 *   mcGetChats()                 → return channels as array
 *
 * Internal:
 *   - supports up to 10 channels
 *   - batches of 3 using Bot.run()
 *   - passes "missing" + "joined" lists to callback commands
 */

const MC_PREFIX = "UtlMC_";
const MC_PANEL  = "MembershipCheckerV8";
const MC_USER_KEY = MC_PREFIX + "UserData";
const MC_BATCH_SIZE = 3;
const MC_MAX_CHATS = 10;

/* ------------------------------
   Admin Panel Setup
-------------------------------- */
function mcSetup() {
  const panel = {
    title: "Membership Checker (Simple + Fast)",
    description: "Add channels and batch delay. Max 10 channels.",
    icon: "person-add",
    fields: [
      {
        name: "channels",
        title: "Channels to check",
        description: "Comma separated. Example: @c1, -10012345",
        type: "string",
        placeholder: "@channel1, -1001234567890",
        icon: "chatbubbles"
      },
      {
        name: "batchDelay",
        title: "Batch delay (seconds)",
        description: "Used only when channels > 3. Recommended: 1",
        type: "integer",
        placeholder: "1",
        value: 1,
        icon: "timer"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: MC_PANEL,
    data: panel
  });

  Bot.sendMessage("Membership Checker v8 Panel Installed!");
}

/* ------------------------------
   Helpers
-------------------------------- */
function _mcOpts() {
  return AdminPanel.getPanelValues(MC_PANEL) || {};
}

function mcGetChats() {
  const opts = _mcOpts();
  if(!opts.channels) return [];
  return opts.channels.split(",").map(c => c.trim()).filter(Boolean).slice(0, MC_MAX_CHATS);
}

function _mcGetUserData() {
  let d = User.getProperty(MC_USER_KEY);
  if(!d) d = { states: {} };
  if(!d.states) d.states = {};
  return d;
}

function _mcSaveUserData(d) {
  User.setProperty(MC_USER_KEY, d, "json");
}

/* ------------------------------
   Public API: mcIsMember
-------------------------------- */
function mcIsMember() {
  const chats = mcGetChats();
  const data  = _mcGetUserData();
  return chats.every(ch => data.states[ch] === true);
}

/* ------------------------------
   Public API: mcGetMissing
-------------------------------- */
function mcGetMissing() {
  const chats = mcGetChats();
  const data  = _mcGetUserData();
  return chats.filter(ch => data.states[ch] !== true);
}

/* ------------------------------
   Public API: mcRequire
-------------------------------- */
function mcRequire(onFailCommand) {
  if(mcIsMember()) return true;

  // Not joined → send developer's fail command
  if(onFailCommand){
    Bot.run({ command: onFailCommand, options: { missing: mcGetMissing() } });
  }
  return false;
}

/* ------------------------------
   MAIN CHECK FUNCTION
   mcCheck(successCmd, failCmd)
-------------------------------- */
function mcCheck(onSuccessCmd, onFailCmd) {
  const chats = mcGetChats();
  if(chats.length === 0){
    Bot.sendMessage("❌ No channels configured in Membership Checker panel.");
    return;
  }

  // create NEW check session token
  const token = MC_PREFIX + "tk_" + Date.now() + "_" + Math.floor(Math.random()*9999);

  let userData = _mcGetUserData();
  userData.session = {
    token: token,
    pending: chats.length,
    states: {},
    success: onSuccessCmd,
    fail: onFailCmd
  };
  _mcSaveUserData(userData);

  // SMALL lists → check immediately
  if(chats.length <= 3){
    _mcRunBatch(chats, token, 0);
    return;
  }

  // LARGE lists → batching
  const opts = _mcOpts();
  const delay = parseFloat(opts.batchDelay || 1);

  // create 3-item batches
  let batches = [];
  for(let i = 0; i < chats.length; i+= MC_BATCH_SIZE){
    batches.push(chats.slice(i, i+MC_BATCH_SIZE));
  }

  // schedule batches
  for(let i = 0; i < batches.length; i++){
    let runAfter = i === 0 ? 0.01 : delay * i;
    Bot.run({
      command: MC_PREFIX + "runBatch " + i,
      options: { channels: batches[i], token: token },
      run_after: runAfter
    });
  }
}

/* ------------------------------
   INTERNAL: run batch
-------------------------------- */
function runBatch() {
  const channels = options.channels || [];
  const token    = options.token;

  _mcRunBatch(channels, token);
}

function _mcRunBatch(channels, token){
  channels.forEach(ch => {

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: MC_PREFIX + "onCheckOne " + encodeURIComponent(ch),
      on_error : MC_PREFIX + "onCheckErr " + encodeURIComponent(ch),
      bb_options: { token: token }
    });

  });
}

/* ------------------------------
   INTERNAL: per-channel result
-------------------------------- */
function onCheckOne(){
  let ch = decodeURIComponent(params);
  let respToken = options.bb_options.token;

  let data = _mcGetUserData();
  if(!data.session || data.session.token !== respToken) return;

  let status = options.result?.status;
  let joined = ["member","administrator","creator"].includes(status);

  data.session.states[ch] = joined;
  data.session.pending--;

  _mcSaveUserData(data);

  if(data.session.pending <= 0){
    _mcFinishSession();
  }
}

function onCheckErr(){
  let ch = decodeURIComponent(params);
  let respToken = options.bb_options.token;

  let data = _mcGetUserData();
  if(!data.session || data.session.token !== respToken) return;

  data.session.states[ch] = false;  
  data.session.pending--;

  _mcSaveUserData(data);

  if(data.session.pending <= 0){
    _mcFinishSession();
  }
}

/* ------------------------------
   INTERNAL: finalize check
-------------------------------- */
function _mcFinishSession(){
  let data = _mcGetUserData();
  let sess = data.session;
  if(!sess) return;

  const chats = mcGetChats();
  let missing = chats.filter(ch => !sess.states[ch]);
  let joined  = chats.filter(ch => sess.states[ch]);

  // update permanent state
  data.states = sess.states;
  data.session = null;
  _mcSaveUserData(data);

  if(missing.length === 0){
    if(sess.success){
      Bot.run({
        command: sess.success,
        options: { joined: joined, missing: [] }
      });
    }
  } else {
    if(sess.fail){
      Bot.run({
        command: sess.fail,
        options: { joined: joined, missing: missing }
      });
    }
  }
}

/* ------------------------------
   EXPORT
-------------------------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  mcIsMember: mcIsMember,
  mcRequire: mcRequire,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

on(MC_PREFIX + "runBatch", runBatch);
on(MC_PREFIX + "onCheckOne", onCheckOne);
on(MC_PREFIX + "onCheckErr", onCheckErr);
