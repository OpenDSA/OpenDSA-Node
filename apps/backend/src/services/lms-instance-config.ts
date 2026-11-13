import { createPrivateKey, createPublicKey, generateKeyPair } from "node:crypto";
import { promisify } from "node:util";

export const lmsInstanceAdminSelect = {
  id: true, url: true, lms_type_id: true, organization_id: true,
  consumer_key: true, client_id: true, public_key: true, keyset_url: true,
  oauth2_url: true, platform_oidc_auth_url: true, issuer: true,
  created_at: true, updated_at: true,
} as const;
const generate = promisify(generateKeyPair);
export async function lmsKeypair(privatePem: string | null, publicPem: string | null, generateMissing: boolean) {
  if (!privatePem && generateMissing) {
    const pair = await generate("rsa", { modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    privatePem = pair.privateKey;
  }
  if (!privatePem) {
    if (publicPem) throw new Error("A private key is required with the public key.");
    return { private_key: null, public_key: null };
  }
  try {
    const privateKey = createPrivateKey(privatePem);
    if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
    const derived = createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
    if (publicPem && createPublicKey(publicPem).export({ type: "spki", format: "pem" }).toString() !== derived) {
      throw new Error();
    }
    return { private_key: privatePem, public_key: derived };
  } catch {
    throw new Error("Enter a valid RSA private key (at least 2048 bits) and a matching public key, or leave the public key blank to derive it.");
  }
}
