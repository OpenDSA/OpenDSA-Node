import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";
import { ensureBuiltinCourseRole } from "../src/services/course-roles";
import { createPublicKey } from "node:crypto";
import { ltiEnroll } from "../src/lti/post-launch";

test("admin create/edit validates admin resources, preserves role identity and applies offering callbacks atomically", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const originalTransaction = prisma.$transaction;
  const restore: (() => void)[] = [];
  try {
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const regular = await signInForTest(base, "seed-alice@example.com");
    const actor = (await (await fetch(base + "/api/auth/me", { headers: admin })).json()).user;
    const request = async (resource: string, data: unknown, id?: number, headers: Record<string, string> = admin) => {
      const response = await fetch(`${base}/api/admin/${resource}${id === undefined ? "" : `/${id}`}`, {
        method: id === undefined ? "POST" : "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    };
    for (const resource of ["organizations", "terms", "courses", "course-offerings", "course-roles", "late-policies", "lms-types"]) {
      assert.equal((await request(resource, {}, undefined, {})).status, 401);
      assert.equal((await request(resource, {}, undefined, regular)).status, 403);
      assert.equal((await request(resource, {}, undefined, { Cookie: admin.Cookie })).status, 403);
      assert.equal((await request(resource, { id: 1 })).status, 400);
      assert.equal((await request(resource, {})).status, 400);
      assert.equal((await request(resource, resource === "terms" ? { year: 2026 } : resource === "course-offerings" ? { label: "Missing" } : { name: "Missing" }, 2147483647)).status, 404);
    }
    const rollback = new Error("Rollback admin create/edit fixtures");
    await assert.rejects(originalTransaction.call(prisma, async (tx: any) => {
      prisma.$transaction = (async (callback: any) => callback(tx)) as any;
      for (const model of ["users", "organizations", "terms", "courses", "courseOfferings", "courseRoles", "latePolicies", "lmsTypes", "lmsInstances", "courseEnrollments", "instBooks"] as const) {
        for (const method of ["findUnique", "findFirst", "findMany", "count", "create", "update", "updateMany"] as const) {
          const original = (prisma[model] as any)[method];
          (prisma[model] as any)[method] = (tx[model] as any)[method].bind(tx[model]);
          restore.push(() => { (prisma[model] as any)[method] = original; });
        }
      }
      const suffix = randomUUID().slice(0, 8);
      async function save(resource: string, data: unknown, id?: number) {
        const result = await request(resource, data, id);
        assert.equal(result.status, id === undefined ? 201 : 200, JSON.stringify(result.body));
        return result.body.data;
      }
      const org = await save("organizations", { name: `Admin Test ${suffix}`, abbreviation: `AT-${suffix}` });
      assert.ok(org.slug); assert.ok(org.created_at);
      assert.equal((await request("organizations", { name: org.name, abbreviation: "other" })).status, 409);
      assert.equal((await request("organizations", { name: "other", abbreviation: org.abbreviation })).status, 409);
      assert.equal((await request("organizations", { name: "" }, org.id)).status, 400);
      const renamedOrg = await save("organizations", { name: `${org.name} Updated` }, org.id);
      assert.equal(renamedOrg.slug, org.slug);
      assert.equal((await save("organizations", { abbreviation: `Updated-${suffix}` }, org.id)).slug, `updated-${suffix}`);
      const term = await save("terms", { season: 400, year: 2026, starts_on: "2026-08-01", ends_on: "2026-12-31" });
      await save("terms", { year: 2027 }, term.id);
      for (const patch of [{ season: 999 }, { starts_on: "2026-02-30" }, { ends_on: null }, { year: "2026" }]) {
        assert.equal((await request("terms", patch, term.id)).status, 400);
      }
      const course = await save("courses", { organization_id: org.id, number: `CS ${suffix}`, name: "Admin Course" });
      assert.equal(course.user_id, actor.id);
      await save("courses", { name: "Updated Course" }, course.id);
      assert.equal((await request("courses", { user_id: 2147483647 }, course.id)).status, 400);
      assert.equal((await request("courses", { organization_id: 2147483647 }, course.id)).status, 400);
      const policy = await save("late-policies", { name: `Late ${suffix}`, late_days: 3, late_percent: 10 });
      await save("late-policies", { late_percent: 20 }, policy.id);
      assert.equal((await request("late-policies", { name: policy.name, late_days: 1, late_percent: 1 })).status, 409);
      assert.equal((await request("late-policies", { late_days: 1.5 }, policy.id)).status, 400);
      const type = await save("lms-types", { name: `LMS-${suffix}` });
      await save("lms-types", { name: `${type.name}-updated` }, type.id);
      assert.equal((await request("lms-types", { name: `${type.name}-updated` })).status, 409);
      const role = await save("course-roles", { name: `Role ${suffix}`, can_grade_submissions: true });
      assert.equal(role.builtin, false);
      await save("course-roles", { can_view_other_submissions: true }, role.id);
      assert.equal((await request("course-roles", { builtin: true }, role.id)).status, 400);
      const instructor = await tx.courseRoles.findUniqueOrThrow({ where: { id: 1 } });
      const student = await tx.courseRoles.findUniqueOrThrow({ where: { id: 2 } });
      assert.equal((await request("course-roles", { can_manage_course: false }, instructor.id)).status, 400);
      await save("course-roles", { name: `Teacher ${suffix}` }, instructor.id);
      await save("course-roles", { name: `Learner ${suffix}` }, student.id);
      assert.equal((await ensureBuiltinCourseRole(true, tx)).id, 1);
      assert.equal((await ensureBuiltinCourseRole(false, tx)).id, 2);
      const lms = await tx.lmsInstances.findFirstOrThrow();
      const offeringInput = { course_id: course.id, term_id: term.id, label: "Admin section", lms_instance_id: lms.id, lms_course_num: "admin-test-only" };
      const offering = await save("course-offerings", offeringInput);
      const enrollment = await tx.courseEnrollments.findUniqueOrThrow({ where: { user_id_course_offering_id: { user_id: actor.id, course_offering_id: offering.id } } });
      assert.equal(enrollment.course_role_id, 1);
      const studentUser = await tx.users.findUniqueOrThrow({ where: { email: "seed-alice@example.com" } });
      await ltiEnroll(studentUser.id, offering.id, false);
      assert.equal((await tx.courseEnrollments.findUniqueOrThrow({ where: { user_id_course_offering_id: { user_id: studentUser.id, course_offering_id: offering.id } } })).course_role_id, 2);
      const book = await tx.instBooks.create({ data: { title: "Admin fixture", user_id: actor.id, course_offering_id: offering.id, last_compiled: new Date() } });
      await save("course-offerings", { label: "Changed section", archived: true }, offering.id);
      assert.equal((await tx.instBooks.findUniqueOrThrow({ where: { id: book.id } })).last_compiled, null);
      assert.equal((await tx.courseEnrollments.count({ where: { course_offering_id: offering.id } })), 2);
      assert.equal((await request("course-offerings", { ...offeringInput, lms_instance_id: 2147483647 })).status, 400);
      const readLms = await (await fetch(`${base}/api/admin/lms-instances/${lms.id}`, { headers: admin })).json();
      assert.deepEqual(Object.keys(readLms.data).sort(), ["id", "url", "lms_type_id", "organization_id", "consumer_key", "client_id", "public_key", "keyset_url",
        "oauth2_url", "platform_oidc_auth_url", "issuer", "created_at", "updated_at"].sort());
      const ltiType = await tx.lmsTypes.findFirst({ where: { name: "LTI 1.3" } }) ??
        await tx.lmsTypes.create({ data: { name: "LTI 1.3" } });
      const ltiInput = { url: `https://admin-lms-${suffix}.example`, lms_type_id: ltiType.id, organization_id: org.id,
        client_id: "test-client", issuer: "https://issuer.example", keyset_url: "https://issuer.example/keys",
        oauth2_url: "https://issuer.example/token", platform_oidc_auth_url: "https://issuer.example/auth",
        consumer_key: "test-key", consumer_secret: "test-secret" };
      assert.equal((await request("lms-instances", { ...ltiInput, client_id: "" })).status, 400);
      assert.equal((await request("lms-instances", { ...ltiInput, private_key: "invalid PEM" })).status, 400);
      const createdLms = await save("lms-instances", ltiInput);
      assert.ok(createdLms.public_key.includes("PUBLIC KEY"));
      assert.ok(!("consumer_secret" in createdLms)); assert.ok(!("private_key" in createdLms));
      const storedLms = await tx.lmsInstances.findUniqueOrThrow({ where: { id: createdLms.id } });
      assert.equal(storedLms.consumer_secret, "test-secret");
      assert.equal(createPublicKey(storedLms.private_key).export({ type: "spki", format: "pem" }).toString(), createdLms.public_key);
      await save("lms-instances", { consumer_secret: "", private_key: "", client_id: "updated-client" }, createdLms.id);
      const preserved = await tx.lmsInstances.findUniqueOrThrow({ where: { id: createdLms.id } });
      assert.equal(preserved.private_key, storedLms.private_key); assert.equal(preserved.consumer_secret, "test-secret");
      await save("lms-instances", { consumer_secret: "replacement-secret" }, createdLms.id);
      assert.equal((await tx.lmsInstances.findUniqueOrThrow({ where: { id: createdLms.id } })).consumer_secret, "replacement-secret");
      assert.equal((await request("lms-instances", ltiInput)).status, 409);
      assert.equal((await request("lms-instances", { organization_id: 2147483647 }, createdLms.id)).status, 400);
      const lmsRead = await (await fetch(`${base}/api/admin/lms-instances/${createdLms.id}`, { headers: admin })).json();
      assert.ok(!("private_key" in lmsRead.data)); assert.ok(!("consumer_secret" in lmsRead.data));
      throw rollback;
    }, { timeout: 60000 }), error => error === rollback);
  } finally {
    prisma.$transaction = originalTransaction;
    for (const callback of restore.reverse()) callback();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
