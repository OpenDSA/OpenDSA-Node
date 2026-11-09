import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { expandBookConfig, Simple2FullError } from "./simple2full";

// ============================================================================
// Book Config Import / Persistence
// ============================================================================

export class BookConfigError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "BookConfigError";
  }
}

export interface ImportBookConfigOptions {
  userId: number;
  instBookId?: number;
  openDsaSharedDir: string;
  simple2fullApiLink: string;
  timeoutMs?: number;
}

export interface BookConfigCounts {
  chapters: number;
  modules: number;
  sections: number;
  exercises: number;
}

export interface ImportBookConfigResult {
  instBookId: number;
  title: string;
  counts: BookConfigCounts;
  warnings: string;
}

/**
 * Expand a simple config via the OpenDSA container, then persist the resulting
 * full config into a template book (or update an existing book additively).
 */
export async function importBookConfig(
  config: unknown,
  options: ImportBookConfigOptions
): Promise<ImportBookConfigResult> {
  const input = requireConfigObject(config);
  // Fail fast with a useful message before spending a round trip.
  readTitle(input);
  readChapters(input);

  const expanded = await expandBookConfig(input, {
    userId: options.userId,
    openDsaSharedDir: options.openDsaSharedDir,
    simple2fullApiLink: options.simple2fullApiLink,
    timeoutMs: options.timeoutMs,
  });

  const persisted = await persistBookConfig(expanded.fullConfig, {
    userId: options.userId,
    instBookId: options.instBookId,
  });

  return {
    instBookId: persisted.instBookId,
    title: persisted.title,
    counts: persisted.counts,
    warnings: expanded.warnings,
  };
}

export interface PersistBookConfigOptions {
  userId: number;
  instBookId?: number;
}

export interface PersistBookConfigResult {
  instBookId: number;
  title: string;
  counts: BookConfigCounts;
}

/**
 * Persist an already-expanded full config. Updates are additive: rows removed
 * from the config are left in place, and LMS ids/student progress are never
 * touched.
 */
