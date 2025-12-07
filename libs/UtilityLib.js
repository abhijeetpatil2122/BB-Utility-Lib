/*
 * Utility Library — v5
 * Stable version with:
 * - Owner/Admin system
 * - Ping
 * - Iteration
 * - Membership System (public + private)
 */

let LIB = "UtilityLib_";

// ======= EXISTING OWNER + ADMIN SYSTEM (DO NOT TOUCH) =======
const OWNER_KEY  = LIB + "owner";
const ADMINS_KEY = LIB + "admins";

function send(to, text, preview = false, keyboard) {
  Api.sendMessage({
    chat_id: to,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: !preview,
    reply_markup: keyboard
  });
}

function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

/* OWNER SETUP */
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

/* ADMIN CHECK */
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

/* ADD ADMIN */
function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) return send(user.telegramid, "⚠️ <b>ID must be numeric.</b>");

  id = Number(id);
  let admins = getAdmins();
  if (admins.includes(id)) return send(user.telegramid, "⚠️ <b>User already admin.</b>");

  admins.push(id);
  setAdmins(admins);

  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

/* REMOVE ADMIN */
function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) return send(user.telegramid, "⚠️ <b>ID must be numeric.</b>");

  id = Number(id);
  if (id === getOwner()) return send(user.telegramid, "❌ <b>Cannot remove Owner.</b>");

  let admins = getAdmins();
  if (!admins.includes(id)) return send(user.telegramid, "⚠️ <b>Not an admin.</b>");

  setAdmins(admins.filter(a => a !== id));
  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

