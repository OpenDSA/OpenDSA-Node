import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("textbooks clone/reuse standalone offerings with instructor permissions and no external calls", async () => {
  assert([undefined, "development", "test"].includes(process.env.NODE_ENV));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    assert(String(url).startsWith(base + "/"), "Textbook creation must not contact Canvas or the compiler");
    return originalFetch(url, init);
  }) as typeof fetch;
  try {
    const instructor = await signInForTest(base);
    const student = await signInForTest(base, "seed-alice@example.com");
    const researcher = await signInForTest(base, "seed-academic-researcher@example.com");
    const org = await prisma.organizations.findUniqueOrThrow({ where: { slug: "seed-vt" } });
    const course = await prisma.courses.findFirstOrThrow({ where: { organization_id: org.id } });
    const term = await prisma.terms.findFirstOrThrow();
    const source = await prisma.instBooks.findFirstOrThrow({ where: { title: "CS 1114 OpenDSA Book" } });
    const owner = await prisma.users.findUniqueOrThrow({ where: { email: "seed-academic-instructor@example.com" } });
    const input = { organization_id: org.id, course_id: course.id, term_id: term.id,
      label: `Textbook test ${randomUUID()}`, book_instance_id: source.id };
    async function post(body: unknown, headers: Record<string, string> = instructor) {
      return fetch(base + "/api/textbooks", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    assert.equal((await post(input, {})).status, 401);
    assert.equal((await post(input, { Cookie: instructor.Cookie })).status, 403);
    assert.equal((await post(input, student)).status, 403);
    for (const invalid of [null, [], { ...input, book_instance_id: undefined }, { ...input, course_id: "1" },
      { ...input, label: " " }, { ...input, lms_instance_id: 1 }, { ...input, userId: 1 }]) {
      assert.equal((await post(invalid)).status, 400);
    }

    const transaction = prisma.$transaction;
    const lmsLookup = prisma.lmsInstances.findMany;
    const offeringLookup = prisma.courseOfferings.findUnique;
    const enrollmentLookup = prisma.courseEnrollments.findFirst;
    const sentinel = new Error("Rollback textbook test fixtures");
    const before = await prisma.instBooks.count();
    try {
      await assert.rejects(transaction.call(prisma, async (tx: any) => {
        // Exercise real API/SQL writes inside one transaction and roll them all back.
        prisma.$transaction = (async (callback: any) => callback(tx)) as any;
        prisma.lmsInstances.findMany = ((args: any) => tx.lmsInstances.findMany(args)) as any;
        prisma.courseOfferings.findUnique = ((args: any) => tx.courseOfferings.findUnique(args)) as any;
        prisma.courseEnrollments.findFirst = ((args: any) => tx.courseEnrollments.findFirst(args)) as any;

        const seedInstance = await tx.lmsInstances.findUniqueOrThrow({ where: { url: "seed-TEXTBOOK" } });
        const created = await post(input);
        assert.equal(created.status, 201);
        const body = await created.json();
        const offering = await tx.courseOfferings.findUniqueOrThrow({ where: { id: body.data.id }, include: { inst_books: true } });
        assert.equal(offering.lms_course_num, "9999999");
        const chosenInstance = await tx.lmsInstances.findUniqueOrThrow({ where: { id: offering.lms_instance_id } });
        assert(["TEXTBOOK", "seed-TEXTBOOK"].includes(chosenInstance.url));
        assert.equal(offering.inst_books.length, 1);
        assert.notEqual(offering.inst_books[0].id, source.id);
        assert.equal(offering.inst_books[0].user_id, owner.id);
        assert.equal(offering.inst_books[0].last_compiled, null);
        assert.equal(await tx.instChapters.count({ where: { inst_book_id: offering.inst_books[0].id } }),
          await tx.instChapters.count({ where: { inst_book_id: source.id } }));
        assert(await tx.courseEnrollments.findFirst({ where: { user_id: owner.id,
          course_offering_id: offering.id, course_role: { name: "Instructor" } } }));
        const duplicate = await post(input);
        assert.equal(duplicate.status, 200);
        assert.equal((await duplicate.json()).data.id, offering.id);
        assert.equal(await tx.instBooks.count(), before + 1);
        assert.equal((await post(input, researcher)).status, 403);
        const detail = await (await fetch(base + "/api" + body.url)).json();
        assert.equal(detail.data.standalone, true);
        const generation = await fetch(base + body.url.replace("/course-offerings/", "/api/course-offerings/") + "/generate", {
          method: "POST", headers: instructor,
        });
        assert.equal(generation.status, 400);
        assert.match((await generation.json()).error, /Standalone textbook compilation/);

        // Canonical legacy instance wins over the seed alias when both exist.
        const canonical = await tx.lmsInstances.upsert({ where: { url: "TEXTBOOK" }, update: {},
          create: { url: "TEXTBOOK", lms_type_id: seedInstance.lms_type_id, organization_id: org.id } });
        const legacy = await post({ ...input, label: input.label + " legacy" });
        assert.equal(legacy.status, 201);
        assert.equal((await legacy.json()).data.lms_instance_id, canonical.id);
        throw sentinel;
      }, { timeout: 30000 }), error => error === sentinel);
    } finally {
      prisma.$transaction = transaction;
      prisma.lmsInstances.findMany = lmsLookup;
      prisma.courseOfferings.findUnique = offeringLookup;
      prisma.courseEnrollments.findFirst = enrollmentLookup;
    }
    assert.equal(await prisma.instBooks.count(), before);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
