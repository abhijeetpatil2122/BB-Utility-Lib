/*
 * Utility Library — v6 (Stable Production)
 * Features:
 *   ping()
 *   iteration(mode)   // formatted, inspect, pick-mode
 *   setupOwner()
 *   onlyAdmin()
 *   addAdmin()
 *   removeAdmin()
 *   showAdminList()
 *   setupMembership()
 *   check()
 *   handle()
 *   isMember()
 *   getChats()
 *   getNotJoinedChats()
 */

let LIB = "UtilityLib_";

const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEMBERSHIP_KEY = LIB + "membership_";

/* Basic sender */
function send(to, text, keyboard) {
  let msg = { chat_id: to, text: text, parse_mode: "HTML" };
  if (keyboard) {
    msg.reply_markup = { inline_keyboard: keyboard };
  }
  Api.sendMessage(msg);
}

/* Helpers */
function getOwner() { 
  return Bot.getProperty(OWNER_KEY); 
}

function getAdmins() { 
  return Bot.getProperty(ADMINS_KEY) || []; 
}

function setAdmins(list) { 
  Bot.setProperty(ADMINS_KEY, list, "json"); 
}

function isNumeric(v) { 
  return /^\d+$/.test(String(v)); 
}

/* ===============================
   ADMIN MANAGEMENT SYSTEM
   =============================== */

function setupOwner() {
  let owner = getOwner();

  if (owner) {
    send(user.telegramid, "ℹ️ <b>Owner already set:</b> <code>" + owner + "</code>");
    return true;
  }

  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");

  send(user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>."
  );

  return true;
}

function onlyAdmin() {
  let owner = getOwner();

  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
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

function addAdmin(id) {
  if (!onlyAdmin()) return false;

  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }

  id = Number(id);

  let admins = getAdmins();

  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is already admin.</b>");
    return false;
  }

  admins.push(id);
  setAdmins(admins);

  send(user.telegramid, "✅ <b>Admin Added:</b> <code>" + id + "</code>");
  send(id, "🎉 <b>You are now an Admin!</b>");

  return true;
}

function removeAdmin(id) {
  if (!onlyAdmin()) return false;

  if (!isNumeric(id)) {
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }

  id = Number(id);

  let owner = getOwner();
  if (id === owner) {
    send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>");
    return false;
  }

  let admins = getAdmins();

  if (!admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is not an admin.</b>");
    return false;
  }

  admins = admins.filter(function(a) {
    return a !== id;
  });
  
  setAdmins(admins);

  send(user.telegramid, "🗑 <b>Admin Removed:</b> <code>" + id + "</code>");
  send(id, "⚠️ <b>You are no longer an Admin.</b>");

  return true;
}

function showAdminList() {
  let owner = getOwner();

  if (!owner) {
    send(user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
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

  admins.forEach(function(id) {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += index + ". <code>" + id + "</code>" + role + "\n";
    index++;
  });

  msg += "\n<b>Total:</b> " + admins.length + " | <b>Owner:</b> 1 | <b>Admins:</b> " + (admins.length - 1);

  send(user.telegramid, msg);
}

/* ===============================
   UTILITY FUNCTIONS
   =============================== */

function ping() {
  if (options && options.result) {
    let latency = Date.now() - options.bb_options.start;

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: "🏓 <b>" + latency + " ms</b>",
      parse_mode: "HTML"
    });
    return;
  }

  Api.sendMessage({
    chat_id: user.telegramid,
    text: "<b>Ping…</b>",
    parse_mode: "HTML",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  });
}

