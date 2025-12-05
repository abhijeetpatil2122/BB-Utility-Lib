/*
 * Utility Library — Clean Production Version
 * Features:
 *   ping()           — latency check
 *   iteration()      — exact BB iteration quota display
 *   setupOwner()     — first-time owner setup
 *   onlyAdmin()      — admin-only gate (no throw)
 *   addAdmin()       — add admin + messages
 *   removeAdmin()    — remove admin + messages
 *   adminList()      — raw list
 *   showAdminList()  — formatted list
*/

let LIB = "UtilityLib_"

const OWNER_KEY = LIB + "owner"
const ADMINS_KEY = LIB + "admins"

// simple wrapper
function send(to, text) {
  Api.sendMessage({ chat_id: to, text: text, parse_mode: "HTML" })
}

function getAdmins() {
  return Bot.getProperty(ADMINS_KEY) || []
}

function setAdmins(list) {
  Bot.setProperty(ADMINS_KEY, list, "json")
}

function getOwner() {
  return Bot.getProperty(OWNER_KEY)
}

/* ======================================
   OWNER SETUP — FIRST RUN REQUIRED
====================================== */
function setupOwner() {
  let owner = getOwner()

  if (owner) {
    send(user.telegramid, `ℹ️ Owner already set: <code>${owner}</code>`)
    return true
  }

  Bot.setProperty(OWNER_KEY, user.telegramid, "integer")
  Bot.setProperty(ADMINS_KEY, [user.telegramid], "json")

  send(user.telegramid, "🎉 <b>You are now the bot owner & first admin.</b>")
  return true
}

/* ======================================
   ADMIN CHECK — CLEAN RETURN, NO THROW
====================================== */
function onlyAdmin() {
  let admins = getAdmins()

  if (!admins.includes(user.telegramid)) {
    send(user.telegramid, "❌ <b>You are not an admin.</b>")
    return false
  }

  return true
}

/* ======================================
            ADD ADMIN
====================================== */
function addAdmin(id) {
  if (!onlyAdmin()) return false

  id = parseInt(id)
  if (!id) {
    send(user.telegramid, "⚠️ Invalid user ID.")
    return false
  }

  let admins = getAdmins()

  if (admins.includes(id)) {
    send(user.telegramid, "⚠️ User is already an admin.")
    return false
  }

  admins.push(id)
  setAdmins(admins)

  send(user.telegramid, `✅ Added admin: <code>${id}</code>`)
  send(id, `🎉 <b>You are now an admin!</b>`)

  return true
}

/* ======================================
            REMOVE ADMIN
====================================== */
function removeAdmin(id) {
  if (!onlyAdmin()) return false

  id = parseInt(id)
  if (!id) {
    send(user.telegramid, "⚠️ Invalid user ID.")
    return false
  }

  let owner = getOwner()
  if (id === owner) {
    send(user.telegramid, "❌ Cannot remove the bot owner.")
    return false
  }

  let admins = getAdmins()

  if (!admins.includes(id)) {
    send(user.telegramid, "⚠️ User is not an admin.")
    return false
  }

  admins = admins.filter(a => a !== id)
  setAdmins(admins)

  send(user.telegramid, `🗑 Removed admin: <code>${id}</code>`)
  send(id, `⚠️ <b>You are no longer an admin.</b>`)

  return true
}

/* ======================================
              SHOW ADMIN LIST
====================================== */
function showAdminList() {
  let admins = getAdmins()
  let owner = getOwner()

  if (!owner) {
    send(user.telegramid, "⚠️ No owner set. Run /setupowner first.")
    return
  }

  if (admins.length === 0) {
    send(user.telegramid, "⚠️ No admins found.")
    return
  }

  let txt = "👮 <b>Admins List</b>\n\n"
  let n = 1

  admins.forEach(id => {
    let tag = id === owner ? " (Owner)" : ""
    txt += `${n}. <code>${id}</code>${tag}\n`
    n++
  })

  txt += `\n<b>Total:</b> ${admins.length}`

  send(user.telegramid, txt)
}

/* ======================================
                PING TEST
====================================== */
function ping() {
  if (options?.result) {
    let latency = Date.now() - options.bb_options.start

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

/* ======================================
        ITERATION — ORIGINAL FORMAT
====================================== */
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
    `⚙️ BB Iteration Quota\n\n` +
    `ID: ${d.id}\n` +
    `Type: ${d.quotum_type?.name}\n` +
    `Base Limit: ${d.quotum_type?.base_limit}\n` +
    `Has Ads Plan: ${d.have_ads}\n` +
    `Extra Points: ${d.extra_points}\n\n` +
    `Limit: ${limit}\n` +
    `Used: ${used}\n` +
    `Usage: ${pct}%\n\n` +
    `${bar}\n\n` +
    `Started: ${fmt(d.started_at)}\n` +
    `Ends: ${fmt(d.ended_at)}`

  send(request.chat.id, msg)
}

/* ======================================
               EXPORT
====================================== */
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
