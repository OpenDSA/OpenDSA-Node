import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeBookConfig } from "../src/course_creation/serialize_book_config";
import { validateBookForCompile } from "../src/course_creation/validate_book";
import {
  buildBookOutputPath,
  formatDueDate,
  parseJsonObject,
  sanitizeFilename,
} from "../src/course_creation/utils";
import type { LoadedInstBook } from "../src/course_creation/types";

// ============================================================================
// Fixtures
// ============================================================================

interface ExerciseSeed {
  id: number;
  shortName: string;
  name: string;
  points?: number;
  required?: boolean;
  threshold?: number;
  options?: unknown;
  json?: Record<string, unknown>;
}

function makeSectionExercise(seed: ExerciseSeed) {
  return {
    id: seed.id,
    points: seed.points ?? 1,
    required: seed.required ?? true,
    threshold: seed.threshold ?? 0.9,
    partial_credit: false,
    options:
      seed.options === undefined
        ? JSON.stringify({ "JXOP-debug": "true" })
        : JSON.stringify(seed.options),
    // The stored snapshot always carries values that are not columns
    // (and, historically, partial_credit, which the compiler rejects).
    json: JSON.stringify({
      long_name: seed.name,
      points: seed.points ?? 1,
      required: seed.required ?? true,
      threshold: seed.threshold ?? 0.9,
      partial_credit: true,
      unknown_field: "drop me",
      ...(seed.json ?? {}),
    }),
    inst_exercise: {
      id: 100 + seed.id,
      short_name: seed.shortName,
      name: seed.name,
    },
  };
}

type SectionExercise = ReturnType<typeof makeSectionExercise>;

function makeSection(seed: {
  id: number;
  name: string;
  show?: boolean;
  learningTool?: string;
  resourceName?: string;
  resourceType?: string;
  exercises?: SectionExercise[];
}) {
  return {
    id: seed.id,
    name: seed.name,
    show: seed.show ?? true,
    learning_tool: seed.learningTool ?? null,
    resource_type: seed.resourceType ?? null,
    resource_name: seed.resourceName ?? null,
    soft_deadline: null,
    hard_deadline: null,
    lms_item_id: null,
    lms_assignment_id: null,
    inst_book_section_exercises: seed.exercises ?? [],
  };
}

type Section = ReturnType<typeof makeSection>;

function makeModule(seed: {
  id: number;
  path: string;
  name: string;
  modulePosition?: number;
  lmsModuleItemId?: number | null;
  lmsAssignmentId?: number | null;
  sections?: Section[];
  dueDates?: Date | null;
}) {
  return {
    id: seed.id,
    module_position: seed.modulePosition ?? 1,
    lms_module_item_id: seed.lmsModuleItemId ?? null,
    lms_section_item_id: null,
    lms_assignment_id: seed.lmsAssignmentId ?? null,
    due_dates: seed.dueDates ?? null,
    inst_module: {
      id: 1000 + seed.id,
      path: seed.path,
      name: seed.name,
    },
    inst_sections: seed.sections ?? [],
  };
}

type ChapterModule = ReturnType<typeof makeModule>;

function makeChapter(seed: {
  id: number;
  name: string;
  position?: number;
  modules: ChapterModule[];
}) {
  return {
    id: seed.id,
    name: seed.name,
    position: seed.position ?? 1,
    inst_chapter_modules: seed.modules,
  };
}

function makeBook(
  chapters: ReturnType<typeof makeChapter>[],
  options: {
    courseOffering?: boolean;
    bookOptions?: Record<string, unknown>;
  } = {}
): LoadedInstBook {
  return {
    id: 42,
    user_id: 1,
    course_offering_id: 7,
    title: "Test Book",
    desc: "Test description",
    last_compiled: null,
    book_type: 0,
    template: false,
    options: JSON.stringify(
      options.bookOptions ?? { build_dir: "Books", lang: "en" }
    ),
    course_offering:
      options.courseOffering === false
        ? null
        : {
            id: 7,
            lms_course_num: "123",
            lms_instance: { url: "https://canvas.example" },
            term: { slug: "2026-fall" },
            course: { slug: "cs3114", organization: { slug: "vt" } },
          },
    inst_chapters: chapters,
  } as unknown as LoadedInstBook;
}

