import { randomBytes } from "node:crypto";
import { compare, hash, hashSync } from "bcryptjs";

const passwordCost = 10;
const dummyHash = hashSync(randomBytes(32).toString("hex"), passwordCost);

// Devise appends its configured pepper before passing the password to bcrypt.
// An unset/empty pepper preserves existing unpeppered development passwords.
function passwordInput(password: string) {
  return password + (process.env.PASSWORD_PEPPER || "");
}

export function hashPassword(password: string) {
  return hash(passwordInput(password), passwordCost);
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  const supported = !!storedHash && /^\$2[ab]\$/.test(storedHash);
  // Still perform bcrypt work when the account or its password hash is missing.
  const matches = await compare(passwordInput(password), supported ? storedHash : dummyHash);
  return supported && matches;
}