function iteration(mode) {
  const d = iteration_quota;
  if (!d) return null;

  const enriched = {
    id: d.id,
    progress: d.progress,
    limit: d.limit,
    have_ads: d.have_ads,
    extra_points: d.extra_points,
    started_at: d.started_at,
    ended_at: d.ended_at,
    pct: ((d.progress / d.limit) * 100).toFixed(2),
    type: (d.quotum_type && d.quotum_type.name) || "Unknown",
    base_limit: (d.quotum_type && d.quotum_type.base_limit) || 0
  };

  if (mode && mode.includes(",")) {
    let keys = mode.split(",").map(function(k) {
      return k.trim();
    });
    
    let obj = {};
    keys.forEach(function(k) {
      obj[k] = enriched[k];
    });
    
    return obj;
  }

  if (mode && mode !== "inspect") {
    return enriched[mode];
  }

  if (mode === "inspect") {
    send(
      user.telegramid,
      "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>"
    );
    return d;
  }

  const BAR = 25;
  const FULL = "█";
  const EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = "[ " + FULL.repeat(fill) + EMPTY.repeat(BAR - fill) + " ]";

  function fmt(t) {
    try { 
      return new Date(t).toLocaleString(); 
    } catch (e) { 
      return t; 
    }
  }

  let msg =
    "⚙️ <b>BB Iteration Quota</b>\n\n" +
    "<b>ID:</b> <code>" + enriched.id + "</code>\n" +
    "<b>Type:</b> <code>" + enriched.type + "</code>\n" +
    "<b>Base Limit:</b> <code>" + enriched.base_limit + "</code>\n" +
    "<b>Ads Enabled:</b> <code>" + enriched.have_ads + "</code>\n" +
    "<b>Extra Points:</b> <code>" + enriched.extra_points + "</code>\n\n" +
    "<b>Limit:</b> <code>" + enriched.limit + "</code>\n" +
    "<b>Used:</b> <code>" + enriched.progress + "</code>\n" +
    "<b>Usage:</b> <code>" + enriched.pct + "%</code>\n\n" +
    bar + "\n\n" +
    "<b>Started:</b> " + fmt(enriched.started_at) + "\n" +
    "<b>Ends:</b> " + fmt(enriched.ended_at);

  send(user.telegramid, msg);
  return enriched;
}

/* ===============================
   MEMBERSHIP CHECKER (Simple MCL Style)
   =============================== */

