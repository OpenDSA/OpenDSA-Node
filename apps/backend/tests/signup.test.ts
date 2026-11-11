import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { verifyPassword } from "../src/auth/passwords";

test("signup validates, creates only regular users, signs in, handles duplicates and limits attempts", async () => {
  assert([undefined, "development", "test"].includes(process.env.NODE_ENV));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function anonymousHeaders() {
    const response = await fetch(base + "/api/auth/csrf");
    return { Cookie: response.headers.get("set-cookie")!.split(";")[0],
      "X-CSRF-Token": (await response.json()).csrfToken, "Content-Type": "application/json" };
  }
  async function signup(body: unknown, headers: Record<string, string>) {
    return fetch(base + "/api/auth/signup", { method: "POST", headers, body: JSON.stringify(body) });
  }
  const transaction = prisma.$transaction;
  const lookup = prisma.users.findUnique;
  const create = prisma.users.create;
  const roleLookup = prisma.globalRoles.findFirst;
  const before = await prisma.users.count();
  const sentinel = new Error("Rollback signup fixtures");
  const input = { email: `signup-${randomUUID()}@example.com`, password: "Signup-test-password", password_confirmation: "Signup-test-password" };
  try {
    const anonymous = await anonymousHeaders();
    assert.equal((await signup(input, { "Content-Type": "application/json" })).status, 403);
    for (const invalid of [null, [], { ...input, global_role_id: 1 }, { ...input, userId: 1 },
      { ...input, email: " " }, { ...input, email: "not-an-email" }, { ...input, password: "short" },
      { ...input, password: "é".repeat(37) }, { ...input, password_confirmation: "different" },
      { ...input, email: "a".repeat(256) + "@example.com" }]) {
      assert.equal((await signup(invalid, anonymous)).status, 400);
    }
    prisma.globalRoles.findFirst = (async () => null) as any;
    assert.equal((await signup(input, anonymous)).status, 503);
    prisma.globalRoles.findFirst = (async () => ({ id: 1, can_manage_all_courses: true })) as any;
    assert.equal((await signup(input, anonymous)).status, 503);
    prisma.globalRoles.findFirst = roleLookup;
    await assert.rejects(transaction.call(prisma, async (tx: any) => {
      // Route requests exercise real constraints/hashes but leave no test accounts.
      prisma.users.findUnique = ((args: any) => tx.users.findUnique(args)) as any;
      prisma.users.create = ((args: any) => tx.users.create(args)) as any;
      const response = await signup({ ...input, email: ` ${input.email.toUpperCase()} ` }, anonymous);
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.user.email, input.email);
      assert.equal(body.user.global_role.name, "Regular User");
      assert.equal(body.user.global_role.can_manage_all_courses, false);
      assert.equal(body.user.global_role.can_edit_system_configuration, false);
      assert(!("encrypted_password" in body.user));
      assert(!JSON.stringify(body).includes(input.password));
      assert.notEqual(body.csrfToken, anonymous["X-CSRF-Token"]);
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      assert.notEqual(cookie, anonymous.Cookie);
      const headers = { Cookie: cookie, "X-CSRF-Token": body.csrfToken, "Content-Type": "application/json" };
      const saved = await tx.users.findUniqueOrThrow({ where: { email: input.email } });
      assert.match(saved.slug, /^user-/);
      assert.notEqual(saved.encrypted_password, input.password);
      assert.equal(await verifyPassword(input.password, saved.encrypted_password), true);
      assert.equal(saved.time_zone_id, null);
      assert.equal((await (await fetch(base + "/api/auth/me", { headers })).json()).user.id, saved.id);
      assert.equal((await fetch(base + "/api/course-offerings", { method: "POST", headers })).status, 403);
      assert.equal((await fetch(base + "/api/textbooks", { method: "POST", headers })).status, 403);
      assert.equal((await signup(input, headers)).status, 409);
      const duplicate = await signup(input, await anonymousHeaders());
      assert.equal(duplicate.status, 409);
      assert.equal(await tx.users.count(), before + 1);
      // Concurrent requests for the same email must create exactly one user.
      const raceInput = { ...input, email: `race-${randomUUID()}@example.com` };
      const [first, second] = await Promise.all([anonymousHeaders(), anonymousHeaders()]);
      const race = await Promise.all([signup(raceInput, first), signup(raceInput, second)]);
      assert.deepEqual(race.map(item => item.status).sort(), [201, 409]);
      assert.equal(await tx.users.count(), before + 2);
      // Account can log out and log back in using the newly stored password.
      assert.equal((await fetch(base + "/api/auth/logout", { method: "POST", headers })).status, 204);
      const login = await fetch(base + "/api/auth/login", { method: "POST", headers: await anonymousHeaders(),
        body: JSON.stringify({ email: input.email, password: input.password }) });
      assert.equal(login.status, 200);
      let limited = false;
      for (let attempt = 0; attempt < 21; attempt++) {
        const result = await signup({ ...input, email: "invalid" }, anonymous);
        if (result.status === 429) { limited = true; break; }
        assert.equal(result.status, 400);
      }
      assert(limited, "Signup attempts must be rate limited");
      throw sentinel;
    }, { timeout: 30000 }), error => error === sentinel);
  } finally {
    prisma.users.findUnique = lookup;
    prisma.users.create = create;
    prisma.globalRoles.findFirst = roleLookup;
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(await prisma.users.count(), before);
    await prisma.$disconnect();
  }
});
