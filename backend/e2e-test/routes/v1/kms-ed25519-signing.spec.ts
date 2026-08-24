import { createHash, randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

type TKmsKey = { id: string };

const authHeaders = { authorization: `Bearer ${jwtAuthToken}` };
const message = Buffer.from("Infisical KMS Ed25519 API e2e test");
const digest = createHash("sha512").update(message).digest("base64");

let projectId: string;
let keyId: string;

const request = (url: string, body: Record<string, unknown>) =>
  testServer.inject({ method: "POST", url, headers: authHeaders, body });

describe("KMS Ed25519 signing API", () => {
  beforeEach(async () => {
    const project = await request("/api/v1/projects", {
      projectName: `kms-ed25519-${randomUUID()}`,
      slug: `kms-${randomUUID()}`,
      type: "kms",
      shouldCreateDefaultEnvs: false
    });
    expect(project.statusCode).toBe(200);
    projectId = (JSON.parse(project.payload) as { project: { id: string } }).project.id;

    const key = await request("/api/v1/kms/keys", {
      projectId,
      name: `ed25519-${randomUUID().slice(0, 16)}`,
      keyUsage: "sign-verify",
      algorithm: "ECC_NIST_ED25519",
      isExportable: true
    });
    expect(key.statusCode, key.payload).toBe(200);
    keyId = (JSON.parse(key.payload) as { key: TKmsKey }).key.id;
  });

  afterEach(async () => {
    if (projectId) {
      await testServer.inject({ method: "DELETE", url: `/api/v1/projects/${projectId}`, headers: authHeaders });
    }
  });

  test.each([
    ["ED25519_SHA_512", false, message.toString("base64")],
    ["ED25519_PH_SHA_512", true, digest]
  ])("signs and verifies %s, rejecting a corrupted signature", async (signingAlgorithm, isDigest, data) => {
    const sign = await request(`/api/v1/kms/keys/${keyId}/sign`, { signingAlgorithm, isDigest, data });
    expect(sign.statusCode).toBe(200);
    const { signature } = JSON.parse(sign.payload) as { signature: string };

    const verify = await request(`/api/v1/kms/keys/${keyId}/verify`, { signingAlgorithm, isDigest, data, signature });
    expect(verify.statusCode).toBe(200);
    expect(JSON.parse(verify.payload)).toMatchObject({ signatureValid: true, signingAlgorithm });

    const corruptedSignatureBytes = Buffer.from(signature, "base64");
    corruptedSignatureBytes[0] = (corruptedSignatureBytes[0] + 1) % 256;
    const corruptedSignature = corruptedSignatureBytes.toString("base64");
    const corrupted = await request(`/api/v1/kms/keys/${keyId}/verify`, {
      signingAlgorithm,
      isDigest,
      data,
      signature: corruptedSignature
    });
    expect(corrupted.statusCode).toBe(200);
    expect(JSON.parse(corrupted.payload)).toMatchObject({ signatureValid: false, signingAlgorithm });
  });

  test("rejects digested input for raw Ed25519", async () => {
    const sign = await request(`/api/v1/kms/keys/${keyId}/sign`, {
      signingAlgorithm: "ED25519_SHA_512",
      isDigest: true,
      data: digest
    });
    expect(sign.statusCode).toBe(400);

    const rawSign = await request(`/api/v1/kms/keys/${keyId}/sign`, {
      signingAlgorithm: "ED25519_SHA_512",
      isDigest: false,
      data: message.toString("base64")
    });
    expect(rawSign.statusCode).toBe(200);
    const { signature } = JSON.parse(rawSign.payload) as { signature: string };

    const verify = await request(`/api/v1/kms/keys/${keyId}/verify`, {
      signingAlgorithm: "ED25519_SHA_512",
      isDigest: true,
      data: digest,
      signature
    });
    expect(verify.statusCode).toBe(400);
  });
});
