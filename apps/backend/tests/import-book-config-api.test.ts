import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { signInForTest } from "./auth-client";

const fullConfig = {
  title: "API Import Book",
  desc: "API import test",
  lang: "en",
  glob_exer_options: { "JXOP-debug": "true" },
  chapters: {
    "API Chapter": {
      "ApiTest/Module": {
        long_name: "API Module",
        sections: {
          "API Section": {
            showsection: true,
            apiCON: {
              long_name: "API Slideshow",
              points: 0,
              required: false,
              threshold: 1,
            },
            apiPRO: {
              long_name: "API Proficiency",
              points: 2,
              required: true,
              threshold: 0.9,
            },
          },
        },
      },
    },
  },
};

test("book import API creates, additively updates, and admin-clones a template", async () => {
  assert([undefined, "development", "test"].includes(process.env.NODE_ENV));

  const sharedDir = await mkdtemp(path.join(os.tmpdir(), "opendsa-import-api-"));
  const previousShared = process.env.OPENDSA_SHARED_DIR;
  const previousSimple = process.env.SIMPLE2FULL_API_LINK;
  process.env.OPENDSA_SHARED_DIR = sharedDir;
  process.env.SIMPLE2FULL_API_LINK = "http://compiler.test/api/simple2full/";

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit
  ) => {
    if (String(url) === process.env.SIMPLE2FULL_API_LINK) {
      const form = new URLSearchParams(String(init?.body));
      const outputPath = form.get("output_path")!;
      await writeFile(
        path.join(sharedDir, outputPath),
        JSON.stringify(fullConfig),
        "utf8"
      );
      return Response.json({ ok: true, message: 0 });
    }
    return originalFetch(url, init);
  }) as typeof fetch;

  try {
    const instructor = await signInForTest(base);
    const admin = await signInForTest(base, "seed-academic-admin@example.com");
    const student = await signInForTest(base, "seed-alice@example.com");

    const request = (
      route: string,
      headers: Record<string, string> = {},
      body: unknown = { config: fullConfig }
    ) =>
      fetch(base + route, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    assert.equal((await request("/api/inst_books/import")).status, 401);
    assert.equal(
      (
        await request("/api/inst_books/import", {
          Cookie: instructor.Cookie,
        })
      ).status,
      403
    );
    assert.equal(
      (await request("/api/inst_books/import", student)).status,
      403
    );
    assert.equal(
      (
        await request("/api/inst_books/import", instructor, {
          chapters: {},
        })
      ).status,
      400
    );

    const transaction = prisma.$transaction;
    const findUnique = prisma.instBooks.findUnique;
    const sentinel = new Error("rollback API import test");
    const before = await prisma.instBooks.count();

    try {
      await assert.rejects(
        transaction.call(
          prisma,
          async (tx: any) => {
            prisma.$transaction = (async (callback: any) =>
              callback(tx)) as any;
            prisma.instBooks.findUnique = ((args: any) =>
              tx.instBooks.findUnique(args)) as any;

            const owner = await tx.users.findUniqueOrThrow({
              where: { email: "seed-academic-instructor@example.com" },
              select: { id: true },
            });

            const created = await request("/api/inst_books/import", instructor);
            assert.equal(created.status, 201);
            const createdBody = await created.json();
            const bookId = createdBody.data.instBookId as number;
            assert.deepEqual(createdBody.data.counts, {
              chapters: 1,
              modules: 1,
              sections: 1,
              exercises: 2,
            });

            const book = await tx.instBooks.findUniqueOrThrow({
              where: { id: bookId },
            });
            assert.equal(book.template, true);
            assert.equal(book.course_offering_id, null);
            assert.equal(book.user_id, owner.id);

            const updated = await request(
              `/api/inst_books/${bookId}/import`,
              instructor
            );
            assert.equal(updated.status, 200);
            const updatedBody = await updated.json();
            assert.equal(updatedBody.data.instBookId, bookId);
            assert.deepEqual(updatedBody.data.counts, {
              chapters: 1,
              modules: 1,
              sections: 1,
              exercises: 2,
            });
            assert.equal(
              await tx.instBookSectionExercises.count({
                where: { inst_book_id: bookId },
              }),
              2
            );

            const chapter = await tx.instChapters.findFirstOrThrow({ where: { inst_book_id: bookId } });
            const module = await tx.instChapterModules.findFirstOrThrow({ where: { inst_chapter_id: chapter.id } });
            await tx.instChapters.update({ where: { id: chapter.id }, data: { lms_chapter_id: 123, lms_assignment_group_id: 456 } });
            await tx.instChapterModules.update({ where: { id: module.id }, data: { lms_assignment_id: 789, lms_module_item_id: 987, due_dates: new Date() } });
            await tx.instBooks.update({ where: { id: bookId }, data: { book_type: 1, last_compiled: new Date() } });
            const exercises = await tx.instBookSectionExercises.findMany({ where: { inst_book_id: bookId } });
            await tx.exerciseInstances.update({ where: { id: exercises[0].exercise_instance_id }, data: { state: { old: true } } });
            const clonePath = `/api/admin/books/${bookId}/clone`;
            assert.equal((await request(clonePath)).status, 401);
            assert.equal((await request(clonePath, instructor, {})).status, 403);
            assert.equal((await request(clonePath, { Cookie: admin.Cookie }, {})).status, 403);
            assert.equal((await request(clonePath, admin, { user_id: owner.id })).status, 400);
            const clonedResponse = await request(clonePath, admin, {});
            assert.equal(clonedResponse.status, 201);
            const clonedId = (await clonedResponse.json()).data.id;
            assert.notEqual(clonedId, bookId);
            const clone = await tx.instBooks.findUniqueOrThrow({ where: { id: clonedId } });
            const adminUser = await tx.users.findUniqueOrThrow({ where: { email: "seed-academic-admin@example.com" } });
            assert.equal(clone.user_id, adminUser.id);
            assert.equal(clone.title, book.title); assert.equal(clone.options, book.options);
            assert.equal(clone.course_offering_id, null); assert.equal(clone.template, false);
            assert.equal(clone.book_type, null); assert.equal(clone.last_compiled, null);
            const clonedChapter = await tx.instChapters.findFirstOrThrow({ where: { inst_book_id: clonedId } });
            assert.notEqual(clonedChapter.id, chapter.id); assert.equal(clonedChapter.name, chapter.name);
            assert.equal(clonedChapter.lms_chapter_id, null); assert.equal(clonedChapter.lms_assignment_group_id, null);
            const clonedModule = await tx.instChapterModules.findFirstOrThrow({ where: { inst_chapter_id: clonedChapter.id } });
            assert.equal(clonedModule.inst_module_id, module.inst_module_id);
            assert.equal(clonedModule.lms_assignment_id, null); assert.equal(clonedModule.lms_module_item_id, null);
            assert.equal(clonedModule.due_dates, null);
            const clonedExercises = await tx.instBookSectionExercises.findMany({ where: { inst_book_id: clonedId }, include: { exercise_instance: true } });
            assert.equal(clonedExercises.length, exercises.length);
            for (const exercise of clonedExercises) {
              assert.ok(!exercises.some((old: any) => old.exercise_instance_id === exercise.exercise_instance_id));
              assert.equal(exercise.exercise_instance.state, null);
            }
            assert.equal((await tx.instChapters.findUniqueOrThrow({ where: { id: chapter.id } })).lms_chapter_id, 123);
            assert.equal((await request("/api/admin/books/2147483647/clone", admin, {})).status, 404);
            throw sentinel;
          },
          { timeout: 30000 }
        ),
        (error: unknown) => error === sentinel
      );
      assert.equal(await prisma.instBooks.count(), before);
    } finally {
      prisma.$transaction = transaction;
      prisma.instBooks.findUnique = findUnique;
    }
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    if (previousShared === undefined) delete process.env.OPENDSA_SHARED_DIR;
    else process.env.OPENDSA_SHARED_DIR = previousShared;
    if (previousSimple === undefined) delete process.env.SIMPLE2FULL_API_LINK;
    else process.env.SIMPLE2FULL_API_LINK = previousSimple;
    await rm(sharedDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
