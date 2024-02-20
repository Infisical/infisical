import { SecretType, TSecrets } from "@app/db/schemas";
import { decryptSecret, encryptSecret, getUserPrivateKey, seedData1 } from "@app/db/seed-data";
import { decryptAsymmetric, encryptAsymmetric } from "@app/lib/crypto";
import { AuthMode } from "@app/services/auth/auth-type";

const createSecret = async (dto: {
  projectKey: string;
  path: string;
  key: string;
  value: string;
  comment: string;
  type?: SecretType;
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
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createSecretReqBody
  });
  expect(createSecRes.statusCode).toBe(200);
  const createdSecretPayload = JSON.parse(createSecRes.payload);
  expect(createdSecretPayload).toHaveProperty("secret");
  return createdSecretPayload.secret;
};

const deleteSecret = async (dto: { path: string; key: string }) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
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

describe("Secret V3 Router", async () => {
  const testSecrets = [
    {
      path: "/",
      secret: {
        key: "SEC1",
        value: "something-secret",
        comment: "some comment"
      }
    },
    {
      path: "/nested1/nested2/folder",
      secret: {
        key: "NESTED-SEC1",
        value: "something-secret",
        comment: "some comment"
      }
    }
  ];

  let projectKey = "";
  let folderId = "";
  beforeAll(async () => {
    const projectKeyRes = await testServer.inject({
      method: "GET",
      url: `/api/v2/workspace/${seedData1.project.id}/encrypted-key`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    const projectKeyEncryptionDetails = JSON.parse(projectKeyRes.payload);

    const userInfoRes = await testServer.inject({
      method: "GET",
      url: "/api/v2/users/me",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });
    const { user: userInfo } = JSON.parse(userInfoRes.payload);
    const privateKey = await getUserPrivateKey(seedData1.password, userInfo);
    projectKey = decryptAsymmetric({
      ciphertext: projectKeyEncryptionDetails.encryptedKey,
      nonce: projectKeyEncryptionDetails.nonce,
      publicKey: projectKeyEncryptionDetails.sender.publicKey,
      privateKey
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

  const getSecrets = async (environment: string, secretPath = "/") => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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
    const createdSecret = await createSecret({ projectKey, path, ...secret });
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
    await deleteSecret({ path, key: secret.key });
  });

  test.each(testSecrets)("Get secret by name in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, path, ...secret });

    const getSecByNameRes = await testServer.inject({
      method: "GET",
      url: `/api/v3/secrets/${secret.key}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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

    await deleteSecret({ path, key: secret.key });
  });

  test.each(testSecrets)("Creating personal secret without shared throw error in path $path", async ({ secret }) => {
    const createSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Personal,
      ...encryptSecret(projectKey, "SEC2", secret.value, secret.comment)
    };
    const createSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/SEC2`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: createSecretReqBody
    });
    const payload = JSON.parse(createSecRes.payload);
    expect(createSecRes.statusCode).toBe(400);
    expect(payload.error).toEqual("BadRequest");
    expect(payload.message).toEqual("Failed to create personal secret override for no corresponding shared secret");
  });

  test.each(testSecrets)("Creating personal secret in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, path, ...secret });

    const createSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Personal,
      secretPath: path,
      ...encryptSecret(projectKey, secret.key, "personal-value", secret.comment)
    };
    const createSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/${secret.key}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: createSecretReqBody
    });
    expect(createSecRes.statusCode).toBe(200);

    // list secrets should contain personal one and shared one
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          value: secret.value,
          type: SecretType.Shared
        }),
        expect.objectContaining({
          key: secret.key,
          value: "personal-value",
          type: SecretType.Personal
        })
      ])
    );

    await deleteSecret({ path, key: secret.key });
  });

  test.each(testSecrets)("Update secret in path $path", async ({ path, secret }) => {
    await createSecret({ projectKey, path, ...secret });
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
        authorization: `Bearer ${jwtAuthToken}`
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

    await deleteSecret({ path, key: secret.key });
  });

  test.each(testSecrets)("Delete secret in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, path, ...secret });
    const deletedSecret = await deleteSecret({ path, key: secret.key });
    const decryptedSecret = decryptSecret(projectKey, deletedSecret);
    expect(decryptedSecret.key).toEqual(secret.key);

    // shared secret deletion should delete personal ones also
    const secrets = await getSecrets(seedData1.environment.slug, path);
    expect(secrets).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          key: secret.key,
          type: SecretType.Shared
        }),
        expect.objectContaining({
          key: secret.key,
          type: SecretType.Personal
        })
      ])
    );
  });

  test.each(testSecrets)(
    "Deleting personal one should not delete shared secret in path $path",
    async ({ secret, path }) => {
      await createSecret({ projectKey, path, ...secret }); // shared one
      await createSecret({ projectKey, path, ...secret, type: SecretType.Personal });

      // shared secret deletion should delete personal ones also
      const secrets = await getSecrets(seedData1.environment.slug, path);
      expect(secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: secret.key,
            type: SecretType.Shared
          }),
          expect.not.objectContaining({
            key: secret.key,
            type: SecretType.Personal
          })
        ])
      );
      await deleteSecret({ path, key: secret.key });
    }
  );

  test.each(testSecrets)("Bulk create secrets in path $path", async ({ secret, path }) => {
    const createSharedSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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

    await Promise.all(Array.from(Array(5)).map((_e, i) => deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}` })));
  });

  test.each(testSecrets)("Bulk create fail on existing secret in path $path", async ({ secret, path }) => {
    await createSecret({ projectKey, ...secret, key: `BULK-${secret.key}-1`, path });

    const createSharedSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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

    await deleteSecret({ path, key: `BULK-${secret.key}-1` });
  });

  test.each(testSecrets)("Bulk update secrets in path $path", async ({ secret, path }) => {
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        createSecret({ projectKey, ...secret, key: `BULK-${secret.key}-${i + 1}`, path })
      )
    );

    const updateSharedSecRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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
    await Promise.all(Array.from(Array(5)).map((_e, i) => deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}` })));
  });

  test.each(testSecrets)("Bulk delete secrets in path $path", async ({ secret, path }) => {
    await Promise.all(
      Array.from(Array(5)).map((_e, i) =>
        createSecret({ projectKey, ...secret, key: `BULK-${secret.key}-${i + 1}`, path })
      )
    );

    const deletedSharedSecRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v3/secrets/batch`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
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

const createRawSecret = async (dto: {
  path: string;
  key: string;
  value: string;
  comment: string;
  type?: SecretType;
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
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createSecretReqBody
  });
  expect(createSecRes.statusCode).toBe(200);
  const createdSecretPayload = JSON.parse(createSecRes.payload);
  expect(createdSecretPayload).toHaveProperty("secret");
  return createdSecretPayload.secret;
};

const deleteRawSecret = async (dto: { path: string; key: string }) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
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

// raw secret endpoints
describe.each([{ auth: AuthMode.JWT }, { auth: AuthMode.IDENTITY_ACCESS_TOKEN }])(
  "Secret V3 Raw Router - $auth mode",
  async ({ auth }) => {
    let folderId = "";
    let authToken = "";
    const testRawSecrets = [
      {
        path: "/",
        secret: {
          key: "RAW-SEC1",
          value: "something-secret",
          comment: "some comment"
        }
      },
      {
        path: "/nested1/nested2/folder",
        secret: {
          key: "NESTED-RAW-SEC1",
          value: "something-secret",
          comment: "some comment"
        }
      }
    ];

    beforeAll(async () => {
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

      if (auth === AuthMode.JWT) {
        authToken = jwtAuthToken;
      } else if (auth === AuthMode.IDENTITY_ACCESS_TOKEN) {
        const identityLogin = await testServer.inject({
          method: "POST",
          url: "/api/v1/auth/universal-auth/login",
          body: {
            clientSecret: seedData1.machineIdentity.clientCredentials.secret,
            clientId: seedData1.machineIdentity.clientCredentials.id
          }
        });
        expect(identityLogin.statusCode).toBe(200);
        authToken = identityLogin.json().accessToken;
      }
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

    const getSecrets = async (environment: string, secretPath = "/") => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v3/secrets/raw`,
        headers: {
          authorization: `Bearer ${authToken}`
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
          authorization: `Bearer ${authToken}`
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

      await deleteRawSecret({ path, key: secret.key });
    });

    test.each(testRawSecrets)("Get secret by name raw in path $path", async ({ secret, path }) => {
      await createRawSecret({ path, ...secret });

      const getSecByNameRes = await testServer.inject({
        method: "GET",
        url: `/api/v3/secrets/raw/${secret.key}`,
        headers: {
          authorization: `Bearer ${authToken}`
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

      await deleteRawSecret({ path, key: secret.key });
    });

    test.each(testRawSecrets)("List secret raw in path $path", async ({ secret, path }) => {
      await Promise.all(
        Array.from(Array(5)).map((_e, i) => createRawSecret({ path, ...secret, key: `BULK-${secret.key}-${i + 1}` }))
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
        Array.from(Array(5)).map((_e, i) => deleteRawSecret({ path, key: `BULK-${secret.key}-${i + 1}` }))
      );
    });

    test.each(testRawSecrets)("Update secret raw in path $path", async ({ secret, path }) => {
      await createRawSecret({ path, ...secret });

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
          authorization: `Bearer ${authToken}`
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

      await deleteRawSecret({ path, key: secret.key });
    });

    test.each(testRawSecrets)("Delete secret raw in path $path", async ({ path, secret }) => {
      await createRawSecret({ path, ...secret });

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
          authorization: `Bearer ${authToken}`
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
  }
);

describe("Secret V3 Raw Router Without E2EE enabled", async () => {
  const secret = {
    key: "RAW-SEC-1",
    value: "something-secret",
    comment: "some comment"
  };

  test("Create secret raw", async () => {
    const createSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretValue: secret.value,
      secretComment: secret.comment
    };
    const createSecRes = await testServer.inject({
      method: "POST",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: createSecretReqBody
    });
    expect(createSecRes.statusCode).toBe(400);
  });

  test("Update secret raw", async () => {
    const updateSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared,
      secretValue: "new-value"
    };
    const updateSecRes = await testServer.inject({
      method: "PATCH",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: updateSecretReqBody
    });
    expect(updateSecRes.statusCode).toBe(400);
  });

  test("Delete secret raw", async () => {
    const deletedSecretReqBody = {
      workspaceId: seedData1.project.id,
      environment: seedData1.environment.slug,
      type: SecretType.Shared
    };
    const deletedSecRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v3/secrets/raw/${secret.key}`,
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: deletedSecretReqBody
    });
    expect(deletedSecRes.statusCode).toBe(400);
  });
});
