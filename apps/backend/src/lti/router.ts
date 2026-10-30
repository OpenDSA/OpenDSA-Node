// the actual inbound lti 1.1 launch endpoint. based on the launch action in
// lti_controller.rb, but only doing the auth check part for now - everything
// after that (ensure_user, enroll, actually serving content) is still a todo,
// see the bottom of validate-launch.ts

import { Router } from "express";
import { validateLtiLaunch } from "./validate-launch";

export const ltiRouter = Router();

ltiRouter.post("/lti/launch", async (req, res) => {
  const result = await validateLtiLaunch(req);

  if (!result.valid) {
    // old code just rendered an error page here, doing the same basic idea
    // but as json since this is an api now
    res.status(401).json({ error: result.message });
    return;
  }

  // todo: this is where ensure_lms_instance / ensure_user / lti_enroll need
  // to happen, then actually redirect/serve the book content. for now just
  // confirming the launch passed auth
  res.json({ ok: true, message: "launch validated, rest of the flow not built yet" });
});
