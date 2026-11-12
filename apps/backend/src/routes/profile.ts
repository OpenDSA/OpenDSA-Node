import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireAuthentication, requireCsrf } from "../auth";
import { prisma } from "../db";

export const profileRouter = Router();
const profileSelect = {
  id: true, email: true, first_name: true, last_name: true, time_zone_id: true,
  time_zone: { select: { id: true, name: true, zone: true, display_as: true } },
} as const;

profileRouter.use(requireAuthentication, (_req, res, next) => {
  res.set("Cache-Control", "no-store"); next();
});

profileRouter.get("/", async (req, res) => {
  const user = await prisma.users.findUnique({ where: { id: req.user!.id }, select: profileSelect });
  if (!user) { res.status(404).json({ error: "User not found." }); return; }
  res.json({ user });
});

profileRouter.get("/time-zones", async (_req, res) => {
  const data = await prisma.timeZones.findMany({
    select: { id: true, name: true, zone: true, display_as: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ data });
});

profileRouter.patch("/", requireCsrf, async (req, res, next) => {
  const body: unknown = req.body;
  const allowed = ["first_name", "last_name", "time_zone_id"];
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !allowed.includes(key))) {
    res.status(400).json({ error: "Submit only first name, last name, and timezone." }); return;
  }
  const input = body as Record<string, unknown>;
  const data: { first_name?: string | null; last_name?: string | null; time_zone_id?: number | null; updated_at: Date } = { updated_at: new Date() };
  for (const key of ["first_name", "last_name"] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && (typeof value !== "string" || [...value.trim()].length > 255)) {
      res.status(400).json({ error: `${key} must be at most 255 characters.` }); return;
    }
    data[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if ("time_zone_id" in input) {
    const id = input.time_zone_id;
    if (id !== null && (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
      res.status(400).json({ error: "Timezone must be a valid ID or null." }); return;
    }
    data.time_zone_id = id as number | null;
  }
  try {
    if (data.time_zone_id != null && !await prisma.timeZones.findUnique({ where: { id: data.time_zone_id }, select: { id: true } })) {
      res.status(400).json({ error: "Timezone does not exist." }); return;
    }
    const user = await prisma.users.update({ where: { id: req.user!.id }, data, select: profileSelect });
    res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      res.status(400).json({ error: "Timezone does not exist." }); return;
    }
    next(error);
  }
});
