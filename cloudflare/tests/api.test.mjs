import test from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";

test("health and public join shell do not require D1", async () => {
  const health = await app.fetch(new Request("https://kiosk.example/health"), {});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  const page = await app.fetch(new Request("https://kiosk.example/join/" + "A".repeat(32)), {});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Join the game/);
});
test("unconfigured admin, invalid authorisation and unsupported methods reject requests", async () => {
  const env={APP_MODE:"development",ADMIN_DEV_TOKEN:"this-token-is-local-only",DB:{}};
  const unauth=await app.fetch(new Request("https://kiosk.example/api/admin/events"),env);
  assert.equal(unauth.status,401);
  const crossSite=await app.fetch(new Request("https://kiosk.example/api/admin/events",{
    method:"POST",headers:{"Authorization":"Bearer this-token-is-local-only","Content-Type":"application/json","Origin":"https://other.example"},
    body:"{}"
  }),env);
  assert.equal(crossSite.status,403);
  const noJson=await app.fetch(new Request("https://kiosk.example/api/admin/events",{
    method:"POST",headers:{"Authorization":"Bearer this-token-is-local-only","Content-Type":"text/plain"},
    body:"{}"
  }),env);
  assert.equal(noJson.status,415);
});

test("private admin and unconfigured database fail closed", async () => {
  const env = { APP_MODE: "production" };
  const admin = await app.fetch(new Request("https://kiosk.example/admin"), env);
  assert.equal(admin.status, 401);
  const board = await app.fetch(new Request("https://kiosk.example/api/events/demo/leaderboard"), env);
  assert.equal(board.status, 503);
  const machine = await app.fetch(new Request("https://kiosk.example/api/machine/state"), env);
  assert.equal(machine.status, 503);
});
