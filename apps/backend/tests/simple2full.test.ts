import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  expandBookConfig,
  Simple2FullError,
} from "../src/services/simple2full";

const API = "http://compiler.test/api/simple2full/";

function patchFetch(
  implementation: (url: string, init?: RequestInit) => Promise<Response>
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = implementation as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("expandBookConfig round-trips a config through the shared directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opendsa-simple2full-"));
  let inputPath = "";
  let outputPath = "";

  const restoreFetch = patchFetch(async (url, init) => {
    assert.equal(url, API);
    const form = new URLSearchParams(String(init?.body));
    inputPath = form.get("input_path")!;
    outputPath = form.get("output_path")!;
    assert.equal(form.get("rake"), "false");
    assert.match(inputPath, /^config\/temp\//);
    assert.match(outputPath, /^config\/temp\//);

    const written = JSON.parse(
      await readFile(path.join(directory, inputPath), "utf8")
    ) as Record<string, unknown>;
    assert.equal(written.lang, "en", "simple2full needs a language");
    assert.equal(written.title, "Input Book");

    await writeFile(
      path.join(directory, outputPath),
      JSON.stringify({ title: "Expanded Book", chapters: {} }),
      "utf8"
    );

    return Response.json({
      ok: true,
      message: 0,
      stderr_compressed: "warning text",
    });
  });

  try {
    const result = await expandBookConfig(
      { title: "Input Book", chapters: {} },
      {
        userId: 1,
        openDsaSharedDir: directory,
        simple2fullApiLink: API,
        timeoutMs: 5000,
      }
    );

    assert.equal(result.fullConfig.title, "Expanded Book");
    assert.equal(result.warnings, "warning text");
    assert(inputPath && outputPath);

    // The service removes both transient files.
    await assert.rejects(access(path.join(directory, inputPath)));
    await assert.rejects(access(path.join(directory, outputPath)));
  } finally {
    restoreFetch();
    await rm(directory, { recursive: true, force: true });
  }
});

test("expandBookConfig surfaces simple2full failures and cleans up", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opendsa-simple2full-"));
  let inputPath = "";
  let outputPath = "";

  const restoreFetch = patchFetch(async (_url, init) => {
    const form = new URLSearchParams(String(init?.body));
    inputPath = form.get("input_path")!;
    outputPath = form.get("output_path")!;
    return Response.json({
      ok: true,
      message: 1,
      stderr_compressed: "module does not exist",
    });
  });

  try {
    await assert.rejects(
      expandBookConfig(
        { title: "Bad Book", chapters: {} },
        {
          userId: 1,
          openDsaSharedDir: directory,
          simple2fullApiLink: API,
          timeoutMs: 5000,
        }
      ),
      (error: unknown) =>
        error instanceof Simple2FullError &&
        error.status === 400 &&
        error.message.includes("module does not exist")
    );

    await assert.rejects(access(path.join(directory, inputPath)));
    await assert.rejects(access(path.join(directory, outputPath)));
  } finally {
    restoreFetch();
    await rm(directory, { recursive: true, force: true });
  }
});

test("expandBookConfig reports a timeout", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opendsa-simple2full-"));
  const restoreFetch = patchFetch(async () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    throw error;
  });

  try {
    await assert.rejects(
      expandBookConfig(
        { title: "Book", chapters: {} },
        {
          userId: 1,
          openDsaSharedDir: directory,
          simple2fullApiLink: API,
          timeoutMs: 50,
        }
      ),
      (error: unknown) =>
        error instanceof Simple2FullError &&
        error.status === 502 &&
        error.message.includes("timed out after 50 ms")
    );
  } finally {
    restoreFetch();
    await rm(directory, { recursive: true, force: true });
  }
});
