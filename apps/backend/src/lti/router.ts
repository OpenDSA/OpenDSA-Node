// the actual inbound lti 1.1 launch endpoint. based on the launch action in
// lti_controller.rb (lines 9-53)

import { Router } from "express";
import { handleVerifiedLaunch } from "./handle-verified-launch";
import { setLaunchFrameHeaders } from "./launch-headers";
import { validateLtiLaunch } from "./validate-launch";

export const ltiRouter = Router();

ltiRouter.post("/lti/launch", async (req, res) => {
  const result = await validateLtiLaunch(req);

  if (!result.valid || !result.context) {
    res.status(401).json({ error: result.message });
    return;
  }

  // Everything after signature verification is shared with LTI 1.3.
  const launch = await handleVerifiedLaunch(req, result.context);
  if (launch.type === "error") {
    res.status(launch.status).json({ error: launch.message });
    return;
  }

  if (launch.type === "html") {
    setLaunchFrameHeaders(res, result.context.lmsInstanceUrl);
    res.type("html").send(launch.html);
    return;
  }

  res.redirect(launch.url);
});
