import { prisma } from "../db";
import { CanvasClient } from "./canvas_client";
import { ensureCanvasLtiTool, syncCanvasChapters } from "./canvas_sync";
import { acquireBookCompileLock, BookCompileError, runCompile } from "./compile_book";
import { instBookFullInclude } from "./types";
import type { GenerateCourseInput, GenerateCourseOutput } from "./types";
import { validateBookForCompile } from "./validate_book";
import { buildBookOutputPath, parseJsonObject } from "./utils";

// ============================================================================
// Core Course Generation Orchestrator
// ============================================================================

/**
 * Generates the Canvas LMS course structure (LTI tool, modules, assignment
 * groups, assignments, and module items) and compiles the OpenDSA book.
 *
 * The per-book lock covers Canvas sync and compilation so two requests cannot
 * write the same compiler output directory or Canvas structure concurrently.
 */
export function generateCourse(
  input: GenerateCourseInput
): Promise<GenerateCourseOutput> {
  const release = acquireBookCompileLock(input.instBookId);
  return generateCourseUnlocked(input).finally(release);
}

async function generateCourseUnlocked(
  input: GenerateCourseInput
): Promise<GenerateCourseOutput> {
  const openDsaSharedDir = input.openDsaSharedDir;
  const configApiLink = input.configApiLink;

  // Load the entire book hierarchy in a single query using the preset include tree
  const instBook = await prisma.instBooks.findUnique({
    where: { id: input.instBookId },
    include: instBookFullInclude,
  });

  if (!instBook) {
    throw new BookCompileError(
      "NOT_FOUND",
      404,
      `InstBook with id=${input.instBookId} not found.`
    );
  }
  if (!instBook.course_offering) {
    throw new BookCompileError(
      "NOT_COMPILABLE",
      400,
      `InstBook id=${input.instBookId} is not linked to a CourseOffering.`
    );
  }

  const validation = validateBookForCompile(instBook, {
    extrtoolLaunchBaseUrl: input.extrtoolLaunchBaseUrl,
  });
  if (validation.errors.length > 0) {
    throw new BookCompileError(
      "NOT_COMPILABLE",
      400,
      `InstBook id=${input.instBookId} cannot be compiled:\n${validation.errors.join("\n")}`
    );
  }
  for (const warning of validation.warnings) {
    console.warn(`[inst_book ${input.instBookId}] ${warning}`);
  }

  const courseOffering = instBook.course_offering;
  const lmsInstance = courseOffering.lms_instance;

  const user = await prisma.users.findUnique({
    where: { id: input.userId },
  });
  if (!user) {
    throw new Error(`User with id=${input.userId} not found`);
  }

  const userLmsAccess = await prisma.lmsAccesses.findUnique({
    where: {
      lms_instance_id_user_id: {
        lms_instance_id: lmsInstance.id,
        user_id: user.id,
      },
    },
  });

  if (!userLmsAccess?.access_token) {
    throw new Error(
      `Missing LmsAccess or access_token for user_id=${user.id}, lms_instance_id=${lmsInstance.id}`
    );
  }

  const { consumer_key: consumerKey, consumer_secret: consumerSecret } =
    userLmsAccess;
  if (!input.canvasContentOnly && (!consumerKey || !consumerSecret)) {
    throw new Error(
      `LmsAccess for user_id=${user.id}, lms_instance_id=${lmsInstance.id} is missing consumer_key/consumer_secret`
    );
  }

  const buildPath = buildBookOutputPath({
    organizationSlug: courseOffering.course.organization.slug,
    courseSlug: courseOffering.course.slug,
    termSlug: courseOffering.term.slug,
    courseOfferingLabel: courseOffering.label,
  });

  const parsedBookOptions = parseJsonObject(instBook.options);
  const isZeroPt = Boolean(parsedBookOptions?.zeropt_assignments);

  // Sync course structure to Canvas LMS
  const canvasClient = new CanvasClient(
    lmsInstance.url,
    userLmsAccess.access_token
  );
  const lmsCourseId = courseOffering.lms_course_num;

  const canvasCourse = await canvasClient.getSingleCourse(lmsCourseId);
  await prisma.courseOfferings.update({
    where: { id: courseOffering.id },
    data: {
      lms_course_code: canvasCourse.course_code,
      updated_at: new Date(),
    },
  });

  if (!input.canvasContentOnly) await ensureCanvasLtiTool(canvasClient, {
    lmsCourseId,
    instBookId: instBook.id,
    courseOfferingId: courseOffering.id,
    launchUrl: input.launchUrl,
    resourceSelectionUrl: input.resourceSelectionUrl,
    clientId: lmsInstance.client_id,
    consumerKey: consumerKey!,
    consumerSecret: consumerSecret!,
  });

  await syncCanvasChapters(canvasClient, {
    lmsCourseId,
    instBookId: instBook.id,
    chapters: instBook.inst_chapters,
    canvasContentOnly: input.canvasContentOnly,
    bookPublicBaseUrl: input.bookPublicBaseUrl,
    buildPath,
    launchUrl: input.launchUrl,
    isZeroPt,
  });

  const compileResult = await runCompile(instBook, {
    userId: user.id,
    extrtoolLaunchBaseUrl: input.extrtoolLaunchBaseUrl,
    openDsaSharedDir,
    configApiLink,
    timeoutMs: input.timeoutMs,
  });

  return {
    instBookId: instBook.id,
    lmsCourseId,
    lmsCourseCode: canvasCourse.course_code,
    configFilePath: compileResult.configFilePath,
    configPath: compileResult.configPath,
    buildPath: compileResult.buildPath,
    bookConfig: compileResult.bookConfig,
    compileResponse: compileResult.compileResponse,
  };
}
