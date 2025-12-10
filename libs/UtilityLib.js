/*
 * UtilityLib v11 — Simple + Fast Membership Checker (final)
 *
 * Admin Panel fields:
 *  - publicChannels   (comma separated usernames, e.g. @ParadoxBackup, @Other)
 *  - privateChannels  (comma separated id=link pairs, e.g. -1001954742543=https://t.me/+Invite)
 *  - successCallback  (command when user joined all)
 *  - failCallback     (command when user missing any)
 *  - batchDelay       (seconds, used when channels > 2)
 *
 * Public API:
 *  - mcSetup()
 *  - mcCheck(passed_options)
 *  - isMember(customFail)   // use like: if (!Libs.UtilityLib.isMember()) return;
 *  - mcGetChats()
 *  - mcGetMissing()         // uses stored states (fast)
 *
 * Notes:
 *  - Max channels = 10
 *  - Batch size = 2 (safe for BB)
 *  - Manual-only: developer triggers mcCheck(); lib performs checks and calls callbacks
 */

const MC_PANEL_NAME = "SimpleMembershipPanel_v11";
const MC_PREFIX = "SMC11_";
const STATE_PROP = MC_PREFIX + "states";
const SESSION_PROP = MC_PREFIX + "session";
const MAX_CH = 10;
const BATCH_SIZE = 2;

