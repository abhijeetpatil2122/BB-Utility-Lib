// Utility Lib — Admin flows (single-call + reply handling)
// Usage in command BJS: Libs.Utility.addAdmin(message);
//                    or Libs.Utility.removeAdmin(message);

const PREFIX = "UtilityLib_admins_v1"; // property base key

// helper: property key per bot
function propKey() {
  // `bot` object exists in BJS: use bot.id if available, fallback to 'global'
  const id = (typeof bot !== "undefined" && bot.id) ? bot.id : "global";
  return PREFIX + "_" + id;
}

// Read admins array (per-bot)
function getAdmins() {
  return Bot.getProperty(propKey(), []) || [];
}

// Save admins array (per-bot)
function saveAdmins(list) {
  Bot.setProperty(propKey(), list, "json");
}

// Check membership
function isAdmin(id) {
  if (!id) return false;
  const list = getAdmins();
  return list.map(String).includes(String(id));
}

// Internal: ensure at least one admin — if none, make the caller the first admin
function bootstrapFirstAdmin() {
  const list = getAdmins();
  if (!list || list.length === 0) {
    const id = user.telegramid;
    saveAdmins([String(id)]);
    Bot.sendMessage("*🟢 You became the first admin for this bot.*", { parse_mode: "Markdown" });
    return true;
  }
  return false;
}

// require current user to be admin, send standardized message if not
function requireAdmin() {
  // if there are no admins, bootstrap first admin (caller)
  if (bootstrapFirstAdmin()) return true;

  if (!isAdmin(user.telegramid)) {
    Bot.sendMessage("*❌ Admin only command!*", { parse_mode: "Markdown" });
    return false;
  }
  return true;
}

// Format admin list for display
function formatAdminsList() {
  const list = getAdmins();
  if (!list || list.length === 0) {
    return "*No admins configured.*";
  }
  let out = "*👑 Admins:*\n\n";
  list.forEach((id, idx) => {
    out += `${idx + 1}. \`${id}\`\n`;
  });
  return out;
}

/* -------------------------
   Flow: addAdmin(message)
   - If called without message (or message empty) -> send prompt to user
   - If called with message -> try to parse ID and add
   Usage in command:
     - Wait for answer = ON
     - BJS: Libs.Utility.addAdmin(message);
   ------------------------- */
function addAdmin(message) {
  // initial run (no message) -> send prompt
  if (!message) {
    // must be admin to start adding (if admins exist)
    if (!requireAdmin()) return;
    Bot.sendMessage("*Send the Telegram ID (numeric) to add as admin:*", { parse_mode: "Markdown" });
    return;
  }

  // message present -> treat it as the ID
  // allow user to paste a number or a mention; we extract digits
  const idStr = String(message).trim();
  const idMatch = idStr.match(/(\d{5,})/); // at least 5 digits to be safe
  if (!idMatch) {
    Bot.sendMessage("*⚠️ Invalid ID. Send numeric Telegram ID (digits only).*", { parse_mode: "Markdown" });
    return;
  }
  const id = String(idMatch[1]);

  // Only admins can add new admins
  if (!requireAdmin()) return;

  const admins = getAdmins();
  if (admins.map(String).includes(id)) {
    Bot.sendMessage("*⚠️ This ID is already an admin.*", { parse_mode: "Markdown" });
    return;
  }

  admins.push(id);
  saveAdmins(admins);

  Bot.sendMessage(`*✅ Admin added:* \`${id}\``, { parse_mode: "Markdown" });

  // notify added user (best effort)
  try {
    Bot.sendMessageToChatWithId(id, "*🎉 You were promoted to admin.*", { parse_mode: "Markdown" });
  } catch (e) {
    // ignore send failure
  }
}

/* -------------------------
   Flow: removeAdmin(message)
   - If called without message -> send prompt
   - If called with message -> parse and remove
   Usage in command:
     - Wait for answer = ON
     - BJS: Libs.Utility.removeAdmin(message);
   ------------------------- */
function removeAdmin(message) {
  if (!message) {
    if (!requireAdmin()) return;
    Bot.sendMessage("*Send the Telegram ID (numeric) to remove from admins:*", { parse_mode: "Markdown" });
    return;
  }

  const idStr = String(message).trim();
  const idMatch = idStr.match(/(\d{5,})/);
  if (!idMatch) {
    Bot.sendMessage("*⚠️ Invalid ID. Send numeric Telegram ID (digits only).*", { parse_mode: "Markdown" });
    return;
  }
  const id = String(idMatch[1]);

  if (!requireAdmin()) return;

  let admins = getAdmins();
  if (!admins.map(String).includes(id)) {
    Bot.sendMessage("*⚠️ This ID is not an admin.*", { parse_mode: "Markdown" });
    return;
  }

  // don't allow removing last admin
  if (admins.length === 1) {
    Bot.sendMessage("*❌ Cannot remove the last admin.*", { parse_mode: "Markdown" });
    return;
  }

  admins = admins.filter(a => String(a) !== id);
  saveAdmins(admins);

  Bot.sendMessage(`*🗑️ Admin removed:* \`${id}\``, { parse_mode: "Markdown" });

  try {
    Bot.sendMessageToChatWithId(id, "*❌ You were removed from admins.*", { parse_mode: "Markdown" });
  } catch (e) {}
}

// Export API
publish({
  // admin helpers
  isAdmin: isAdmin,
  requireAdmin: requireAdmin,
  listAdmins: function () { Bot.sendMessage(formatAdminsList(), { parse_mode: "Markdown" }); },

  // flows (single-call + reply)
  addAdmin: addAdmin,
  removeAdmin: removeAdmin
});
