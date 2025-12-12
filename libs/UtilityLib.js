// libs/myMCL.js
// MyMCL - Simple & Powerful Membership Checker (Version B)
// Complete library with publish and handlers
const PREFIX = "MyMCL_";

// -------------------------
// ADMIN PANEL (optional)
// -------------------------
function setup(){
  AdminPanel.setPanel({
    panel_name: "MyMCL",
    data: {
      title: "My Membership Checker",
      description: "Simple & powerful membership checker",
      icon: "person-add",
      fields: [
        {
          name: "chats",
          title: "Chats for checking",
          description: "Separate with commas, e.g. @channel1,@channel2",
          type: "string",
          placeholder: "@channel1,@channel2"
        },
        {
          name: "onSuccess",
          title: "Success command",
          description: "When user is member of ALL channels",
          type: "string",
          placeholder: "/joined"
        },
        {
          name: "onFail",
          title: "Fail command",
          description: "When user is missing ANY channels",
          type: "string",
          placeholder: "/notJoined"
        },
        {
          name: "debug",
          title: "Debug mode",
          type: "checkbox",
          value: false
        }
      ]
    }
  });

  Bot.sendMessage("MyMCL: Admin Panel installed successfully.");
}

// -------------------------
// HELPERS
// -------------------------
function getPanelOpts(){
  return AdminPanel.getPanelValues("MyMCL");
}

function debug(msg){
  try {
    let opts = getPanelOpts();
    if(!opts || !opts.debug){ return; }
    // Using Bot.sendMessage instead of Api to keep simple
    Bot.sendMessage("🔧 MyMCL Debug:\n" + msg);
  } catch(e) {
    // ignore debug errors
  }
}

function parseChats(str){
  if(!str){ return []; }
  if(Array.isArray(str)){ return str.map(s => String(s)); }
  str = String(str).split(" ").join(""); // remove spaces
  if(!str) return [];
  return str.split(",").filter(c => c !== "");
}

// store last known membership per user+chat
function _storeMember(userId, chat, value){
  if(!userId){ return; }
  // store as boolean
  User.setProperty(PREFIX + "member_" + String(userId) + "_" + chat, value, "boolean");
}

function _getStoredMember(userId, chat){
  if(!userId){ return false; }
  return User.getProperty(PREFIX + "member_" + String(userId) + "_" + chat) || false;
}

// Public helper: returns missing chats according to last stored check (uses user props)
function getMissingStored(chatsList, userId){
  if(!userId){ userId = user ? user.telegramid : undefined; }
  if(!userId){ throw new Error("MyMCL: userId is required for getMissingStored"); }
  let missing = [];
  for(let i=0;i<chatsList.length;i++){
    let c = chatsList[i];
    if(!_getStoredMember(userId, c)){
      missing.push(c);
    }
  }
  return missing;
}

// -------------------------
// PUBLIC API
// -------------------------
/*
 options:
  - chats: "@ch1,@ch2"  OR array ["@ch1","@ch2"] (optional if admin panel used)
  - user_id: telegram id (optional) - defaults to current user
  - success: command to run when ALL joined (optional, falls back to admin panel)
  - fail: command to run when ANY missing (optional)
*/
function check(options){
  options = options || {};
  let admin = getPanelOpts();

  // prepare chats array (priority: options.chats -> admin.chats)
  let chats = [];
  if(options.chats){
    if(Array.isArray(options.chats)){ chats = options.chats; }
    else { chats = parseChats(options.chats); }
  } else if(admin && admin.chats){
    chats = parseChats(admin.chats);
  }

  if(!Array.isArray(chats) || chats.length === 0){
    throw new Error("MyMCL: No channels to check. Provide them in options.chats or AdminPanel.");
  }

  // ensure array of strings
  chats = chats.map(c => String(c));

  // run background chain
  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: chats,
      index: 0,
      missing: [],
      user_id: options.user_id || (user ? user.telegramid : undefined),
      success: options.success || (admin ? admin.onSuccess : undefined),
      fail: options.fail || (admin ? admin.onFail : undefined)
    },
    run_after: 1
  });
}

