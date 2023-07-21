import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { TGetImportedSecrets, TImportedSecrets, TSecretImports } from "./types";

export const secretImportKeys = {
  getProjectSecretImports: (workspaceId: string, env: string | string[], folderId?: string) => [
    { workspaceId, env, folderId },
    "secrets-imports"
  ],
  getSecretImportSecrets: (workspaceId: string, env: string | string[], folderId?: string) => [
    { workspaceId, env, folderId },
    "secrets-import-sec"
  ]
};

const fetchSecretImport = async (workspaceId: string, environment: string, folderId?: string) => {
  const { data } = await apiRequest.get<{ secretImport: TSecretImports }>(
    "/api/v1/secret-imports",
    {
      params: {
        workspaceId,
        environment,
        folderId
      }
    }
  );
  return data.secretImport;
};

export const useGetSecretImports = (workspaceId: string, env: string, folderId?: string) =>
  useQuery({
    enabled: Boolean(workspaceId) && Boolean(env),
    queryKey: secretImportKeys.getProjectSecretImports(workspaceId, env, folderId),
    queryFn: () => fetchSecretImport(workspaceId, env, folderId)
  });

const fetchImportedSecrets = async (
  workspaceId: string,
  environment: string,
  folderId?: string
) => {
  const { data } = await apiRequest.get<{ secrets: TImportedSecrets }>(
    "/api/v1/secret-imports/secrets",
    {
      params: {
        workspaceId,
        environment,
        folderId
      }
    }
  );
  return data.secrets;
};

export const useGetImportedSecrets = ({
  workspaceId,
  environment,
  folderId,
  decryptFileKey
}: TGetImportedSecrets) =>
  useQuery({
    enabled: Boolean(workspaceId) && Boolean(environment) && Boolean(decryptFileKey),
    queryKey: secretImportKeys.getSecretImportSecrets(workspaceId, environment, folderId),
    queryFn: () => fetchImportedSecrets(workspaceId, environment, folderId),
    select: useCallback(
      (data: TImportedSecrets) => {
        const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
        const latestKey = decryptFileKey;
        const key = decryptAssymmetric({
          ciphertext: latestKey.encryptedKey,
          nonce: latestKey.nonce,
          publicKey: latestKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });

        return data.map((el) => ({
          environment: el.environment,
          secretPath: el.secretPath,
          folderId: el.folderId,
          secrets: el.secrets.map((encSecret) => {
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

            return {
              _id: encSecret._id,
              env: encSecret.environment,
              key: secretKey,
              value: secretValue,
              tags: encSecret.tags,
              comment: secretComment,
              createdAt: encSecret.createdAt,
              updatedAt: encSecret.updatedAt
            };
          })
        }));
      },
      [decryptFileKey]
    )
  });
