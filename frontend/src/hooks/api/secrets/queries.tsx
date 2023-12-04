/* eslint-disable no-param-reassign */
import { useCallback, useMemo } from "react";
import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { UserWsKeyPair } from "../keys/types";
import {
  DecryptedSecret,
  EncryptedSecret,
  EncryptedSecretVersion,
  GetSecretVersionsDTO,
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

export const decryptSecrets = (
  encryptedSecrets: EncryptedSecret[],
  decryptFileKey: UserWsKeyPair
) => {
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
  const key = decryptAssymmetric({
    ciphertext: decryptFileKey.encryptedKey,
    nonce: decryptFileKey.nonce,
    publicKey: decryptFileKey.sender.publicKey,
    privateKey: PRIVATE_KEY
  });

  const personalSecrets: Record<string, { id: string; value: string }> = {};
  const secrets: DecryptedSecret[] = [];
  encryptedSecrets.forEach((encSecret) => {
    const secretKey = decryptSymmetric({
      ciphertext: encSecret.secretKeyCiphertext,
      iv: encSecret.secretKeyIV,
      tag: encSecret.secretKeyTag,
      key
    });

    const secretValue = decryptSymmetric({
      ciphertext: encSecret.secretValueCiphertext,
      iv: encSecret.secretValueIV,
      tag: encSecret.secretValueTag,
      key
    });

    const secretComment = decryptSymmetric({
      ciphertext: encSecret.secretCommentCiphertext,
      iv: encSecret.secretCommentIV,
      tag: encSecret.secretCommentTag,
      key
    });

    const decryptedSecret: DecryptedSecret = {
      _id: encSecret._id,
      env: encSecret.environment,
      key: secretKey,
      value: secretValue,
      tags: encSecret.tags,
      comment: secretComment,
      reminderRepeatDays: encSecret.secretReminderRepeatDays,
      reminderNote: encSecret.secretReminderNote,
      createdAt: encSecret.createdAt,
      updatedAt: encSecret.updatedAt,
      version: encSecret.version,
      skipMultilineEncoding: encSecret.skipMultilineEncoding
    };

    if (encSecret.type === "personal") {
      personalSecrets[decryptedSecret.key] = {
        id: encSecret._id,
        value: secretValue
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

const fetchProjectEncryptedSecrets = async ({
  workspaceId,
  environment,
  secretPath
}: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<{ secrets: EncryptedSecret[] }>("/api/v3/secrets", {
    params: {
      environment,
      workspaceId,
      secretPath
    }
  });

  return data.secrets;
};
export const useGetProjectSecrets = ({
  workspaceId,
  environment,
  decryptFileKey,
  secretPath,
  options
}: TGetProjectSecretsDTO & {
  options?: Omit<
    UseQueryOptions<
      EncryptedSecret[],
      unknown,
      DecryptedSecret[],
      ReturnType<typeof secretKeys.getProjectSecret>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(decryptFileKey && workspaceId && environment) && (options?.enabled ?? true),
    queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath }),
    queryFn: async () => fetchProjectEncryptedSecrets({ workspaceId, environment, secretPath }),
    select: (secrets: EncryptedSecret[]) => decryptSecrets(secrets, decryptFileKey)
  });

export const useGetProjectSecretsAllEnv = ({
  workspaceId,
  envs,
  decryptFileKey,
  secretPath
}: TGetProjectSecretsAllEnvDTO) => {
  const secrets = useQueries({
    queries: envs.map((environment) => ({
      queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath }),
      enabled: Boolean(decryptFileKey && workspaceId && environment),
      queryFn: async () => fetchProjectEncryptedSecrets({ workspaceId, environment, secretPath }),
      select: (secs: EncryptedSecret[]) =>
        decryptSecrets(secs, decryptFileKey).reduce<Record<string, DecryptedSecret>>(
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
            id: el._id,
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
