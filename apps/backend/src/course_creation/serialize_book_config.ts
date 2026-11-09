import type {
  BookCompileInput,
  ChapterCompileConfig,
  ExerciseCompileConfig,
  ModuleCompileConfig,
  SectionCompileConfig,
} from "./contract";
import {
  filterBookOptions,
  filterExerciseConfig,
  filterLearningToolSection,
} from "./contract";
import type {
  LoadedInstBook,
  LoadedSection,
  LoadedSectionExercise,
} from "./types";
import {
  formatDateTime,
  formatDueDate,
  parseJsonObject,
  parseJsonValue,
} from "./utils";

// Book Configuration Serializer (OpenDSA compiler input)

/**
 * Build the JSON handed to `tools/configure.py`.
 *
 * Only fields the compiler/postprocessor consume are emitted. Values that
 * have first-class columns win over the legacy `json` snapshot; the snapshot
 * supplies settings that have no columns (`showhide`, `external_url`,
 * `remove`, ...). `partial_credit` is stripped because configure.py rejects
 * unknown exercise fields.
 */
export function serializeBookConfig(
  instBook: LoadedInstBook,
  parsedBookOptions: Record<string, unknown> | null,
  extrtoolLaunchBaseUrl: string
): BookCompileInput {
  const chapters: Record<string, ChapterCompileConfig> = {};

  for (const instChapter of instBook.inst_chapters) {
    const chapter: ChapterCompileConfig = {};

    for (const instChapterModule of instChapter.inst_chapter_modules) {
      const sections = instChapterModule.inst_sections;
      const sectionsConfig: Record<string, SectionCompileConfig> | null =
        sections.length === 0
          ? null
          : Object.fromEntries(
              sections.map((section) => [
                section.name,
                buildSectionConfig(section, extrtoolLaunchBaseUrl),
              ])
            );

      chapter[instChapterModule.inst_module.path] = {
        lms_module_item_id: instChapterModule.lms_module_item_id,
        lms_assignment_id: instChapterModule.lms_assignment_id,
        long_name: instChapterModule.inst_module.name,
        due_dates: instChapterModule.due_dates
          ? formatDueDate(instChapterModule.due_dates)
          : null,
        sections: sectionsConfig,
      } satisfies ModuleCompileConfig;
    }

    chapters[instChapter.name] = chapter;
  }

  const courseOffering = instBook.course_offering;

  // Book options are filtered to fields configure.py accepts, then the
  // authoritative fields below win. course_id/LMS_url are always strings
  // because the postprocessor concatenates LMS_url without a null check.
  return {
    ...filterBookOptions(parsedBookOptions),
    inst_book_id: instBook.id,
    title: instBook.title,
    desc: instBook.desc,
    last_compiled: instBook.last_compiled
      ? formatDateTime(instBook.last_compiled)
      : null,
    chapters,
    course_id: courseOffering?.lms_course_num ?? "",
    LMS_url: courseOffering?.lms_instance.url ?? "",
  };
}

function buildSectionConfig(
  instSection: LoadedSection,
  extrtoolLaunchBaseUrl: string
): SectionCompileConfig {
  const exercises = instSection.inst_book_section_exercises;

  if (instSection.learning_tool) {
    const exercise = exercises[0];
    const section: SectionCompileConfig = {
      ...filterLearningToolSection(parseJsonObject(exercise?.json)),
      showsection: instSection.show ?? true,
      id: instSection.id,
      learning_tool: instSection.learning_tool,
      resource_type: instSection.resource_type,
      resource_name: instSection.resource_name,
    };

    if (exercise) {
      section.points = Number(exercise.points);
      section.launch_url = `${extrtoolLaunchBaseUrl}/${exercise.id}`;
    }

    return section;
  }

  const section: SectionCompileConfig = {
    showsection: instSection.show ?? true,
  };

  for (const sectionExercise of exercises) {
    if (!sectionExercise.inst_exercise) continue;
    section[sectionExercise.inst_exercise.short_name] =
      buildExerciseConfig(sectionExercise);
  }

  return section;
}

function buildExerciseConfig(
  sectionExercise: LoadedSectionExercise
): ExerciseCompileConfig {
  const instExercise = sectionExercise.inst_exercise;
  const blob = parseJsonObject(sectionExercise.json);
  const shortName = instExercise?.short_name ?? "";
  const blobLongName =
    typeof blob?.long_name === "string" ? blob.long_name : shortName;

  const exercise: ExerciseCompileConfig = {
    ...filterExerciseConfig(blob),
    id: sectionExercise.id,
    long_name: instExercise?.name ?? blobLongName,
    required: sectionExercise.required ?? false,
    points: Number(sectionExercise.points),
    threshold: Number(sectionExercise.threshold),
  };

  // The options column is the canonical source of exercise options. Fall back
  // to the snapshot (already copied above) when it has not been populated.
  const parsedOptions = parseJsonValue(sectionExercise.options);
  if (parsedOptions !== null) {
    exercise.exer_options = parsedOptions;
  }

  return exercise;
}
