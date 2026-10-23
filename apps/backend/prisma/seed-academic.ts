import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Run sequentially: role names, time zones, courses and offerings lack unique keys.
// Existing records are reused without changing their permissions or configuration.
export async function seedAcademic(prisma: PrismaClient) {
  const roles = [];
  for (const name of ["Administrator", "Instructor", "Researcher", "Regular User"]) {
    const admin = name === "Administrator";
    roles.push(await prisma.globalRoles.findFirst({ where: { name }, orderBy: { id: "asc" } }) ??
      await prisma.globalRoles.create({ data: {
        name, builtin: true, can_manage_all_courses: admin, can_edit_system_configuration: admin,
      } }));
  }
  const [adminRole, instructorRole, researcherRole, regularRole] = roles;
  const courseRoles = [];
  for (const name of ["Instructor", "Student"]) {
    const staff = name === "Instructor";
    courseRoles.push(await prisma.courseRoles.findFirst({ where: { name }, orderBy: { id: "asc" } }) ??
      await prisma.courseRoles.create({ data: {
        name, builtin: true, can_manage_course: staff, can_manage_assignments: staff,
        can_grade_submissions: staff, can_view_other_submissions: staff,
      } }));
  }
  const [staffRole, studentRole] = courseRoles;
  const zone = await prisma.timeZones.findFirst({ where: { name: "America/New_York" }, orderBy: { id: "asc" } }) ??
    await prisma.timeZones.create({ data: {
      name: "America/New_York", zone: "UTC -05:00", display_as: "UTC -05:00(New York)",
    } });
  const organization = await prisma.organizations.upsert({
    where: { name: "Virginia Tech (Seed Demo)" }, update: {},
    create: { name: "Virginia Tech (Seed Demo)", abbreviation: "VT-DEMO", slug: "seed-vt" },
  });
  await prisma.learningTools.upsert({ where: { name: "seed-code-workout" }, update: {}, create: {
    name: "seed-code-workout", key: "seed-demo-key", secret: "seed-demo-secret",
    launch_url: "https://localhost:9292/lti/launch?from_collection=true",
  } });
  const lmsInstances = [];
  for (const [name, url] of [["Canvas", "https://seed-canvas.example.invalid"], ["TEXTBOOK", "seed-TEXTBOOK"]]) {
    const type = await prisma.lmsTypes.upsert({ where: { name }, update: {}, create: { name } });
    lmsInstances.push(await prisma.lmsInstances.upsert({ where: { url }, update: {}, create: {
      url, lms_type_id: type.id, organization_id: organization.id,
    } }));
  }
  const terms = [];
  const dates = [
    ["01-01", "05-31"], ["06-01", "07-15"], ["07-16", "08-15"],
    ["08-16", "12-15"], ["12-16", "12-31"],
  ];
  for (const [index, [start, end]] of dates.entries()) {
    const season = (index + 1) * 100;
    terms.push(await prisma.terms.upsert({ where: { slug: `seed-2023-${season}` }, update: {}, create: {
      slug: `seed-2023-${season}`, season, year: 2023,
      starts_on: new Date(`2023-${start}T00:00:00Z`), ends_on: new Date(`2023-${end}T00:00:00Z`),
    } }));
  }
  const accounts = [
    { key: "admin", first_name: "Admin", last_name: "Istrator", role: adminRole },
    { key: "instructor", first_name: "Ima", last_name: "Teacher", role: instructorRole },
    { key: "researcher", first_name: "Ima", last_name: "Researcher", role: researcherRole },
    ...Array.from({ length: 50 }, (_, i) => ({
      key: `student-${String(i + 1).padStart(2, "0")}`, first_name: "Student",
      last_name: String(i + 1).padStart(2, "0"), role: regularRole,
    })),
  ];
  const users = [];
  for (const account of accounts) {
    const slug = `seed-academic-${account.key}`;
    users.push(await prisma.users.upsert({ where: { email: `${slug}@example.com` }, update: {}, create: {
      email: `${slug}@example.com`, slug, first_name: account.first_name, last_name: account.last_name,
      global_role_id: account.role.id, time_zone_id: zone.id, confirmed_at: new Date("2023-01-01T00:00:00Z"),
      // Empty password default: these fixtures cannot authenticate as Rails users.
    } }));
  }
  const courseKey = { organization_id: organization.id, slug: "seed-cs1114" };
  const course = await prisma.courses.findFirst({ where: courseKey, orderBy: { id: "asc" } }) ??
    await prisma.courses.create({ data: {
      ...courseKey, name: "Introduction to Software Design", number: "CS 1114", user_id: users[0].id,
    } });
  // The legacy late_10 factory omits required values; use the defined db/seeds.rb policy.
  const policy = await prisma.latePolicies.upsert({ where: { name: "0_days" }, update: {}, create: {
    name: "0_days", late_days: 0, late_percent: 0,
  } });
  const offeringIds = [];
  for (const term of terms.slice(0, 3)) {
    for (const [section, label] of [["tr", "TR 11:00am"], ["mwf", "MWF 10:00am"]]) {
      const key = { course_id: course.id, term_id: term.id, label };
      const offering = await prisma.courseOfferings.findFirst({ where: key, orderBy: { id: "asc" } }) ??
        await prisma.courseOfferings.create({ data: {
          ...key, late_policy_id: policy.id, lms_instance_id: lmsInstances[0].id,
          lms_course_num: `seed-cs1114-${term.season}-${section}`, self_enrollment_allowed: true,
          url: "https://seed-courses.example.invalid/cs1114",
        } });
      offeringIds.push(offering.id);
      for (const [index, user] of users.entries()) {
        await prisma.courseEnrollments.upsert({
          where: { user_id_course_offering_id: { user_id: user.id, course_offering_id: offering.id } },
          update: {}, create: {
            user_id: user.id, course_offering_id: offering.id,
            course_role_id: index < 3 ? staffRole.id : studentRole.id,
          },
        });
      }
    }
  }
  // Verify only the fixtures: unrelated database rows do not affect these counts.
  const offerings = await prisma.courseOfferings.findMany({
    where: { id: { in: offeringIds } },
    include: { course: { include: { organization: true } }, term: true, lms_instance: true,
      course_enrollments: { where: { user_id: { in: users.map(u => u.id) } }, include: { user: true, course_role: true } } },
  });
  assert.equal(users.length, 53);
  assert.equal(offerings.length, 6);
  for (const offering of offerings) {
    assert.equal(offering.course.organization.id, organization.id);
    assert.equal(offering.lms_instance.id, lmsInstances[0].id);
    assert.equal(offering.course_enrollments.length, 53);
    assert.equal(new Set(offering.course_enrollments.map(e => e.user_id)).size, 53);
    for (const enrollment of offering.course_enrollments) {
      const staff = users.slice(0, 3).some(u => u.id === enrollment.user_id);
      assert.equal(enrollment.course_role.id, staff ? staffRole.id : studentRole.id);
    }
  }
  console.log("Academic fixtures verified: 50 students, 3 staff, 5 terms, 6 offerings, 318 enrollments.");
}
