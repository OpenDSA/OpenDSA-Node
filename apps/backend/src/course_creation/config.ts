import path from "node:path";

// ============================================================================
// Compilation Configuration
// ============================================================================

export interface CompileConfig {
  /** Directory shared with the OpenDSA compiler container. */
  openDsaSharedDir: string;
  /** OpenDSA Flask endpoint that runs tools/configure.py. */
  configApiLink: string;
  /** Maximum time to wait for a compile before giving up. */
  timeoutMs: number;
}

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

/**
 * Single source of truth for compile-related environment variables.
 * Docker compose and the k8s manifests set these explicitly; the defaults are
 * only a local-development fallback.
 */
export function getCompileConfig(): CompileConfig {
  return {
    openDsaSharedDir:
      process.env.OPENDSA_SHARED_DIR || LOCAL_SHARED_DIR,
    configApiLink:
      process.env.CONFIG_API_LINK || "http://opendsa:8080/api/configure/",
    timeoutMs: positiveInteger(
      process.env.COMPILER_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
  };
}
