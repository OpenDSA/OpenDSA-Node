import { Prisma } from "@prisma/client";
import { prisma } from "../db";

const EPOCH = new Date(0);

export interface ModuleProgressArgs {
  userId: number;
  instBookId: number;
  instChapterModuleId: number;
  lmsAccessId?: number | null;
  lisOutcomeServiceUrl?: string | null;
  lisResultSourcedid?: string | null;
}

/**
 * Mirror of Rails OdsaModuleProgress.get_progress().
 *
 * The row is created on the first launch even when the module is non-gradable
 * (no AGS line item / outcome service URL). Grade passback later simply skips
 * rows without outcome pointers.
 */
export async function getOrCreateModuleProgress(
  args: ModuleProgressArgs
): Promise<Prisma.OdsaModuleProgressesGetPayload<object>> {
  const existing = await prisma.odsaModuleProgresses.findFirst({
    where: {
      user_id: args.userId,
      inst_chapter_module_id: args.instChapterModuleId,
    },
  });

  if (existing) {
    const data: Prisma.OdsaModuleProgressesUncheckedUpdateInput = {};
    if (
      args.lisOutcomeServiceUrl &&
      existing.lis_outcome_service_url !== args.lisOutcomeServiceUrl
    ) {
      data.lis_outcome_service_url = args.lisOutcomeServiceUrl;
      data.lis_result_sourcedid = args.lisResultSourcedid ?? null;
      data.lms_access_id = args.lmsAccessId ?? null;
    }
    if (Object.keys(data).length > 0) {
      data.updated_at = new Date();
      return prisma.odsaModuleProgresses.update({
        where: { id: existing.id },
        data,
      });
    }
    return existing;
  }

  const now = new Date();
  return prisma.odsaModuleProgresses.create({
    data: {
      user_id: args.userId,
      inst_book_id: args.instBookId,
      inst_chapter_module_id: args.instChapterModuleId,
      lis_outcome_service_url: args.lisOutcomeServiceUrl ?? null,
      lis_result_sourcedid: args.lisResultSourcedid ?? null,
      lms_access_id: args.lmsAccessId ?? null,
      first_done: now,
      last_done: now,
      proficient_date: EPOCH,
      current_score: 0,
      highest_score: 0,
      last_passback: EPOCH,
      created_at: now,
      updated_at: now,
    },
  });
}

export function isProficientDate(value: Date | null | undefined): boolean {
  return Boolean(value && value.getTime() > 0);
}

export { EPOCH as PROGRESS_EPOCH };
