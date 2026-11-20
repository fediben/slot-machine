import test from "node:test";
import assert from "node:assert/strict";
import { b64url, unb64url, shaHex, deriveMachineKey, canonicalSignature, constantEqual, pinDigest, randomCode } from "../src/crypto.js";

test("machine-derived signatures are machine-bound and body-bound", async () => {
  const a = await deriveMachineKey("private-master-value", "machine-A");
  const b = await deriveMachineKey("private-master-value", "machine-B");
  const request = new Request("https://example.com/api/machine/state", { method: "POST" });
  const sig = await canonicalSignature(a, request, '{"hello":true}', "123456789", "random-once");
  assert.ok(constantEqual(sig, await canonicalSignature(a, request, '{"hello":true}', "123456789", "random-once")));
  assert.ok(!constantEqual(sig, await canonicalSignature(b, request, '{"hello":true}', "123456789", "random-once")));
  assert.ok(!constantEqual(sig, await canonicalSignature(a, request, '{}', "123456789", "random-once")));
});

test("QR token hashes, base64url and PIN hashes are stable", async () => {
  const token = randomCode();
  assert.equal(unb64url(token).length, 24);
  assert.equal(b64url(unb64url(token)), token);
  assert.equal((await shaHex(token)).length, 64);
  const salt = randomCode(16);
  assert.equal(await pinDigest("718294", salt, "pepper", "event-1"), await pinDigest("718294", salt, "pepper", "event-1"));
  assert.notEqual(await pinDigest("718295", salt, "pepper", "event-1"), await pinDigest("718294", salt, "pepper", "event-1"));
});
