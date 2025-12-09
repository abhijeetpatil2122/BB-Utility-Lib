/*
 * UtilityMC — Minimal Membership Checker Library (updated)
 * - Dev builds their own UI
 * - checkJoin triggers callbacks with useful options
 */

const MC_PREFIX = "UtilityMC_";
const MC_PANEL  = MC_PREFIX + "panel";

/* -------------------------
   Admin panel setup
   ------------------------- */
function setupMC() {
  const panel = {
    title: "Membership Checker",
    description: "Set channels & callback commands for membership checks",
    icon: "person-add",
    fields: [
      { name: "channels", type: "string", title: "Channels", placeholder: "@chan1, -1001234", icon: "chatbubbles" },
      { name: "onJoined", type: "string", title: "Callback: On Joined (ANY)", placeholder: "/onJoined", icon: "checkmark" },
      { name: "onNotJoined", type: "string", title: "Callback: On Missing (ANY)", placeholder: "/onNotJoined", icon: "warning" },
      { name: "onAllJoined", type: "string", title: "Callback: On All Joined", placeholder: "/onAllJoined", icon: "happy" },
      { name: "onError", type: "string", title: "Callback: On Error", placeholder: "/onError", icon: "bug" }
    ]
  };

  AdminPanel.setPanel({ panel_name: MC_PANEL, data: panel });
  Bot.sendMessage("✅ Membership Checker panel installed.");
}

function getSettings() {
  return AdminPanel.getPanelValues(MC_PANEL) || {};
}

function normalizeChannel(ch) {
  if (!ch && ch !== 0) return null;
  ch = String(ch).trim();
  if (ch === "") return null;
  // accept @username or -100... IDs or plain numeric (best-effort)
  return ch;
}

/* -------------------------
   Helper: get channels array from panel
   (dev may ignore this and build UI themselves)
   ------------------------- */
function getChannelListFromPanel() {
  const s = getSettings();
  if (!s.channels) return [];
  return s.channels.split(",").map(c => normalizeChannel(c.trim())).filter(Boolean);
}

/* -------------------------
   checkJoin() — dispatch checks for panel channels
   Developer can call this or use checkJoinSingle(channel) for custom flows
   ------------------------- */
function checkJoin() {
  const channels = getChannelListFromPanel();
  if (!channels || channels.length === 0) {
    Bot.sendMessage("⚠️ No channels configured in Admin Panel.");
    return false;
  }

  const runId = MC_PREFIX + "run_" + Date.now() + "_" + Math.floor(Math.random()*9999);
  const state = { total: channels.length, done: 0, results: {}, runId: runId, settings: getSettings() };

  // store run state
  User.setProperty(runId, state, "json");

  channels.forEach(ch => {
    const encoded = encodeURIComponent(ch);
    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: MC_PREFIX + "onRes " + runId + " " + encoded,
      on_error:  MC_PREFIX + "onErr " + runId + " " + encoded
    });
  });

  return true;
}

/* -------------------------
   checkJoinSingle(channel) — allow dev to call check for a single channel
   Useful if dev provides custom list or button per channel
   ------------------------- */
function checkJoinSingle(rawChannel) {
  const channel = normalizeChannel(rawChannel);
  if (!channel) {
    Bot.sendMessage("⚠️ Invalid channel.");
    return false;
  }
  const runId = MC_PREFIX + "run_single_" + Date.now() + "_" + Math.floor(Math.random()*9999);
  const state = { total: 1, done: 0, results: {}, runId: runId, settings: getSettings() };
  User.setProperty(runId, state, "json");

  const encoded = encodeURIComponent(channel);
  Api.getChatMember({
    chat_id: channel,
    user_id: user.telegramid,
    on_result: MC_PREFIX + "onRes " + runId + " " + encoded,
    on_error:  MC_PREFIX + "onErr " + runId + " " + encoded
  });

  return true;
}

/* -------------------------
   HANDLERS for getChatMember results
   (they accumulate results then finalize)
   ------------------------- */
function onResHandler() {
  // params: "<runId> <encodedChannel>"
  const parts = params.split(" ");
  const runId = parts[0];
  const channel = decodeURIComponent(parts.slice(1).join(" "));

  try {
    const result = options.result || options;
    // Telegram shape may be result or result.result — we check both
    const status = result.status || (result.result && result.result.status) || null;
    const ok = ["member", "administrator", "creator"].includes(status);

    let state = User.getProperty(runId) || null;
    if (!state) state = { total: 1, done: 0, results: {}, runId: runId, settings: getSettings() };

    state.results[channel] = { ok: !!ok, status: status, raw: result };
    state.done = Object.keys(state.results).length;
    User.setProperty(runId, state, "json");

    // finalize if done
    if (state.done >= state.total) finalizeRun(runId, state);
  } catch (e) {
    // On handler error -> call onError callback if configured
    const s = getSettings();
    if (s.onError) Bot.run({ command: s.onError, options: { runId: runId, channel: channel, error: String(e), raw: options } });
    // still store that channel as not ok
    let state = User.getProperty(runId) || { total:1, done:0, results:{}, runId: runId, settings: getSettings() };
    state.results[channel] = { ok: false, error: String(e) };
    state.done = Object.keys(state.results).length;
    User.setProperty(runId, state, "json");
    if (state.done >= state.total) finalizeRun(runId, state);
  }
}
on(MC_PREFIX + "onRes", onResHandler);

function onErrHandler() {
  const parts = params.split(" ");
  const runId = parts[0];
  const channel = decodeURIComponent(parts.slice(1).join(" "));

  const s = getSettings();

  let state = User.getProperty(runId) || { total:1, done:0, results:{}, runId: runId, settings: getSettings() };
  state.results[channel] = { ok: false, error: options || "error" };
  state.done = Object.keys(state.results).length;
  User.setProperty(runId, state, "json");

  // call onError callback (if set)
  if (s.onError) {
    Bot.run({ command: s.onError, options: { runId: runId, channel: channel, error: options } });
  }

  if (state.done >= state.total) finalizeRun(runId, state);
}
on(MC_PREFIX + "onErr", onErrHandler);

/* -------------------------
   finalizeRun: call developer callbacks with OPTIONS
   options object will include:
     - runId
     - results: { channel: { ok: boolean, status?, raw?, error? }, ... }
     - settings: admin panel values
   ------------------------- */
function finalizeRun(runId, state) {
  if (!state) state = User.getProperty(runId) || null;
  if (!state) return;

  const s = state.settings || getSettings();
  const results = state.results || {};
  const allOk = Object.values(results).length > 0 && Object.values(results).every(r => r.ok === true);
  const anyJoined = Object.values(results).some(r => r.ok === true);

  const cbOptions = { runId: runId, results: results, settings: s };

  if (allOk) {
    if (s.onAllJoined) Bot.run({ command: s.onAllJoined, options: cbOptions });
  } else {
    if (!anyJoined) {
      if (s.onNotJoined) Bot.run({ command: s.onNotJoined, options: cbOptions });
    } else {
      // some joined, some missing
      if (s.onJoined) Bot.run({ command: s.onJoined, options: cbOptions });
    }
  }

  // cleanup temporary prop
  User.setProperty(runId, null);
}

/* -------------------------
   Export
   ------------------------- */
publish({
  setupMC: setupMC,
  checkJoin: checkJoin,
  checkJoinSingle: checkJoinSingle,
  requireJoin: function(){ 
    // boolean convenience function based on latest per-channel cache (optional)
    // Not implemented robustly here — dev should use checkJoin & callbacks ideally.
    return false;
  }
});
