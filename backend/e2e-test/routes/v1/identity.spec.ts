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

describe("Secret operations with Identity token", async () => {
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

  const secretTestCases = [
    {
      path: "/",
      secret: {
        key: "secret-key-1",
        value: "something-secret",
        comment: "some comment"
      }
    },
    {
      path: "/nested1/nested2/folder",
      secret: {
        key: "secret-key-2",
        value: `-----BEGIN PRIVATE KEY-----
        MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCa6eeFk+cMVqFn
        hoVQDYgn2Ptp5Azysr2UPq6P73pCL9BzUtOXKZROqDyGehzzfg3wE2KdYU1Jk5Uq
        fP0ZOWDIlM2SaVCSI3FW32o5+ZiggjpqcVdLFc/PS0S/ZdSmpPd8h11iO2brtIAI
        ugTW8fcKlGSNUwx9aFmE7A6JnTRliTxB1l6QaC+YAwTK39VgeVH2gDSWC407aS15
        QobAkaBKKmFkzB5D7i2ZJwt+uXJV/rbLmyDmtnw0lubciGn7NX9wbYef180fisqT
        aPNAz0nPKk0fFH2Wd5MZixNGbrrpDA+FCYvI5doThZyT2hpj08qWP07oXXCAqw46
        IEupNSILAgMBAAECggEBAIJb5KzeaiZS3B3O8G4OBQ5rJB3WfyLYUHnoSWLsBbie
        nc392/ovThLmtZAAQE6SO85Tsb93+t64Z2TKqv1H8G658UeMgfWIB78v4CcLJ2mi
        TN/3opqXrzjkQOTDHzBgT7al/mpETHZ6fOdbCemK0fVALGFUioUZg4M8VXtuI4Jw
        q28jAyoRKrCrzda4BeQ553NZ4G5RvwhX3O2I8B8upTbt5hLcisBKy8MPLYY5LUFj
        YKAP+raf6QLliP6KYHuVxUlgzxjLTxVG41etcyqqZF+foyiKBO3PU3n8oh++tgQP
        ExOxiR0JSkBG5b+oOBD0zxcvo3/SjBHn0dJOZCSU2SkCgYEAyCe676XnNyBZMRD7
        6trsaoiCWBpA6M8H44+x3w4cQFtqV38RyLy60D+iMKjIaLqeBbnay61VMzo24Bz3
        EuF2n4+9k/MetLJ0NCw8HmN5k0WSMD2BFsJWG8glVbzaqzehP4tIclwDTYc1jQVt
        IoV2/iL7HGT+x2daUwbU5kN5hK0CgYEAxiLB+fmjxJW7VY4SHDLqPdpIW0q/kv4K
        d/yZBrCX799vjmFb9vLh7PkQUfJhMJ/ttJOd7EtT3xh4mfkBeLfHwVU0d/ahbmSH
        UJu/E9ZGxAW3PP0kxHZtPrLKQwBnfq8AxBauIhR3rPSorQTIOKtwz1jMlHFSUpuL
        3KeK2YfDYJcCgYEAkQnJOlNcAuRb/WQzSHIvktssqK8NjiZHryy3Vc0hx7j2jES2
        HGI2dSVHYD9OSiXA0KFm3OTTsnViwm/60iGzFdjRJV6tR39xGUVcoyCuPnvRfUd0
        PYvBXgxgkYpyYlPDcwp5CvWGJy3tLi1acgOIwIuUr3S38sL//t4adGk8q1kCgYB8
        Jbs1Tl53BvrimKpwUNbE+sjrquJu0A7vL68SqgQJoQ7dP9PH4Ff/i+/V6PFM7mib
        BQOm02wyFbs7fvKVGVJoqWK+6CIucX732x7W5yRgHtS5ukQXdbzt1Ek3wkEW98Cb
        HTruz7RNAt/NyXlLSODeit1lBbx3Vk9EaxZtRsv88QKBgGn7JwXgez9NOyobsNIo
        QVO80rpUeenSjuFi+R0VmbLKe/wgAQbYJ0xTAsQ0btqViMzB27D6mJyC+KUIwWNX
        MN8a+m46v4kqvZkKL2c4gmDibyURNe/vCtCHFuanJS/1mo2tr4XDyEeiuK52eTd9
        omQDpP86RX/hIIQ+JyLSaWYa
        -----END PRIVATE KEY-----`,
        comment:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation"
      }
    },
    {
      path: "/nested1/nested2/folder",
      secret: {
        key: "secret-key-3",
        value:
          "TG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQsIGNvbnNlY3RldHVyIGFkaXBpc2NpbmcgZWxpdC4gU2VkIGRvIGVpdXNtb2QgdGVtcG9yIGluY2lkaWR1bnQgdXQgbGFib3JlIGV0IGRvbG9yZSBtYWduYSBhbGlxdWEuIFV0IGVuaW0gYWQgbWluaW0gdmVuaWFtLCBxdWlzIG5vc3RydWQgZXhlcmNpdGF0aW9uCg==",
        comment: ""
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

  test.each(secretTestCases)("Create raw secret", async ({ secret, path }) => {
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

  test.each(secretTestCases)("Fetch raw secret by name", async ({ secret, path }) => {
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

  test.each(secretTestCases)("List secret raw in path $path", async ({ secret, path }) => {
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

  test.each(secretTestCases)("Update raw secret", async ({ secret, path }) => {
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

  test.each(secretTestCases)("Delete raw secret", async ({ path, secret }) => {
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
