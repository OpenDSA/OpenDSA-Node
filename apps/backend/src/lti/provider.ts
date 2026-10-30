import { Router } from "express";
import { Provider } from "ltijs";
import { RouterHttpHandler } from "./express_http_handler";
import { PrismaDatabaseManager } from "./prisma_database_manager";

/** Express router holding ltijs's /lti13/* routes plus the minimal test routes. Mount on the app. */
export const lti13Router = Router();

export const ltiProvider = new Provider({
  databaseManager: new PrismaDatabaseManager(),
  httpHandler: new RouterHttpHandler(lti13Router),
  routes: {
    loginRoute: "/lti13/login_initiations",
    launchRoute: "/lti13/launches",
    keysetRoute: "/lti13/keys",
  },
});

// Minimal launch handler: prove the whole OIDC -> JWT validation -> DB round trip works.
ltiProvider.onResourceLink(async (context, request, response) => {
  const { idToken } = context;
  console.log(`[lti13] launch from ${idToken.platform.url} user=${idToken.user.id}`);
  response.json({
    ok: true,
    user: idToken.user,
    platform: { url: idToken.platform.url, clientId: idToken.platform.clientId },
    target: idToken.launch.target,
    custom: idToken.launch.custom,
    query: request.query,
    agsAvailable: context.grading.isAvailable(),
    nrpsAvailable: context.namesAndRoles.isAvailable(),
    lineItemId: idToken.services.assignmentAndGrades.lineItemId,
    // Try: GET /api/lti/session?ltik=<ltik> to confirm the stored launch can be resumed from the DB.
    ltik: context.ltik,
  });
});

ltiProvider.onDeepLinking(async (_context, _request, response) => {
  response.status(501).json({ error: "Deep linking not implemented yet" });
});

// Resume a launch from its ltik (reads the id_token back out of MySQL).
lti13Router.get("/api/lti/session", async (req, res) => {
  const ltik = typeof req.query.ltik === "string" ? req.query.ltik : undefined;
  if (!ltik) {
    res.status(400).json({ error: "Missing ltik" });
    return;
  }
  try {
    const context = await ltiProvider.getLaunchContext(ltik);
    res.json({ user: context.idToken.user, platform: context.idToken.platform });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.name : "Invalid ltik" });
  }
});
