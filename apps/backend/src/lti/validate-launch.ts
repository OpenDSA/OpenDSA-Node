// porting the old rails lti_authorize! method over to node
// see OpenDSA-DevStack/opendsa-lti/app/controllers/lti_controller.rb line 787

// note: LtiLaunches in schema.prisma is for lti 1.3 (jwt stuff), can't reuse that
// table for this, probably needs its own table

// ims-lti already does nonce checking for us (in memory), the old rails code
// never actually finished that part so this is already better

import { Request } from "express";
import { Provider } from "ims-lti";
import { prisma } from "../db";
import { LtiLaunchContext } from "./types";

export interface LtiLaunchValidationResult {
  valid: boolean;
  message?: string;
  // only set when valid is true
  context?: LtiLaunchContext;
}

// port of get_oauth_creds from lti_controller.rb line 868. checks LmsInstance
// first (lms_instance.rb get_oauth_creds), then falls back to LmsAccess
// (lms_access.rb get_oauth_creds) if that didnt find anything. old code
// returned a {key => secret} hash but we only ever use the secret so just
// returning that directly
async function getOauthCreds(consumerKey: string): Promise<string | null> {
  const lmsInstance = await prisma.lmsInstances.findFirst({
    where: { consumer_key: consumerKey },
  });
  if (lmsInstance?.consumer_key && lmsInstance.consumer_secret) {
    return lmsInstance.consumer_secret;
  }

  const lmsAccess = await prisma.lmsAccesses.findFirst({
    where: { consumer_key: consumerKey },
  });
  if (lmsAccess?.consumer_secret) {
    return lmsAccess.consumer_secret;
  }

  return null;
}

export async function validateLtiLaunch(
  req: Request,
  lookupSecret: (consumerKey: string) => Promise<string | null> = getOauthCreds
): Promise<LtiLaunchValidationResult> {
  const params = req.body as Record<string, string>;

  const consumerKey = params["oauth_consumer_key"];
  if (!consumerKey) {
    return { valid: false, message: "no consumer key" };
  }

  const secret = await lookupSecret(consumerKey);
  if (!secret) {
    return { valid: false, message: "consumer key wasn't recognized" };
  }

  const provider = new Provider(consumerKey, secret);

  // old rails code had a separate canvas specific signature check here.
  // looked at ims-lti's source (lib/hmac-sha1.js) and it already checks
  // tool_consumer_info_product_family_code === 'canvas' internally and handles
  // the url differently for that case, so probably dont need a separate path
  // like the old code did. ran a local test confirming valid_request works for
  // a signed request + rejects a tampered one, just didnt test the canvas
  // specific branch directly yet

  const isValid = await new Promise<boolean>((resolve, reject) => {
    provider.valid_request(req, params, (err: Error | null, valid: boolean) => {
      if (err) return reject(err);
      resolve(valid);
    });
  }).catch(() => false);

  if (!isValid) {
    return { valid: false, message: "oauth signature was invalid" };
  }

  // old rails code checked for requests older than 1440 min (24 hrs) here,
  // but that was basically dead code anyway - ims-lti's nonce store already
  // rejects anything older than 5 min on its own (lib/memory-nonce-store.js,
  // EXPIRE_IN_SEC = 5*60) with actual nonce tracking, unlike the old check
  // which was just a timestamp window with no real replay protection behind
  // it (the old nonce check was never implemented). keeping ims-lti's
  // stricter default instead of trying to match the old window, no real
  // reason to loosen it without evidence it actually causes problems

  // provider.body/.instructor/.student get set by parse_request(), which
  // valid_request() already called internally, so these are ready to use
  const body = provider.body;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

  // custom_inst_book_id / custom_course_offering_id get used as prisma ids
  // downstream, so something like "12.5" or "Infinity" needs to come back as
  // null here instead of a truthy non-integer number that would blow up the
  // prisma query with a type error instead of a clean 400
  const parseIntParam = (v: string): number | null => {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  const param = (name: string) => str(body[name]);
  const optionalIntParam = (name: string) => {
    const value = param(name);
    return value ? parseIntParam(value) : null;
  };
  const optionalStringParam = (name: string) => param(name) || null;

  // old code: uri = URI.parse(request.referrer); url = uri.scheme + '://' + uri.host
  let lmsInstanceUrl = "";
  const referer = req.get("Referer");
  if (referer) {
    try {
      const u = new URL(referer);
      lmsInstanceUrl = `${u.protocol}//${u.host}`;
    } catch {
      // leave blank, ensureLmsInstance will fail loudly on an empty url
    }
  }

  const context: LtiLaunchContext = {
    protocol: "1.1",
    email: str(body["lis_person_contact_email_primary"]) || str(body["custom_contact_email_primary"]),
    rawUserId: str(body["user_id"]) || null,
    firstName: str(body["lis_person_name_given"]) || null,
    lastName: str(body["lis_person_name_family"]) || null,
    isInstructor: provider.instructor,
    lmsInstanceUrl,
    lmsTypeName: str(body["tool_consumer_info_product_family_code"]) || "other",
    customInstBookId: optionalIntParam("custom_inst_book_id"),
    customCourseOfferingId: optionalIntParam("custom_course_offering_id"),
    customInstChapterModuleId: optionalIntParam("custom_inst_chapter_module_id"),
    customInstModuleId: optionalIntParam("custom_inst_module_id"),
    customInstChapterId: optionalIntParam("custom_inst_chapter_id"),
    customBookPath: optionalStringParam("custom_book_path"),
    customModuleFileName: optionalStringParam("custom_module_file_name"),
    customModuleTitle: optionalStringParam("custom_module_title"),
    customSectionFileName: optionalStringParam("custom_section_file_name"),
    customInstSectionId: optionalIntParam("custom_inst_section_id"),
    customSectionTitle: optionalStringParam("custom_section_title"),
    rawLaunchParams: Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        Array.isArray(value) ? (value[0] ?? "") : (value ?? ""),
      ])
    ),
    lisOutcomeServiceUrl: str(body["lis_outcome_service_url"]) || null,
    lisResultSourcedid: str(body["lis_result_sourcedid"]) || null,
  };


  return { valid: true, context };
}

// everything after lti_authorize! passes in the old code - ensure_lms_instance(),
// ensure_user(), lti_enroll() - lives in post-launch.ts now
