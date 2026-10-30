import { Prisma } from "@prisma/client";

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
  bookConfig: BookConfigJson;
  compileResponse: OpenDsaCompileResponse;
}

// ============================================================================
// Book Configuration JSON Interfaces (Matches show.json.jbuilder contract)
// ============================================================================

export interface BookConfigJson {
  inst_book_id: number;
  title: string;
  desc: string | null;
  last_compiled: string | null;
  chapters: Record<string, ChapterConfigJson>;
  course_id?: string;
  LMS_url?: string;
  [key: string]: unknown;
}

export interface ChapterConfigJson {
  lms_chapter_id: number | null;
  lms_assignment_group_id: number | null;
  [modulePath: string]: ModuleConfigJson | number | null;
}

export interface ModuleConfigJson {
  lms_module_item_id: number | null;
  lms_section_item_id: number | null;
  lms_assignment_id: number | null;
  long_name: string;
  due_dates: string | null;
  sections: Record<string, SectionConfigJson> | null;
}

export interface SectionConfigJson {
  id: number;
  soft_deadline: string | null;
  hard_deadline: string | null;
  showsection: boolean | null;
  lms_item_id: number | null;
  lms_assignment_id: number | null;
  learning_tool?: string;
  resource_type?: string | null;
  resource_name?: string | null;
  points?: number;
  launch_url?: string;
  [exerciseShortName: string]: unknown;
}

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
            include: {
              inst_book_section_exercises: {
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

export type LoadedChapterModule = LoadedChapter["inst_chapter_modules"][number];
