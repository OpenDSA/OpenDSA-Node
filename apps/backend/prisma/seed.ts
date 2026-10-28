
import { PrismaClient } from "@prisma/client";
import { seedAcademic } from "./seed-academic";
import { seedBook } from "./seed-book";

try {
  process.loadEnvFile?.();
} catch {
  // Ignore if .env is not present; environment variables may be set directly.
}

const prisma = new PrismaClient();

async function main() {
  if (![undefined, "development", "test"].includes(process.env.NODE_ENV)) {
    throw new Error("Development seed requires NODE_ENV=development or test (or unset).");
  }
  console.log("Seeding OpenDSA database...");
  await seedAcademic(prisma);
  await seedBook(prisma);

  // 1. Create or find the Student role
  let studentRole = await prisma.globalRoles.findFirst({
    where: { name: "Student" },
  });

  if (!studentRole) {
    studentRole = await prisma.globalRoles.create({
      data: {
        name: "Student",
        builtin: true,
        can_manage_all_courses: false,
        can_edit_system_configuration: false,
      },
    });
  }

  // 2. Create sample students
  const studentsData = [
    {
      email: "seed-alice@example.com",
      slug: "seed-alice",
      first_name: "Alice",
      last_name: "Johnson",
    },
    {
      email: "seed-bob@example.com",
      slug: "seed-bob",
      first_name: "Bob",
      last_name: "Smith",
    },
    {
      email: "seed-charlie@example.com",
      slug: "seed-charlie",
      first_name: "Charlie",
      last_name: "Brown",
    },
  ];

  const students = [];

  for (const data of studentsData) {
    const student = await prisma.users.upsert({
      where: { email: data.email },
      update: {
        first_name: data.first_name,
        last_name: data.last_name,
        global_role_id: studentRole.id,
      },
      create: {
        ...data,
        global_role_id: studentRole.id,
      },
    });

    students.push(student);
  }

  // 3. Create sample exercises
  const exercisesData = [
    {
      name: "Binary Search",
      short_name: "seed-binary-search",
      ex_type: "ka",
      description: "Practice binary search on sorted arrays",
    },
    {
      name: "Insertion Sort",
      short_name: "seed-insertion-sort",
      ex_type: "av",
      description: "Visualize the insertion sort algorithm",
    },
    {
      name: "Binary Search Tree",
      short_name: "seed-bst",
      ex_type: "ka",
      description: "Practice BST insertion and traversal",
    },
  ];

  const exercises = [];
  const instances = [];

  for (const data of exercisesData) {
    const exercise = await prisma.instExercises.upsert({
      where: { short_name: data.short_name },
      update: {
        name: data.name,
        ex_type: data.ex_type,
        description: data.description,
      },
      create: data,
    });

    exercises.push(exercise);

    // 4. Create an exercise instance for each exercise
    let instance = await prisma.exerciseInstances.findFirst({
      where: {
        inst_exercise_id: exercise.id,
        context_type: "seed_demo",
      },
    });

    if (!instance) {
      instance = await prisma.exerciseInstances.create({
        data: {
          inst_exercise_id: exercise.id,
          context_type: "seed_demo",
          state: {
            currentQuestion: 1,
            completed: false,
          },
        },
      });
    }

    instances.push(instance);
  }

  // 5. Create attempts and progress for each student/exercise pair
  let attemptsCreated = 0;

  for (let studentIndex = 0; studentIndex < students.length; studentIndex++) {
    const student = students[studentIndex];

    for (let exerciseIndex = 0; exerciseIndex < instances.length; exerciseIndex++) {
      const instance = instances[exerciseIndex];

      // Each student gets two attempts per exercise
      const attemptResults = [
        (studentIndex + exerciseIndex) % 3 !== 0,
        (studentIndex + exerciseIndex) % 2 === 0,
      ];

      for (let attemptIndex = 0; attemptIndex < attemptResults.length; attemptIndex++) {
        const correct = attemptResults[attemptIndex];
        const questionName = `seed-question-${attemptIndex + 1}`;

        const existingAttempt = await prisma.odsaExerciseAttempts.findFirst({
          where: {
            user_id: student.id,
            exercise_instance_id: instance.id,
            question_name: questionName,
          },
        });

        if (!existingAttempt) {
          await prisma.odsaExerciseAttempts.create({
            data: {
              user_id: student.id,
              exercise_instance_id: instance.id,
              worth_credit: true,
              time_done: new Date("2023-01-01T12:00:00Z"),
              time_taken: 20 + attemptIndex * 15,
              count_hints: correct ? 0 : 1,
              hint_used: !correct,
              points_earned: correct ? 1 : 0,
              earned_proficiency: correct,
              count_attempts: BigInt(attemptIndex + 1),
              ip_address: "127.0.0.1",
              question_name: questionName,
              request_type: "AV",
              correct,
              state: {
                selectedAnswer: correct ? "B" : "A",
                completed: true,
              },
            },
          });

          attemptsCreated++;
        }
      }

      // 6. Create or update progress for this student/exercise
      const totalCorrect = attemptResults.filter(Boolean).length;
      const score = Math.round((totalCorrect / attemptResults.length) * 100);
      const now = new Date("2023-01-01T12:00:00Z");

      await prisma.odsaExerciseProgresses.upsert({
        where: {
          user_id_exercise_instance_id: {
            user_id: student.id,
            exercise_instance_id: instance.id,
          },
        },
        update: {}, // Preserve existing progress, including subsequent development activity.
        create: {
          user_id: student.id,
          exercise_instance_id: instance.id,
          current_score: score,
          highest_score: score,
          first_done: now,
          last_done: now,
          total_correct: totalCorrect,
          total_worth_credit: attemptResults.length,
          proficient_date: now,
        },
      });
    }
  }

  console.log("Seed completed successfully!");
  console.log(`Students: ${students.length}`);
  console.log(`Exercises: ${exercises.length}`);
  console.log(`Exercise instances: ${instances.length}`);
  console.log(`New attempts created: ${attemptsCreated}`);
  console.log(`Student/exercise progress records: ${students.length * instances.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
