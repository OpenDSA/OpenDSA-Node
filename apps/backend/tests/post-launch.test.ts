import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db";
import { ensureUser, ltiEnroll } from "../src/lti/post-launch";
import { LtiLaunchContext } from "../src/lti/types";

// integration test: requires the migrated development mysql database (run the
// seed first). everything runs inside one transaction that gets rolled back
// via the sentinel throw, same pattern as textbooks.test.ts, so nothing from
// here actually sticks around in the dev db afterward

function fakeContext(overrides: Partial<LtiLaunchContext> = {}): LtiLaunchContext {
  return {
    email: "",
    rawUserId: null,
    firstName: "Test",
    lastName: "Student",
    isInstructor: false,
    lmsInstanceUrl: "",
    lmsTypeName: "Canvas",
    customInstBookId: null,
    customCourseOfferingId: null,
    lisOutcomeServiceUrl: null,
    lisResultSourcedid: null,
    ...overrides,
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

test("ensureUser and ltiEnroll recover from a simultaneous-launch create race", async () => {
  const transaction = prisma.$transaction;
  const usersCreate = prisma.users.create;
  const usersFindUnique = prisma.users.findUnique;
  const enrollmentsCreate = prisma.courseEnrollments.create;
  const enrollmentsFindUnique = prisma.courseEnrollments.findUnique;
  const sentinel = new Error("Rollback post-launch test fixtures");

  try {
    await assert.rejects(
      transaction.call(prisma, async (tx: any) => {
        prisma.$transaction = (async (callback: any) => callback(tx)) as any;
        // post-launch.ts reads/writes through the module-level prisma client,
        // so everything it touches needs to resolve against tx while this
        // runs or it won't see the rows created below until a commit that
        // never happens
        prisma.users.create = ((args: any) => tx.users.create(args)) as any;
        prisma.users.findUnique = ((args: any) => tx.users.findUnique(args)) as any;
        prisma.courseEnrollments.create = ((args: any) => tx.courseEnrollments.create(args)) as any;
        prisma.courseEnrollments.findUnique = ((args: any) => tx.courseEnrollments.findUnique(args)) as any;

        const lmsInstance = await tx.lmsInstances.findUniqueOrThrow({
          where: { url: "https://seed-canvas.example.invalid" },
        });
        const offering = await tx.courseOfferings.findFirstOrThrow();
        const email = `post-launch-test-${randomUUID()}@example.com`;
        const globalRole = await tx.globalRoles.findFirstOrThrow({ where: { name: "Regular User" } });

        // a losing create() races against a winner that already landed - the
        // retry should find the winner's row instead of throwing
        // same first/last name as the default fakeContext() below so the
        // "name changed since last launch" update path doesn't also fire here -
        // that's a separate behavior, not what this test is checking
        const winner = await tx.users.create({
          data: { email, slug: `post-launch-test-${randomUUID()}`, first_name: "Test", last_name: "Student",
            global_role_id: globalRole.id },
          include: { global_role: true },
        });
        const realCreate = prisma.users.create;
        prisma.users.create = (async () => { throw p2002(); }) as any;
        let loser;
        try {
          loser = await ensureUser(fakeContext({ email }), lmsInstance);
        } finally {
          prisma.users.create = realCreate;
        }
        assert.equal(loser.id, winner.id, "ensureUser should return the row the winner created, not throw");

        // same shape of race for course enrollment
        const winningEnrollment = await tx.courseEnrollments.create({
          data: { user_id: winner.id, course_offering_id: offering.id, course_role_id:
            (await tx.courseRoles.findFirstOrThrow({ where: { name: "Student" } })).id },
        });
        const realEnrollCreate = prisma.courseEnrollments.create;
        prisma.courseEnrollments.create = (async () => { throw p2002(); }) as any;
        try {
          await assert.doesNotReject(ltiEnroll(winner.id, offering.id, false));
        } finally {
          prisma.courseEnrollments.create = realEnrollCreate;
        }
        const enrollment = await tx.courseEnrollments.findUniqueOrThrow({
          where: { user_id_course_offering_id: { user_id: winner.id, course_offering_id: offering.id } },
        });
        assert.equal(enrollment.id, winningEnrollment.id);

        throw sentinel;
      }, { timeout: 30000 }),
      error => error === sentinel,
    );
  } finally {
    prisma.$transaction = transaction;
    prisma.users.create = usersCreate;
    prisma.users.findUnique = usersFindUnique;
    prisma.courseEnrollments.create = enrollmentsCreate;
    prisma.courseEnrollments.findUnique = enrollmentsFindUnique;
    await prisma.$disconnect();
  }
});
