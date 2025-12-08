/*
 * UtilityLib v7 — Simple Membership Checker
 * No admin panel, no complexity — fast and clean.
 *
 * Methods:
 *   checkJoin(channel, onJoinedCmd, onNotJoinedCmd)
 *   checkJoinAll(channelsArray, onAllJoinedCmd, onNotJoinedCmd)
 *   requireJoin(channel, onNotJoinedCmd)
 */

const LIB = "UtilityLib_v7_";

/* Normalize channel */
function normalize(ch){
  if(!ch) return null;
  ch = String(ch).trim();

  // private id
  if(ch.startsWith("-100")) return ch;

  // number id
  if(/^-?\d+$/.test(ch)) return ch;

  // convert t.me links to @username
  if(ch.includes("t.me/")){
    let p = ch.split("t.me/")[1];
    if(p) return "@" + p.replace(/\/.*/,"");
  }

  // ensure @username format
  if(ch.startsWith("@")) return ch;
  return "@" + ch;
}

/* ============================
   1) SINGLE CHANNEL CHECK
============================ */
function checkJoin(channel, onJoined, onNotJoined){
  let ch = normalize(channel);
  if(!ch){ Bot.sendMessage("❌ Invalid channel"); return false; }

  Api.getChatMember({
    chat_id: ch,
    user_id: user.telegramid,
    on_result: LIB + "onCheck " + encodeURIComponent(ch) + " " + (onJoined||"") + " " + (onNotJoined||"")
  });

  return true;
}

/* handle callback */
function onCheck(){
  let parts = params.split(" ");
  let ch          = decodeURIComponent(parts[0] || "");
  let onJoined    = parts[1] || "";
  let onNotJoined = parts[2] || "";

  let status = options.result?.status;
  let joined = ["member","administrator","creator"].includes(status);

  if(joined){
    if(onJoined) Bot.run({ command: onJoined, options: { channel: ch, result: options } });
  } else {
    if(onNotJoined) Bot.run({ command: onNotJoined, options: { channel: ch, result: options } });
  }
}
on(LIB + "onCheck", onCheck);

/* ============================
   2) MULTIPLE CHANNEL CHECK
============================ */
function checkJoinAll(arr, onAllJoined, onNotJoined){
  if(!Array.isArray(arr) || arr.length === 0){
    Bot.sendMessage("❌ Channels array required");
    return false;
  }

  const runId = LIB + "run_" + Date.now();
  let state = { total: arr.length, ok: 0, done: 0, channels: arr, onAllJoined, onNotJoined };
  User.setProp(runId, state, "json");

  arr.forEach(ch => {
    let n = normalize(ch);
    Api.getChatMember({
      chat_id: n,
      user_id: user.telegramid,
      on_result: LIB + "onCheckAll " + runId + " " + encodeURIComponent(n)
    });
  });

  return true;
}

/* aggregator */
function onCheckAll(){
  let p = params.split(" ");
  let runId = p[0];
  let ch    = decodeURIComponent(p[1] || "");

  let state = User.getProp(runId);
  if(!state) return;

  let status = options.result?.status;
  let joined = ["member","administrator","creator"].includes(status);

  if(joined) state.ok++;
  state.done++;

  User.setProp(runId, state, "json");

  if(state.done >= state.total){
    if(state.ok === state.total){
      if(state.onAllJoined)
        Bot.run({ command: state.onAllJoined, options: { results: state } });
    } else {
      if(state.onNotJoined)
        Bot.run({ command: state.onNotJoined, options: { results: state } });
    }
    User.setProp(runId, null);
  }
}
on(LIB + "onCheckAll", onCheckAll);

/* ============================
   3) requireJoin helper
============================ */
function requireJoin(channel, onFail){
  return checkJoin(channel, undefined, onFail), false;
}

/* ============================
   EXPORT
============================ */
publish({
  checkJoin: checkJoin,
  checkJoinAll: checkJoinAll,
  requireJoin: requireJoin
});
