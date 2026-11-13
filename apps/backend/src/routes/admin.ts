import { Router, type Request } from "express";
import { requireAuthentication, requireAdministrator, requireCsrf } from "../auth";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export const adminRouter = Router();
adminRouter.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
adminRouter.use(requireAuthentication, requireAdministrator);

function listOptions(req: Request, fields: string[], defaultSort: string) {
  const allowed = ["page", "per_page", "sort", "order", "q"];
  if (Object.keys(req.query).some(key => !allowed.includes(key)) ||
      Object.values(req.query).some(value => typeof value !== "string")) return null;
  const { page = "1", per_page = "25", sort = defaultSort, order = "ASC", q = "" } = req.query as Record<string, string>;
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 1000000 ||
      !/^[1-9]\d*$/.test(per_page) || Number(per_page) > 100 ||
      !fields.includes(sort) || !["ASC", "DESC"].includes(order) || q.length > 255) return null;
  const direction = order === "ASC" ? "asc" as const : "desc" as const;
  return { skip: (Number(page) - 1) * Number(per_page), take: Number(per_page),
    orderBy: [{ [sort]: direction }, ...(sort === "id" ? [] : [{ id: "asc" as const }])], q: q.trim() };
}

const organizationSelect = { id: true, name: true, abbreviation: true, slug: true, created_at: true } as const;
const termSelect = { id: true, season: true, year: true, starts_on: true, ends_on: true, slug: true } as const;

// Match Rails Term.current_term: earliest active term, otherwise earliest term.
adminRouter.get("/dashboard", async (_req, res) => {
  const now = new Date();
  const orderBy = [{ starts_on: "asc" as const }, { id: "asc" as const }];
  const currentTerm = await prisma.terms.findFirst({
    where: { starts_on: { lte: now }, ends_on: { gt: now } }, orderBy, select: termSelect,
  });
  const term = currentTerm ?? await prisma.terms.findFirst({ orderBy, select: termSelect });
  const [recentUsers, offerings] = await Promise.all([
    prisma.users.findMany({
      where: { current_sign_in_at: { not: null } },
      orderBy: [{ current_sign_in_at: "desc" }, { id: "desc" }], take: 20,
      select: { id: true, first_name: true, last_name: true, email: true,
        current_sign_in_at: true, current_sign_in_ip: true },
    }),
    term ? prisma.courseOfferings.findMany({ where: { term_id: term.id }, orderBy: { id: "asc" },
      select: { id: true, label: true, archived: true,
        course: { select: { id: true, name: true, number: true } },
        course_enrollments: { where: { course_role: { name: "Instructor" } }, orderBy: { id: "asc" }, take: 1,
          select: { user: { select: { id: true, first_name: true, last_name: true, email: true } } } },
      },
    }) : Promise.resolve([]),
  ]);
  res.json({ term, termIsCurrent: currentTerm !== null, recentUsers,
    offerings: offerings.map(({ course_enrollments, ...offering }) => ({ ...offering,
      instructor: course_enrollments[0]?.user ?? null })) });
});

adminRouter.get("/organizations", async (req, res) => {
  const options = listOptions(req, ["id", "name", "abbreviation", "created_at"], "name");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { OR: [{ name: { contains: q } }, { abbreviation: { contains: q } }] } : {};
  const [data, total] = await Promise.all([
    prisma.organizations.findMany({ where, ...paging, select: organizationSelect }),
    prisma.organizations.count({ where }),
  ]);
  res.json({ data, total });
});

adminRouter.get("/terms", async (req, res) => {
  const options = listOptions(req, ["id", "season", "year", "starts_on", "ends_on"], "starts_on");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { slug: { contains: q } } : {};
  const [data, total] = await Promise.all([
    prisma.terms.findMany({ where, ...paging, select: termSelect }),
    prisma.terms.count({ where }),
  ]);
  res.json({ data, total });
});

const courseSelect = {
  id: true, name: true, number: true, organization_id: true, user_id: true,
  slug: true, created_at: true, updated_at: true,
  organization: { select: { id: true, name: true, abbreviation: true } },
} as const;
const offeringSelect = {
  id: true, course_id: true, term_id: true, label: true, url: true,
  self_enrollment_allowed: true, cutoff_date: true, late_policy_id: true,
  lms_instance_id: true, lms_course_code: true, lms_course_num: true,
  archived: true, created_at: true, updated_at: true,
  course: { select: { id: true, name: true, number: true } },
  term: { select: { id: true, slug: true } },
} as const;

adminRouter.get("/courses", async (req, res) => {
  const options = listOptions(req, ["id", "name", "number", "created_at"], "name");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { OR: [{ name: { contains: q } }, { number: { contains: q } }] } : {};
  const [data, total] = await Promise.all([
    prisma.courses.findMany({ where, ...paging, select: courseSelect }),
    prisma.courses.count({ where }),
  ]);
  res.json({ data, total });
});

adminRouter.get("/course-offerings", async (req, res) => {
  const options = listOptions(req, ["id", "label", "lms_course_num", "archived", "created_at"], "created_at");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { label: { contains: q } } : {};
  const [data, total] = await Promise.all([
    prisma.courseOfferings.findMany({ where, ...paging, select: offeringSelect }),
    prisma.courseOfferings.count({ where }),
  ]);
  res.json({ data, total });
});