function defaultBook(): LoadedInstBook {
  return makeBook([
    makeChapter({
      id: 1,
      name: "Chapter One",
      modules: [
        makeModule({
          id: 10,
          path: "Sorting/InsertionSort",
          name: "Insertion Sort",
          lmsModuleItemId: 501,
          lmsAssignmentId: 601,
          sections: [
            makeSection({
              id: 20,
              name: "Insertion Sort",
              exercises: [
                makeSectionExercise({
                  id: 1,
                  shortName: "insertionsortCON",
                  name: "Insertion Sort Slideshow",
                  points: 0,
                  required: false,
                  threshold: 1,
                }),
                makeSectionExercise({
                  id: 2,
                  shortName: "InssortPRO",
                  name: "Insertion Sort Proficiency Exercise",
                  points: 2,
                  threshold: 0.9,
                  json: {
                    showhide: "show",
                    external_url: "https://example.com/exercise",
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);
}

function compile(book: LoadedInstBook, base = "https://lti.example/lti/launch_extrtool") {
  return serializeBookConfig(book, parseJsonObject(book.options), base);
}

// ============================================================================
// Serializer
// ============================================================================

test("emits the compiler contract and drops unsupported exercise fields", () => {
  const input = compile(defaultBook());

  assert.equal(input.inst_book_id, 42);
  assert.equal(input.title, "Test Book");
  assert.equal(input.course_id, "123");
  assert.equal(input.LMS_url, "https://canvas.example");

  assert.deepEqual(input.chapters["Chapter One"]["Sorting/InsertionSort"], {
    lms_module_item_id: 501,
    lms_assignment_id: 601,
    long_name: "Insertion Sort",
    due_dates: null,
    sections: {
      "Insertion Sort": {
        showsection: true,
        insertionsortCON: {
          id: 1,
          long_name: "Insertion Sort Slideshow",
          required: false,
          points: 0,
          threshold: 1,
          exer_options: { "JXOP-debug": "true" },
        },
        InssortPRO: {
          id: 2,
          long_name: "Insertion Sort Proficiency Exercise",
          required: true,
          points: 2,
          threshold: 0.9,
          showhide: "show",
          external_url: "https://example.com/exercise",
          exer_options: { "JXOP-debug": "true" },
        },
      },
    },
  });

  const proficiency = input.chapters["Chapter One"]["Sorting/InsertionSort"]
    .sections!["Insertion Sort"].InssortPRO as Record<string, unknown>;
  assert.equal("partial_credit" in proficiency, false);
  assert.equal("unknown_field" in proficiency, false);
});

test("uses the options column as exer_options and falls back to the snapshot", () => {
  const withColumn = makeBook([
    makeChapter({
      id: 1,
      name: "Chapter",
      modules: [
        makeModule({
          id: 10,
          path: "Intro",
          name: "Intro",
          sections: [
            makeSection({
              id: 20,
              name: "Intro",
              exercises: [
                makeSectionExercise({
                  id: 1,
                  shortName: "introCON",
                  name: "Intro",
                  options: { from: "column" },
                  json: { exer_options: { from: "snapshot" } },
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);

  const fromColumn = compile(withColumn).chapters["Chapter"]["Intro"]
    .sections!["Intro"].introCON as Record<string, unknown>;
  assert.deepEqual(fromColumn.exer_options, { from: "column" });

  const withoutColumn = makeBook([
    makeChapter({
      id: 1,
      name: "Chapter",
      modules: [
        makeModule({
          id: 10,
          path: "Intro",
          name: "Intro",
          sections: [
            makeSection({
              id: 20,
              name: "Intro",
              exercises: [
                makeSectionExercise({
                  id: 1,
                  shortName: "introCON",
                  name: "Intro",
                  options: null,
                  json: { exer_options: { from: "snapshot" } },
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  ]);

  const fromSnapshot = compile(withoutColumn).chapters["Chapter"]["Intro"]
    .sections!["Intro"].introCON as Record<string, unknown>;
  assert.deepEqual(fromSnapshot.exer_options, { from: "snapshot" });
});

test("emits null sections for a module with no sections", () => {
  const input = compile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Preface",
        modules: [makeModule({ id: 10, path: "Intro", name: "Intro" })],
      }),
    ])
  );

  assert.equal(input.chapters["Preface"].Intro.sections, null);
});

test("serializes learning-tool sections with a launch URL and filtered metadata", () => {
  const input = compile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({
            id: 10,
            path: "RecurTutor/CodeCompletionEx",
            name: "Code Completion",
            sections: [
              makeSection({
                id: 30,
                name: "Programming Exercise",
                learningTool: "code-workout",
                resourceName: "Workout",
                resourceType: "external_assignment",
                exercises: [
                  makeSectionExercise({
                    id: 7,
                    shortName: "Workout",
                    name: "Workout",
                    points: 2,
                    json: {
                      long_name: "Workout",
                      learning_tool: "code-workout",
                      enable_scrolling: false,
                      frame_width: 1000,
                      frame_height: 900,
                      junk: "drop me",
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])
  );

  assert.deepEqual(
    input.chapters["Chapter"]["RecurTutor/CodeCompletionEx"].sections![
      "Programming Exercise"
    ],
    {
      long_name: "Workout",
      enable_scrolling: false,
      frame_width: 1000,
      frame_height: 900,
      showsection: true,
      id: 30,
      learning_tool: "code-workout",
      resource_type: "external_assignment",
      resource_name: "Workout",
      points: 2,
      launch_url: "https://lti.example/lti/launch_extrtool/7",
    }
  );
});

test("book options cannot overwrite authoritative book fields", () => {
  const input = compile(
    makeBook([], {
      bookOptions: {
        title: "Hijacked",
        inst_book_id: 999,
        chapters: { evil: {} },
        LMS_url: "https://evil.example",
        course_id: "evil",
        build_dir: "Books",
      },
    })
  );

  assert.equal(input.title, "Test Book");
  assert.equal(input.inst_book_id, 42);
  assert.deepEqual(input.chapters, {});
  assert.equal(input.LMS_url, "https://canvas.example");
  assert.equal(input.course_id, "123");
});

test("falls back to empty LMS strings when the book has no course offering", () => {
  const input = compile(makeBook([], { courseOffering: false }));

  assert.equal(input.LMS_url, "");
  assert.equal(input.course_id, "");
});

test("formats due dates in the legacy display format", () => {
  const input = compile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({
            id: 10,
            path: "Intro",
            name: "Intro",
            dueDates: new Date(2026, 0, 15, 23, 0),
          }),
        ],
      }),
    ])
  );

  assert.equal(
    input.chapters["Chapter"].Intro.due_dates,
    "01/15/2026 11:00 pm"
  );
  assert.equal(formatDueDate(new Date(2026, 0, 15, 23, 0)), "01/15/2026 11:00 pm");
});

// ============================================================================
// Validation
// ============================================================================

test("rejects modules that would overwrite the same lti_html file", () => {
  const { errors } = validateBookForCompile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({ id: 10, path: "A/Foo", name: "Foo A" }),
          makeModule({ id: 11, path: "B/Foo", name: "Foo B" }),
        ],
      }),
    ])
  );

  assert(errors.some((error) => error.includes("overwrite each other")));
});

test("rejects duplicate module paths", () => {
  const { errors } = validateBookForCompile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter One",
        modules: [makeModule({ id: 10, path: "Intro", name: "Intro" })],
      }),
      makeChapter({
        id: 2,
        name: "Chapter Two",
        modules: [makeModule({ id: 11, path: "Intro", name: "Intro" })],
      }),
    ])
  );

  assert(errors.some((error) => error.includes("appears more than once")));
});

test("rejects module paths deeper than one folder", () => {
  const { errors } = validateBookForCompile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [makeModule({ id: 10, path: "A/B/Foo", name: "Foo" })],
      }),
    ])
  );

  assert(errors.some((error) => error.includes("more than one folder deep")));
});

test("rejects duplicate exercise names within a section", () => {
  const { errors } = validateBookForCompile(
    makeBook([
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({
            id: 10,
            path: "Intro",
            name: "Intro",
            sections: [
              makeSection({
                id: 20,
                name: "Intro",
                exercises: [
                  makeSectionExercise({ id: 1, shortName: "same", name: "Same" }),
                  makeSectionExercise({ id: 2, shortName: "same", name: "Same" }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])
  );

  assert(errors.some((error) => error.includes("more than once")));
});

test("reports missing course offerings, module paths, and external-tool fields", () => {
  const book = makeBook(
    [
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({ id: 10, path: " ", name: "No path" }),
          makeModule({
            id: 11,
            path: "A/Tool",
            name: "Tool",
            sections: [
              makeSection({
                id: 20,
                name: "Tool Section",
                learningTool: "code-workout",
                resourceName: "",
                exercises: [],
              }),
            ],
          }),
        ],
      }),
    ],
    { courseOffering: false }
  );

  const { errors } = validateBookForCompile(book, {
    extrtoolLaunchBaseUrl: "",
  });

  assert(errors.some((error) => error.includes("no course offering")));
  assert(errors.some((error) => error.includes("without a path")));
  assert(errors.some((error) => error.includes("no resource_name")));
  assert(errors.some((error) => error.includes("no exercise row")));
  assert(errors.some((error) => error.includes("extrtoolLaunchBaseUrl")));
});

test("warns, but does not fail, when LMS ids have no LMS context", () => {
  const book = makeBook(
    [
      makeChapter({
        id: 1,
        name: "Chapter",
        modules: [
          makeModule({
            id: 10,
            path: "Intro",
            name: "Intro",
            lmsModuleItemId: 501,
          }),
        ],
      }),
    ],
    { courseOffering: false }
  );

  const { warnings } = validateBookForCompile(book);
  assert(warnings.some((warning) => warning.includes("placeholders")));
});

// ============================================================================
// Paths
// ============================================================================

test("builds and sanitizes book output paths", () => {
  assert.equal(
    buildBookOutputPath({
      organizationSlug: "VT",
      courseSlug: "CS 3114",
      termSlug: "Fall 2026",
      courseOfferingLabel: "TR 10:00am",
    }),
    "VT/CS_3114/Fall_2026/TR_1000am"
  );

  assert.equal(
    sanitizeFilename("temp_5_2026-10-28T02:17:48.000Z"),
    "temp_5_2026-10-28T021748000Z"
  );
});
