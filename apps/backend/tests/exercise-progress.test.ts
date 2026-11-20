import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma } from "../src/db";
import { recordKaAttempt, recordPeAttempt } from "../src/lti/exercise-progress";

test("PE attempts create exercise progress and update the module score", async () => {
  const role = await prisma.globalRoles.findFirstOrThrow({ orderBy: { id: "asc" } });
  const suffix = randomUUID();
  const user = await prisma.users.create({
    data: {
      email: `exercise-progress-${suffix}@example.com`,
      slug: `exercise-progress-${suffix}`,
      first_name: "Exercise",
      last_name: "Test",
      global_role_id: role.id,
    },
  });

  try {
    const result = await recordPeAttempt({
      userId: user.id,
      instBookId: 1,
      ip: "127.0.0.1",
      body: {
        inst_book_section_exercise_id: 2,
        score: 1,
        threshold: 0.9,
        total_time: 5000,
        uiid: 12345,
        exercise: "binarySearchPRO",
      },
    });

    assert.equal(result.threshold, 0.9);
    assert.equal(result.was_proficient, false);
    assert.equal(result.is_proficient, true);
    assert.equal(result.exercise_progress.current_score, 2);
    assert.equal(result.exercise_progress.highest_score, 2);
    assert.equal(result.module_result?.progress.current_score, 1);
    assert.equal(result.module_result?.progress.highest_score, 1);
    assert.equal(result.module_result?.isComplete, true);
    assert.equal(result.module_result?.scoreMaximum, 2);
    assert.equal(await prisma.odsaExerciseAttempts.count({
      where: { user_id: user.id },
    }), 1);
  } finally {
    await prisma.odsaExerciseAttempts.deleteMany({ where: { user_id: user.id } });
    await prisma.odsaExerciseProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.odsaModuleProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.users.delete({ where: { id: user.id } });
  }
});

test("KA attempts accumulate worth-credit attempts toward the module score", async () => {
  const role = await prisma.globalRoles.findFirstOrThrow({ orderBy: { id: "asc" } });
  const suffix = randomUUID();
  const user = await prisma.users.create({
    data: {
      email: `exercise-progress-ka-${suffix}@example.com`,
      slug: `exercise-progress-ka-${suffix}`,
      first_name: "Exercise",
      last_name: "Test",
      global_role_id: role.id,
    },
  });

  try {
    let result;
    for (let i = 0; i < 5; i++) {
      result = await recordKaAttempt({
        userId: user.id,
        instBookId: 1,
        ip: "127.0.0.1",
        body: {
          inst_book_section_exercise_id: 9,
          complete: 1,
          count_hints: 0,
          attempt_number: 1,
          time_taken: 1000,
          problem_type: `q${i}`,
          exercise: "InssortSumm",
        },
      });
    }
    assert(result);
    assert.equal(result.exercise_progress.current_score, 5);
    assert.equal(result.exercise_progress.highest_score, 5);
    assert.equal(result.is_proficient, true);
    assert.equal(result.module_result?.progress.highest_score, 0.5);
  } finally {
    await prisma.odsaExerciseAttempts.deleteMany({ where: { user_id: user.id } });
    await prisma.odsaExerciseProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.odsaModuleProgresses.deleteMany({ where: { user_id: user.id } });
    await prisma.users.delete({ where: { id: user.id } });
  }
});
