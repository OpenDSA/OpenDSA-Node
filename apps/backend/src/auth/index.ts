import { randomBytes, timingSafeEqual } from "node:crypto";
import { RequestHandler, Router } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import { compare, hashSync } from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../db";

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
declare module "express-session" { interface SessionData { csrfToken?: string } }

// MemoryStore is intentionally restricted to local development/test usage.
export function authEnabled() { return [undefined, "development", "test"].includes(process.env.NODE_ENV); }
const sessionMiddleware = session({
  name: "opendsa.sid", secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false },
});
export const authSession: RequestHandler = (req, res, next) => {
  if (!authEnabled()) { next(); return; }
  sessionMiddleware(req, res, next);
};
export const passportSession: RequestHandler = (req, res, next) => {
  if (!authEnabled()) { next(); return; }
  passport.session()(req, res, next);
};
export const initializePassport = passport.initialize();
const dummyHash = hashSync(randomBytes(32).toString("hex"), 10);
passport.use(new Strategy({ usernameField: "email" }, async (email, password, done) => {
  try {
    if (typeof email !== "string" || typeof password !== "string" || email.length > 255 ||
        !password || Buffer.byteLength(password, "utf8") > 72) { done(null, false); return; }
    const user = await prisma.users.findUnique({ where: { email: email.trim().toLowerCase() },
      select: { ...authUserSelect, encrypted_password: true } });
    const validHash = user?.encrypted_password && /^\$2[ab]\$/.test(user.encrypted_password);
    const valid = await compare(password, validHash ? user.encrypted_password : dummyHash);
    if (!user || !validHash || !valid) { done(null, false); return; }
    const { encrypted_password: _password, ...safeUser } = user;
    done(null, safeUser);
  } catch (error) { done(error); }
}));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id: number, done) => {
  try { done(null, await loadUser(id) || false); } catch (error) { done(error); }
});

export const requireAuthentication: RequestHandler = (req, res, next) => {
  if (!authEnabled()) { res.status(503).json({ error: "Persistent sessions must be configured before deploying password authentication." }); return; }
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
  const expected = req.session?.csrfToken;
  const supplied = req.get("X-CSRF-Token");
  if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(supplied) || supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    res.status(403).json({ error: "Invalid request token. Reload and retry." }); return;
  }
  next();
};

export const authRouter = Router();
authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!authEnabled()) { res.status(503).json({ error: "Password authentication is development-only until persistent sessions are configured." }); return; }
  next();
});
authRouter.get("/csrf", (req, res) => {
  req.session.csrfToken ??= randomBytes(32).toString("hex");
  res.json({ csrfToken: req.session.csrfToken });
});
authRouter.get("/me", (req, res) => res.json({ user: req.user || null }));
authRouter.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." } }), requireCsrf, (req, res, next) => {
  passport.authenticate("local", (error: unknown, user: AuthUser | false) => {
    if (error) { next(error); return; }
    if (!user) { res.status(401).json({ error: "Invalid email or password." }); return; }
    // Passport regenerates the session on login, preventing session fixation.
    req.logIn(user, error => {
      if (error) { next(error); return; }
      req.session.csrfToken = randomBytes(32).toString("hex");
      req.session.save(error => {
        if (error) { next(error); return; }
        res.json({ user, csrfToken: req.session.csrfToken });
      });
    });
  })(req, res, next);
});
authRouter.post("/logout", requireAuthentication, requireCsrf, (req, res, next) => {
  req.logout(error => {
    if (error) { next(error); return; }
    req.session.destroy(error => {
      if (error) { next(error); return; }
      res.clearCookie("opendsa.sid", { httpOnly: true, sameSite: "lax", secure: false });
      res.status(204).end();
    });
  });
});
