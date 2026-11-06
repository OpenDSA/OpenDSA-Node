import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { sealData, unsealData } from "iron-session";

test("encrypted cookies contain minimal data and reject tampering and expired logins", async () => {
  process.env.SESSION_SECRET ||= "session-test-only-secret-at-least-32-characters";
  const { cookieSession, sessionCookieName, sessionLifetimeSeconds } = await import("../src/auth/sessions");
  const app = express();
  app.use(cookieSession);
  app.get("/create", async (req, res) => {
    req.authSession.userId = 42;
    req.authSession.csrfToken = "a".repeat(64);
    req.authSession.expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
    await req.authSession.save();
    res.end();
  });
  app.get("/read", (req, res) => res.json({ userId: req.authSession.userId || null }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + "/create");
    const setCookie = response.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Max-Age=28740/);
    const cookie = setCookie.split(";")[0];
    const data = await unsealData<Record<string, unknown>>(decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)), {
      password: process.env.SESSION_SECRET,
    });
    assert.deepEqual(Object.keys(data).sort(), ["csrfToken", "expiresAt", "userId"]);
    assert.deepEqual(await (await fetch(base + "/read", { headers: { Cookie: cookie } })).json(), { userId: 42 });
    const middle = Math.floor(cookie.length / 2);
    const tampered = cookie.slice(0, middle) + (cookie[middle] === "a" ? "b" : "a") + cookie.slice(middle + 1);
    assert.deepEqual(await (await fetch(base + "/read", { headers: { Cookie: tampered } })).json(), { userId: null });
    const expired = await sealData({ userId: 42, expiresAt: Date.now() - 1 }, { password: process.env.SESSION_SECRET });
    assert.deepEqual(await (await fetch(base + "/read", { headers: { Cookie: `${sessionCookieName}=${expired}` } })).json(), { userId: null });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
