import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/db";
import { persistBookConfig } from "../src/services/import-book-config";

function makeConfig(extraExercise?: string): Record<string, unknown> {
  const section: Record<string, unknown> = {
    showsection: true,
    importtestCON: {
      long_name: "Import Test Slideshow",
      points: 0,
      required: false,
      threshold: 1,
    },
    importtestPRO: {
      long_name: "Import Test Proficiency",
      points: 2,
      required: true,
      threshold: 0.9,
      exer_options: { "JXOP-debug": "true" },
    },
  };

  if (extraExercise) {
    section[extraExercise] = {
      long_name: extraExercise,
      points: 1,
      required: false,
      threshold: 1,
    };
  }

  return {
    title: "Import Test Book",
    desc: "Imported by the config loader test",
    lang: "en",
    glob_exer_options: { "JXOP-debug": "true" },
    glob_pe_options: { points: 2, required: true, threshold: 0.9 },
    chapters: {
      "Import Chapter": {
        "ImportTest/ModuleA": {
          long_name: "Import Module",
          sections: {
            "Import Section": section,
          },
        },
      },
    },
  };
}

test("persistBookConfig creates a template and updates it additively", async () => {
  const owner = await prisma.users.findUniqueOrThrow({
    where: { email: "seed-academic-instructor@example.com" },
  });
  const transaction = prisma.$transaction;
  const sentinel = new Error("rollback import book test");

  try {
    await assert.rejects(
      transaction.call(
        prisma,
        async (tx: any) => {
          // Route persistBookConfig's internal transaction through the outer
          // fixture transaction so every write is rolled back.
          prisma.$transaction = (async (callback: any) => callback(tx)) as any;

          const first = await persistBookConfig(makeConfig(), {
            userId: owner.id,
          });
          assert.deepEqual(first.counts, {
            chapters: 1,
            modules: 1,
            sections: 1,
            exercises: 2,
          });

          const include = {
            inst_chapters: {
              include: {
                inst_chapter_modules: {
                  include: {
                    inst_module: true,
                    inst_sections: {
                      include: {
                        inst_book_section_exercises: {
                          include: {
                            inst_exercise: true,
                            exercise_instance: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          };

          const book = await tx.instBooks.findUniqueOrThrow({
            where: { id: first.instBookId },
            include,
          });

          assert.equal(book.template, true);
          assert.equal(book.course_offering_id, null);
          assert.equal(book.last_compiled, null);
          assert.equal(book.user_id, owner.id);

          const options = JSON.parse(book.options ?? "{}");
          assert.deepEqual(options.glob_exer_options, { "JXOP-debug": "true" });
          assert.deepEqual(options.glob_pe_options, {
            points: 2,
            required: true,
            threshold: 0.9,
          });
          assert.equal("chapters" in options, false);

          assert.equal(book.inst_chapters.length, 1);
          const chapter = book.inst_chapters[0];
          assert.equal(chapter.name, "Import Chapter");
          assert.equal(chapter.position, 1);
          assert.equal(chapter.inst_chapter_modules.length, 1);

          const chapterModule = chapter.inst_chapter_modules[0];
          assert.equal(chapterModule.module_position, 1);
          assert.equal(chapterModule.inst_module.path, "ImportTest/ModuleA");
          assert.equal(chapterModule.inst_module.name, "Import Module");

          const section = chapterModule.inst_sections[0];
          assert.equal(section.name, "Import Section");
          assert.equal(section.position, 1);
          assert.equal(section.show, true);
          assert.equal(section.gradable, true);
          assert.equal(section.learning_tool, null);

          const exercises = section.inst_book_section_exercises;
          assert.equal(exercises.length, 2);

          const con = exercises.find(
            (exercise: any) => exercise.inst_exercise?.short_name === "importtestCON"
          )!;
          const pro = exercises.find(
            (exercise: any) => exercise.inst_exercise?.short_name === "importtestPRO"
          )!;

          assert.equal(Number(con.points), 0);
          assert.equal(Number(con.threshold), 1);
          assert.equal(con.required, false);
          assert.equal(con.options, null);
          assert.equal(Number(pro.points), 2);
          assert.equal(Number(pro.threshold), 0.9);
          assert.equal(pro.required, true);
          assert.deepEqual(JSON.parse(pro.options!), {
            "JXOP-debug": "true",
          });
          assert.equal(
            JSON.parse(pro.json!).long_name,
            "Import Test Proficiency"
          );

          for (const exercise of exercises) {
            assert(exercise.exercise_instance);
            assert.equal(exercise.exercise_instance.context_type, "book");
            assert.equal(exercise.exercise_instance.state, null);
          }

          const firstIds = exercises
            .map((exercise: any) => exercise.id as number)
            .sort((a: number, b: number) => a - b);

          // A successful first import must not have set last_compiled.
          await tx.instBooks.update({
            where: { id: first.instBookId },
            data: { last_compiled: new Date() },
          });

          const second = await persistBookConfig(makeConfig(), {
            userId: owner.id,
            instBookId: first.instBookId,
          });
          assert.deepEqual(second.counts, first.counts);

          const updated = await tx.instBooks.findUniqueOrThrow({
            where: { id: first.instBookId },
            select: { last_compiled: true },
          });
          assert.equal(updated.last_compiled, null);

          assert.equal(
            await tx.instChapters.count({
              where: { inst_book_id: first.instBookId },
            }),
            1
          );
          assert.equal(
            await tx.instBookSectionExercises.count({
              where: { inst_book_id: first.instBookId },
            }),
            2
          );

          const secondIds = (
            await tx.instBookSectionExercises.findMany({
              where: { inst_book_id: first.instBookId },
              select: { id: true },
            })
          )
            .map((row) => row.id)
            .sort((a, b) => a - b);
          assert.deepEqual(secondIds, firstIds);

          // Adding an exercise updates the existing rows in place.
          const third = await persistBookConfig(makeConfig("importtestBUB"), {
            userId: owner.id,
            instBookId: first.instBookId,
          });
          assert.equal(third.counts.exercises, 3);
          assert.equal(
            await tx.instBookSectionExercises.count({
              where: { inst_book_id: first.instBookId },
            }),
            3
          );

          const thirdIds = (
            await tx.instBookSectionExercises.findMany({
              where: { inst_book_id: first.instBookId },
              select: { id: true },
            })
          ).map((row) => row.id);
          assert(firstIds.every((id: number) => thirdIds.includes(id)));

          // Removing an exercise from the config is additive: the old row stays.
          const fourth = await persistBookConfig(makeConfig(), {
            userId: owner.id,
            instBookId: first.instBookId,
          });
          assert.equal(fourth.counts.exercises, 2);
          assert.equal(
            await tx.instBookSectionExercises.count({
              where: { inst_book_id: first.instBookId },
            }),
            3
          );

          throw sentinel;
        },
        { timeout: 30000 }
      ),
      (error: unknown) => error === sentinel
    );
  } finally {
    prisma.$transaction = transaction;
    await prisma.$disconnect();
  }
});
