import { LightMyRequestResponse } from "fastify";

import { SecretType } from "@app/db/schemas";

import { request } from "./request";

type TRawSecret = {
  id: string;
  secretKey: string;
  secretValue: string;
  secretComment?: string;
  version: number;
};

const parseSecret = (res: LightMyRequestResponse) => {
  expect(res.statusCode).toBe(200);
  const payload = res.json<{ secret: TRawSecret }>();
  expect(payload).toHaveProperty("secret");
  return payload.secret;
};

type TCreateSecretV2Dto = {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  value: string;
  comment?: string;
  authToken: string;
  type?: SecretType;
};

export const createSecretV2 = (dto: TCreateSecretV2Dto) =>
  request(
    {
      method: "POST",
      url: `/api/v3/secrets/raw/${dto.key}`,
      headers: {
        authorization: `Bearer ${dto.authToken}`
      },
      body: {
        workspaceId: dto.workspaceId,
        environment: dto.environmentSlug,
        type: dto.type || SecretType.Shared,
        secretPath: dto.secretPath,
        secretKey: dto.key,
        secretValue: dto.value,
        secretComment: dto.comment
      }
    },
    parseSecret
  );

type TUpdateSecretV2Dto = {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  value?: string;
  newKey?: string;
  comment?: string;
  reminder?: { repeatDays: number; note?: string; recipients?: string[] };
  authToken: string;
  type?: SecretType;
};

export const updateSecretV2 = (dto: TUpdateSecretV2Dto) =>
  request(
    {
      method: "PATCH",
      url: `/api/v3/secrets/raw/${dto.key}`,
      headers: {
        authorization: `Bearer ${dto.authToken}`
      },
      body: {
        workspaceId: dto.workspaceId,
        environment: dto.environmentSlug,
        type: dto.type || SecretType.Shared,
        secretPath: dto.secretPath,
        secretValue: dto.value,
        newSecretName: dto.newKey,
        secretComment: dto.comment,
        secretReminderRepeatDays: dto.reminder?.repeatDays,
        secretReminderNote: dto.reminder?.note,
        secretReminderRecipients: dto.reminder?.recipients
      }
    },
    parseSecret
  );

export const deleteSecretV2 = (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  authToken: string;
}) =>
  request(
    {
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
    },
    parseSecret
  );

export const getSecretByNameV2 = (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  key: string;
  authToken: string;
}) =>
  request(
    {
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
    },
    parseSecret
  );

type TSecretsV2Payload = {
  secrets: TRawSecret[];
  imports: {
    secretPath: string;
    environment: string;
    folderId: string;
    secrets: TRawSecret[];
  }[];
};

export const getSecretsV2 = (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  authToken: string;
  recursive?: boolean;
}) =>
  request(
    {
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
        include_imports: "true",
        recursive: String(dto.recursive || false)
      }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      const payload = res.json<TSecretsV2Payload>();
      expect(payload).toHaveProperty("secrets");
      expect(payload).toHaveProperty("imports");
      return payload;
    }
  );
