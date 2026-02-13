import { SecretType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AuthMode } from "@app/services/auth/auth-type";

type TRawSecret = {
  secretKey: string;
  secretValue: string;
  secretComment?: string;
  version: number;
};

const createSecret = async (dto: { path: string; key: string; value: string; comment: string; type?: SecretType }) => {
  const createSecretReqBody = {
    projectId: seedData1.projectV3.id,
    environment: seedData1.environment.slug,
    type: dto.type || SecretType.Shared,
    secretPath: dto.path,
    secretKey: dto.key,
    secretValue: dto.value,
    secretComment: dto.comment
  };
  const createSecRes = await testServer.inject({
    method: "POST",
    url: `/api/v4/secrets/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: createSecretReqBody
  });
  expect(createSecRes.statusCode).toBe(200);
  const createdSecretPayload = JSON.parse(createSecRes.payload);
  expect(createdSecretPayload).toHaveProperty("secret");
  return createdSecretPayload.secret as TRawSecret;
};

const deleteSecret = async (dto: { path: string; key: string }) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v4/secrets/${dto.key}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId: seedData1.projectV3.id,
      environment: seedData1.environment.slug,
      secretPath: dto.path
    }
  });
  expect(deleteSecRes.statusCode).toBe(200);
  const updatedSecretPayload = JSON.parse(deleteSecRes.payload);
  expect(updatedSecretPayload).toHaveProperty("secret");
  return updatedSecretPayload.secret as TRawSecret;
};

describe.each([{ auth: AuthMode.JWT }, { auth: AuthMode.IDENTITY_ACCESS_TOKEN }])(
  "Secret V4 - $auth mode",
  async ({ auth }) => {
    let folderId = "";
    let authToken = "";
    const secretTestCases = [
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
      },
      {
        path: "/",
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

    beforeAll(async () => {
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
      // create a deep folder
      const folderCreate = await testServer.inject({
        method: "POST",
        url: `/api/v2/folders`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
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
        url: `/api/v2/folders/${folderId}`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          path: "/nested1/nested2"
        }
      });
      expect(deleteFolder.statusCode).toBe(200);
    });

    const getSecrets = async (
      environment: string,
      secretPath = "/",
      includeImports?: boolean,
      includePersonalOverrides?: boolean
    ) => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v4/secrets`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        query: {
          ...(includeImports !== undefined ? { includeImports: String(includeImports) } : {}),
          ...(includePersonalOverrides !== undefined
            ? { includePersonalOverrides: String(includePersonalOverrides) }
            : {}),
          secretPath,
          environment,
          projectId: seedData1.projectV3.id
        }
      });
      const secrets: TRawSecret[] = JSON.parse(res.payload).secrets || [];
      return secrets;
    };

    test.each(secretTestCases)("Create secret in path $path", async ({ secret, path }) => {
      const createdSecret = await createSecret({ path, ...secret });
      expect(createdSecret.secretKey).toEqual(secret.key);
      expect(createdSecret.secretValue).toEqual(secret.value);
      expect(createdSecret.secretComment || "").toEqual(secret.comment);
      expect(createdSecret.version).toEqual(1);

      const secrets = await getSecrets(seedData1.environment.slug, path, false);
      expect(secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: secret.key,
            secretValue: secret.value,
            type: SecretType.Shared
          })
        ])
      );
      await deleteSecret({ path, key: secret.key });
    });

    test.each(secretTestCases)("Get secret by name in path $path", async ({ secret, path }) => {
      await createSecret({ path, ...secret });

      const getSecByNameRes = await testServer.inject({
        method: "GET",
        url: `/api/v4/secrets/${secret.key}`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        query: {
          secretPath: path,
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug
        }
      });
      expect(getSecByNameRes.statusCode).toBe(200);
      const getSecretByNamePayload = JSON.parse(getSecByNameRes.payload);
      expect(getSecretByNamePayload).toHaveProperty("secret");
      const decryptedSecret = getSecretByNamePayload.secret as TRawSecret;
      expect(decryptedSecret.secretKey).toEqual(secret.key);
      expect(decryptedSecret.secretValue).toEqual(secret.value);
      expect(decryptedSecret.secretComment || "").toEqual(secret.comment);

      await deleteSecret({ path, key: secret.key });
    });

    if (auth === AuthMode.JWT) {
      test.each(secretTestCases)(
        "Creating personal secret without shared throw error in path $path",
        async ({ secret }) => {
          const createSecretReqBody = {
            projectId: seedData1.projectV3.id,
            environment: seedData1.environment.slug,
            type: SecretType.Personal,
            secretKey: secret.key,
            secretValue: secret.value,
            secretComment: secret.comment
          };
          const createSecRes = await testServer.inject({
            method: "POST",
            url: `/api/v4/secrets/SEC2`,
            headers: {
              authorization: `Bearer ${authToken}`
            },
            body: createSecretReqBody
          });
          const payload = JSON.parse(createSecRes.payload);
          expect(createSecRes.statusCode).toBe(400);
          expect(payload.error).toEqual("BadRequest");
        }
      );

      test.each(secretTestCases)("Creating personal secret in path $path", async ({ secret, path }) => {
        await createSecret({ path, ...secret });

        const createSecretReqBody = {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          type: SecretType.Personal,
          secretPath: path,
          secretKey: secret.key,
          secretValue: "personal-value",
          secretComment: secret.comment
        };
        const createSecRes = await testServer.inject({
          method: "POST",
          url: `/api/v4/secrets/${secret.key}`,
          headers: {
            authorization: `Bearer ${authToken}`
          },
          body: createSecretReqBody
        });
        expect(createSecRes.statusCode).toBe(200);

        // list secrets should contain only the personal secret (v4)
        const secrets = await getSecrets(seedData1.environment.slug, path, false, true);
        expect(secrets).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              secretKey: secret.key,
              secretValue: "personal-value",
              type: SecretType.Personal
            })
          ])
        );

        await deleteSecret({ path, key: secret.key });
      });

      test.each(secretTestCases)(
        "Deleting personal one should not delete shared secret in path $path",
        async ({ secret, path }) => {
          await createSecret({ path, ...secret }); // shared one
          await createSecret({ path, ...secret, type: SecretType.Personal });

          const sharedSecrets = await getSecrets(seedData1.environment.slug, path, false, false);
          const personalSecrets = await getSecrets(seedData1.environment.slug, path, false, true);
          expect(sharedSecrets).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                secretKey: secret.key,
                type: SecretType.Shared
              })
            ])
          );

          expect(personalSecrets).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                secretKey: secret.key,
                type: SecretType.Personal
              })
            ])
          );
          await deleteSecret({ path, key: secret.key });
        }
      );
    }

    test.each(secretTestCases)("Update secret in path $path", async ({ path, secret }) => {
      await createSecret({ path, ...secret });
      const updateSecretReqBody = {
        projectId: seedData1.projectV3.id,
        environment: seedData1.environment.slug,
        type: SecretType.Shared,
        secretPath: path,
        secretKey: secret.key,
        secretValue: "new-value",
        secretComment: secret.comment
      };
      const updateSecRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v4/secrets/${secret.key}`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: updateSecretReqBody
      });
      expect(updateSecRes.statusCode).toBe(200);
      const updatedSecretPayload = JSON.parse(updateSecRes.payload);
      expect(updatedSecretPayload).toHaveProperty("secret");
      const decryptedSecret = updatedSecretPayload.secret;
      expect(decryptedSecret.secretKey).toEqual(secret.key);
      expect(decryptedSecret.secretValue).toEqual("new-value");
      expect(decryptedSecret.secretComment || "").toEqual(secret.comment);

      // list secret should have updated value
      const secrets = await getSecrets(seedData1.environment.slug, path, false, false);
      expect(secrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: secret.key,
            secretValue: "new-value",
            type: SecretType.Shared
          })
        ])
      );

      await deleteSecret({ path, key: secret.key });
    });

    test.each(secretTestCases)("Delete secret in path $path", async ({ secret, path }) => {
      await createSecret({ path, ...secret });
      const deletedSecret = await deleteSecret({ path, key: secret.key });
      expect(deletedSecret.secretKey).toEqual(secret.key);

      // shared secret deletion should delete personal ones also
      const sharedSecrets = await getSecrets(seedData1.environment.slug, path, false);
      const personalSecrets = await getSecrets(seedData1.environment.slug, path, false, true);

      expect(sharedSecrets).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({
            secretKey: secret.key,
            type: SecretType.Shared
          })
        ])
      );

      expect(personalSecrets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            secretKey: secret.key,
            type: SecretType.Personal
          })
        ])
      );
    });

    test.each(secretTestCases)("Bulk create secrets in path $path", async ({ secret, path }) => {
      const createSharedSecRes = await testServer.inject({
        method: "POST",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          secretPath: path,
          secrets: Array.from(Array(5)).map((_e, i) => ({
            secretKey: `BULK-${secret.key}-${i + 1}`,
            secretValue: secret.value,
            secretComment: secret.comment
          }))
        }
      });
      expect(createSharedSecRes.statusCode).toBe(200);
      const createSharedSecPayload = JSON.parse(createSharedSecRes.payload);
      expect(createSharedSecPayload).toHaveProperty("secrets");

      // bulk ones should exist
      const secrets = await getSecrets(seedData1.environment.slug, path, false);
      expect(secrets).toEqual(
        expect.arrayContaining(
          Array.from(Array(5)).map((_e, i) =>
            expect.objectContaining({
              secretKey: `BULK-${secret.key}-${i + 1}`,
              secretValue: secret.value,
              type: SecretType.Shared
            })
          )
        )
      );

      await Promise.all(
        Array.from(Array(5)).map((_e, i) => deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}` }))
      );
    });

    test.each(secretTestCases)("Bulk create fail on existing secret in path $path", async ({ secret, path }) => {
      await createSecret({ ...secret, key: `BULK-${secret.key}-1`, path });

      const createSharedSecRes = await testServer.inject({
        method: "POST",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          secretPath: path,
          secrets: Array.from(Array(5)).map((_e, i) => ({
            secretKey: `BULK-${secret.key}-${i + 1}`,
            secretValue: secret.value,
            secretComment: secret.comment
          }))
        }
      });
      expect(createSharedSecRes.statusCode).toBe(400);

      await deleteSecret({ path, key: `BULK-${secret.key}-1` });
    });

    test.each(secretTestCases)("Bulk update secrets in path $path", async ({ secret, path }) => {
      await Promise.all(
        Array.from(Array(5)).map((_e, i) => createSecret({ ...secret, key: `BULK-${secret.key}-${i + 1}`, path }))
      );

      const updateSharedSecRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          secretPath: path,
          secrets: Array.from(Array(5)).map((_e, i) => ({
            secretKey: `BULK-${secret.key}-${i + 1}`,
            secretValue: "update-value",
            secretComment: secret.comment
          }))
        }
      });
      expect(updateSharedSecRes.statusCode).toBe(200);
      const updateSharedSecPayload = JSON.parse(updateSharedSecRes.payload);
      expect(updateSharedSecPayload).toHaveProperty("secrets");

      // bulk ones should exist
      const secrets = await getSecrets(seedData1.environment.slug, path, false);
      expect(secrets).toEqual(
        expect.arrayContaining(
          Array.from(Array(5)).map((_e, i) =>
            expect.objectContaining({
              secretKey: `BULK-${secret.key}-${i + 1}`,
              secretValue: "update-value",
              type: SecretType.Shared
            })
          )
        )
      );
      await Promise.all(
        Array.from(Array(5)).map((_e, i) => deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}` }))
      );
    });

    test.each(secretTestCases)("Bulk upsert secrets in path $path", async ({ secret, path }) => {
      const updateSharedSecRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          secretPath: path,
          mode: "upsert",
          secrets: Array.from(Array(5)).map((_e, i) => ({
            secretKey: `BULK-${secret.key}-${i + 1}`,
            secretValue: "update-value",
            secretComment: secret.comment
          }))
        }
      });
      expect(updateSharedSecRes.statusCode).toBe(200);
      const updateSharedSecPayload = JSON.parse(updateSharedSecRes.payload);
      expect(updateSharedSecPayload).toHaveProperty("secrets");

      // bulk ones should exist
      const secrets = await getSecrets(seedData1.environment.slug, path, false);
      expect(secrets).toEqual(
        expect.arrayContaining(
          Array.from(Array(5)).map((_e, i) =>
            expect.objectContaining({
              secretKey: `BULK-${secret.key}-${i + 1}`,
              secretValue: "update-value",
              type: SecretType.Shared
            })
          )
        )
      );
      await Promise.all(
        Array.from(Array(5)).map((_e, i) => deleteSecret({ path, key: `BULK-${secret.key}-${i + 1}` }))
      );
    });

    test("Bulk upsert secrets in path multiple paths", async () => {
      const firstBatchSecrets = Array.from(Array(5)).map((_e, i) => ({
        secretKey: `BULK-KEY-${secretTestCases[0].secret.key}-${i + 1}`,
        secretValue: "update-value",
        secretComment: "comment",
        secretPath: secretTestCases[0].path
      }));
      const secondBatchSecrets = Array.from(Array(5)).map((_e, i) => ({
        secretKey: `BULK-KEY-${secretTestCases[1].secret.key}-${i + 1}`,
        secretValue: "update-value",
        secretComment: "comment",
        secretPath: secretTestCases[1].path
      }));
      const testSecrets = [...firstBatchSecrets, ...secondBatchSecrets];

      const updateSharedSecRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          mode: "upsert",
          secrets: testSecrets
        }
      });
      expect(updateSharedSecRes.statusCode).toBe(200);
      const updateSharedSecPayload = JSON.parse(updateSharedSecRes.payload);
      expect(updateSharedSecPayload).toHaveProperty("secrets");

      // bulk ones should exist
      const firstBatchSecretsOnInfisical = await getSecrets(seedData1.environment.slug, secretTestCases[0].path, false);
      expect(firstBatchSecretsOnInfisical).toEqual(
        expect.arrayContaining(
          firstBatchSecrets.map((el) =>
            expect.objectContaining({
              secretKey: el.secretKey,
              secretValue: "update-value",
              type: SecretType.Shared
            })
          )
        )
      );
      const secondBatchSecretsOnInfisical = await getSecrets(
        seedData1.environment.slug,
        secretTestCases[1].path,
        false
      );
      expect(secondBatchSecretsOnInfisical).toEqual(
        expect.arrayContaining(
          secondBatchSecrets.map((el) =>
            expect.objectContaining({
              secretKey: el.secretKey,
              secretValue: "update-value",
              type: SecretType.Shared
            })
          )
        )
      );
      await Promise.all(testSecrets.map((el) => deleteSecret({ path: el.secretPath, key: el.secretKey })));
    });

    test.each(secretTestCases)("Bulk delete secrets in path $path", async ({ secret, path }) => {
      await Promise.all(
        Array.from(Array(5)).map((_e, i) => createSecret({ ...secret, key: `BULK-${secret.key}-${i + 1}`, path }))
      );

      const deletedSharedSecRes = await testServer.inject({
        method: "DELETE",
        url: `/api/v4/secrets/batch`,
        headers: {
          authorization: `Bearer ${authToken}`
        },
        body: {
          projectId: seedData1.projectV3.id,
          environment: seedData1.environment.slug,
          secretPath: path,
          secrets: Array.from(Array(5)).map((_e, i) => ({
            secretKey: `BULK-${secret.key}-${i + 1}`
          }))
        }
      });

      expect(deletedSharedSecRes.statusCode).toBe(200);
      const deletedSecretPayload = JSON.parse(deletedSharedSecRes.payload);
      expect(deletedSecretPayload).toHaveProperty("secrets");

      // bulk ones should exist
      const secrets = await getSecrets(seedData1.environment.slug, path, false);
      expect(secrets).toEqual(
        expect.not.arrayContaining(
          Array.from(Array(5)).map((_e, i) =>
            expect.objectContaining({
              secretKey: `BULK-${secret.value}-${i + 1}`,
              type: SecretType.Shared
            })
          )
        )
      );
    });
  }
);
