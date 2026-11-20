import type { Request } from "express";
import type { LaunchContext } from "ltijs";
import { prisma } from "../db";
import { ltiProvider } from "./provider";

export interface LaunchSession {
  userId: number;
  courseOfferingId: number | null;
  instBookId: number | null;
  lmsInstanceId: number | null;
  ltik: string | null;
  context: LaunchContext | null;
}

function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const value = header.slice(7).trim();
    return value || null;
  }
  const query = req.query.ltik;
  return typeof query === "string" && query.length > 0 ? query : null;
}

/**
 * Resolve the current exercise-session user.
 *
 * LTI 1.3 requests carry the `ltik` token that the launch page injected into
 * `ODSA.TP`, so the endpoint can resume ltijs's LaunchContext without relying
 * on a third-party iframe cookie. LTI 1.1 falls back to the iron-session.
 */
export async function resolveLaunchSession(req: Request): Promise<LaunchSession | null> {
  const ltik = bearerToken(req);
  if (ltik) {
    try {
      const context = await ltiProvider.getLaunchContext(ltik);
      const launch = await prisma.ltiLaunches.findFirst({
        where: { id_token: ltik },
        orderBy: { id: "desc" },
      });
      if (!launch) return null;
      const book = await prisma.instBooks.findFirst({
        where: { course_offering_id: launch.course_offering_id },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return {
        userId: launch.user_id,
        courseOfferingId: launch.course_offering_id,
        instBookId: book?.id ?? null,
        lmsInstanceId: launch.lms_instance_id,
        ltik,
        context,
      };
    } catch (error) {
      console.warn("[lti] unable to resume launch session", error);
      return null;
    }
  }

  const userId = req.authSession?.userId;
  if (Number.isSafeInteger(userId) && (userId ?? 0) > 0) {
    const sessionLtik = req.authSession.ltik ?? null;
    let context: LaunchContext | null = null;
    if (sessionLtik) {
      try {
        context = await ltiProvider.getLaunchContext(sessionLtik);
      } catch {
        // The session is still usable for progress writes; passback will be
        // skipped if the launch context has expired.
      }
    }
    if (!req.authSession.instBookId) {
      console.warn(
        "[lti] cookie session has a user but no launch book; " +
        "the Canvas iframe cookie may have been blocked"
      );
    }
    return {
      userId: userId!,
      courseOfferingId: req.authSession.courseOfferingId ?? null,
      instBookId: req.authSession.instBookId ?? null,
      lmsInstanceId: req.authSession.lmsInstanceId ?? null,
      ltik: sessionLtik,
      context,
    };  }

  return null;
}
