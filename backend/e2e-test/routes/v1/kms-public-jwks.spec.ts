import { randomUUID } from "node:crypto";

import { createLocalJWKSet, jwtVerify } from "jose";

import { ProjectMembershipRole } from "@app/db/schemas";

import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { addIdentityToProject, createIdentityActor } from "../../testUtils/identities";
import {
  createKmsKey,
  createKmsProject,
  deleteKmsKey,
  getKmsKeyPublicJwks,
  signWithKmsKey,
  updateKmsKey
} from "../../testUtils/kms";

const expectNotFound = (keyId: string) =>
  getKmsKeyPublicJwks({ keyId }).expect((res) => expect(res.statusCode).toBe(404));

describe("KMS public key publishing", () => {
  let org: Awaited<ReturnType<typeof createIsolatedOrgAndProject>>;
  let projectId: string;

  const createSigningKey = (name: string, algorithm = "RSA_4096") =>
    createKmsKey({ projectId, name, keyUsage: "sign-verify", algorithm, authToken: org.authToken });

  const setPublished = (keyId: string, isPublicKeyPublished: boolean) =>
    updateKmsKey({ keyId, body: { isPublicKeyPublished }, authToken: org.authToken });

  beforeEach(async () => {
    org = await createIsolatedOrgAndProject("kms-jwks");
    projectId = await createKmsProject({ name: "kms-jwks", authToken: org.authToken });
  });

  afterEach(async () => {
    await org.cleanup();
  });

  test("a project member can edit a key but not publish it", async () => {
    const key = await createSigningKey("member-key");
    const member = await createIdentityActor({ orgId: org.orgId, authToken: org.authToken });
    await addIdentityToProject({
      projectId,
      identityId: member.identityId,
      role: ProjectMembershipRole.Member,
      authToken: org.authToken
    });

    await updateKmsKey({ keyId: key.id, body: { isPublicKeyPublished: true }, authToken: member.authToken }).expect(
      (res) => expect(res.statusCode).toBe(403)
    );
    await updateKmsKey({ keyId: key.id, body: { description: "edited" }, authToken: member.authToken });
    await expectNotFound(key.id);
  });

  test("publishes a key at creation only for callers who may publish", async () => {
    const key = await createKmsKey({
      projectId,
      name: "created-public",
      keyUsage: "sign-verify",
      algorithm: "ECC_NIST_P256",
      isPublicKeyPublished: true,
      authToken: org.authToken
    });
    expect(key.isPublicKeyPublished).toBe(true);
    const jwks = await getKmsKeyPublicJwks({ keyId: key.id });
    expect(jwks.keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256", kid: `${key.id}:v1` });

    const member = await createIdentityActor({ orgId: org.orgId, authToken: org.authToken });
    await addIdentityToProject({
      projectId,
      identityId: member.identityId,
      role: ProjectMembershipRole.Member,
      authToken: org.authToken
    });

    await createKmsKey({
      projectId,
      name: "member-public",
      keyUsage: "sign-verify",
      algorithm: "RSA_4096",
      isPublicKeyPublished: true,
      authToken: member.authToken
    }).expect((res) => expect(res.statusCode).toBe(403));

    const memberKey = await createKmsKey({
      projectId,
      name: "member-private",
      keyUsage: "sign-verify",
      algorithm: "RSA_4096",
      authToken: member.authToken
    });
    expect(memberKey.isPublicKeyPublished).toBe(false);
  });

  test("serves a JWKS that verifies tokens signed through the sign API", async () => {
    const key = await createSigningKey("jwt-key");
    const published = await setPublished(key.id, true);
    expect(published.isPublicKeyPublished).toBe(true);
    expect(published.kid).toBe(`${key.id}:v1`);

    const jwks = await getKmsKeyPublicJwks({ keyId: key.id });
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: "RSA", use: "sig", kid: published.kid });

    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: published.kid })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ sub: "service", exp: Math.floor(Date.now() / 1000) + 300 })).toString(
      "base64url"
    );
    const signature = await signWithKmsKey({
      keyId: key.id,
      data: Buffer.from(`${header}.${claims}`),
      signingAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256",
      authToken: org.authToken
    });

    const { payload } = await jwtVerify(
      `${header}.${claims}.${signature.toString("base64url")}`,
      createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0])
    );
    expect(payload.sub).toBe("service");
  });

  test("answers a matching ETag with 304", async () => {
    const key = await createSigningKey("etag-key");
    await setPublished(key.id, true);

    const res = await getKmsKeyPublicJwks({ keyId: key.id }).raw();
    expect(res.headers["cache-control"]).toBe("public, max-age=300");

    await getKmsKeyPublicJwks({ keyId: key.id, ifNoneMatch: res.headers.etag as string }).expect((conditional) =>
      expect(conditional.statusCode).toBe(304)
    );
  });

  test("serves only published, enabled keys, even when the JWKS is cached", async () => {
    await expectNotFound(randomUUID());

    const key = await createSigningKey("lifecycle-key");
    await expectNotFound(key.id);

    await setPublished(key.id, true);
    await getKmsKeyPublicJwks({ keyId: key.id });

    await updateKmsKey({ keyId: key.id, body: { isDisabled: true }, authToken: org.authToken });
    await expectNotFound(key.id);

    await updateKmsKey({ keyId: key.id, body: { isDisabled: false }, authToken: org.authToken });
    await getKmsKeyPublicJwks({ keyId: key.id });

    await setPublished(key.id, false);
    await expectNotFound(key.id);

    await setPublished(key.id, true);
    await getKmsKeyPublicJwks({ keyId: key.id });
    await deleteKmsKey({ keyId: key.id, authToken: org.authToken });
    await expectNotFound(key.id);
  });

  test("refuses to publish keys that can't be represented as a JWK", async () => {
    const encryptionKey = await createKmsKey({
      projectId,
      name: "aes-key",
      keyUsage: "encrypt-decrypt",
      algorithm: "aes-256-gcm",
      authToken: org.authToken
    });
    expect(encryptionKey.kid).toBeNull();

    await updateKmsKey({
      keyId: encryptionKey.id,
      body: { isPublicKeyPublished: true },
      authToken: org.authToken
    }).expect((res) => expect(res.statusCode).toBe(400));

    await createKmsKey({
      projectId,
      name: "aes-public",
      keyUsage: "encrypt-decrypt",
      algorithm: "aes-256-gcm",
      isPublicKeyPublished: true,
      authToken: org.authToken
    }).expect((res) => expect(res.statusCode).toBe(400));
  });
});
