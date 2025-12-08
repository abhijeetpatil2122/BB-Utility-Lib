/*
 * Utility Library — v5 (Stable Production)
 * Features:
 *   ping()
 *   iteration(mode)   // formatted, inspect, pick-mode
 *   setupOwner()
 *   onlyAdmin()
 *   addAdmin()
 *   removeAdmin()
 *   showAdminList()
 *   setupMembership()
 *   checkMembership()
 *   showMembershipStatus()
 *   protectCommand()
 *   handleMembership()
 */

let LIB = "UtilityLib_";

const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEMBERSHIP_KEY = LIB + "membership";

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

/* ------------------------------
   OWNER SETUP (run once)
-------------------------------- */
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

/* ------------------------------
   ADMIN CHECK
-------------------------------- */
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

/* ------------------------------
   ADD ADMIN
-------------------------------- */
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

  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You are now an Admin!</b>");

  return true;
}

/* ------------------------------
   REMOVE ADMIN
-------------------------------- */
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

  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You are no longer an Admin.</b>");

  return true;
}

/* ------------------------------
   SHOW ADMIN LIST
-------------------------------- */
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
    msg += `${index}. <code>${id}</code>${role}\n`;
    index++;
  });

  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;

  send(user.telegramid, msg);
}

/* ------------------------------
   PING
-------------------------------- */
function ping() {
  if (options && options.result) {
    let latency = Date.now() - options.bb_options.start;

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`,
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

/* ------------------------------
   ITERATION (3 modes)
-------------------------------- */
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

  /* PICK MODE (multiple comma-separated keys) */
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

  /* SINGLE VALUE MODE */
  if (mode && mode !== "inspect") {
    return enriched[mode];
  }

  /* RAW INSPECT MODE */
  if (mode === "inspect") {
    send(
      user.telegramid,
      "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>"
    );
    return d;
  }

  /* FORMATTED MESSAGE */
  const BAR = 25;
  const FULL = "█";
  const EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;

  function fmt(t) {
    try { 
      return new Date(t).toLocaleString(); 
    } catch (e) { 
      return t; 
    }
  }

  let msg =
    `⚙️ <b>BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${enriched.id}</code>\n` +
    `<b>Type:</b> <code>${enriched.type}</code>\n` +
    `<b>Base Limit:</b> <code>${enriched.base_limit}</code>\n` +
    `<b>Ads Enabled:</b> <code>${enriched.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${enriched.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${enriched.limit}</code>\n` +
    `<b>Used:</b> <code>${enriched.progress}</code>\n` +
    `<b>Usage:</b> <code>${enriched.pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> ${fmt(enriched.started_at)}\n` +
    `<b>Ends:</b> ${fmt(enriched.ended_at)}`;

  send(user.telegramid, msg);
  return enriched;
}

/* ===============================
   MEMBERSHIP CHECKING SYSTEM
   =============================== */

/* Setup membership panel */
function setupMembership() {
  if (!onlyAdmin()) return false;
  
  AdminPanel.setPanel({
    panel_name: "MembershipSettings",
    data: {
      title: "📋 Membership Requirements",
      description: "Configure channels/groups users must join",
      icon: "people",
      
      fields: [
        {
          name: "requiredChats",
          title: "Required Channels/Groups",
          description: "Chat usernames or IDs (comma separated)\nExample: @channel1, @group2, -1001234567890",
          type: "string",
          placeholder: "@paradoxMovies, @paradoxSupport",
          icon: "chatbubbles"
        },
        {
          name: "checkMode",
          title: "Membership Mode",
          description: "How to check user membership",
          type: "select",
          options: [
            { value: "any", label: "Join ANY one" },
            { value: "all", label: "Join ALL" }
          ],
          value: "all",
          icon: "settings"
        },
        {
          name: "successMessage",
          title: "Success Message",
          description: "Message when user has required membership",
          type: "text",
          placeholder: "✅ You have access to all required channels!",
          value: "✅ You have access to all required channels!",
          icon: "checkmark-circle"
        },
        {
          name: "requiredMessage",
          title: "Required Message",
          description: "Message when user needs to join",
          type: "text",
          placeholder: "❌ Please join required channels to continue",
          value: "❌ Please join required channels to continue",
          icon: "warning"
        },
        {
          name: "showJoinButtons",
          title: "Show Join Buttons",
          description: "Show inline buttons to join missing channels",
          type: "checkbox",
          value: true,
          icon: "link"
        },
        {
          name: "autoCheck",
          title: "Auto Check",
          description: "Automatically check on user messages",
          type: "checkbox",
          value: true,
          icon: "refresh"
        }
      ]
    }
  });
  
  send(user.telegramid, "✅ <b>Membership panel setup complete!</b>\nConfigure settings in Admin Panel.");
  return true;
}

/* Get membership options */
function getMembershipOptions() {
  return AdminPanel.getPanelValues("MembershipSettings") || {};
}

/* Get required chats as array */
function getRequiredChats() {
  const options = getMembershipOptions();
  if (!options.requiredChats || options.requiredChats.trim() === "") {
    return [];
  }
  
  let chats = options.requiredChats.split(",");
  let result = [];
  
  for (let i = 0; i < chats.length; i++) {
    let chat = chats[i].trim();
    if (chat.length > 0) {
      result.push(chat);
    }
  }
  
  return result;
}

/* Check if user is member of specific chat */
function isMemberOfChat(chatId) {
  if (!chatId || !user) return false;
  
  try {
    const result = Api.getChatMemberSync({
      chat_id: chatId,
      user_id: user.telegramid
    });
    
    if (result && result.status) {
      const validStatuses = ["member", "administrator", "creator", "restricted"];
      return validStatuses.includes(result.status);
    }
    
    return false;
  } catch (error) {
    console.log("Error checking membership for " + chatId + ": " + error);
    return false;
  }
}

/* Main membership check */
function checkMembership() {
  const options = getMembershipOptions();
  const chats = getRequiredChats();
  
  if (chats.length === 0) {
    return { 
      isMember: true, 
      missingChats: [], 
      joinedChats: [], 
      total: 0,
      joinedCount: 0,
      missingCount: 0
    };
  }
  
  const checkMode = options.checkMode || "all";
  const missingChats = [];
  const joinedChats = [];
  
  for (let i = 0; i < chats.length; i++) {
    let chat = chats[i];
    if (isMemberOfChat(chat)) {
      joinedChats.push(chat);
    } else {
      missingChats.push(chat);
    }
  }
  
  let isMember = false;
  
  if (checkMode === "any") {
    isMember = joinedChats.length > 0;
  } else {
    isMember = missingChats.length === 0;
  }
  
  return {
    isMember: isMember,
    missingChats: missingChats,
    joinedChats: joinedChats,
    total: chats.length,
    joinedCount: joinedChats.length,
    missingCount: missingChats.length
  };
}

/* Show membership status */
function showMembershipStatus() {
  const options = getMembershipOptions();
  const result = checkMembership();
  
  if (result.isMember) {
    const message = options.successMessage || "✅ You have access to all required channels!";
    send(user.telegramid, message);
    return true;
  }
  
  // User needs to join
  let message = options.requiredMessage || "❌ Please join required channels to continue";
  
  if (result.missingChats.length > 0) {
    const mode = options.checkMode === "any" ? "any of these" : "all of these";
    message += "\n\n📋 Required channels (join " + mode + "):";
    
    for (let i = 0; i < result.missingChats.length; i++) {
      message += "\n" + (i + 1) + ". " + result.missingChats[i];
    }
  }
  
  // Create inline keyboard with join buttons
  let keyboard = [];
  if (options.showJoinButtons && result.missingChats.length > 0) {
    for (let i = 0; i < result.missingChats.length; i++) {
      let chat = result.missingChats[i];
      
      // Extract username from chat format
      let username = chat;
      if (chat.startsWith('@')) {
        username = chat.substring(1);
        keyboard.push([
          { 
            text: "Join " + chat, 
            url: "https://t.me/" + username 
          }
        ]);
      } else if (chat.startsWith('-100')) {
        // For group IDs, can't create direct link
        continue;
      }
    }
    
    // Add check button
    if (keyboard.length > 0) {
      keyboard.push([
        { 
          text: "🔄 Check Again", 
          callback_data: "/checkMembership" 
        }
      ]);
    }
  }
  
  if (keyboard.length > 0) {
    send(user.telegramid, message, keyboard);
  } else {
    send(user.telegramid, message);
  }
  
  return false;
}

/* Protect command with membership check */
function protectCommand(commandCallback) {
  return function() {
    const result = checkMembership();
    
    if (!result.isMember) {
      showMembershipStatus();
      return;
    }
    
    // User is member, execute the command
    commandCallback();
  };
}

/* Auto-check handler for @ command */
function handleMembership() {
  const options = getMembershipOptions();
  
  if (!options.autoCheck) return;
  
  // Skip internal commands
  const skipCommands = ["/start", "/check", "/setup", "/ping", "/admin", "/membership"];
  
  let shouldSkip = false;
  for (let i = 0; i < skipCommands.length; i++) {
    if (message && message.startsWith(skipCommands[i])) {
      shouldSkip = true;
      break;
    }
  }
  
  if (shouldSkip) return;
  
  const result = checkMembership();
  
  if (!result.isMember) {
    // Cooldown to avoid spam
    const lastCheck = User.getProperty(LIB + "lastMembershipCheck");
    const now = Date.now();
    
    if (!lastCheck || (now - lastCheck) > 30000) { // 30 seconds cooldown
      User.setProperty(LIB + "lastMembershipCheck", now, "integer");
      showMembershipStatus();
    }
  }
}

/* Manual membership check command */
function checkMembershipCommand() {
  const result = checkMembership();
  
  if (result.isMember) {
    send(user.telegramid, "✅ <b>Membership Status:</b> You have access!");
  } else {
    showMembershipStatus();
  }
  
  return result;
}

/* Get membership info */
function getMembershipInfo() {
  return checkMembership();
}

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
  
  // Membership system
  setupMembership: setupMembership,
  checkMembership: checkMembershipCommand,
  showMembershipStatus: showMembershipStatus,
  protect: protectCommand,
  handleMembership: handleMembership,
  getMembershipInfo: getMembershipInfo,
  getRequiredChats: getRequiredChats
});

/* Event handlers */
on(LIB + "onPing", ping);
on("/checkMembership", checkMembershipCommand);
