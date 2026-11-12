import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("successful logins rotate timestamps and increment atomically; reads and failures do not", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const lookup = prisma.users.findUnique, execute = prisma.$executeRaw;
  const rollback = new Error("Rollback metrics fixtures");
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const role = await tx.globalRoles.findFirstOrThrow({ where: { name: "Regular User" } });
      const created = new Date("2020-01-01T00:00:00Z");
      const user = await tx.users.create({ data: { email: `metrics-${randomUUID()}@example.com`,
        slug: randomUUID(), global_role_id: role.id, created_at: created } });
      prisma.users.findUnique = ((args: any) => tx.users.findUnique(args)) as any;
      prisma.$executeRaw = tx.$executeRaw.bind(tx);
      try {
        const headers = await signInForTest(base, user.email);
        const first = await tx.users.findUniqueOrThrow({ where: { id: user.id } });
        assert.equal(first.sign_in_count, 1);
        assert.ok(first.current_sign_in_at);
        assert.deepEqual(first.last_sign_in_at, first.current_sign_in_at);
        assert.equal(first.current_sign_in_ip, "127.0.0.1");
        assert.deepEqual(first.created_at, created);
        await fetch(base + "/api/auth/me", { headers });
        const failure = await fetch(base + "/api/auth/login", { method: "POST", headers: {
          ...headers, "Content-Type": "application/json",
        }, body: JSON.stringify({ email: user.email, password: "incorrect" }) });
        assert.equal(failure.status, 401);
        assert.deepEqual(await tx.users.findUnique({ where: { id: user.id } }), first);
        await signInForTest(base, user.email);
        const second = await tx.users.findUniqueOrThrow({ where: { id: user.id } });
        assert.equal(second.sign_in_count, 2);
        assert.deepEqual(second.last_sign_in_at, first.current_sign_in_at);
        assert.equal(second.last_sign_in_ip, first.current_sign_in_ip);
        assert.ok(second.current_sign_in_at! >= first.current_sign_in_at!);
      } finally { prisma.users.findUnique = lookup; prisma.$executeRaw = execute; }
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally {
    prisma.users.findUnique = lookup; prisma.$executeRaw = execute;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
