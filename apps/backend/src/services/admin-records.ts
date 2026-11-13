import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { lmsKeypair, lmsInstanceAdminSelect } from "./lms-instance-config";
import { ensureBuiltinCourseRole } from "./course-roles";
import { prisma } from "../db";

export const editableAdminResources = ["organizations", "terms", "courses", "course-offerings", "course-roles", "late-policies", "lms-types", "lms-instances"] as const;
export type EditableAdminResource = typeof editableAdminResources[number];
export class AdminRecordError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (message: string): never => { throw new AdminRecordError(400, message); };
const fields: Record<EditableAdminResource, string[]> = {
  organizations: ["name", "abbreviation"],
  terms: ["season", "year", "starts_on", "ends_on"],
  courses: ["name", "number", "organization_id", "user_id"],
  "course-offerings": ["course_id", "term_id", "label", "lms_instance_id", "lms_course_code", "lms_course_num", "archived"],
  "course-roles": ["name", "can_manage_course", "can_manage_assignments", "can_grade_submissions", "can_view_other_submissions"],
  "late-policies": ["name", "late_days", "late_percent"],
  "lms-types": ["name"],
  "lms-instances": ["url", "lms_type_id", "organization_id", "consumer_key", "consumer_secret", "client_id",
    "private_key", "public_key", "keyset_url", "oauth2_url", "platform_oidc_auth_url", "issuer"],
};
export function parseAdminBody(resource: EditableAdminResource, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !fields[resource].includes(key))) fail("Submit only the editable fields for this resource.");
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === null && key !== "lms_course_code" && !(resource === "lms-instances" && !["url", "lms_type_id", "organization_id"].includes(key))) fail(`${key} cannot be null.`);
  }
  return body as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 255) return fail(`${field} is required and must be at most 255 characters.`);
  return value.trim();
}
function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) return fail(`${field} must be a 32-bit integer.`);
  return value;
}
function id(value: unknown, field: string) { const result = integer(value, field); return result > 0 ? result : fail(`${field} must be a positive ID.`); }
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") return fail(`${field} must be true or false.`);
  return value;
}
function date(value: unknown, field: string): Date {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(`${field} must be a date (YYYY-MM-DD).`);
  const result = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) return fail(`${field} is invalid.`);
  return result;
}
const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || randomUUID();
const seasons: Record<number, string> = { 100: "Spring", 200: "Summer I", 300: "Summer II", 400: "Fall", 500: "Winter" };

