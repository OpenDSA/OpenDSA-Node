import path from "node:path";
import { getCompileConfig } from "../course_creation/config";
import type { LtiLaunchContext } from "./types";

export class LaunchRenderError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "LaunchRenderError";
  }
}

interface LaunchModule {
  id: number;
  module_position: number | null;
  inst_module: { name: string; path: string };
  inst_chapter: { position: number | null };
}

export interface RenderModuleLaunchInput {
  context: LtiLaunchContext;
  userEmail: string;
  instBookId: number;
  courseOfferingId: number;
  buildPath: string;
  chapterModule: LaunchModule;
}

function escapeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function publicBookPath(buildPath: string): string {
  return buildPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function titleFor(context: LtiLaunchContext, module: LaunchModule): string {
  if (context.customModuleTitle) return context.customModuleTitle;
  const chapter = String(module.inst_chapter.position ?? "").padStart(2, "0");
  const modulePosition = String(module.module_position ?? "").padStart(2, "0");
  return `${chapter}.${modulePosition} ${module.inst_module.name}`;
}

/**
 * Fetch the compiler's lti_html document and inject the launch-time
 * window.ODSA.TP object before the book's own scripts run.
 */
export async function renderModuleLaunch(
  input: RenderModuleLaunchInput
): Promise<string> {
  const fileName = path.posix.basename(input.chapterModule.inst_module.path);
  if (!fileName) {
    throw new LaunchRenderError(400, "The selected module has no output file.");
  }
  if (
    input.context.customModuleFileName &&
    input.context.customModuleFileName !== fileName
  ) {
    throw new LaunchRenderError(
      400,
      "The launch module file does not match the selected module."
    );
  }

  const config = getCompileConfig();
  const bookPath = publicBookPath(input.buildPath);
  const contentUrl = `${config.openDsaInternalUrl.replace(/\/+$/, "")}/Books/${bookPath}/lti_html/${encodeURIComponent(fileName)}.html`;
  console.log(`[lti] rendering ${fileName} from ${contentUrl}`);

  let response: Response;
  try {
    response = await fetch(contentUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/html" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LaunchRenderError(502, `Unable to reach compiled book content: ${message}`);
  }
  if (!response.ok) {
    throw new LaunchRenderError(
      response.status === 404 ? 404 : 502,
      response.status === 404
        ? `Compiled module not found: ${fileName}`
        : `Compiled module request failed (${response.status}).`
    );
  }

  const html = await response.text();
  const moduleTitle = titleFor(input.context, input.chapterModule);

  // Launch params are used by OpenDSA for a few Canvas-specific lookups.
  // Drop OAuth signature material before putting anything into the page.
  const launchParams = Object.fromEntries(
    Object.entries(input.context.rawLaunchParams ?? {}).filter(([key]) => {
      return ![
        "oauth_signature",
        "oauth_nonce",
        "oauth_timestamp",
        "oauth_version",
        "oauth_signature_method",
        "oauth_callback",
      ].includes(key);
    })
  );

  const tp = {
    userEmail: input.userEmail,
    courseOfferingId: input.courseOfferingId,
    instBookId: input.instBookId,
    instChapterModuleId: input.chapterModule.id,
    instModuleId: input.context.customInstModuleId ?? null,
    instChapterId: input.context.customInstChapterId ?? null,
    instSectionId: input.context.customInstSectionId ?? null,
    moduleTitle,
    sectionTitle: input.context.customSectionTitle ?? null,
    customBookPath: input.context.customBookPath ?? input.buildPath,
    outcomeService: Boolean(input.context.lisOutcomeServiceUrl),
    ltik: input.context.ltik ?? null,
    toParams: { launch_params: launchParams },
  };

  const injection = [
    `<base href="/Books/${bookPath}/lti_html/">`,
    // Exercise/progress endpoints are a later milestone. Hide the injected
    // widget rather than leaving it to request endpoints that do not exist.
    `<style>#exercise-summary-widget{display:none!important}</style>`,
    `<script>`,
    `window.ODSA = window.ODSA || {};`,
    `window.ODSA.TP = ${escapeForInlineScript(tp)};`,
    `(function(){`,
    `  function installLtikAuth(){`,
    `    if (!window.jQuery || !window.ODSA.TP || !window.ODSA.TP.ltik) return;`,
    `    window.jQuery.ajaxPrefilter(function(options, _originalOptions, jqXHR){`,
    `      jqXHR.setRequestHeader("Authorization", "Bearer " + window.ODSA.TP.ltik);`,
    `    });`,
    `  }`,
    `  if (window.jQuery) installLtikAuth();`,
    `  else document.addEventListener("DOMContentLoaded", installLtikAuth, { once: true });`,
    `})();`,
    `</script>`,
  ].join("\n");

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (match) => `${match}\n${injection}`);
  }
  return `${injection}\n${html}`;
}
