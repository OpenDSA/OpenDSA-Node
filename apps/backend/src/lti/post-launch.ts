// everything that happens after a launch passes verification, regardless of
// whether it was lti 1.1 or 1.3 that did the verifying. ports ensure_lms_instance,
// ensure_user, and lti_enroll from lti_controller.rb (lines 730, 744, 708)

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { LtiLaunchContext } from "./types";
import type { LmsInstances } from "@prisma/client";

export async function ensureLmsInstance(url: string, lmsTypeName: string) {
  const existing = await prisma.lmsInstances.findFirst({ where: { url } });
  if (existing) return existing;

  const lmsType = await prisma.lmsTypes.upsert({
    where: { name: lmsTypeName },
    update: {},
    create: { name: lmsTypeName },
  });

  return prisma.lmsInstances.create({
    data: { url, lms_type_id: lmsType.id },
  });
}

// users table requires a unique slug and we dont have anything like rails
// friendly_id to auto generate one, so just deriving one from the email and
// tacking on a short random bit in case two emails produce the same base
function makeUserSlug(email: string): string {
  const base = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function ensureUser(context: LtiLaunchContext, lmsInstance: LmsInstances) {
  // old code: email = params[:lis_person_contact_email_primary] || params[:custom_contact_email_primary]
  // if that's blank, falls back to "{lms_instance.id}_{user_id}@{lms_instance.url}"
  let email = context.email;
  if (!email) {
    if (!context.rawUserId) {
      throw new Error("Unable to uniquely identify user");
    }
    email = `${lmsInstance.id}_${context.rawUserId}@${lmsInstance.url}`;
  }

  let user = await prisma.users.findUnique({
    where: { email },
    include: { global_role: true },
  });

  if (!user) {
    // not setting encrypted_password here on purpose - leaving it blank means
    // this account cant password-login until someone sets a real one later,
    // which is what we want for lti-only accounts
    const roleName = context.isInstructor ? "Instructor" : "Regular User";
    const globalRole = await prisma.globalRoles.findFirst({ where: { name: roleName } })
      ?? await prisma.globalRoles.create({
        data: {
          name: roleName,
          builtin: true,
          can_manage_all_courses: false,
          can_edit_system_configuration: false,
        },
      });

    user = await prisma.users.create({
      data: {
        email,
        slug: makeUserSlug(email),
        first_name: context.firstName,
        last_name: context.lastName,
        global_role_id: globalRole.id,
      },
      include: { global_role: true },
    });
  } else if (user.first_name !== context.firstName || user.last_name !== context.lastName) {
    user = await prisma.users.update({
      where: { id: user.id },
      data: { first_name: context.firstName, last_name: context.lastName },
      include: { global_role: true },
    });
  }

  return user;
}

export async function ltiEnroll(userId: number, courseOfferingId: number, isInstructor: boolean) {
  const roleName = isInstructor ? "Instructor" : "Student";
  const isStaffRole = isInstructor;
  const courseRole = await prisma.courseRoles.findFirst({ where: { name: roleName } })
    ?? await prisma.courseRoles.create({
      data: {
        name: roleName,
        builtin: true,
        can_manage_course: isStaffRole,
        can_manage_assignments: isStaffRole,
        can_grade_submissions: isStaffRole,
        can_view_other_submissions: isStaffRole,
      },
    });

  const existing = await prisma.courseEnrollments.findUnique({
    where: { user_id_course_offering_id: { user_id: userId, course_offering_id: courseOfferingId } },
  });

  if (!existing) {
    await prisma.courseEnrollments.create({
      data: { user_id: userId, course_offering_id: courseOfferingId, course_role_id: courseRole.id },
    });
  } else if (existing.course_role_id !== courseRole.id) {
    // role changed since last launch (eg became the instructor) - update it
    await prisma.courseEnrollments.update({
      where: { id: existing.id },
      data: { course_role_id: courseRole.id },
    });
  }
}
