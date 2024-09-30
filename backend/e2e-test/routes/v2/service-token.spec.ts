import crypto from "node:crypto";

import { SecretType, TSecrets } from "@app/db/schemas";
import { decryptSecret, encryptSecret, getUserPrivateKey, seedData1 } from "@app/db/seed-data";
import { decryptAsymmetric, decryptSymmetric128BitHexKeyUTF8, encryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";

const createServiceToken = async (
  scopes: { environment: string; secretPath: string }[],
  permissions: ("read" | "write")[]
) => {
  const projectKeyRes = await testServer.inject({
    method: "GET",
    url: `/api/v2/workspace/${seedData1.project.id}/encrypted-key`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  const projectKeyEnc = JSON.parse(projectKeyRes.payload);

  const userInfoRes = await testServer.inject({
    method: "GET",
    url: "/api/v2/users/me",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  const { user: userInfo } = JSON.parse(userInfoRes.payload);
  const privateKey = await getUserPrivateKey(seedData1.password, userInfo);
  const projectKey = decryptAsymmetric({
    ciphertext: projectKeyEnc.encryptedKey,
    nonce: projectKeyEnc.nonce,
    publicKey: projectKeyEnc.sender.publicKey,
    privateKey
  });

  const randomBytes = crypto.randomBytes(16).toString("hex");
  const { ciphertext, iv, tag } = encryptSymmetric128BitHexKeyUTF8(projectKey, randomBytes);
  const serviceTokenRes = await testServer.inject({
    method: "POST",
    url: "/api/v2/service-token",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      name: "test-token",
      workspaceId: seedData1.project.id,
      scopes,
      encryptedKey: ciphertext,
      iv,
      tag,
      permissions,
      expiresIn: null
    }
  });
  expect(serviceTokenRes.statusCode).toBe(200);
  const serviceTokenInfo = serviceTokenRes.json();
  expect(serviceTokenInfo).toHaveProperty("serviceToken");
  expect(serviceTokenInfo).toHaveProperty("serviceTokenData");
  return `${serviceTokenInfo.serviceToken}.${randomBytes}`;
};

const deleteServiceToken = async () => {
  const serviceTokenListRes = await testServer.inject({
    method: "GET",
    url: `/api/v1/workspace/${seedData1.project.id}/service-token-data`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(serviceTokenListRes.statusCode).toBe(200);
  const serviceTokens = JSON.parse(serviceTokenListRes.payload).serviceTokenData as { name: string; id: string }[];
  expect(serviceTokens.length).toBeGreaterThan(0);
  const serviceTokenInfo = serviceTokens.find(({ name }) => name === "test-token");
  expect(serviceTokenInfo).toBeDefined();

  const deleteTokenRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/service-token/${serviceTokenInfo?.id}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  expect(deleteTokenRes.statusCode).toBe(200);
};

const createSecret = async (dto: {
  projectKey: string;
  path: string;
  key: string;
  value: string;
  comment: string;
  type?: SecretType;
  token: string;
}) => {
  const createSecretReqBody = {
    workspaceId: seedData1.project.id,
    environment: seedData1.environment.slug,
    type: dto.type || SecretType.Shared,
    secretPath: dto.path,
    ...encryptSecret(dto.projectKey, dto.key, dto.value, dto.comment)
  };
  const createSecRes = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/${dto.key}`,
    headers: {
      authorization: `Bearer ${dto.token}`
    },
    body: createSecretReqBody
  });
  expect(createSecRes.statusCode).toBe(200);
  const createdSecretPayload = JSON.parse(createSecRes.payload);
  expect(createdSecretPayload).toHaveProperty("secret");
  return createdSecretPayload.secret;
};

const deleteSecret = async (dto: { path: string; key: string; token: string }) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/${dto.key}`,
    headers: {
      authorization: `Bearer ${dto.token}`
    },
    body: {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      secretPath: dto.path
    }
  });
  expect(deleteSecRes.statusCode).toBe(200);
  const updatedSecretPayload = JSON.parse(deleteSecRes.payload);
  expect(updatedSecretPayload).toHaveProperty("secret");
  return updatedSecretPayload.secret;
};

describe("Service token secret ops", async () => {
  let serviceToken = "";
  let projectKey = "";
  let folderId = "";
  beforeAll(async () => {
    serviceToken = await createServiceToken(
      [{ secretPath: "/**", environment: seedData1.environment.slug }],
      ["read", "write"]
    );

    // this is ensure cli service token decryptiong working fine
    const serviceTokenInfoRes = await testServer.inject({
      method: "GET",
      url: "/api/v2/service-token",
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    });
    expect(serviceTokenInfoRes.statusCode).toBe(200);
    const serviceTokenInfo = serviceTokenInfoRes.json();
    const serviceTokenParts = serviceToken.split(".");
    projectKey = decryptSymmetric128BitHexKeyUTF8({
      key: serviceTokenParts[3],
      tag: serviceTokenInfo.tag,
      ciphertext: serviceTokenInfo.encryptedKey,
      iv: serviceTokenInfo.iv
    });

    // create a deep folder
    const folderCreate = await testServer.inject({
      method: "POST",
      url: `/api/v1/folders`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        name: "folder",
        path: "/nested1/nested2"
      }
    });
    expect(folderCreate.statusCode).toBe(200);
    folderId = folderCreate.json().folder.id;
  });

  afterAll(async () => {
    await deleteServiceToken();

    // create a deep folder
    const deleteFolder = await testServer.inject({
      method: "DELETE",
      url: `/api/v1/folders/${folderId}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        path: "/nested1/nested2"
      }
    });
    expect(deleteFolder.statusCode).toBe(200);
  });

  const testSecrets = [
    {
      path: "/",
      secret: {
        key: "ST-SEC",
        value: "something-secret",
        comment: "some comment"
      }
    },
    {
      path: "/nested1/nested2/folder",
      secret: {
        key: "NESTED-ST-SEC",
        value: "something-secret",
        comment: "some comment"
      }
    }
  ];

  const getSecrets = async (environment: string, secretPath = "/") => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      query: {
        secretPath,
        environment,
        workspaceId: seedData1.project.id
      }
    });
    const secrets: TSecrets[] = JSON.parse(res.payload).secrets || [];
    return secrets.map((el) => ({ ...decryptSecret(projectKey, el), type: el.type }));
  };

  test.each(testSecrets)("Create secret in path $path", async ({ secret, path }) => {
    const createdSecret = await createSecret({ projectKey, path, ...secret, token: serviceToken });
    const decryptedSecret = decryptSecret(projectKey, createdSecret);
    expect(decryptedSecret.key).toEqual(secret.key);
    expect(decryptedSecret.value).toEqual(secret.value);
    expect(decryptedSecret.comment).toEqual(secret.comment);
    expect(decryptedSecret.version).toEqual(1);

    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          value: secret.value,
          type: SecretType.Shared
        })
      ])
    );
    await deleteSecret({ path, key: secret.key, token: serviceToken });
  });

  test.each(testSecrets)("Get secret by name in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, path, ...secret, token: serviceToken });

    const getSecByNameRes = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets/${secret.key}`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      query: {
        secretPath: path,
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug
      }
    });
    expect(getSecByNameRes.statusCode).toBe(200);
    const getSecretByNamePayload = JSON.parse(getSecByNameRes.payload);
    expect(getSecretByNamePayload).toHaveProperty("secret");
    const decryptedSecret = decryptSecret(projectKey, getSecretByNamePayload.secret);
    expect(decryptedSecret.key).toEqual(secret.key);
    expect(decryptedSecret.value).toEqual(secret.value);
    expect(decryptedSecret.comment).toEqual(secret.comment);

    await deleteSecret({ path, key: secret.key, token: serviceToken });
  });

  test.each(testSecrets)("Update secret in path $path", async ({ path, secret }) => {
    await createSecret({ projectKey, path, ...secret, token: serviceToken });
    const updateSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: path,
      ...encryptSecret(projectKey, secret.key, "new-value", secret.comment)
    };
    const updateSecRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v3/secrets/${secret.key}`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      body: updateSecretReqBody
    });
    expect(updateSecRes.statusCode).toBe(200);
    const updatedSecretPayload = JSON.parse(updateSecRes.payload);
    expect(updatedSecretPayload).toHaveProperty("secret");
    const decryptedSecret = decryptSecret(projectKey, updatedSecretPayload.secret);
    expect(decryptedSecret.key).toEqual(secret.key);
    expect(decryptedSecret.value).toEqual("new-value");
    expect(decryptedSecret.comment).toEqual(secret.comment);

    // list secret should have updated value
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          value: "new-value",
          type: SecretType.Shared
        })
      ])
    );

    await deleteSecret({ path, key: secret.key, token: serviceToken });
  });

  test.each(testSecrets)("Delete secret in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, path, ...secret, token: serviceToken });
    const deletedSecret = await deleteSecret({ path, key: secret.key, token: serviceToken });
    const decryptedSecret = decryptSecret(projectKey, deletedSecret);
    expect(decryptedSecret.key).toEqual(secret.key);

    // shared secret deletion should delete personal ones also
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          type: SecretType.Shared
        })
      ])
    );
  });

  test.each(testSecrets)("Bulk create secrets in path $path", async ({ secret, path }) => {
    const createSharedSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: path,
        secrets: Array.from(Array(5)).map((_e, i) => ({
          secretName: `BULK-${secret.key}-${i + 1}`,
          ...encryptSecret(projectKey, `BULK-${secret.key}-${i + 1}`, secret.value, secret.comment)
        }))
      }
    });
    expect(createSharedSecRes.statusCode).toBe(200);
    const createSharedSecPayload = JSON.parse(createSharedSecRes.payload);
    expect(createSharedSecPayload).toHaveProperty("secrets");

    // bulk ones should exist
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining(
        Array.from(Array(5)).map((_e, i) =>
          expect.objectContaining({
            key: `BULK-${secret.key}-${i + 1}`,
            type: SecretType.Shared
          })
        )
      )
    );

    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        deleteSecret({ path, token: serviceToken, key: `BULK-${secret.key}-${i + 1}` })
      )
    );
  });

  test.each(testSecrets)("Bulk create fail on existing secret in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, ...secret, key: `BULK-${secret.key}-1`, path, token: serviceToken });

    const createSharedSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: path,
        secrets: Array.from(Array(5)).map((_e, i) => ({
          secretName: `BULK-${secret.key}-${i + 1}`,
          ...encryptSecret(projectKey, `BULK-${secret.key}-${i + 1}`, secret.value, secret.comment)
        }))
      }
    });
    expect(createSharedSecRes.statusCode).toBe(400);

    await deleteSecret({ path, key: `BULK-${secret.key}-1`, token: serviceToken });
  });

  test.each(testSecrets)("Bulk update secrets in path $path", async ({ secret, path }) => {
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        createSecret({ projectKey, token: serviceToken, ...secret, key: `BULK-${secret.key}-${i + 1}`, path })
      )
    );

    const updateSharedSecRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: path,
        secrets: Array.from(Array(5)).map((_e, i) => ({
          secretName: `BULK-${secret.key}-${i + 1}`,
          ...encryptSecret(projectKey, `BULK-${secret.key}-${i + 1}`, "update-value", secret.comment)
        }))
      }
    });
    expect(updateSharedSecRes.statusCode).toBe(200);
    const updateSharedSecPayload = JSON.parse(updateSharedSecRes.payload);
    expect(updateSharedSecPayload).toHaveProperty("secrets");

    // bulk ones should exist
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining(
        Array.from(Array(5)).map((_e, i) =>
          expect.objectContaining({
            key: `BULK-${secret.key}-${i + 1}`,
            value: "update-value",
            type: SecretType.Shared
          })
        )
      )
    );
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}`, token: serviceToken })
      )
    );
  });

  test.each(testSecrets)("Bulk delete secrets in path $path", async ({ secret, path }) => {
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        createSecret({ projectKey, token: serviceToken, ...secret, key: `BULK-${secret.key}-${i + 1}`, path })
      )
    );

    const deletedSharedSecRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${serviceToken}`
      },
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: path,
        secrets: Array.from(Array(5)).map((_e, i) => ({
          secretName: `BULK-${secret.key}-${i + 1}`
        }))
      }
    });

    expect(deletedSharedSecRes.statusCode).toBe(200);
    const deletedSecretPayload = JSON.parse(deletedSharedSecRes.payload);
    expect(deletedSecretPayload).toHaveProperty("secrets");

    // bulk ones should exist
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.not.arrayContaining(
        Array.from(Array(5)).map((_e, i) =>
          expect.objectContaining({
            key: `BULK-${secret.value}-${i + 1}`,
            type: SecretType.Shared
          })
        )
      )
    );
  });
});

describe("Service token fail cases", async () => {
  test("Unauthorized secret path access", async () => {
    const serviceToken = await createServiceToken(
      [{ secretPath: "/", environment: seedData1.environment.slug }],
      ["read", "write"]
    );
    const fetchSecrets = await testServer.inject({
      method: "GET",
      url: "/api/v3/secrets",
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: "/nested/deep"
      },
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    });
    expect(fetchSecrets.statusCode).toBe(403);
    expect(fetchSecrets.json().error).toBe("PermissionDenied");
    await deleteServiceToken();
  });

  test("Unauthorized secret environment access", async () => {
    const serviceToken = await createServiceToken(
      [{ secretPath: "/", environment: seedData1.environment.slug }],
      ["read", "write"]
    );
    const fetchSecrets = await testServer.inject({
      method: "GET",
      url: "/api/v3/secrets",
      query: {
        workspaceId: seedData1.project.id,
        environment: "prod",
        secretPath: "/"
      },
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    });
    expect(fetchSecrets.statusCode).toBe(403);
    expect(fetchSecrets.json().error).toBe("PermissionDenied");
    await deleteServiceToken();
  });

  test("Unauthorized write operation", async () => {
    const serviceToken = await createServiceToken(
      [{ secretPath: "/", environment: seedData1.environment.slug }],
      ["read"]
    );
    const writeSecrets = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/NEW`,
      body: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        type: SecretType.Shared,
        secretPath: "/",
        // doesn't matter project key because this will fail before that due to read only access
        ...encryptSecret(crypto.randomBytes(16).toString("hex"), "NEW", "value", "")
      },
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    });
    expect(writeSecrets.statusCode).toBe(403);
    expect(writeSecrets.json().error).toBe("PermissionDenied");

    // but read access should still work fine
    const fetchSecrets = await testServer.inject({
      method: "GET",
      url: "/api/v3/secrets",
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: "/"
      },
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    });
    expect(fetchSecrets.statusCode).toBe(200);
    await deleteServiceToken();
  });
});
