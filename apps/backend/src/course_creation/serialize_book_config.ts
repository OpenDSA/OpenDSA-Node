import {
  BookConfigJson,
  ChapterConfigJson,
  LoadedInstBook,
  SectionConfigJson,
} from "./types";
import {
  formatDateTime,
  formatDueDate,
  parseJsonObject,
  parseJsonValue,
} from "./utils";

// Book Configuration Serializer (Replaces Rails show.json.jbuilder)

export function serializeBookConfig(
  instBook: LoadedInstBook,
  parsedBookOptions: Record<string, unknown> | null,
  extrtoolLaunchBaseUrl: string
): BookConfigJson {
  const json: BookConfigJson = {
    inst_book_id: instBook.id,
    title: instBook.title,
    desc: instBook.desc,
    last_compiled: instBook.last_compiled
      ? formatDateTime(instBook.last_compiled)
      : null,
    ...(parsedBookOptions ?? {}),
    chapters: {},
  };

  const chaptersObj: Record<string, ChapterConfigJson> = {};

  for (const instChapter of instBook.inst_chapters) {
    const chapterObj: ChapterConfigJson = {
      lms_chapter_id: instChapter.lms_chapter_id,
      lms_assignment_group_id: instChapter.lms_assignment_group_id,
    };

    for (const instChapterModule of instChapter.inst_chapter_modules) {
      const modulePath = instChapterModule.inst_module.path;
      const sections = instChapterModule.inst_sections;

      let sectionsObj: Record<string, SectionConfigJson> | null = null;

      if (sections.length > 0) {
        sectionsObj = {};
        for (const instSection of sections) {
          const sectionObj: SectionConfigJson = {
            id: instSection.id,
            soft_deadline: instSection.soft_deadline
              ? formatDateTime(instSection.soft_deadline)
              : null,
            hard_deadline: instSection.hard_deadline
              ? formatDateTime(instSection.hard_deadline)
              : null,
            showsection: instSection.show,
            lms_item_id: instSection.lms_item_id,
            lms_assignment_id: instSection.lms_assignment_id,
          };

          if (instSection.learning_tool) {
            const exercise = instSection.inst_book_section_exercises[0];
            if (exercise) {
              const parsedExJson = parseJsonObject(exercise.json);
              if (parsedExJson) {
                Object.assign(sectionObj, parsedExJson);
              }
              sectionObj.points = Number(exercise.points);
              sectionObj.launch_url = `${extrtoolLaunchBaseUrl}/${exercise.id}`;
            }
            sectionObj.learning_tool = instSection.learning_tool;
            sectionObj.resource_type = instSection.resource_type;
            sectionObj.resource_name = instSection.resource_name;
          } else {
            for (const sectionExercise of instSection.inst_book_section_exercises) {
              if (!sectionExercise.inst_exercise) continue;
              const exerciseName = sectionExercise.inst_exercise.short_name;
              const parsedExJson = parseJsonObject(sectionExercise.json);

              const exerciseEntry: Record<string, unknown> = {
                ...(parsedExJson ?? {}),
                id: sectionExercise.id,
                long_name: sectionExercise.inst_exercise.name,
                required: sectionExercise.required,
                points: Number(sectionExercise.points),
                threshold: Number(sectionExercise.threshold),
              };
              delete exerciseEntry.partial_credit;

              const parsedExOptions = parseJsonValue(sectionExercise.options);
              if (parsedExOptions !== null) {
                exerciseEntry.exer_options = parsedExOptions;
              }

              sectionObj[exerciseName] = exerciseEntry;
            }
          }

          sectionsObj[instSection.name] = sectionObj;
        }
      }

      chapterObj[modulePath] = {
        lms_module_item_id: instChapterModule.lms_module_item_id,
        lms_section_item_id: instChapterModule.lms_section_item_id,
        lms_assignment_id: instChapterModule.lms_assignment_id,
        long_name: instChapterModule.inst_module.name,
        due_dates: instChapterModule.due_dates
          ? formatDueDate(instChapterModule.due_dates)
          : null,
        sections: sectionsObj,
      };
    }

    chaptersObj[instChapter.name] = chapterObj;
  }

  json.chapters = chaptersObj;

  if (instBook.course_offering) {
    json.course_id = instBook.course_offering.lms_course_num;
    json.LMS_url = instBook.course_offering.lms_instance.url;
  }

  return json;
}