export async function persistBookConfig(
  config: unknown,
  options: PersistBookConfigOptions
): Promise<PersistBookConfigResult> {
  const input = requireConfigObject(config);
  const title = readTitle(input);
  const desc = readDesc(input);
  const chapters = readChapters(input);
  const bookOptions = JSON.stringify(buildBookOptions(input));
  const now = new Date();

  return prisma.$transaction(
    async (tx) => {
      let instBookId: number;

      if (options.instBookId !== undefined) {
        const existing = await tx.instBooks.findUnique({
          where: { id: options.instBookId },
          select: { id: true },
        });
        if (!existing) {
          throw new BookConfigError(
            404,
            `InstBook with id=${options.instBookId} not found.`
          );
        }

        await tx.instBooks.update({
          where: { id: existing.id },
          data: {
            title,
            desc,
            options: bookOptions,
            last_compiled: null,
            updated_at: now,
          },
        });
        instBookId = existing.id;
      } else {
        const created = await tx.instBooks.create({
          data: {
            title,
            desc,
            options: bookOptions,
            template: true,
            course_offering_id: null,
            user_id: options.userId,
            last_compiled: null,
            created_at: now,
            updated_at: now,
          },
        });
        instBookId = created.id;
      }

      const counts: BookConfigCounts = {
        chapters: 0,
        modules: 0,
        sections: 0,
        exercises: 0,
      };

      // TODO: Rails stored 0-based chapter positions and 1-based module
      // positions. We use 1-based for both to match the seed/Canvas titles;
      // revisit if anything depends on the legacy numbering.
      let chapterPosition = 1;

      for (const [chapterName, chapterValue] of Object.entries(chapters)) {
        if (!isPlainObject(chapterValue)) continue;

        const chapter = await upsertChapter(
          tx,
          instBookId,
          chapterName,
          chapterPosition++,
          now
        );
        counts.chapters++;

        let modulePosition = 1;

        for (const [modulePathRaw, moduleValue] of Object.entries(chapterValue)) {
          if (!isPlainObject(moduleValue)) continue;

          const modulePath = modulePathRaw.replace(/\\/g, "/").trim();
          if (!modulePath) {
            throw new BookConfigError(
              400,
              `Chapter "${chapterName}" contains a module with an empty path.`
            );
          }

          const moduleName =
            readString(moduleValue.long_name) ??
            modulePath.split("/").filter(Boolean).pop() ??
            modulePath;

          const instModule = await upsertModule(tx, modulePath, moduleName, now);
          const chapterModule = await upsertChapterModule(
            tx,
            chapter.id,
            instModule.id,
            modulePosition++,
            now
          );
          counts.modules++;

          const sections = moduleValue.sections;
          if (!isPlainObject(sections)) continue;

          let sectionPosition = 1;

          for (const [sectionName, sectionValue] of Object.entries(sections)) {
            if (!isPlainObject(sectionValue)) continue;

            const section = await upsertSection(
              tx,
              chapterModule.id,
              instModule.id,
              sectionName,
              sectionValue,
              sectionPosition++,
              now
            );
            counts.sections++;

            const result = await persistSectionExercises(
              tx,
              instBookId,
              section,
              sectionValue,
              now
            );
            counts.exercises += result.exercises;

            // Rails set this via an after_save hook and never cleared it.
            if (result.hasPoints && !section.gradable) {
              await tx.instSections.update({
                where: { id: section.id },
                data: { gradable: true, updated_at: now },
              });
            }
          }
        }
      }

      return { instBookId, title, counts };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}

// ============================================================================
// Row upserts
// ============================================================================

async function upsertChapter(
  tx: Prisma.TransactionClient,
  instBookId: number,
  name: string,
  position: number,
  now: Date
) {
  const existing = await tx.instChapters.findFirst({
    where: { inst_book_id: instBookId, name },
  });

  if (existing) {
    return tx.instChapters.update({
      where: { id: existing.id },
      data: { position, updated_at: now },
    });
  }

  return tx.instChapters.create({
    data: {
      inst_book_id: instBookId,
      name,
      position,
      created_at: now,
      updated_at: now,
    },
  });
}

async function upsertModule(
  tx: Prisma.TransactionClient,
  path: string,
  name: string,
  now: Date
) {
  const existing = await tx.instModules.findUnique({ where: { path } });

  if (existing) {
    return tx.instModules.update({
      where: { id: existing.id },
      data: { name, updated_at: now },
    });
  }

  return tx.instModules.create({
    data: { path, name, created_at: now, updated_at: now },
  });
}

async function upsertChapterModule(
  tx: Prisma.TransactionClient,
  instChapterId: number,
  instModuleId: number,
  modulePosition: number,
  now: Date
) {
  const existing = await tx.instChapterModules.findFirst({
    where: { inst_chapter_id: instChapterId, inst_module_id: instModuleId },
  });

  if (existing) {
    return tx.instChapterModules.update({
      where: { id: existing.id },
      data: { module_position: modulePosition, updated_at: now },
    });
  }

  return tx.instChapterModules.create({
    data: {
      inst_chapter_id: instChapterId,
      inst_module_id: instModuleId,
      module_position: modulePosition,
      created_at: now,
      updated_at: now,
    },
  });
}

async function upsertSection(
  tx: Prisma.TransactionClient,
  instChapterModuleId: number,
  instModuleId: number,
  name: string,
  section: Record<string, unknown>,
  position: number,
  now: Date
) {
  const learningTool = readString(section.learning_tool);
  const resourceName = readString(section.resource_name);
  const resourceType = readString(section.resource_type);
  const show = section.showsection === undefined ? true : Boolean(section.showsection);
  const softDeadline = readDate(section.soft_deadline, `Section "${name}" soft_deadline`);
  const hardDeadline = readDate(section.hard_deadline, `Section "${name}" hard_deadline`);

  const data = {
    inst_module_id: instModuleId,
    name,
    position,
    show,
    learning_tool: learningTool,
    resource_type: resourceType,
    resource_name: resourceName,
    ...(softDeadline === undefined ? {} : { soft_deadline: softDeadline }),
    ...(hardDeadline === undefined ? {} : { hard_deadline: hardDeadline }),
    updated_at: now,
  };

  const existing = await tx.instSections.findFirst({
    where: { inst_chapter_module_id: instChapterModuleId, name },
  });

  if (existing) {
    return tx.instSections.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.instSections.create({
    data: {
      ...data,
      inst_chapter_module_id: instChapterModuleId,
      created_at: now,
    },
  });
}

async function upsertInstExercise(
  tx: Prisma.TransactionClient,
  exercise: {
    shortName: string;
    name: string;
    learningTool: string | null;
    exType: string | null;
    avAddress: string | null;
    width: number | null;
    height: number | null;
  },
  now: Date
) {
  const existing = await tx.instExercises.findUnique({
    where: { short_name: exercise.shortName },
  });

  if (existing) {
    return tx.instExercises.update({
      where: { id: existing.id },
      data: {
        name: exercise.name,
        ...(exercise.learningTool === null
          ? {}
          : { learning_tool: exercise.learningTool }),
        ...(exercise.exType === null ? {} : { ex_type: exercise.exType }),
        ...(exercise.avAddress === null ? {} : { av_address: exercise.avAddress }),
        ...(exercise.width === null ? {} : { width: exercise.width }),
        ...(exercise.height === null ? {} : { height: exercise.height }),
        updated_at: now,
      },
    });
  }

  return tx.instExercises.create({
    data: {
      short_name: exercise.shortName,
      name: exercise.name,
      learning_tool: exercise.learningTool,
      ex_type: exercise.exType,
      av_address: exercise.avAddress,
      width: exercise.width,
      height: exercise.height,
      created_at: now,
      updated_at: now,
    },
  });
}

async function upsertSectionExercise(
  tx: Prisma.TransactionClient,
  params: {
    instBookId: number;
    instSectionId: number;
    instExerciseId: number;
    learningTool: boolean;
    points: number;
    required: boolean;
    threshold: number;
    partialCredit: boolean;
    options: string | null;
    json: Record<string, unknown>;
  },
  now: Date
) {
  const existing = await tx.instBookSectionExercises.findFirst({
    where: params.learningTool
      ? {
          inst_book_id: params.instBookId,
          inst_section_id: params.instSectionId,
        }
      : {
          inst_book_id: params.instBookId,
          inst_section_id: params.instSectionId,
          inst_exercise_id: params.instExerciseId,
        },
  });

  const fields = {
    inst_exercise_id: params.instExerciseId,
    points: params.points,
    required: params.required,
    threshold: params.threshold,
    partial_credit: params.partialCredit,
    options: params.options,
    json: JSON.stringify(params.json),
    updated_at: now,
  };

  if (existing) {
    return tx.instBookSectionExercises.update({
      where: { id: existing.id },
      data: fields,
    });
  }

  const instance = await tx.exerciseInstances.create({
    data: {
      inst_exercise_id: params.instExerciseId,
      context_type: "book",
      created_at: now,
      updated_at: now,
    },
  });

  return tx.instBookSectionExercises.create({
    data: {
      ...fields,
      inst_book_id: params.instBookId,
      inst_section_id: params.instSectionId,
      exercise_instance_id: instance.id,
      created_at: now,
    },
  });
}

// ============================================================================
// Section exercise dispatch
// ============================================================================

async function persistSectionExercises(
  tx: Prisma.TransactionClient,
  instBookId: number,
  section: { id: number; learning_tool: string | null; resource_name: string | null },
  sectionValue: Record<string, unknown>,
  now: Date
): Promise<{ exercises: number; hasPoints: boolean }> {
  if (section.learning_tool) {
    const resourceName = section.resource_name;
    if (!resourceName) {
      throw new BookConfigError(
        400,
        `Learning-tool section "${sectionValue.long_name ?? section.id}" has no resource_name.`
      );
    }

    const exercise = await upsertInstExercise(
      tx,
      {
        shortName: resourceName,
        name: resourceName,
        learningTool: section.learning_tool,
        exType: readString(sectionValue.type),
        avAddress: null,
        width: null,
        height: null,
      },
      now
    );

    const points = numberOrZero(sectionValue.points);

    await upsertSectionExercise(
      tx,
      {
        instBookId,
        instSectionId: section.id,
        instExerciseId: exercise.id,
        learningTool: true,
        points,
        required: Boolean(sectionValue.required),
        // Rails stored 100 for learning tools, since the external tool owns
        // the actual score and passback is a binary/proficiency result.
        threshold: 100,
        partialCredit: Boolean(sectionValue.partial_credit),
        options: null,
        json: sectionValue,
      },
      now
    );

    return { exercises: 1, hasPoints: points > 0 };
  }

  let exercises = 0;
  let hasPoints = false;

  for (const [shortNameRaw, exerciseValue] of Object.entries(sectionValue)) {
    if (!isPlainObject(exerciseValue)) continue;

    const shortName = shortNameRaw.trim();
    if (!shortName) continue;

    const exercise = await upsertInstExercise(
      tx,
      {
        shortName,
        name: readString(exerciseValue.long_name) ?? shortName,
        learningTool: null,
        exType: readString(exerciseValue.type),
        avAddress:
          readString(exerciseValue.av_address) ??
          readString(exerciseValue.url),
        width: integerOrNull(exerciseValue.width),
        height: integerOrNull(exerciseValue.height),
      },
      now
    );

    const points = numberOrZero(exerciseValue.points);
    const exerOptions = isPlainObject(exerciseValue.exer_options)
      ? exerciseValue.exer_options
      : null;

    await upsertSectionExercise(
      tx,
      {
        instBookId,
        instSectionId: section.id,
        instExerciseId: exercise.id,
        learningTool: false,
        points,
        required: Boolean(exerciseValue.required),
        threshold: numberOr(exerciseValue.threshold, 5),
        partialCredit: Boolean(exerciseValue.partial_credit),
        options: exerOptions === null ? null : JSON.stringify(exerOptions),
        json: exerciseValue,
      },
      now
    );

    exercises++;
    if (points > 0) hasPoints = true;
  }

  return { exercises, hasPoints };
}

// ============================================================================
// Validation / value helpers
// ============================================================================

function requireConfigObject(config: unknown): Record<string, unknown> {
  if (!isPlainObject(config)) {
    throw new BookConfigError(400, "config must be a JSON object.");
  }
  return config;
}

function readTitle(config: Record<string, unknown>): string {
  const title = typeof config.title === "string" ? config.title.trim() : "";
  if (!title) {
    throw new BookConfigError(400, "config.title is required.");
  }
  if (title.length > 50) {
    throw new BookConfigError(400, "config.title must be at most 50 characters.");
  }
  return title;
}

function readDesc(config: Record<string, unknown>): string | null {
  if (config.desc === undefined || config.desc === null) return null;
  if (typeof config.desc !== "string") {
    throw new BookConfigError(400, "config.desc must be a string.");
  }
  const desc = config.desc.trim();
  if (desc.length > 255) {
    throw new BookConfigError(400, "config.desc must be at most 255 characters.");
  }
  return desc || null;
}

function readChapters(config: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(config.chapters)) {
    throw new BookConfigError(400, "config.chapters must be an object.");
  }
  return config.chapters;
}

function buildBookOptions(config: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "chapters" || key === "inst_book_id" || key === "last_compiled") {
      continue;
    }
    options[key] = value;
  }
  return options;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrZero(value: unknown): number {
  return numberOr(value, 0);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value);
  // The legacy editor used this sentinel for "no deadline".
  if (raw.startsWith("0000-00-00")) return undefined;
  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BookConfigError(400, `${field} is not a valid date.`);
  }
  return date;
}

export { Simple2FullError };
