/*
 * SimpleMC v2.1 — Final fixes
 * - Admin panel included (panel name: "SimpleMC")
 * - Exports: mcSetup, mcCheck, mcGetChats, mcGetMissing, isMember
 * - Sequential checking, no async/await, max 10 channels
 */

const PREFIX = "SimpleMC_";
const SESSION_KEY = PREFIX + "session";
const STATES_KEY = PREFIX + "states";
const PANEL_NAME = "SimpleMC";
const MAX_CH = 10;
const STAGGER = 0.1;

/* ---------------- Admin Panel Setup ---------------- */
function mcSetup() {
  const panel = {
    title: "Simple Membership Checker",
    description: "Configure public usernames, private id=link and callbacks",
    icon: "person-add",
    fields: [
      { name: "public", title: "Public Channels", type: "string", placeholder: "@ParadoxBackup, @Other", icon: "globe" },
      { name: "private", title: "Private Channels (id=link)", type: "string", placeholder: "-100123=https://t.me/+invite", icon: "lock-closed" },
      { name: "success", title: "Success Callback", type: "string", placeholder: "/menu", icon: "checkmark" },
      { name: "fail", title: "Fail Callback", type: "string", placeholder: "/start", icon: "warning" }
    ]
  };

  AdminPanel.setPanel({ panel_name: PANEL_NAME, data: panel });
  Bot.sendMessage("SimpleMC: Admin Panel created. Open Admin Panel > SimpleMC and fill fields.");
}

/* ---------------- Helpers ---------------- */
function _getPanel() {
  return AdminPanel.getPanelValues(PANEL_NAME) || {};
}

function _parseChannelsFromPanel() {
  const cfg = _getPanel();
  const out = [];

  if (cfg.public) {
    cfg.public.split(",").forEach(s => {
      s = s.trim();
      if (!s) return;
      out.push({ id: s, join_link: "https://t.me/" + s.replace(/^@/, "") });
    });
  }

  if (cfg.private) {
    cfg.private.split(",").forEach(s => {
      s = s.trim();
      if (!s) return;
      const parts = s.split("=");
      const id = parts[0].trim();
      const link = (parts[1] || "").trim();
      out.push({ id: id, join_link: link || null });
    });
  }

  if (out.length > MAX_CH) {
    throw new Error("[SimpleMC] Max " + MAX_CH + " channels allowed.");
  }
  return out;
}

function _getStates() { return User.getProperty(STATES_KEY) || {}; }
function _saveStates(obj) { User.setProperty(STATES_KEY, obj, "json"); }

/* resultsMap: { "<id>": { ok:bool, status:string|null, api_error:null|obj, source:"fresh"|"cached" } } */
function _buildPayload(resultsMap, channels, passed) {
  const joined = [], missing = [], invalid = [], details = [];

  channels.forEach(ch => {
    const r = resultsMap[ch.id] || { ok: false, status: null, api_error: null, source: "fresh" };
    details.push(Object.assign({ id: ch.id, join_link: ch.join_link }, r));
    if (r.api_error) invalid.push({ id: ch.id, join_link: ch.join_link, api_error: r.api_error });
    else if (["member", "administrator", "creator"].includes(r.status)) joined.push({ id: ch.id, join_link: ch.join_link, tg_status: r.status, source: r.source });
    else missing.push({ id: ch.id, join_link: ch.join_link, tg_status: r.status, source: r.source });
  });

  return {
    joined: joined,
    missing: missing,
    invalid: invalid,
    details: details,
    all_joined: (missing.length === 0 && invalid.length === 0),
    multiple: channels.length > 1,
    channels: channels,
    passed: passed || {},
    forced: !!(passed && passed.forced)
  };
}

/* ---------------- Public API: mcCheck ----------------
   Mode A: always re-check all channels sequentially
   Usage: Libs.SimpleMC.mcCheck({ any: "data" })
   Panel must contain success & fail callback names.
*/
function mcCheck(passedOptions) {
  const panel = _getPanel();
  if (!panel) throw new Error("[SimpleMC] Admin Panel not found. Run /setupMC and configure.");
  if (!panel.success || !panel.fail) throw new Error("[SimpleMC] Please set success and fail callbacks in Admin Panel.");

  const channels = _parseChannelsFromPanel();
  if (!channels || channels.length === 0) throw new Error("[SimpleMC] No channels configured in Admin Panel.");

  const token = PREFIX + "t" + Date.now() + "_" + Math.floor(Math.random() * 9999);
  const session = {
    token: token,
    channels: channels,
    index: 0,
    results: {},
    passed: passedOptions || {}
  };

  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({ command: PREFIX + "checkNext", options: { token: token }, run_after: 0.01 });
}