export async function saveAdminRecord(resource: EditableAdminResource, body: unknown, actorId: number, recordId?: number) {
  const input = parseAdminBody(resource, body);
  return prisma.$transaction(async tx => {
    const now = new Date();
    // Existing slugs are retained when their source field is unchanged.
    switch (resource) {
      case "organizations": {
        const old = recordId ? await tx.organizations.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Organization not found.");
        const name = text(input.name ?? old?.name, "Name");
        const abbreviation = text(input.abbreviation ?? old?.abbreviation, "Abbreviation");
        const duplicate = await tx.organizations.findFirst({ where: { id: { not: recordId }, OR: [{ name }, { abbreviation }] } });
        if (duplicate) throw new AdminRecordError(409, "Organization name or abbreviation already exists.");
        let nextSlug = old?.abbreviation === abbreviation ? old.slug : slug(abbreviation);
        if (await tx.organizations.findFirst({ where: { slug: nextSlug, id: { not: recordId } } })) nextSlug = `${nextSlug.slice(0, 210)}-${randomUUID()}`;
        const data = { name, abbreviation, slug: nextSlug, updated_at: now };
        return recordId ? tx.organizations.update({ where: { id: recordId }, data }) : tx.organizations.create({ data: { ...data, created_at: now } });
      }
      case "terms": {
        const old = recordId ? await tx.terms.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Term not found.");
        const season = integer(input.season ?? old?.season, "Season");
        if (!seasons[season]) fail("Choose a valid season.");
        const year = integer(input.year ?? old?.year, "Year");
        const starts_on = date(input.starts_on ?? old?.starts_on, "Start date");
        const ends_on = date(input.ends_on ?? old?.ends_on, "End date");
        let nextSlug = old && old.season === season && old.year === year ? old.slug : slug(`${seasons[season]} ${year}`);
        if (await tx.terms.findFirst({ where: { slug: nextSlug, id: { not: recordId } } })) nextSlug = `${nextSlug.slice(0, 210)}-${randomUUID()}`;
        const data = { season, year, starts_on, ends_on, slug: nextSlug, updated_at: now };
        return recordId ? tx.terms.update({ where: { id: recordId }, data }) : tx.terms.create({ data: { ...data, created_at: now } });
      }
      case "courses": {
        const old = recordId ? await tx.courses.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Course not found.");
        const name = text(input.name ?? old?.name, "Name"), number = text(input.number ?? old?.number, "Number");
        const organization_id = id(input.organization_id ?? old?.organization_id, "Organization");
        const user_id = id(input.user_id ?? old?.user_id ?? actorId, "Owner");
        if (!await tx.organizations.findUnique({ where: { id: organization_id } })) fail("Organization does not exist.");
        if (!await tx.users.findUnique({ where: { id: user_id }, select: { id: true } })) fail("Owner does not exist.");
        let nextSlug = old?.number === number ? old.slug : slug(number.replace(/\s/g, ""));
        if (await tx.courses.findFirst({ where: { slug: nextSlug, organization_id, id: { not: recordId } } })) nextSlug = `${nextSlug.slice(0, 210)}-${randomUUID()}`;
        const data = { name, number, organization_id, user_id, slug: nextSlug, updated_at: now };
        return recordId ? tx.courses.update({ where: { id: recordId }, data }) : tx.courses.create({ data: { ...data, created_at: now } });
      }
      case "course-offerings": {
        const old = recordId ? await tx.courseOfferings.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Offering not found.");
        const course_id = id(input.course_id ?? old?.course_id, "Course"), term_id = id(input.term_id ?? old?.term_id, "Term");
        const lms_instance_id = id(input.lms_instance_id ?? old?.lms_instance_id, "LMS instance");
        if (!await tx.courses.findUnique({ where: { id: course_id } })) fail("Course does not exist.");
        if (!await tx.terms.findUnique({ where: { id: term_id } })) fail("Term does not exist.");
        if (!await tx.lmsInstances.findUnique({ where: { id: lms_instance_id }, select: { id: true } })) fail("LMS instance does not exist.");
        const label = text(input.label ?? old?.label, "Label");
        const lms_course_num = text(input.lms_course_num ?? old?.lms_course_num, "LMS course number");
        const rawCode = "lms_course_code" in input ? input.lms_course_code : old?.lms_course_code;
        const lms_course_code = rawCode == null || rawCode === "" ? null : text(rawCode, "LMS course code");
        const archived = boolean(input.archived ?? old?.archived ?? false, "Archived");
        const data = { course_id, term_id, lms_instance_id, label, lms_course_num, lms_course_code, archived, updated_at: now };
        const offering = recordId ? await tx.courseOfferings.update({ where: { id: recordId }, data }) :
          await tx.courseOfferings.create({ data: { ...data, created_at: now } });
        if (!recordId) {
          const role = await ensureBuiltinCourseRole(true, tx);
          await tx.courseEnrollments.create({ data: { user_id: actorId, course_offering_id: offering.id, course_role_id: role.id } });
        } else {
          await tx.instBooks.updateMany({ where: { course_offering_id: offering.id }, data: { last_compiled: null, updated_at: now } });
        }
        return offering;
      }
      case "course-roles": {
        const old = recordId ? await tx.courseRoles.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Course role not found.");
        const name = text(input.name ?? old?.name, "Name");
        const data = { name,
          can_manage_course: boolean(input.can_manage_course ?? old?.can_manage_course ?? false, "Manage course"),
          can_manage_assignments: boolean(input.can_manage_assignments ?? old?.can_manage_assignments ?? false, "Manage assignments"),
          can_grade_submissions: boolean(input.can_grade_submissions ?? old?.can_grade_submissions ?? false, "Grade submissions"),
          can_view_other_submissions: boolean(input.can_view_other_submissions ?? old?.can_view_other_submissions ?? false, "View submissions"),
        };
        if (old?.builtin && Object.keys(data).filter(key => key !== "name").some(key => data[key as keyof typeof data] !== old[key as keyof typeof data])) fail("Built-in role permissions cannot be changed.");
        if (await tx.courseRoles.findFirst({ where: { name, id: { not: recordId } } })) throw new AdminRecordError(409, "Course role name already exists.");
        return recordId ? tx.courseRoles.update({ where: { id: recordId }, data }) : tx.courseRoles.create({ data: { ...data, builtin: false } });
      }
      case "late-policies": {
        const old = recordId ? await tx.latePolicies.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "Late policy not found.");
        const data = { name: text(input.name ?? old?.name, "Name"), late_days: integer(input.late_days ?? old?.late_days, "Late days"),
          late_percent: integer(input.late_percent ?? old?.late_percent, "Late percent"), updated_at: now };
        return recordId ? tx.latePolicies.update({ where: { id: recordId }, data }) : tx.latePolicies.create({ data: { ...data, created_at: now } });
      }
      case "lms-instances": {
        const old = recordId ? await tx.lmsInstances.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "LMS instance not found.");
        const url = text(input.url ?? old?.url, "URL");
        const lms_type_id = id(input.lms_type_id ?? old?.lms_type_id, "LMS type");
        const organization_id = id(input.organization_id ?? old?.organization_id, "Organization");
        const type = await tx.lmsTypes.findUnique({ where: { id: lms_type_id } });
        if (!type) fail("LMS type does not exist.");
        if (!await tx.organizations.findUnique({ where: { id: organization_id } })) fail("Organization does not exist.");
        const optional = (key: string, previous: string | null | undefined, limit = 255) => {
          const value = key in input ? input[key] : previous;
          if (value == null || value === "") return null;
          if (typeof value !== "string" || [...value.trim()].length > limit) return fail(`${key} must be at most ${limit} characters.`);
          return value.trim() || null;
        };
        const client_id = optional("client_id", old?.client_id);
        const keyset_url = optional("keyset_url", old?.keyset_url);
        const oauth2_url = optional("oauth2_url", old?.oauth2_url);
        const platform_oidc_auth_url = optional("platform_oidc_auth_url", old?.platform_oidc_auth_url);
        const issuer = optional("issuer", old?.issuer);
        if (type!.name === "LTI 1.3" && ![client_id, keyset_url, oauth2_url, platform_oidc_auth_url, issuer].every(Boolean)) {
          fail("LTI 1.3 requires client ID, issuer, keyset URL, OIDC authorization URL, and OAuth2 token URL.");
        }
        const consumer_key = optional("consumer_key", old?.consumer_key);
        const consumer_secret = optional("consumer_secret", old?.consumer_secret) || old?.consumer_secret || null;
        const privatePem = optional("private_key", old?.private_key, 16384) || old?.private_key || null;
        // A replacement private key derives a new public key unless one is supplied explicitly.
        const replacingPrivate = typeof input.private_key === "string" && !!input.private_key.trim();
        const publicPem = optional("public_key", replacingPrivate ? null : old?.public_key, 16384);
        let keys: { private_key: string | null; public_key: string | null };
        try { keys = await lmsKeypair(privatePem, publicPem, !old && !!client_id && !!oauth2_url); }
        catch (error) { return fail(error instanceof Error ? error.message : "Invalid keypair."); }
        const data = { url, lms_type_id, organization_id, consumer_key, consumer_secret,
          client_id, keyset_url, oauth2_url, platform_oidc_auth_url, issuer, ...keys, updated_at: now };
        return recordId ? tx.lmsInstances.update({ where: { id: recordId }, data, select: lmsInstanceAdminSelect }) :
          tx.lmsInstances.create({ data: { ...data, created_at: now }, select: lmsInstanceAdminSelect });
      }
      case "lms-types": {
        const old = recordId ? await tx.lmsTypes.findUnique({ where: { id: recordId } }) : null;
        if (recordId && !old) throw new AdminRecordError(404, "LMS type not found.");
        const data = { name: text(input.name ?? old?.name, "Name"), updated_at: now };
        return recordId ? tx.lmsTypes.update({ where: { id: recordId }, data }) : tx.lmsTypes.create({ data: { ...data, created_at: now } });
      }
    }
  });
}

export function adminRecordError(error: unknown) {
  if (error instanceof AdminRecordError) return { status: error.status, error: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { status: 409, error: "A record with these unique fields already exists." };
    if (error.code === "P2003") return { status: 400, error: "A referenced record does not exist." };
    if (error.code === "P2025") return { status: 404, error: "Record not found." };
    if (error.code === "P2034") return { status: 409, error: "Another edit conflicted. Please retry." };
  }
  return null;
}
