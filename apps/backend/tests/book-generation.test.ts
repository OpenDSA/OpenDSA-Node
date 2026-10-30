import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/db";
import { cloneBook } from "../src/services/clone-book";
import { getGenerationContext } from "../src/services/course-offerings";

test("local identity is disabled in production even if opted in", async () => {
  const nodeEnv = process.env.NODE_ENV;
  const enabled = process.env.LOCAL_COURSE_GENERATION;
  try {
    process.env.NODE_ENV = "production";
    process.env.LOCAL_COURSE_GENERATION = "true";
    await assert.rejects(getGenerationContext(1), /disabled/);
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
    if (enabled === undefined) delete process.env.LOCAL_COURSE_GENERATION; else process.env.LOCAL_COURSE_GENERATION = enabled;
  }
});

test("clone preserves source, duplicates hierarchy, clears LMS IDs, and rolls back atomically", async () => {
  const sentinel = new Error("intentional test rollback");
  const before = await prisma.instBooks.count();
  try {
    await assert.rejects(prisma.$transaction(async tx => {
      const source = await tx.instBooks.findFirstOrThrow({ where: { title: "CS 1114 OpenDSA Book" }, include: {
        inst_chapters: { include: { inst_chapter_modules: { include: {
          inst_sections: { include: { inst_book_section_exercises: true } },
        } } } },
      } });
      assert(source.course_offering_id);
      const id = await cloneBook(tx, source.id, source.course_offering_id, source.user_id);
      const copy = await tx.instBooks.findUniqueOrThrow({ where: { id }, include: {
        inst_chapters: { include: { inst_chapter_modules: { include: {
          inst_sections: { include: { inst_book_section_exercises: { include: { exercise_instance: true } } } },
        } } } },
      } });
      assert.notEqual(id, source.id);
      assert.equal(copy.user_id, source.user_id);
      assert.equal(copy.last_compiled, null);
      assert.equal(copy.inst_chapters.length, source.inst_chapters.length);
      const sourceInstances = new Set(source.inst_chapters.flatMap(c => c.inst_chapter_modules.flatMap(m =>
        m.inst_sections.flatMap(s => s.inst_book_section_exercises.map(e => e.exercise_instance_id)))));
      let exercises = 0;
      for (const chapter of copy.inst_chapters) {
        assert.equal(chapter.lms_chapter_id, null);
        assert.equal(chapter.lms_assignment_group_id, null);
        for (const module of chapter.inst_chapter_modules) {
          assert.equal(module.lms_assignment_id, null);
          assert.equal(module.lms_module_item_id, null);
          for (const section of module.inst_sections) {
            assert.equal(section.lms_item_id, null);
            for (const exercise of section.inst_book_section_exercises) {
              assert.equal(exercise.inst_book_id, id);
              assert(!sourceInstances.has(exercise.exercise_instance_id));
              assert.equal(exercise.exercise_instance?.state, null);
              exercises++;
            }
          }
        }
      }
      const sourceExerciseCount = source.inst_chapters.flatMap(c => c.inst_chapter_modules.flatMap(m =>
        m.inst_sections.flatMap(s => s.inst_book_section_exercises))).length;
      assert.equal(exercises, sourceExerciseCount);
      assert.equal(exercises > 0, true);
      assert.deepEqual(await tx.instBooks.findUnique({ where: { id: source.id }, include: {
        inst_chapters: { include: { inst_chapter_modules: { include: {
          inst_sections: { include: { inst_book_section_exercises: true } },
        } } } },
      } }), source);
      throw sentinel;
    }, { timeout: 30000 }), error => error === sentinel);
    assert.equal(await prisma.instBooks.count(), before);
  } finally { await prisma.$disconnect(); }
});
