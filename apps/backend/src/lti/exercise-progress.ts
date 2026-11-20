import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getOrCreateModuleProgress, isProficientDate } from "./module-progress";

type Body = Record<string, unknown>;

const PROGRESS_DEFAULTS = {
  current_score: 0,
  highest_score: 0,
  total_correct: 0,
  total_worth_credit: 0,
};

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value: unknown, fallback = 0): number {
  const parsed = Math.trunc(Number(value));
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function ipAddress(value: string | undefined): string {
  return (value || "unknown").slice(0, 20);
}

interface ResolvedExercise {
  sectionExercise: Prisma.InstBookSectionExercisesGetPayload<{
    include: { inst_section: true; inst_exercise: true };
  }>;
  exerciseInstanceId: number;
  chapterModuleId: number;
  points: number;
  threshold: number;
}

async function resolveExercise(
  userId: number,
  instBookId: number,
  body: Body
): Promise<ResolvedExercise> {
  const directId = integer(body.inst_book_section_exercise_id);
  let sectionExercise = directId > 0
    ? await prisma.instBookSectionExercises.findUnique({
        where: { id: directId },
        include: { inst_section: true, inst_exercise: true },
      })
    : null;

  if (!sectionExercise) {
    const bookId = integer(body.inst_book_id, instBookId);
    const sectionId = integer(body.inst_section_id);
    const exerciseName = string(body.exercise) || string(body.sha1) ||
      string(body.question_name);
    if (!bookId || !exerciseName) {
      throw new Error("Unable to identify the exercise from the attempt.");
    }
    const exercise = await prisma.instExercises.findUnique({
      where: { short_name: exerciseName },
      select: { id: true },
    });
    if (!exercise) throw new Error("Exercise not found.");
    sectionExercise = await prisma.instBookSectionExercises.findFirst({
      where: {
        inst_book_id: bookId,
        ...(sectionId > 0 ? { inst_section_id: sectionId } : {}),
        inst_exercise_id: exercise.id,
      },
      include: { inst_section: true, inst_exercise: true },
    });
  }

  if (!sectionExercise || sectionExercise.inst_book_id !== instBookId) {
    throw new Error("Exercise does not belong to this book.");
  }
  if (!sectionExercise.inst_exercise_id) {
    throw new Error("Exercise has no source exercise.");
  }

  let exerciseInstanceId = sectionExercise.exercise_instance_id;
  if (!exerciseInstanceId) {
    const instance = await prisma.exerciseInstances.create({
      data: {
        inst_exercise_id: sectionExercise.inst_exercise_id,
        context_type: "book",
      },
    });
    await prisma.instBookSectionExercises.update({
      where: { id: sectionExercise.id },
      data: { exercise_instance_id: instance.id },
    });
    exerciseInstanceId = instance.id;
  }

  void userId;
  return {
    sectionExercise,
    exerciseInstanceId,
    chapterModuleId: sectionExercise.inst_section.inst_chapter_module_id,
    points: number(sectionExercise.points),
    threshold: number(sectionExercise.threshold),
  };
}

async function findOrCreateExerciseProgress(
  userId: number,
  exerciseInstanceId: number
) {
  const existing = await prisma.odsaExerciseProgresses.findFirst({
    where: { user_id: userId, exercise_instance_id: exerciseInstanceId },
  });
  if (existing) return existing;

  const now = new Date();
  return prisma.odsaExerciseProgresses.create({
    data: {
      user_id: userId,
      exercise_instance_id: exerciseInstanceId,
      ...PROGRESS_DEFAULTS,
      first_done: now,
      last_done: now,
      proficient_date: new Date(0),
      created_at: now,
      updated_at: now,
    },
  });
}

async function updateModuleScore(args: {
  userId: number;
  instBookId: number;
  chapterModuleId: number;
}) {
  const module = await prisma.instChapterModules.findUnique({
    where: { id: args.chapterModuleId },
    include: {
      inst_sections: {
        include: { inst_book_section_exercises: true },
      },
    },
  });
  if (!module) return null;

  const exercises = module.inst_sections.flatMap(
    (section) => section.inst_book_section_exercises
  );
  const instanceIds = exercises
    .map((exercise) => exercise.exercise_instance_id)
    .filter((id): id is number => typeof id === "number");

  const progressRows = instanceIds.length > 0
    ? await prisma.odsaExerciseProgresses.findMany({
        where: {
          user_id: args.userId,
          exercise_instance_id: { in: instanceIds },
        },
      })
    : [];
  const progressByInstance = new Map(
    progressRows.map((progress) => [progress.exercise_instance_id, progress])
  );

  let totalPoints = 0;
  let earnedPoints = 0;
  let allProficient = true;
  for (const exercise of exercises) {
    const points = number(exercise.points);
    totalPoints += points;
    const progress = exercise.exercise_instance_id
      ? progressByInstance.get(exercise.exercise_instance_id)
      : undefined;
    const proficient = isProficientDate(progress?.proficient_date);
    if (points === 0 || proficient) {
      earnedPoints += points;
    } else if (progress && exercise.partial_credit) {
      // Mirrors Rails OdsaModuleProgress#update_score.
      earnedPoints += points * (number(progress.highest_score) / 100);
    }
    if (points > 0 && !proficient) allProficient = false;
  }

  const existing = await getOrCreateModuleProgress({
    userId: args.userId,
    instBookId: args.instBookId,
    instChapterModuleId: args.chapterModuleId,
  });
  const currentScore = totalPoints > 0 ? earnedPoints / totalPoints : 0;
  const oldHighest = number(existing.highest_score);
  const highestScore = Math.max(oldHighest, currentScore);
  const now = new Date();
  const proficientDate = allProficient
    ? (isProficientDate(existing.proficient_date) ? existing.proficient_date : now)
    : existing.proficient_date;

  const updated = await prisma.odsaModuleProgresses.update({
    where: { id: existing.id },
    data: {
      current_score: currentScore,
      highest_score: highestScore,
      last_done: now,
      proficient_date: proficientDate,
      updated_at: now,
    },
  });

  return {
    progress: updated,
    scoreIncreased: highestScore > oldHighest + 1e-9,
    isComplete: allProficient,
    scoreMaximum: totalPoints,
  };
}

async function recordAttempt(args: {
  userId: number;
  instBookId: number;
  ip: string | undefined;
  resolved: ResolvedExercise;
  attempt: Prisma.OdsaExerciseAttemptsUncheckedCreateInput;
  progressUpdate: (current: Awaited<ReturnType<typeof findOrCreateExerciseProgress>>) => {
    data: Prisma.OdsaExerciseProgressesUpdateInput;
    proficient: boolean;
  };
}) {
  const before = await findOrCreateExerciseProgress(
    args.userId,
    args.resolved.exerciseInstanceId
  );
  const wasProficient = isProficientDate(before.proficient_date);
  const { data, proficient } = args.progressUpdate(before);
  const now = new Date();
  const attempt = await prisma.odsaExerciseAttempts.create({
    data: {
      ...args.attempt,
      user_id: args.userId,
      inst_book_id: args.instBookId,
      inst_section_id: args.resolved.sectionExercise.inst_section_id,
      exercise_instance_id: args.resolved.exerciseInstanceId,
      ip_address: ipAddress(args.ip),
      time_done: now,
      created_at: now,
      updated_at: now,
    },
  });
  const progress = await prisma.odsaExerciseProgresses.update({
    where: { id: before.id },
    data: {
      ...data,
      first_done: isProficientDate(before.first_done) ? before.first_done : now,
      last_done: now,
      updated_at: now,
    },
  });
  if (proficient) {
    await prisma.odsaExerciseAttempts.update({
      where: { id: attempt.id },
      data: {
        earned_proficiency: true,
        points_earned: args.resolved.points,
        updated_at: now,
      },
    });
  }
  const moduleResult = await updateModuleScore({
    userId: args.userId,
    instBookId: args.instBookId,
    chapterModuleId: args.resolved.chapterModuleId,
  });

  return {
    progress,
    wasProficient,
    isProficient: proficient || isProficientDate(progress.proficient_date),
    moduleResult,
  };
}

export async function recordPeAttempt(args: {
  userId: number;
  instBookId: number;
  ip: string | undefined;
  body: Body;
}) {
  const resolved = await resolveExercise(args.userId, args.instBookId, args.body);
  const score = number(args.body.score);
  const threshold = number(args.body.threshold, resolved.threshold);
  const correct = score >= threshold;
  const points = correct ? resolved.points : 0;

  return recordAttempt({
    userId: args.userId,
    instBookId: args.instBookId,
    ip: args.ip,
    resolved,
    attempt: {
      worth_credit: correct,
      time_taken: Math.max(0, Math.round(number(args.body.total_time) / 1000)),
      count_hints: 0,
      hint_used: false,
      points_earned: points,
      earned_proficiency: correct,
      count_attempts: BigInt(Math.max(1, integer(args.body.uiid, 1))),
      question_name: string(args.body.exercise, "PE").slice(0, 50),
      request_type: "PE",
      correct,
      pe_score: score,
      pe_steps_fixed: integer(args.body.steps_fixed),
    } as Prisma.OdsaExerciseAttemptsUncheckedCreateInput,
    progressUpdate: (before) => {
      const current = number(before.current_score);
      const highest = Math.max(number(before.highest_score), points);
      return {
        data: {
          ...(correct ? {
            total_correct: number(before.total_correct) + 1,
            total_worth_credit: number(before.total_worth_credit) + 1,
            current_score: points,
            highest_score: highest,
            proficient_date: isProficientDate(before.proficient_date)
              ? before.proficient_date
              : new Date(),
          } : {}),
        },
        proficient: correct,
      };
    },
  }).then((result) => ({
    exercise_progress: result.progress,
    threshold,
    was_proficient: result.wasProficient,
    is_proficient: result.isProficient,
    module_result: result.moduleResult,
  }));
}

export async function recordKaAttempt(args: {
  userId: number;
  instBookId: number;
  ip: string | undefined;
  body: Body;
}) {
  const resolved = await resolveExercise(args.userId, args.instBookId, args.body);
  const correct = integer(args.body.complete) === 1;
  const countHints = Math.max(0, integer(args.body.count_hints));
  const attemptNumber = Math.max(0, integer(args.body.attempt_number));
  const questionName = (
    string(args.body.problem_type) ||
    string(args.body.non_summative) ||
    string(args.body.exercise) ||
    "attempt"
  ).slice(0, 50);
  const requestType = string(args.body.attempt_content) === "hint"
    ? "hint"
    : "attempt";
  const worthCredit = correct && countHints === 0 && attemptNumber === 1;

  return recordAttempt({
    userId: args.userId,
    instBookId: args.instBookId,
    ip: args.ip,
    resolved,
    attempt: {
      worth_credit: worthCredit,
      time_taken: Math.max(0, integer(args.body.time_taken)),
      count_hints: countHints,
      hint_used: countHints > 0,
      points_earned: 0,
      earned_proficiency: false,
      count_attempts: BigInt(Math.max(0, attemptNumber)),
      question_name: questionName,
      request_type: requestType,
      correct,
      answer: string(args.body.attempt_content) || null,
    } as Prisma.OdsaExerciseAttemptsUncheckedCreateInput,
    progressUpdate: (before) => {
      let current = number(before.current_score);
      let totalCorrect = number(before.total_correct);
      let totalWorthCredit = number(before.total_worth_credit);
      let correctExercises = before.correct_exercises ?? "";
      let hintedExercise = before.hinted_exercise ?? "";
      let proficientDate = before.proficient_date;
      let highest = number(before.highest_score);

      if (correct) {
        totalCorrect += 1;
        if (worthCredit) {
          totalWorthCredit += 1;
          current += 1;
          highest = Math.max(highest, current);
          if (!isProficientDate(proficientDate) && highest >= resolved.threshold) {
            proficientDate = new Date();
          }
          correctExercises = correctExercises
            ? `${correctExercises},${questionName}`
            : questionName;
        }
        if (requestType !== "hint") hintedExercise = "";
      } else if (
        countHints === 0 &&
        requestType !== "hint" &&
        attemptNumber === 1
      ) {
        current = Math.max(0, current - 1);
      }
      if (requestType === "hint" && resolved.sectionExercise.inst_exercise?.short_name.includes("Summ")) {
        hintedExercise = questionName;
      }

      return {
        data: {
          current_score: current,
          highest_score: highest,
          total_correct: totalCorrect,
          total_worth_credit: totalWorthCredit,
          correct_exercises: correctExercises || null,
          hinted_exercise: hintedExercise || null,
          proficient_date: proficientDate,
        },
        proficient: isProficientDate(proficientDate),
      };
    },
  }).then((result) => ({
    exercise_progress: result.progress,
    threshold: resolved.threshold,
    was_proficient: result.wasProficient,
    is_proficient: result.isProficient,
    module_result: result.moduleResult,
  }));
}

export async function getExerciseProgress(args: {
  userId: number;
  instBookId: number;
  query: Record<string, unknown>;
}) {
  const chapterModuleId = integer(args.query.inst_chapter_module_id);
  if (chapterModuleId > 0) {
    const module = await prisma.instChapterModules.findUnique({
      where: { id: chapterModuleId },
      include: {
        inst_sections: {
          include: {
            inst_book_section_exercises: { include: { inst_exercise: true } },
          },
        },
      },
    });
    if (!module) throw new Error("Module not found.");
    const chapter = await prisma.instChapters.findUnique({
      where: { id: module.inst_chapter_id },
      select: { inst_book_id: true },
    });
    if (chapter?.inst_book_id !== args.instBookId) {
      throw new Error("Module does not belong to this book.");
    }
    const exercises = module.inst_sections.flatMap(
      (section) => section.inst_book_section_exercises
    );
    const instanceIds = exercises
      .map((exercise) => exercise.exercise_instance_id)
      .filter((id): id is number => typeof id === "number");
    const progresses = instanceIds.length > 0
      ? await prisma.odsaExerciseProgresses.findMany({
          where: {
            user_id: args.userId,
            exercise_instance_id: { in: instanceIds },
          },
        })
      : [];
    const byInstance = new Map(
      progresses.map((progress) => [progress.exercise_instance_id, progress])
    );
    const proficient = exercises
      .filter((exercise) => {
        const progress = exercise.exercise_instance_id
          ? byInstance.get(exercise.exercise_instance_id)
          : undefined;
        return isProficientDate(progress?.proficient_date);
      })
      .map((exercise) => exercise.inst_exercise?.short_name)
      .filter((name): name is string => Boolean(name));
    return { proficient_exercises: proficient };
  }

  const sectionExerciseId = integer(args.query.inst_book_section_exercise_id);
  if (sectionExerciseId > 0) {
    const sectionExercise = await prisma.instBookSectionExercises.findUnique({
      where: { id: sectionExerciseId },
      include: { exercise_instance: true, inst_exercise: true },
    });
    if (!sectionExercise || sectionExercise.inst_book_id !== args.instBookId) {
      throw new Error("Exercise does not belong to this book.");
    }
    const progress = sectionExercise.exercise_instance_id
      ? await prisma.odsaExerciseProgresses.findFirst({
          where: {
            user_id: args.userId,
            exercise_instance_id: sectionExercise.exercise_instance_id,
          },
        })
      : null;
    return {
      exercise_progress: progress,
      threshold: number(sectionExercise.threshold),
    };
  }

  throw new Error("Missing exercise or module identifier.");
}
