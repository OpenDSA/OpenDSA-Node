import path from "node:path";
import { prisma } from "../db";
import { CanvasClient } from "./canvas_client";
import { LoadedChapter, LoadedChapterModule } from "./types";

// ============================================================================
// Canvas Course Structure Synchronization
// ============================================================================

export async function ensureCanvasLtiTool(
  client: CanvasClient,
  params: {
    lmsCourseId: string;
    instBookId: number;
    courseOfferingId: number;
    launchUrl: string;
    resourceSelectionUrl: string;
    clientId: string | null;
    consumerKey: string;
    consumerSecret: string;
  }
): Promise<void> {
  const toolName = "OpenDSA-Node";
  const existingTools = await client.listExternalTools(params.lmsCourseId);
  const toolExists =
    Array.isArray(existingTools) &&
    existingTools.some((tool) => tool.name === toolName);

  if (toolExists) {
    return;
  }

  const navQuery = new URLSearchParams({
    custom_inst_book_id: String(params.instBookId),
    custom_course_offering_id: String(params.courseOfferingId),
  }).toString();

  const payload: Record<string, unknown> = {
    name: toolName,
    privacy_level: "public",
    consumer_key: params.consumerKey,
    shared_secret: params.consumerSecret,
    url: params.launchUrl,
    // client_id is only present for LTI 1.3 supported LMS instances
    ...(params.clientId ? { client_id: params.clientId } : {}),
    resource_selection: {
      enabled: true,
      url: params.resourceSelectionUrl,
      selection_width: 800,
      selection_height: 600,
    },
    course_navigation: {
      enabled: true,
      text: "OpenDSA Tools",
      url: `${params.launchUrl}?${navQuery}`,
      visibility: "admins",
      default: true,
    },
    custom_fields: {
      canvas_api_base_url: "$Canvas.api.baseUrl",
    },
  };

  await client.createExternalTool(params.lmsCourseId, payload);
}

export async function syncCanvasChapters(
  client: CanvasClient,
  params: {
    lmsCourseId: string;
    instBookId: number;
    chapters: LoadedChapter[];
    buildPath: string;
    launchUrl: string;
    isZeroPt: boolean;
  }
): Promise<void> {
  for (const chapter of params.chapters) {
    const moduleName = `Chapter ${chapter.position ?? ""} ${chapter.name}`;
    let shouldPublishChapter = false;

    if (!chapter.lms_chapter_id) {
      shouldPublishChapter = true;
      const createdModule = await client.createModule(params.lmsCourseId, {
        name: moduleName,
        position: chapter.position,
      });
      chapter.lms_chapter_id = createdModule.id;
      await prisma.instChapters.update({
        where: { id: chapter.id },
        data: {
          lms_chapter_id: createdModule.id,
          updated_at: new Date(),
        },
      });
    }

    const hasGradableSections = chapter.inst_chapter_modules.some((cm) =>
      cm.inst_sections.some((sec) => Boolean(sec.gradable))
    );

    if (!chapter.lms_assignment_group_id && hasGradableSections) {
      const createdGroup = await client.createAssignmentGroup(
        params.lmsCourseId,
        { name: moduleName }
      );
      chapter.lms_assignment_group_id = createdGroup.id;
      await prisma.instChapters.update({
        where: { id: chapter.id },
        data: {
          lms_assignment_group_id: createdGroup.id,
          updated_at: new Date(),
        },
      });
    }

    let moduleItemPosition = 1;
    for (const chapterModule of chapter.inst_chapter_modules) {
      await syncCanvasModuleItem(client, {
        lmsCourseId: params.lmsCourseId,
        instBookId: params.instBookId,
        chapter,
        lmsChapterId: chapter.lms_chapter_id,
        chapterModule,
        moduleItemPosition,
        buildPath: params.buildPath,
        launchUrl: params.launchUrl,
        isZeroPt: params.isZeroPt,
      });
      moduleItemPosition += 1;
    }

    if (shouldPublishChapter) {
      await client.updateModule(params.lmsCourseId, chapter.lms_chapter_id, {
        published: true,
      });
    }
  }
}

