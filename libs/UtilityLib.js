/*
 * UtilityLib v5
 * - ping()
 * - iteration(mode)         // "inspect" | "raw" | "limit,progress" | "limit"
 * - setupOwner(), onlyAdmin(), addAdmin(), removeAdmin(), showAdminList()
 * - Membership system:
 *     membershipSetup()            -- start owner setup (runs /onMembershipSetup via Bot.run)
 *     onSetupCommand(message)      -- called by /onMembershipSetup (owner pastes channels)
 *     membershipList()
 *     membershipRemove(index)
 *     membershipUpdate(newList)
 *     membershipCheck()            -- enforcement: returns true if OK, else shows join UI and returns false
 *     membershipRawCheck()         -- debug object
 *
 * Storage keys (Bot props):
 *  UtilityLib_owner
 *  UtilityLib_admins
 *  UtilityLib_membership_channels  (json array)
 *
 * Channel storage format:
 *  { type: "public", username: "CryptoNews" }
 *  { type: "private", id: "-1001234567890", invite: "https://t.me/+ABcdEfG" }
 *
 * Required developer commands in bot:
 *  /onMembershipSetup  -> should call Libs.UtilityLib.onSetupCommand(message)         (owner paste here)
 *  /onMembershipCheck  -> should call Libs.UtilityLib.membershipCheck()             (used by inline "Check Again" button)
 *
 * NOTE: Keep messages and function names short and friendly.
 */

let LIB = "UtilityLib_";
const OWNER_KEY = LIB + "owner";
const ADMINS_KEY = LIB + "admins";
const MEMBERSHIP_KEY = LIB + "membership_channels";
const CHECK_SESSION_PREFIX = LIB + "checksess_"; // temporary per-user check session

/* small helper to send HTML messages */
function _sendHtml(chat_id, text, reply_markup) {
  let params = { chat_id: chat_id, text: text, parse_mode: "HTML" };
  if (reply_markup) params.reply_markup = reply_markup;
  Api.sendMessage(params);
}

/* =========================
   Admin / Owner helpers
   ========================= */
function getOwner() { return Bot.getProperty(OWNER_KEY); }
function getAdmins() { return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list) { Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v) { return /^\d+$/.test(String(v)); }

/* Setup owner (run once) */
function setupOwner() {
  let owner = getOwner();
  if (owner) {
    _sendHtml(user.telegramid, `ℹ️ <b>Owner already set:</b>\n<code>${owner}</code>`);
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  _sendHtml(user.telegramid, "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>.");
  return true;
}

function onlyAdmin() {
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>`);
    return false;
  }
  let admins = getAdmins();
  if (!admins.includes(user.telegramid)) {
    _sendHtml(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}

function addAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) {
    _sendHtml(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let admins = getAdmins();
  if (admins.includes(id)) {
    _sendHtml(user.telegramid, "⚠️ <b>User is already admin.</b>");
    return false;
  }
  admins.push(id);
  setAdmins(admins);
  _sendHtml(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  _sendHtml(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

function removeAdmin(id) {
  if (!onlyAdmin()) return false;
  if (!isNumeric(id)) {
    _sendHtml(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let owner = getOwner();
  if (id === owner) {
    _sendHtml(user.telegramid, "❌ <b>You cannot remove the Owner.</b>");
    return false;
  }
  let admins = getAdmins();
  if (!admins.includes(id)) {
    _sendHtml(user.telegramid, "⚠️ <b>User is not an admin.</b>");
    return false;
  }
  admins = admins.filter(a => a !== id);
  setAdmins(admins);
  _sendHtml(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  _sendHtml(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

function showAdminList() {
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>`);
    return;
  }
  let admins = getAdmins();
  if (!admins || admins.length === 0) return _sendHtml(user.telegramid, "⚠️ <b>No admins found.</b>");
  let msg = "👮 <b>Admins List</b>\n\n";
  let idx = 1;
  admins.forEach(id => {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${idx}. <code>${id}</code>${role}\n`;
    idx++;
  });
  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;
  _sendHtml(user.telegramid, msg);
}

/* =========================
   Ping / Iteration (unchanged)
   ========================= */

function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start;
    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`,
      parse_mode: "HTML"
    });
    return;
  }
  Api.sendMessage({
    chat_id: request.chat.id,
    text: "<b>Ping…</b>",
    parse_mode: "HTML",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  });
}
on(LIB + "onPing", ping);

