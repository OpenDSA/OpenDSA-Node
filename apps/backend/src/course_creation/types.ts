import type { Prisma } from "@prisma/client";
import type { BookCompileInput as CompileInput } from "./contract";

// ============================================================================
// Input & Output Types
// ============================================================================

export interface GenerateCourseInput {
  canvasContentOnly?: boolean;
  bookPublicBaseUrl?: string;
  instBookId: number;
  launchUrl: string;
  resourceSelectionUrl: string;
  extrtoolLaunchBaseUrl: string;
  userId: number;

  openDsaSharedDir: string;
  configApiLink: string;
  timeoutMs?: number;
}

export interface OpenDsaCompileResponse {
  ok: boolean;
  message?: number;
  stdout_compressed?: string;
  stderr_compressed?: string;
}

export interface GenerateCourseOutput {
  instBookId: number;
  lmsCourseId: string;
  lmsCourseCode: string;
  configFilePath: string;
  configPath: string;
  buildPath: string;
  bookConfig: CompileInput;
  compileResponse: OpenDsaCompileResponse;
}

export type {
  BookCompileInput,
  ChapterCompileConfig,
  ExerciseCompileConfig,
  ModuleCompileConfig,
  SectionCompileConfig,
} from "./contract";

// ============================================================================
// Prisma Query Shape (Single Query to Avoid N+1s)
// ============================================================================

export const instBookFullInclude = {
  course_offering: {
    include: {
      lms_instance: true,
      term: true,
      course: {
        include: {
          organization: true,
        },
      },
    },
  },
  inst_chapters: {
    orderBy: { position: "asc" as const },
    include: {
      inst_chapter_modules: {
        orderBy: { module_position: "asc" as const },
        include: {
          inst_module: true,
          inst_sections: {
            orderBy: { position: "asc" as const },
            include: {
              inst_book_section_exercises: {
                orderBy: { id: "asc" as const },
                include: {
                  inst_exercise: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.InstBooksInclude;

export type LoadedInstBook = Prisma.InstBooksGetPayload<{
  include: typeof instBookFullInclude;
}>;

export type LoadedChapter = LoadedInstBook["inst_chapters"][number];
export type LoadedChapterModule =
  LoadedChapter["inst_chapter_modules"][number];
export type LoadedSection = LoadedChapterModule["inst_sections"][number];
export type LoadedSectionExercise =
  LoadedSection["inst_book_section_exercises"][number];
