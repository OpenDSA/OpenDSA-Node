import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLmsAccess } from "../src/services/lms-accesses";

test("LMS access projection exposes only presence and partial hints, never full secrets", () => {
  const input = { id: 1, user_id: 2, lms_instance_id: 3, consumer_key: "public-key",
    created_at: null, updated_at: null, access_token: "canvas-private-value-ABCD", consumer_secret: "private-shared-WXYZ",
    user: { id: 2, first_name: null, last_name: null, email: "test@example.com" },
    lms_instance: { id: 3, url: "https://canvas.example" } };
  const record = publicLmsAccess(input);
  assert.equal(record.has_access_token, true); assert.equal(record.has_consumer_secret, true);
  assert.equal(record.access_token_hint, "ABCD"); assert.equal(record.consumer_secret_hint, "WXYZ");
  assert.ok(!("access_token" in record)); assert.ok(!("consumer_secret" in record));
  assert.ok(!JSON.stringify(record).includes(input.access_token)); assert.ok(!JSON.stringify(record).includes(input.consumer_secret));
  const short = publicLmsAccess({ ...input, access_token: "abc", consumer_secret: "1234" });
  assert.equal(short.has_access_token, true); assert.equal(short.access_token_hint, null);
  assert.equal(short.has_consumer_secret, true); assert.equal(short.consumer_secret_hint, null);
  const empty = publicLmsAccess({ ...input, access_token: null, consumer_secret: null });
  assert.equal(empty.has_access_token, false); assert.equal(empty.has_consumer_secret, false);
  assert.equal(empty.access_token_hint, null); assert.equal(empty.consumer_secret_hint, null);
});
