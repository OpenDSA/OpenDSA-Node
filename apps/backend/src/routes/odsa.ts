import { Router, type Request, type Response } from "express";
import { prisma } from "../db";
import { recordKaAttempt, recordPeAttempt, getExerciseProgress } from "../lti/exercise-progress";
import { sendModuleScore } from "../lti/grade-passback";
import { resolveLaunchSession } from "../lti/launch-session";

export const odsaRouter = Router();

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ status: "fail", message });
}

async function requireSession(req: Request) {
  const session = await resolveLaunchSession(req);
  if (!session) return null;
  if (!session.instBookId) return null;
  return session;
}

async function passBack(
  session: { ltik: string | null; lmsInstanceId: number | null },
  result: Awaited<ReturnType<typeof recordPeAttempt>>
) {
  if (!result.module_result) return;
  await sendModuleScore({
    ltik: session.ltik,
    lmsInstanceId: session.lmsInstanceId,
    moduleProgress: result.module_result.progress,
    scoreMaximum: result.module_result.scoreMaximum,
    scoreIncreased: result.module_result.scoreIncreased,
    isComplete: result.module_result.isComplete,
  });
}

function summaryName(body: Record<string, unknown>): string | null {
  const value = body.sha1 ?? body.exercise ?? body.question_name;
  if (typeof value !== "string" || !value.endsWith("Summ")) return null;
  return value;
}

function untrackedSummaryResponse(body: Record<string, unknown>) {
  // Module summary exercises such as BSTSumm are generated into the compiled
  // module but do not have an InstBookSectionExercise/ExerciseInstance row.
  // Treat their progress APIs as valid-but-empty instead of returning an
  // error that the exercise iframe displays as "score server unavailable".
  return {
    exercise_progress: null,
    threshold: typeof body.threshold === "number" ? body.threshold : 1,
    was_proficient: false,
    is_proficient: false,
  };
}

odsaRouter.post("/odsa_exercise_attempts/pe", async (req, res) => {
  const session = await requireSession(req);
  if (!session) {
    fail(res, 401, "LTI launch session is missing or expired.");
    return;
  }
  try {
    const result = await recordPeAttempt({
      userId: session.userId,
      instBookId: session.instBookId!,
      ip: req.ip,
      body: req.body as Record<string, unknown>,
    });
    try {
      await passBack(session, result);
    } catch (error) {
      console.warn("[lti] passback failed after PE attempt", error);
    }
    const { module_result: _moduleResult, ...payload } = result;
    res.json(payload);
  } catch (error) {
    console.error("[odsa] PE attempt failed", error);
    fail(res, 400, error instanceof Error ? error.message : "Exercise attempt failed.");
  }
});

odsaRouter.post("/odsa_exercise_attempts", async (req, res) => {
  const session = await requireSession(req);
  if (!session) {
    fail(res, 401, "LTI launch session is missing or expired.");
    return;
  }
  try {
    const result = await recordKaAttempt({
      userId: session.userId,
      instBookId: session.instBookId!,
      ip: req.ip,
      body: req.body as Record<string, unknown>,
    });
    try {
      await passBack(session, result);
    } catch (error) {
      console.warn("[lti] passback failed after KA attempt", error);
    }
    const { module_result: _moduleResult, ...payload } = result;
    res.json(payload);
  } catch (error) {
    const body = req.body as Record<string, unknown>;
    if (
      summaryName(body) &&
      body.inst_book_section_exercise_id === undefined &&
      error instanceof Error &&
      error.message === "Exercise not found."
    ) {
      console.log(`[odsa] ignoring untracked summary exercise ${summaryName(body)}`);
      res.json(untrackedSummaryResponse(body));
      return;
    }
    console.error("[odsa] exercise attempt failed", error);
    fail(res, 400, error instanceof Error ? error.message : "Exercise attempt failed.");
  }
});

