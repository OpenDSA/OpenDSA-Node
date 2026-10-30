/**
 * Registers (or fills in) an LTI 1.3 platform in `lms_instances` through ltijs, which generates
 * the tool's RSA keypair. Usage (values from your LMS developer key):
 *
 *   LTI_LMS_URL=https://canvas.example.edu \
 *   LTI_ISSUER=https://canvas.instructure.com \
 *   LTI_CLIENT_ID=10000000000001 \
 *   LTI_AUTH_URL=https://sso.canvaslms.com/api/lti/authorize_redirect \
 *   LTI_TOKEN_URL=https://sso.canvaslms.com/login/oauth2/token \
 *   LTI_JWKS_URL=https://sso.canvaslms.com/api/lti/security/jwks \
 *   npm run lti:register -w apps/backend
 */
import { IdTokenValidationMethod } from "ltijs";
import { ltiProvider } from "../src/lti/provider";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function main() {
  await ltiProvider.databaseManager.listen();
  const platform = await ltiProvider.platformManager.registerPlatform({
    name: need("LTI_LMS_URL"),
    url: need("LTI_ISSUER"),
    clientId: need("LTI_CLIENT_ID"),
    authenticationEndpoint: need("LTI_AUTH_URL"),
    accessTokenEndpoint: need("LTI_TOKEN_URL"),
    idTokenValidation: { method: IdTokenValidationMethod.JwkSet, key: need("LTI_JWKS_URL") },
  });
  console.log(`Registered platform id=${platform.id} (${platform.url}, client ${platform.clientId})`);
  await ltiProvider.databaseManager.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
