/*
 Utility Library — v6 (membership built-in)
 - ping()
 - iteration(mode)
 - admin system (setupOwner, onlyAdmin, addAdmin, removeAdmin, showAdminList)
 - membership system:
    membershipSetup()      // instructs owner how to provide channel list
    receiveSetup(text)     // call from /onUMSetup command with the raw channels text
    membershipCheck()      // call inside protected commands; sends join UI (immediate) and returns false
    onCheckCallback()      // call from /um_check (callback button) to perform the real verification
    membershipRawCheck()   // helper: run full check and return detailed object (background)
    membershipList()       // return array of currently stored channels
    setJoinMessage / getJoinMessage
*/

let LIB = "UtilityLib_";

const OWNER_KEY    = LIB + "owner";
const ADMINS_KEY   = LIB + "admins";
const CH_KEY       = LIB + "membership_channels";   // json array
const JOINMSG_KEY  = LIB + "membership_join_msg";   // string
const MAX_CHANNELS = 10;

function send(to, text, extra = {}) {
  Api.sendMessage(Object.assign({ chat_id: to, text: text, parse_mode: "HTML", disable_web_page_preview: true }, extra));
}

/* ---------------------
   Admin helpers (unchanged)
----------------------*/
function getOwner(){ return Bot.getProperty(OWNER_KEY); }
function getAdmins(){ return Bot.getProperty(ADMINS_KEY) || []; }
function setAdmins(list){ Bot.setProperty(ADMINS_KEY, list, "json"); }
function isNumeric(v){ return /^\d+$/.test(String(v)); }

/* Owner setup (one-time) */
function setupOwner(){
  let owner = getOwner();
  if(owner){
    send(user.telegramid, "ℹ️ <b>Owner already set:</b>\n<code>" + owner + "</code>");
    return true;
  }
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer");
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json");
  send(user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\nYou are now the <b>Owner</b> & first <b>Admin</b>."
  );
  return true;
}

