import assert from "node:assert/strict";
import { test } from "node:test";
import { Request } from "express";
import HMAC_SHA1 from "ims-lti/lib/hmac-sha1";
import { validateLtiLaunch } from "../src/lti/validate-launch";

// no db needed for this one, just checking the oauth signature logic actually
// works right. signing the request by hand here since ims-lti's Consumer class
// turned out to just be an unimplemented stub

const key = "test-key";
const secret = "test-secret";
const url = "https://example.com/lti/launch";

function buildSignedBody(overrides: Record<string, string> = {}) {
  const body: Record<string, string> = {
    lti_message_type: "basic-lti-launch-request",
    lti_version: "LTI-1p0",
    resource_link_id: "abc123",
    oauth_consumer_key: key,
    oauth_nonce: "n" + Date.now(),
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
    ...overrides,
  };

  const fakeReq = {
    url,
    originalUrl: url,
    method: "POST",
    protocol: "https",
    connection: { encrypted: true },
    headers: { host: "example.com" },
  } as unknown as Request;

  const signer = new (HMAC_SHA1 as any)();
  const signature = signer.build_signature(fakeReq, body, secret);

  return { req: fakeReq, body: { ...body, oauth_signature: signature } };
}

test("validateLtiLaunch accepts a properly signed request", async () => {
  const { req, body } = buildSignedBody();
  req.body = body;

  const result = await validateLtiLaunch(req, async k => (k === key ? secret : null));
  assert.equal(result.valid, true);
});

test("validateLtiLaunch rejects a tampered request", async () => {
  const { req, body } = buildSignedBody();
  req.body = { ...body, resource_link_id: "tampered" };

  const result = await validateLtiLaunch(req, async k => (k === key ? secret : null));
  assert.equal(result.valid, false);
  assert.equal(result.message, "oauth signature was invalid");
});

test("validateLtiLaunch rejects an unrecognized consumer key", async () => {
  const { req, body } = buildSignedBody();
  req.body = body;

  const result = await validateLtiLaunch(req, async () => null);
  assert.equal(result.valid, false);
  assert.equal(result.message, "consumer key wasn't recognized");
});

test("validateLtiLaunch rejects a request with no consumer key", async () => {
  const { req, body } = buildSignedBody();
  req.body = { ...body, oauth_consumer_key: "" };

  const result = await validateLtiLaunch(req, async () => secret);
  assert.equal(result.valid, false);
  assert.equal(result.message, "no consumer key");
});

// ims-lti's own nonce store rejects anything older than 5 min before our own
// 1440 min check ever runs, so an old request actually comes back as an
// invalid signature right now, not "request is too old". see the comment in
// validate-launch.ts, this needs a decision with the team
test("validateLtiLaunch rejects an old request (via ims-lti's 5 min nonce window, not our 1440 min check)", async () => {
  const oldTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
  const { req, body } = buildSignedBody({ oauth_timestamp: oldTimestamp });
  req.body = body;

  const result = await validateLtiLaunch(req, async k => (k === key ? secret : null));
  assert.equal(result.valid, false);
  assert.equal(result.message, "oauth signature was invalid");
});
