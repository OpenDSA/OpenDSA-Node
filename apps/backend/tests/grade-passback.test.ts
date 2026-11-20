import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma } from "../src/db";
import { sendModuleScore } from "../src/lti/grade-passback";
import { ltiProvider } from "../src/lti/provider";

test("AGS passback scales the normalized module score to the line item maximum", async () => {
  const role = await prisma.globalRoles.findFirstOrThrow({ orderBy: { id: "asc" } });
  const suffix = randomUUID();
  const user = await prisma.users.create({
    data: {
      email: `ags-passback-${suffix}@example.com`,
      slug: `ags-passback-${suffix}`,
      first_name: "AGS",
      last_name: "Test",
      global_role_id: role.id,
    },
  });
  const now = new Date();
  const lms = await prisma.lmsInstances.create({
    data: {
      url: `https://ags-${suffix}.example`,
      client_id: "test-client",
      oauth2_url: "https://ags.example/token",
      created_at: now,
      updated_at: now,
    },
  });
  const progress = await prisma.odsaModuleProgresses.create({
    data: {
      user_id: user.id,
      inst_book_id: 1,
      inst_chapter_module_id: 2,
      lis_outcome_service_url: "https://canvas.example/line_items/1",
      lis_result_sourcedid: "sub-123",
      first_done: now,
      last_done: now,
      proficient_date: new Date(0),
      current_score: 0.5,
      highest_score: 0.5,
      last_passback: new Date(0),
      created_at: now,
      updated_at: now,
    },
  });

  const original = ltiProvider.getLaunchContext.bind(ltiProvider);
  const submitted: Array<{ lineItemId: string; score: Record<string, unknown> }> = [];
  (ltiProvider as unknown as { getLaunchContext: typeof ltiProvider.getLaunchContext })
    .getLaunchContext = async () => ({
      grading: {
        isAvailable: () => true,
        submitScore: async (lineItemId: string, score: Record<string, unknown>) => {
          submitted.push({ lineItemId, score });
          return score;
        },
      },
    }) as never;

  try {
    const result = await sendModuleScore({
      ltik: "fake-ltik",
      lmsInstanceId: lms.id,
      moduleProgress: progress,
      scoreMaximum: 4,
      scoreIncreased: true,
      isComplete: false,
    });
    assert.equal(result.sent, true);
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].lineItemId, "https://canvas.example/line_items/1");
    assert.equal(submitted[0].score.userId, "sub-123");
    assert.equal(submitted[0].score.scoreGiven, 2);
    assert.equal(submitted[0].score.scoreMaximum, 4);
    assert.equal(submitted[0].score.activityProgress, "InProgress");
    assert.equal(submitted[0].score.gradingProgress, "FullyGraded");

    const saved = await prisma.odsaModuleProgresses.findUniqueOrThrow({
      where: { id: progress.id },
    });
    assert(saved.last_passback.getTime() > 0);
  } finally {
    (ltiProvider as unknown as { getLaunchContext: typeof ltiProvider.getLaunchContext })
      .getLaunchContext = original;
    await prisma.odsaModuleProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.lmsInstances.delete({ where: { id: lms.id } });
    await prisma.users.delete({ where: { id: user.id } });
  }
});
