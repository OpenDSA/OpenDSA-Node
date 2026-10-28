import { PrismaClient } from "@prisma/client";

const SEED_NOW = new Date("2023-08-01T12:00:00Z");

const DEFAULT_BOOK_OPTIONS = {
  build_dir: "Books",
  code_dir: "SourceCode/",
  lang: "en",
  code_lang: {
    Java: { ext: ["java"], label: "Java", lang: "java" },
    Java_Generic: { ext: ["java"], label: "Java (Generic)", lang: "java" },
    "C++": { ext: ["cpp", "h"], label: "C++", lang: "C++" },
  },
  build_JSAV: false,
  tabbed_codeinc: true,
  suppress_todo: true,
  assumes: "recursion",
  dispModComp: true,
  zeropt_assignments: false,
  glob_exer_options: {
    "JXOP-debug": "true",
  },
};

interface SeedExerciseConfig {
  short_name: string;
  name: string;
  ex_type: string;
  points: number;
  required: boolean;
  threshold: number;
}

interface SeedSectionConfig {
  name: string;
  position: number;
  gradable: boolean;
  show: boolean;
  exercises: SeedExerciseConfig[];
}

interface SeedModuleConfig {
  path: string;
  name: string;
  module_position: number;
  sections: SeedSectionConfig[];
}

interface SeedChapterConfig {
  name: string;
  short_display_name: string;
  position: number;
  modules: SeedModuleConfig[];
}

