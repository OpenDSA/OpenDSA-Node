// porting the old rails lti_authorize! method over to node
// see OpenDSA-DevStack/opendsa-lti/app/controllers/lti_controller.rb line 787
// not wired up yet, just the skeleton for now

// note: LtiLaunches in schema.prisma is for lti 1.3 (jwt stuff), can't reuse that
// table for this, probably needs its own table

// ims-lti already does nonce checking for us (in memory), the old rails code
// never actually finished that part so this is already better lol

import { Request } from "express";
import { Provider } from "ims-lti";

export interface LtiLaunchValidationResult {
  valid: boolean;
  message?: string;
}

// todo: actually look this up from the db (LmsInstances / LmsAccesses) based on
// the consumer key. this is what get_oauth_creds did in the old code
async function getOauthCreds(consumerKey: string): Promise<string | null> {
  throw new Error("todo: look up consumer secret for this key");
}

export async function validateLtiLaunch(req: Request): Promise<LtiLaunchValidationResult> {
  const params = req.body as Record<string, string>;

  const consumerKey = params["oauth_consumer_key"];
  if (!consumerKey) {
    return { valid: false, message: "no consumer key" };
  }

  const secret = await getOauthCreds(consumerKey);
  if (!secret) {
    return { valid: false, message: "consumer key wasn't recognized" };
  }

  const provider = new Provider(consumerKey, secret);

  // old code had a separate canvas specific check here using
  // IMS::LTI::MessageAuthenticator, vs a generic one for anything else.
  // not sure yet if ims-lti needs that same split or if valid_request handles
  // it already. since we're only dealing with canvas rn it might not matter

  const isValid = await new Promise<boolean>((resolve, reject) => {
    provider.valid_request(req, params, (err: Error | null, valid: boolean) => {
      if (err) return reject(err);
      resolve(valid);
    });
  }).catch(() => false);

  if (!isValid) {
    return { valid: false, message: "oauth signature was invalid" };
  }

  // old rails code checked if the request was older than 1440 min (24 hrs)
  const timestamp = Number(params["oauth_timestamp"]);
  const ageMinutes = (Date.now() / 1000 - timestamp) / 60;
  if (!timestamp || ageMinutes > 1440) {
    return { valid: false, message: "request is too old" };
  }

  return { valid: true };
}

// todo: everything after lti_authorize! passes in the old code -
// ensure_lms_instance(), ensure_user(), lti_enroll(). basically user lookup/
// creation + enrolling them in the course offering. havent started this part yet