const roleSelect = {
  id: true, name: true, can_manage_all_courses: true,
  can_edit_system_configuration: true, builtin: true,
} as const;
const userSelect = {
  id: true, email: true, first_name: true, last_name: true, global_role_id: true,
  time_zone_id: true, created_at: true, updated_at: true,
  sign_in_count: true, current_sign_in_at: true, last_sign_in_at: true,
  current_sign_in_ip: true, last_sign_in_ip: true,
  global_role: { select: roleSelect },
} as const;
const bookSelect = {
  id: true, title: true, desc: true, template: true, book_type: true,
  user_id: true, course_offering_id: true, last_compiled: true,
  created_at: true, updated_at: true,
  user: { select: { id: true, email: true } },
  course_offering: { select: { id: true, label: true } },
} as const;

adminRouter.get("/books", async (req, res) => {
  const options = listOptions(req, ["id", "title", "template", "last_compiled", "created_at"], "title");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { title: { contains: q } } : {};
  const [data, total] = await Promise.all([
    prisma.instBooks.findMany({ where, ...paging, select: bookSelect }),
    prisma.instBooks.count({ where }),
  ]);
  res.json({ data, total });
});

adminRouter.get("/users", async (req, res) => {
  const options = listOptions(req, ["id", "email", "first_name", "last_name", "created_at", "updated_at", "current_sign_in_at", "last_sign_in_at", "sign_in_count"], "email");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { OR: [{ email: { contains: q } }, { first_name: { contains: q } }, { last_name: { contains: q } }] } : {};
  const [data, total] = await Promise.all([
    prisma.users.findMany({ where, ...paging, select: userSelect }),
    prisma.users.count({ where }),
  ]);
  res.json({ data, total });
});

adminRouter.get("/roles", async (req, res) => {
  const options = listOptions(req, ["id", "name", "builtin", "can_manage_all_courses", "can_edit_system_configuration"], "name");
  if (!options) { res.status(400).json({ error: "Invalid list parameters." }); return; }
  const { q, ...paging } = options;
  const where = q ? { name: { contains: q } } : {};
  const [data, total] = await Promise.all([
    prisma.globalRoles.findMany({ where, ...paging, select: roleSelect }),
    prisma.globalRoles.count({ where }),
  ]);
  res.json({ data, total });
});

// Admin editing deliberately excludes passwords, tokens, and role definitions.
adminRouter.patch("/users/:id", requireCsrf, async (req, res, next) => {
  const rawId = String(req.params.id);
  if (!/^[1-9]\d*$/.test(rawId) || Number(rawId) > 2147483647) {
    res.status(400).json({ error: "Invalid record ID." }); return;
  }
  const body: unknown = req.body;
  const allowed = ["first_name", "last_name", "email", "global_role_id"];
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !allowed.includes(key))) {
    res.status(400).json({ error: "Submit only first name, last name, email, and global role." }); return;
  }
  const input = body as Record<string, unknown>;
  const data: { first_name?: string | null; last_name?: string | null; email?: string;
    global_role_id?: number; updated_at: Date } = { updated_at: new Date() };
  for (const key of ["first_name", "last_name"] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && (typeof value !== "string" || [...value.trim()].length > 255)) {
      res.status(400).json({ error: `${key} must be at most 255 characters.` }); return;
    }
    data[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if ("email" in input) {
    if (typeof input.email !== "string" || input.email.length > 255 || !/^[^\s@]+@[^\s@]+$/.test(input.email.trim())) {
      res.status(400).json({ error: "Enter a valid email address of at most 255 characters." }); return;
    }
    data.email = input.email.trim().toLowerCase();
  }
  if ("global_role_id" in input) {
    const id = input.global_role_id;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
      res.status(400).json({ error: "Global role must be a valid ID." }); return;
    }
    data.global_role_id = id;
  }
  try {
    if (data.global_role_id !== undefined && !await prisma.globalRoles.findUnique({ where: { id: data.global_role_id }, select: { id: true } })) {
      res.status(400).json({ error: "Global role does not exist." }); return;
    }
    const record = await prisma.users.update({ where: { id: Number(rawId) }, data, select: userSelect });
    res.json({ data: record });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") { res.status(409).json({ error: "An account with this email already exists." }); return; }
      if (error.code === "P2025") { res.status(404).json({ error: "User not found." }); return; }
      if (error.code === "P2003") { res.status(400).json({ error: "Global role does not exist." }); return; }
    }
    next(error);
  }
});

for (const resource of ["organizations", "terms", "courses", "course-offerings", "books", "users", "roles"] as const) {
  adminRouter.get(`/${resource}/:id`, async (req, res) => {
    const rawId = String(req.params.id);
    if (!/^[1-9]\d*$/.test(rawId) || Number(rawId) > 2147483647) {
      res.status(400).json({ error: "Invalid record ID." }); return;
    }
    const where = { id: Number(rawId) };
    const data = resource === "organizations"
      ? await prisma.organizations.findUnique({ where, select: organizationSelect })
      : resource === "terms" ? await prisma.terms.findUnique({ where, select: termSelect })
      : resource === "courses" ? await prisma.courses.findUnique({ where, select: courseSelect })
      : resource === "course-offerings" ? await prisma.courseOfferings.findUnique({ where, select: offeringSelect })
      : resource === "books" ? await prisma.instBooks.findUnique({ where, select: bookSelect })
      : resource === "users" ? await prisma.users.findUnique({ where, select: userSelect })
      : await prisma.globalRoles.findUnique({ where, select: roleSelect });
    if (!data) { res.status(404).json({ error: "Record not found." }); return; }
    res.json({ data });
  });
  adminRouter.all([`/${resource}`, `/${resource}/:id`], (_req, res) => {
    res.set("Allow", resource === "users" && _req.params.id ? "GET, HEAD, PATCH" : "GET, HEAD").status(405).json({ error: "This resource is read-only." });
  });
}