/* ---------------------------
   Admin panel setup
----------------------------*/
function mcSetup() {
  const panel = {
    title: "Membership Checker v11 (Simple)",
    description: "Public and Private channels mapping + callbacks",
    icon: "person-add",
    fields: [
      {
        name: "publicChannels",
        title: "Public Channels (usernames)",
        description: "Comma separated usernames (e.g. @ParadoxBackup, @AnotherChannel)",
        type: "string",
        placeholder: "@ParadoxBackup, @Another",
        icon: "globe"
      },
      {
        name: "privateChannels",
        title: "Private Channels (id=link)",
        description: "Comma separated id=invite pairs (e.g. -1001954742543=https://t.me/+Invite)",
        type: "string",
        placeholder: "-1001954742543=https://t.me/+Invite, -1002223334445=https://t.me/+Invite2",
        icon: "lock-closed"
      },
      {
        name: "successCallback",
        title: "Success Callback",
        description: "Command to run when user joined all channels",
        type: "string",
        placeholder: "/menu",
        icon: "checkmark-circle"
      },
      {
        name: "failCallback",
        title: "Fail Callback",
        description: "Command to run when user missing any channel",
        type: "string",
        placeholder: "/start",
        icon: "close-circle"
      },
      {
        name: "batchDelay",
        title: "Batch delay (seconds)",
        description: "Used only when channels > 2. Recommended 1 second",
        type: "integer",
        placeholder: "1",
        value: 1,
        icon: "timer"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: MC_PANEL_NAME,
    data: panel
  });

  Bot.sendMessage("Membership Checker v11 admin panel created.");
}

/* ---------------------------
   Admin options helpers
----------------------------*/
function _getPanel() {
  return AdminPanel.getPanelValues(MC_PANEL_NAME) || {};
}

/* parse public channels field -> array like ["@ParadoxBackup"] */
function _parsePublic() {
  const p = _getPanel();
  if(!p.publicChannels) return [];
  return p.publicChannels.split(",").map(s => s.trim()).filter(Boolean).slice(0, MAX_CH);
}

/* parse private channels field -> map id -> link (link may be empty) */
function _parsePrivateMap() {
  const p = _getPanel();
  const res = {};
  if(!p.privateChannels) return res;
  const parts = p.privateChannels.split(",").map(s => s.trim()).filter(Boolean);
  for(let i=0;i<parts.length;i++){
    const kv = parts[i].split("=");
    const id = kv[0] ? kv[0].trim() : "";
    const link = kv[1] ? kv.slice(1).join("=").trim() : "";
    if(id) res[id] = link || null;
  }
  return res;
}

/* get unified channels array (mix public and private ids) */
function mcGetChats() {
  const publicArr = _parsePublic();
  const privateMap = _parsePrivateMap();
  const privateIds = Object.keys(privateMap);
  // combine: prefer public usernames first then private ids
  const combined = publicArr.concat(privateIds).slice(0, MAX_CH);
  return combined;
}

/* ---------------------------
   Stored user states
----------------------------*/
function _getUserStates() {
  return User.getProperty(STATE_PROP) || {};
}
function _saveUserStates(obj) {
  User.setProperty(STATE_PROP, obj, "json");
}

/* ---------------------------
   mcGetMissing: uses stored states
----------------------------*/
function mcGetMissing() {
  const chats = mcGetChats();
  const st = _getUserStates();
  return chats.filter(ch => st[ch] !== true);
}

/* ---------------------------
   isMember(): hybrid behavior
   Use: if(!Libs.UtilityLib.isMember()) return;
----------------------------*/
function isMember(customFail) {
  const panel = _getPanel();
  const failCmd = customFail || panel.failCallback;
  const chats = mcGetChats();

  if(chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return false;
  }

  const st = _getUserStates();

  // If no stored states -> trigger manual check and return false (caller should stop)
  if(Object.keys(st).length === 0) {
    // force a fresh check; pass forced:true so callbacks know
    mcCheck({ forced: true });
    return false;
  }

  // If some missing according to stored states
  const missing = chats.filter(ch => st[ch] !== true);
  if(missing.length > 0) {
    if(failCmd) {
      // Build enriched missing objects (id + link)
      const payload = _buildResultPayloadFromStates(st);
      Bot.run({
        command: failCmd,
        options: { joined: payload.joined, missing: payload.missing, multiple: payload.multiple, forced: false }
      });
    }
    return false;
  }

  // all good
  return true;
}

/* ---------------------------
   mcCheck(passed_options)
   Manual check entrypoint
----------------------------*/
function mcCheck(passed_options) {
  const panel = _getPanel();
  const chats = mcGetChats();
  if(chats.length === 0) {
    Bot.sendMessage("❌ No channels configured in admin panel.");
    return;
  }

  // prepare private map for later
  const privateMap = _parsePrivateMap();
  const publicArr = _parsePublic();

  // prepare session
  const token = MC_PREFIX + Date.now() + "_" + Math.floor(Math.random()*9999);
  const sess = {
    token: token,
    total: chats.length,
    pending: chats.length,
    results: {},
    passed: passed_options || {},
    multiple: chats.length > 2
  };
  User.setProperty(SESSION_PROP, sess, "json");

  // If small list (<=2) => direct immediate calls
  if(chats.length <= 2) {
    for(let i=0;i<chats.length;i++){
      const ch = chats[i];
      Api.getChatMember({
        chat_id: ch,
        user_id: user.telegramid,
        on_result: MC_PREFIX + "onOne " + encodeURIComponent(ch),
        on_error: MC_PREFIX + "onErr " + encodeURIComponent(ch),
        bb_options: { token: token }
      });
    }
    return;
  }

  // For >2 channels -> batching with BATCH_SIZE
  const delay = parseFloat(panel.batchDelay || 1);
  const batches = [];
  for(let i=0;i<chats.length;i+=BATCH_SIZE) batches.push(chats.slice(i, i+BATCH_SIZE));

  // schedule batches via Bot.run
  for(let i=0;i<batches.length;i++){
    const runAfter = i === 0 ? 0.01 : delay * i;
    Bot.run({
      command: MC_PREFIX + "runBatch " + i,
      options: { token: token, channels: batches[i] },
      run_after: runAfter
    });
  }
}

/* ---------------------------
   runBatch handler
----------------------------*/
function runBatch() {
  const token = options.token;
  const channels = options.channels || [];
  for(let i=0;i<channels.length;i++){
    const ch = channels[i];
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: MC_PREFIX + "onOne " + encodeURIComponent(ch),
      on_error: MC_PREFIX + "onErr " + encodeURIComponent(ch),
      bb_options: { token: token }
    });
  }
}

