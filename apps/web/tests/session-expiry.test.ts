import assert from "node:assert/strict";
import { test } from "node:test";
import { apiFetch, onSessionExpired, logoutSucceeded } from "../src/auth/api";

test("expired API sessions notify the UI; permission, network, and login failures do not", async () => {
  const original = globalThis.fetch;
  let expired = 0;
  const unsubscribe = onSessionExpired(() => expired++);
  try {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal((await apiFetch("/api/admin/users")).status, 401);
    assert.equal(expired, 1);
    await apiFetch("/api/auth/login"); assert.equal(expired, 1);
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await apiFetch("/api/admin/users"); assert.equal(expired, 1);
    globalThis.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(apiFetch("/api/admin/users"), /offline/); assert.equal(expired, 1);
    unsubscribe();
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await apiFetch("/api/profile"); assert.equal(expired, 1);
  } finally { unsubscribe(); globalThis.fetch = original; }
});
test("logout accepts an expired session but retains CSRF and server failures", () => {
  for (const status of [200, 204, 401]) assert.ok(logoutSucceeded(new Response(null, { status })));
  for (const status of [400, 403, 500]) assert.equal(logoutSucceeded(new Response(null, { status })), false);
});
