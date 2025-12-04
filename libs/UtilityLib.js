/*
 *  Utility Library (Production Version)
 *  Contains:
 *   1) ping()       — latency measurement helper
 *   2) iteration()  — advanced BB iteration quota display
 */

let LIB = "UtilityLib_";

/* ============================================
   1️⃣ PING — latency measurement
============================================ */
function ping() {
  if (options?.result) {
    const latency = Date.now() - options.bb_options.start;

    Api.editMessageText({
      chat_id: options.result.chat.id,
      message_id: options.result.message_id,
      text: `🏓 *${latency} ms*`,
      parse_mode: "Markdown"
    });
    return;
  }

  Api.sendMessage({
    chat_id: request.chat.id,
    text: "*Ping…*",
    parse_mode: "Markdown",
    bb_options: { start: Date.now() },
    on_result: LIB + "onPing"
  });
}

on(LIB + "onPing", ping);

/* ============================================
   2️⃣ ADVANCED BB ITERATION QUOTA
============================================ */
function iteration() {
  const data = iteration_quota;   // BB built-in system object

  if (!data) {
    Api.sendMessage({
      chat_id: request.chat.id,
      text: "<b>❌ Unable to load iteration quota.</b>",
      parse_mode: "HTML"
    });
    return;
  }

  /* PROGRESS BAR */
  const BAR = 25,
        FULL = "█",
        EMPTY = "░";

  let used  = data.progress || 0;
  let limit = data.limit    || 1;

  let pct = ((used / limit) * 100).toFixed(2);
  let filled = Math.round((pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(filled)}${EMPTY.repeat(BAR - filled)} ]`;

  /* FORMAT DATES */
  function fmt(str) {
    if (!str) return "N/A";
    try {
      return new Date(str).toLocaleString();
    } catch (e) {
      return str;
    }
  }

  let txt =
    `<b>⚙️ BB Iteration Quota</b>\n\n` +
    `<b>ID:</b> <code>${data.id}</code>\n` +
    `<b>Type:</b> <code>${data.quotum_type?.name || "Unknown"}</code>\n` +
    `<b>Base Limit:</b> <code>${data.quotum_type?.base_limit || "?"}</code>\n` +
    `<b>Has Ads Plan:</b> <code>${data.have_ads}</code>\n` +
    `<b>Extra Points:</b> <code>${data.extra_points}</code>\n\n` +

    `<b>Limit:</b> <code>${limit}</code>\n` +
    `<b>Used:</b> <code>${used}</code>\n` +
    `<b>Usage:</b> <code>${pct}%</code>\n\n` +

    `${bar}\n\n` +

    `<b>Started:</b> <code>${fmt(data.started_at)}</code>\n` +
    `<b>Ends:</b> <code>${fmt(data.ended_at)}</code>`;

  Api.sendMessage({
    chat_id: request.chat.id,
    text: txt,
    parse_mode: "HTML"
  });
}

/* ============================================
   EXPORT FUNCTIONS
============================================ */
publish({
  ping: ping,
  iteration: iteration
});
