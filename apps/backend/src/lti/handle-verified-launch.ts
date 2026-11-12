import type { Request } from "express";
import { recordSignIn } from "../auth/sign-in-metrics";
import { prisma } from "../db";
import { sessionLifetimeSeconds } from "../auth/sessions";
import { buildBookOutputPath } from "../course_creation/utils";
import { ensureLmsInstance, ensureUser, ltiEnroll } from "./post-launch";
import type { LtiLaunchContext } from "./types";

/**
 * Everything both LTI 1.1 and 1.3 do after their protocol-specific signature
 * verification: resolve the book/offering, create or update the LMS user,
 * enroll them, establish the shared iron-session login, and pick a redirect.
 *
 * Returns a result instead of writing the response so each protocol can use
 * its own response object.
 */
export type VerifiedLaunchResult =
  | { type: "redirect"; url: string }
  | { type: "error"; status: number; message: string };

export async function handleVerifiedLaunch(
  req: Request,
  context: LtiLaunchContext
): Promise<VerifiedLaunchResult> {
  if (!context.customInstBookId) {
    return {
      type: "error",
      status: 400,
      message: "missing custom_inst_book_id, standalone launches not supported yet",
    };
  }

  const instBook = await prisma.instBooks.findUnique({
    where: { id: context.customInstBookId },
    include: {
      course_offering: {
        include: {
          course: { include: { organization: true } },
          term: true,
        },
      },
    },
  });

  if (!instBook || !instBook.course_offering) {
    return {
      type: "error",
      status: 404,
      message: "book or course offering not found",
    };
  }

  const lmsInstance = await ensureLmsInstance(
    context.lmsInstanceUrl,
    context.lmsTypeName
  );
  const user = await ensureUser(context, lmsInstance);
  await recordSignIn(user.id, req);

  // Matches the existing 1.1 launch: passport only attaches req.user here;
  // the iron-session is what actually persists the login across requests.
  await new Promise<void>((resolve, reject) => {
    req.logIn(user, { session: false }, (err) => (err ? reject(err) : resolve()));
  }).catch(() => null);

  if (req.authSession) {
    // Only clear the session data fields; never touch the session methods.
    for (const key of [
      "userId",
      "csrfToken",
      "expiresAt",
      "lisOutcomeServiceUrl",
      "lisResultSourcedid",
    ] as const) {
      Reflect.deleteProperty(req.authSession, key);
    }
    req.authSession.userId = user.id;
    req.authSession.expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
    // Grade passback is not built yet, but keep the launch pointers so the
    // future implementation doesn't need another launch.
    if (context.lisOutcomeServiceUrl) {
      req.authSession.lisOutcomeServiceUrl = context.lisOutcomeServiceUrl;
    }
    if (context.lisResultSourcedid) {
      req.authSession.lisResultSourcedid = context.lisResultSourcedid;
    }
    await req.authSession.save();
  }

  await ltiEnroll(user.id, instBook.course_offering.id, context.isInstructor);

  // Instructor tool placement: send them to the course dashboard.
  if (context.customCourseOfferingId) {
    return {
      type: "redirect",
      url: `/course-offerings/${instBook.course_offering.id}`,
    };
  }

  const offering = instBook.course_offering;
  const buildPath = buildBookOutputPath({
    organizationSlug: offering.course.organization.slug,
    courseSlug: offering.course.slug,
    termSlug: offering.term.slug,
    courseOfferingLabel: offering.label,
  });

  // Deep links to a specific module are a later step; the index page is the
  // current 1.1 behavior and matches the compiled html/ output.
  return {
    type: "redirect",
    url: `/Books/${buildPath}/html/index.html`,
  };
}
