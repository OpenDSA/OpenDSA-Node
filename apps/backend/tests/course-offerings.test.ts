import { signInForTest } from "./auth-client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";

// Creates uniquely named development fixtures; retains them for Studio inspection.
test("offering validation and legacy find-or-create behavior", async () => {
  assert([undefined, "development", "test"].includes(process.env.NODE_ENV));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/course-offerings`;
  const authHeaders = await signInForTest(`http://127.0.0.1:${address.port}`);
  async function post(body: unknown) {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  try {
    const org = await prisma.organizations.findUniqueOrThrow({ where: { slug: "seed-vt" } });
    const course = await prisma.courses.findFirstOrThrow({ where: { organization_id: org.id } });
    const term = await prisma.terms.findUniqueOrThrow({ where: { slug: "seed-2023-100" } });
    const lms = await prisma.lmsInstances.findUniqueOrThrow({ where: { url: "https://seed-canvas.example.invalid" } });
    const suffix = randomUUID();
    const other = await prisma.organizations.create({ data: { name: `API test ${suffix}`, slug: `api-test-${suffix}` } });
    const input = {
      organization_id: org.id, course_id: course.id, term_id: term.id,
      label: `API test ${suffix}`, lms_instance_id: lms.id, lms_course_num: `api-test-${suffix}`,
    };
    const before = await prisma.courseOfferings.count();
    for (const patch of [
      { course_id: "1" }, { course_id: 0 }, { term_id: 1.5 }, { label: " " },
      { label: "a".repeat(256) }, { lms_course_num: 123 }, { lms_course_num: "" },
      { course_id: 2147483647 }, { term_id: 2147483647 }, { lms_instance_id: 2147483647 },
      { organization_id: 2147483647 }, { organization_id: other.id },
      { book_instance_id: 0 }, { lms_access_token: "must-not-be-persisted" },
    ]) {
      const result = await post({ ...input, ...patch });
      assert.equal(result.status, 400, JSON.stringify(patch));
      assert.equal(typeof result.body.error, "string");
      assert(!JSON.stringify(result.body).includes("must-not-be-persisted"));
    }
    assert.equal((await post(null)).status, 400);
    assert.equal((await post([])).status, 400);
    assert.equal(await prisma.courseOfferings.count(), before);
    const results = await Promise.all([post(input), post(input)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
    assert.equal(results[0].body.data.id, results[1].body.data.id);
    const created = results.find(r => r.status === 201)!.body.data;
    const saved = await prisma.courseOfferings.findUniqueOrThrow({ where: { id: created.id }, include: { inst_books: true } });
    assert.equal(saved.course_id, input.course_id);
    assert.equal(saved.term_id, input.term_id);
    assert.equal(saved.lms_instance_id, input.lms_instance_id);
    assert.equal(saved.lms_course_num, input.lms_course_num);
    assert.equal(saved.inst_books.length, 0);
    assert.equal((await post({ ...input, label: `${input.label} another section` })).status, 201);
    const reused = await post({ ...input, lms_course_num: `${input.lms_course_num}-other` });
    assert.equal(reused.status, 200);
    assert.equal(reused.body.data.id, created.id);
    assert.equal(reused.body.data.lms_course_num, input.lms_course_num);
    assert.equal(reused.body.url, `/course-offerings/${created.id}`);
    assert.equal(await prisma.courseOfferings.count(), before + 2);
    const original = prisma.$transaction;
    try {
      prisma.$transaction = (() => { throw new Error("private database credentials"); }) as typeof prisma.$transaction;
      const failed = await post({ ...input, label: "Failure test", lms_course_num: "failure-test" });
      assert.equal(failed.status, 500);
      assert.deepEqual(failed.body, { error: "Unable to create the course offering." });
    } finally { prisma.$transaction = original; }
    assert.equal(await prisma.courseOfferings.count(), before + 2);
    console.log(`Retained offering ${created.id} (${input.label}) and test organization ${other.id} for inspection.`);
    console.log(`Seed IDs: organization=${org.id}, course=${course.id}, term=${term.id}, LMS=${lms.id}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
