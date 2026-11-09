import { randomBytes, timingSafeEqual } from "node:crypto";
import { RequestHandler, Router } from "express";
import passport from "passport";
import { Strategy } from "passport-local";
import { verifyPassword } from "./passwords";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../db";
import { cookieSession, productionAuth, sessionLifetimeSeconds } from "./sessions";

export const authUserSelect = {
  id: true, email: true, first_name: true, last_name: true,
  global_role: { select: { name: true, can_manage_all_courses: true, can_edit_system_configuration: true } },
} as const;
type AuthUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;
function loadUser(id: number) { return prisma.users.findUnique({ where: { id }, select: authUserSelect }); }

declare global {
  namespace Express { interface User {
    id: number; email: string; first_name: string | null; last_name: string | null;
    global_role: { name: string; can_manage_all_courses: boolean; can_edit_system_configuration: boolean };
  } }
}
export const authSession: RequestHandler = (req, res, next) => {
  cookieSession(req, res, next);
};
export const restoreUser: RequestHandler = async (req, _res, next) => {
  if (!req.authSession) { next(); return; }
  try {
    if (req.authSession.userId) {
      const user = await loadUser(req.authSession.userId);
      if (user) req.user = user;
      else req.authSession.destroy();
    }
    next();
  } catch (error) { next(error); }
};
export const initializePassport = passport.initialize();
passport.use(new Strategy({ usernameField: "email" }, async (email, password, done) => {
  try {
    if (typeof email !== "string" || typeof password !== "string" || email.length > 255 ||
        !password || Buffer.byteLength(password, "utf8") > 72) { done(null, false); return; }
    const user = await prisma.users.findUnique({ where: { email: email.trim().toLowerCase() },
      select: { ...authUserSelect, encrypted_password: true } });
    const valid = await verifyPassword(password, user?.encrypted_password);
    if (!user || !valid) { done(null, false); return; }
    const { encrypted_password: _password, ...safeUser } = user;
    done(null, safeUser);
  } catch (error) { done(error); }
}));

export const requireAuthentication: RequestHandler = (req, res, next) => {
  if (productionAuth && !req.secure) { res.status(400).json({ error: "HTTPS is required for authentication." }); return; }
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Sign in required." }); return; }
  next();
};
export function canCreateOfferings(user: Express.User) {
  return user.global_role.can_manage_all_courses || ["Administrator", "Instructor", "Researcher"].includes(user.global_role.name);
}
export const requireInstructor: RequestHandler = (req, res, next) => {
  if (!req.user || !canCreateOfferings(req.user)) { res.status(403).json({ error: "Instructor access required." }); return; }
  next();
};
export async function canManageOffering(user: Express.User, offeringId: number) {
  if (user.global_role.can_manage_all_courses) return true;
  return !!await prisma.courseEnrollments.findFirst({ where: {
    user_id: user.id, course_offering_id: offeringId, course_role: { can_manage_course: true },
  }, select: { id: true } });
}
export const requireCsrf: RequestHandler = (req, res, next) => {
  const expected = req.authSession?.csrfToken;
  const supplied = req.get("X-CSRF-Token");
  if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(supplied) || supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    res.status(403).json({ error: "Invalid request token. Reload and retry." }); return;
  }
  next();
};

export const authRouter = Router();
authRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (productionAuth && !req.secure) { res.status(400).json({ error: "HTTPS is required for authentication." }); return; }
  next();
});
authRouter.get("/csrf", async (req, res) => {
  req.authSession.csrfToken ??= randomBytes(32).toString("hex");
  await req.authSession.save();
  res.json({ csrfToken: req.authSession.csrfToken });
});
authRouter.get("/me", (req, res) => res.json({ user: req.user || null }));
authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." } }), requireCsrf, (req, res, next) => {
  passport.authenticate("local", { session: false }, (error: unknown, user: AuthUser | false) => {
    if (error) { next(error); return; }
    if (!user) { res.status(401).json({ error: "Invalid email or password." }); return; }
    // Passport validates credentials; iron-session owns session persistence.
    req.logIn(user, { session: false }, async error => {
      if (error) { next(error); return; }
      try {
        for (const key of Object.keys(req.authSession)) Reflect.deleteProperty(req.authSession, key);
        req.authSession.userId = user.id;
        req.authSession.expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
        req.authSession.csrfToken = randomBytes(32).toString("hex");
        await req.authSession.save();
        res.json({ user, csrfToken: req.authSession.csrfToken });
      } catch (error) { next(error); }
    });
  })(req, res, next);
});
authRouter.post("/logout", requireAuthentication, requireCsrf, (req, res) => {
  delete req.user;
  req.authSession.destroy();
  res.status(204).end();
});
