import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Request } from "express";
import { prisma } from "../src/db";
import { buildBookOutputPath } from "../src/course_creation/utils";
import { handleVerifiedLaunch } from "../src/lti/handle-verified-launch";
import type { LtiLaunchContext } from "../src/lti/types";

function fakeRequest() {
  const session: Record<string, unknown> = {};
  session.save = async () => {
    session.saved = true;
  };

  return {
    req: {
      logIn: (
        _user: unknown,
        _options: unknown,
        done: (error?: Error | null) => void
      ) => done(null),
      authSession: session,
    } as unknown as Request,
    session,
  };
}

test("shared post-launch resolves the book, user, session, and redirect", async () => {
  const suffix = randomUUID();
  const email = `lti13-handler-${suffix}@example.com`;
  const lmsUrl = `https://lti13-handler-${suffix}.example`;

  const book = await prisma.instBooks.findFirstOrThrow({
    where: { title: "CS 1114 OpenDSA Book" },
    include: {
      course_offering: {
        include: {
          course: { include: { organization: true } },
          term: true,
        },
      },
    },
  });
  assert(book.course_offering);

  const context: LtiLaunchContext = {
    email,
    rawUserId: "sub-123",
    firstName: "Test",
    lastName: "Instructor",
    isInstructor: true,
    lmsInstanceUrl: lmsUrl,
    lmsTypeName: "Canvas",
    customInstBookId: book.id,
    customCourseOfferingId: null,
    lisOutcomeServiceUrl: "https://canvas.example/lineitems/1",
    lisResultSourcedid: "sub-123",
  };

  try {
    const { req, session } = fakeRequest();
    const result = await handleVerifiedLaunch(req, context);
    assert.equal(result.type, "redirect");
    assert.equal(
      result.type === "redirect" ? result.url : "",
      `/Books/${buildBookOutputPath({
        organizationSlug: book.course_offering.course.organization.slug,
        courseSlug: book.course_offering.course.slug,
        termSlug: book.course_offering.term.slug,
        courseOfferingLabel: book.course_offering.label,
      })}/html/index.html`
    );

    const user = await prisma.users.findUniqueOrThrow({ where: { email } });
    assert.equal(session.userId, user.id);
    assert.equal(session.lisOutcomeServiceUrl, "https://canvas.example/lineitems/1");
    assert.equal(session.lisResultSourcedid, "sub-123");
    assert.equal(session.saved, true);

    const enrollment = await prisma.courseEnrollments.findFirst({
      where: {
        user_id: user.id,
        course_offering_id: book.course_offering.id,
      },
      include: { course_role: true },
    });
    assert.equal(enrollment?.course_role.name, "Instructor");

    // Instructor tool placement takes priority over the book index redirect.
    const tool = fakeRequest();
    const toolResult = await handleVerifiedLaunch(tool.req, {
      ...context,
      customCourseOfferingId: book.course_offering.id,
    });
    assert.deepEqual(toolResult, {
      type: "redirect",
      url: `/course-offerings/${book.course_offering.id}`,
    });
  } finally {
    await prisma.users.deleteMany({ where: { email } });
    await prisma.lmsInstances.deleteMany({ where: { url: lmsUrl } });
  }
});

test("shared post-launch rejects a launch without custom_inst_book_id", async () => {
  const { req } = fakeRequest();
  const result = await handleVerifiedLaunch(req, {
    email: "nobody@example.com",
    rawUserId: "sub-0",
    firstName: null,
    lastName: null,
    isInstructor: false,
    lmsInstanceUrl: "https://unused.example",
    lmsTypeName: "Canvas",
    customInstBookId: null,
    customCourseOfferingId: null,
    lisOutcomeServiceUrl: null,
    lisResultSourcedid: null,
  });

  assert.equal(result.type, "error");
  assert.equal(result.type === "error" ? result.status : 0, 400);
});
