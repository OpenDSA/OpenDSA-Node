// porting the old rails lti_authorize! method over to node
// see OpenDSA-DevStack/opendsa-lti/app/controllers/lti_controller.rb line 787
// not wired up yet, just the skeleton for now

// note: LtiLaunches in schema.prisma is for lti 1.3 (jwt stuff), can't reuse that
// table for this, probably needs its own table

// ims-lti already does nonce checking for us (in memory), the old rails code
// never actually finished that part so this is already better

import { Request } from "express";
import { Provider } from "ims-lti";
import { prisma } from "../db";

export interface LtiLaunchValidationResult {
  valid: boolean;
  message?: string;
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

  return { valid: true };
}

// todo: everything after lti_authorize! passes in the old code -
// ensure_lms_instance(), ensure_user(), lti_enroll(). basically user lookup/
// creation + enrolling them in the course offering. havent started this part yet