const BOOK_CHAPTER_SEEDS: SeedChapterConfig[] = [
  {
    name: "Preface",
    short_display_name: "Preface",
    position: 1,
    modules: [
      {
        path: "Intro",
        name: "How to Use this System",
        module_position: 1,
        sections: [],
      },
    ],
  },
  {
    name: "Searching and Sorting",
    short_display_name: "SearchSort",
    position: 2,
    modules: [
      {
        path: "Searching/BinarySearch",
        name: "Searching in an Array",
        module_position: 1,
        sections: [
          {
            name: "Searching in an Array",
            position: 1,
            gradable: true,
            show: true,
            exercises: [
              {
                short_name: "binarySearchCON",
                name: "Binary Search Algorithm Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "binarySearchPRO",
                name: "Binary Search Proficiency Exercise",
                ex_type: "pe",
                points: 2.0,
                required: true,
                threshold: 0.9,
              },
            ],
          },
        ],
      },
      {
        path: "Sorting/InsertionSort",
        name: "Insertion Sort",
        module_position: 2,
        sections: [
          {
            name: "Insertion Sort",
            position: 1,
            gradable: true,
            show: true,
            exercises: [
              {
                short_name: "insertionsortCON",
                name: "Insertion Sort Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "insertionsortAV",
                name: "Insertion Sort Visualization",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "InssortPRO",
                name: "Insertion Sort Proficiency Exercise",
                ex_type: "ka",
                points: 1.0,
                required: true,
                threshold: 5.0,
              },
            ],
          },
          {
            name: "Insertion Sort Analysis",
            position: 2,
            gradable: true,
            show: true,
            exercises: [
              {
                short_name: "InsertionSortWorstCaseCON",
                name: "Insertion Sort Worst Case Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "InsertionSortBestCaseCON",
                name: "Insertion Sort Best Case Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "InsertionSortAverageCaseCON",
                name: "Insertion Sort Average Case Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "InssortSumm",
                name: "Insertion Sort Summary Exercise",
                ex_type: "ka",
                points: 1.0,
                required: true,
                threshold: 5.0,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "Binary Trees",
    short_display_name: "BST",
    position: 3,
    modules: [
      {
        path: "Binary/BST",
        name: "Binary Search Trees",
        module_position: 1,
        sections: [
          {
            name: "Binary Search Tree Definition",
            position: 1,
            gradable: true,
            show: true,
            exercises: [
              {
                short_name: "BSTsearchCON",
                name: "BST Search Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "BSTsearchPRO",
                name: "BST Search Proficiency Exercise",
                ex_type: "pe",
                points: 2.0,
                required: true,
                threshold: 0.9,
              },
            ],
          },
          {
            name: "BST Insert",
            position: 2,
            gradable: true,
            show: true,
            exercises: [
              {
                short_name: "BSTinsertCON",
                name: "BST Insert Slideshow",
                ex_type: "ss",
                points: 0,
                required: false,
                threshold: 1.0,
              },
              {
                short_name: "BSTinsertPRO",
                name: "BST Insert Proficiency Exercise",
                ex_type: "pe",
                points: 2.0,
                required: true,
                threshold: 0.9,
              },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedBook(prisma: PrismaClient) {
  const canvasUrl = (
    process.env.SEED_CANVAS_URL || "https://seed-canvas.example.invalid"
  ).replace(/\/+$/, "");
  const canvasCourseId = process.env.SEED_CANVAS_COURSE_ID || "20231001";
  const canvasApiKey = process.env.SEED_CANVAS_API_KEY || "seed-canvas-api-key";
  const consumerKey =
    process.env.SEED_LTI_CONSUMER_KEY || "opendsa_consumer_key";
  const consumerSecret =
    process.env.SEED_LTI_CONSUMER_SECRET || "opendsa_consumer_secret";

  const canvasLmsType = await prisma.lmsTypes.findUniqueOrThrow({
    where: { name: "Canvas" },
  });
  const organization = await prisma.organizations.findUniqueOrThrow({
    where: { slug: "seed-vt" },
  });
  const course = await prisma.courses.findFirstOrThrow({
    where: { slug: "seed-cs1114", organization_id: organization.id },
  });
  const term = await prisma.terms.findUniqueOrThrow({
    where: { slug: "seed-2023-100" },
  });
  const latePolicy = await prisma.latePolicies.findUniqueOrThrow({
    where: { name: "0_days" },
  });
  const instructorRole = await prisma.courseRoles.findFirstOrThrow({
    where: { name: "Instructor" },
  });
  const instructor = await prisma.users.findUniqueOrThrow({
    where: { email: "seed-academic-instructor@example.com" },
  });
  const admin = await prisma.users.findUniqueOrThrow({
    where: { email: "seed-academic-admin@example.com" },
  });

  // 1. Upsert target Canvas LMS instance (preserving seed-canvas.example.invalid)
  const lmsInstance = await prisma.lmsInstances.upsert({
    where: { url: canvasUrl },
    update: {
      lms_type_id: canvasLmsType.id,
      organization_id: organization.id,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      updated_at: SEED_NOW,
    },
    create: {
      url: canvasUrl,
      lms_type_id: canvasLmsType.id,
      organization_id: organization.id,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      created_at: SEED_NOW,
      updated_at: SEED_NOW,
    },
  });

  // 2. Upsert LmsAccesses for instructor and admin on the target LMS instance
  for (const user of [instructor, admin]) {
    await prisma.lmsAccesses.upsert({
      where: {
        lms_instance_id_user_id: {
          lms_instance_id: lmsInstance.id,
          user_id: user.id,
        },
      },
      update: {
        access_token: canvasApiKey,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        updated_at: SEED_NOW,
      },
      create: {
        lms_instance_id: lmsInstance.id,
        user_id: user.id,
        access_token: canvasApiKey,
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        created_at: SEED_NOW,
        updated_at: SEED_NOW,
      },
    });
  }

  // 3. Find or create CourseOffering for the target Canvas course ID
  const existingOffering = await prisma.courseOfferings.findFirst({
    where: {
      lms_instance_id: lmsInstance.id,
      lms_course_num: canvasCourseId,
    },
  });

  const courseOffering = existingOffering
    ? await prisma.courseOfferings.update({
        where: { id: existingOffering.id },
        data: {
          course_id: course.id,
          term_id: term.id,
          late_policy_id: latePolicy.id,
          updated_at: SEED_NOW,
        },
      })
    : await prisma.courseOfferings.create({
        data: {
          course_id: course.id,
          term_id: term.id,
          label: "Canvas Course Generation Test",
          late_policy_id: latePolicy.id,
          lms_instance_id: lmsInstance.id,
          lms_course_code: "CS1114-SEED",
          lms_course_num: canvasCourseId,
          archived: false,
          self_enrollment_allowed: true,
          created_at: SEED_NOW,
          updated_at: SEED_NOW,
        },
      });

  for (const user of [instructor, admin]) {
    await prisma.courseEnrollments.upsert({
      where: {
        user_id_course_offering_id: {
          user_id: user.id,
          course_offering_id: courseOffering.id,
        },
      },
      update: { course_role_id: instructorRole.id },
      create: {
        user_id: user.id,
        course_offering_id: courseOffering.id,
        course_role_id: instructorRole.id,
      },
    });
  }

  // 4. Find or create the seeded InstBook
  const bookTitle = "CS 1114 OpenDSA Book";
  let instBook = await prisma.instBooks.findFirst({
    where: { title: bookTitle, user_id: instructor.id },
  });

  const offeringChanged =
    instBook !== null && instBook.course_offering_id !== courseOffering.id;

  if (!instBook) {
    instBook = await prisma.instBooks.create({
      data: {
        course_offering_id: courseOffering.id,
        user_id: instructor.id,
        title: bookTitle,
        desc: "Seeded OpenDSA textbook for course generation",
        template: false,
        book_type: 0,
        options: JSON.stringify(DEFAULT_BOOK_OPTIONS),
        created_at: SEED_NOW,
        updated_at: SEED_NOW,
      },
    });
  } else {
    instBook = await prisma.instBooks.update({
      where: { id: instBook.id },
      data: {
        course_offering_id: courseOffering.id,
        options: JSON.stringify(DEFAULT_BOOK_OPTIONS),
        updated_at: SEED_NOW,
      },
    });
  }

  // 5. Seed chapters, modules, chapter-modules, sections, exercises, and section-exercises
  let chapterCount = 0;
  let moduleCount = 0;
  let sectionCount = 0;
  let sectionExerciseCount = 0;

  for (const chapterSeed of BOOK_CHAPTER_SEEDS) {
    let instChapter = await prisma.instChapters.findFirst({
      where: {
        inst_book_id: instBook.id,
        position: chapterSeed.position,
      },
    });

    if (!instChapter) {
      instChapter = await prisma.instChapters.create({
        data: {
          inst_book_id: instBook.id,
          name: chapterSeed.name,
          short_display_name: chapterSeed.short_display_name,
          position: chapterSeed.position,
          created_at: SEED_NOW,
          updated_at: SEED_NOW,
        },
      });
    } else {
      instChapter = await prisma.instChapters.update({
        where: { id: instChapter.id },
        data: {
          name: chapterSeed.name,
          short_display_name: chapterSeed.short_display_name,
          ...(offeringChanged
            ? { lms_chapter_id: null, lms_assignment_group_id: null }
            : {}),
          updated_at: SEED_NOW,
        },
      });
    }
    chapterCount++;

    for (const moduleSeed of chapterSeed.modules) {
      const instModule = await prisma.instModules.upsert({
        where: { path: moduleSeed.path },
        update: {
          name: moduleSeed.name,
          updated_at: SEED_NOW,
        },
        create: {
          path: moduleSeed.path,
          name: moduleSeed.name,
          created_at: SEED_NOW,
          updated_at: SEED_NOW,
        },
      });
      moduleCount++;

      let instChapterModule = await prisma.instChapterModules.findFirst({
        where: {
          inst_chapter_id: instChapter.id,
          inst_module_id: instModule.id,
          module_position: moduleSeed.module_position,
        },
      });

      if (!instChapterModule) {
        instChapterModule = await prisma.instChapterModules.create({
          data: {
            inst_chapter_id: instChapter.id,
            inst_module_id: instModule.id,
            module_position: moduleSeed.module_position,
            created_at: SEED_NOW,
            updated_at: SEED_NOW,
          },
        });
      } else if (offeringChanged) {
        instChapterModule = await prisma.instChapterModules.update({
          where: { id: instChapterModule.id },
          data: {
            lms_module_item_id: null,
            lms_section_item_id: null,
            lms_assignment_id: null,
            updated_at: SEED_NOW,
          },
        });
      }

      for (const sectionSeed of moduleSeed.sections) {
        let instSection = await prisma.instSections.findFirst({
          where: {
            inst_chapter_module_id: instChapterModule.id,
            inst_module_id: instModule.id,
            name: sectionSeed.name,
          },
        });

        if (!instSection) {
          instSection = await prisma.instSections.create({
            data: {
              inst_module_id: instModule.id,
              inst_chapter_module_id: instChapterModule.id,
              name: sectionSeed.name,
              short_display_name: sectionSeed.name.slice(0, 50),
              position: sectionSeed.position,
              gradable: sectionSeed.gradable,
              show: sectionSeed.show,
              created_at: SEED_NOW,
              updated_at: SEED_NOW,
            },
          });
        } else {
          instSection = await prisma.instSections.update({
            where: { id: instSection.id },
            data: {
              position: sectionSeed.position,
              gradable: sectionSeed.gradable,
              show: sectionSeed.show,
              updated_at: SEED_NOW,
            },
          });
        }
        sectionCount++;

        for (const exerciseSeed of sectionSeed.exercises) {
          const instExercise = await prisma.instExercises.upsert({
            where: { short_name: exerciseSeed.short_name },
            update: {
              name: exerciseSeed.name,
              ex_type: exerciseSeed.ex_type,
              updated_at: SEED_NOW,
            },
            create: {
              short_name: exerciseSeed.short_name,
              name: exerciseSeed.name,
              ex_type: exerciseSeed.ex_type,
              created_at: SEED_NOW,
              updated_at: SEED_NOW,
            },
          });

          const existingSectionExercise =
            await prisma.instBookSectionExercises.findFirst({
              where: {
                inst_book_id: instBook.id,
                inst_section_id: instSection.id,
                inst_exercise_id: instExercise.id,
              },
            });

          const exerciseJson = JSON.stringify({
            long_name: exerciseSeed.name,
            required: exerciseSeed.required,
            points: exerciseSeed.points,
            threshold: exerciseSeed.threshold,
          });

          if (!existingSectionExercise) {
            const exerciseInstance = await prisma.exerciseInstances.create({
              data: {
                inst_exercise_id: instExercise.id,
                context_type: "book",
                created_at: SEED_NOW,
                updated_at: SEED_NOW,
              },
            });

            await prisma.instBookSectionExercises.create({
              data: {
                inst_book_id: instBook.id,
                inst_section_id: instSection.id,
                inst_exercise_id: instExercise.id,
                exercise_instance_id: exerciseInstance.id,
                points: exerciseSeed.points,
                required: exerciseSeed.required,
                threshold: exerciseSeed.threshold,
                partial_credit: false,
                json: exerciseJson,
                created_at: SEED_NOW,
                updated_at: SEED_NOW,
              },
            });
          } else {
            await prisma.instBookSectionExercises.update({
              where: { id: existingSectionExercise.id },
              data: {
                points: exerciseSeed.points,
                required: exerciseSeed.required,
                threshold: exerciseSeed.threshold,
                json: exerciseJson,
                updated_at: SEED_NOW,
              },
            });
          }
          sectionExerciseCount++;
        }
      }
    }
  }

  console.log(
    `Book seed complete: instBookId=${instBook.id}, instructorUserId=${instructor.id}, adminUserId=${admin.id}, lmsUrl=${lmsInstance.url}, lmsCourseNum=${courseOffering.lms_course_num} (${chapterCount} chapters, ${moduleCount} modules, ${sectionCount} sections, ${sectionExerciseCount} section exercises).`
  );

  return {
    instBook,
    instructor,
    admin,
    lmsInstance,
    courseOffering,
  };
}
