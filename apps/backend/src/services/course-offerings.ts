import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export class CourseOfferingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface CreateCourseOfferingInput {
  organization_id: number;
  course_id: number;
  term_id: number;
  label: string;
  lms_instance_id: number;
  lms_course_num: string;
}

export function parseCourseOffering(body: unknown): CreateCourseOfferingInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CourseOfferingError(400, "A JSON object is required.");
  }
  const value = body as Record<string, unknown>;
  const fields = ["organization_id", "course_id", "term_id", "label", "lms_instance_id", "lms_course_num"];
  if (Object.keys(value).some(key => !fields.includes(key))) {
    throw new CourseOfferingError(400, "Unsupported fields. Book selection and LMS tokens are not supported yet.");
  }
  for (const key of ["organization_id", "course_id", "term_id", "lms_instance_id"]) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] <= 0 || value[key] > 2147483647) {
      throw new CourseOfferingError(400, `${key} must be a positive 32-bit integer.`);
    }
  }
  for (const key of ["label", "lms_course_num"]) {
    if (typeof value[key] !== "string" || !value[key].trim() || [...value[key].trim()].length > 255) {
      throw new CourseOfferingError(400, `${key} must be a nonempty string of at most 255 characters.`);
    }
  }
  return {
    organization_id: value.organization_id as number,
    course_id: value.course_id as number,
    term_id: value.term_id as number,
    lms_instance_id: value.lms_instance_id as number,
    label: (value.label as string).trim(),
    lms_course_num: (value.lms_course_num as string).trim(),
  };
}

export async function createCourseOffering(input: CreateCourseOfferingInput) {
  return prisma.$transaction(async tx => {
    // Serialize creation for this LMS instance across API processes. The schema's
    // LMS/course-number index is not unique, so a lookup alone would race.
    const locked = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM lms_instances WHERE id = ${input.lms_instance_id} FOR UPDATE
    `;
    if (!locked.length) throw new CourseOfferingError(400, "LMS instance does not exist.");
    const organization = await tx.organizations.findUnique({ where: { id: input.organization_id }, select: { id: true } });
    if (!organization) throw new CourseOfferingError(400, "Organization does not exist.");
    const course = await tx.courses.findUnique({ where: { id: input.course_id }, select: { organization_id: true } });
    if (!course) throw new CourseOfferingError(400, "Course does not exist.");
    if (course.organization_id !== input.organization_id) {
      throw new CourseOfferingError(400, "Course does not belong to the selected organization.");
    }
    const term = await tx.terms.findUnique({ where: { id: input.term_id }, select: { id: true } });
    if (!term) throw new CourseOfferingError(400, "Term does not exist.");
    const lms = await tx.lmsInstances.findUnique({ where: { id: input.lms_instance_id }, select: { organization_id: true } });
    if (lms?.organization_id != null && lms.organization_id !== input.organization_id) {
      throw new CourseOfferingError(400, "LMS instance does not belong to the selected organization.");
    }
    const duplicate = await tx.courseOfferings.findFirst({ where: {
      lms_instance_id: input.lms_instance_id,
      OR: [
        { lms_course_num: input.lms_course_num },
        { course_id: input.course_id, term_id: input.term_id, label: input.label },
      ],
    }, select: { id: true } });
    if (duplicate) throw new CourseOfferingError(409, "An offering with this LMS course ID or course/term/label already exists.");
    const now = new Date();
    return tx.courseOfferings.create({ data: {
      course_id: input.course_id, term_id: input.term_id, label: input.label,
      lms_instance_id: input.lms_instance_id, lms_course_num: input.lms_course_num,
      created_at: now, updated_at: now,
    }, select: {
      id: true, course_id: true, term_id: true, label: true,
      lms_instance_id: true, lms_course_num: true,
    } });
  });
}

export function courseOfferingError(error: unknown): { status: number; error: string } {
  if (error instanceof CourseOfferingError) return { status: error.status, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { status: 409, error: "This course offering already exists." };
    if (error.code === "P2003" || error.code === "P2025") return { status: 400, error: "A referenced record no longer exists." };
    if (error.code === "P2034") return { status: 409, error: "Another request conflicted with this one. Please retry." };
  }
  return { status: 500, error: "Unable to create the course offering." };
}
