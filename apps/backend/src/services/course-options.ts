import { prisma } from "../db";

export const courseOptions = {
  organizations: () => prisma.organizations.findMany({
    select: { id: true, name: true, abbreviation: true, slug: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  }),
  courses: (organizationId?: number) => prisma.courses.findMany({
    where: organizationId === undefined ? {} : { organization_id: organizationId },
    select: { id: true, name: true, number: true, organization_id: true, slug: true },
    orderBy: [{ number: "asc" }, { id: "asc" }],
  }),
  terms: () => prisma.terms.findMany({
    select: { id: true, season: true, year: true, starts_on: true, ends_on: true, slug: true },
    orderBy: [{ starts_on: "desc" }, { id: "asc" }],
  }),
  bookInstances: () => prisma.instBooks.findMany({
    select: { id: true, title: true, desc: true, template: true, course_offering_id: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  }),
  lmsInstances: () => prisma.lmsInstances.findMany({
    select: { id: true, url: true, organization_id: true, lms_type: { select: { id: true, name: true } } },
    orderBy: [{ url: "asc" }, { id: "asc" }],
  }),
};