function onlyAdmin(){
  let owner = getOwner();
  if(!owner){
    send(user.telegramid,
      "⚠️ <b>Admin System Not Set!</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    );
    return false;
  }
  let admins = getAdmins();
  if(!admins.includes(user.telegramid)){
    send(user.telegramid, "❌ <b>You are not an admin.</b>");
    return false;
  }
  return true;
}

function addAdmin(id){
  if(!onlyAdmin()) return false;
  if(!isNumeric(id)){
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let admins = getAdmins();
  if(admins.includes(id)){
    send(user.telegramid, "⚠️ <b>User is already admin.</b>");
    return false;
  }
  admins.push(id);
  setAdmins(admins);
  send(user.telegramid, `✅ <b>Admin Added:</b> <code>${id}</code>`);
  send(id, "🎉 <b>You are now an Admin!</b>");
  return true;
}

function removeAdmin(id){
  if(!onlyAdmin()) return false;
  if(!isNumeric(id)){
    send(user.telegramid, "⚠️ <b>Telegram ID must be numeric.</b>");
    return false;
  }
  id = Number(id);
  let owner = getOwner();
  if(id === owner){
    send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>");
    return false;
  }
  let admins = getAdmins();
  if(!admins.includes(id)){
    send(user.telegramid, "⚠️ <b>User is not an admin.</b>");
    return false;
  }
  admins = admins.filter(a => a !== id);
  setAdmins(admins);
  send(user.telegramid, `🗑 <b>Admin Removed:</b> <code>${id}</code>`);
  send(id, "⚠️ <b>You are no longer an Admin.</b>");
  return true;
}

function showAdminList(){
  let owner = getOwner();
  if(!owner){
    send(user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    );
    return;
  }
  let admins = getAdmins();
  if(admins.length === 0) return send(user.telegramid, "⚠️ <b>No admins found.</b>");
  let msg = "👮 <b>Admins List</b>\n\n";
  let index = 1;
  admins.forEach(id => {
    let role = id === owner ? " (<b>Owner</b>)" : " (<i>Admin</i>)";
    msg += `${index}. <code>${id}</code>${role}\n`;
    index++;
  });
  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> 1 | <b>Admins:</b> ${admins.length - 1}`;
  send(user.telegramid, msg);
}

/* ---------------------
  Ping & Iteration (unchanged)
----------------------*/
function ping(){
  if(options?.result){
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

function iteration(mode){
  const d = iteration_quota;
  if(!d) return null;
  const enriched = Object.assign({}, d, {
    pct: ((d.progress / d.limit) * 100).toFixed(2),
    type: d.quotum_type?.name || "Unknown",
    base_limit: d.quotum_type?.base_limit
  });
  if(mode && typeof mode === "string" && mode.includes(",")){
    let keys = mode.split(",").map(k=>k.trim());
    let obj = {};
    keys.forEach(k => { obj[k] = enriched[k]; });
    return obj;
  }
  if(mode && mode !== "inspect") return enriched[mode];
  if(mode === "inspect"){
    send(user.telegramid, "<b>📦 Raw Iteration Data:</b>\n<code>" + JSON.stringify(d, null, 2) + "</code>");
    return d;
  }
  const BAR = 25, FULL = "█", EMPTY = "░";
  let fill = Math.round((enriched.pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`;
  function fmt(t){ try { return new Date(t).toLocaleString(); } catch(e){ return t; } }
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

/* ============================
   MEMBERSHIP SYSTEM
   Usage summary (developer):
   1) Run in some admin command: Libs.UtilityLib.membershipSetup()
   2) Create bot command /onUMSetup with code: Libs.UtilityLib.receiveSetup(message)
   3) Create bot command /um_check with code: Libs.UtilityLib.onCheckCallback()
   4) In protected commands call: if (!Libs.UtilityLib.membershipCheck()) return;
=============================*/

/* helpers for channels storage */
function _getChannels(){
  return Bot.getProperty(CH_KEY) || [];
}
function _setChannels(arr){
  Bot.setProperty(CH_KEY, arr, "json");
}
function membershipList(){ return _getChannels(); }

function setJoinMessage(txt){
  Bot.setProperty(JOINMSG_KEY, txt, "text");
}
function getJoinMessage(){
  return Bot.getProperty(JOINMSG_KEY) || "📢 Please join our required channels:";
}

/* validate a single raw line into an object
   Supported formats:
   - public: @ChannelName
   - private: -1001234567890 | https://t.me/+INVITELINK
*/
function _parseLine(line){
  line = line.trim();
  if(!line) return null;
  // public
  if(line.startsWith("@")){
    // normalize username (strip extra spaces)
    let u = line.split(/\s+/)[0].replace(/^@+/, "");
    return { type: "public", username: u };
  }
  // private format: id | invite
  let parts = line.split("|").map(s => s.trim()).filter(Boolean);
  // if single number given (id)
  if(parts.length === 1 && /^-?\d+$/.test(parts[0])){
    return { type: "private", id: parts[0] };
  }
  if(parts.length >= 2){
    // first part id, second invite url
    if(/^(-?100|\-?\d+)/.test(parts[0]) && parts[1].startsWith("http")){
      return { type: "private", id: parts[0], invite: parts[1] };
    }
  }
  return null;
}

/* membershipSetup instructions for owner */
function membershipSetup(){
  if(!onlyAdmin()) return;
  let msg =
    "<b>Membership Setup — Instructions</b>\n\n" +
    "1) Create a bot command: <code>/onUMSetup</code>\n" +
    "   and set its code to:\n" +
    "   <code>Libs.UtilityLib.receiveSetup(message)</code>\n\n" +
    "2) After you add that command, run /onUMSetup and paste CHANNELS (one per line):\n\n" +
    "   • Public channel: <code>@ChannelName</code>\n" +
    "   • Private channel: <code>-1001234567890 | https://t.me/+InviteLink</code>\n\n" +
    "Example:\n" +
    "@CryptoNews\n@AirdropWorld\n-1009876543210 | https://t.me/+InviteABC\n\n" +
    "You can add up to " + MAX_CHANNELS + " channels.\n\n" +
    "When you send the list using /onUMSetup, the library will parse and store them.";
  send(user.telegramid, msg);
}

/* receiveSetup(text) — called by owner via /onUMSetup command */
function receiveSetup(text){
  if(!onlyAdmin()) return false;
  if(!text || String(text).trim() === ""){
    send(user.telegramid, "⚠️ <b>No input detected.</b>\nSend channel list when calling /onUMSetup");
    return false;
  }

  let lines = String(text).split("\n").map(l => l.trim()).filter(Boolean);
  let parsed = [];
  for(let i=0;i<lines.length;i++){
    let p = _parseLine(lines[i]);
    if(!p){
      send(user.telegramid, "⚠️ <b>Invalid line:</b>\n<code>" + lines[i] + "</code>\n\nPlease follow format examples and try again.");
      return false;
    }
    parsed.push(p);
    if(parsed.length > MAX_CHANNELS){
      send(user.telegramid, `⚠️ <b>Too many channels. Max ${MAX_CHANNELS} allowed.</b>`);
      return false;
    }
  }

  _setChannels(parsed);
  send(user.telegramid, `✅ <b>Membership channels saved:</b> ${parsed.length} channel(s).`);
  return true;
}

/* build join UI message & buttons (2 per row) */
function _buildJoinUI(userId){
  let channels = _getChannels();
  if(!channels || channels.length === 0){
    throw new Error("UtilityLib: membership channels are not set. Run membershipSetup() first.");
  }

  // build message lines and buttons
  let lines = [];
  let buttons = [];
  for(let i=0;i<channels.length;i++){
    let ch = channels[i];
    let idx = i+1;
    if(ch.type === "public"){
      let label = "@" + ch.username;
      lines.push(`${idx}. <b>${label}</b> — ❌`);
      // url to join: https://t.me/username
      buttons.push([{ text: `Join ${idx}`, url: `https://t.me/${ch.username}` }]);
    } else {
      // private
      let title = ch.invite ? `<a href="${ch.invite}">Private #${idx}</a>` : `Private #${idx}`;
      lines.push(`${idx}. ${title} — ❌`);
      let url = ch.invite || `https://t.me/${ch.id}`; // invite preferred
      buttons.push([{ text: `Join ${idx}`, url: url }]);
    }
  }

  // convert to 2-per-row layout from simple buttons array:
  let inline = [];
  // buttons currently array of single-item rows; we need 2 per row
  for(let i=0;i<buttons.length;i+=2){
    if(i+1 < buttons.length){
      inline.push([ buttons[i][0], buttons[i+1][0] ]);
    } else {
      inline.push([ buttons[i][0] ]);
    }
  }
  // add Check Again row
  inline.push([ { text: "🔄 Check Again", callback_data: "/um_check" } ]);

  let text =
    getJoinMessage() + "\n\n" +
    lines.join("\n") + "\n\n" +
    "<i>After joining all channels press 'Check Again'</i>";

  return { text: text, reply_markup: { inline_keyboard: inline } };
}

/* membershipCheck() — called by protected commands
   Behavior (your choice): sends join UI immediately and returns false if not joined.
   If everything is already joined (rare), returns true.
*/
function membershipCheck(){
  // no user -> allow pass
  if(!user){ return true; }

  let channels = _getChannels();
  if(!channels || channels.length === 0){
    send(user.telegramid, "⚠️ <b>Membership channels are not configured.</b>\nAsk admin to run membershipSetup()");
    return false;
  }

  // We will try a quick "isMember" heuristic:
  // If user property `UtilityLib_member_checked_?` exists and is true for all channels we could skip,
  // but to keep correctness we will always show Join UI first (per your A choice).
  let ui = _buildJoinUI(user.telegramid);
  send(user.telegramid, ui.text, { reply_markup: ui.reply_markup });
  // returns false (stop protected command) — check is performed only after button pressed
  return false;
}

/* onCheckCallback() — invoked by callback button /um_check (bot-side command)
   This runs the actual check for the current user.
   It will:
     - answerCallbackQuery popup
     - run API.getChatMember for each channel (sequentially)
     - collect results and update UI message with statuses
     - if all joined -> return true to caller by sending message (or invoke a callback)
*/
function onCheckCallback(){
  // required bot-side command must exist and call this method
  // press popup
  try{
    Api.answerCallbackQuery({ callback_query_id: request.id, text: "Checking membership… (may take few seconds)", show_alert: false });

  }catch(e){}
  // run background check: we'll create a background job to minimize blocking
  Bot.run({
    command: LIB + "doFullMembershipCheck",
    options: { chat_id: request.chat.id, user_telegramid: request.from.id }
  });
  // nothing else (we answered callback)
}

/* doFullMembershipCheck - background worker
   This command checks each channel and then edits the message with statuses.
   It must be registered as a command name LIB + "doFullMembershipCheck" using publish -> internal on() mapping.
*/
function doFullMembershipCheck(){
  // options: chat_id, user_telegramid
  let targetChat = options && options.chat_id ? options.chat_id : request.chat.id;
  let targetUser = options && options.user_telegramid ? options.user_telegramid : request.from.id;

  let channels = _getChannels();
  if(!channels || channels.length === 0){
    send(targetUser, "⚠️ <b>No membership channels configured.</b>");
    return;
  }

  // We'll collect results as array of { ok: true/false, status: "member"/"left"/"invalid", details: ...}
  let results = [];
  // run sequential requests (small number of channels, max 10)
  for(let i=0;i<channels.length;i++){
    let ch = channels[i];
    try{
      // chat_id may be @username or numeric id
      let chat_id;
      if(ch.type === "public"){
        chat_id = "@" + ch.username;
      } else {
        // private uses id
        chat_id = ch.id || ch.invite || ch.username || "";
      }
      // perform api call (synchronous via HTTP wrapper)
      let res = Api.getChatMember({ chat_id: chat_id, user_id: targetUser });
      // Api.getChatMember returns response in 'content' variable in many BB environments; but here we use direct return
      // On success res.result.status usually present
      if(!res || !res.result){
        results.push({ channel: ch, ok: false, error: res || "No result" });
        continue;
      }
      let status = res.result.status;
      if(["member","administrator","creator"].includes(status)){
        results.push({ channel: ch, ok: true, status: status, raw: res });
      } else {
        results.push({ channel: ch, ok: false, status: status, raw: res });
      }
    }catch(err){
      // Api.getChatMember may throw; record invalid
      results.push({ channel: ch, ok: false, error: err.message || String(err) });
    }
  }

  // Build status summary text + buttons (same layout as UI but statuses updated)
  let lines = [];
  let inline = [];
  for(let i=0;i<channels.length;i++){
    let ch = channels[i];
    let r = results[i];
    let idx = i+1;
    if(r && r.ok){
      // joined
      if(ch.type === "public"){
        lines.push(`${idx}. <b>@${ch.username}</b> — ✅`);
        inline.push([ { text: `Open ${idx}`, url: `https://t.me/${ch.username}` } ]);
      } else {
        let label = ch.invite ? `<a href="${ch.invite}">Private #${idx}</a>` : `Private #${idx}`;
        lines.push(`${idx}. ${label} — ✅`);
        let url = ch.invite || `https://t.me/${ch.id}`;
        inline.push([ { text: `Open ${idx}`, url: url } ]);
      }
    } else {
      // not joined / invalid
      if(ch.type === "public"){
        lines.push(`${idx}. <b>@${ch.username}</b> — ❌`);
        inline.push([ { text: `Join ${idx}`, url: `https://t.me/${ch.username}` } ]);
      } else {
        let label = ch.invite ? `<a href="${ch.invite}">Private #${idx}</a>` : `Private #${idx}`;
        lines.push(`${idx}. ${label} — ❌`);
        let url = ch.invite || (`https://t.me/${ch.id}`);
        inline.push([ { text: `Join ${idx}`, url: url } ]);
      }
    }
  }

  // convert single-button rows into 2-per-row layout
  let twoRows = [];
  for(let i=0;i<inline.length;i+=2){
    if(i+1 < inline.length) twoRows.push([ inline[i][0], inline[i+1][0] ]);
    else twoRows.push([ inline[i][0] ]);
  }
  // If all joined -> final message & no Check Again
  let allJoined = results.every(r => r && r.ok);
  if(!allJoined){
    twoRows.push([ { text: "🔄 Check Again", callback_data: "/um_check" } ]);
  }

  let header = getJoinMessage();
  let finalText =
    `<b>🔍 Membership check result</b>\n\n` +
    header + "\n\n" +
    lines.join("\n") + "\n\n" +
    (allJoined ? "<b>✅ You have joined all required channels.</b>" : "<i>Press Check Again after joining channels</i>");

  // Send (or edit) message to user
  send(targetUser, finalText, { reply_markup: { inline_keyboard: twoRows } });

  // If everything joined, optionally notify or proceed (we just notify)
  if(allJoined){
    send(targetUser, "🎉 <b>All channels joined. You can now use protected commands.</b>");
  } else {
    send(targetUser, "⚠️ <b>Not all channels are joined yet.</b>");
  }

  // return results for developer use if they call membershipRawCheck()
  // Save results temporarily as a user prop for inspection (optional)
  User.setProperty("UtilityLib_last_membership_check", results, "json");
  return results;
}

/* membershipRawCheck() - developer helper: returns last results or runs a fresh check (synchronous)
   NOTE: calling this directly will run the same doFullMembershipCheck flow synchronously.
*/
function membershipRawCheck(){
  // Run synchronous check (direct call)
  return doFullMembershipCheck();
}

/* ******************************
   publish
*******************************/
publish({
  // admin
  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,
  showAdminList: showAdminList,

  // ping / iteration
  ping: ping,
  iteration: iteration,

  // membership API
  membershipSetup: membershipSetup,
  receiveSetup: receiveSetup,
  membershipCheck: membershipCheck,
  onCheckCallback: onCheckCallback,
  membershipRawCheck: membershipRawCheck,
  membershipList: membershipList,
  setJoinMessage: setJoinMessage,
  getJoinMessage: getJoinMessage,
  owner: getOwner
});

/* background command mapping — this allows Bot.run to call LIB + "doFullMembershipCheck" */
on(LIB + "doFullMembershipCheck", doFullMembershipCheck);
