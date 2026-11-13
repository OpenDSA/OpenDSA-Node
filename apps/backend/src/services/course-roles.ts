import { Prisma } from "@prisma/client";
import { prisma } from "../db";

// Existing Node seed IDs (verified locally and on Discovery). Do not reorder:
// Rails has a different mapping; migration must preserve/map enrollment IDs.
export const INSTRUCTOR_COURSE_ROLE_ID = 1;
export const STUDENT_COURSE_ROLE_ID = 2;
type RoleClient = Pick<Prisma.TransactionClient, "courseRoles">;
export async function ensureBuiltinCourseRole(instructor: boolean, db: RoleClient = prisma) {
  const id = instructor ? INSTRUCTOR_COURSE_ROLE_ID : STUDENT_COURSE_ROLE_ID;
  let role = await db.courseRoles.findUnique({ where: { id } });
  if (!role) {
    try {
      role = await db.courseRoles.create({ data: { id, name: instructor ? "Instructor" : "Student", builtin: true,
        can_manage_course: instructor, can_manage_assignments: instructor,
        can_grade_submissions: instructor, can_view_other_submissions: instructor } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      role = await db.courseRoles.findUnique({ where: { id } });
    }
  }
  if (!role?.builtin || role.can_manage_course !== instructor || role.can_manage_assignments !== instructor ||
      role.can_grade_submissions !== instructor || role.can_view_other_submissions !== instructor) {
    throw new Error(`Built-in course role ${id} is not configured correctly.`);
  }
  return role;
}
