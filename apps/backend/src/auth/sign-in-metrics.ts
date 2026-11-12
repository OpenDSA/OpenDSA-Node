import type { Request } from "express";
import { prisma } from "../db";

// One atomic update prevents concurrent sign-ins from losing increments or
// copying a stale previous login. Match Devise: first last_sign_in = current.
export async function recordSignIn(userId: number, req: Request) {
  const now = new Date();
  const ip = req.ip || req.socket.remoteAddress || null;
  await prisma.$executeRaw`
    UPDATE users SET
      last_sign_in_at = COALESCE(current_sign_in_at, ${now}),
      last_sign_in_ip = COALESCE(current_sign_in_ip, ${ip}),
      current_sign_in_at = ${now}, current_sign_in_ip = ${ip},
      sign_in_count = sign_in_count + 1, updated_at = ${now}
    WHERE id = ${userId}
  `;
}
