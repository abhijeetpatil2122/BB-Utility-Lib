/*
 * Utility Library — Production Version
 * Includes:
 *    ping()
 *    iteration()
 *    setupOwner()
 *    onlyAdmin()
 *    addAdmin()
 *    removeAdmin()
 *    adminList()
 *    showAdminList()
*/

let LIB = "UtilityLib_"

const OWNER_KEY  = LIB + "owner"
const ADMINS_KEY = LIB + "admins"

function send(to, text) {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: "HTML" })
}

/* ============================
       INTERNAL HELPERS
============================ */
function getOwner() {
  return Bot.getProperty(OWNER_KEY)
}

function getAdmins() {
  return Bot.getProperty(ADMINS_KEY) || []
}

function setAdmins(list) {
  Bot.setProperty(ADMINS_KEY, list, "json")
}

/* ============================
       OWNER SETUP
============================ */
function setupOwner() {
  let owner = getOwner()

  if (owner) {
    send(user.telegramid, 
      "ℹ️ <b>Owner is already set:</b>\n<code>" + owner + "</code>"
    )
    return true
  }

  // First time initialization
  Bot.setProperty(OWNER_KEY, user.telegramid, "integer")
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json")

  send(
    user.telegramid,
    "🎉 <b>Owner Setup Complete!</b>\n" +
    "You are now the <b>Owner</b> and also the <b>first Admin</b>."
  )

  return true
}

/* ============================
       ADMIN CHECK
============================ */
function onlyAdmin() {
  let owner = getOwner()

  // If owner not initialized → block all admin operations
  if (!owner) {
    send(
      user.telegramid,
      "⚠️ <b>Admin System Not Set Up!</b>\n\n" +
      "➡️ Run this command first:\n" +
      "<code>Libs.UtilityLib.setupOwner()</code>\n\n" +
      "This will set <b>you</b> as the Owner and enable admin tools."
    )
    return false
  }

  let admins = getAdmins()
  if (!admins.includes(user.telegramid)) {
    send(user.telegramid, "❌ <b>You are not an admin.</b>")
    return false
  }

  return true
}

/* ============================
        ADD ADMIN
============================ */
function addAdmin(id) {
  if (!onlyAdmin()) return false

  id = parseInt(id)

  if (!id) {
    send(user.telegramid, "⚠️ <b>Invalid User ID</b>")
    return false
  }

  let admins = getAdmins()

  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is already an admin.</b>")
    return false
  }

  admins.push(id)
  setAdmins(admins)

  send(
    user.telegramid,
    "✅ <b>Admin Added Successfully</b>\nUser: <code>" + id + "</code>"
  )

  send(
    id,
    "🎉 <b>You have been promoted to Admin!</b>\n" +
    "You now have access to admin-only commands."
  )

  return true
}

/* ============================
        REMOVE ADMIN
============================ */
function removeAdmin(id) {
  if (!onlyAdmin()) return false

  id = parseInt(id)

  if (!id) {
    send(user.telegramid, "⚠️ <b>Invalid User ID</b>")
    return false
  }

  let owner = getOwner()

  if (id === owner) {
    send(user.telegramid, "❌ <b>You cannot remove the Owner.</b>")
    return false
  }

  let admins = getAdmins()

  if (!admins.includes(id)) {
    send(user.telegramid, "⚠️ <b>User is not an admin.</b>")
    return false
  }

  admins = admins.filter(a => a !== id)
  setAdmins(admins)

  send(
    user.telegramid,
    "🗑 <b>Admin Removed</b>\nUser: <code>" + id + "</code>"
  )

  send(id, "⚠️ <b>You have been removed from Admin role.</b>")

  return true
}

/* ============================
        ADMIN LIST
============================ */
function showAdminList() {
  let owner = getOwner()

  if (!owner) {
    send(
      user.telegramid,
      "⚠️ <b>Admin system not initialized.</b>\nRun:\n<code>Libs.UtilityLib.setupOwner()</code>"
    )
    return
  }

  let admins = getAdmins()

  if (admins.length === 0) {
    send(user.telegramid, "⚠️ <b>No admins found.</b>")
    return
  }

  let msg = "👮 <b>Admins List</b>\n\n"

  let ownerCount = 0
  let adminCount = 0
  let index = 1

  admins.forEach(id => {

    let role = ""
    if (id === owner) {
      role = " (<b>Owner</b>)"
      ownerCount++
    } else {
      role = " (<i>Admin</i> by Owner)"
      adminCount++
    }

    msg += `${index}. <code>${id}</code>${role}\n`
    index++
  })

  msg += `\n<b>Total:</b> ${admins.length} | <b>Owner:</b> ${ownerCount} | <b>Admins:</b> ${adminCount}`

  send(user.telegramid, msg)
}

/* ============================
           PING
============================ */
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

/* ============================
        ITERATION (ORIGINAL)
============================ */
function iteration() {
  const d = iteration_quota
  if (!d) {
    send(request.chat.id, "<b>❌ Unable to load iteration quota.</b>")
    return
  }

  const BAR = 25, FULL = "█", EMPTY = "░"

  let used = d.progress || 0
  let limit = d.limit || 1
  let pct = ((used / limit) * 100).toFixed(2)
  let fill = Math.round((pct / 100) * BAR)
  let bar = `[ ${FULL.repeat(fill)}${EMPTY.repeat(BAR - fill)} ]`

  function fmt(t) {
    try { return new Date(t).toLocaleString() }
    catch { return t }
  }

  let msg =
    `⚙️ <b>BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${d.id}</code>\n` +
    `<b>Type:</b> <code>${d.quotum_type?.name}</code>\n` +
    `<b>Base Limit:</b> <code>${d.quotum_type?.base_limit}</code>\n` +
    `<b>Has Ads Plan:</b> <code>${d.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${d.extra_points}</code>\n\n` +
    `<b>Limit:</b> <code>${limit}</code>\n` +
    `<b>Used:</b> <code>${used}</code>\n` +
    `<b>Usage:</b> <code>${pct}%</code>\n\n` +
    `${bar}\n\n` +
    `<b>Started:</b> ${fmt(d.started_at)}\n` +
    `<b>Ends:</b> ${fmt(d.ended_at)}`

  send(request.chat.id, msg)
}

/* ============================
        EXPORT PUBLIC API
============================ */
publish({
  ping: ping,
  iteration: iteration,

  setupOwner: setupOwner,
  onlyAdmin: onlyAdmin,

  addAdmin: addAdmin,
  removeAdmin: removeAdmin,

  adminList: getAdmins,
  showAdminList: showAdminList,

  owner: getOwner
})
