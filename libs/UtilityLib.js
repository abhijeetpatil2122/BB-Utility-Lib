/*
 *  Utility Library (Production Version)
 *  Contains:
 *   1) ping()     — latency measurement helper
 *   2) iteration() — BB iteration quota display
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

// Capture callback
on(LIB + "onPing", ping);

/* ============================================
   2️⃣ BB ITERATION QUOTA
============================================ */
function iteration() {
  const BAR = 25,
        FULL = "█",
        EMPTY = "░";

  let used = iteration_quota.progress || 0;
  let limit = iteration_quota.limit || 1;
  let pct = ((used / limit) * 100).toFixed(2);

  let filled = Math.round((pct / 100) * BAR);
  let bar = `[ ${FULL.repeat(filled)}${EMPTY.repeat(BAR - filled)} ]`;

  let msg =
    `<b>⚙️ BB Iteration Quota</b>\n\n` +
    `• <b>Total:</b> <code>${limit}</code>\n` +
    `• <b>Used:</b> <code>${used}</code>\n` +
    `• <b>Usage:</b> <code>${pct}%</code>\n\n${bar}`;

  Api.sendMessage({
    chat_id: request.chat.id,
    text: msg,
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
