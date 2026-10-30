import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  IdTokenValidationMethod,
  type AccessTokenRecord,
  type DatabaseManager,
  type IdTokenClaims,
  type IdTokenRecord,
  type PlatformAttributes,
  type PlatformFilter,
  type PlatformRecord,
} from "ltijs";
import { prisma } from "../db";

const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Mapping of ltijs platforms onto the existing `lms_instances` table:
 *
 *   PlatformAttributes.url                    <-> issuer
 *   PlatformAttributes.name                   <-> url
 *   PlatformAttributes.clientId               <-> client_id
 *   PlatformAttributes.authenticationEndpoint <-> platform_oidc_auth_url
 *   PlatformAttributes.accessTokenEndpoint    <-> oauth2_url
 *   PlatformAttributes.idTokenValidation.key  <-> keyset_url   (always JWK_SET)
 *   PlatformAttributes.keys.{public,private}  <-> public_key / private_key
 *
 * The platform `id` ltijs sees is the stringified `lms_instances.id`.
 * `lms_instances` has no "active" flag, so every complete row is active.
 */
type LmsInstanceRow = Prisma.LmsInstancesGetPayload<object>;

function toPlatformRecord(row: LmsInstanceRow): PlatformRecord | undefined {
  if (
    !row.issuer ||
    !row.client_id ||
    !row.platform_oidc_auth_url ||
    !row.oauth2_url ||
    !row.keyset_url ||
    !row.public_key ||
    !row.private_key
  ) {
    return undefined; // Not a fully configured LTI 1.3 platform (e.g. LTI 1.1-only row).
  }
  return {
    id: String(row.id),
    url: row.issuer,
    name: row.url,
    clientId: row.client_id,
    authenticationEndpoint: row.platform_oidc_auth_url,
    accessTokenEndpoint: row.oauth2_url,
    idTokenValidation: {
      method: IdTokenValidationMethod.JwkSet,
      key: row.keyset_url,
    },
    active: true,
    keys: { public: row.public_key, private: row.private_key },
  };
}

function toRows(rows: LmsInstanceRow[]): PlatformRecord[] {
  return rows.flatMap((row) => toPlatformRecord(row) ?? []);
}

function parseId(id: string): number | undefined {
  const n = Number(id);
  return Number.isInteger(n) ? n : undefined;
}

function accessTokenKey(platformUrl: string, clientId: string, scopes: string): string {
  return createHash("sha256").update(`${platformUrl}|${clientId}|${scopes}`).digest("hex");
}

function toColumns(fields: Partial<PlatformAttributes>) {
  const data: Prisma.LmsInstancesUpdateInput = {};
  if (fields.url !== undefined) data.issuer = fields.url;
  if (fields.name !== undefined) data.url = fields.name;
  if (fields.clientId !== undefined) data.client_id = fields.clientId;
  if (fields.authenticationEndpoint !== undefined) data.platform_oidc_auth_url = fields.authenticationEndpoint;
  if (fields.accessTokenEndpoint !== undefined) data.oauth2_url = fields.accessTokenEndpoint;
  if (fields.idTokenValidation?.key !== undefined) data.keyset_url = fields.idTokenValidation.key;
  if (fields.keys?.public !== undefined) data.public_key = fields.keys.public;
  if (fields.keys?.private !== undefined) data.private_key = fields.keys.private;
  return data;
}

export class PrismaDatabaseManager implements DatabaseManager {
  async listen(): Promise<void> {
    await prisma.$connect();
  }

  async close(): Promise<void> {
    await prisma.$disconnect();
  }

  // --- Platforms (lms_instances) -------------------------------------------

  async getPlatforms(filter: PlatformFilter = {}): Promise<PlatformRecord[]> {
    const where: Prisma.LmsInstancesWhereInput = {};
    if (filter.url !== undefined) where.issuer = filter.url;
    if (filter.name !== undefined) where.url = filter.name;
    if (filter.clientId !== undefined) {
      where.client_id = Array.isArray(filter.clientId) ? { in: filter.clientId } : filter.clientId;
    }
    return toRows(await prisma.lmsInstances.findMany({ where }));
  }

  async getPlatformById(id: string): Promise<PlatformRecord | undefined> {
    const numericId = parseId(id);
    if (numericId === undefined) return undefined;
    const row = await prisma.lmsInstances.findUnique({ where: { id: numericId } });
    return row ? toPlatformRecord(row) : undefined;
  }

