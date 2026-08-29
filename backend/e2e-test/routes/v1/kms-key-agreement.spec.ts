import {
  createKeyAgreementKey,
  createKmsProject,
  deleteCmekKey,
  deleteProject,
  deriveSharedSecret,
  getCmekPublicKey,
  KEY_AGREEMENT_ALGORITHM,
  P256_SHARED_SECRET_BYTE_LENGTH
} from "e2e-test/testUtils/kms";

describe("KMS Key Agreement", async () => {
  let projectId: string;
  let keyAId: string;
  let keyBId: string;

  beforeAll(async () => {
    projectId = await createKmsProject("kms-key-agreement-e2e");
  });

  afterAll(async () => {
    if (keyAId) await deleteCmekKey(keyAId);
    if (keyBId) await deleteCmekKey(keyBId);
    if (projectId) await deleteProject(projectId);
  });

  test("Create a key-agreement CMEK key", async () => {
    const res = await createKeyAgreementKey("key-agreement-key-a", projectId);
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    expect(payload.key).toEqual(
      expect.objectContaining({
        keyUsage: "key-agreement",
        algorithm: KEY_AGREEMENT_ALGORITHM,
        projectId
      })
    );
    expect(payload.key.id).toEqual(expect.any(String));

    keyAId = payload.key.id;
  });

  test("Create a second key-agreement CMEK key for cross-derivation", async () => {
    const res = await createKeyAgreementKey("key-agreement-key-b", projectId);
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    keyBId = payload.key.id;
    expect(payload.key.keyUsage).toBe("key-agreement");
  });

  test("Derive a shared secret and assert its format", async () => {
    const { publicKey: keyBPublicKey } = await getCmekPublicKey(keyBId);

    const res = await deriveSharedSecret(keyAId, keyBPublicKey);
    expect(res.statusCode).toBe(200);

    const payload = res.json();
    expect(payload.secret).toEqual(expect.any(String));

    // response must be base64 and decode to the P-256 field size
    const decoded = Buffer.from(payload.secret, "base64");
    expect(decoded.length).toBe(P256_SHARED_SECRET_BYTE_LENGTH);
    expect(decoded.toString("base64")).toBe(payload.secret);
  });

  test("Deriving from both sides of the key pair yields the same shared secret (ECDH is commutative)", async () => {
    const { publicKey: keyBPublicKey } = await getCmekPublicKey(keyBId);
    const { publicKey: keyAPublicKey } = await getCmekPublicKey(keyAId);

    const fromA = await deriveSharedSecret(keyAId, keyBPublicKey);
    const fromB = await deriveSharedSecret(keyBId, keyAPublicKey);

    expect(fromA.statusCode).toBe(200);
    expect(fromB.statusCode).toBe(200);

    const secretFromA = fromA.json().secret;
    const secretFromB = fromB.json().secret;

    expect(secretFromA).toBe(secretFromB);
  });

  test("Reject creating a key-agreement key with an unsupported algorithm", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/kms/keys",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId,
        name: "key-agreement-bad-algorithm",
        keyUsage: "key-agreement",
        // AES-GCM-256 is a symmetric algorithm, not a valid ECC curve for key agreement
        algorithm: "aes-256-gcm"
      }
    });

    // this is a schema-level (superRefine) rejection, so it comes back as 422 Unprocessable
    // Content — the house convention for ZodError, distinct from the 400s a service throws.
    expect(res.statusCode).toBe(422);
    const payload = res.json();
    expect(payload.message[0].message).toMatch(/key agreement algorithm/i);
  });

  test("Reject deriving a shared secret with a key that is not a key-agreement key", async () => {
    const encryptRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/kms/keys",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId,
        name: "encrypt-decrypt-derive-negative",
        keyUsage: "encrypt-decrypt"
      }
    });
    expect(encryptRes.statusCode).toBe(200);
    const encryptKeyId = encryptRes.json().key.id;

    const { publicKey: keyBPublicKey } = await getCmekPublicKey(keyBId);
    const res = await deriveSharedSecret(encryptKeyId, keyBPublicKey);

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.message).toMatch(/not intended for shared secret derivation/i);

    await deleteCmekKey(encryptKeyId);
  });

  test("Reject deriving a shared secret with a malformed public key", async () => {
    const res = await deriveSharedSecret(keyAId, Buffer.from("not a real public key").toString("base64"));

    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.message).toMatch(/invalid public key/i);
  });
});