export async function syncCanvasModuleItem(
  client: CanvasClient,
  params: {
    lmsCourseId: string;
    instBookId: number;
    chapter: LoadedChapter;
    lmsChapterId: number;
    chapterModule: LoadedChapterModule;
    moduleItemPosition: number;
    buildPath: string;
    launchUrl: string;
    isZeroPt: boolean;
  }
): Promise<void> {
  const { chapter, chapterModule } = params;
  const moduleFileName = path.posix.basename(chapterModule.inst_module.path);
  const chapterPosPadded = String(chapter.position ?? "").padStart(2, "0");
  const modulePosPadded = String(chapterModule.module_position ?? "").padStart(
    2,
    "0"
  );
  const title = `${chapterPosPadded}.${modulePosPadded} ${chapterModule.inst_module.name}`;

  const launchQuery = new URLSearchParams({
    custom_inst_book_id: String(params.instBookId),
    custom_inst_chapter_module_id: String(chapterModule.id),
    custom_inst_module_id: String(chapterModule.inst_module_id),
    custom_inst_chapter_id: String(chapter.id),
    custom_book_path: params.buildPath,
    custom_module_file_name: moduleFileName,
    custom_module_title: title,
  }).toString();

  const itemLaunchUrl = `${params.launchUrl}?${launchQuery}`;

  const isGradable = chapterModule.inst_sections.some((sec) =>
    Boolean(sec.gradable)
  );
  const shouldSyncAsAssignment = isGradable || params.isZeroPt;

  if (shouldSyncAsAssignment) {
    const pointsPossible = isGradable
      ? calculateChapterModulePoints(chapterModule)
      : 0;

    const assignmentPayload: Record<string, unknown> = {
      submission_types: ["external_tool"],
      external_tool_tag_attributes: { url: itemLaunchUrl },
      points_possible: pointsPossible,
    };

    if (chapterModule.lms_module_item_id && chapterModule.lms_assignment_id) {
      await client.editAssignment(
        params.lmsCourseId,
        chapterModule.lms_assignment_id,
        assignmentPayload
      );
      await client.updateModuleItem(
        params.lmsCourseId,
        params.lmsChapterId,
        chapterModule.lms_module_item_id,
        {
          type: "Assignment",
          position: params.moduleItemPosition,
          external_url: itemLaunchUrl,
          content_id: chapterModule.lms_assignment_id,
        }
      );
    } else {
      const createdAssignment = await client.createAssignment(
        params.lmsCourseId,
        {
          ...assignmentPayload,
          name: title,
          assignment_group_id: chapter.lms_assignment_group_id,
          description: "",
        }
      );
      const createdModuleItem = await client.createModuleItem(
        params.lmsCourseId,
        params.lmsChapterId,
        {
          title,
          type: "Assignment",
          position: params.moduleItemPosition,
          external_url: itemLaunchUrl,
          indent: 0,
          content_id: createdAssignment.id,
        }
      );

      chapterModule.lms_assignment_id = createdAssignment.id;
      chapterModule.lms_module_item_id = createdModuleItem.id;
      await prisma.instChapterModules.update({
        where: { id: chapterModule.id },
        data: {
          lms_assignment_id: createdAssignment.id,
          lms_module_item_id: createdModuleItem.id,
          updated_at: new Date(),
        },
      });
    }
  } 
  // If the module item does not exist, create it
  else if (!chapterModule.lms_module_item_id) {
    const createdModuleItem = await client.createModuleItem(
      params.lmsCourseId,
      params.lmsChapterId,
      {
        title,
        type: "ExternalTool",
        position: params.moduleItemPosition,
        external_url: itemLaunchUrl,
        indent: 0,
      }
    );

    chapterModule.lms_module_item_id = createdModuleItem.id;
    await prisma.instChapterModules.update({
      where: { id: chapterModule.id },
      data: {
        lms_module_item_id: createdModuleItem.id,
        updated_at: new Date(),
      },
    });
  }
}

export function calculateChapterModulePoints(
  chapterModule: LoadedChapterModule
): number {
  let total = 0;
  for (const section of chapterModule.inst_sections) {
    for (const exercise of section.inst_book_section_exercises) {
      total += Number(exercise.points);
    }
  }
  return total;
}
