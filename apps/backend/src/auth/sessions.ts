import { randomBytes } from "node:crypto";
import { RequestHandler } from "express";
import { getIronSession, IronSession } from "iron-session";

export const sessionLifetimeSeconds = 8 * 60 * 60;
export const sessionCookieName = "opendsa.session";
export const productionAuth = process.env.NODE_ENV === "production";
if (productionAuth && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production (at least 32 characters).");
}
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
const proxyHops = process.env.TRUST_PROXY_HOPS || "0";
if (!/^\d+$/.test(proxyHops) || !Number.isSafeInteger(Number(proxyHops))) {
  throw new Error("TRUST_PROXY_HOPS must be a nonnegative integer.");
}
export const trustProxyHops = Number(proxyHops);

export interface SessionData {
  userId?: number;
  csrfToken?: string;
  expiresAt?: number;
  // stashed here after an lti launch so grade passback (not built yet) has
  // somewhere to read them back from later - see lti/post-launch.ts
  lisOutcomeServiceUrl?: string;
  lisResultSourcedid?: string;
}

declare global {
  namespace Express { interface Request { authSession: IronSession<SessionData> } }
}

export const cookieSession: RequestHandler = async (req, res, next) => {
  try {
    // Public health probes use internal HTTP; never restore login over it.
    if (productionAuth && !req.secure) { next(); return; }
    req.authSession = await getIronSession<SessionData>(req, res, {
      cookieName: sessionCookieName,
      password: sessionSecret,
      ttl: sessionLifetimeSeconds,
      cookieOptions: { httpOnly: true, sameSite: productionAuth ? "none" : "lax", secure: productionAuth, path: "/" }, // none in prod so the cookie survives canvas's cross site iframe
    });
    // Keep login expiry fixed even when saving a new CSRF cookie later.
    if (req.authSession.userId !== undefined &&
        (!Number.isSafeInteger(req.authSession.userId) || req.authSession.userId <= 0 ||
         typeof req.authSession.expiresAt !== "number" || req.authSession.expiresAt <= Date.now())) {
      req.authSession.destroy();
    }
    next();
  } catch (error) { next(error); }
};
