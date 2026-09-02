import { constants, createCipheriv, createPrivateKey, publicEncrypt, randomBytes } from "node:crypto";

import { ProjectType } from "@app/db/schemas";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { KeyWrapAlgorithm } from "@app/lib/crypto/cryptography/types";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";
import { KmsKeyUsage } from "@app/services/kms/kms-types";

const authHeaders = { authorization: `Bearer ${jwtAuthToken}` };
const data = Buffer.from("cmek import e2e payload").toString("base64");
let kmsProjectId: string;
const AES_KWP_IV = Buffer.from("A65959A6", "hex");

const request = (method: "GET" | "POST" | "PATCH", url: string, body?: unknown) =>
  testServer.inject({ method, url, headers: authHeaders, ...(body ? { body } : {}) });

const createKey = async (name: string, keyUsage: KmsKeyUsage, algorithm: string, isImportable = false) => {
  const response = await request("POST", "/api/v1/kms/keys", {
    projectId: kmsProjectId,
    name,
    keyUsage,
    algorithm,
    isImportable,
    isExportable: true,
    importOnly: isImportable
  });
  expect(response.statusCode, response.payload).toBe(200);
  return JSON.parse(response.payload).key as { id: string };
};

type TImportParams = { publicKey: string; token: string };

const getImportParams = async (keyId: string, wrapAlgorithm: KeyWrapAlgorithm) => {
  const paramsResponse = await request("POST", `/api/v1/kms/keys/${keyId}/params-for-import`, {
    wrapKeyEncryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
    wrapSigningAlgorithm: wrapAlgorithm
  });
  expect(paramsResponse.statusCode, paramsResponse.payload).toBe(200);
  return JSON.parse(paramsResponse.payload) as TImportParams;
};

const wrapKeyMaterial = (publicKey: string, material: Buffer, wrapAlgorithm: KeyWrapAlgorithm) => {
  const oaepHash = wrapAlgorithm.endsWith("SHA_256") ? "sha256" : "sha1";
  if (wrapAlgorithm.startsWith("RSAES_OAEP")) {
    return publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash }, material);
  }

  const aesKek = randomBytes(32);
  try {
    const cipher = createCipheriv("id-aes256-wrap-pad", aesKek, AES_KWP_IV);
    const wrappedMaterial = Buffer.concat([cipher.update(material), cipher.final()]);
    const wrappedKek = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash }, aesKek);
    return Buffer.concat([wrappedKek, wrappedMaterial]);
  } finally {
    aesKek.fill(0);
  }
};

const importWrappedMaterial = (keyId: string, token: string, wrappedKeyMaterial: Buffer) =>
  request("POST", `/api/v1/kms/keys/${keyId}/import-material`, {
    token,
    wrappedKeyMaterial: wrappedKeyMaterial.toString("base64")
  });

const importMaterial = async (keyId: string, material: Buffer, wrapAlgorithm: KeyWrapAlgorithm) => {
  const params = await getImportParams(keyId, wrapAlgorithm);
  const wrappedKeyMaterial = wrapKeyMaterial(params.publicKey, material, wrapAlgorithm);
  return importWrappedMaterial(keyId, params.token, wrappedKeyMaterial);
};

const exportMaterial = async (keyId: string) => {
  const response = await request("GET", `/api/v1/kms/keys/${keyId}/private-key`);
  expect(response.statusCode).toBe(200);
  return Buffer.from(JSON.parse(response.payload).privateKey, "base64");
};

const expectDecryptions = async (keyId: string, ciphertexts: ReadonlyArray<readonly [string, string]>) => {
  await Promise.all(
    ciphertexts.map(async ([ciphertext, plaintext]) => {
      const response = await request("POST", `/api/v1/kms/keys/${keyId}/decrypt`, { ciphertext });
      expect(response.statusCode, response.payload).toBe(200);
      expect(JSON.parse(response.payload).plaintext).toBe(plaintext);
    })
  );
};

