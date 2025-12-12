// MyMCL - Simple & Powerful Membership Checker
// Inspired by BB MCL but much simpler

const PREFIX = "MyMCL_";

// -------------------------
// ADMIN PANEL
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
          description: "Separate with commas",
          type: "string",
          placeholder: "@channel1, @channel2"
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
// INTERNAL HELPERS
// -------------------------
function getOpts(){
  return AdminPanel.getPanelValues("MyMCL");
}

function debug(msg){
  if(!getOpts().debug){ return }
  Bot.sendMessage("🔧 MyMCL Debug:\n" + msg);
}

function parseChats(str){
  if(!str){ return [] }
  str = str.split(" ").join("");
  return str.split(",").filter(c => c !== "");
}

// -------------------------
// PUBLIC API
// -------------------------
function check(options){
  let admin = getOpts();

  let chats = options.chats
      ? parseChats(options.chats)
      : parseChats(admin.chats);

  if(chats.length === 0){
    throw new Error("MyMCL: No channels to check. Set them in Admin Panel.");
  }

  debug("Starting check for: " + JSON.stringify(chats));

  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: chats,
      index: 0,
      missing: [],
      user_id: options.user_id || user.telegramid,
      success: options.success || admin.onSuccess,
      fail: options.fail || admin.onFail
    }
  });
}

function isMember(){
  let missing = getMissing();
  return missing.length === 0;
}

function getMissing(){
  let admin = getOpts();
  return parseChats(admin.chats).filter(chat => {
    let prop = User.getProperty(PREFIX + "member_" + chat);
    return !prop;
  });
}

// -------------------------
// INTERNAL COMMAND HANDLERS
// -------------------------

// Step through each chat
function checkAll(){
  let chats = options.chats;
  let i = options.index;
  let missing = options.missing;
  let user_id = options.user_id;

  // Finished?
  if(i >= chats.length){
    Bot.run({
      command: PREFIX + "finish",
      options: options
    });
    return;
  }

  let chat_id = chats[i];
  debug("Checking: " + chat_id);

  Api.getChatMember({
    chat_id: chat_id,
    user_id: user_id,
    on_result: PREFIX + "onChatResult " + chat_id,
    on_error: PREFIX + "onChatError " + chat_id,
    bb_options: options
  });
}

// Handle success response
function onChatResult(){
  let chat_id = params.split(" ")[0];
  let res = options.result;

  let status = res.status;
  let joined = ["creator","administrator","member"].includes(status);

  User.setProperty(PREFIX + "member_" + chat_id, joined, "boolean");

  if(!joined){
    options.bb_options.missing.push(chat_id);
  }

  // Continue next channel
  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: options.bb_options.chats,
      index: options.bb_options.index + 1,
      missing: options.bb_options.missing,
      user_id: options.bb_options.user_id,
      success: options.bb_options.success,
      fail: options.bb_options.fail
    }
  });
}

// Handle API error
function onChatError(){
  let chat_id = params.split(" ")[0];
  debug("Error checking " + chat_id);

  options.bb_options.missing.push(chat_id);

  // Continue like normal
  Bot.run({
    command: PREFIX + "checkAll",
    options: {
      chats: options.bb_options.chats,
      index: options.bb_options.index + 1,
      missing: options.bb_options.missing,
      user_id: options.bb_options.user_id,
      success: options.bb_options.success,
      fail: options.bb_options.fail
    }
  });
}

// Final result
function finish(){
  let missing = options.missing;
  let success = options.success;
  let fail = options.fail;

  debug("Finish. Missing: " + JSON.stringify(missing));

  if(missing.length === 0){
    Bot.run({ command: success, options: { joined: true, missing: [] } });
  } else {
    Bot.run({ command: fail, options: { joined: false, missing: missing } });
  }
}

// -------------------------
// EXPORT
// -------------------------
publish({
  setup: setup,
  check: check,
  isMember: isMember,
  getMissing: getMissing
});

on(PREFIX + "checkAll", checkAll);
on(PREFIX + "onChatResult", onChatResult);
on(PREFIX + "onChatError", onChatError);
on(PREFIX + "finish", finish);