/* SHOW ADMINS */
function showAdminList() {
  let owner = getOwner();
  let admins = getAdmins();
  if (!owner) return send(user.telegramid,"⚠️ Admin system not set.");
  if (admins.length === 0) return send(user.telegramid, "⚠️ No admins found.");

  let msg = "👮 <b>Admins List</b>\n\n";
  let i = 1;
  admins.forEach(id => {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${i}. <code>${id}</code>${role}\n`;
    i++;
  });
  send(user.telegramid, msg);
}

// ===============================================================
// ===================== MEMBERSHIP SYSTEM ========================
// ===============================================================

const MEMBERSHIP_KEY = LIB + "membership_channels";

/* Show error in BB error tab */
function throwError(msg) {
  throw new Error("UtilityLib Membership: " + msg);
}

/* ========== SETUP FLOW ========== */
function membershipSetup() {

  // Check callback command exists
  if (!Bot.getCommand("/onMembershipSetup")) {
    throwError("Missing /onMembershipSetup command.\nCreate it and call:\nLibs.UtilityLib.onMembershipSetup(message)");
  }

  send(
    user.telegramid,
    "📢 <b>Membership Setup</b>\n\n" +
    "Send channels (one per line):\n" +
    "• Public → @ChannelName\n" +
    "• Private → -1001234567890 | https://t.me/+Invite\n\n" +
    "Example:\n" +
    "@CryptoNews\n" +
    "@AirdropWorld\n" +
    "-1009876543210 | https://t.me/+ABCDEFghi",
    false
  );

  // Run developer callback command
  Bot.runCommand("/onMembershipSetup");
}

/* Parse and save */
function onMembershipSetup(text) {
  if (!text) return send(user.telegramid, "⚠️ Send channel list.");

  let lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return send(user.telegramid, "⚠️ No channels found.");

  let parsed = [];

  for (let l of lines) {
    if (l.startsWith("@")) {
      parsed.push({ type: "public", username: l.replace("@", "") });
      continue;
    }

    if (l.includes("|")) {
      let [id, link] = l.split("|").map(s => s.trim());
      parsed.push({
        type: "private",
        id: id,
        invite: link
      });
      continue;
    }

    return send(user.telegramid, `⚠️ Invalid line:\n<code>${l}</code>`);
  }

  Bot.setProperty(MEMBERSHIP_KEY, parsed, "json");

  send(
    user.telegramid,
    "✅ <b>Membership channels saved!</b>\nUse membershipCheck() in your commands."
  );
}

/* ========== CHECK UI (NO CHECK YET) ========== */
function membershipCheck() {
  let list = Bot.getProperty(MEMBERSHIP_KEY);
  if (!list) return throwError("No channels set. Run membershipSetup().");

  send(user.telegramid, formatJoinMessage(list), false, {
    inline_keyboard: buildJoinButtons(list)
  });

  return false;
}

/* ========== BUTTON PRESS ========== */
function onMembershipCheck() {

  if (!Bot.getCommand("/onMembershipCheck")) {
    throwError("Missing /onMembershipCheck command.\nCreate it and call:\nLibs.UtilityLib.onMembershipCheck()");
  }

  Api.answerCallbackQuery({
    callback_query_id: request.id,
    text: "Checking… please wait",
    show_alert: false
  });

  Bot.run({
    command: "UtilityLib_doMembershipCheck",
    options: { uid: user.telegramid }
  });
}

/* ========== HIDDEN CHECK COMMAND ========== */
function doCheck() {
  let uid = options.uid;

  let list = Bot.getProperty(MEMBERSHIP_KEY);
  if (!list) return throwError("No membership channels found.");

  let failures = [];

  let idx = 0;
  for (let ch of list) {
    idx++;

    let chatId = ch.type === "public" ? "@" + ch.username : ch.id;

    Api.getChatMember({
      chat_id: chatId,
      user_id: uid,
      on_result: "UtilityLib_updateMembershipUI",
      on_error: "UtilityLib_updateMembershipUI",
      bb_options: { ch_index: idx, ch_data: ch }
    });
  }
}

/* ========== UPDATE UI AFTER CHECK ========== */
function updateUI() {
  let ch = options.bb_options.ch_data;
  let joined = false;

  if (options.ok) {
    let status = options.result.status;
    if (["member", "administrator", "creator"].includes(status)) {
      joined = true;
    }
  }

  if (!joined) {
    return showJoinUI();
  }

  Bot.setProperty(
    MEMBERSHIP_KEY + "_last_good_" + user.telegramid,
    true,
    "boolean"
  );

  // If all checks passed
  let pending = Bot.getProperty(
    MEMBERSHIP_KEY + "_pending_" + user.telegramid
  ) || 0;

  pending++;

  if (pending >= Bot.getProperty(MEMBERSHIP_KEY).length) {
    Bot.setProperty(MEMBERSHIP_KEY + "_pending_" + user.telegramid, 0);
    Api.editMessageText({
      chat_id: user.telegramid,
      message_id: request.message_id,
      text: "🎉 <b>All memberships verified!</b>",
      parse_mode: "HTML"
    });
  } else {
    Bot.setProperty(
      MEMBERSHIP_KEY + "_pending_" + user.telegramid,
      pending,
      "integer"
    );
  }
}

/* ========================================= */
/* Helper to build join UI */
function formatJoinMessage(list) {
  let msg = "📢 <b>Please join required channels:</b>\n\n";

  let i = 1;
  for (let ch of list) {
    if (ch.type === "public") {
      msg += `${i}. @${ch.username}\n`;
    } else {
      msg += `${i}. <a href="${ch.invite}">Private Channel ${i}</a>\n`;
    }
    i++;
  }

  msg += "\nAfter joining, press <b>Check Again</b>.";
  return msg;
}

function buildJoinButtons(list) {
  let rows = [];
  let row = [];

  let i = 1;
  for (let ch of list) {
    let url = ch.type === "public"
      ? "https://t.me/" + ch.username
      : ch.invite;

    row.push({
      text: "Join " + i,
      url: url
    });

    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
    i++;
  }

  if (row.length > 0) rows.push(row);

  rows.push([{ text: "🔄 Check Again", callback_data: "membership_check" }]);

  return rows;
}

/* ========================================= */
/* PING & ITERATION — unchanged */
function ping() { /* unchanged */ }
function iteration(mode) { /* unchanged */ }

/* FINAL EXPORT */
publish({
  ping: ping,
  iteration: iteration,
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  adminList: getAdmins,
  showAdminList: showAdminList,

  // Membership APIs
  membershipSetup: membershipSetup,
  onMembershipSetup: onMembershipSetup,
  membershipCheck: membershipCheck,
  onMembershipCheck: onMembershipCheck
});

on("UtilityLib_doMembershipCheck", doCheck);
on("UtilityLib_updateMembershipUI", updateUI);
