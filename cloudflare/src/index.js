import { shaHex, hex, unb64url, b64url, randomCode, deriveMachineKey, constantEqual, canonicalSignature, pinDigest, verifyAccessJwt } from "./crypto.js";
import { joinPage, adminPage } from "./pages.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
const error = (code, status = 400) => json({ error: code }, status);
const html = content => new Response(content, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const parseBody = text => { try { const b = text ? JSON.parse(text) : {}; return b && typeof b === "object" && !Array.isArray(b) ? b : null; } catch { return null; } };
const bounded = (v, min, max, fallback) => Number.isInteger(v) && v >= min && v <= max ? v : fallback;
const slugOk = s => typeof s === "string" && /^[a-z0-9][a-z0-9-]{2,40}$/.test(s);
const nameOk = s => typeof s === "string" && /^[\p{L}\p{N} _-]{3,24}$/u.test(s.trim());
const profileKey = s => s.trim().normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const eligible = machine => machine && machine.enabled === 1;
const sql = (env, statement, ...params) => env.DB.prepare(statement).bind(...params);
const acceptStatus = e => e && e.state === "active";

async function adminAuthorized(request, env) {
  // The development override is deliberately unavailable in production.
  if (env.APP_MODE === "development" && env.ADMIN_DEV_TOKEN) {
    const authorization = request.headers.get("Authorization");
    if (authorization === "Bearer " + env.ADMIN_DEV_TOKEN) return true;
  }
  return verifyAccessJwt(request, env);
}
async function checkMachine(request, env, raw) {
  if (!env.MACHINE_MASTER_KEY || env.MACHINE_MASTER_KEY.length < 32) return { issue: error("MACHINE_AUTH_NOT_CONFIGURED", 503) };
  const id = request.headers.get("X-Machine-Id") || "";
  const timestamp = request.headers.get("X-Machine-Timestamp") || "";
  const nonce = request.headers.get("X-Machine-Nonce") || "";
  const signature = request.headers.get("X-Machine-Signature") || "";
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^\d{13}$/.test(timestamp) ||
      !/^[A-Za-z0-9_-]{12,128}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(now() - Number(timestamp)) > 300000) return { issue: error("INVALID_MACHINE_SIGNATURE", 401) };
  const machine = await sql(env, "SELECT * FROM machines WHERE id=?", id).first();
  if (!machine) return { issue: error("UNKNOWN_MACHINE", 401) };
  const key = await deriveMachineKey(env.MACHINE_MASTER_KEY, id);
  const expected = hex(await canonicalSignature(key, request, raw, timestamp, nonce));
  if (!constantEqual(Uint8Array.from(signature.match(/../g), x => parseInt(x, 16)), Uint8Array.from(expected.match(/../g), x => parseInt(x, 16)))) return { issue: error("INVALID_MACHINE_SIGNATURE", 401) };
  const inserted = await sql(env, "INSERT OR IGNORE INTO machine_nonces(machine_id,nonce,expires_at) VALUES(?,?,?)", id, nonce, now() + 600000).run();
  if (inserted.meta.changes !== 1) return { issue: error("REPLAYED_REQUEST", 409) };
  await sql(env, "UPDATE machines SET last_seen_at=? WHERE id=?", now(), id).run();
  return { machine };
}
async function leaderboard(env, slug) {
  const event = await sql(env, "SELECT id,name,state FROM events WHERE slug=?", slug).first();
  if (!event) return error("EVENT_NOT_FOUND", 404);
  const rows = await sql(env, `SELECT p.display_name AS name, SUM(s.total_score) AS points, COUNT(*) AS plays
    FROM sessions s JOIN profiles p ON s.profile_id=p.id WHERE s.event_id=?
    GROUP BY p.id ORDER BY points DESC, p.created_at ASC LIMIT 30`, event.id).all();
  return json({ event: { name: event.name, slug, state: event.state }, provisional: true, leaderboard: rows.results });
}
async function machineRoutes(request, env, route, body, machine) {
  if (route === "/api/machine/state" && request.method === "GET") {
    const session = await sql(env, `SELECT s.id,s.credits,s.total_score,p.display_name,s.created_at
      FROM sessions s JOIN profiles p ON s.profile_id=p.id WHERE s.machine_id=? AND s.state='active' LIMIT 1`, machine.id).first();
    const event = await sql(env, "SELECT slug,name,state FROM events WHERE id=?", machine.event_id).first();
    return json({ machine: { id: machine.id, name: machine.name, enabled: !!machine.enabled, command_seq: machine.command_seq, ack_seq: machine.ack_seq }, event, session });
  }
  if (route === "/api/machine/ack" && request.method === "POST") {
    const seq = body && body.command_seq;
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > machine.command_seq) return error("INVALID_COMMAND_SEQUENCE");
    await sql(env, "UPDATE machines SET ack_seq=MAX(ack_seq, ?) WHERE id=?", seq, machine.id).run();
    return json({ acknowledged: seq });
  }
  if (route === "/api/machine/checkins" && request.method === "POST") {
    const event = await sql(env, "SELECT state FROM events WHERE id=?", machine.event_id).first();
    if (!eligible(machine) || !acceptStatus(event)) return error("MACHINE_DISABLED", 423);
    const active = await sql(env, "SELECT id FROM sessions WHERE machine_id=? AND state='active'", machine.id).first();
    if (active) return error("SESSION_ALREADY_ACTIVE", 409);
    const code = randomCode(24), hash = await shaHex(code), expiry = now() + 90000;
    await sql(env, "INSERT INTO checkin_links(token_hash,machine_id,event_id,expires_at) VALUES(?,?,?,?)", hash, machine.id, machine.event_id, expiry).run();
    const url = new URL(request.url);
    return json({ join_url: url.origin + "/join/" + code, expires_at: expiry });
  }
  if (route === "/api/machine/spins" && request.method === "POST") {
    const cost = body && body.cost, sessionId = body && body.session_id;
    if (!eligible(machine)) return error("MACHINE_DISABLED", 423);
    if (![50,150].includes(cost) || typeof sessionId !== "string") return error("INVALID_SPIN_REQUEST");
    await sql(env, "UPDATE spin_tokens SET state='void' WHERE session_id=? AND state='issued' AND expires_at<?", sessionId, now()).run();
    const token = randomCode(24), tokenId = uid(), expiry = now() + 7*86400000;
    try {
      const r = await sql(env, `INSERT INTO spin_tokens(id,session_id,token_hash,cost,expires_at,created_at)
        SELECT ?,s.id,?,?,?,? FROM sessions s JOIN events e ON e.id=s.event_id
        WHERE s.id=? AND s.machine_id=? AND s.state='active' AND s.credits>=? AND e.state='active' AND (SELECT enabled FROM machines WHERE id=s.machine_id)=1`,
        tokenId, await shaHex(token), cost, expiry, now(), sessionId, machine.id, cost).run();
      if (r.meta.changes !== 1) return error("NO_AVAILABLE_CREDIT_OR_SESSION", 409);
    } catch { return error("PENDING_SPIN_EXISTS", 409); }
    return json({ spin_token: token, session_id: sessionId, cost, expires_at: expiry });
  }
  if (route === "/api/machine/scores" && request.method === "POST") {
    const sessionId = body && body.session_id, token = body && body.spin_token, award = body && body.award;
    if (typeof sessionId !== "string" || typeof token !== "string" || token.length > 120 || !Number.isInteger(award) || award < 0) return error("INVALID_SCORE");
    const spin = await sql(env, `SELECT t.*,s.event_id,s.machine_id,e.max_award_per_spin,s.state AS session_state
      FROM spin_tokens t JOIN sessions s ON t.session_id=s.id JOIN events e ON e.id=s.event_id
      WHERE t.token_hash=? AND t.session_id=?`, await shaHex(token), sessionId).first();
    if (!spin || spin.machine_id !== machine.id) return error("SPIN_TOKEN_INVALID", 403);
    const existing = await sql(env, "SELECT award FROM scores WHERE token_id=?", spin.id).first();
    if (existing) return existing.award === award ? json({ accepted: true, duplicate: true }) : error("SCORE_REPLAY_MISMATCH", 409);
    if (spin.state !== "issued" || spin.expires_at < now() || spin.session_state !== "active") return error("SPIN_TOKEN_EXPIRED_OR_USED", 409);
    if (award > spin.max_award_per_spin) return error("AWARD_EXCEEDS_LIMIT", 422);
    const clientHash = typeof body.client_result_hash === "string" && /^[a-f0-9]{64}$/.test(body.client_result_hash) ? body.client_result_hash : null;
    const expectedHash = await shaHex(token + ":" + sessionId + ":" + award + ":" + body.played_at);
    if (clientHash && clientHash !== expectedHash) return error("SCORE_INTEGRITY_MISMATCH", 422);
    const playedAt = Number.isSafeInteger(body.played_at) && body.played_at >= spin.created_at - 300000 && body.played_at <= now() + 300000 ? body.played_at : null;
    if (playedAt === null && env.APP_MODE !== "development") return error("INVALID_PLAY_TIMESTAMP", 422);
    try {
      const results = await env.DB.batch([
        sql(env, "UPDATE spin_tokens SET state='consumed' WHERE id=? AND state='issued' AND expires_at>=?", spin.id, now()),
        sql(env, `INSERT INTO scores(id,token_id,session_id,event_id,machine_id,award,client_result_hash,flagged,played_at,received_at)
          SELECT ?,?,?,?,?,?,?,?,?,? FROM spin_tokens WHERE id=? AND state='consumed'`, uid(), spin.id, sessionId, spin.event_id, machine.id, award, clientHash, award >= Math.min(3000, spin.max_award_per_spin) ? 1 : 0, playedAt, now(), spin.id),
        sql(env, "UPDATE sessions SET credits=credits-?+?,total_score=total_score+? WHERE id=? AND state='active' AND EXISTS(SELECT 1 FROM scores WHERE token_id=?)", spin.cost, award, award, sessionId, spin.id)
      ]);
      if (results.some(r => r.meta.changes !== 1)) return error("SCORE_WRITE_CONFLICT", 409);
    } catch {
      const after = await sql(env, "SELECT award FROM scores WHERE token_id=?", spin.id).first();
      if (after && after.award === award) return json({ accepted: true, duplicate: true });
      return error("SCORE_WRITE_CONFLICT", 409);
    }
    const session = await sql(env, "SELECT credits,total_score FROM sessions WHERE id=?", sessionId).first();
    return json({ accepted: true, duplicate: false, session });
  }
  if (route === "/api/machine/end" && request.method === "POST") {
    const sessionId = body && body.session_id;
    if (typeof sessionId !== "string") return error("INVALID_SESSION");
    await sql(env, "UPDATE spin_tokens SET state='void' WHERE session_id=? AND state='issued' AND expires_at<?", sessionId, now()).run();
    const inFlight = await sql(env, `SELECT t.id FROM spin_tokens t JOIN sessions s ON s.id=t.session_id
      WHERE s.id=? AND s.machine_id=? AND t.state='issued' LIMIT 1`, sessionId, machine.id).first();
    if (inFlight) return error("UNSUBMITTED_SPIN", 409);
    const r = await sql(env, "UPDATE sessions SET state='ended',ended_at=? WHERE id=? AND machine_id=? AND state='active'", now(), sessionId, machine.id).run();
    return r.meta.changes ? json({ ended: true }) : error("ACTIVE_SESSION_NOT_FOUND", 404);
  }
  return error("ROUTE_NOT_FOUND", 404);
}
async function turnstileOk(env, request, body) {
  if (!env.TURNSTILE_SECRET) return env.APP_MODE === "development";
  const challenge = body.turnstile || "";
  if (typeof challenge !== "string" || !challenge) return false;
  const data = new FormData();
  data.set("secret", env.TURNSTILE_SECRET); data.set("response", challenge);
  data.set("remoteip", request.headers.get("CF-Connecting-IP") || "");
  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: data });
  return resp.ok && !!(await resp.json()).success;
}
async function joinRoutes(request, env, path, body) {
  const code = path.split("/").pop() || "";
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(code)) return error("INVALID_QR_LINK", 404);
  const hash = await shaHex(code);
  const link = await sql(env, `SELECT l.*,m.enabled,e.state,e.starting_credits,e.max_sessions_per_profile,e.name AS event_name,m.name AS machine_name
    FROM checkin_links l JOIN machines m ON l.machine_id=m.id JOIN events e ON e.id=l.event_id WHERE l.token_hash=?`, hash).first();
  if (!link || link.expires_at <= now() || link.used_at || !link.enabled || link.state !== "active") return error("QR_LINK_EXPIRED", 410);
  if (request.method === "GET") return json({ event: link.event_name, machine: link.machine_name, expires_at: link.expires_at });
  if (request.method !== "POST" || !body) return error("INVALID_REQUEST");
  if (!env.PROFILE_PEPPER || env.PROFILE_PEPPER.length < 32) return error("PROFILE_SECURITY_NOT_CONFIGURED", 503);
  if (env.APP_MODE !== "development" && (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY)) return error("CHECKIN_SECURITY_NOT_CONFIGURED", 503);
  const nickname = typeof body.name === "string" ? body.name.trim() : "";
  const pin = body.pin;
  if (!nameOk(nickname) || typeof pin !== "string" || !/^\d{6,12}$/.test(pin)) return error("INVALID_NAME_OR_PIN");
  const tries = await sql(env, "UPDATE checkin_links SET attempts=attempts+1 WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND attempts<4", hash, now()).run();
  if (tries.meta.changes !== 1) return error("CHECKIN_ATTEMPT_LIMIT", 429);
  if (!await turnstileOk(env, request, body)) return error("CHECKIN_CHALLENGE_FAILED", 403);
  const key = profileKey(nickname);
  let profile = await sql(env, "SELECT * FROM profiles WHERE event_id=? AND name_key=?", link.event_id, key).first();
  if (profile) {
    if (!constantEqual(new TextEncoder().encode(profile.pin_digest), new TextEncoder().encode(await pinDigest(pin, profile.pin_salt, env.PROFILE_PEPPER || "", link.event_id)))) return error("PROFILE_PIN_INVALID", 403);
  } else {
    const salt = randomCode(16), digest = await pinDigest(pin, salt, env.PROFILE_PEPPER || "", link.event_id);
    await sql(env, "INSERT OR IGNORE INTO profiles(id,event_id,display_name,name_key,pin_salt,pin_digest,created_at) VALUES(?,?,?,?,?,?,?)", uid(), link.event_id, nickname, key, salt, digest, now()).run();
    profile = await sql(env, "SELECT * FROM profiles WHERE event_id=? AND name_key=?", link.event_id, key).first();
    if (!profile || !constantEqual(new TextEncoder().encode(profile.pin_digest), new TextEncoder().encode(digest))) return error("PROFILE_ALREADY_EXISTS", 409);
  }
  const prior = await sql(env, "SELECT COUNT(*) AS count FROM sessions WHERE profile_id=? AND event_id=?", profile.id, link.event_id).first();
  if (prior.count >= link.max_sessions_per_profile) return error("EVENT_SESSION_LIMIT_REACHED", 409);
  const claim = uid(), sessionId = uid();
  try {
    const res = await env.DB.batch([
      sql(env, "UPDATE checkin_links SET used_at=?,claim_id=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?", now(), claim, hash, now()),
      sql(env, `INSERT INTO sessions(id,event_id,machine_id,profile_id,credits,created_at)
        SELECT ?,l.event_id,l.machine_id,?,?,? FROM checkin_links l JOIN machines m ON l.machine_id=m.id
        JOIN events e ON e.id=l.event_id WHERE l.token_hash=? AND l.claim_id=? AND m.enabled=1 AND e.state='active' AND l.expires_at>? AND
        (SELECT COUNT(*) FROM sessions WHERE profile_id=? AND event_id=l.event_id)<e.max_sessions_per_profile`, sessionId, profile.id, link.starting_credits, now(), hash, claim, now(), profile.id)
    ]);
    if (res[0].meta.changes !== 1 || res[1].meta.changes !== 1) return error("QR_LINK_ALREADY_USED", 409);
  } catch { return error("MACHINE_BUSY_OR_LINK_USED", 409); }
  return json({ checked_in: true, name: profile.display_name, event: link.event_name });
}
async function adminRoutes(request, env, path, body, url) {
  if (path === "/api/admin/events" && request.method === "GET") {
    const r = await sql(env, "SELECT * FROM events ORDER BY created_at DESC LIMIT 100").all();
    return json({ events: r.results });
  }
  if (path === "/api/admin/events" && request.method === "POST") {
    if (!body || !slugOk(body.slug) || !nameOk(body.name)) return error("INVALID_EVENT");
    const id = uid(), initial = bounded(body.starting_credits, 0, 50000, 500), limit = bounded(body.max_sessions_per_profile, 1, 100, 1);
    try { await sql(env, `INSERT INTO events(id,slug,name,starting_credits,max_sessions_per_profile,created_at)
      VALUES(?,?,?,?,?,?)`, id, body.slug, body.name.trim(), initial, limit, now()).run(); }
    catch { return error("EVENT_SLUG_EXISTS", 409); }
    return json({ id, slug: body.slug }, 201);
  }
  const eventUpdate = path.match(/^\/api\/admin\/events\/([a-f0-9-]{36})$/);
  if (eventUpdate && request.method === "PATCH") {
    if (!body || !["active", "closed"].includes(body.state)) return error("INVALID_EVENT_STATE");
    const result = await sql(env, "UPDATE events SET state=? WHERE id=?", body.state, eventUpdate[1]).run();
    if (result.meta.changes !== 1) return error("EVENT_NOT_FOUND", 404);
    return json({ event_id: eventUpdate[1], state: body.state });
  }
  if (path === "/api/admin/leaderboard" && request.method === "GET") {
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return error("EVENT_ID_REQUIRED");
    const rows = await sql(env, `SELECT p.display_name,s.total_score,s.credits,s.state,m.name AS machine
      FROM sessions s JOIN profiles p ON p.id=s.profile_id JOIN machines m ON m.id=s.machine_id
      WHERE s.event_id=? ORDER BY s.total_score DESC,s.created_at ASC LIMIT 100`, eventId).all();
    return json({ provisional: true, standings: rows.results });
  }
  if (path === "/api/admin/settings" && request.method === "GET") {
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return error("EVENT_ID_REQUIRED");
    const r = await sql(env, "SELECT key,value FROM event_settings WHERE event_id=? ORDER BY key",eventId).all();
    return json({ settings: Object.fromEntries(r.results.map(x=>[x.key,JSON.parse(x.value)])) });
  }
  if (path === "/api/admin/settings" && request.method === "PATCH") {
    if (!body || typeof body.event_id!=="string" || !["leaderboard_title","theme_slug","privacy_notice"].includes(body.key) ||
        typeof body.value!=="string" || body.value.length>120 || !/^[\\p{L}\\p{N} _.:!?-]*$/u.test(body.value)) return error("INVALID_SETTING");
    const ev=await sql(env,"SELECT id FROM events WHERE id=?",body.event_id).first();
    if(!ev) return error("EVENT_NOT_FOUND",404);
    await sql(env,"INSERT INTO event_settings(event_id,key,value) VALUES(?,?,?) ON CONFLICT(event_id,key) DO UPDATE SET value=excluded.value",
      body.event_id,body.key,JSON.stringify(body.value)).run();
    return json({ saved:true });
  }
  if (path === "/api/admin/machines" && request.method === "GET") {
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return error("EVENT_ID_REQUIRED");
    const r = await sql(env, "SELECT id,event_id,name,enabled,command_seq,ack_seq,last_seen_at FROM machines WHERE event_id=? ORDER BY created_at", eventId).all();
    return json({ machines: r.results });
  }
  if (path === "/api/admin/machines" && request.method === "POST") {
    if (!env.MACHINE_MASTER_KEY || env.MACHINE_MASTER_KEY.length < 32) return error("MACHINE_AUTH_NOT_CONFIGURED", 503);
    if (!body || !nameOk(body.name) || typeof body.event_id !== "string") return error("INVALID_MACHINE");
    const event = await sql(env, "SELECT id FROM events WHERE id=?", body.event_id).first();
    if (!event) return error("EVENT_NOT_FOUND", 404);
    const id = uid();
    await sql(env, "INSERT INTO machines(id,event_id,name,created_at) VALUES(?,?,?,?)", id, event.id, body.name.trim(), now()).run();
    return json({ id, event_id: event.id, machine_key: b64url(await deriveMachineKey(env.MACHINE_MASTER_KEY, id)), provision_once: true }, 201);
  }
  const match = path.match(/^\/api\/admin\/machines\/([a-f0-9-]{36})$/);
  if (match && request.method === "PATCH") {
    if (!body || typeof body.enabled !== "boolean") return error("INVALID_MACHINE_STATE");
    const r = await sql(env, "UPDATE machines SET enabled=?,command_seq=command_seq+CASE WHEN enabled<>? THEN 1 ELSE 0 END WHERE id=?", body.enabled ? 1 : 0, body.enabled ? 1 : 0, match[1]).run();
    if (!r.meta.changes) return error("MACHINE_NOT_FOUND", 404);
    const machine = await sql(env, "SELECT id,enabled,command_seq,ack_seq,last_seen_at FROM machines WHERE id=?", match[1]).first();
    return json({ machine });
  }
  if (path === "/api/admin/scores" && request.method === "GET") {
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return error("EVENT_ID_REQUIRED");
    const r = await sql(env, `SELECT p.display_name,s.award,s.flagged,s.received_at,m.name AS machine
      FROM scores s JOIN sessions se ON se.id=s.session_id JOIN profiles p ON p.id=se.profile_id
      JOIN machines m ON m.id=s.machine_id WHERE s.event_id=?
      ORDER BY s.received_at DESC LIMIT 100`, eventId).all();
    return json({ scores: r.results, provisional: true });
  }
  return error("ROUTE_NOT_FOUND", 404);
}

