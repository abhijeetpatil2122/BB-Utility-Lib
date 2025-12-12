/*
 * SimpleMC — Sequential Membership Checker (BB Compatible)
 * Version: v2 — Admin Panel + Callbacks + isMember()
 */

const PREFIX = "SimpleMC_";
const SESSION_KEY = PREFIX + "session";
const MAX_CH = 10;

/* ---------------- ADMIN PANEL ---------------- */

function setup() {
  const panel = {
    title: "Simple Membership Checker",
    description: "Set channels & callbacks for SimpleMC",
    icon: "person-add",

    fields: [
      {
        name: "public",
        title: "Public Channels",
        description: "Comma separated: @ch1, @ch2",
        type: "string",
        placeholder: "@channel1, @channel2",
        icon: "chatbubbles"
      },
      {
        name: "private",
        title: "Private Channels",
        description: "Format: id=link, id=link",
        type: "string",
        placeholder: "-1001000=https://t.me/+abc",
        icon: "lock-closed"
      },
      {
        name: "success",
        title: "Success Callback",
        type: "string",
        placeholder: "/menu",
        icon: "checkmark"
      },
      {
        name: "fail",
        title: "Fail Callback",
        type: "string",
        placeholder: "/start",
        icon: "close"
      }
    ]
  };

  AdminPanel.setPanel({
    panel_name: "SimpleMC",
    data: panel
  });

  Bot.sendMessage("SimpleMC Panel Installed.");
}

function getPanel() {
  return AdminPanel.getPanelValues("SimpleMC") || {};
}

/* ---------------- CHANNEL PARSER ---------------- */

function parseChannels() {
  const cfg = getPanel();
  let out = [];

  // public
  if (cfg.public) {
    cfg.public.split(",").forEach(v => {
      v = v.trim();
      if (v) out.push({ id: v, link: "https://t.me/" + v.replace("@", "") });
    });
  }

  // private
  if (cfg.private) {
    cfg.private.split(",").forEach(v => {
      v = v.trim();
      if (!v) return;
      const parts = v.split("=");
      const id = parts[0];
      const link = parts[1] || "";
      out.push({ id: id, link: link });
    });
  }

  if (out.length > MAX_CH) {
    throw new Error("[SimpleMC] Max 10 channels allowed.");
  }

  return out;
}

/* ---------------- HELPER: FINAL RESULT BUILDER ---------------- */

function buildResult(results, channels, passed) {
  let joined = [];
  let left = [];
  let invalid = [];
  let details = [];

  channels.forEach(ch => {
    let r = results[ch.id];
    if (!r) {
      invalid.push(ch);
      return;
    }

    details.push(r);

    if (r.api_error) {
      invalid.push(ch);
      return;
    }

    const st = r.status;
    if (["member", "administrator", "creator"].includes(st)) {
      joined.push(ch);
    } else {
      left.push(ch);
    }
  });

  return {
    joined: joined,
    missing: left.concat(invalid),
    invalid: invalid,
    left: left,

    details: details,

    all_joined: (left.length === 0 && invalid.length === 0),

    multiple: channels.length > 1,
    channels: channels,

    passed: passed || {},
    forced: false
  };
}

/* ---------------- PUBLIC API ---------------- */

function mcCheck(passed) {
  const cfg = getPanel();
  if (!cfg.success || !cfg.fail) {
    throw new Error("[SimpleMC] Please set success & fail callback in Panel.");
  }

  const channels = parseChannels();
  if (channels.length === 0) throw new Error("[SimpleMC] No channels set.");

  const token = PREFIX + Date.now() + "_" + Math.floor(Math.random() * 9999);

  const session = {
    token: token,
    list: channels,
    index: 0,
    results: {},
    success: cfg.success,
    fail: cfg.fail,
    passed: passed || {}
  };

  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({
    command: PREFIX + "next",
    options: { token: token },
    run_after: 0.05
  });
}

function mcGetChats() {
  return parseChannels();
}

function mcGetMissing() {
  const session = User.getProperty(SESSION_KEY);
  if (!session) return [];
  let out = [];
  Object.keys(session.results).forEach(c => {
    let r = session.results[c];
    if (!r.ok) out.push(c);
  });
  return out;
}

/* ---------------- isMember() ---------------- */

function isMember() {
  const session = User.getProperty(SESSION_KEY);

  // No session => we must check
  if (!session) {
    mcCheck({ forced: true });
    return false;
  }

  // If any cached result says not joined ⇒ fail immediately
  const channels = parseChannels();
  for (let ch of channels) {
    const r = session.results[ch.id];
    if (!r || !r.ok) {
      mcCheck({ forced: true });
      return false;
    }
  }

  return true;
}

/* ---------------- ENGINE: NEXT STEP ---------------- */

function next() {
  const opt = options || {};
  const token = opt.token;

  const session = User.getProperty(SESSION_KEY);
  if (!session || session.token !== token) return;

  const idx = session.index;
  const list = session.list;

  if (idx >= list.length) return finalize();

  const ch = list[idx].id;

  Api.getChatMember({
    chat_id: ch,
    user_id: user.telegramid,
    on_result: PREFIX + "one",
    on_error: PREFIX + "err",
    bb_options: { token: token, ch: ch }
  });
}

function one() {
  const bb = options.bb_options;
  if (!bb) return;

  const session = User.getProperty(SESSION_KEY);
  if (!session || session.token !== bb.token) return;

  const st = options.result?.status || null;

  session.results[bb.ch] = {
    channel: bb.ch,
    ok: ["member", "administrator", "creator"].includes(st),
    status: st,
    api_error: null,
    source: "fresh"
  };

  session.index++;
  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({ command: PREFIX + "next", options: { token: bb.token }, run_after: 0.05 });
}

function err() {
  const bb = options.bb_options;
  if (!bb) return;

  const session = User.getProperty(SESSION_KEY);
  if (!session || session.token !== bb.token) return;

  session.results[bb.ch] = {
    channel: bb.ch,
    ok: false,
    status: null,
    api_error: options || {},
    source: "fresh"
  };

  session.index++;
  User.setProperty(SESSION_KEY, session, "json");

  Bot.run({ command: PREFIX + "next", options: { token: bb.token }, run_after: 0.05 });
}

/* ---------------- FINALIZE ---------------- */

function finalize() {
  const session = User.getProperty(SESSION_KEY);
  if (!session) return;

  const result = buildResult(session.results, session.list, session.passed);

  User.setProperty(SESSION_KEY, null);

  const cmd = result.all_joined ? session.success : session.fail;

  Bot.run({
    command: cmd,
    options: result
  });
}

/* ---------------- EXPORT ---------------- */
publish({
  mcSetup: setup,
  mcCheck: mcCheck,
  mcGetChats: mcGetChats,
  mcGetMissing: mcGetMissing,
  isMember: isMember
});

on(PREFIX + "next", next);
on(PREFIX + "one", one);
on(PREFIX + "err", err);
