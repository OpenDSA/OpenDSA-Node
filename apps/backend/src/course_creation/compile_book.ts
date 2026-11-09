import { prisma } from "../db";
import type { BookCompileInput } from "./contract";
import { triggerOpenDsaCompile, writeBookConfigFile } from "./compile_service";
import { serializeBookConfig } from "./serialize_book_config";
import { instBookFullInclude } from "./types";
import type { LoadedInstBook, OpenDsaCompileResponse } from "./types";
import { buildBookOutputPath, parseJsonObject } from "./utils";
import { validateBookForCompile } from "./validate_book";

// ============================================================================
// Book Compilation Orchestration
// ============================================================================

export interface CompileBookOptions {
  /** Acting user; only used to name the transient compiler config file. */
  userId: number;
  extrtoolLaunchBaseUrl: string;
  openDsaSharedDir: string;
  configApiLink: string;
  timeoutMs?: number;
  /** Maps to the compiler's `rake` form field (`--standalone-modules`). */
  standaloneModules?: boolean;
}

export interface CompileBookResult {
  instBookId: number;
  buildPath: string;
  configPath: string;
  configFilePath: string;
  bookConfig: BookCompileInput;
  compileResponse: OpenDsaCompileResponse;
  compiledAt: Date;
}

export type BookCompileErrorCode =
  | "NOT_FOUND"
  | "NOT_COMPILABLE"
  | "ALREADY_RUNNING"
  | "COMPILER_FAILED";

export class BookCompileError extends Error {
  constructor(
    public readonly code: BookCompileErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "BookCompileError";
  }
}

// One compile per book at a time. This is process-local; it is sufficient for
// the current single-replica deployment and prevents two requests from writing
// the same compiler output directory concurrently.
const locks = new Set<number>();

/**
 * Acquire the per-book compile lock. Returns a release function. The lock is
 * held across Canvas sync as well as compilation, so `generateCourse` and
 * `compileBook` cannot interleave for the same book.
 */
export function acquireBookCompileLock(instBookId: number): () => void {
  if (locks.has(instBookId)) {
    throw new BookCompileError(
      "ALREADY_RUNNING",
      409,
      `Compilation is already running for book ${instBookId}.`
    );
  }

  locks.add(instBookId);
  let released = false;

  return () => {
    if (released) return;
    released = true;
    locks.delete(instBookId);
  };
}

/**
 * Compile a book without touching Canvas. This is the entry point for a
 * future compile-only route; callers must supply the acting user id only for
 * the transient config filename.
 */
export async function compileBook(
  instBookId: number,
  options: CompileBookOptions
): Promise<CompileBookResult> {
  const release = acquireBookCompileLock(instBookId);

  try {
    const instBook = await prisma.instBooks.findUnique({
      where: { id: instBookId },
      include: instBookFullInclude,
    });

    if (!instBook) {
      throw new BookCompileError(
        "NOT_FOUND",
        404,
        `InstBook with id=${instBookId} not found.`
      );
    }

    return await runCompile(instBook, options);
  } finally {
    release();
  }
}

/**
 * Compile an already-loaded book. Callers are responsible for holding the
 * per-book lock; this exists so `generateCourse` can reuse the same
 * serialization/write/trigger/update path after Canvas sync.
 */
export async function runCompile(
  instBook: LoadedInstBook,
  options: CompileBookOptions
): Promise<CompileBookResult> {
  const validation = validateBookForCompile(instBook, {
    extrtoolLaunchBaseUrl: options.extrtoolLaunchBaseUrl,
  });

  if (validation.errors.length > 0) {
    throw new BookCompileError(
      "NOT_COMPILABLE",
      400,
      `InstBook id=${instBook.id} cannot be compiled:\n${validation.errors.join(
        "\n"
      )}`
    );
  }

  for (const warning of validation.warnings) {
    console.warn(`[inst_book ${instBook.id}] ${warning}`);
  }

  const courseOffering = instBook.course_offering;
  if (!courseOffering) {
    // Unreachable after validation; keeps the type check explicit.
    throw new BookCompileError(
      "NOT_COMPILABLE",
      400,
      `InstBook id=${instBook.id} is not linked to a CourseOffering.`
    );
  }

  const buildPath = buildBookOutputPath({
    organizationSlug: courseOffering.course.organization.slug,
    courseSlug: courseOffering.course.slug,
    termSlug: courseOffering.term.slug,
    courseOfferingLabel: courseOffering.label,
  });

  const parsedBookOptions = parseJsonObject(instBook.options);
  const bookConfig = serializeBookConfig(
    instBook,
    parsedBookOptions,
    options.extrtoolLaunchBaseUrl
  );

  const compiledAt = new Date();
  const { configPath, configFilePath } = await writeBookConfigFile({
    userId: options.userId,
    compiledAt,
    openDsaSharedDir: options.openDsaSharedDir,
    bookConfig,
  });

  let compileResponse: OpenDsaCompileResponse;
  try {
    compileResponse = await triggerOpenDsaCompile(options.configApiLink, {
      configPath,
      buildPath,
      rake: options.standaloneModules ?? false,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BookCompileError("COMPILER_FAILED", 502, message);
  }

  // Only record a successful compile. A failed run leaves the previous
  // `last_compiled` value intact.
  await prisma.instBooks.update({
    where: { id: instBook.id },
    data: { last_compiled: compiledAt, updated_at: compiledAt },
  });

  return {
    instBookId: instBook.id,
    buildPath,
    configPath,
    configFilePath,
    bookConfig,
    compileResponse,
    compiledAt,
  };
}
