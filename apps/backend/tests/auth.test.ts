import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("login sessions, CSRF, role restrictions, user identity and logout", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/auth/me`)).json(), { user: null });
    assert.equal((await fetch(`${base}/api/course-offerings`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/api/inst_books/1/generate_course`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST" })).status, 403);
    const initial = await fetch(`${base}/api/auth/csrf`);
    const { csrfToken } = await initial.json();
    const initialCookie = initial.headers.get("set-cookie")!.split(";")[0];
    const badLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: {
      Cookie: initialCookie, "X-CSRF-Token": csrfToken, "Content-Type": "application/json",
    }, body: JSON.stringify({ email: "does-not-exist@example.com", password: "Wrong-password" }) });
    assert.equal(badLogin.status, 401);
    assert.deepEqual(await badLogin.json(), { error: "Invalid email or password." });
    const originalLookup = prisma.users.findUnique;
    const testHash = await (await import("bcryptjs")).hash("Right-test-password", 4);
    prisma.users.findUnique = (async (args: any) => {
      const found = await originalLookup.call(prisma.users, args);
      return found && args.select?.encrypted_password ? { ...found, encrypted_password: testHash } : found;
    }) as typeof prisma.users.findUnique;
    try {
      const wrong = await fetch(`${base}/api/auth/login`, { method: "POST", headers: {
        Cookie: initialCookie, "X-CSRF-Token": csrfToken, "Content-Type": "application/json",
      }, body: JSON.stringify({ email: "seed-academic-instructor@example.com", password: "Wrong-password" }) });
      assert.equal(wrong.status, 401);
      assert.deepEqual(await wrong.json(), { error: "Invalid email or password." });
    } finally { prisma.users.findUnique = originalLookup; }
    const headers = await signInForTest(base, " SEED-ACADEMIC-INSTRUCTOR@EXAMPLE.COM ");
    const response = await fetch(`${base}/api/auth/me`, { headers });
    const { user } = await response.json();
    assert.equal(user.email, "seed-academic-instructor@example.com");
    assert.equal(user.global_role.name, "Instructor");
    assert(!JSON.stringify(user).includes("encrypted_password"));
    assert.equal((await fetch(`${base}/api/course-offerings`, { method: "POST", headers: { Cookie: headers.Cookie } })).status, 403);
    const invalid = await fetch(`${base}/api/course-offerings`, { method: "POST", headers: {
      ...headers, "Content-Type": "application/json",
    }, body: JSON.stringify({ userId: 999 }) });
    assert.equal(invalid.status, 400);
    const student = await signInForTest(base, "seed-alice@example.com");
    assert.equal((await fetch(`${base}/api/course-offerings`, { method: "POST", headers: student })).status, 403);
    assert.equal((await fetch(`${base}/api/course-offerings/11/generate`, { method: "POST", headers: student })).status, 403);
    assert.equal((await fetch(`${base}/api/auth/logout`, { method: "POST", headers })).status, 204);
    assert.deepEqual(await (await fetch(`${base}/api/auth/me`, { headers })).json(), { user: null });
    assert.equal((await fetch(`${base}/api/course-offerings`, { method: "POST", headers })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${headers.Cookie}tampered` } })).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/auth/me`, { headers: { Cookie: `${headers.Cookie}tampered` } })).json(), { user: null });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