function iteration(mode) {
  const d = iteration_quota;
  if (!d) return null;
  const enriched = {
    ...d,
    pct: ((d.progress / d.limit) * 100).toFixed(2),
    type: d.quotum_type?.name || "Unknown",
    base_limit: d.quotum_type?.base_limit
  };
  // pick-multiple
  if (mode && typeof mode === "string" && mode.includes(",")) {
    let keys = mode.split(",").map(k => k.trim());
    let obj = {};
    keys.forEach(k => { obj[k] = enriched[k]; });
    return obj;
  }
  // single pick
  if (mode && mode !== "inspect" && !mode.includes(",")) {
    return enriched[mode];
  }
  // inspect raw
  if (mode === "inspect") {
    _sendHtml(user.telegramid, "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>");
    return d;
  }
  // formatted message
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t) { try { return new Date(t).toLocaleString(); } catch { return t; } }
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
  _sendHtml(user.telegramid, msg);
  return enriched;
}

/* =========================
   Membership System
   ========================= */

/* Helpers for membership storage */
function _getMembershipChannels() {
  return Bot.getProperty(MEMBERSHIP_KEY) || [];
}
function _setMembershipChannels(arr) {
  Bot.setProperty(MEMBERSHIP_KEY, arr, "json");
}
function membershipList() {
  let arr = _getMembershipChannels();
  if (!arr || arr.length === 0) return _sendHtml(user.telegramid, "📭 <b>No membership channels configured.</b>");
  let text = "📢 <b>Required channels</b>\n\n";
  arr.forEach((ch, i) => {
    if (ch.type === "public") {
      text += `${i+1}. <b>@${ch.username}</b> — <a href="https://t.me/${ch.username}">Join</a>\n`;
    } else {
      // private
      text += `${i+1}. <i>Private Channel</i> — <a href="${ch.invite}">Join Private Channel ${i+1}</a>\n`;
    }
  });
  _sendHtml(user.telegramid, text);
  return arr;
}

/* Parse user input from setup: many lines; public "@name" or private "-100id | invite" */
function _parseMembershipInput(raw) {
  if (!raw) return { error: "Empty input" };
  let lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "No channels provided" };
  let out = [];
  for (let i=0;i<lines.length;i++){
    let ln = lines[i];
    // Private format: -100123... | https://t.me/+Invite
    if (ln.includes("|")) {
      let parts = ln.split("|").map(p => p.trim());
      if (parts.length < 2) return { error: `Invalid private line: ${ln}` };
      let id = parts[0];
      let invite = parts[1];
      if (!/^(-?\d+)$/.test(id)) return { error: `Invalid private id: ${id}` };
      if (!/^https?:\/\/t\.me\/\+/.test(invite)) return { error: `Invalid invite link (must be t.me/+...): ${invite}` };
      out.push({ type: "private", id: id, invite: invite });
      continue;
    }
    // Public - must start with @
    if (ln.startsWith("@")) {
      let username = ln.replace(/^@+/, "");
      if (!/^[A-Za-z0-9_]{5,}$/.test(username)) {
        return { error: `Invalid public username: ${ln}` };
      }
      out.push({ type: "public", username: username });
      continue;
    }
    // Fallback: numeric channel id only (private id without invite) — rejects because we require invite for private
    return { error: `Unknown line format: ${ln}` };
  }
  if (out.length > 10) return { error: "Max 10 channels allowed" };
  return { value: out };
}

/* membershipSetup() - owner initiates setup.
   This will run Bot.run to call /onMembershipSetup command,
   so the dev must have a command /onMembershipSetup that invokes:
     Libs.UtilityLib.onSetupCommand(message)
   When owner pastes the list there, lib will parse and save.
*/
function membershipSetup() {
  if (!onlyAdmin()) return;
  // check required command exists? We can't check commands; instead we notify dev to create /onMembershipSetup.
  // We'll try to run it — if developer didn't create it, error will appear in Errors tab as requested.
  Bot.run({ command: "/onMembershipSetup", options: { from_lib: true } });
  _sendHtml(user.telegramid,
    "📥 <b>Membership setup started.</b>\n\n" +
    "You will now receive prompt (in /onMembershipSetup). Please paste channels list, one per line.\n\n" +
    "<b>Public format:</b>\n@ChannelName\n\n" +
    "<b>Private format (REQUIRED):</b>\n-1001234567890 | https://t.me/+InviteLink\n\n" +
    "Max 10 channels.\n\n" +
    "Example:\n@CryptoNews\n@AirdropWorld\n-1009876543210 | https://t.me/+ABcdEfGH"
  );
}