function _setupMembershipPanel() {
  const panel = {
    title: "Membership Checker Settings",
    description: "Configure channels/groups that users must join",
    icon: "people",
    fields: [
      {
        name: "chats",
        title: "Required Channels/Groups",
        description: "Chat usernames or IDs (comma separated)",
        type: "string",
        placeholder: "@channel1, @group2, -1001234567890",
        icon: "chatbubbles"
      },
      {
        name: "checkTime",
        title: "Checking Delay (minutes)",
        description: "Auto-check will run only after this delay",
        type: "integer",
        placeholder: "10",
        value: 20,
        icon: "time"
      },
      {
        name: "onNeedJoining",
        title: "On Need Joining Command",
        description: "Called when user needs to join ANY channel",
        type: "string",
        placeholder: "/onNeedJoining",
        icon: "warning"
      },
      {
        name: "onJoining",
        title: "On Joined Command",
        description: "Called when user joins ANY channel",
        type: "string",
        placeholder: "/onJoined",
        icon: "checkmark"
      },
      {
        name: "debug",
        title: "Debug Mode",
        description: "Show debug information",
        type: "checkbox",
        value: false,
        icon: "bug"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: "MembershipChecker",
    data: panel
  });
}

function setupMembership() {
  if (!onlyAdmin()) return false;
  
  _setupMembershipPanel();
  Bot.sendMessage("✅ Membership Checker panel setup complete!");
  return true;
}

function _getMembershipOptions() {
  return AdminPanel.getPanelValues("MembershipChecker") || {};
}

function _debugInfo(info) {
  let opts = _getMembershipOptions();
  if (!opts.debug) return;
  
  Api.sendMessage({
    chat_id: user.telegramid,
    text: "<b>Membership Debug</b>\n" + info,
    parse_mode: "HTML"
  });
}

function _getChatsArr() {
  let opts = _getMembershipOptions();
  if (!opts.chats) return [];
  
  let chats = opts.chats.split(",");
  let result = [];
  
  for (let i = 0; i < chats.length; i++) {
    let chat = chats[i].trim();
    if (chat.length > 0) {
      result.push(chat);
    }
  }
  
  return result;
}

function _getUserData() {
  if (!user) return { chats: {} };
  
  let userData = User.getProperty(MEMBERSHIP_KEY + "data");
  if (!userData) userData = { chats: {} };
  if (!userData.chats) userData.chats = {};
  
  return userData;
}

function _saveUserData(userData) {
  User.setProperty(MEMBERSHIP_KEY + "data", userData, "json");
}

function _isJoined(response) {
  if (!response || !response.result) return false;
  let status = response.result.status;
  return ["member", "administrator", "creator", "restricted"].includes(status);
}

function _checkSingleChat(chatId, callback) {
  Api.getChatMember({
    chat_id: chatId,
    user_id: user.telegramid,
    on_result: MEMBERSHIP_KEY + "checkResult " + chatId + " " + callback,
    on_error: MEMBERSHIP_KEY + "checkError " + chatId
  });
}

function _runCallback(callbackName, chatId, result) {
  let opts = _getMembershipOptions();
  let command = opts[callbackName];
  
  if (!command) {
    _debugInfo("Callback not set: " + callbackName);
    return false;
  }
  
  Bot.run({
    command: command,
    options: {
      chat_id: chatId,
      result: result,
      is_member: _isJoined({result: result})
    }
  });
  
  return true;
}

function check(passedOptions) {
  let userData = _getUserData();
  let chats = _getChatsArr();
  
  if (chats.length === 0) {
    Bot.sendMessage("⚠️ No channels configured for membership check");
    return;
  }
  
  // Anti-spam: 2 seconds cooldown
  if (userData.lastCheck && (Date.now() - userData.lastCheck) < 2000) {
    return;
  }
  
  userData.lastCheck = Date.now();
  _saveUserData(userData);
  
  _debugInfo("Starting membership check for " + chats.length + " chats");
  
  // Check all chats
  for (let i = 0; i < chats.length; i++) {
    _checkSingleChat(chats[i], passedOptions || "check");
  }
}

function handle(passedOptions) {
  if (!user) return;
  
  let opts = _getMembershipOptions();
  if (!opts.chats) return;
  
  // Skip internal commands
  let skipCommands = ["/start", "/check", "/setup"];
  for (let i = 0; i < skipCommands.length; i++) {
    if (message && message.startsWith(skipCommands[i])) {
      return;
    }
  }
  
  let userData = _getUserData();
  let checkTime = opts.checkTime || 20;
  
  // Check if enough time has passed
  if (userData.lastHandleCheck) {
    let minutesPassed = (Date.now() - userData.lastHandleCheck) / 60000;
    if (minutesPassed < checkTime) {
      return;
    }
  }
  
  userData.lastHandleCheck = Date.now();
  _saveUserData(userData);
  
  check(passedOptions);
}

function isMember(chatId) {
  if (chatId) {
    // Check single chat
    try {
      let result = Api.getChatMemberSync({
        chat_id: chatId,
        user_id: user.telegramid
      });
      return _isJoined({result: result});
    } catch (e) {
      return false;
    }
  }
  
  // Check all chats
  let chats = _getChatsArr();
  let notJoined = [];
  
  for (let i = 0; i < chats.length; i++) {
    try {
      let result = Api.getChatMemberSync({
        chat_id: chats[i],
        user_id: user.telegramid
      });
      if (!_isJoined({result: result})) {
        notJoined.push(chats[i]);
      }
    } catch (e) {
      notJoined.push(chats[i]);
    }
  }
  
  return notJoined.length === 0;
}

function getChats() {
  return _getMembershipOptions().chats || "";
}

function getNotJoinedChats() {
  let chats = _getChatsArr();
  let notJoined = [];
  
  for (let i = 0; i < chats.length; i++) {
    if (!isMember(chats[i])) {
      notJoined.push(chats[i]);
    }
  }
  
  return notJoined.join(", ");
}

/* Event Handlers */
on(MEMBERSHIP_KEY + "checkResult", function() {
  let parts = params.split(" ");
  let chatId = parts[0];
  let callbackType = parts[1] || "check";
  
  let userData = _getUserData();
  let isMemberNow = _isJoined(options);
  
  // Store current status
  userData.chats[chatId] = {
    joined: isMemberNow,
    lastCheck: Date.now()
  };
  _saveUserData(userData);
  
  if (isMemberNow) {
    _runCallback("onJoining", chatId, options.result);
  } else {
    _runCallback("onNeedJoining", chatId, options.result);
  }
});

on(MEMBERSHIP_KEY + "checkError", function() {
  _debugInfo("Error checking chat: " + params + " - " + JSON.stringify(options));
});

/* ===============================
   EXPORT API
   =============================== */
publish({
  // Core utilities
  ping: ping,
  iteration: iteration,
  
  // Admin management
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  adminList: getAdmins,
  showAdminList: showAdminList,
  owner: getOwner,
  
  // Membership checker (MCL style)
  setupMembership: setupMembership,
  check: check,
  handle: handle,
  isMember: isMember,
  getChats: getChats,
  getNotJoinedChats: getNotJoinedChats
});

on(LIB + "onPing", ping);
