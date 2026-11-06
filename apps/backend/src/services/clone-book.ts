import { Prisma } from "@prisma/client";

// Copy configuration only: shared definitions remain shared; LMS IDs, attempt
// state and student progress must never be copied into a new offering.
export async function cloneBook(tx: Prisma.TransactionClient, sourceId: number, offeringId: number, userId: number) {
  const source = await tx.instBooks.findUniqueOrThrow({ where: { id: sourceId }, include: {
    inst_chapters: { include: { inst_chapter_modules: { include: {
      inst_sections: { include: { inst_book_section_exercises: true } },
    } } } },
  } });
  const book = await tx.instBooks.create({ data: {
    title: source.title, desc: source.desc, options: source.options, book_type: source.book_type,
    user_id: userId, course_offering_id: offeringId, template: false, created_at: new Date(),
  } });
  for (const chapter of source.inst_chapters) {
    const copy = await tx.instChapters.create({ data: {
      inst_book_id: book.id, name: chapter.name, short_display_name: chapter.short_display_name, position: chapter.position,
    } });
    for (const module of chapter.inst_chapter_modules) {
      const moduleCopy = await tx.instChapterModules.create({ data: {
        inst_chapter_id: copy.id, inst_module_id: module.inst_module_id,
        module_position: module.module_position, due_dates: module.due_dates,
      } });
      for (const section of module.inst_sections) {
        const sectionCopy = await tx.instSections.create({ data: {
          inst_chapter_module_id: moduleCopy.id, inst_module_id: section.inst_module_id,
          name: section.name, short_display_name: section.short_display_name, position: section.position,
          gradable: section.gradable, show: section.show, soft_deadline: section.soft_deadline,
          hard_deadline: section.hard_deadline, time_limit: section.time_limit,
          learning_tool: section.learning_tool, resource_type: section.resource_type, resource_name: section.resource_name,
        } });
        for (const exercise of section.inst_book_section_exercises) {
          const instance = exercise.inst_exercise_id == null ? null : await tx.exerciseInstances.create({ data: {
            inst_exercise_id: exercise.inst_exercise_id, context_type: "book",
          } });
          await tx.instBookSectionExercises.create({ data: {
            inst_book_id: book.id, inst_section_id: sectionCopy.id, inst_exercise_id: exercise.inst_exercise_id,
            exercise_instance_id: instance?.id, points: exercise.points, threshold: exercise.threshold,
            required: exercise.required, type: exercise.type, options: exercise.options,
            partial_credit: exercise.partial_credit, json: exercise.json,
          } });
        }
      }
    }
  }
  return book.id;
}
