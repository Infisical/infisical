/* eslint-disable no-param-reassign */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { secretSnapshotKeys } from "../secretSnapshots/queries";
import {
  BatchSecretDTO,
  DecryptedSecret,
  EncryptedSecret,
  EncryptedSecretVersion,
  GetProjectSecretsDTO,
  GetSecretVersionsDTO
} from "./types";

export const secretKeys = {
  // this is also used in secretSnapshot part
  getProjectSecret: (workspaceId: string, env: string | string[], folderId?: string) => [
    { workspaceId, env, folderId },
    "secrets"
  ],
  getSecretVersion: (secretId: string) => [{ secretId }, "secret-versions"]
};

const fetchProjectEncryptedSecrets = async (
  workspaceId: string,
  env: string | string[],
  folderId?: string,
  secretPath?: string
) => {
  if (typeof env === "string") {
    const { data } = await apiRequest.get<{ secrets: EncryptedSecret[] }>("/api/v2/secrets", {
      params: {
        environment: env,
        workspaceId,
        folderId: folderId || undefined,
        secretPath
      }
    });
    return data.secrets;
  }

  if (typeof env === "object") {
    let allEnvData: any = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const envPoint of env) {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await apiRequest.get<{ secrets: EncryptedSecret[] }>("/api/v2/secrets", {
        params: {
          environment: envPoint,
          workspaceId,
          folderId,
          secretPath
        }
      });
      allEnvData = allEnvData.concat(data.secrets);
    }

    return allEnvData;
    // eslint-disable-next-line no-else-return
  } else {
    return null;
  }
};

export const useGetProjectSecrets = ({
  workspaceId,
  env,
  decryptFileKey,
  isPaused,
  folderId
}: GetProjectSecretsDTO) =>
  useQuery({
    // wait for all values to be available
    enabled: Boolean(decryptFileKey && workspaceId && env) && !isPaused,
    queryKey: secretKeys.getProjectSecret(workspaceId, env, folderId),
    queryFn: () => fetchProjectEncryptedSecrets(workspaceId, env, folderId),
    select: useCallback(
      (data: EncryptedSecret[]) => {
        const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
        const latestKey = decryptFileKey;
        const key = decryptAssymmetric({
          ciphertext: latestKey.encryptedKey,
          nonce: latestKey.nonce,
          publicKey: latestKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });

        const sharedSecrets: DecryptedSecret[] = [];
        const personalSecrets: Record<string, { id: string; value: string }> = {};
        // this used for add-only mode in dashboard
        // type won't be there thus only one key is shown
        const duplicateSecretKey: Record<string, boolean> = {};
        data.forEach((encSecret: EncryptedSecret) => {
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

          const decryptedSecret = {
            _id: encSecret._id,
            env: encSecret.environment,
            key: secretKey,
            value: secretValue,
            tags: encSecret.tags,
            comment: secretComment,
            createdAt: encSecret.createdAt,
            updatedAt: encSecret.updatedAt
          };

          if (encSecret.type === "personal") {
            personalSecrets[`${decryptedSecret.key}-${decryptedSecret.env}`] = {
              id: encSecret._id,
              value: secretValue
            };
          } else {
            if (!duplicateSecretKey?.[`${decryptedSecret.key}-${decryptedSecret.env}`]) {
              sharedSecrets.push(decryptedSecret);
            }
            duplicateSecretKey[`${decryptedSecret.key}-${decryptedSecret.env}`] = true;
          }
        });
        sharedSecrets.forEach((val) => {
          const dupKey = `${val.key}-${val.env}`;
          if (personalSecrets?.[dupKey]) {
            val.idOverride = personalSecrets[dupKey].id;
            val.valueOverride = personalSecrets[dupKey].value;
            val.overrideAction = "modified";
          }
        });
        return { secrets: sharedSecrets };
      },
      [decryptFileKey]
    )
  });

export const useGetProjectSecretsByKey = ({
  workspaceId,
  env,
  decryptFileKey,
  isPaused,
  folderId,
  secretPath
}: GetProjectSecretsDTO) =>
  useQuery({
    // wait for all values to be available
    enabled: Boolean(decryptFileKey && workspaceId && env) && !isPaused,
    // right now secretpath is passed as folderid as only this is used in overview
    queryKey: secretKeys.getProjectSecret(workspaceId, env, secretPath),
    queryFn: () => fetchProjectEncryptedSecrets(workspaceId, env, folderId, secretPath),
    select: useCallback(
      (data: EncryptedSecret[]) => {
        const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
        const latestKey = decryptFileKey;
        const key = decryptAssymmetric({
          ciphertext: latestKey.encryptedKey,
          nonce: latestKey.nonce,
          publicKey: latestKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });

        const sharedSecrets: Record<string, DecryptedSecret[]> = {};
        const personalSecrets: Record<string, { id: string; value: string }> = {};
        // this used for add-only mode in dashboard
        // type won't be there thus only one key is shown
        const duplicateSecretKey: Record<string, boolean> = {};
        const uniqSecKeys: Record<string, boolean> = {};
        data.forEach((encSecret: EncryptedSecret) => {
          const secretKey = decryptSymmetric({
            ciphertext: encSecret.secretKeyCiphertext,
            iv: encSecret.secretKeyIV,
            tag: encSecret.secretKeyTag,
            key
          });
          if (!uniqSecKeys?.[secretKey]) uniqSecKeys[secretKey] = true;

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

          const decryptedSecret = {
            _id: encSecret._id,
            env: encSecret.environment,
            key: secretKey,
            value: secretValue,
            tags: encSecret.tags,
            comment: secretComment,
            createdAt: encSecret.createdAt,
            updatedAt: encSecret.updatedAt
          };

          if (encSecret.type === "personal") {
            personalSecrets[`${decryptedSecret.key}-${decryptedSecret.env}`] = {
              id: encSecret._id,
              value: secretValue
            };
          } else {
            if (!duplicateSecretKey?.[`${decryptedSecret.key}-${decryptedSecret.env}`]) {
              if (!sharedSecrets?.[secretKey]) sharedSecrets[secretKey] = [];
              sharedSecrets[secretKey].push(decryptedSecret);
            }
            duplicateSecretKey[`${decryptedSecret.key}-${decryptedSecret.env}`] = true;
          }
        });
        Object.keys(sharedSecrets).forEach((secName) => {
          sharedSecrets[secName].forEach((val) => {
            const dupKey = `${val.key}-${val.env}`;
            if (personalSecrets?.[dupKey]) {
              val.idOverride = personalSecrets[dupKey].id;
              val.valueOverride = personalSecrets[dupKey].value;
              val.overrideAction = "modified";
            }
          });
        });

        return { secrets: sharedSecrets, uniqueSecCount: Object.keys(uniqSecKeys).length };
      },
      [decryptFileKey]
    )
  });

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

export const useBatchSecretsOp = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, BatchSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post("/api/v2/secrets/batch", dto);
      return data;
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(dto.workspaceId, dto.environment, dto.folderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list(dto.workspaceId, dto.environment, dto?.folderId)
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count(dto.workspaceId, dto.environment, dto?.folderId)
      );
    }
  });
};
