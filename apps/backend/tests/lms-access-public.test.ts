import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLmsAccess } from "../src/services/lms-accesses";

test("authorized LMS access projection includes stored credentials", () => {
  const input = { id: 1, user_id: 2, lms_instance_id: 3, consumer_key: "key",
    created_at: null, updated_at: null, access_token: "canvas-token", consumer_secret: "shared-secret",
    user: { id: 2, first_name: null, last_name: null, email: "test@example.com" },
    lms_instance: { id: 3, url: "https://canvas.example" } };
  assert.deepEqual(publicLmsAccess(input), input);
});
