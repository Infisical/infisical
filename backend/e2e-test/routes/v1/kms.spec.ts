import {
  constants,
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes
} from "node:crypto";

import {
  CreateKeyCommand,
  DecryptCommand,
  GetParametersForImportCommand,
  ImportKeyMaterialCommand,
  KMSClient,
  ScheduleKeyDeletionCommand
} from "@aws-sdk/client-kms";

const authHeaders = {
  authorization: `Bearer ${jwtAuthToken}`
};

const wrapKeyMaterialForAws = (keyMaterial: Buffer, awsPublicKey: Buffer) => {
  const aesKek = randomBytes(32);
  try {
    const cipher = createCipheriv("id-aes256-wrap-pad", aesKek, Buffer.from("A65959A6", "hex"));
    const wrappedKeyMaterial = Buffer.concat([cipher.update(keyMaterial), cipher.final()]);
    const wrappedAesKey = publicEncrypt(
      {
        key: createPublicKey({ key: awsPublicKey, format: "der", type: "spki" }),
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      },
      aesKek
    );
    return Buffer.concat([wrappedAesKey, wrappedKeyMaterial]);
  } finally {
    aesKek.fill(0);
  }
};

const stripKmsCiphertextVersionForAws = (ciphertext: Buffer) => {
  const suffix = ciphertext.subarray(-3).toString("utf8");
  if (suffix === "v01") return ciphertext.subarray(0, -3);
  if (suffix === "v02") return ciphertext.subarray(0, -7);
  throw new Error("Expected an Infisical KMS ciphertext version suffix");
};

const awsKmsTest = process.env.RUN_AWS_KMS_E2E === "true" ? test : test.skip;

