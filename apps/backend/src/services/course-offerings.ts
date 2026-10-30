import path from "node:path";
import { generateCourse } from "../course_creation/generate_course";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { cloneBook } from "./clone-book";

export class CourseOfferingError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface CreateCourseOfferingInput {
  book_instance_id?: number;
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
  const fields = ["organization_id", "course_id", "term_id", "label", "lms_instance_id", "lms_course_num", "book_instance_id"];
  if (Object.keys(value).some(key => !fields.includes(key))) {
    throw new CourseOfferingError(400, "Unsupported fields. LMS tokens and user IDs must not be submitted.");
  }
  for (const key of ["organization_id", "course_id", "term_id", "lms_instance_id", ...(value.book_instance_id === undefined ? [] : ["book_instance_id"])]) {
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
    book_instance_id: value.book_instance_id as number | undefined,
    organization_id: value.organization_id as number,
    course_id: value.course_id as number,
    term_id: value.term_id as number,
    lms_instance_id: value.lms_instance_id as number,
    label: (value.label as string).trim(),
    lms_course_num: (value.lms_course_num as string).trim(),
  };
}

export async function createCourseOffering(input: CreateCourseOfferingInput, ownerId?: number) {
  return prisma.$transaction(async tx => {
    // Serialize the legacy find-or-create lookup across API processes.
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
    const existing = await tx.courseOfferings.findFirst({
      where: { lms_instance_id: input.lms_instance_id, course_id: input.course_id,
        term_id: input.term_id, label: input.label },
      orderBy: { id: "asc" },
      select: { id: true, course_id: true, term_id: true, label: true,
        lms_instance_id: true, lms_course_num: true,
        inst_books: { select: { id: true }, orderBy: { id: "asc" }, take: 1 } },
    });
    if (existing) {
      const { inst_books, ...offering } = existing;
      return { ...offering, reused: true, inst_book_id: inst_books[0]?.id };
    }
    if (input.book_instance_id !== undefined) {
      if (!ownerId) throw new CourseOfferingError(403, "Book creation requires a server-side user identity.");
      const source = await tx.instBooks.findUnique({ where: { id: input.book_instance_id }, select: { id: true } });
      if (!source) throw new CourseOfferingError(400, "Selected book does not exist.");
    }
    const now = new Date();
    const offering = await tx.courseOfferings.create({ data: {
      course_id: input.course_id, term_id: input.term_id, label: input.label,
      lms_instance_id: input.lms_instance_id, lms_course_num: input.lms_course_num,
      created_at: now, updated_at: now,
    }, select: {
      id: true, course_id: true, term_id: true, label: true,
      lms_instance_id: true, lms_course_num: true,
    } });
    const instBookId = input.book_instance_id === undefined ? undefined :
      await cloneBook(tx, input.book_instance_id, offering.id, ownerId!);
    if (ownerId && instBookId !== undefined) {
      const role = await tx.courseRoles.findFirst({ where: { name: "Instructor" } });
      if (!role) throw new CourseOfferingError(400, "Instructor role is missing; run the seed.");
      await tx.courseEnrollments.create({ data: {
        user_id: ownerId, course_offering_id: offering.id, course_role_id: role.id,
      } });
    }
    return { ...offering, reused: false, ...(instBookId === undefined ? {} : { inst_book_id: instBookId }) };
  }, { timeout: 30000 });
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

// This explicit development identity is not a substitute for authentication.
export async function getCurrentInstructor() {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_COURSE_GENERATION !== "true") {
    throw new CourseOfferingError(403, "Local course generation is disabled.");
  }
  const user = await prisma.users.findUnique({ where: { email: "seed-academic-instructor@example.com" } });
  if (!user) throw new CourseOfferingError(400, "Run the development seed to create the instructor.");
  return user;
}

export async function getGenerationContext(lmsInstanceId: number) {
  const user = await getCurrentInstructor();
  // Local content-generation tests deliberately omit LTI registration/launches.
  const settings = {
    launchUrl: "", resourceSelectionUrl: "", extrtoolLaunchBaseUrl: "",
    canvasContentOnly: true,
    bookPublicBaseUrl: process.env.BOOKS_PUBLIC_URL || "http://localhost:8080/Books",
    openDsaSharedDir: process.env.OPENDSA_SHARED_DIR || path.resolve(__dirname, "../../../../.opendsa-shared"),
    configApiLink: process.env.CONFIG_API_LINK || "http://localhost:8080/api/configure/",
  };
  for (const value of [settings.bookPublicBaseUrl, settings.configApiLink]) {
    try { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw Error(); }
    catch { throw new CourseOfferingError(400, "Invalid compiler or book service URL."); }
  }
  const access = await prisma.lmsAccesses.findUnique({ where: {
    lms_instance_id_user_id: { lms_instance_id: lmsInstanceId, user_id: user.id },
  } });
  if (!access?.access_token || access.access_token === "seed-canvas-api-key") {
    throw new CourseOfferingError(400, "Configure the seeded instructor's Canvas API token for this LMS instance.");
  }
  return { userId: user.id, ...settings };
}

const running = new Set<number>();
export async function generateBook(instBookId: number, context: Awaited<ReturnType<typeof getGenerationContext>>) {
  if (running.has(instBookId)) throw new CourseOfferingError(409, "Generation is already running for this book.");
  running.add(instBookId);
  try {
    // Fail before making any Canvas writes when the local compiler is offline.
    const health = await fetch(new URL("/", context.configApiLink), { signal: AbortSignal.timeout(10000) });
    if (!health.ok) throw new CourseOfferingError(503, "OpenDSA compiler is not available.");
    return await generateCourse({ ...context, instBookId });
  }
  finally { running.delete(instBookId); }
}
