import fs from "node:fs/promises";
import path from "node:path";
import { sanitizeFilename } from "../course_creation/utils";

// ============================================================================
// simple2full Expansion
// ============================================================================
//
// The OpenDSA compiler container owns the RST tree, so config expansion has to
// happen there. We hand it a JSON file through the shared directory, let Flask
// run `tools/simple2full.py`, and read the expanded "full" config back.

export interface Simple2FullOptions {
  userId: number;
  openDsaSharedDir: string;
  simple2fullApiLink: string;
  timeoutMs?: number;
}

export interface Simple2FullResult {
  fullConfig: Record<string, unknown>;
  warnings: string;
}

export class Simple2FullError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "Simple2FullError";
  }
}

interface Simple2FullResponse {
  ok?: boolean;
  message?: number;
  stdout_compressed?: string;
  stderr_compressed?: string;
}

const DEFAULT_EXPAND_TIMEOUT_MS = 5 * 60 * 1000;
const RELATIVE_TEMP_DIR = "config/temp";

/**
 * Expand a simple (authoring) config into the full section/exercise shape that
 * persistence consumes. Both simple and already-full configs are supported:
 * simple2full re-reads the RST and merges any overrides it finds.
 */
export async function expandBookConfig(
  config: Record<string, unknown>,
  options: Simple2FullOptions
): Promise<Simple2FullResult> {
  const timestamp = new Date().toISOString();
  const base = sanitizeFilename(`temp_${options.userId}_${timestamp}`);
  const inputName = `${base}_input.json`;
  const outputName = `${base}_full.json`;
  const inputPath = path.join(options.openDsaSharedDir, RELATIVE_TEMP_DIR, inputName);
  const outputPath = path.join(options.openDsaSharedDir, RELATIVE_TEMP_DIR, outputName);

  // simple2full needs a language to locate RST/<lang>/.
  const lang =
    typeof config.lang === "string" && config.lang.trim()
      ? config.lang
      : "en";
  const input = { ...config, lang };

  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, JSON.stringify(input), "utf8");

  const formBody = new URLSearchParams({
    input_path: `${RELATIVE_TEMP_DIR}/${inputName}`,
    output_path: `${RELATIVE_TEMP_DIR}/${outputName}`,
    rake: "false",
  });

  const signal =
    options.timeoutMs && options.timeoutMs > 0
      ? AbortSignal.timeout(options.timeoutMs)
      : AbortSignal.timeout(DEFAULT_EXPAND_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(options.simple2fullApiLink, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
      signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Simple2FullError(
        502,
        `OpenDSA simple2full timed out after ${options.timeoutMs ?? DEFAULT_EXPAND_TIMEOUT_MS} ms.`
      );
    }
    throw new Simple2FullError(
      502,
      `Unable to reach the OpenDSA simple2full service: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  try {
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Simple2FullError(
        502,
        `OpenDSA simple2full request failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as Simple2FullResponse;
    if (data.ok === false || data.message !== 0) {
      const details = data.stderr_compressed ?? data.stdout_compressed ?? "";
      throw new Simple2FullError(
        400,
        `OpenDSA simple2full failed (exit code ${String(data.message)})${details ? `:\n${details.trim()}` : "."}`
      );
    }

    let raw: string;
    try {
      raw = await fs.readFile(outputPath, "utf8");
    } catch {
      throw new Simple2FullError(
        502,
        "OpenDSA simple2full completed without producing an output file."
      );
    }

    let fullConfig: unknown;
    try {
      fullConfig = JSON.parse(raw);
    } catch {
      throw new Simple2FullError(
        502,
        "OpenDSA simple2full produced invalid JSON."
      );
    }

    if (!fullConfig || typeof fullConfig !== "object" || Array.isArray(fullConfig)) {
      throw new Simple2FullError(
        502,
        "OpenDSA simple2full produced an unexpected config shape."
      );
    }

    return {
      fullConfig: fullConfig as Record<string, unknown>,
      warnings: data.stderr_compressed?.trim() ?? "",
    };
  } finally {
    await Promise.allSettled([
      fs.rm(inputPath, { force: true }),
      fs.rm(outputPath, { force: true }),
    ]);
  }
}