/* Called by developer command /onMembershipSetup when owner replies with channel list (owner only).
   Usage in dev bot:
     // Command: /onMembershipSetup
     // allow reply from owner
     Libs.UtilityLib.onSetupCommand(message)
*/
function onSetupCommand(rawText) {
  // check owner
  let owner = getOwner();
  if (!owner) {
    _sendHtml(user.telegramid, `⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code> first.`);
    return false;
  }
  if (user.telegramid !== owner) {
    _sendHtml(user.telegramid, "❌ <b>Only owner can run membership setup.</b>");
    return false;
  }
  let parsed = _parseMembershipInput(rawText);
  if (parsed.error) {
    _sendHtml(user.telegramid, `<b>❌ Error parsing input:</b>\n<code>${parsed.error}</code>`);
    return false;
  }
  _setMembershipChannels(parsed.value);
  _sendHtml(user.telegramid, `✅ <b>Saved ${parsed.value.length} channels.</b>\nYou can change later with membershipUpdate() or membershipRemove(index).`);
  return true;
}

/* membershipUpdate() - overwrite list (owner only)
   Developer may call: Libs.UtilityLib.membershipUpdate(newRawText)
*/
function membershipUpdate(newRawText) {
  if (!onlyAdmin()) return false;
  let parsed = _parseMembershipInput(newRawText);
  if (parsed.error) {
    _sendHtml(user.telegramid, `<b>❌ Error:</b> ${parsed.error}`);
    return false;
  }
  _setMembershipChannels(parsed.value);
  _sendHtml(user.telegramid, `✅ <b>Membership channels updated (${parsed.value.length}).</b>`);
  return true;
}

/* membershipRemove(index) - remove one channel by 1-based index (owner only) */
function membershipRemove(index) {
  if (!onlyAdmin()) return false;
  index = parseInt(index);
  if (!index || index < 1) {
    _sendHtml(user.telegramid, "⚠️ <b>Provide 1-based index to remove.</b>");
    return false;
  }
  let arr = _getMembershipChannels();
  if (index > arr.length) {
    _sendHtml(user.telegramid, "⚠️ <b>Index out of range.</b>");
    return false;
  }
  let removed = arr.splice(index-1, 1);
  _setMembershipChannels(arr);
  _sendHtml(user.telegramid, `🗑 <b>Removed:</b> ${(removed[0].type==="public") ? "@" + removed[0].username : "Private"}\nTotal now: ${arr.length}`);
  return true;
}

/* =========================
   Membership CHECK / UI
   ========================= */

/*
  Run a membership check:
  - returns true if user joined all required channels
  - if not joined: send formatted join message + buttons and return false
*/
function membershipCheck() {
  // if developer invoked this command via /onMembershipCheck callback, options may exist — we ignore
  let channels = _getMembershipChannels();
  if (!channels || channels.length === 0) {
    // Nothing required, pass
    return true;
  }

  // Limit to 10
  if (channels.length > 10) channels = channels.slice(0,10);

  // Create a session ID for this check
  let sessionId = String(Date.now()) + "_" + user.telegramid;
  // store expected count and results holder in bot prop
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  Bot.setProperty(metaKey, { expected: channels.length, received: 0, results: {} }, "json");

  // For each channel call Api.getChatMember with on_result
  for (let i=0;i<channels.length;i++){
    let ch = channels[i];
    let cb = LIB + "onMemberRes " + sessionId + " " + i; // will receive options
    let chat_id = (ch.type === "public") ? ("@" + ch.username) : ch.id;
    Api.getChatMember({
      chat_id: chat_id,
      user_id: user.telegramid,
      on_result: cb,
      on_error: cb  // on_error we'll treat as not joined/invalid
    });
  }

  // Process results after short delay (2 sec) — using Bot.run to avoid blocking
  Bot.run({
    command: LIB + "processCheck " + sessionId,
    options: { user_telegramid: user.telegramid },
    run_after: 2
  });

  // Immediately return false — the lib will send UI if not joined later.
  return false;
}

