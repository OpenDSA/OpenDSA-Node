// ims-lti doesn't ship types and theres no @types package for it, just
// declaring it so tsc stops complaining. not typing out the full api, just
// enough for what we're using right now
declare module "ims-lti" {
  export class Provider {
    constructor(consumerKey: string, consumerSecret: string, nonceStore?: unknown);
    valid_request(
      req: unknown,
      body: unknown,
      callback: (err: Error | null, valid: boolean) => void
    ): void;
  }
}

declare module "ims-lti/lib/hmac-sha1" {
  export default class HMAC_SHA1 {
    build_signature(req: unknown, body: unknown, consumerSecret: string, token?: unknown): string;
  }
}
