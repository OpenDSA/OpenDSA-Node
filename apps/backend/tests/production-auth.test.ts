import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

const secret = "production-test-only-session-secret-32-characters";
const sessionModule = require.resolve("../src/auth/sessions");
const appModule = require.resolve("../src/app");
const dbModule = require.resolve("../src/db");
const passwordModule = require.resolve("../src/auth/passwords");
const env = { ...process.env, NODE_ENV: "production", SESSION_SECRET: secret,
  TRUST_PROXY_HOPS: "1", PASSWORD_PEPPER: "production-test-pepper" };

// Isolated process with a test user, so production-cookie tests never mutate a DB.
async function start(proxyHops = "1") {
  const source = `
    (async () => {
      const { hashPassword } = require(${JSON.stringify(passwordModule)});
      const { prisma } = require(${JSON.stringify(dbModule)});
      const user = { id: 42, email: "instructor@example.com", first_name: "Test", last_name: "Instructor",
        global_role: { name: "Instructor", can_manage_all_courses: false, can_edit_system_configuration: false } };
      const password = await hashPassword("Test-password");
      prisma.users.findUnique = async args => args.where.id === 42 || args.where.email === user.email
        ? args.select.encrypted_password ? { ...user, encrypted_password: password } : user : null;
      const { app } = require(${JSON.stringify(appModule)});
      const server = app.listen(0, "127.0.0.1", () => process.send(server.address().port));
    })().catch(() => process.exit(1));
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "-e", source], {
    env: { ...env, TRUST_PROXY_HOPS: proxyHops }, stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const timeout = setTimeout(() => child.kill(), 10000);
  let port: unknown;
  try {
    port = await Promise.race([
      once(child, "message").then(([value]) => value),
      once(child, "exit").then(() => { throw new Error("Production test server failed to start."); }),
    ]);
  } finally { clearTimeout(timeout); }
  return { base: `http://127.0.0.1:${port}`, stop: async () => {
    const exited = once(child, "exit"); child.kill(); await exited;
  } };
}

test("production rejects missing/short secrets and invalid proxy configuration", () => {
  for (const overrides of [{ SESSION_SECRET: "" }, { SESSION_SECRET: "short" }, { TRUST_PROXY_HOPS: "true" }]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `require(${JSON.stringify(sessionModule)})`], {
      env: { ...env, ...overrides }, encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SESSION_SECRET|TRUST_PROXY_HOPS/);
  }
});

test("production auth requires trusted HTTPS, uses secure cookies, and survives process replacement", async () => {
  let server = await start();
  const httpsHeaders = { "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.15" };
  try {
    assert.equal((await fetch(server.base + "/api/health")).status, 200);
    assert.equal((await fetch(server.base + "/api/auth/csrf")).status, 400);
    assert.equal((await fetch(server.base + "/api/auth/signup", { method: "POST" })).status, 400);
    assert.equal((await fetch(server.base + "/api/course-offerings", { method: "POST" })).status, 400);
    assert.equal((await fetch(server.base + "/api/course-offerings", { method: "POST", headers: httpsHeaders })).status, 401);
    assert.equal((await fetch(server.base + "/api/auth/login", { method: "POST", headers: httpsHeaders })).status, 403);
    assert.equal((await fetch(server.base + "/api/auth/signup", { method: "POST", headers: httpsHeaders })).status, 403);
    const initial = await fetch(server.base + "/api/auth/csrf", { headers: httpsHeaders });
    assert.equal(initial.status, 200);
    assert.match(initial.headers.get("set-cookie")!, /; Secure/i);
    assert.match(initial.headers.get("set-cookie")!, /; HttpOnly/i);
    const { csrfToken } = await initial.json();
    const cookie = initial.headers.get("set-cookie")!.split(";")[0];
    const loginHeaders = { ...httpsHeaders, Cookie: cookie, "X-CSRF-Token": csrfToken, "Content-Type": "application/json" };
    const wrong = await fetch(server.base + "/api/auth/login", { method: "POST", headers: loginHeaders,
      body: JSON.stringify({ email: "instructor@example.com", password: "Wrong-password" }) });
    assert.equal(wrong.status, 401);
    const login = await fetch(server.base + "/api/auth/login", { method: "POST", headers: loginHeaders,
      body: JSON.stringify({ email: "instructor@example.com", password: "Test-password" }) });
    assert.equal(login.status, 200);
    const body = await login.json();
    const headers = { ...httpsHeaders, Cookie: login.headers.get("set-cookie")!.split(";")[0], "X-CSRF-Token": body.csrfToken };
    await server.stop();
    server = await start();
    assert.equal((await (await fetch(server.base + "/api/auth/me", { headers })).json()).user.id, 42);
    const logout = await fetch(server.base + "/api/auth/logout", { method: "POST", headers });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/);
    assert.match(logout.headers.get("set-cookie")!, /; Secure/i);
    assert.deepEqual(await (await fetch(server.base + "/api/auth/me", {
      headers: { ...httpsHeaders, Cookie: logout.headers.get("set-cookie")!.split(";")[0] },
    })).json(), { user: null });
  } finally { await server.stop(); }
  const untrusted = await start("0");
  try {
    assert.equal((await fetch(untrusted.base + "/api/auth/csrf", { headers: httpsHeaders })).status, 400);
  } finally { await untrusted.stop(); }
});