  async getPlatformByUrlAndClientId(url: string, clientId: string): Promise<PlatformRecord | undefined> {
    const row = await prisma.lmsInstances.findFirst({ where: { issuer: url, client_id: clientId } });
    return row ? toPlatformRecord(row) : undefined;
  }

  /** Upserts on `lms_instances.url` so an existing (e.g. LTI 1.1) row gains its 1.3 settings and keys. */
  async savePlatform(platform: PlatformAttributes): Promise<string> {
    const now = new Date();
    const columns = toColumns(platform);
    const row = await prisma.lmsInstances.upsert({
      where: { url: platform.name },
      update: { ...columns, updated_at: now },
      create: {
        url: platform.name,
        issuer: platform.url,
        client_id: platform.clientId,
        platform_oidc_auth_url: platform.authenticationEndpoint,
        oauth2_url: platform.accessTokenEndpoint,
        keyset_url: platform.idTokenValidation.key,
        public_key: platform.keys.public,
        private_key: platform.keys.private,
        created_at: now,
        updated_at: now,
      },
    });
    return String(row.id);
  }

  async updatePlatformById(id: string, fields: Partial<PlatformAttributes>): Promise<void> {
    const numericId = parseId(id);
    if (numericId === undefined) return;
    await prisma.lmsInstances.update({
      where: { id: numericId },
      data: { ...toColumns(fields), updated_at: new Date() },
    });
  }

  /** Clears the LTI 1.3 settings rather than deleting the row (other tables reference lms_instances). */
  async deletePlatformById(id: string): Promise<void> {
    const numericId = parseId(id);
    if (numericId === undefined) return;
    await prisma.lmsInstances.update({
      where: { id: numericId },
      data: {
        issuer: null,
        client_id: null,
        platform_oidc_auth_url: null,
        oauth2_url: null,
        keyset_url: null,
        public_key: null,
        private_key: null,
        updated_at: new Date(),
      },
    });
  }

  // --- OAuth2 access tokens ------------------------------------------------

  async getAccessToken(platformUrl: string, clientId: string, scopes: string): Promise<AccessTokenRecord | undefined> {
    const row = await prisma.ltiAccessTokens.findUnique({
      where: { cache_key: accessTokenKey(platformUrl, clientId, scopes) },
    });
    if (!row || row.expires_at.getTime() <= Date.now()) return undefined;
    return row.token as unknown as AccessTokenRecord;
  }

  async saveAccessToken(
    platformUrl: string,
    clientId: string,
    scopes: string,
    token: AccessTokenRecord,
  ): Promise<string> {
    const cache_key = accessTokenKey(platformUrl, clientId, scopes);
    // Treat the token as expired 60s early to avoid edge-of-window 401s.
    const expires_at = new Date(token.createdAt + Math.max(token.expires_in - 60, 0) * 1000);
    const value = token as unknown as Prisma.InputJsonValue;
    await prisma.ltiAccessTokens.upsert({
      where: { cache_key },
      update: { token: value, expires_at },
      create: { cache_key, token: value, expires_at },
    });
    return cache_key;
  }

  // --- Launch id_tokens ----------------------------------------------------

  async getIdToken(id: string): Promise<IdTokenRecord | undefined> {
    const row = await prisma.ltiIdTokens.findUnique({ where: { id } });
    if (!row) return undefined;
    return { ...(row.claims as unknown as IdTokenClaims), id };
  }

  async saveIdToken(token: IdTokenClaims): Promise<string> {
    const id = randomUUID();
    const platformId = typeof token.platform_id === "string" ? parseId(token.platform_id) : undefined;
    await prisma.ltiIdTokens.create({
      data: {
        id,
        lms_instance_id: platformId ?? null,
        claims: token as unknown as Prisma.InputJsonValue,
      },
    });
    return id;
  }

  // --- OIDC nonces ---------------------------------------------------------

  async saveNonce(nonce: string): Promise<string> {
    await prisma.ltiNonces.deleteMany({ where: { expires_at: { lt: new Date() } } });
    await prisma.ltiNonces.create({ data: { nonce, expires_at: new Date(Date.now() + NONCE_TTL_MS) } });
    return nonce;
  }

  /** Atomic: only one concurrent caller can delete the row, so a nonce is accepted at most once. */
  async consumeNonce(nonce: string): Promise<boolean> {
    const { count } = await prisma.ltiNonces.deleteMany({
      where: { nonce, expires_at: { gt: new Date() } },
    });
    return count === 1;
  }
}
