// ============================================================================
// File Path & String Utilities
// ============================================================================

/**
 * Sanitizes a filename string to match the Ruby implementation:
 *   filename.gsub(/[^\w\s_-]+/, '')
 *     .gsub(/(^|\b\s)\s+($|\s?\b)/, '\1\2')
 *     .gsub(/\s+/, '_')
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\w\s_-]+/g, "")
    .replace(/(^|\b\s)\s+($|\s?\b)/g, "$1$2")
    .replace(/\s+/g, "_");
}

export function buildBookOutputPath(params: {
  organizationSlug: string;
  courseSlug: string;
  termSlug: string;
  courseOfferingLabel: string;
}): string {
  return [
    sanitizeFilename(params.organizationSlug),
    sanitizeFilename(params.courseSlug),
    sanitizeFilename(params.termSlug),
    sanitizeFilename(params.courseOfferingLabel),
  ].join("/");
}

// ============================================================================
// JSON Parsing Utilities
// ============================================================================

export function parseJsonValue(raw: string | null | undefined): unknown {
  if (!raw || raw.trim() === "" || raw === "null") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseJsonObject(
  raw: string | null | undefined
): Record<string, unknown> | null {
  const parsed = parseJsonValue(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

// ============================================================================
// Date Formatting Utilities
// ============================================================================

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function formatDueDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 < 12 ? "am" : "pm";
  return (
    `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ` +
    `${pad(hours12)}:${pad(date.getMinutes())} ${ampm}`
  );
}