/* processCheck handler (background) - invoked by Bot.run after short delay */
function processCheck(sessionId) {
  // restore meta
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  let meta = Bot.getProperty(metaKey);
  if (!meta) {
    // no data — treat as fail
    _sendHtml(user.telegramid, "⚠️ <b>Membership check timed out. Try again.</b>");
    return false;
  }
  // load channels
  let channels = _getMembershipChannels();
  if (!channels || channels.length === 0) {
    _sendHtml(user.telegramid, "✅ <b>No membership required.</b>");
    Bot.deleteProp(metaKey);
    return true;
  }

  // evaluate results
  let notJoined = [];
  let invalid = [];
  for (let i=0;i<channels.length;i++){
    let res = meta.results && meta.results[i];
    let ch = channels[i];
    if (!res || res.status == "invalid" || res.status == "error") {
      // treat as not joined or invalid
      // For privacy: if API returned error (e.g. bot can't access channel), mark invalid
      if (res && res.status === "invalid") invalid.push({ index: i, channel: ch });
      else notJoined.push({ index: i, channel: ch });
      continue;
    }
    // if result exists, check member status
    if (!["member","administrator","creator"].includes(res.result.status)) {
      notJoined.push({ index: i, channel: ch });
    }
  }

  // If all joined
  if (notJoined.length === 0 && invalid.length === 0) {
    // success
    _sendHtml(user.telegramid, "✅ <b>All channels joined. Access granted.</b>");
    Bot.deleteProp(metaKey);
    return true;
  }

  // Build formatted message per your choices (Public: C, Private: E)
  let header = "📢 <b>Please join our required channels:</b>\n\n";
  let body = "";
  channels.forEach((ch, idx) => {
    if (ch.type === "public") {
      // Public: C -> @name — Join
      body += `${idx+1}. <b>@${ch.username}</b> — <a href="https://t.me/${ch.username}">Join</a>`;
    } else {
      // Private: E -> masked label "Join Private Channel N" linking to invite
      body += `${idx+1}. <a href="${ch.invite}">Join Private Channel ${idx+1}</a>`;
    }
    // mark status icon
    let stat = " ⛔";
    // check if joined
    let found = (meta.results && meta.results[idx] && meta.results[idx].result && ["member","administrator","creator"].includes(meta.results[idx].result.status));
    if (found) stat = " ✅";
    body += stat + "\n";
  });

  let msg = header + body + `\nAfter joining, press <b>Check Again</b>.`;

  // Build inline keyboard: 2 buttons per row for join links, last row "🔄 Check Again"
  let kb = [];
  let row = [];
  for (let i=0;i<channels.length;i++){
    let ch = channels[i];
    let btnText = (ch.type === "public") ? `Join ${i+1}` : `Join ${i+1}`;
    let url = (ch.type === "public") ? `https://t.me/${ch.username}` : ch.invite;
    row.push({ text: btnText, url: url });
    if (row.length === 2) {
      kb.push(row); row = [];
    }
  }
  if (row.length) kb.push(row);
  // final check button
  kb.push([{ text: "🔄 Check Again", callback_data: "/onMembershipCheck" }]);

  _sendHtml(user.telegramid, msg, { inline_keyboard: kb });

  // keep results for short time for debugging
  Bot.setProperty(metaKey, meta, "json"); // re-save
  return false;
}

/* onMemberRes handler: called by Api.getChatMember on_result / on_error
   options will contain result or error. We store into Bot prop under session.
   Callback naming earlier: LIB + "onMemberRes " + sessionId + " " + index
   So when onMemberRes runs, params = "<sessionId> <index>"
*/
function onMemberRes() {
  // params: "<sessionId> <index>"
  let parts = params.split(" ");
  let sessionId = parts[0];
  let idx = parseInt(parts[1]);
  let metaKey = CHECK_SESSION_PREFIX + sessionId;
  let meta = Bot.getProperty(metaKey);
  if (!meta) {
    // ignore
    return;
  }
  // save result
  let res = options || {};
  // mark error cases
  if (options && options.result && options.result.status) {
    // normal
    meta.results[idx] = { result: options.result };
  } else {
    // on_error or weird
    meta.results[idx] = { status: "invalid", info: options };
  }
  meta.received = (meta.received || 0) + 1;
  Bot.setProperty(metaKey, meta, "json");
}

/* membershipRawCheck() - quick debug for developer: returns raw results for this user (if any recent)
   If none, triggers a new check and returns null (developer can inspect later)
*/
function membershipRawCheck() {
  let arr = _getMembershipChannels();
  if (!arr || arr.length === 0) {
    _sendHtml(user.telegramid, "<b>No membership channels configured.</b>");
    return null;
  }
  // Reuse membershipCheck() to run a check and return null — developer should call inspect after run
  membershipCheck();
  _sendHtml(user.telegramid, "<i>Check started. Wait ~2s then use this command again to inspect session (or check logs).</i>");
  return null;
}

/* =========================
   Export API
   ========================= */
publish({
  // admin
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  showAdminList: showAdminList,
  owner: getOwner,
  adminList: getAdmins,

  // ping/iteration
  ping: ping,
  iteration: iteration,

  // membership
  membershipSetup: membershipSetup,    // runs /onMembershipSetup
  onSetupCommand: onSetupCommand,      // call inside /onMembershipSetup (dev command)
  membershipList: membershipList,
  membershipRemove: membershipRemove,
  membershipUpdate: membershipUpdate,
  membershipCheck: membershipCheck,    // call inside /onMembershipCheck (dev command)
  membershipRawCheck: membershipRawCheck
});

/* Bind internal handlers used by Api.getChatMember callbacks and background runs */
on(LIB + "onMemberRes", onMemberRes);
on(LIB + "processCheck", processCheck);
