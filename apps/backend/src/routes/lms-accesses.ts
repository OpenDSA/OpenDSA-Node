import { Router } from "express";
import { prisma } from "../db";
import { Prisma } from "@prisma/client";
import { requireAuthentication, requireCsrf } from "../auth";
import { adminRecordError, AdminRecordError } from "../services/admin-records";
import { accessId, canManageOwnLmsAccess, getLmsAccess, listLmsAccesses, lmsAccessScope, saveLmsAccess, deleteLmsAccess } from "../services/lms-accesses";

export const lmsAccessesRouter = Router();
lmsAccessesRouter.use(requireAuthentication, (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!canManageOwnLmsAccess(req.user!)) { res.status(403).json({ error: "Instructor access required." }); return; }
  next();
});
const queryId = (value: string, label: string) => {
  if (!/^[1-9]\d*$/.test(value)) throw new AdminRecordError(400, `${label} must be a positive integer.`);
  return accessId(Number(value), label);
};
const failQuery = (): never => { throw new AdminRecordError(400, "Invalid list parameters."); };
function listQuery(query: Record<string, unknown>, user: Express.User) {
  const allowed = ["page", "per_page", "sort", "order", "q", "email", "lms_instance_id", "user_id"];
  if (Object.keys(query).some(key => !allowed.includes(key)) || Object.values(query).some(value => typeof value !== "string")) failQuery();
  const { page = "1", per_page = "25", sort = "id", order = "ASC", q = "", email = "" } = query as Record<string, string>;
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 1000000 || !/^[1-9]\d*$/.test(per_page) || Number(per_page) > 100 ||
    !["ASC", "DESC"].includes(order) || q.length > 255 || email.length > 255) failQuery();
  const direction = order === "ASC" ? "asc" as const : "desc" as const;
  const sortFields: Record<string, Prisma.LmsAccessesOrderByWithRelationInput> = {
    id: { id: direction }, created_at: { created_at: direction }, updated_at: { updated_at: direction },
    consumer_key: { consumer_key: direction }, user_id: { user_id: direction }, lms_instance_id: { lms_instance_id: direction },
    "user.email": { user: { email: direction } }, "user.first_name": { user: { first_name: direction } },
    "user.last_name": { user: { last_name: direction } }, "lms_instance.url": { lms_instance: { url: direction } },
  };
  if (!Object.hasOwn(sortFields, sort)) failQuery();
  const where: Prisma.LmsAccessesWhereInput = { AND: [lmsAccessScope(user),
    ...(query.user_id ? [{ user_id: queryId(String(query.user_id), "User") }] : []),
    ...(query.lms_instance_id ? [{ lms_instance_id: queryId(String(query.lms_instance_id), "LMS instance") }] : []),
    ...(email.trim() ? [{ user: { email: { contains: email.trim() } } }] : []),
    ...(q.trim() ? [{ OR: [{ user: { email: { contains: q.trim() } } }, { user: { first_name: { contains: q.trim() } } },
      { user: { last_name: { contains: q.trim() } } }, { lms_instance: { url: { contains: q.trim() } } }] }] : []),
  ] };
  return { where, skip: (Number(page) - 1) * Number(per_page), take: Number(per_page),
    orderBy: [sortFields[sort], ...(sort === "id" ? [] : [{ id: "asc" as const }])] };
}
// Minimal LMS choices for credential owners without granting access to admin configuration.
lmsAccessesRouter.get("/options/lms-instances", async (req, res) => {
  const allowed = ["page", "per_page", "sort", "order", "q"];
  if (Object.keys(req.query).some(key => !allowed.includes(key)) || Object.values(req.query).some(value => typeof value !== "string")) failQuery();
  const { page = "1", per_page = "25", sort = "url", order = "ASC", q = "" } = req.query as Record<string, string>;
  if (!/^[1-9]\d*$/.test(page) || Number(page) > 1000000 || !/^[1-9]\d*$/.test(per_page) || Number(per_page) > 100 ||
    !["id", "url"].includes(sort) || !["ASC", "DESC"].includes(order) || q.length > 255) failQuery();
  const where = q.trim() ? { url: { contains: q.trim() } } : {};
  const [data, total] = await Promise.all([
    prisma.lmsInstances.findMany({ where, skip: (Number(page) - 1) * Number(per_page), take: Number(per_page),
      orderBy: [{ [sort]: order === "ASC" ? "asc" : "desc" }, { id: "asc" }], select: { id: true, url: true } }),
    prisma.lmsInstances.count({ where }),
  ]);
  res.json({ data, total });
});
lmsAccessesRouter.get("/options/lms-instances/:id", async (req, res) => {
  const data = await prisma.lmsInstances.findUnique({ where: { id: queryId(String(req.params.id), "ID") }, select: { id: true, url: true } });
  if (!data) throw new AdminRecordError(404, "LMS instance not found.");
  res.json({ data });
});
lmsAccessesRouter.get("/", async (req, res) => {
  const { where, skip, take, orderBy } = listQuery(req.query, req.user!);
  res.json(await listLmsAccesses(where, skip, take, orderBy));
});
lmsAccessesRouter.get("/:id", async (req, res) => {
  res.json({ data: await getLmsAccess(queryId(String(req.params.id), "ID"), req.user!) });
});
lmsAccessesRouter.post("/", requireCsrf, async (req, res) => {
  res.status(201).json({ data: await saveLmsAccess(req.body, req.user!) });
});
lmsAccessesRouter.patch("/:id", requireCsrf, async (req, res) => {
  res.json({ data: await saveLmsAccess(req.body, req.user!, queryId(String(req.params.id), "ID")) });
});
lmsAccessesRouter.delete("/:id", requireCsrf, async (req, res) => {
  res.json({ data: await deleteLmsAccess(queryId(String(req.params.id), "ID"), req.user!) });
});
lmsAccessesRouter.all(["/", "/:id"], (req, res) => {
  res.set("Allow", req.params.id ? "GET, HEAD, PATCH, DELETE" : "GET, HEAD, POST").status(405).json({ error: "This operation is not supported." });
});
lmsAccessesRouter.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: "This user already has access configured for that LMS instance." }); return;
  }
  const result = adminRecordError(error);
  if (result) { res.status(result.status).json({ error: result.error }); return; }
  next(error);
});
