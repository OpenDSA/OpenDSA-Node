import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("users can read/update only their own allowed profile fields", async () => {
  assert([undefined, "development", "test"].includes(process.env.NODE_ENV));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const lookup = prisma.users.findUnique;
  const update = prisma.users.update;
  try {
    assert.equal((await fetch(base + "/api/profile")).status, 401);
    assert.equal((await fetch(base + "/api/profile/time-zones")).status, 401);
    assert.equal((await fetch(base + "/api/profile", { method: "PATCH" })).status, 401);
    const headers = await signInForTest(base, "seed-alice@example.com");
    const originalUser = await prisma.users.findUniqueOrThrow({ where: { email: "seed-alice@example.com" } });
    const otherUser = await prisma.users.findUniqueOrThrow({ where: { email: "seed-academic-admin@example.com" } });
    const zonesResponse = await fetch(base + "/api/profile/time-zones", { headers });
    assert.equal(zonesResponse.status, 200);
    const { data: zones } = await zonesResponse.json();
    assert(zones.length > 0);
    assert.deepEqual(Object.keys(zones[0]).sort(), ["display_as", "id", "name", "zone"]);
    async function patch(body: unknown, requestHeaders = headers) {
      return fetch(base + "/api/profile", { method: "PATCH", headers: { ...requestHeaders, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    assert.equal((await patch({ first_name: "Unauthorized" }, { Cookie: headers.Cookie } as any)).status, 403);
    for (const invalid of [null, [], {}, { email: "changed@example.com" }, { global_role_id: 1 },
      { id: otherUser.id }, { user_id: otherUser.id }, { encrypted_password: "no" }, { password: "no" },
      { avatar: "https://example.com/picture.png" }, { first_name: 1 }, { last_name: "x".repeat(256) },
      { time_zone_id: "1" }, { time_zone_id: -1 }, { time_zone_id: 0 }, { time_zone_id: 1.5 },
      { time_zone_id: 2147483648 }, { time_zone_id: 2147483647 }]) {
      assert.equal((await patch(invalid)).status, 400);
    }
    assert.deepEqual(await prisma.users.findUnique({ where: { id: originalUser.id } }), originalUser);
    const sentinel = new Error("Rollback profile fixtures");
    await assert.rejects(prisma.$transaction(async tx => {
      prisma.users.findUnique = ((args: any) => tx.users.findUnique(args)) as any;
      prisma.users.update = ((args: any) => tx.users.update(args)) as any;
      try {
        const saved = await patch({ first_name: "  Alice  ", last_name: "  Tester  ", time_zone_id: zones[0].id });
        assert.equal(saved.status, 200);
        const { user } = await saved.json();
        assert.equal(user.id, originalUser.id);
        assert.equal(user.email, originalUser.email);
        assert.equal(user.first_name, "Alice");
        assert.equal(user.last_name, "Tester");
        assert.equal(user.time_zone_id, zones[0].id);
        assert.equal(user.time_zone.id, zones[0].id);
        assert.deepEqual(Object.keys(user).sort(), ["email", "first_name", "id", "last_name", "time_zone", "time_zone_id"]);
        const read = await fetch(base + `/api/profile?id=${otherUser.id}`, { headers });
        assert.equal(read.headers.get("cache-control"), "no-store");
        assert.deepEqual((await read.json()).user, user, "Query parameters cannot select another profile");
        const me = await (await fetch(base + "/api/auth/me", { headers })).json();
        assert.equal(me.user.first_name, "Alice");
        const partial = await patch({ first_name: "Updated" });
        assert.equal(partial.status, 200);
        assert.equal((await partial.json()).user.last_name, "Tester", "Omitted fields must remain unchanged");
        const cleared = await patch({ first_name: " ", last_name: null, time_zone_id: null });
        assert.equal(cleared.status, 200);
        const clearedUser = (await cleared.json()).user;
        assert.equal(clearedUser.first_name, null);
        assert.equal(clearedUser.last_name, null);
        assert.equal(clearedUser.time_zone, null);
        const stored = await tx.users.findUniqueOrThrow({ where: { id: originalUser.id } });
        assert.equal(stored.encrypted_password, originalUser.encrypted_password);
        assert.equal(stored.global_role_id, originalUser.global_role_id);
        assert.deepEqual(await tx.users.findUnique({ where: { id: otherUser.id } }), otherUser);
        prisma.users.update = (async () => { throw new Error("private database details"); }) as any;
        const failed = await patch({ first_name: "Failure" });
        assert.equal(failed.status, 500);
        assert.deepEqual(await failed.json(), { error: "Internal Server Error" });
      } finally {
        prisma.users.findUnique = lookup;
        prisma.users.update = update;
      }
      throw sentinel;
    }, { timeout: 30000 }), error => error === sentinel);
    assert.deepEqual(await prisma.users.findUnique({ where: { id: originalUser.id } }), originalUser);
  } finally {
    prisma.users.findUnique = lookup;
    prisma.users.update = update;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
