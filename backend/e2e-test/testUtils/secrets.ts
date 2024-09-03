import { SecretType } from "@app/db/schemas";

type TRawSecret = {
  secretKey: string;
  secretValue: string;
  secretComment?: string;
  version: number;
};

export const createSecretV2 = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  value: string;
  comment?: string;
  authToken: string;
  type?: SecretType;
}) => {
  const createSecretReqBody = {
    workspaceId: dto.workspaceId,
    environment: dto.environmentSlug,
    type: dto.type || SecretType.Shared,
    secretPath: dto.secretPath,
    secretKey: dto.key,
    secretValue: dto.value,
    secretComment: dto.comment
  };
  const createSecRes = await testServer.inject({
    method: "POST",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: createSecretReqBody
  });
  expect(createSecRes.statusCode).toBe(200);
  const createdSecretPayload = JSON.parse(createSecRes.payload);
  expect(createdSecretPayload).toHaveProperty("secret");
  return createdSecretPayload.secret as TRawSecret;
};

export const deleteSecretV2 = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  authToken: string;
}) => {
  const deleteSecRes = await testServer.inject({
    method: "DELETE",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath
    }
  });
  expect(deleteSecRes.statusCode).toBe(200);
  const updatedSecretPayload = JSON.parse(deleteSecRes.payload);
  expect(updatedSecretPayload).toHaveProperty("secret");
  return updatedSecretPayload.secret as TRawSecret;
};

export const getSecretByNameV2 = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  authToken: string;
}) => {
  const response = await testServer.inject({
    method: "GET",
    url: `/api/v3/secrets/raw/${dto.key}`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    query: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath,
      expandSecretReferences: "true",
      include_imports: "true"
    }
  });
  expect(response.statusCode).toBe(200);
  const payload = JSON.parse(response.payload);
  expect(payload).toHaveProperty("secret");
  return payload.secret as TRawSecret;
};

export const getSecretsV2 = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  authToken: string;
}) => {
  const getSecretsResponse = await testServer.inject({
    method: "GET",
    url: `/api/v3/secrets/raw`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    query: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath,
      expandSecretReferences: "true",
      include_imports: "true"
    }
  });
  expect(getSecretsResponse.statusCode).toBe(200);
  const getSecretsPayload = JSON.parse(getSecretsResponse.payload);
  expect(getSecretsPayload).toHaveProperty("secrets");
  expect(getSecretsPayload).toHaveProperty("imports");
  return getSecretsPayload as {
    secrets: TRawSecret[];
    imports: {
      secretPath: string;
      environment: string;
      folderId: string;
      secrets: TRawSecret[];
    }[];
  };
};
