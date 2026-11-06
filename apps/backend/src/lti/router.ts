// the actual inbound lti 1.1 launch endpoint. based on the launch action in
// lti_controller.rb (lines 9-53)

import { Router } from "express";
import { prisma } from "../db";
import { validateLtiLaunch } from "./validate-launch";
import { ensureLmsInstance, ensureUser, ltiEnroll } from "./post-launch";
import { buildBookOutputPath } from "../course_creation/utils";
import { sessionLifetimeSeconds } from "../auth/sessions";

export const ltiRouter = Router();

ltiRouter.post("/lti/launch", async (req, res) => {
  const result = await validateLtiLaunch(req);

  if (!result.valid || !result.context) {
    res.status(401).json({ error: result.message });
    return;
  }
  const context = result.context;

  // old code's launch_standalone_resource handles the no custom_inst_book_id
  // case by auto creating a course offering on first launch - not doing that
  // here yet, out of scope for now
  if (!context.customInstBookId) {
    res.status(400).json({ error: "missing custom_inst_book_id, standalone launches not supported yet" });
    return;
  }

  const instBook = await prisma.instBooks.findUnique({
    where: { id: context.customInstBookId },
    include: {
      course_offering: {
        include: { course: { include: { organization: true } }, term: true },
      },
    },
  });
  if (!instBook || !instBook.course_offering) {
    res.status(404).json({ error: "book or course offering not found" });
    return;
  }

  const lmsInstance = await ensureLmsInstance(context.lmsInstanceUrl, context.lmsTypeName);
  const user = await ensureUser(context, lmsInstance);

  // matches how auth/index.ts's /login route does it now - passport just
  // attaches req.user (session: false so it doesnt try to touch
  // req.session, which doesnt exist anymore), iron-session actually
  // persists the login. no csrf/rate-limit here since this isnt a normal
  // browser form post, the oauth signature already verified the request
  await new Promise<void>((resolve, reject) => {
    req.logIn(user, { session: false }, err => (err ? reject(err) : resolve()));
  }).catch(() => null); // fall through unauthenticated if this somehow fails

  if (req.authSession) {
    for (const key of Object.keys(req.authSession)) Reflect.deleteProperty(req.authSession, key);
    req.authSession.userId = user.id;
    req.authSession.expiresAt = Date.now() + sessionLifetimeSeconds * 1000;
    await req.authSession.save();
  }
  // else: request wasnt secure (shouldnt happen going through the real
  // ingress, but cookieSession skips setting authSession over plain http
  // in production) - user stays logged in for just this request via
  // req.user, just wont have a session afterward

  await ltiEnroll(user.id, instBook.course_offering.id, context.isInstructor);

  // custom_course_offering_id present = instructor tool placement, not a
  // regular student content launch. /course-offerings/:id is the real
  // route (apps/web/src/App.tsx) - was guessing /admin/course-offerings
  // before, confirmed this one by actually checking
  if (context.customCourseOfferingId) {
    res.redirect(`/course-offerings/${instBook.course_offering.id}`);
    return;
  }

  const offering = instBook.course_offering;
  const buildPath = buildBookOutputPath({
    organizationSlug: offering.course.organization.slug,
    courseSlug: offering.course.slug,
    termSlug: offering.term.slug,
    courseOfferingLabel: offering.label,
  });

  // todo: old code used custom_module_file_name / custom_section_file_name to
  // deep link to a specific page, just sending to the book index for now
  res.redirect(`/Books/${buildPath}/html/index.html`);
});
