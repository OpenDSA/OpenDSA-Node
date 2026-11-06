import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prisma } from "../src/db";
import {
  acquireBookCompileLock,
  BookCompileError,
  runCompile,
} from "../src/course_creation/compile_book";
import { triggerOpenDsaCompile } from "../src/course_creation/compile_service";
import type { LoadedInstBook } from "../src/course_creation/types";

// ============================================================================
// Fixtures
// ============================================================================

function makeBook(): LoadedInstBook {
  return {
    id: 42,
    user_id: 1,
    title: "Test Book",
    desc: "Test description",
    last_compiled: null,
    options: JSON.stringify({ build_dir: "Books", lang: "en" }),
    course_offering: {
      label: "Section",
      lms_course_num: "123",
      lms_instance: { url: "https://canvas.example" },
      term: { slug: "2026-fall" },
      course: {
        slug: "cs3114",
        organization: { slug: "vt" },
      },
    },
    inst_chapters: [
      {
        id: 1,
        name: "Chapter",
        position: 1,
        inst_chapter_modules: [
          {
            id: 10,
            module_position: 1,
            lms_module_item_id: null,
            lms_assignment_id: null,
            due_dates: null,
            inst_module: { id: 100, path: "Intro", name: "Intro" },
            inst_sections: [
              {
                id: 20,
                name: "Intro",
                show: true,
                learning_tool: null,
                resource_type: null,
                resource_name: null,
                inst_book_section_exercises: [
                  {
                    id: 1,
                    points: 1,
                    required: true,
                    threshold: 0.9,
                    options: null,
                    json: JSON.stringify({ long_name: "Intro" }),
                    inst_exercise: { name: "Intro", short_name: "introCON" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as LoadedInstBook;
}

const baseOptions = {
  userId: 1,
  extrtoolLaunchBaseUrl: "https://example/lti/launch_extrtool",
  configApiLink: "http://compiler.test/api/configure/",
  timeoutMs: 5000,
};

function patchFetch(
  implementation: (url: string, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function patchBookUpdate(): {
  calls: unknown[];
  restore: () => void;
} {
  const original = prisma.instBooks.update;
  const calls: unknown[] = [];
  (prisma.instBooks as unknown as {
    update: (args: unknown) => Promise<unknown>;
  }).update = async (args: unknown) => {
    calls.push(args);
    return {};
  };
  return {
    calls,
    restore: () => {
      (prisma.instBooks as unknown as { update: typeof original }).update =
        original;
    },
  };
}

// ============================================================================
// runCompile
// ============================================================================

test("runCompile writes the config, triggers the compiler, and records success", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "opendsa-compile-service-")
  );
  const update = patchBookUpdate();
  let requestUrl = "";
  let requestBody: URLSearchParams | undefined;

  const restoreFetch = patchFetch(async (url, init) => {
    requestUrl = url;
    requestBody = new URLSearchParams(String(init?.body));
    return Response.json({ ok: true, message: 0 });
  });

  try {
    const result = await runCompile(makeBook(), {
      ...baseOptions,
      openDsaSharedDir: directory,
    });

    assert.equal(result.buildPath, "vt/cs3114/2026-fall/Section");
    assert.equal(requestUrl, baseOptions.configApiLink);
    assert.equal(
      requestBody?.get("config_file_path"),
      result.configPath
    );
    assert.equal(requestBody?.get("build_path"), result.buildPath);
    assert.equal(requestBody?.get("rake"), "false");

    const written = JSON.parse(
      await readFile(result.configFilePath, "utf8")
    ) as Record<string, unknown>;
    assert.equal(written.inst_book_id, 42);
    assert.equal(written.course_id, "123");
    assert.equal(written.LMS_url, "https://canvas.example");

    assert.equal(update.calls.length, 1);
    const updateArgs = update.calls[0] as {
      data: { last_compiled: Date; updated_at: Date };
      where: { id: number };
    };
    assert.equal(updateArgs.where.id, 42);
    assert.equal(
      updateArgs.data.last_compiled.getTime(),
      result.compiledAt.getTime()
    );
    assert.equal(
      updateArgs.data.updated_at.getTime(),
      result.compiledAt.getTime()
    );
  } finally {
    restoreFetch();
    update.restore();
    await rm(directory, { recursive: true, force: true });
  }
});

test("runCompile surfaces compiler failures and does not record success", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "opendsa-compile-service-")
  );
  const update = patchBookUpdate();
  const restoreFetch = patchFetch(async () =>
    Response.json({
      ok: true,
      message: 1,
      stderr_compressed: "configure.py exploded",
    })
  );

  try {
    await assert.rejects(
      runCompile(makeBook(), {
        ...baseOptions,
        openDsaSharedDir: directory,
      }),
      (error: unknown) =>
        error instanceof BookCompileError &&
        error.code === "COMPILER_FAILED" &&
        error.status === 502 &&
        error.message.includes("configure.py exploded")
    );
    assert.equal(update.calls.length, 0);
  } finally {
    restoreFetch();
    update.restore();
    await rm(directory, { recursive: true, force: true });
  }
});

test("runCompile rejects an invalid book before writing or calling the compiler", async () => {
  const book = makeBook();
  book.course_offering = null;

  let fetched = false;
  const restoreFetch = patchFetch(async () => {
    fetched = true;
    return Response.json({ ok: true, message: 0 });
  });

  try {
    await assert.rejects(
      runCompile(book, {
        ...baseOptions,
        openDsaSharedDir: os.tmpdir(),
      }),
      (error: unknown) =>
        error instanceof BookCompileError &&
        error.code === "NOT_COMPILABLE" &&
        error.status === 400
    );
    assert.equal(fetched, false);
  } finally {
    restoreFetch();
  }
});

// ============================================================================
// Compiler request
// ============================================================================

test("triggerOpenDsaCompile reports timeouts", async () => {
  const restoreFetch = patchFetch(async () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  });

  try {
    await assert.rejects(
      triggerOpenDsaCompile("http://compiler.test/api/configure/", {
        configPath: "config/temp/x.json",
        buildPath: "vt/cs3114/2026-fall/Section",
        rake: false,
        timeoutMs: 50,
      }),
      /timed out after 50 ms/
    );
  } finally {
    restoreFetch();
  }
});

// ============================================================================
// Lock
// ============================================================================

test("the per-book lock rejects concurrent compiles and can be reacquired", () => {
  const release = acquireBookCompileLock(999);

  try {
    assert.throws(
      () => acquireBookCompileLock(999),
      (error: unknown) =>
        error instanceof BookCompileError && error.code === "ALREADY_RUNNING"
    );
  } finally {
    release();
  }

  const releaseAgain = acquireBookCompileLock(999);
  releaseAgain();
});
