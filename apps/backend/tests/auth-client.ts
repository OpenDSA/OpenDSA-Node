import assert from "node:assert/strict";
import { hash } from "bcryptjs";
import { prisma } from "../src/db";

// Supply a test-only hash during login without changing any stored password.
export async function signInForTest(base: string, email = "seed-academic-instructor@example.com") {
  const csrfResponse = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json();
  const cookie = csrfResponse.headers.get("set-cookie")!.split(";")[0];
  const original = prisma.users.findUnique;
  const passwordHash = await hash("Auth-test-password", 4);
  prisma.users.findUnique = (async (args: any) => {
    const user = await original.call(prisma.users, args);
    return user && args.select?.encrypted_password ? { ...user, encrypted_password: passwordHash } : user;
  }) as typeof prisma.users.findUnique;
  try {
    const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: {
      Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": csrfToken,
    }, body: JSON.stringify({ email, password: "Auth-test-password" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.notEqual(response.headers.get("set-cookie")!.split(";")[0], cookie, "Login must rotate the session ID");
    assert.notEqual(body.csrfToken, csrfToken, "Login must rotate the CSRF token");
    return { Cookie: response.headers.get("set-cookie")!.split(";")[0], "X-CSRF-Token": body.csrfToken };
  } finally { prisma.users.findUnique = original; }
}