/* exact old-name compatibility */
function mcGetChats() { return _parseChannelsFromPanel(); }
function mcGetMissing() {
  const states = _getStates();
  const list = [];
  const chs = _parseChannelsFromPanel();
  chs.forEach(ch => { if (!states[ch.id]) list.push(ch.id); });
  return list;
}

/* ---------------- isMember (hybrid strict) ----------------
   - If any cached false => run fail callback immediately and return false
   - Else => force fresh mcCheck({ forced: true }) and return false
   - Never returns true unless fresh check passed
*/
function isMember() {
  const panel = _getPanel();
  if (!panel) { Bot.sendMessage("[SimpleMC] Panel not found. Run /setupMC"); return false; }
  const channels = _parseChannelsFromPanel();
  if (channels.length === 0) { Bot.sendMessage("[SimpleMC] No channels configured."); return false; }

  const states = _getStates();
  const cachedMissing = channels.filter(ch => states[ch.id] === false);
  if (cachedMissing.length > 0) {
    // Build cached payload and call fail
    const resultsMap = {};
    channels.forEach(ch => { resultsMap[ch.id] = { ok: !!states[ch.id], status: states[ch.id] ? "member" : "left", api_error: null, source: "cached" }; });
    const payload = _buildPayload(resultsMap, channels, {});
    try { Bot.run({ command: panel.fail, options: payload }); } catch (e) { throw new Error("[SimpleMC] isMember fail run error: " + (e && e.message)); }
    return false;
  }

  // Force fresh check
  mcCheck({ forced: true });
  return false;
}

/* ---------------- Sequential engine handlers ---------------- */

function SimpleMC_checkNext() {
  try {
    const opt = options || {};
    const token = opt.token;
    if (!token) return;

    const session = User.getProperty(SESSION_KEY);
    if (!session || session.token !== token) return;

    const idx = session.index || 0;
    const list = session.channels || [];

    if (idx >= list.length) {
      return SimpleMC_finalize();
    }

    const ch = list[idx].id;

    Api.getChatMember({
      chat_id: ch,
      user_id: user.telegramid,
      on_result: PREFIX + "onOne",
      on_error: PREFIX + "onErr",
      bb_options: { token: token, ch: ch }
    });

  } catch (e) {
    throw new Error("[SimpleMC] checkNext error: " + (e && e.message));
  }
}

function SimpleMC_onOne() {
  const bb = options.bb_options;
  if (!bb) return;
  const token = bb.token;
  const ch = bb.ch;

  const session = User.getProperty(SESSION_KEY);
  if (!session || session.token !== token) return;

  const status = options.result?.status || null;
  const ok = ["member", "administrator", "creator"].includes(status);

  session.results[ch] = { ok: !!ok, status: status, api_error: null, source: "fresh" };
  session.index = (session.index || 0) + 1;
  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({ command: PREFIX + "checkNext", options: { token: token }, run_after: STAGGER });
}

function SimpleMC_onErr() {
  const bb = options.bb_options;
  if (!bb) return;
  const token = bb.token;
  const ch = bb.ch;

  const session = User.getProperty(SESSION_KEY);
  if (!session || session.token !== token) return;

  session.results[ch] = { ok: false, status: null, api_error: options || {}, source: "fresh" };
  session.index = (session.index || 0) + 1;
  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({ command: PREFIX + "checkNext", options: { token: token }, run_after: STAGGER });
}

function SimpleMC_finalize() {
  const session = User.getProperty(SESSION_KEY);
  if (!session) return;

  const panel = _getPanel();
  const payload = _buildPayload(session.results, session.channels, session.passed);

  // persist definitive fresh states (skip channels with api_error)
  const persistent = _getStates();
  Object.keys(session.results).forEach(chId => {
    const r = session.results[chId];
    if (r && !r.api_error) persistent[chId] = !!r.ok;
  });
  _saveStates(persistent);

  User.setProperty(SESSION_KEY, null);

  try {
    if (payload.all_joined) Bot.run({ command: panel.success, options: payload });
    else Bot.run({ command: panel.fail, options: payload });
  } catch (e) {
    throw new Error("[SimpleMC] finalize run error: " + (e && e.message));
  }
}

/* ---------------- publish & handlers ---------------- */
publish({
  mcSetup: mcSetup,
  mcCheck: mcCheck,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing,
  isMember: isMember
});

on(PREFIX + "checkNext", SimpleMC_checkNext);
on(PREFIX + "onOne", SimpleMC_onOne);
on(PREFIX + "onErr", SimpleMC_onErr);
on(PREFIX + "finalize", SimpleMC_finalize);
