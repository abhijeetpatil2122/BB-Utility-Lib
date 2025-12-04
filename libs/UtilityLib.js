/*
 *  Utility Library (Production Version)
 *  Features:
 *   1) ping()       — BB latency measurement
 *   2) iteration()  — full iteration quota info
 *   3) Admin System — add/remove/check admin roles
 */

let LIB = "UtilityLib_"

/* =====================================================
                INTERNAL HELPERS
===================================================== */

const ADMINS_KEY = LIB + "admins"

// Send message internally
function _send(to, text){
  Api.sendMessage({
    chat_id: to,
    text: text,
    parse_mode: "HTML"
  })
}

// Load stored admin list (owner always included)
function _getAdmins(){
  let list = Bot.getProperty(ADMINS_KEY)
  if (!list || !Array.isArray(list)) {
    list = [bot.owner]   // ensure owner is admin
    Bot.setProperty(ADMINS_KEY, list, "json")
  }
  return list
}

// Save admin list
function _setAdmins(list){
  Bot.setProperty(ADMINS_KEY, list, "json")
}

/* =====================================================
                1️⃣ PING SYSTEM
===================================================== */
function ping(){
  if (options?.result){
    const latency = Date.now() - options.bb_options.start

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 *${latency} ms*`,
      parse_mode: "Markdown"
    })
    return
  }

  Api.sendMessage({
    chat_id: request.chat.id,
    text: "*Ping…*",
    parse_mode: "Markdown",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  })
}

on(LIB + "onPing", ping)

/* =====================================================
           2️⃣ ITERATION QUOTA DISPLAY
===================================================== */
function iteration(){
  const data = iteration_quota
  if (!data){
    return Api.sendMessage({
      chat_id: request.chat.id,
      text: "<b>❌ Unable to load iteration quota.</b>",
      parse_mode: "HTML"
    })
  }

  const BAR = 25, FULL = "█", EMPTY = "░"
  let used = data.progress || 0
  let limit = data.limit || 1

  let pct = ((used / limit) * 100).toFixed(2)
  let filled = Math.round((pct / 100) * BAR)
  let bar = `[ ${FULL.repeat(filled)}${EMPTY.repeat(BAR - filled)} ]`

  function fmt(t){
    try { return new Date(t).toLocaleString() } catch(e){ return "N/A" }
  }

  let txt =
    `<b>⚙️ BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${data.id}</code>\n` +
    `<b>Type:</b> <code>${data.quotum_type?.name}</code>\n` +
    `<b>Base Limit:</b> <code>${data.quotum_type?.base_limit}</code>\n` +
    `<b>Extra Points:</b> <code>${data.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${limit}</code>\n` +
    `<b>Used:</b> <code>${used}</code>\n` +
    `<b>Usage:</b> <code>${pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> <code>${fmt(data.started_at)}</code>\n` +
    `<b>Ends:</b> <code>${fmt(data.ended_at)}</code>`

  Api.sendMessage({ chat_id: request.chat.id, text: txt, parse_mode: "HTML" })
}

/* =====================================================
           3️⃣ ADMIN SYSTEM (AUTO-MESSAGES)
===================================================== */

// Block non-admins automatically
function onlyAdmin(){
  let admins = _getAdmins()
  if (!admins.includes(user.telegramid)){
    _send(user.telegramid, "❌ <b>You are not an admin.</b>")
    throw "NOT_ADMIN"  // stop further execution
  }
}

// Add admin
function addAdmin(userId){
  onlyAdmin()

  userId = parseInt(userId)
  if (!userId){
    return _send(user.telegramid, "⚠️ <b>Invalid user ID.</b>")
  }

  let admins = _getAdmins()

  if (admins.includes(userId)){
    return _send(user.telegramid, "⚠️ <b>User is already an admin.</b>")
  }

  admins.push(userId)
  _setAdmins(admins)

  _send(user.telegramid, `✅ <b>Added admin:</b> <code>${userId}</code>`)
  _send(userId, `🎉 <b>You are now an admin!</b>`)
}

// Remove admin
function removeAdmin(userId){
  onlyAdmin()

  userId = parseInt(userId)
  if (!userId){
    return _send(user.telegramid, "⚠️ <b>Invalid user ID.</b>")
  }

  let admins = _getAdmins()

  // owner cannot be removed
  if (userId === bot.owner){
    return _send(user.telegramid, "❌ <b>You cannot remove the bot owner.</b>")
  }

  if (!admins.includes(userId)){
    return _send(user.telegramid, "⚠️ <b>User is not an admin.</b>")
  }

  admins = admins.filter(id => id !== userId)
  _setAdmins(admins)

  _send(user.telegramid, `🗑 <b>Removed admin:</b> <code>${userId}</code>`)
  _send(userId, `⚠️ <b>You are no longer an admin.</b>`)
}

/* =====================================================
                EXPORT LIB FUNCTIONS
===================================================== */
publish({
  ping: ping,
  iteration: iteration,

  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin
})
