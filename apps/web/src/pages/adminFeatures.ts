// Optional LMS Accesses screens and deletion.
const enabled = (name: string, fallback: boolean) => {
  const value = import.meta.env[`VITE_ADMIN_${name}`];
  return value === undefined ? fallback : value === "true";
};

export const adminFeatures: Readonly<{ lmsAccesses: boolean; lmsAccessDelete: boolean }> = {
  // GET/POST /api/admin/lms-accesses, GET/PATCH /api/admin/lms-accesses/:id
  lmsAccesses: enabled("LMS_ACCESSES", true),
  // DELETE /api/admin/lms-accesses/:id
  lmsAccessDelete: enabled("LMS_ACCESS_DELETE", true),
};
