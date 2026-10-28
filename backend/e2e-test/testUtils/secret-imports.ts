type TSecretImport = {
  id: string;
  importEnv: {
    name: string;
    slug: string;
    id: string;
  };
  importPath: string;
};

export const createSecretImport = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  isReplication?: boolean;
  secretPath: string;
  importPath: string;
  importEnv: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-imports`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      isReplication: dto.isReplication,
      path: dto.secretPath,
      import: {
        environment: dto.importEnv,
        path: dto.importPath
      }
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("secretImport");
  return payload.secretImport as TSecretImport;
};

export const deleteSecretImport = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  authToken: string;
  id: string;
}) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-imports/${dto.id}`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      path: dto.secretPath
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("secretImport");
  return payload.secretImport as TSecretImport;
};

export const listSecretImport = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/secret-imports`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    query: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      path: dto.secretPath
    }
  });

  expect(res.statusCode).toBe(200);
  const payload = JSON.parse(res.payload);
  expect(payload).toHaveProperty("secretImports");
  return payload.secretImports as TSecretImport[];
};
