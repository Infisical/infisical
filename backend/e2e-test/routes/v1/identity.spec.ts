import { SecretType } from "@app/db/schemas";
import { getUserPrivateKey, seedData1 } from "@app/db/seed-data";
import { decryptAsymmetric, encryptAsymmetric } from "@app/lib/crypto";

const createRawSecret = async (dto: {
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
    secretValue: dto.value,
    secretComment: dto.comment,
    secretPath: dto.path
  };
  const createSecRes = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${dto.key}`,
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

const deleteRawSecret = async (dto: { path: string; key: string; token: string }) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${dto.key}`,
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

describe("Identity token secret ops", async () => {
  let identityToken = "";
  let folderId = "";
  beforeAll(async () => {
    // enable bot
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v2/workspace/${seedData1.project.id}/encrypted-key`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(res.statusCode).toEqual(200);
    const projectKeyEnc = JSON.parse(res.payload);

    const userInfoRes = await testServer.inject({
      method: "GET",
      url: "/api/v2/users/me",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(userInfoRes.statusCode).toEqual(200);
    const { user: userInfo } = JSON.parse(userInfoRes.payload);

    const privateKey = await getUserPrivateKey(seedData1.password, userInfo);
    const projectKey = decryptAsymmetric({
      ciphertext: projectKeyEnc.encryptedKey,
      nonce: projectKeyEnc.nonce,
      publicKey: projectKeyEnc.sender.publicKey,
      privateKey
    });

    const projectBotRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/bot/${seedData1.project.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(projectBotRes.statusCode).toEqual(200);
    const projectBot = JSON.parse(projectBotRes.payload).bot;
    const botKey = encryptAsymmetric(projectKey, projectBot.publicKey, privateKey);

    // set bot as active
    const setBotActive = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/bot/${projectBot.id}/active`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        isActive: true,
        workspaceId: seedData1.project.id,
        botKey: {
          encryptedKey: botKey.ciphertext,
          nonce: botKey.nonce
        }
      }
    });
    expect(setBotActive.statusCode).toEqual(200);

    // set identity token
    const identityLogin = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/universal-auth/login",
      body: {
        clientSecret: seedData1.machineIdentity.clientCredentials.secret,
        clientId: seedData1.machineIdentity.clientCredentials.id
      }
    });
    expect(identityLogin.statusCode).toBe(200);
    identityToken = identityLogin.json().accessToken;

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
    const projectBotRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/bot/${seedData1.project.id}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    expect(projectBotRes.statusCode).toEqual(200);
    const projectBot = JSON.parse(projectBotRes.payload).bot;

    // set bot as inactive
    const setBotInActive = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/bot/${projectBot.id}/active`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        isActive: false,
        workspaceId: seedData1.project.id
      }
    });
    expect(setBotInActive.statusCode).toEqual(200);

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

  const testRawSecrets = [
    {
      path: "/",
      secret: {
        key: "ID-SEC",
        value: "something-secret",
        comment: "some comment"
      }
    },
    {
      path: "/nested1/nested2/folder",
      secret: {
        key: "NESTED-ID-SEC",
        value: "something-secret",
        comment: "some comment"
      }
    }
  ];

  const getSecrets = async (environment: string, secretPath = "/") => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets/raw`,
      headers: {
        authorization: `Bearer ${identityToken}`
      },
      query: {
        secretPath,
        environment,
        workspaceId: seedData1.project.id
      }
    });
    const secrets: { secretKey: string; secretValue: string; type: SecretType; version: number }[] =
      JSON.parse(res.payload).secrets || [];
    return secrets.map((el) => ({ key: el.secretKey, value: el.secretValue, type: el.type, version: el.version }));
  };

  test.each(testRawSecrets)("Create secret raw in path $path", async ({ secret, path }) => {
    const createSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretValue: secret.value,
      secretComment: secret.comment,
      secretPath: path
    };
    const createSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${identityToken}`
      },
      body: createSecretReqBody
    });
    expect(createSecRes.statusCode).toBe(200);
    const createdSecretPayload = JSON.parse(createSecRes.payload);
    expect(createdSecretPayload).toHaveProperty("secret");

    // fetch secrets
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

    await deleteRawSecret({ path, key: secret.key, token: identityToken });
  });

  test.each(testRawSecrets)("Get secret by name raw in path $path", async ({ secret, path }) => {
    await createRawSecret({ path, ...secret, token: identityToken });

    const getSecByNameRes = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${identityToken}`
      },
      query: {
        workspaceId: seedData1.project.id,
        environment: seedData1.environment.slug,
        secretPath: path
      }
    });
    expect(getSecByNameRes.statusCode).toBe(200);
    const secretPayload = JSON.parse(getSecByNameRes.payload);
    expect(secretPayload).toHaveProperty("secret");
    expect(secretPayload.secret).toEqual(
      expect.objectContaining({
        secretKey: secret.key,
        secretValue: secret.value
      })
    );

    await deleteRawSecret({ path, key: secret.key, token: identityToken });
  });

  test.each(testRawSecrets)("List secret raw in path $path", async ({ secret, path }) => {
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        createRawSecret({ path, token: identityToken, ...secret, key: `BULK-${secret.key}-${i + 1}` })
      )
    );

    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets.length).toEqual(5);
    expect(secrets).toEqual(
      expect.arrayContaining(
        Array.from(Array(5)).map((_e, i) =>
          expect.objectContaining({ value: expect.any(String), key: `BULK-${secret.key}-${i + 1}` })
        )
      )
    );

    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        deleteRawSecret({ path, token: identityToken, key: `BULK-${secret.key}-${i + 1}` })
      )
    );
  });

  test.each(testRawSecrets)("Update secret raw in path $path", async ({ secret, path }) => {
    await createRawSecret({ path, ...secret, token: identityToken });

    const updateSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretValue: "new-value",
      secretPath: path
    };
    const updateSecRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${identityToken}`
      },
      body: updateSecretReqBody
    });
    expect(updateSecRes.statusCode).toBe(200);
    const updatedSecretPayload = JSON.parse(updateSecRes.payload);
    expect(updatedSecretPayload).toHaveProperty("secret");

    // fetch secrets
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          value: "new-value",
          version: 2,
          type: SecretType.Shared
        })
      ])
    );

    await deleteRawSecret({ path, key: secret.key, token: identityToken });
  });

  test.each(testRawSecrets)("Delete secret raw in path $path", async ({ path, secret }) => {
    await createRawSecret({ path, ...secret, token: identityToken });

    const deletedSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretPath: path
    };
    const deletedSecRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${identityToken}`
      },
      body: deletedSecretReqBody
    });
    expect(deletedSecRes.statusCode).toBe(200);
    const deletedSecretPayload = JSON.parse(deletedSecRes.payload);
    expect(deletedSecretPayload).toHaveProperty("secret");

    // fetch secrets
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual([]);
  });
});
