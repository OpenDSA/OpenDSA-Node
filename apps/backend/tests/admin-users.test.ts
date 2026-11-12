import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("admin edits validate inputs and update roles in existing sessions without changing passwords", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address(); assert(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  const lookup = prisma.users.findUnique, update = prisma.users.update;
  try {
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const regular = await signInForTest(base, "seed-alice@example.com");
    const target = await prisma.users.findUniqueOrThrow({ where: { email: "seed-alice@example.com" } });
    const instructor = await prisma.globalRoles.findFirstOrThrow({ where: { name: "Instructor" } });
    const administrator = await prisma.globalRoles.findFirstOrThrow({ where: { name: "Administrator" } });
    const patch = (body: unknown, headers: Record<string, string> = admin, id = String(target.id)) =>
      fetch(`${base}/api/admin/users/${id}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await patch({ first_name: "No" }, {})).status, 401);
    assert.equal((await patch({ first_name: "No" }, regular)).status, 403);
    assert.equal((await patch({ first_name: "No" }, { Cookie: admin.Cookie })).status, 403);
    for (const input of [null, [], {}, { password: "no" }, { encrypted_password: "no" }, { id: target.id },
      { confirmed_at: "now" }, { email: "bad" }, { first_name: 1 }, { last_name: "x".repeat(256) },
      { global_role_id: "1" }, { global_role_id: null }, { global_role_id: -1 },
      { global_role_id: 1.5 }, { global_role_id: 2147483647 }]) {
      assert.equal((await patch(input)).status, 400, JSON.stringify(input));
    }
    assert.equal((await patch({ first_name: "Test" }, admin, "invalid")).status, 400);
    assert.equal((await patch({ first_name: "Test" }, admin, "2147483647")).status, 404);
    const sentinel = new Error("Rollback admin edits");
    await assert.rejects(prisma.$transaction(async tx => {
      prisma.users.findUnique = ((args: any) => tx.users.findUnique(args)) as any;
      prisma.users.update = ((args: any) => tx.users.update(args)) as any;
      try {
        assert.equal((await patch({ email: "seed-academic-admin@example.com" })).status, 409);
        const response = await patch({ first_name: " First ", last_name: " User ",
          email: " ADMIN-EDIT-TEST@EXAMPLE.COM ", global_role_id: instructor.id });
        assert.equal(response.status, 200);
        const { data } = await response.json();
        assert.equal(data.first_name, "First"); assert.equal(data.last_name, "User");
        assert.equal(data.email, "admin-edit-test@example.com"); assert.equal(data.global_role.name, "Instructor");
        assert.ok(!("encrypted_password" in data));
        const me = await (await fetch(base + "/api/auth/me", { headers: regular })).json();
        assert.equal(me.user.global_role.name, "Instructor");
        assert.equal((await fetch(base + "/api/admin/users", { headers: regular })).status, 403);
        assert.equal((await patch({ global_role_id: administrator.id })).status, 200);
        assert.equal((await fetch(base + "/api/admin/users", { headers: regular })).status, 200);
        assert.equal((await patch({ global_role_id: target.global_role_id, first_name: " ", last_name: null })).status, 200);
        assert.equal((await fetch(base + "/api/admin/users", { headers: regular })).status, 403);
        const saved = await tx.users.findUniqueOrThrow({ where: { id: target.id } });
        assert.equal(saved.first_name, null); assert.equal(saved.last_name, null);
        assert.equal(saved.encrypted_password, target.encrypted_password);
        assert.equal(saved.slug, target.slug); assert.equal(saved.time_zone_id, target.time_zone_id);
      } finally { prisma.users.findUnique = lookup; prisma.users.update = update; }
      throw sentinel;
    }, { timeout: 30000 }), error => error === sentinel);
    assert.deepEqual(await prisma.users.findUnique({ where: { id: target.id } }), target);
  } finally {
    prisma.users.findUnique = lookup; prisma.users.update = update;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
