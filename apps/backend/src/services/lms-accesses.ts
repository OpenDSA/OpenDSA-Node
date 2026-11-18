import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { AdminRecordError } from "./admin-records";

type Actor = Express.User;
export const isLmsAccessAdministrator = (user: Actor) => user.global_role.name === "Administrator" || user.global_role.can_edit_system_configuration;
export const canManageOwnLmsAccess = (user: Actor) => isLmsAccessAdministrator(user) || ["Instructor", "Researcher"].includes(user.global_role.name);
export const lmsAccessScope = (user: Actor): Prisma.LmsAccessesWhereInput => isLmsAccessAdministrator(user) ? {} : { user_id: user.id };
const userSelect = { id: true, first_name: true, last_name: true, email: true } as const;
// Tokens are selected only to compute presence/hints; never serialize this shape directly.
const accessSelect = { id: true, user_id: true, lms_instance_id: true, consumer_key: true,
  access_token: true, consumer_secret: true, created_at: true, updated_at: true,
  user: { select: userSelect }, lms_instance: { select: { id: true, url: true } } } as const;
type Access = Prisma.LmsAccessesGetPayload<{ select: typeof accessSelect }>;
export function publicLmsAccess(record: Access) {
  const { access_token, consumer_secret, ...safe } = record;
  // Do not expose the entire value when a short legacy credential is present.
  const hint = (value: string | null) => value && value.length > 4 ? value.slice(-4) : null;
  return { ...safe, has_access_token: !!access_token, access_token_hint: hint(access_token),
    has_consumer_secret: !!consumer_secret, consumer_secret_hint: hint(consumer_secret) };
}
export function accessId(value: unknown, label = "ID") {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2147483647) throw new AdminRecordError(400, `${label} must be a positive integer.`);
  return value;
}
export async function getLmsAccess(id: number, user: Actor) {
  const record = await prisma.lmsAccesses.findFirst({ where: { id, ...lmsAccessScope(user) }, select: accessSelect });
  if (!record) throw new AdminRecordError(404, "LMS access not found.");
  return publicLmsAccess(record);
}
export async function listLmsAccesses(where: Prisma.LmsAccessesWhereInput, skip: number, take: number, orderBy: Prisma.LmsAccessesOrderByWithRelationInput[]) {
  const [records, total] = await Promise.all([
    prisma.lmsAccesses.findMany({ where, skip, take, orderBy, select: accessSelect }), prisma.lmsAccesses.count({ where }),
  ]);
  return { data: records.map(publicLmsAccess), total };
}
export async function saveLmsAccess(body: unknown, user: Actor, id?: number) {
  const allowed = ["user_id", "lms_instance_id", "access_token", "consumer_key", "consumer_secret"];
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) {
    throw new AdminRecordError(400, "Submit only LMS instance, user, access token, consumer key, and consumer secret.");
  }
  const input = body as Record<string, unknown>;
  return prisma.$transaction(async tx => {
    const old = id === undefined ? null : await tx.lmsAccesses.findFirst({ where: { id, ...lmsAccessScope(user) }, select: accessSelect });
    if (id !== undefined && !old) throw new AdminRecordError(404, "LMS access not found.");
    const user_id = "user_id" in input ? accessId(input.user_id, "User") : old?.user_id ?? user.id;
    const lms_instance_id = "lms_instance_id" in input ? accessId(input.lms_instance_id, "LMS instance") : old?.lms_instance_id;
    if (!lms_instance_id) throw new AdminRecordError(400, "LMS instance is required.");
    if (!isLmsAccessAdministrator(user) && user_id !== user.id) throw new AdminRecordError(403, "You can manage only your own LMS access.");
    const data: { user_id: number; lms_instance_id: number; updated_at: Date;
      access_token?: string | null; consumer_key?: string | null; consumer_secret?: string | null } = { user_id, lms_instance_id, updated_at: new Date() };
    for (const field of ["access_token", "consumer_key", "consumer_secret"] as const) {
      if (!(field in input)) continue;
      const value = input[field];
      if (value !== null && (typeof value !== "string" || [...value].length > 255 || /\s/.test(value))) {
        throw new AdminRecordError(400, `${field} must be at most 255 characters and contain no whitespace.`);
      }
      // The write-only fields are never loaded into the form. Blank preserves them.
      if (field !== "consumer_key" && (value === "" || value === null)) continue;
      data[field] = value === "" ? null : value as string | null;
    }
    if (!await tx.users.findUnique({ where: { id: user_id }, select: { id: true } })) throw new AdminRecordError(400, "User does not exist.");
    if (!await tx.lmsInstances.findUnique({ where: { id: lms_instance_id }, select: { id: true } })) throw new AdminRecordError(400, "LMS instance does not exist.");
    const saved = id === undefined ? await tx.lmsAccesses.create({ data: { ...data, created_at: data.updated_at }, select: accessSelect }) :
      await tx.lmsAccesses.update({ where: { ...lmsAccessScope(user), id }, data, select: accessSelect });
    return publicLmsAccess(saved);
  });
}

export async function deleteLmsAccess(id: number, user: Actor) {
  return prisma.$transaction(async tx => {
    // Lock before checking ownership/dependencies so concurrent credential edits
    // and FK inserts cannot race deletion (Node's schema otherwise uses SET NULL).
    await tx.$queryRaw`SELECT id FROM lms_accesses WHERE id = ${id} FOR UPDATE`;
    const record = await tx.lmsAccesses.findFirst({ where: { id, ...lmsAccessScope(user) }, select: { id: true } });
    if (!record) throw new AdminRecordError(404, "LMS access not found.");
    // Keep progress rows intact. Never cascade-delete learning data from this screen.
    const [exerciseCount, moduleCount] = await Promise.all([
      tx.odsaExerciseProgresses.count({ where: { lms_access_id: id } }),
      tx.odsaModuleProgresses.count({ where: { lms_access_id: id } }),
    ]);
    if (exerciseCount || moduleCount) throw new AdminRecordError(409, "This access is linked to student progress. Update its credentials instead of deleting it.");
    await tx.lmsAccesses.delete({ where: { id } });
    return { id };
  });
}
