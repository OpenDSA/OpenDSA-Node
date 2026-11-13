import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("admin dashboard exposes recent sign-ins and term offerings, with fallback and empty states", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const termLookup = prisma.terms.findFirst, userList = prisma.users.findMany, offeringsList = prisma.courseOfferings.findMany;
  try {
    assert.equal((await fetch(base + "/api/admin/dashboard")).status, 401);
    const regular = await signInForTest(base, "seed-alice@example.com");
    assert.equal((await fetch(base + "/api/admin/dashboard", { headers: regular })).status, 403);
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const response = await fetch(base + "/api/admin/dashboard", { headers: admin });
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const actual = await response.json();
    assert.ok(actual.recentUsers.length <= 20);
    for (let i = 0; i < actual.recentUsers.length; i++) {
      assert.deepEqual(Object.keys(actual.recentUsers[i]).sort(),
        ["id", "first_name", "last_name", "email", "current_sign_in_at", "current_sign_in_ip"].sort());
      assert.ok(actual.recentUsers[i].current_sign_in_at);
      if (i) assert.ok(actual.recentUsers[i - 1].current_sign_in_at >= actual.recentUsers[i].current_sign_in_at);
    }
    const term = { id: 123, slug: "fall-2026", season: 400, year: 2026,
      starts_on: new Date("2026-08-01"), ends_on: new Date("2026-12-31") };
    let active = true, available = true;
    prisma.terms.findFirst = (async (args: any) => args.where ? (active ? term : null) : (available ? term : null)) as any;
    prisma.users.findMany = (async (args: any) => {
      assert.equal(args.take, 20);
      assert.deepEqual(args.where, { current_sign_in_at: { not: null } });
      return [];
    }) as any;
    prisma.courseOfferings.findMany = (async (args: any) => {
      assert.equal(args.where.term_id, term.id);
      return [{ id: 1, label: "Test", archived: false, course: { id: 2, name: "Course", number: "CS1" },
        course_enrollments: [{ user: { id: 3, email: "instructor@example.com", first_name: null, last_name: null } }] }];
    }) as any;
    let body = await (await fetch(base + "/api/admin/dashboard", { headers: admin })).json();
    assert.equal(body.termIsCurrent, true);
    assert.equal(body.offerings[0].instructor.id, 3);
    assert.ok(!("course_enrollments" in body.offerings[0]));
    active = false;
    body = await (await fetch(base + "/api/admin/dashboard", { headers: admin })).json();
    assert.equal(body.termIsCurrent, false); assert.equal(body.term.id, term.id);
    available = false;
    body = await (await fetch(base + "/api/admin/dashboard", { headers: admin })).json();
    assert.equal(body.term, null); assert.deepEqual(body.offerings, []);
  } finally {
    prisma.terms.findFirst = termLookup; prisma.users.findMany = userList; prisma.courseOfferings.findMany = offeringsList;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