/* ---------------------------
   onOne / onErr handlers
----------------------------*/
function onOne(){
  const ch = decodeURIComponent(params || "");
  const sess = User.getProperty(SESSION_PROP);
  if(!sess) return;

  // verify token
  if(!options.bb_options || options.bb_options.token !== sess.token) return;

  const status = options.result?.status;
  const joined = ["member","administrator","creator"].includes(status);

  sess.results[ch] = joined === true;
  sess.pending = (sess.pending || 1) - 1;
  User.setProperty(SESSION_PROP, sess, "json");

  if(sess.pending <= 0) _finishCheck();
}

function onErr(){
  const ch = decodeURIComponent(params || "");
  const sess = User.getProperty(SESSION_PROP);
  if(!sess) return;

  if(!options.bb_options || options.bb_options.token !== sess.token) return;

  sess.results[ch] = false;
  sess.pending = (sess.pending || 1) - 1;
  User.setProperty(SESSION_PROP, sess, "json");

  if(sess.pending <= 0) _finishCheck();
}

/* ---------------------------
   Build result payload (enriched with links)
   Used for callbacks and storage
----------------------------*/
function _buildResultPayload(resultsMap) {
  // resultsMap: { "@name": true/false, "-100id": true/false }
  const publicArr = _parsePublic();
  const privateMap = _parsePrivateMap();

  const chats = mcGetChats();
  const missing = [];
  const joined = [];

  chats.forEach(ch => {
    const ok = !!resultsMap[ch];
    const isPublic = publicArr.includes(ch);
    let link = null;
    if(isPublic) {
      const uname = ch.replace(/^@/,"");
      link = "https://t.me/" + uname;
    } else {
      // private id
      link = privateMap[ch] || null;
    }
    const obj = { id: ch, join_link: link };
    if(ok) joined.push(obj); else missing.push(obj);
  });

  return { missing: missing, joined: joined, multiple: chats.length > 2 };
}

/* wrapper convenience using stored states */
function _buildResultPayloadFromStates(states) {
  // states might be missing some keys; ensure to iterate mcGetChats
  const chats = mcGetChats();
  const missing = [];
  const joined = [];
  const publicArr = _parsePublic();
  const privateMap = _parsePrivateMap();

  chats.forEach(ch => {
    const ok = states[ch] === true;
    let link = null;
    if(publicArr.includes(ch)) link = "https://t.me/" + ch.replace(/^@/,"");
    else link = privateMap[ch] || null;

    const obj = { id: ch, join_link: link };
    if(ok) joined.push(obj); else missing.push(obj);
  });

  return { missing: missing, joined: joined, multiple: chats.length > 2 };
}

/* ---------------------------
   finalize session
----------------------------*/
function _finishCheck() {
  const panel = _getPanel();
  let sess = User.getProperty(SESSION_PROP);
  if(!sess) return;

  const resultsMap = sess.results || {};
  // Save states permanently
  _saveUserStates(resultsMap);

  // Build payload for callbacks
  const payload = _buildResultPayload(resultsMap);

  // Clear session
  User.setProperty(SESSION_PROP, null);

  // Provide passed options and forced flag
  const optionsForCb = {
    joined: payload.joined,
    missing: payload.missing,
    multiple: !!sess.multiple,
    passed: sess.passed || {},
    forced: !!sess.passed && !!sess.passed.forced
  };

  // Call correct callback once
  if(optionsForCb.missing.length === 0) {
    if(panel.successCallback) {
      Bot.run({ command: panel.successCallback, options: optionsForCb });
    }
  } else {
    if(panel.failCallback) {
      Bot.run({ command: panel.failCallback, options: optionsForCb });
    }
  }
}

/* ---------------------------
   Export API
----------------------------*/
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  isMember: isMember,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing
});

/* Register handlers */
on(MC_PREFIX + "runBatch", runBatch);
on(MC_PREFIX + "onOne", onOne);
on(MC_PREFIX + "onErr", onErr);
