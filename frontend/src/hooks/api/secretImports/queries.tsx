import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { TGetImportedSecrets, TGetSecretImports, TImportedSecrets, TSecretImports } from "./types";

export const secretImportKeys = {
  getProjectSecretImports: ({ environment, workspaceId, directory }: TGetSecretImports) =>
    [{ workspaceId, directory, environment }, "secrets-imports"] as const,
  getSecretImportSecrets: ({
    workspaceId,
    environment,
    directory
  }: Omit<TGetImportedSecrets, "decryptFileKey">) =>
    [{ workspaceId, environment, directory }, "secrets-import-sec"] as const
};

const fetchSecretImport = async ({ workspaceId, environment, directory }: TGetSecretImports) => {
  const { data } = await apiRequest.get<{ secretImport: TSecretImports }>(
    "/api/v1/secret-imports",
    {
      params: {
        workspaceId,
        environment,
        directory
      }
    }
  );
  return data.secretImport;
};

export const useGetSecretImports = ({
  workspaceId,
  environment,
  directory = "/",
  options = {}
}: TGetSecretImports & {
  options?: Omit<
    UseQueryOptions<
      TSecretImports,
      unknown,
      TSecretImports,
      ReturnType<typeof secretImportKeys.getProjectSecretImports>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretImportKeys.getProjectSecretImports({ workspaceId, environment, directory }),
    enabled: Boolean(workspaceId) && Boolean(environment) && (options?.enabled ?? true),
    queryFn: () => fetchSecretImport({ workspaceId, environment, directory })
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
        workspaceId,
        environment,
        directory
      }
    }
  );
  return data.secrets;
};

export const useGetImportedSecrets = ({
  workspaceId,
  environment,
  decryptFileKey,
  directory,
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
      Boolean(workspaceId) &&
      Boolean(environment) &&
      Boolean(decryptFileKey) &&
      (options?.enabled ?? true),
    queryKey: secretImportKeys.getSecretImportSecrets({
      workspaceId,
      environment,
      directory
    }),
    queryFn: () => fetchImportedSecrets(workspaceId, environment, directory),
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
              _id: encSecret._id,
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
