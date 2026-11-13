// shared shape for whatever happens after a launch is verified - both lti 1.1
// and (eventually) lti 1.3 should normalize their own launch params into this
// before calling into post-launch.ts. keeps the actual user/enrollment logic
// from caring which lti version did the verifying

export interface LtiLaunchContext {
  // empty string if the lms didnt send one - ensureUser falls back to a
  // synthetic address built from rawUserId + the lms instance, same as the
  // old rails code did
  email: string;
  rawUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  isInstructor: boolean;
  lmsInstanceUrl: string;
  lmsTypeName: string;
  customInstBookId: number | null;
  customCourseOfferingId: number | null;
  // Book module launch parameters. Optional so existing callers/tests that
  // only exercise the course-navigation/tool launch keep working.
  protocol?: "1.1" | "1.3";
  customInstChapterModuleId?: number | null;
  customInstModuleId?: number | null;
  customInstChapterId?: number | null;
  customBookPath?: string | null;
  customModuleFileName?: string | null;
  customModuleTitle?: string | null;
  customSectionFileName?: string | null;
  customInstSectionId?: number | null;
  customSectionTitle?: string | null;
  // LTI 1.3 launch session token; used to resume the ltijs LaunchContext for
  // later exercise/grade requests.
  ltik?: string | null;
  rawLaunchParams?: Record<string, string>;
  // canvas sends these on graded launches so we can report a score back later.
  // not doing anything with them yet besides holding onto them - see post-launch.ts
  lisOutcomeServiceUrl: string | null;
  lisResultSourcedid: string | null;
}
