import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "../src/db";
import { generateCourse } from "../src/course_creation/generate_course";
import { instBookFullInclude } from "../src/course_creation/types";

test("seeded book content generation needs a token, not a shared secret or LTI endpoints", async () => {
  const book = await prisma.instBooks.findFirstOrThrow({ where: { title: "CS 1114 OpenDSA Book" }, include: instBookFullInclude });
  assert(book.course_offering);
  book.course_offering.lms_instance.url = "https://canvas.test.invalid";
  for (const chapter of book.inst_chapters) {
    chapter.lms_chapter_id = null; chapter.lms_assignment_group_id = null;
    for (const module of chapter.inst_chapter_modules) {
      module.lms_module_item_id = null; module.lms_assignment_id = null;
    }
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "opendsa-content-test-"));
  const originals: Array<() => void> = [];
  function replace(target: object, key: string, value: unknown) {
    const record = target as Record<string, unknown>; const original = record[key];
    record[key] = value; originals.push(() => { record[key] = original; });
  }
  const requests: Array<{ url: string; body: any }> = [];
  let id = 1000;
  try {
    replace(prisma.instBooks, "findUnique", async () => book);
    replace(prisma.users, "findUnique", async () => ({ id: book.user_id }));
    replace(prisma.lmsAccesses, "findUnique", async () => ({ access_token: "test-token", consumer_key: null, consumer_secret: null }));
    for (const delegate of [prisma.instBooks, prisma.instChapters, prisma.instChapterModules, prisma.courseOfferings]) {
      replace(delegate, "update", async () => ({}));
    }
    replace(globalThis, "fetch", async (url: string, init?: RequestInit) => {
      const address = String(url);
      assert(["canvas.test.invalid", "compiler.test.invalid"].includes(new URL(address).hostname), "No real network calls allowed");
      assert(!address.includes("external_tools"), "No LTI registration calls");
      const body = init?.body && init.headers && (init.headers as any)["Content-Type"] === "application/json"
        ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url: address, body });
      return Response.json(address.includes("compiler.test.invalid") ? { ok: true, message: 0 } :
        init?.method === "GET" ? { id: 22, course_code: "TEST" } : { id: ++id });
    });
    const result = await generateCourse({ instBookId: book.id, userId: book.user_id,
      canvasContentOnly: true, bookPublicBaseUrl: "http://localhost:8080/Books",
      launchUrl: "", resourceSelectionUrl: "", extrtoolLaunchBaseUrl: "",
      openDsaSharedDir: directory, configApiLink: "http://compiler.test.invalid/api/configure/" });
    assert.equal(result.compileResponse.message, 0);
    const assignments = requests.filter(r => /\/assignments$/.test(r.url));
    assert.equal(assignments.length, 3);
    for (const request of assignments) {
      assert.deepEqual(request.body.assignment.submission_types, ["none"]);
      assert(!request.body.assignment.external_tool_tag_attributes);
      assert(request.body.assignment.description.includes("http://localhost:8080/Books/"));
    }
    assert(requests.some(r => r.body?.module_item?.type === "ExternalUrl"));
  } finally {
    for (const restore of originals.reverse()) restore();
    await rm(directory, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
