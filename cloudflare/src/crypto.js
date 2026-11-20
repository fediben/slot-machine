// Slot Kiosk v1 – crypto and authentication primitives (no secrets committed).
const encoder = new TextEncoder();
export const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
export const fromHex = text => Uint8Array.from(text.match(/.{2}/g) || [], x => parseInt(x, 16));
export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
export const unb64url = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), c => c.charCodeAt(0));
export async function sha256(input) {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}
export async function shaHex(input) { return hex(await sha256(input)); }
export async function hmacBytes(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}
export async function deriveMachineKey(master, machineId) {
  return hmacBytes(encoder.encode(master), "slot-kiosk-machine-v1:" + machineId);
}
export function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function canonicalSignature(key, req, body, timestamp, nonce) {
  const path = new URL(req.url).pathname;
  const digest = await shaHex(body);
  return hmacBytes(key, [timestamp, nonce, req.method.toUpperCase(), path, digest].join("\n"));
}
export async function pinDigest(pin, salt, pepper, eventId) {
  const base = await crypto.subtle.importKey("raw", encoder.encode(pin + ":" + pepper + ":" + eventId), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64url(salt), iterations: 100000, hash: "SHA-256" }, base, 256)));
}
export function randomCode(size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}
export async function verifyAccessJwt(request, env) {
  const domain = env.ACCESS_TEAM_DOMAIN || "";
  const audience = env.ACCESS_AUD || "";
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !audience) return false;
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const jwt = header || (cookie && cookie[1]);
  if (!jwt) return false;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const claim = JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
    const jwtHeader = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    if (jwtHeader.alg !== "RS256" || claim.iss !== "https://" + domain ||
        !Array.isArray(claim.aud) || !claim.aud.includes(audience) ||
        typeof claim.exp !== "number" || claim.exp < now ||
        (claim.nbf && claim.nbf > now + 30)) return false;
    const response = await fetch("https://" + domain + "/cdn-cgi/access/certs");
    if (!response.ok) return false;
    const keys = (await response.json()).keys || [];
    const jwk = keys.find(k => k.kid === jwtHeader.kid && k.kty === "RSA");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64url(parts[2]), encoder.encode(parts[0] + "." + parts[1]));
  } catch { return false; }
}
