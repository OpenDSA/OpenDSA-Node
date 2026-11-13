import path from "node:path";

// ============================================================================
// OpenDSA Compiler / Configuration Service Settings
// ============================================================================

export interface CompileConfig {
  /** Directory shared with the OpenDSA compiler container. */
  openDsaSharedDir: string;
  /** OpenDSA Flask endpoint that runs tools/configure.py. */
  configApiLink: string;
  /** OpenDSA Flask endpoint that runs tools/simple2full.py. */
  simple2fullApiLink: string;
  /** Public base URL where compiled book HTML is served. */
  booksPublicBaseUrl: string;
  /** Public origin used for LTI launch/keyset URLs. */
  publicOrigin: string;
  /** Internal opendsa origin used by the backend to fetch compiled content. */
  openDsaInternalUrl: string;
  /** Maximum time to wait for a compiler/expander request. */
  timeoutMs: number;
}

const DEFAULT_CONFIG_API = "http://opendsa:8080/api/configure/";
const DEFAULT_SIMPLE2FULL_API = "http://opendsa:8080/api/simple2full/";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// Docker compose and k8s both set OPENDSA_SHARED_DIR. The fallback is the
// repository's local shared directory, resolved from this file so it works
// whether the backend runs from source or from dist/.
const LOCAL_SHARED_DIR = path.resolve(__dirname, "../../../..", ".opendsa-shared");

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Keep simple2full on the same host as configure unless explicitly overridden. */
function deriveSimple2FullLink(configApiLink: string): string {
  return /\/configure\/?$/.test(configApiLink)
    ? configApiLink.replace(/\/configure\/?$/, "/simple2full/")
    : DEFAULT_SIMPLE2FULL_API;
}

/** Derive the public origin from a configured public URL. */
function originOf(value: string, fallback: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

/**
 * Single source of truth for OpenDSA service environment variables.
 * Docker compose and the k8s manifests set these explicitly; the defaults are
 * only a local-development fallback.
 */
export function getCompileConfig(): CompileConfig {
  const configApiLink = process.env.CONFIG_API_LINK || DEFAULT_CONFIG_API;
  const booksPublicBaseUrl =
    process.env.BOOKS_PUBLIC_URL || "http://localhost:8080/Books";

  return {
    openDsaSharedDir:
      process.env.OPENDSA_SHARED_DIR || LOCAL_SHARED_DIR,
    configApiLink,
    simple2fullApiLink:
      process.env.SIMPLE2FULL_API_LINK || deriveSimple2FullLink(configApiLink),
    booksPublicBaseUrl,
    // In production this is the public ingress/tunnel origin. Locally it is
    // the Vite origin, which proxies /api and the book/static paths.
    publicOrigin:
      process.env.PUBLIC_ORIGIN ||
      originOf(booksPublicBaseUrl, "http://localhost:5173"),
    // The backend talks to opendsa directly (k8s sidecar or compose service),
    // never through the public tunnel.
    openDsaInternalUrl:
      process.env.OPENDSA_INTERNAL_URL || originOf(configApiLink, "http://opendsa:8080"),
    timeoutMs: positiveInteger(
      process.env.COMPILER_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
  };
}
