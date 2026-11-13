import { Router } from "express";
import { Provider, type HttpRequestParameters, type LaunchContext } from "ltijs";
import type { ExpressRouteRequest } from "./express_http_handler";
import { RouterHttpHandler } from "./express_http_handler";
import { handleVerifiedLaunch } from "./handle-verified-launch";
import { setLaunchFrameHeaders } from "./launch-headers";
import { PrismaDatabaseManager } from "./prisma_database_manager";
import type { LtiLaunchContext } from "./types";

/**
 * LTI 1.3 endpoint paths. These default to the /api prefix so the existing
 * ingress (which routes /api to the backend) covers them, but each can be
 * overridden for a different deployment layout.
 */
export const lti13Routes = {
  login: process.env.LTI13_LOGIN_ROUTE || "/api/lti13/login_initiations",
  launch: process.env.LTI13_LAUNCH_ROUTE || "/api/lti13/launches",
  keyset: process.env.LTI13_KEYSET_ROUTE || "/api/lti13/keys",
  session: process.env.LTI13_SESSION_ROUTE || "/api/lti13/session",
};

/** Express router holding ltijs's LTI 1.3 routes plus the debug session route. */
export const lti13Router = Router();

// Log all incoming LTI requests to debug params from Canvas.
lti13Router.use((req, _res, next) => {
  console.log(`[LTI13 Incoming] ${req.method} ${req.originalUrl}`, {
    query: req.query,
    body: req.body,
  });
  next();
});

export const ltiProvider = new Provider({
  databaseManager: new PrismaDatabaseManager(),
  httpHandler: new RouterHttpHandler(lti13Router),
  routes: {
    loginRoute: lti13Routes.login,
    launchRoute: lti13Routes.launch,
    keysetRoute: lti13Routes.keyset,
  },
});

ltiProvider.onUnregisteredPlatform(async (request, response) => {
  console.error("[ltijs] UnregisteredPlatform detected! Incoming request details:", {
    query: request.query,
    body: request.body,
  });
  response.status(400).json({
    error: "UnregisteredPlatformError",
    message: "UNREGISTERED_PLATFORM",
    received: {
      query: request.query,
      body: request.body,
    },
  });
});

function first(value: unknown): string | null {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return value === undefined || value === null ? null : String(value);
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(first(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function queryFromTarget(target: unknown): Record<string, string> {
  if (typeof target !== "string") return {};
  try {
    return Object.fromEntries(new URL(target).searchParams);
  } catch {
    return {};
  }
}

/**
 * Normalize an ltijs LaunchContext into the same LtiLaunchContext shape that
 * the 1.1 validation produces, so both protocols can share post-launch logic.
 */
export function toLaunchContext(
  context: LaunchContext,
  request: HttpRequestParameters
): LtiLaunchContext {
  const { idToken } = context;
  const custom = (idToken.launch.custom ?? {}) as Record<string, unknown>;
  const targetQuery = queryFromTarget(idToken.launch.target);
  const requestQuery = (request.query ?? {}) as Record<string, string | string[]>;

  const param = (name: string) =>
    custom[name] ?? requestQuery[name] ?? targetQuery[name];

  const roles = idToken.user.roles ?? [];
  const isInstructor = roles.some(
    (role) => role.includes("#Instructor") || role.includes("#Administrator")
  );

  const optionalString = (name: string) => {
    const value = param(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  return {
    protocol: "1.3",
    email: idToken.user.email ?? "",
    rawUserId: idToken.user.id ?? null,
    firstName: idToken.user.givenName ?? null,
    lastName: idToken.user.familyName ?? null,
    isInstructor,
    lmsInstanceUrl: idToken.platform.url,
    lmsTypeName: (
      idToken.platform.productFamilyCode ??
      idToken.platform.name ??
      "other"
    ).toLowerCase(),
    customInstBookId: positiveInt(param("custom_inst_book_id")),
    customCourseOfferingId: positiveInt(
      param("custom_course_offering_id")
    ),
    customInstChapterModuleId: positiveInt(
      param("custom_inst_chapter_module_id")
    ),
    customInstModuleId: positiveInt(param("custom_inst_module_id")),
    customInstChapterId: positiveInt(param("custom_inst_chapter_id")),
    customBookPath: optionalString("custom_book_path"),
    customModuleFileName: optionalString("custom_module_file_name"),
    customModuleTitle: optionalString("custom_module_title"),
    customSectionFileName: optionalString("custom_section_file_name"),
    customInstSectionId: positiveInt(param("custom_inst_section_id")),
    customSectionTitle: optionalString("custom_section_title"),
    ltik: context.ltik ?? null,
    rawLaunchParams: Object.fromEntries(
      Object.entries({ ...targetQuery, ...requestQuery, ...custom })
        .filter(([, value]) => typeof value === "string")
        .map(([key, value]) => [key, String(value)])
    ),
    // AGS line item + user `sub` are the 1.3 equivalents of the 1.1 outcome
    // pointers; grade passback is implemented later.
    lisOutcomeServiceUrl:
      idToken.services.assignmentAndGrades.lineItemId || null,
    lisResultSourcedid: idToken.user.id || null,
  };
}

ltiProvider.onResourceLink(async (context, request, response) => {
  const expressRequest = (request as ExpressRouteRequest).expressRequest;
  const launch = toLaunchContext(context, request);
  console.log(
    `[lti13] launch from ${launch.lmsInstanceUrl} user=${launch.rawUserId}`
  );

  const result = await handleVerifiedLaunch(expressRequest, launch);
  if (result.type === "error") {
    response.status(result.status).json({ error: result.message });
    return;
  }

  if (result.type === "html") {
    setLaunchFrameHeaders(expressRequest.res!, launch.lmsInstanceUrl);
    response.html(result.html);
    return;
  }

  response.redirect(result.url);
});

ltiProvider.onDeepLinking(async (_context, _request, response) => {
  response.status(501).json({ error: "Deep linking not implemented yet" });
});

// Resume a launch from its ltik (reads the id_token back out of MySQL).
lti13Router.get(lti13Routes.session, async (req, res) => {
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