// Returns true if stored state says user is member of ALL chats (based on last check)
function isMember(chats, userId){
  let admin = getPanelOpts();
  if(!chats){
    if(admin && admin.chats){
      chats = parseChats(admin.chats);
    } else {
      throw new Error("MyMCL: Provide chats to isMember() or set AdminPanel.chats");
    }
  } else {
    if(!Array.isArray(chats)){ chats = parseChats(chats); }
  }
  if(!userId){ userId = user ? user.telegramid : undefined; }
  if(!userId){ throw new Error("MyMCL: userId is required for isMember"); }

  return getMissingStored(chats, userId).length === 0;
}

// expose helpers
publish({
  setup: setup,
  check: check,
  isMember: isMember,
  getMissingStored: getMissingStored
});

// -------------------------
// INTERNAL CALLBACK CHAIN
// -------------------------
function checkAll(){
  // options is provided by Bot.run
  let chats = options.chats || [];
  let i = parseInt(options.index || 0);
  let missing = options.missing || [];
  let user_id = options.user_id;

  if(!user_id){
    debug("checkAll: no user_id provided");
    // finish as fail
    Bot.run({
      command: PREFIX + "finish",
      options: options
    });
    return;
  }

  if(i >= chats.length){
    // finished
    Bot.run({
      command: PREFIX + "finish",
      options: options
    });
    return;
  }

  let chat_id = chats[i];
  debug("MyMCL: checking " + chat_id + " for user " + user_id);

  Api.getChatMember({
    chat_id: chat_id,
    user_id: user_id,
    on_result: PREFIX + "onChatResult " + chat_id,
    on_error: PREFIX + "onChatError " + chat_id,
    bb_options: options
  });
}

// Called when Api.getChatMember returns success
function onChatResult(){
  // params contains the chat_id appended in checkAll call
  let chat_id = params.split(" ")[0];
  // Telegram response will be in options.result
  let res = options.result;
  let status = null;

  // Support different shapes
  if(res && res.result && res.result.status){
    status = res.result.status;
  } else if(res && res.status){
    status = res.status;
  }

  let joined = ["creator", "administrator", "member"].includes(status);

  // store user-chat membership flag
  let uid = options.bb_options ? options.bb_options.user_id : options.user_id;
  if(!uid && user){ uid = user.telegramid; }

  _storeMember(uid, chat_id, joined);

  // push missing if not joined
  if(!joined){
    options.bb_options.missing.push(chat_id);
  }

  // prepare next index and continue chain
  let nextIndex = (options.bb_options && typeof options.bb_options.index !== "undefined") ? options.bb_options.index + 1 : 1;

  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: options.bb_options.chats,
      index: nextIndex,
      missing: options.bb_options.missing,
      user_id: options.bb_options.user_id,
      success: options.bb_options.success,
      fail: options.bb_options.fail
    },
    run_after: 1
  });
}

// Called when Api.getChatMember errors (treat as missing and continue)
function onChatError(){
  let chat_id = params.split(" ")[0];
  debug("MyMCL: error while checking " + chat_id);

  // treat as missing
  options.bb_options.missing.push(chat_id);

  let nextIndex = (options.bb_options && typeof options.bb_options.index !== "undefined") ? options.bb_options.index + 1 : 1;
  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: options.bb_options.chats,
      index: nextIndex,
      missing: options.bb_options.missing,
      user_id: options.bb_options.user_id,
      success: options.bb_options.success,
      fail: options.bb_options.fail
    },
    run_after: 1
  });
}

// Final aggregator, runs success/fail commands
function finish(){
  let missing = options.missing || [];
  let success = options.success;
  let fail = options.fail;
  let uid = options.user_id || (user ? user.telegramid : undefined);

  debug("MyMCL: finish for user " + uid + ", missing: " + JSON.stringify(missing));

  if(missing.length === 0){
    if(success){
      Bot.run({
        command: success,
        options: { joined: true, missing: [], user_id: uid }
      });
    }
  } else {
    if(fail){
      Bot.run({
        command: fail,
        options: { joined: false, missing: missing, user_id: uid }
      });
    }
  }
}

// register internal handlers
on(PREFIX + "checkAll", checkAll);
on(PREFIX + "onChatResult", onChatResult);
on(PREFIX + "onChatError", onChatError);
on(PREFIX + "finish", finish);
