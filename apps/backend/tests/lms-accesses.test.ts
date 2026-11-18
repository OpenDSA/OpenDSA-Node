import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("LMS accesses enforce ownership, return credentials only to authorized users, validate CRUD and preserve progress", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const originalTransaction = prisma.$transaction;
  const restore: (() => void)[] = [];
  try {
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const instructor = await signInForTest(base);
    const researcher = await signInForTest(base, "seed-academic-researcher@example.com");
    const regular = await signInForTest(base, "seed-alice@example.com");
    const me = async (headers: Record<string, string>) => (await (await fetch(base + "/api/auth/me", { headers })).json()).user;
    const owner = await me(instructor), administrator = await me(admin);
    async function request(path = "", method = "GET", body?: unknown, headers: Record<string, string> = instructor) {
      const response = await fetch(base + "/api/admin/lms-accesses" + path, { method,
        headers: { ...headers, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }
    assert.equal((await request("", "GET", undefined, {})).status, 401);
    assert.equal((await request("", "GET", undefined, regular)).status, 403);
    assert.equal((await request("", "POST", {}, { Cookie: instructor.Cookie })).status, 403);
    assert.equal((await fetch(base + "/api/admin/users", { headers: instructor })).status, 403);
    const rollback = new Error("Rollback LMS access fixtures");
    await assert.rejects(originalTransaction.call(prisma, async (tx: any) => {
      prisma.$transaction = (async (callback: any) => callback(tx)) as any;
      for (const model of ["users", "lmsAccesses", "lmsInstances"] as const) {
        for (const method of ["findUnique", "findFirst", "findMany", "count"] as const) {
          const original = (prisma[model] as any)[method];
          (prisma[model] as any)[method] = tx[model][method].bind(tx[model]);
          restore.push(() => { (prisma[model] as any)[method] = original; });
        }
      }
      const lms = await tx.lmsInstances.create({ data: { url: `https://lms-${randomUUID()}.example` } });
      const token = "test-token-12345678", secret = "test-secret-87654321";
      const created = await request("", "POST", { lms_instance_id: lms.id, access_token: token, consumer_secret: secret });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const record = created.body.data, path = `/${record.id}`;
      assert.equal(record.user_id, owner.id);
      for (const result of [created, await request(path), await request(`?lms_instance_id=${lms.id}`)]) {
        assert.ok(JSON.stringify(result.body).includes(token));
        assert.ok(JSON.stringify(result.body).includes(secret));
      }
      assert.equal(record.access_token, token);
      assert.equal((await request("", "POST", { lms_instance_id: lms.id })).status, 409);
      assert.equal((await request(path, "PATCH", { user_id: administrator.id })).status, 403);
      assert.equal((await request("", "POST", { lms_instance_id: lms.id, user_id: administrator.id })).status, 403);
      assert.equal((await request(path, "PATCH", { access_token: "", consumer_secret: "", consumer_key: "key" })).status, 200);
      const stored = await tx.lmsAccesses.findUniqueOrThrow({ where: { id: record.id } });
      assert.equal(stored.access_token, token); assert.equal(stored.consumer_secret, secret);
      for (const body of [{ lms_instance_id: -1 }, { lms_instance_id: 2147483647 }, { access_token: "has space" }, { unexpected: true }]) {
        assert.equal((await request(path, "PATCH", body)).status, 400);
      }
      for (const query of ["?sort=access_token", "?per_page=101", "?page=0", "?unknown=x"]) assert.equal((await request(query)).status, 400);
      const other = await request("", "POST", { lms_instance_id: lms.id }, admin);
      assert.equal(other.status, 201);
      assert.equal((await request(`/${other.body.data.id}`)).status, 404);
      assert.equal((await request(`/${other.body.data.id}`, "DELETE")).status, 404);
      assert.equal((await request(`?user_id=${administrator.id}&lms_instance_id=${lms.id}`)).body.total, 0);
      assert.equal((await request(`?lms_instance_id=${lms.id}&sort=user.email`, "GET", undefined, admin)).body.total, 2);
      assert.equal((await request(path, "GET", undefined, researcher)).status, 404);
      const researchAccess = await request("", "POST", { lms_instance_id: lms.id }, researcher);
      assert.equal(researchAccess.status, 201);
      assert.equal((await request(`/${researchAccess.body.data.id}`, "DELETE", undefined, researcher)).status, 200);
      const options = await request(`/options/lms-instances/${lms.id}`);
      assert.deepEqual(options.body.data, { id: lms.id, url: lms.url });
      assert.equal((await request(`/options/lms-instances?q=${encodeURIComponent(lms.url)}`)).body.total, 1);
      const now = new Date();
      const progress = await tx.odsaModuleProgresses.create({ data: { user_id: owner.id, lms_access_id: record.id,
        first_done: now, last_done: now, proficient_date: now, last_passback: now, current_score: 0, highest_score: 0 } });
      assert.equal((await request(path, "DELETE")).status, 409);
      assert.equal((await tx.odsaModuleProgresses.findUniqueOrThrow({ where: { id: progress.id } })).lms_access_id, record.id);
      await tx.odsaModuleProgresses.delete({ where: { id: progress.id } });
      const exercise = await tx.odsaExerciseProgresses.create({ data: { user_id: owner.id, lms_access_id: record.id,
        first_done: now, last_done: now, proficient_date: now, current_score: 0, highest_score: 0, total_correct: 0, total_worth_credit: 0 } });
      assert.equal((await request(path, "DELETE")).status, 409);
      await tx.odsaExerciseProgresses.delete({ where: { id: exercise.id } });
      assert.equal((await request(path, "DELETE")).status, 200);
      assert.equal((await request(path)).status, 404);
      assert.ok(await tx.users.findUnique({ where: { id: owner.id } }));
      assert.ok(await tx.lmsInstances.findUnique({ where: { id: lms.id } }));
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally {
    restore.reverse().forEach(fn => fn()); prisma.$transaction = originalTransaction;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
