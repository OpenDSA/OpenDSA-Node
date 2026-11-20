import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("Learning Tools admin CRUD enforces permissions, required fields, uniqueness and deletion", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const transaction = prisma.$transaction;
  const restore: (() => void)[] = [];
  try {
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const instructor = await signInForTest(base);
    const regular = await signInForTest(base, "seed-alice@example.com");
    async function request(path = "", method = "GET", data?: unknown, headers: Record<string, string> = admin) {
      const response = await fetch(base + "/api/admin/learning-tools" + path, { method,
        headers: { ...headers, "Content-Type": "application/json" }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      return { status: response.status, body: await response.json() };
    }
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const path = ["PATCH", "DELETE"].includes(method) ? "/1" : "";
      assert.equal((await request(path, method, undefined, {})).status, 401);
      for (const user of [instructor, regular]) assert.equal((await request(path, method, undefined, user)).status, 403);
      if (method !== "GET") assert.equal((await request(path, method, {}, { Cookie: admin.Cookie })).status, 403);
    }
    const rollback = new Error("Rollback Learning Tools fixtures");
    await assert.rejects(transaction.call(prisma, async (tx: any) => {
      prisma.$transaction = (async (callback: any) => callback(tx)) as any;
      for (const method of ["findUnique", "findMany", "count", "delete"] as const) {
        const original = prisma.learningTools[method];
        (prisma.learningTools as any)[method] = tx.learningTools[method].bind(tx.learningTools);
        restore.push(() => { (prisma.learningTools as any)[method] = original; });
      }
      const input = { name: `Tool-${randomUUID()}`, key: "test-key", secret: "test-secret", launch_url: "https://tool.example/launch" };
      for (const field of ["name", "key", "secret", "launch_url"]) {
        const missing = { ...input } as Record<string, unknown>; delete missing[field];
        assert.equal((await request("", "POST", missing)).status, 400);
        assert.equal((await request("", "POST", { ...input, [field]: " " })).status, 400);
        assert.equal((await request("", "POST", { ...input, [field]: "x".repeat(256) })).status, 400);
      }
      const created = await request("", "POST", input);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const record = created.body.data, path = `/${record.id}`;
      assert.equal(record.secret, input.secret); assert.ok(record.created_at);
      assert.equal((await request("", "POST", input)).status, 409);
      assert.equal((await request(path)).body.data.key, input.key);
      const listed = await request(`?q=${encodeURIComponent(input.name)}&sort=created_at&per_page=1`);
      assert.equal(listed.body.total, 1); assert.equal(listed.body.data[0].id, record.id);
      assert.equal((await request("?sort=secret")).status, 400);
      assert.equal((await request("?per_page=101")).status, 400);
      assert.equal((await request(path, "PATCH", { secret: "updated" })).body.data.secret, "updated");
      assert.equal((await request(path, "PATCH", { secret: "" })).status, 400);
      assert.equal((await request(path, "PATCH", { id: 123 })).status, 400);
      assert.equal((await request("/2147483647", "PATCH", { name: "missing" })).status, 404);
      assert.equal((await request("/bad", "DELETE")).status, 400);
      assert.equal((await request(path, "DELETE")).status, 200);
      assert.equal((await request(path)).status, 404);
      assert.equal((await request(path, "DELETE")).status, 404);
      assert.equal(await tx.learningTools.count({ where: { name: input.name } }), 0);
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally {
    restore.reverse().forEach(fn => fn()); prisma.$transaction = transaction;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
