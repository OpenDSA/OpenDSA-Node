/**
 * Registers (or fills in) an LTI 1.3 platform in `lms_instances` through ltijs, which generates
 * the tool's RSA keypair. Usage (values from your LMS developer key):
 *
 *   LTI_CLIENT_ID=10000000000001 \
 *   npm run lti:register -w apps/backend
 *
 * Canvas base URL defaults to SEED_CANVAS_URL from apps/backend/.env. The
 * remaining endpoints default to Canvas's standard URLs. Override them for a
 * non-Canvas platform:
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

try {
  process.loadEnvFile?.();
} catch {
  // Environment variables may be supplied directly instead of via .env.
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function trim(value: string): string {
  return value.replace(/\/+$/, "");
}

async function main() {
  const canvas = trim(
    process.env.LTI_LMS_URL || process.env.SEED_CANVAS_URL || need("LTI_LMS_URL")
  );
  const issuer = trim(process.env.LTI_ISSUER || canvas);
  const clientId =
    process.env.LTI_CLIENT_ID ||
    process.env.SEED_LTI_CLIENT_ID ||
    need("LTI_CLIENT_ID");

  await ltiProvider.databaseManager.listen();
  const platform = await ltiProvider.platformManager.registerPlatform({
    name: canvas,
    url: issuer,
    clientId,
    authenticationEndpoint:
      process.env.LTI_AUTH_URL || `${canvas}/api/lti/authorize_redirect`,
    accessTokenEndpoint:
      process.env.LTI_TOKEN_URL || `${canvas}/login/oauth2/token`,
    idTokenValidation: {
      method: IdTokenValidationMethod.JwkSet,
      key: process.env.LTI_JWKS_URL || `${canvas}/api/lti/security/jwks`,
    },
  });
  console.log(`Registered platform id=${platform.id} (${platform.url}, client ${platform.clientId})`);
  const publicOrigin = process.env.PUBLIC_ORIGIN;
  if (publicOrigin) {
    console.log(`Tool JWKS URL: ${trim(publicOrigin)}/api/lti13/keys`);
  }
  await ltiProvider.databaseManager.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
