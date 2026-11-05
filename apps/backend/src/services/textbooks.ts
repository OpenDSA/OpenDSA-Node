import { prisma } from "../db";
import { CourseOfferingError, createCourseOffering, parseCourseOffering } from "./course-offerings";

export function isTextbookInstance(url: string) {
  return url === "TEXTBOOK" || url === "seed-TEXTBOOK";
}

export async function createTextbook(body: unknown, userId: number) {
  const fields = ["organization_id", "course_id", "term_id", "label", "book_instance_id"];
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(key => !fields.includes(key))) {
    throw new CourseOfferingError(400, "Submit only organization, course, term, label, and book instance.");
  }
  if (!("book_instance_id" in body) || body.book_instance_id === undefined) {
    throw new CourseOfferingError(400, "A book instance is required.");
  }
  // Rails uses this sentinel course number for non-LMS textbook offerings.
  const input = parseCourseOffering({ ...body, lms_instance_id: 1, lms_course_num: "9999999" });
  const instances = await prisma.lmsInstances.findMany({ where: {
    url: { in: ["TEXTBOOK", "seed-TEXTBOOK"] },
    OR: [{ organization_id: null }, { organization_id: input.organization_id }],
  }, select: { id: true, url: true }, orderBy: { id: "asc" } });
  // Prefer the legacy entry, while supporting existing development seed data.
  const instance = instances.find(item => item.url === "TEXTBOOK") || instances[0];
  if (!instance) throw new CourseOfferingError(400, "A TEXTBOOK instance must be configured for this organization.");
  return createCourseOffering({ ...input, lms_instance_id: instance.id }, userId);
}
