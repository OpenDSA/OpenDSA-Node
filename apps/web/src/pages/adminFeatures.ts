// Admin screens whose backend endpoints are not implemented yet.
// While a flag is off, its screens are neither routed nor linked, so nothing
// looks operational without a real API behind it. The comment on each flag
// names the endpoints it needs.
// Flip the default once those endpoints are merged; the VITE_ variables let a
// teammate try a backend branch locally (e.g. VITE_ADMIN_ERRORS=true npm run dev:web).
const enabled = (name: string, fallback: boolean) => {
  const value = import.meta.env[`VITE_ADMIN_${name}`];
  return value === undefined ? fallback : value === "true";
};

export const adminFeatures: Readonly<{ lmsAccesses: boolean; lmsAccessDelete: boolean; errors: boolean }> = {
  // GET/POST /api/admin/lms-accesses, GET/PATCH /api/admin/lms-accesses/:id
  lmsAccesses: enabled("LMS_ACCESSES", false),
  // DELETE /api/admin/lms-accesses/:id
  lmsAccessDelete: enabled("LMS_ACCESS_DELETE", false),
  // GET /api/admin/errors, GET /api/admin/errors/:id
  errors: enabled("ERRORS", false),
};
