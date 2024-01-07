import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { TGetImportedSecrets, TGetSecretImports, TImportedSecrets, TSecretImport } from "./types";

export const secretImportKeys = {
  getProjectSecretImports: ({ environment, projectId, path }: TGetSecretImports) =>
    [{ projectId, path, environment }, "secrets-imports"] as const,
  getSecretImportSecrets: ({
    environment,
    projectId,
    path
  }: Omit<TGetImportedSecrets, "decryptFileKey">) =>
    [{ environment, path, projectId }, "secrets-import-sec"] as const
};

const fetchSecretImport = async ({ projectId, environment, path = "/" }: TGetSecretImports) => {
  const { data } = await apiRequest.get<{ secretImports: TSecretImport[] }>(
    "/api/v1/secret-imports",
    {
      params: {
        projectId,
        environment,
        path
      }
    }
  );
  return data.secretImports;
};

export const useGetSecretImports = ({
  environment,
  path = "/",
  projectId,
  options = {}
}: TGetSecretImports & {
  options?: Omit<
    UseQueryOptions<
      TSecretImport[],
      unknown,
      TSecretImport[],
      ReturnType<typeof secretImportKeys.getProjectSecretImports>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretImportKeys.getProjectSecretImports({ environment, projectId, path }),
    enabled: Boolean(projectId) && Boolean(environment) && (options?.enabled ?? true),
    queryFn: () => fetchSecretImport({ path, projectId, environment })
  });

const fetchImportedSecrets = async (
  workspaceId: string,
  environment: string,
  directory?: string
) => {
  const { data } = await apiRequest.get<{ secrets: TImportedSecrets[] }>(
    "/api/v1/secret-imports/secrets",
    {
      params: {
        projectId: workspaceId,
        environment,
        path: directory
      }
    }
  );
  return data.secrets;
};

export const useGetImportedSecrets = ({
  environment,
  decryptFileKey,
  path,
  projectId,
  options = {}
}: TGetImportedSecrets & {
  options?: Omit<
    UseQueryOptions<
      TImportedSecrets[],
      unknown,
      TImportedSecrets[],
      ReturnType<typeof secretImportKeys.getSecretImportSecrets>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    enabled:
      Boolean(projectId) &&
      Boolean(environment) &&
      Boolean(decryptFileKey) &&
      (options?.enabled ?? true),
    queryKey: secretImportKeys.getSecretImportSecrets({
      environment,
      path,
      projectId
    }),
    queryFn: () => fetchImportedSecrets(projectId, environment, path),
    select: useCallback(
      (data: TImportedSecrets[]) => {
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
              id: encSecret.id,
              env: encSecret.environment,
              key: secretKey,
              value: secretValue,
              tags: encSecret.tags,
              comment: secretComment,
              createdAt: encSecret.createdAt,
              updatedAt: encSecret.updatedAt,
              version: encSecret.version
            };
          })
        }));
      },
      [decryptFileKey]
    )
  });
