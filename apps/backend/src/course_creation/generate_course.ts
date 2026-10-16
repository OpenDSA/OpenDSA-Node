import { prisma } from "../db";
import { CanvasClient } from "./canvas_client";
import { ensureCanvasLtiTool, syncCanvasChapters } from "./canvas_sync";
import { triggerOpenDsaCompile, writeBookConfigFile } from "./compile_service";
import { serializeBookConfig } from "./serialize_book_config";
import {
  GenerateCourseInput,
  GenerateCourseOutput,
  instBookFullInclude,
} from "./types";
import { buildBookOutputPath, parseJsonObject } from "./utils";

// ============================================================================
// Core Course Generation Orchestrator
// ============================================================================

/**
 * Generates the Canvas LMS course structure (LTI tool, modules, assignment groups,
 * assignments, and module items) and triggers the OpenDSA book compilation service.
 */
export async function generateCourse(
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
    throw new Error(`InstBook with id=${input.instBookId} not found`);
  }
  if (!instBook.course_offering) {
    throw new Error(
      `InstBook id=${input.instBookId} is not linked to a CourseOffering`
    );
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
  if (!consumerKey || !consumerSecret) {
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

  await ensureCanvasLtiTool(canvasClient, {
    lmsCourseId,
    instBookId: instBook.id,
    courseOfferingId: courseOffering.id,
    launchUrl: input.launchUrl,
    resourceSelectionUrl: input.resourceSelectionUrl,
    clientId: lmsInstance.client_id,
    consumerKey,
    consumerSecret,
  });

  await syncCanvasChapters(canvasClient, {
    lmsCourseId,
    instBookId: instBook.id,
    chapters: instBook.inst_chapters,
    buildPath,
    launchUrl: input.launchUrl,
    isZeroPt,
  });

  const compiledAt = new Date();
  instBook.last_compiled = compiledAt;
  await prisma.instBooks.update({
    where: { id: instBook.id },
    data: {
      last_compiled: compiledAt,
      updated_at: compiledAt,
    },
  });

  // 3. Serialize book configuration JSON
  const bookConfig = serializeBookConfig(
    instBook,
    parsedBookOptions,
    input.extrtoolLaunchBaseUrl
  );

  // 4. Write configuration to shared volume
  const { configPath, configFilePath } = await writeBookConfigFile({
    userId: user.id,
    compiledAt,
    openDsaSharedDir,
    bookConfig,
  });

  // 5. Invoke OpenDSA compiler service
  const compileResponse = await triggerOpenDsaCompile(configApiLink, {
    configPath,
    buildPath,
    rake: false,
  });

  return {
    instBookId: instBook.id,
    lmsCourseId,
    lmsCourseCode: canvasCourse.course_code,
    configFilePath,
    configPath,
    buildPath,
    bookConfig,
    compileResponse,
  };
}
