import type { Response } from "express";

/**
 * Allow the launch document to be embedded by its LMS. Express does not set
 * X-Frame-Options by default, but removing it here keeps a future helmet/CSP
 * addition from silently breaking every Canvas launch.
 */
export function setLaunchFrameHeaders(res: Response, lmsUrl?: string): void {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const ancestors = new Set<string>(["'self'"]);
  if (lmsUrl) {
    try {
      ancestors.add(new URL(lmsUrl).origin);
    } catch {
      // Invalid/missing LMS URL: keep the self-only policy.
    }
  }
  for (const value of (process.env.LTI_FRAME_ANCESTORS ?? "").split(",")) {
    const trimmed = value.trim();
    if (trimmed) ancestors.add(trimmed);
  }
  res.setHeader(
    "Content-Security-Policy",
    `frame-ancestors ${[...ancestors].join(" ")}`
  );
}
