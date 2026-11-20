import { OutcomeService } from "ims-lti";
import type { LmsInstances, OdsaModuleProgresses } from "@prisma/client";
import { prisma } from "../db";
import { ltiProvider } from "./provider";

export interface PassbackResult {
  attempted: boolean;
  sent: boolean;
  protocol?: "1.1" | "1.3";
  reason?: string;
}

async function lmsInstanceFor(
  lmsInstanceId: number | null,
  moduleProgress: OdsaModuleProgresses
): Promise<LmsInstances | null> {
  if (lmsInstanceId) {
    return prisma.lmsInstances.findUnique({ where: { id: lmsInstanceId } });
  }
  if (!moduleProgress.inst_book_id) return null;
  const book = await prisma.instBooks.findUnique({
    where: { id: moduleProgress.inst_book_id },
    select: { course_offering: { select: { lms_instance_id: true } } },
  });
  const id = book?.course_offering?.lms_instance_id;
  return id ? prisma.lmsInstances.findUnique({ where: { id } }) : null;
}

function isLti13(lms: LmsInstances): boolean {
  return Boolean(lms.client_id && lms.oauth2_url);
}

async function sendLti13(
  args: {
    ltik: string;
    moduleProgress: OdsaModuleProgresses;
    scoreMaximum: number;
    isComplete: boolean;
  }
): Promise<PassbackResult> {
  const { moduleProgress } = args;
  let context;
  try {
    context = await ltiProvider.getLaunchContext(args.ltik);
  } catch (error) {
    console.warn("[lti] AGS passback could not resume launch context", error);
    return { attempted: false, sent: false, protocol: "1.3", reason: "invalid or expired ltik" };
  }
  if (!context.grading.isAvailable()) {
    return { attempted: false, sent: false, protocol: "1.3", reason: "AGS is not available" };
  }

  const lineItemId = moduleProgress.lis_outcome_service_url!;
  const userId = moduleProgress.lis_result_sourcedid!;
  try {
    // Do not call getLineItemById here. That requires the optional
    // lineitem.readonly AGS scope. The score maximum is the same points total
    // used to create the Canvas assignment, and submitScore only needs the
    // score scope.
    await context.grading.submitScore(lineItemId, {
      userId,
      scoreGiven: moduleProgress.highest_score * args.scoreMaximum,
      scoreMaximum: args.scoreMaximum,
      activityProgress: args.isComplete ? "Completed" : "InProgress",
      gradingProgress: "FullyGraded",
      timestamp: new Date().toISOString(),
    });

    await prisma.odsaModuleProgresses.update({
      where: { id: moduleProgress.id },
      data: { last_passback: new Date(), updated_at: new Date() },
    });
    console.log(
      `[lti] submitted AGS score ${moduleProgress.highest_score} ` +
      `for user ${userId} line item ${lineItemId}`
    );
    return { attempted: true, sent: true, protocol: "1.3" };
  } catch (error) {
    console.warn("[lti] AGS score submission failed", error);
    return {
      attempted: true,
      sent: false,
      protocol: "1.3",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendLti11(
  lms: LmsInstances,
  moduleProgress: OdsaModuleProgresses
): Promise<PassbackResult> {
  const serviceUrl = moduleProgress.lis_outcome_service_url!;
  const sourcedId = moduleProgress.lis_result_sourcedid!;

  let consumerKey = lms.consumer_key;
  let consumerSecret = lms.consumer_secret;
  if (!consumerKey || !consumerSecret) {
    const access = await prisma.lmsAccesses.findFirst({
      where: {
        lms_instance_id: lms.id,
        consumer_key: { not: null },
        consumer_secret: { not: null },
      },
      orderBy: { id: "asc" },
    });
    consumerKey = access?.consumer_key ?? null;
    consumerSecret = access?.consumer_secret ?? null;
  }
  if (!consumerKey || !consumerSecret) {
    return {
      attempted: false,
      sent: false,
      protocol: "1.1",
      reason: "missing LTI 1.1 consumer credentials",
    };
  }

  let outcome: OutcomeService;
  try {
    outcome = new OutcomeService({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      service_url: serviceUrl,
      source_did: sourcedId,
    });
  } catch (error) {
    return {
      attempted: false,
      sent: false,
      protocol: "1.1",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    // Canvas can return a successful readResult envelope with no textString
    // for a not-yet-graded assignment. ims-lti surfaces that as
    // "Invalid score response". Treat any read failure as "no known current
    // score" and still attempt replaceResult; the score-increase guard above
    // already prevents needless submissions.
    let currentScore: number | null = null;
    try {
      currentScore = await new Promise<number | null>((resolve, reject) => {
        outcome.send_read_result((error: Error | null, score?: number) => {
          if (error) reject(error);
          else resolve(typeof score === "number" && Number.isFinite(score) ? score : null);
        });
      });
    } catch (error) {
      console.warn("[lti] LTI 1.1 readResult failed; trying replaceResult", error);
    }

    if (currentScore !== null && moduleProgress.highest_score <= currentScore) {
      await prisma.odsaModuleProgresses.update({
        where: { id: moduleProgress.id },
        data: { last_passback: new Date(), updated_at: new Date() },
      });
      return {
        attempted: true,
        sent: false,
        protocol: "1.1",
        reason: "LMS already has an equal or higher score",
      };
    }

    await new Promise<void>((resolve, reject) => {
      outcome.send_replace_result(
        moduleProgress.highest_score,
        (error: Error | null, success: boolean) => {
          if (error || !success) reject(error ?? new Error("replaceResult failed"));
          else resolve();
        }
      );
    });

    await prisma.odsaModuleProgresses.update({
      where: { id: moduleProgress.id },
      data: { last_passback: new Date(), updated_at: new Date() },
    });
    console.log(
      `[lti] submitted LTI 1.1 outcome ${moduleProgress.highest_score} ` +
      `for sourcedid ${sourcedId}`
    );
    return { attempted: true, sent: true, protocol: "1.1" };
  } catch (error) {
    console.warn("[lti] LTI 1.1 outcome submission failed", error);
    return {
      attempted: true,
      sent: false,
      protocol: "1.1",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Send the current module score to whichever LTI protocol owns this launch.
 *
 * LTI 1.3 uses AGS through the ltijs LaunchContext. LTI 1.1 uses the legacy
 * Basic Outcomes readResult/replaceResult flow through ims-lti.
 */
export async function sendModuleScore(args: {
  ltik: string | null;
  lmsInstanceId: number | null;
  moduleProgress: OdsaModuleProgresses;
  scoreMaximum: number;
  scoreIncreased: boolean;
  isComplete: boolean;
}): Promise<PassbackResult> {
  const { moduleProgress } = args;
  if (!moduleProgress.lis_outcome_service_url || !moduleProgress.lis_result_sourcedid) {
    return { attempted: false, sent: false, reason: "no LMS outcome target for this module" };
  }
  if (moduleProgress.highest_score <= 0) {
    return { attempted: false, sent: false, reason: "module score is still zero" };
  }
  if (!args.scoreIncreased && moduleProgress.last_passback.getTime() > 0) {
    return { attempted: false, sent: false, reason: "score has not increased" };
  }

  const lms = await lmsInstanceFor(args.lmsInstanceId, moduleProgress);
  if (!lms) {
    return { attempted: false, sent: false, reason: "LMS instance not found" };
  }

  if (isLti13(lms)) {
    if (!args.ltik) {
      return { attempted: false, sent: false, protocol: "1.3", reason: "missing ltik" };
    }
    if (!Number.isFinite(args.scoreMaximum) || args.scoreMaximum <= 0) {
      return {
        attempted: false,
        sent: false,
        protocol: "1.3",
        reason: "module has no score maximum",
      };
    }
    return sendLti13({
      ltik: args.ltik,
      moduleProgress,
      scoreMaximum: args.scoreMaximum,
      isComplete: args.isComplete,
    });
  }

  return sendLti11(lms, moduleProgress);
}