export default {
  async scheduled(controller, env) {
    const time = now();
    await env.DB.batch([
      sql(env, "DELETE FROM machine_nonces WHERE expires_at<?", time),
      sql(env, "UPDATE spin_tokens SET state='void' WHERE state='issued' AND expires_at<?", time),
      sql(env, "DELETE FROM checkin_links WHERE expires_at<?", time - 7*86400000)
    ]);
  },
  async fetch(request, env) {
    try {
      const url = new URL(request.url), path = url.pathname;
      if (request.method === "OPTIONS") return error("CORS_NOT_ENABLED", 405);
      if (path === "/health" && request.method === "GET") return json({ status: "ok", app: "slot-kiosk" });
      if (path.startsWith("/join/") && request.method === "GET") return html(joinPage(path.split("/").pop(), env.TURNSTILE_SITE_KEY || ""));
      if (path === "/admin" && request.method === "GET") {
        if (env.APP_MODE === "development" || await adminAuthorized(request, env)) return html(adminPage());
        return error("ADMIN_ACCESS_REQUIRED", 401);
      }
      if (path.startsWith("/api/events/") && path.endsWith("/leaderboard") && request.method === "GET") {
        if (!env.DB) return error("DATABASE_NOT_CONFIGURED", 503);
        const slug = path.split("/")[3];
        return slugOk(slug) ? leaderboard(env, slug) : error("INVALID_EVENT", 404);
      }
      if (!env.DB) return error("DATABASE_NOT_CONFIGURED", 503);
      if (path.startsWith("/api/admin/")) {
        if (!await adminAuthorized(request, env)) return error("ADMIN_ACCESS_REQUIRED", 401);
        return adminRoutes(request, env, path, parseBody(await request.text()), url);
      }
      if (path.startsWith("/api/join/")) return joinRoutes(request, env, path, parseBody(await request.text()));
      if (path.startsWith("/api/machine/")) {
        const raw = await request.text();
        const auth = await checkMachine(request, env, raw);
        if (auth.issue) return auth.issue;
        return machineRoutes(request, env, path, parseBody(raw), auth.machine);
      }
      return error("ROUTE_NOT_FOUND", 404);
    } catch (exception) {
      console.error("Slot kiosk request failed:", exception && exception.message);
      return error("INTERNAL_ERROR", 500);
    }
  }
};
