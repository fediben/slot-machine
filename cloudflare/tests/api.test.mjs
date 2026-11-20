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
test("private admin and unconfigured database fail closed", async () => {
  const env = { APP_MODE: "production" };
  const admin = await app.fetch(new Request("https://kiosk.example/admin"), env);
  assert.equal(admin.status, 401);
  const board = await app.fetch(new Request("https://kiosk.example/api/events/demo/leaderboard"), env);
  assert.equal(board.status, 503);
  const machine = await app.fetch(new Request("https://kiosk.example/api/machine/state"), env);
  assert.equal(machine.status, 503);
});
