import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpRequestParameters, LaunchContext } from "ltijs";
import { lti13Routes, toLaunchContext } from "../src/lti/provider";

function fakeContext(overrides: {
  roles?: string[];
  email?: string;
  custom?: Record<string, unknown>;
  target?: string;
  lineItemId?: string;
} = {}): LaunchContext {
  return {
    idToken: {
      platform: {
        url: "https://canvas.example",
        productFamilyCode: "Canvas",
      },
      user: {
        id: "sub-123",
        email: overrides.email ?? "student@example.com",
        givenName: "Stu",
        familyName: "Dent",
        roles:
          overrides.roles ??
          ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
      },
      launch: {
        target:
          overrides.target ??
          "https://tool.example/api/lti13/launches?custom_inst_book_id=42",
        custom: overrides.custom ?? {},
      },
      services: {
        assignmentAndGrades: {
          lineItemId:
            overrides.lineItemId ?? "https://canvas.example/lineitems/9",
        },
      },
    },
    ltik: "test-ltik",
  } as unknown as LaunchContext;
}

function request(query: Record<string, string> = {}): HttpRequestParameters {
  return { query } as unknown as HttpRequestParameters;
}

test("LTI 1.3 routes default under /api/lti13 and remain overridable", () => {
  assert.equal(lti13Routes.login, "/api/lti13/login_initiations");
  assert.equal(lti13Routes.launch, "/api/lti13/launches");
  assert.equal(lti13Routes.keyset, "/api/lti13/keys");
  assert.equal(lti13Routes.session, "/api/lti13/session");
});

test("normalizes ltijs claims into the shared LtiLaunchContext", () => {
  const context = toLaunchContext(
    fakeContext({
      custom: { custom_course_offering_id: "7" },
      target:
        "https://tool.example/api/lti13/launches?custom_inst_book_id=42",
    }),
    request({ custom_inst_book_id: "43" })
  );

  assert.equal(context.email, "student@example.com");
  assert.equal(context.rawUserId, "sub-123");
  assert.equal(context.firstName, "Stu");
  assert.equal(context.lastName, "Dent");
  assert.equal(context.isInstructor, false);
  assert.equal(context.lmsInstanceUrl, "https://canvas.example");
  assert.equal(context.lmsTypeName, "canvas");
  // Explicit request/custom params take precedence over target_link_uri.
  assert.equal(context.customInstBookId, 43);
  assert.equal(context.customCourseOfferingId, 7);
  assert.equal(
    context.lisOutcomeServiceUrl,
    "https://canvas.example/lineitems/9"
  );
  assert.equal(context.lisResultSourcedid, "sub-123");
});

test("detects instructor roles and rejects non-integer custom ids", () => {
  const context = toLaunchContext(
    fakeContext({
      roles: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
      target: "https://tool.example/api/lti13/launches",
    }),
    request({ custom_inst_book_id: "12.5" })
  );

  assert.equal(context.isInstructor, true);
  assert.equal(context.customInstBookId, null);
  assert.equal(context.customCourseOfferingId, null);
});

test("falls back to an empty email and no outcome pointer", () => {
  const context = toLaunchContext(
    fakeContext({
      email: "",
      lineItemId: "",
      target: "not a url",
      custom: {},
    }),
    request()
  );

  assert.equal(context.email, "");
  assert.equal(context.customInstBookId, null);
  assert.equal(context.lisOutcomeServiceUrl, null);
});