describe("CMEK key-material import", () => {
  beforeAll(async () => {
    const response = await request("POST", "/api/v1/projects", {
      projectName: "e2e cmek import",
      type: ProjectType.KMS
    });
    expect(response.statusCode, response.payload).toBe(200);
    kmsProjectId = JSON.parse(response.payload).project.id;
  });

  test("lists an import-only key awaiting its first import with version zero", async () => {
    const key = await createKey(
      "e2e-pending-import-list-key",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256,
      true
    );

    const response = await request("GET", `/api/v1/kms/keys?projectId=${kmsProjectId}&search=${key.id}`);
    expect(response.statusCode, response.payload).toBe(200);

    const body = JSON.parse(response.payload) as {
      keys: { id: string; version: number; totalVersions: number; algorithm: string }[];
    };
    expect(body.keys).toEqual([
      expect.objectContaining({
        id: key.id,
        version: 0,
        totalVersions: 0,
        algorithm: SymmetricKeyAlgorithm.AES_GCM_256
      })
    ]);

    const disableResponse = await request("PATCH", `/api/v1/kms/keys/${key.id}`, { isDisabled: true });
    expect(disableResponse.statusCode, disableResponse.payload).toBe(200);
    expect(JSON.parse(disableResponse.payload).key).toEqual(
      expect.objectContaining({ id: key.id, isDisabled: true, version: 0 })
    );
  });

  test("lists KMS key versions without exposing key material", async () => {
    const key = await createKey(
      "e2e-list-key-versions",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256
    );

    const response = await request("GET", `/api/v1/kms/keys/${key.id}/versions?limit=10`);
    expect(response.statusCode, response.payload).toBe(200);

    const body = JSON.parse(response.payload) as {
      versions: { id: string; version: number; origin: string; createdAt: string; encryptedKey?: unknown }[];
      totalCount: number;
    };
    expect(body.totalCount).toBe(1);
    expect(body.versions).toEqual([
      {
        id: expect.any(String),
        version: 1,
        origin: "internal",
        createdAt: expect.any(String)
      }
    ]);
    expect(body.versions[0]?.encryptedKey).toBeUndefined();
  });

  test("rejects malformed PKCS #8 material, non-base64 input, and an RSA key for an EC key", async () => {
    const aes = await createKey(
      "e2e-import-invalid-aes",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256,
      true
    );
    const params = await request("POST", `/api/v1/kms/keys/${aes.id}/params-for-import`, {
      wrapKeyEncryptionAlgorithm: AsymmetricKeyAlgorithm.RSA_4096,
      wrapSigningAlgorithm: KeyWrapAlgorithm.RSAES_OAEP_SHA_256
    });
    const { token } = JSON.parse(params.payload) as { token: string };
    const nonBase64 = await request("POST", `/api/v1/kms/keys/${aes.id}/import-material`, {
      token,
      wrappedKeyMaterial: "not base64"
    });
    expect(nonBase64.statusCode).toBe(422);

    const invalidPkcs8 = await createKey(
      "e2e-import-invalid-pkcs8",
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.RSA_4096,
      true
    );
    const malformed = await importMaterial(
      invalidPkcs8.id,
      Buffer.from("not a BER or DER PKCS #8 private key"),
      KeyWrapAlgorithm.RSA_AES_KEY_WRAP_SHA_256
    );
    expect(malformed.statusCode).toBe(400);

    const ec = await createKey(
      "e2e-import-invalid-ec",
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.ECC_NIST_P521,
      true
    );
    const rsa = await createKey("e2e-import-source-rsa", KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.RSA_4096);
    const rsaDer = createPrivateKey(await exportMaterial(rsa.id)).export({ format: "der", type: "pkcs8" });
    const wrongType = await importMaterial(ec.id, rsaDer, KeyWrapAlgorithm.RSA_AES_KEY_WRAP_SHA_256);
    expect(wrongType.statusCode).toBe(400);
  });

  test("imports AES and preserves encryption compatibility", async () => {
    const source = await createKey(
      "e2e-import-aes-source",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256
    );
    const target = await createKey(
      "e2e-import-aes-target",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256,
      true
    );
    expect(
      (await importMaterial(target.id, await exportMaterial(source.id), KeyWrapAlgorithm.RSAES_OAEP_SHA_256)).statusCode
    ).toBe(200);
    const encrypted = await request("POST", `/api/v1/kms/keys/${source.id}/encrypt`, { plaintext: data });
    const decrypted = await request("POST", `/api/v1/kms/keys/${target.id}/decrypt`, {
      ciphertext: JSON.parse(encrypted.payload).ciphertext
    });
    expect(JSON.parse(decrypted.payload).plaintext).toBe(data);
  });

  test("uses the active imported AES version until rotation and retains both versions for decryption", async () => {
    const firstSource = await createKey(
      "e2e-rotation-source-first",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256
    );
    const secondSource = await createKey(
      "e2e-rotation-source-second",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256
    );
    const target = await createKey(
      "e2e-rotation-target",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256,
      true
    );
    const firstMaterial = await exportMaterial(firstSource.id);
    const secondMaterial = await exportMaterial(secondSource.id);

    const firstImport = await importMaterial(target.id, firstMaterial, KeyWrapAlgorithm.RSAES_OAEP_SHA_256);
    expect(firstImport.statusCode, firstImport.payload).toBe(200);
    expect(JSON.parse(firstImport.payload).keyVersion).toBe(1);
    expect(await exportMaterial(target.id)).toEqual(firstMaterial);

    const firstPlaintext = Buffer.from("first imported AES material").toString("base64");
    const firstCiphertextResponse = await request("POST", `/api/v1/kms/keys/${target.id}/encrypt`, {
      plaintext: firstPlaintext
    });
    expect(firstCiphertextResponse.statusCode, firstCiphertextResponse.payload).toBe(200);
    const firstCiphertext = JSON.parse(firstCiphertextResponse.payload).ciphertext as string;
    expect(Buffer.from(firstCiphertext, "base64").subarray(-3).toString()).toBe("v01");

    const secondImport = await importMaterial(target.id, secondMaterial, KeyWrapAlgorithm.RSAES_OAEP_SHA_256);
    expect(secondImport.statusCode, secondImport.payload).toBe(200);
    expect(JSON.parse(secondImport.payload).keyVersion).toBe(2);
    expect(await exportMaterial(target.id)).toEqual(firstMaterial);

    const queuedPlaintext = Buffer.from("second material queued before rotation").toString("base64");
    const queuedCiphertextResponse = await request("POST", `/api/v1/kms/keys/${target.id}/encrypt`, {
      plaintext: queuedPlaintext
    });
    expect(queuedCiphertextResponse.statusCode, queuedCiphertextResponse.payload).toBe(200);
    const queuedCiphertext = JSON.parse(queuedCiphertextResponse.payload).ciphertext as string;
    expect(Buffer.from(queuedCiphertext, "base64").subarray(-3).toString()).toBe("v01");

    await expectDecryptions(target.id, [
      [firstCiphertext, firstPlaintext],
      [queuedCiphertext, queuedPlaintext]
    ]);

    const rotation = await request("POST", `/api/v1/kms/keys/${target.id}/rotate`);
    expect(rotation.statusCode, rotation.payload).toBe(200);
    expect(JSON.parse(rotation.payload).key.version).toBe(2);
    expect(await exportMaterial(target.id)).toEqual(secondMaterial);

    const rotatedPlaintext = Buffer.from("second imported AES material after rotation").toString("base64");
    const rotatedCiphertextResponse = await request("POST", `/api/v1/kms/keys/${target.id}/encrypt`, {
      plaintext: rotatedPlaintext
    });
    expect(rotatedCiphertextResponse.statusCode, rotatedCiphertextResponse.payload).toBe(200);
    const rotatedCiphertext = JSON.parse(rotatedCiphertextResponse.payload).ciphertext as string;
    const rotatedCiphertextBlob = Buffer.from(rotatedCiphertext, "base64");
    expect(rotatedCiphertextBlob.subarray(-3).toString()).toBe("v02");
    expect(rotatedCiphertextBlob.readUInt32BE(rotatedCiphertextBlob.length - 7)).toBe(2);

    await expectDecryptions(target.id, [
      [firstCiphertext, firstPlaintext],
      [queuedCiphertext, queuedPlaintext],
      [rotatedCiphertext, rotatedPlaintext]
    ]);
  });

  test("consumes a wrapping token after a subsequent symmetric-key import", async () => {
    const source = await createKey(
      "e2e-replayed-token-source",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256
    );
    const target = await createKey(
      "e2e-replayed-token-target",
      KmsKeyUsage.ENCRYPT_DECRYPT,
      SymmetricKeyAlgorithm.AES_GCM_256,
      true
    );
    const material = await exportMaterial(source.id);

    expect((await importMaterial(target.id, material, KeyWrapAlgorithm.RSAES_OAEP_SHA_256)).statusCode).toBe(200);

    const params = await getImportParams(target.id, KeyWrapAlgorithm.RSAES_OAEP_SHA_256);
    const wrappedKeyMaterial = wrapKeyMaterial(params.publicKey, material, KeyWrapAlgorithm.RSAES_OAEP_SHA_256);
    const secondImport = await importWrappedMaterial(target.id, params.token, wrappedKeyMaterial);
    expect(secondImport.statusCode, secondImport.payload).toBe(200);
    expect(JSON.parse(secondImport.payload).keyVersion).toBe(2);

    const replay = await importWrappedMaterial(target.id, params.token, wrappedKeyMaterial);
    expect(replay.statusCode, replay.payload).toBe(400);
    expect(replay.payload).toContain("already been used");

    const versions = await request("GET", `/api/v1/kms/keys/${target.id}/versions?limit=10`);
    expect(versions.statusCode, versions.payload).toBe(200);
    expect(JSON.parse(versions.payload).totalCount).toBe(2);
  });

  test.each(Object.values(HmacAlgorithm))("imports %s material and verifies a MAC", async (algorithm) => {
    const keyNameSuffix = algorithm.toLowerCase().replaceAll("_", "-");
    const hmacSource = await createKey(`e2e-hmac-src-${keyNameSuffix}`, KmsKeyUsage.GENERATE_VERIFY_MAC, algorithm);
    const hmacTarget = await createKey(
      `e2e-hmac-dst-${keyNameSuffix}`,
      KmsKeyUsage.GENERATE_VERIFY_MAC,
      algorithm,
      true
    );
    const importResponse = await importMaterial(
      hmacTarget.id,
      await exportMaterial(hmacSource.id),
      KeyWrapAlgorithm.RSAES_OAEP_SHA_256
    );
    expect(importResponse.statusCode, importResponse.payload).toBe(200);

    const mac = await request("POST", `/api/v1/kms/keys/${hmacSource.id}/generate-mac`, { data });
    const verification = await request("POST", `/api/v1/kms/keys/${hmacTarget.id}/verify-mac`, {
      data,
      mac: JSON.parse(mac.payload).mac
    });
    expect(JSON.parse(verification.payload).macValid).toBe(true);
  });

  test("imports RSA material and verifies a signature", async () => {
    const rsaSource = await createKey(
      "e2e-import-rsa-source",
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.RSA_4096
    );
    const rsaTarget = await createKey(
      "e2e-import-rsa-target",
      KmsKeyUsage.SIGN_VERIFY,
      AsymmetricKeyAlgorithm.RSA_4096,
      true
    );
    const der = createPrivateKey(await exportMaterial(rsaSource.id)).export({ format: "der", type: "pkcs8" });
    expect((await importMaterial(rsaTarget.id, der, KeyWrapAlgorithm.RSA_AES_KEY_WRAP_SHA_256)).statusCode).toBe(200);
    const signature = await request("POST", `/api/v1/kms/keys/${rsaSource.id}/sign`, {
      data,
      signingAlgorithm: SigningAlgorithm.RSASSA_PSS_SHA_256
    });
    expect(
      JSON.parse(
        (
          await request("POST", `/api/v1/kms/keys/${rsaTarget.id}/verify`, {
            data,
            signature: JSON.parse(signature.payload).signature,
            signingAlgorithm: SigningAlgorithm.RSASSA_PSS_SHA_256
          })
        ).payload
      ).signatureValid
    ).toBe(true);
  });

  test.each([
    [AsymmetricKeyAlgorithm.ECC_NIST_P256, SigningAlgorithm.ECDSA_SHA_256, KeyWrapAlgorithm.RSAES_OAEP_SHA_256],
    [AsymmetricKeyAlgorithm.ECC_NIST_P384, SigningAlgorithm.ECDSA_SHA_384, KeyWrapAlgorithm.RSAES_OAEP_SHA_256],
    [AsymmetricKeyAlgorithm.ECC_NIST_P521, SigningAlgorithm.ECDSA_SHA_512, KeyWrapAlgorithm.RSA_AES_KEY_WRAP_SHA_256]
  ] as const)("imports %s material and verifies a signature", async (algorithm, signingAlgorithm, wrapAlgorithm) => {
    const keyNameSuffix = algorithm.toLowerCase().replaceAll("_", "-");
    const source = await createKey(`e2e-ec-src-${keyNameSuffix}`, KmsKeyUsage.SIGN_VERIFY, algorithm);
    const target = await createKey(`e2e-ec-dst-${keyNameSuffix}`, KmsKeyUsage.SIGN_VERIFY, algorithm, true);
    const privateKeyDer = createPrivateKey(await exportMaterial(source.id)).export({ format: "der", type: "pkcs8" });
    const importResponse = await importMaterial(target.id, privateKeyDer, wrapAlgorithm);
    expect(importResponse.statusCode, importResponse.payload).toBe(200);

    const signature = await request("POST", `/api/v1/kms/keys/${source.id}/sign`, { data, signingAlgorithm });
    const verification = await request("POST", `/api/v1/kms/keys/${target.id}/verify`, {
      data,
      signature: JSON.parse(signature.payload).signature,
      signingAlgorithm
    });
    expect(JSON.parse(verification.payload).signatureValid).toBe(true);
  });
});
