import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { courseOptions } from "../src/services/course-options";

// Integration test: requires the migrated development MySQL database; performs no writes.
test("course offering dropdown APIs", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  async function get(path: string, status = 200) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, status);
    return response.json();
  }
  try {
    const organizations = (await get("/organizations")).data;
    assert(Array.isArray(organizations));
    const seeded = await prisma.organizations.findUnique({ where: { slug: "seed-vt" } });
    assert(seeded, "Run the development seed first");
    assert(organizations.some((o: { id: number }) => o.id === seeded.id));
    const courses = (await get(`/courses?organization_id=${seeded.id}`)).data;
    assert(courses.length > 0);
    assert(courses.every((c: { organization_id: number }) => c.organization_id === seeded.id));
    assert((await get("/courses")).data.length >= courses.length);
    assert.deepEqual((await get("/courses?organization_id=2147483647")).data, []);
    for (const query of ["0", "-1", "1.5", "abc", "", "1e2", "2147483648", "1&organization_id=2", "x=1"]) {
      const path = query === "x=1" ? "/courses?organization_id[x]=1" : `/courses?organization_id=${query}`;
      assert.equal(typeof (await get(path, 400)).error, "string");
    }
    const terms = (await get("/terms")).data;
    assert(terms.some((t: { slug: string }) => t.slug === "seed-2023-100"));
    assert(terms.every((t: { starts_on: string }) => !Number.isNaN(Date.parse(t.starts_on))));
    const books = (await get("/book-instances")).data;
    assert(Array.isArray(books));
    const lms = (await get("/lms-instances")).data;
    assert(lms.some((l: { url: string }) => l.url === "https://seed-canvas.example.invalid"));
    for (const row of lms) {
      assert.deepEqual(Object.keys(row).sort(), ["id", "url", "organization_id", "lms_type"].sort());
    }
    // Simulate a database failure and verify a sanitized JSON error.
    const original = courseOptions.organizations;
    try {
      courseOptions.organizations = () => { throw new Error("mysql://private-credentials"); };
      assert.deepEqual(await get("/organizations", 500), { error: "Unable to load course offering options." });
    } finally {
      courseOptions.organizations = original;
    }
    console.log(`Verified seeded organization ${seeded.id}; courses: ${courses.length}; terms: ${terms.length}; books: ${books.length}; LMS instances: ${lms.length}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