describe("KMS V1 Router", () => {
  test("creates an exportable RSA-4096 encrypt-decrypt key and decrypts ciphertext", async () => {
    const projectResponse = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders,
      body: {
        projectName: "RSA KMS E2E",
        slug: "rsa-kms-e2e",
        type: "kms"
      }
    });

    expect(projectResponse.statusCode).toBe(200);
    const { project } = JSON.parse(projectResponse.payload) as { project: { id: string } };

    const createKeyResponse = await testServer.inject({
      method: "POST",
      url: "/api/v1/kms/keys",
      headers: authHeaders,
      body: {
        projectId: project.id,
        name: "rsa-4096-encrypt-decrypt",
        keyUsage: "encrypt-decrypt",
        algorithm: "RSA_4096",
        isExportable: true
      }
    });

    expect(createKeyResponse.statusCode).toBe(200);
    const { key } = JSON.parse(createKeyResponse.payload) as {
      key: { id: string; algorithm: string; isExportable: boolean; keyUsage: string };
    };
    expect(key).toMatchObject({
      algorithm: "RSA_4096",
      isExportable: true,
      keyUsage: "encrypt-decrypt"
    });

    const plaintext = Buffer.from("RSA-4096 KMS plaintext", "utf8");
    const encryptResponse = await testServer.inject({
      method: "POST",
      url: `/api/v1/kms/keys/${key.id}/encrypt`,
      headers: authHeaders,
      body: { plaintext: plaintext.toString("base64") }
    });

    expect(encryptResponse.statusCode, encryptResponse.payload).toBe(200);
    const { ciphertext } = JSON.parse(encryptResponse.payload) as { ciphertext: string };
    expect(ciphertext).not.toBe(plaintext.toString("base64"));

    const decryptResponse = await testServer.inject({
      method: "POST",
      url: `/api/v1/kms/keys/${key.id}/decrypt`,
      headers: authHeaders,
      body: { ciphertext }
    });

    expect(decryptResponse.statusCode).toBe(200);
    const { plaintext: decryptedPlaintext } = JSON.parse(decryptResponse.payload) as { plaintext: string };
    expect(Buffer.from(decryptedPlaintext, "base64")).toEqual(plaintext);

    const rotateResponse = await testServer.inject({
      method: "POST",
      url: `/api/v1/kms/keys/${key.id}/rotate`,
      headers: authHeaders
    });

    expect(rotateResponse.statusCode).toBe(400);
  });

  test("bulk imports an exportable RSA-4096 encrypt-decrypt key and decrypts ciphertext", async () => {
    const projectResponse = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: authHeaders,
      body: {
        projectName: "RSA KMS Import E2E",
        slug: "rsa-kms-import-e2e",
        type: "kms"
      }
    });

    expect(projectResponse.statusCode).toBe(200);
    const { project } = JSON.parse(projectResponse.payload) as { project: { id: string } };
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 4096,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" }
    });

    const importResponse = await testServer.inject({
      method: "POST",
      url: "/api/v1/kms/keys/bulk-import",
      headers: authHeaders,
      body: {
        projectId: project.id,
        keys: [
          {
            name: "rsa-4096-imported-ed",
            keyUsage: "encrypt-decrypt",
            algorithm: "RSA_4096",
            keyMaterial: Buffer.from(privateKey).toString("base64"),
            isExportable: true
          }
        ]
      }
    });

    expect(importResponse.statusCode, importResponse.payload).toBe(200);
    const imported = JSON.parse(importResponse.payload) as { errors: unknown[]; keys: { id: string; name: string }[] };
    expect(imported.errors).toEqual([]);
    expect(imported.keys).toHaveLength(1);

    const plaintext = Buffer.from("Imported RSA-4096 KMS plaintext", "utf8");
    const keyId = imported.keys[0].id;
    const encryptResponse = await testServer.inject({
      method: "POST",
      url: `/api/v1/kms/keys/${keyId}/encrypt`,
      headers: authHeaders,
      body: { plaintext: plaintext.toString("base64") }
    });

    expect(encryptResponse.statusCode, encryptResponse.payload).toBe(200);
    const { ciphertext } = JSON.parse(encryptResponse.payload) as { ciphertext: string };
    const decryptResponse = await testServer.inject({
      method: "POST",
      url: `/api/v1/kms/keys/${keyId}/decrypt`,
      headers: authHeaders,
      body: { ciphertext }
    });

    expect(decryptResponse.statusCode, decryptResponse.payload).toBe(200);
    const { plaintext: decryptedPlaintext } = JSON.parse(decryptResponse.payload) as { plaintext: string };
    expect(Buffer.from(decryptedPlaintext, "base64")).toEqual(plaintext);
  });

  awsKmsTest(
    "AWS KMS decrypts RSA ciphertext after the Infisical KMS version suffix is removed in test code",
    async () => {
      const project = JSON.parse(
        (
          await testServer.inject({
            method: "POST",
            url: "/api/v1/projects",
            headers: authHeaders,
            body: { projectName: "AWS RSA KMS E2E", slug: "aws-rsa-kms-e2e", type: "kms" }
          })
        ).payload
      ) as { project: { id: string } };
      const key = JSON.parse(
        (
          await testServer.inject({
            method: "POST",
            url: "/api/v1/kms/keys",
            headers: authHeaders,
            body: {
              projectId: project.project.id,
              name: "aws-rsa-4096-ed",
              keyUsage: "encrypt-decrypt",
              algorithm: "RSA_4096",
              isExportable: true
            }
          })
        ).payload
      ) as { key: { id: string } };
      const exported = await testServer.inject({
        method: "GET",
        url: `/api/v1/kms/keys/${key.key.id}/private-key`,
        headers: authHeaders
      });
      expect(exported.statusCode, exported.payload).toBe(200);
      const privateKey = Buffer.from((JSON.parse(exported.payload) as { privateKey: string }).privateKey, "base64");
      const privateKeyDer = createPrivateKey({ key: privateKey, format: "pem", type: "pkcs8" }).export({
        format: "der",
        type: "pkcs8"
      });
      const aws = new KMSClient({ region: "ap-south-2" });
      const created = await aws.send(
        new CreateKeyCommand({
          Origin: "EXTERNAL",
          KeySpec: "RSA_4096",
          KeyUsage: "ENCRYPT_DECRYPT",
          Tags: [{ TagKey: "InfisicalTemporaryE2ETest", TagValue: "true" }]
        })
      );
      const keyId = created.KeyMetadata?.KeyId;
      expect(keyId).toBeDefined();
      try {
        const parameters = await aws.send(
          new GetParametersForImportCommand({
            KeyId: keyId,
            WrappingAlgorithm: "RSA_AES_KEY_WRAP_SHA_256",
            WrappingKeySpec: "RSA_4096"
          })
        );
        await aws.send(
          new ImportKeyMaterialCommand({
            KeyId: keyId,
            ImportToken: parameters.ImportToken,
            EncryptedKeyMaterial: wrapKeyMaterialForAws(privateKeyDer, Buffer.from(parameters.PublicKey!)),
            ExpirationModel: "KEY_MATERIAL_EXPIRES",
            ValidTo: new Date(Date.now() + 24 * 60 * 60 * 1000)
          })
        );
        const plaintext = Buffer.from("Infisical to AWS RSA plaintext");
        const encrypted = await testServer.inject({
          method: "POST",
          url: `/api/v1/kms/keys/${key.key.id}/encrypt`,
          headers: authHeaders,
          body: { plaintext: plaintext.toString("base64") }
        });
        expect(encrypted.statusCode, encrypted.payload).toBe(200);
        const infisicalCiphertext = Buffer.from(
          (JSON.parse(encrypted.payload) as { ciphertext: string }).ciphertext,
          "base64"
        );
        const awsCiphertext = stripKmsCiphertextVersionForAws(infisicalCiphertext);
        expect(awsCiphertext).toHaveLength(512);
        const decrypted = await aws.send(
          new DecryptCommand({
            KeyId: keyId,
            CiphertextBlob: awsCiphertext,
            EncryptionAlgorithm: "RSAES_OAEP_SHA_256"
          })
        );
        expect(Buffer.from(decrypted.Plaintext!)).toEqual(plaintext);
      } finally {
        await aws.send(new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 }));
      }
    },
    120_000
  );
});
