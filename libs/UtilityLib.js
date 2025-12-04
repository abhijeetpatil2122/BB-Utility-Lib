/*
 *  Utility Library — Production Version
 *  Features:
 *   ✔ ping()        — latency checker
 *   ✔ iteration()   — BB iteration quota monitor
 *   ✔ setupOwner()  — one-time owner setup
 *   ✔ onlyAdmin()   — admin-only access gate
 *   ✔ addAdmin()    — add admin with auto messages
 *   ✔ removeAdmin() — remove admin with auto messages
 *   ✔ adminList()   — raw admin list
 *   ✔ showAdminList() — formatted admin list for display
 */

let LIB = "UtilityLib_"

// Storage keys
const OWNER_KEY = LIB + "owner"
const ADMINS_KEY = LIB + "admins"

/* =====================================================
                INTERNAL HELPERS
===================================================== */

function _send(to, txt) {
  Api.sendMessage({
    chat_id: to,
    text: txt,
    parse_mode: "HTML"
  })
}

function _getAdmins() {
  return Bot.getProperty(ADMINS_KEY) || []
}

function _setAdmins(list) {
  Bot.setProperty(ADMINS_KEY, list, "json")
}

/* =====================================================
                 1️⃣   OWNER SETUP
===================================================== */

function setupOwner() {
  let owner = Bot.getProperty(OWNER_KEY)

  if (owner) {
    _send(user.telegramid,
      `ℹ️ <b>Owner already set:</b> <code>${owner}</code>`
    )
    return
  }

  Bot.setProperty(OWNER_KEY, user.telegramid, "integer")
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json")

  _send(user.telegramid,
    "🎉 <b>You are now the bot owner!</b>\nAdmin system activated."
  )
}

function getOwner() {
  return Bot.getProperty(OWNER_KEY)
}

/* =====================================================
               2️⃣   ADMIN CHECK
===================================================== */

function onlyAdmin() {
  let admins = _getAdmins()

  if (!admins.includes(user.telegramid)) {
    _send(user.telegramid, "❌ <b>You are not an admin.</b>")
    throw "NOT_ADMIN"
  }
}

/* =====================================================
              3️⃣   ADD ADMIN
===================================================== */

function addAdmin(userId) {
  onlyAdmin()

  userId = parseInt(userId)
  if (!userId) return _send(user.telegramid, "⚠️ <b>Invalid user ID.</b>")

  let admins = _getAdmins()

  if (admins.includes(userId)) {
    return _send(user.telegramid, "⚠️ <b>User is already an admin.</b>")
  }

  admins.push(userId)
  _setAdmins(admins)

  _send(user.telegramid, `✅ <b>Admin added:</b> <code>${userId}</code>`)
  _send(userId, `🎉 <b>You are now an admin!</b>`)
}

/* =====================================================
              4️⃣   REMOVE ADMIN
===================================================== */

function removeAdmin(userId) {
  onlyAdmin()

  userId = parseInt(userId)
  if (!userId) return _send(user.telegramid, "⚠️ <b>Invalid user ID.</b>")

  let owner = getOwner()
  if (userId === owner) {
    return _send(user.telegramid, "❌ <b>You cannot remove the bot owner.</b>")
  }

  let admins = _getAdmins()

  if (!admins.includes(userId)) {
    return _send(user.telegramid, "⚠️ <b>User is not an admin.</b>")
  }

  admins = admins.filter(id => id !== userId)
  _setAdmins(admins)

  _send(user.telegramid, `🗑 <b>Admin removed:</b> <code>${userId}</code>`)
  _send(userId, `⚠️ <b>You are no longer an admin.</b>`)
}

/* =====================================================
           5️⃣   FORMATTED ADMINS LIST
===================================================== */

function showAdminList() {
  let admins = _getAdmins()
  let owner = getOwner()

  if (!owner) {
    return _send(user.telegramid,
      "⚠️ <b>No owner set.</b>\nRun <code>/setupowner</code> first."
    )
  }

  if (admins.length === 0) {
    return _send(user.telegramid,
      "⚠️ <b>No admins found.</b>\nUse <code>/setupowner</code>."
    )
  }

  let txt = "👮 <b>Admins List</b>\n\n"
  let index = 1

  admins.forEach(id => {
    let isOwner = id === owner ? " (Owner)" : ""
    txt += `${index}. <code>${id}</code>${isOwner}\n`
    index++
  })

  txt += `\n<b>Total:</b> ${admins.length}`

  _send(user.telegramid, txt)
}

/* =====================================================
           6️⃣   PING COMMAND (LATENCY)
===================================================== */

function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 <b>${latency} ms</b>`,
      parse_mode: "HTML"
    })
    return
  }

  Api.sendMessage({
    chat_id: request.chat.id,
    text: "<b>Ping…</b>",
    parse_mode: "HTML",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  })
}

on(LIB + "onPing", ping)

/* =====================================================
     7️⃣  BB ITERATION QUOTA VISUAL MONITOR
===================================================== */

function iteration() {
  const d = iteration_quota
  if (!d) {
    return _send(request.chat.id, "<b>❌ Unable to load quota.</b>")
  }

  const BAR = 25, FULL = "█", EMPTY = "░"

  let used = d.progress || 0
  let limit = d.limit || 1
  let pct = ((used / limit) * 100).toFixed(2)
  let fill = Math.round((pct / 100) * BAR)
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`

  function fmt(x) {
    try { return new Date(x).toLocaleString() } catch(e){ return x }
  }

  let msg =
    `<b>⚙️ BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${d.id}</code>\n` +
    `<b>Type:</b> <code>${d.quotum_type?.name}</code>\n` +
    `<b>Limit:</b> <code>${limit}</code>\n` +
    `<b>Used:</b> <code>${used}</code>\n` +
    `<b>Usage:</b> <code>${pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> <code>${fmt(d.started_at)}</code>\n` +
    `<b>Ends:</b> <code>${fmt(d.ended_at)}</code>`

  _send(request.chat.id, msg)
}

/* =====================================================
                   EXPORT FUNCTIONS
===================================================== */

publish({
  ping: ping,
  iteration: iteration,

  setupOwner: setupOwner,
  owner: getOwner,

  onlyAdmin: onlyAdmin,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin,

  adminList: _getAdmins,
  showAdminList: showAdminList
})
