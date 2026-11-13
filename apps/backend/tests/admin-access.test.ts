import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

test("admin namespace denies non-administrators and rechecks role changes on every request", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const original = prisma.users.findUnique;
  try {
    assert.equal((await fetch(base + "/api/admin/users")).status, 401);
    for (const email of ["seed-alice@example.com", "seed-academic-instructor@example.com", "seed-academic-researcher@example.com"]) {
      const headers = await signInForTest(base, email);
      const response = await fetch(base + "/api/admin/users", { headers });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "Administrator access required." });
    }
    const administrator = await signInForTest(base, "seed-academic-admin@example.com");
    const me = await (await fetch(base + "/api/auth/me", { headers: administrator })).json();
    // Administrators can read users; edits require a CSRF token.
    assert.equal((await fetch(base + "/api/admin/users", { headers: administrator })).status, 200);
    const editable = ["organizations", "terms", "courses", "course-offerings", "course-roles", "late-policies", "lms-types", "lms-instances"];
    for (const resource of ["organizations", "terms", "courses", "course-offerings", "books", "users", "roles", "course-roles", "late-policies", "lms-types", "lms-instances"]) {
      const response = await fetch(`${base}/api/admin/${resource}?page=1&per_page=1&sort=id&order=ASC`, { headers: administrator });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(Number.isInteger(result.total));
      assert.ok(result.data.length <= 1);
      const checkSafe = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          assert.ok(!/password|token|secret|api_key|options/.test(key), `Sensitive field exposed: ${key}`);
          checkSafe(child);
        }
      };
      checkSafe(result.data);
      if (result.data.length) {
        const detail = await fetch(`${base}/api/admin/${resource}/${result.data[0].id}`, { headers: administrator });
        assert.equal(detail.status, 200);
        const record = (await detail.json()).data;
        checkSafe(record);
        assert.deepEqual(record, result.data[0]);
      }
      for (const query of ["per_page=101", "sort=encrypted_password", "page=0", "order=invalid"]) {
        assert.equal((await fetch(`${base}/api/admin/${resource}?${query}`, { headers: administrator })).status, 400);
      }
      for (const method of ["POST", "PATCH", "DELETE"]) {
        assert.equal((await fetch(`${base}/api/admin/${resource}`, { method, headers: administrator })).status, editable.includes(resource) && method === "POST" ? 400 : 405);
      }
      for (const method of ["PATCH", "DELETE"]) {
        assert.equal((await fetch(`${base}/api/admin/${resource}/1`, { method, headers: administrator })).status, (editable.includes(resource) || resource === "users") && method === "PATCH" ? 400 : 405);
      }
      assert.equal((await fetch(`${base}/api/admin/${resource}/2147483647`, { headers: administrator })).status, 404);
      assert.equal((await fetch(`${base}/api/admin/${resource}/invalid`, { headers: administrator })).status, 400);
    }
    let role = { name: "Regular User", can_manage_all_courses: false, can_edit_system_configuration: false };
    prisma.users.findUnique = (async (args: any) => {
      const user = await original.call(prisma.users, args);
      return user && args.where.id === me.user.id ? { ...user, global_role: role } : user;
    }) as typeof prisma.users.findUnique;
    assert.equal((await fetch(base + "/api/admin/users", { headers: administrator })).status, 403,
      "An existing cookie must not retain access after demotion");
    role = { ...role, name: "Instructor", can_manage_all_courses: true };
    assert.equal((await fetch(base + "/api/admin/users", { headers: administrator })).status, 403,
      "Managing all courses does not grant system administration");
    role = { ...role, can_edit_system_configuration: true };
    assert.equal((await fetch(base + "/api/admin/users", { headers: administrator })).status, 200,
      "Legacy system-configuration permission grants admin access");
    role = { name: "Administrator", can_manage_all_courses: false, can_edit_system_configuration: false };
    assert.equal((await fetch(base + "/api/admin/users", { headers: administrator })).status, 200);
  } finally {
    prisma.users.findUnique = original;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.$disconnect();
  }
});
