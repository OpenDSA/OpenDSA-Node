import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, hash } from "bcryptjs";
import { hashPassword, verifyPassword } from "../src/auth/passwords";

test("password hashing matches Devise pepper concatenation and bcrypt cost", async () => {
  const original = process.env.PASSWORD_PEPPER;
  try {
    process.env.PASSWORD_PEPPER = "test-only-pepper";
    const stored = await hashPassword("Test-password");
    assert.match(stored, /^\$2[ab]\$10\$/);
    assert.equal(await compare("Test-passwordtest-only-pepper", stored), true);
    assert.equal(await compare("Test-password", stored), false);
    assert.equal(await verifyPassword("Test-password", stored), true);
    assert.equal(await verifyPassword("Wrong-password", stored), false);

    // Verify independently generated bcrypt hashes, including Rails' $2a$ prefix.
    const railsHash = await hash("Test-passwordtest-only-pepper", 4);
    assert.equal(await verifyPassword("Test-password", railsHash.replace(/^\$2b\$/, "$2a$")), true);
    process.env.PASSWORD_PEPPER = "different-pepper";
    assert.equal(await verifyPassword("Test-password", stored), false);
    delete process.env.PASSWORD_PEPPER;
    assert.equal(await verifyPassword("Test-password", stored), false);

    const unpeppered = await hash("Test-password", 4);
    assert.equal(await verifyPassword("Test-password", unpeppered), true);
    assert.equal(await verifyPassword("Test-password", null), false);
    assert.equal(await verifyPassword("Test-password", "unsupported"), false);
  } finally {
    if (original === undefined) delete process.env.PASSWORD_PEPPER;
    else process.env.PASSWORD_PEPPER = original;
  }
});