odsaRouter.get("/odsa_exercise_progresses", async (req, res) => {
  const session = await requireSession(req);
  if (!session) {
    fail(res, 401, "LTI launch session is missing or expired.");
    return;
  }
  try {
    const result = await getExerciseProgress({
      userId: session.userId,
      instBookId: session.instBookId!,
      query: req.query as Record<string, unknown>,
    });
    res.json(result);
  } catch (error) {
    console.error("[odsa] exercise progress lookup failed", error);
    fail(res, 400, error instanceof Error ? error.message : "Progress lookup failed.");
  }
});

// Legacy path used by odsaKA when an exercise has no
// inst_book_section_exercise_id: /odsa_exercise_progresses/:book/:section/:name
odsaRouter.get("/odsa_exercise_progresses/:bookId/:sectionId/:exerciseName", async (req, res) => {
  const session = await requireSession(req);
  if (!session) {
    fail(res, 401, "LTI launch session is missing or expired.");
    return;
  }
  const bookId = Number(req.params.bookId);
  if (!Number.isSafeInteger(bookId) || bookId !== session.instBookId) {
    fail(res, 404, "Exercise does not belong to this book.");
    return;
  }
  const exerciseName = req.params.exerciseName;
  const sectionId = Number(req.params.sectionId);
  try {
    const exercise = await prisma.instExercises.findUnique({
      where: { short_name: exerciseName },
      select: { id: true },
    });
    const sectionExercise = exercise
      ? await prisma.instBookSectionExercises.findFirst({
          where: {
            inst_book_id: bookId,
            ...(Number.isSafeInteger(sectionId) && sectionId > 0
              ? { inst_section_id: sectionId }
              : {}),
            inst_exercise_id: exercise.id,
          },
          include: { exercise_instance: true },
        })
      : null;
    if (!sectionExercise?.exercise_instance_id) {
      res.json({ exercise_progress: null, threshold: 1 });
      return;
    }
    const progress = await prisma.odsaExerciseProgresses.findFirst({
      where: {
        user_id: session.userId,
        exercise_instance_id: sectionExercise.exercise_instance_id,
      },
    });
    res.json({
      exercise_progress: progress,
      threshold: Number(sectionExercise.threshold),
    });
  } catch (error) {
    console.error("[odsa] legacy exercise progress lookup failed", error);
    fail(res, 400, "Progress lookup failed.");
  }
});

// odsaKA persists the currently displayed question through this endpoint.
// Summary exercises without a DB row are accepted as non-tracked.
odsaRouter.post("/odsa_exercise_progresses", async (req, res) => {
  const session = await requireSession(req);
  if (!session) {
    fail(res, 401, "LTI launch session is missing or expired.");
    return;
  }
  const body = req.body as Record<string, unknown>;
  const exerciseName = typeof body.exercise_name === "string" ? body.exercise_name : "";
  const currentExercise = typeof body.current_exercise === "string" ? body.current_exercise : null;
  try {
    const exercise = exerciseName
      ? await prisma.instExercises.findUnique({
          where: { short_name: exerciseName },
          select: { id: true },
        })
      : null;
    const sectionExercise = exercise
      ? await prisma.instBookSectionExercises.findFirst({
          where: { inst_book_id: session.instBookId!, inst_exercise_id: exercise.id },
        })
      : null;
    if (sectionExercise?.exercise_instance_id) {
      const progress = await prisma.odsaExerciseProgresses.findFirst({
        where: {
          user_id: session.userId,
          exercise_instance_id: sectionExercise.exercise_instance_id,
        },
      });
      if (progress) {
        await prisma.odsaExerciseProgresses.update({
          where: { id: progress.id },
          data: { current_exercise: currentExercise, updated_at: new Date() },
        });
      }
    }
    res.json({ status: "success", message: "Success!" });
  } catch (error) {
    console.error("[odsa] exercise progress update failed", error);
    res.json({ status: "success", message: "Success!" });
  }
});

// Logging endpoints are outside the first grade-passback slice. Return success
// so the OpenDSA client does not spam the console with 404s.
odsaRouter.post("/odsa_user_interactions", (_req, res) => {
  res.json({ status: "success" });
});
odsaRouter.post("/odsa_user_time_tracking", (_req, res) => {
  res.json({ status: "success" });
});
