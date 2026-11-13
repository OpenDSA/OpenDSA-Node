import assert from "node:assert/strict";
import { test } from "node:test";
import { LaunchRenderError, renderModuleLaunch } from "../src/lti/render-launch";
import type { LtiLaunchContext } from "../src/lti/types";

const baseContext: LtiLaunchContext = {
  protocol: "1.3",
  email: "student@example.com",
  rawUserId: "sub-1",
  firstName: "Stu",
  lastName: "Dent",
  isInstructor: false,
  lmsInstanceUrl: "https://lti.example.edu",
  lmsTypeName: "canvas",
  customInstBookId: 1,
  customCourseOfferingId: null,
  customInstChapterModuleId: 5,
  customInstModuleId: 12,
  customInstChapterId: 3,
  customModuleFileName: "Intro",
  customModuleTitle: "01.01 How to Use this System",
  ltik: "test-ltik",
  rawLaunchParams: { custom_inst_book_id: "1", oauth_signature: "drop-me" },
  lisOutcomeServiceUrl: null,
  lisResultSourcedid: "sub-1",
};

const chapterModule = {
  id: 5,
  module_position: 1,
  inst_module: { name: "How to Use this System", path: "Preface/Intro" },
  inst_chapter: { position: 1 },
};

function fakeHtml(): string {
  return "<!DOCTYPE html><html><head><title>Intro</title><script src=\"/OpenDSA/lib/odsaUtils.js\"></script></head><body>content</body></html>";
}

test("injects ODSA.TP into the compiled lti_html document", async () => {
  const originalFetch = globalThis.fetch;
  const originalInternal = process.env.OPENDSA_INTERNAL_URL;
  const requests: string[] = [];
  process.env.OPENDSA_INTERNAL_URL = "http://opendsa.local:8080";
  globalThis.fetch = (async (input: string | URL) => {
    requests.push(String(input));
    return new Response(fakeHtml(), { status: 200, headers: { "Content-Type": "text/html" } });
  }) as typeof fetch;
  try {
    const html = await renderModuleLaunch({
      context: baseContext,
      userEmail: "student@example.com",
      instBookId: 1,
      courseOfferingId: 7,
      buildPath: "seed-vt/seed-cs1114/seed-2023-100/Test",
      chapterModule,
    });

    assert.deepEqual(requests, [
      "http://opendsa.local:8080/Books/seed-vt/seed-cs1114/seed-2023-100/Test/lti_html/Intro.html",
    ]);
    assert.match(html, /window\.ODSA\.TP = \{/);
    assert.match(html, /"instChapterModuleId":5/);
    assert.match(html, /"ltik":"test-ltik"/);
    assert.match(html, /"launch_params":\{"custom_inst_book_id":"1"\}/);
    assert.doesNotMatch(html, /oauth_signature/);
    assert.match(html, /#exercise-summary-widget\{display:none!important\}/);
    assert.match(html, /<base href="\/Books\/seed-vt\/seed-cs1114\/seed-2023-100\/Test\/lti_html\/">/);
    // TP must be before the book's own scripts.
    assert.ok(html.indexOf("window.ODSA.TP") < html.indexOf("/OpenDSA/lib/odsaUtils.js"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInternal === undefined) delete process.env.OPENDSA_INTERNAL_URL;
    else process.env.OPENDSA_INTERNAL_URL = originalInternal;
  }
});

test("rejects a module file that does not match the database module", async () => {
  await assert.rejects(
    renderModuleLaunch({
      context: { ...baseContext, customModuleFileName: "../Secret" },
      userEmail: "student@example.com",
      instBookId: 1,
      courseOfferingId: 7,
      buildPath: "seed-vt/seed-cs1114/seed-2023-100/Test",
      chapterModule,
    }),
    (error: unknown) =>
      error instanceof LaunchRenderError && error.status === 400
  );
});

test("surfaces a missing compiled module as a 404", async () => {
  const originalFetch = globalThis.fetch;
  const originalInternal = process.env.OPENDSA_INTERNAL_URL;
  process.env.OPENDSA_INTERNAL_URL = "http://opendsa.local:8080";
  globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
  try {
    await assert.rejects(
      renderModuleLaunch({
        context: baseContext,
        userEmail: "student@example.com",
        instBookId: 1,
        courseOfferingId: 7,
        buildPath: "seed-vt/seed-cs1114/seed-2023-100/Test",
        chapterModule,
      }),
      (error: unknown) =>
        error instanceof LaunchRenderError && error.status === 404
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalInternal === undefined) delete process.env.OPENDSA_INTERNAL_URL;
    else process.env.OPENDSA_INTERNAL_URL = originalInternal;
  }
});
