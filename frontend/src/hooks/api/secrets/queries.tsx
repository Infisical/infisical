/* eslint-disable no-param-reassign */
import { useCallback, useMemo } from "react";
import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import {
  EncryptedSecretVersion,
  GetSecretVersionsDTO,
  SecretType,
  SecretV3Raw,
  SecretV3RawResponse,
  SecretV3RawSanitized,
  TGetProjectSecretsAllEnvDTO,
  TGetProjectSecretsDTO,
  TGetProjectSecretsKey
} from "./types";

export const secretKeys = {
  // this is also used in secretSnapshot part
  getProjectSecret: ({ workspaceId, environment, secretPath }: TGetProjectSecretsKey) =>
    [{ workspaceId, environment, secretPath }, "secrets"] as const,
  getSecretVersion: (secretId: string) => [{ secretId }, "secret-versions"] as const
};

export const fetchProjectSecrets = async ({
  workspaceId,
  environment,
  secretPath,
  includeImports,
  expandSecretReferences
}: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<SecretV3RawResponse>("/api/v3/secrets/raw", {
    params: {
      environment,
      workspaceId,
      secretPath,
      expandSecretReferences,
      include_imports: includeImports
    }
  });

  return data;
};

export const mergePersonalSecrets = (rawSecrets: SecretV3Raw[]) => {
  const personalSecrets: Record<string, { id: string; value: string }> = {};
  const secrets: SecretV3RawSanitized[] = [];
  rawSecrets.forEach((el) => {
    const decryptedSecret: SecretV3RawSanitized = {
      id: el.id,
      env: el.environment,
      key: el.secretKey,
      value: el.secretValue,
      tags: el.tags || [],
      comment: el.secretComment || "",
      reminderRepeatDays: el.secretReminderRepeatDays,
      reminderNote: el.secretReminderNote,
      createdAt: el.createdAt,
      updatedAt: el.updatedAt,
      version: el.version,
      skipMultilineEncoding: el.skipMultilineEncoding
    };

    if (el.type === SecretType.Personal) {
      personalSecrets[decryptedSecret.key] = {
        id: el.id,
        value: el.secretValue
      };
    } else {
      secrets.push(decryptedSecret);
    }
  });

  secrets.forEach((sec) => {
    if (personalSecrets?.[sec.key]) {
      sec.idOverride = personalSecrets[sec.key].id;
      sec.valueOverride = personalSecrets[sec.key].value;
      sec.overrideAction = "modified";
    }
  });

  return secrets;
};

export const useGetProjectSecrets = ({
  workspaceId,
  environment,
  secretPath,
  options
}: TGetProjectSecretsDTO & {
  options?: Omit<
    UseQueryOptions<
      SecretV3RawResponse,
      unknown,
      SecretV3RawSanitized[],
      ReturnType<typeof secretKeys.getProjectSecret>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(workspaceId && environment) && (options?.enabled ?? true),
    queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath }),
    queryFn: async () => fetchProjectSecrets({ workspaceId, environment, secretPath }),
    select: ({ secrets }) => mergePersonalSecrets(secrets)
  });

export const useGetProjectSecretsAllEnv = ({
  workspaceId,
  envs,
  secretPath
}: TGetProjectSecretsAllEnvDTO) => {
  const secrets = useQueries({
    queries: envs.map((environment) => ({
      queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath }),
      enabled: Boolean(workspaceId && environment),
      queryFn: async () => fetchProjectSecrets({ workspaceId, environment, secretPath }),
      select: (el: SecretV3RawResponse) =>
        mergePersonalSecrets(el.secrets).reduce<Record<string, SecretV3RawSanitized>>(
          (prev, curr) => ({ ...prev, [curr.key]: curr }),
          {}
        )
    }))
  });

  const secKeys = useMemo(() => {
    const keys = new Set<string>();
    secrets?.forEach(({ data }) => {
      // TODO(akhilmhdh): find out why this is unknown
      Object.keys(data || {}).forEach((key) => keys.add(key));
    });
    return [...keys];
  }, [(secrets || []).map((sec) => sec.data)]);

  const getEnvSecretKeyCount = useCallback(
    (env: string) => {
      const selectedEnvIndex = envs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return Object.keys(secrets[selectedEnvIndex]?.data || {}).length;
      }
      return 0;
    },
    [(secrets || []).map((sec) => sec.data)]
  );

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const selectedEnvIndex = envs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        const sec = secrets[selectedEnvIndex]?.data?.[key];
        return sec;
      }
      return undefined;
    },
    [(secrets || []).map((sec) => sec.data)]
  );

  return { data: secrets, secKeys, getSecretByKey, getEnvSecretKeyCount };
};

const fetchEncryptedSecretVersion = async (secretId: string, offset: number, limit: number) => {
  const { data } = await apiRequest.get<{ secretVersions: EncryptedSecretVersion[] }>(
    `/api/v1/secret/${secretId}/secret-versions`,
    {
      params: {
        limit,
        offset
      }
    }
  );
  return data.secretVersions;
};

export const useGetSecretVersion = (dto: GetSecretVersionsDTO) =>
  useQuery({
    enabled: Boolean(dto.secretId && dto.decryptFileKey),
    queryKey: secretKeys.getSecretVersion(dto.secretId),
    queryFn: () => fetchEncryptedSecretVersion(dto.secretId, dto.offset, dto.limit),
    select: useCallback(
      (data: EncryptedSecretVersion[]) => {
        const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
        const latestKey = dto.decryptFileKey;
        const key = decryptAssymmetric({
          ciphertext: latestKey.encryptedKey,
          nonce: latestKey.nonce,
          publicKey: latestKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });

        return data
          .map((el) => ({
            createdAt: el.createdAt,
            id: el.id,
            value: decryptSymmetric({
              ciphertext: el.secretValueCiphertext,
              iv: el.secretValueIV,
              tag: el.secretValueTag,
              key
            })
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      [dto.decryptFileKey]
    )
  });
