import { useCallback } from "react";
import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetImportedFoldersByEnvDTO,
  TGetImportedSecrets,
  TGetSecretImports,
  TGetSecretImportsAllEnvs,
  TImportedSecrets,
  TSecretImport,
  TuseGetImportedFoldersByEnv
} from "./types";

export const secretImportKeys = {
  getProjectSecretImports: ({ environment, projectId, path }: TGetSecretImports) =>
    [{ projectId, path, environment }, "secrets-imports"] as const,
  getSecretImportSecrets: ({
    environment,
    projectId,
    path
  }: Omit<TGetImportedSecrets, "decryptFileKey">) =>
    [{ environment, path, projectId }, "secrets-import-sec"] as const,
  getImportedFoldersByEnv: ({ environment, projectId, path }: TGetImportedFoldersByEnvDTO) =>
    [{ environment, projectId, path }, "imported-folders"] as const,
  getImportedFoldersAllEnvs: ({ projectId, path, environment }: TGetImportedFoldersByEnvDTO) =>
    [{ projectId, path, environment }, "imported-folders-all-envs"] as const
};

const fetchSecretImport = async ({ projectId, environment, path = "/" }: TGetSecretImports) => {
  const { data } = await apiRequest.get<{ secretImports: TSecretImport[] }>(
    "/api/v2/secret-imports",
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

const fetchImportedSecrets = async (projectId: string, environment: string, directory?: string) => {
  const { data } = await apiRequest.get<{ secrets: TImportedSecrets[] }>(
    "/api/v1/dashboard/secret-imports",
    {
      params: {
        projectId,
        environment,
        path: directory
      }
    }
  );
  return data.secrets;
};

const fetchImportedFolders = async ({
  projectId,
  environment,
  path
}: TGetImportedFoldersByEnvDTO) => {
  const { data } = await apiRequest.get<{ secretImports: TSecretImport[] }>(
    "/api/v2/secret-imports",
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

export const useGetImportedSecretsSingleEnv = ({
  environment,
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
    enabled: Boolean(projectId) && Boolean(environment) && (options?.enabled ?? true),
    queryKey: secretImportKeys.getSecretImportSecrets({
      environment,
      path,
      projectId
    }),
    queryFn: () => fetchImportedSecrets(projectId, environment, path),
    select: (data: TImportedSecrets[]) => {
      return data.map((el) => ({
        environment: el.environment,
        secretPath: el.secretPath,
        environmentInfo: el.environmentInfo,
        folderId: el.folderId,
        secrets: el.secrets.map((encSecret) => {
          return {
            id: encSecret.id,
            env: encSecret.environment,
            key: encSecret.secretKey,
            secretValueHidden: encSecret.secretValueHidden,
            tags: encSecret.tags,
            comment: encSecret.secretComment,
            createdAt: encSecret.createdAt,
            updatedAt: encSecret.updatedAt,
            version: encSecret.version,
            isEmpty: encSecret.isEmpty
          };
        })
      }));
    }
  });

export const useGetImportedSecretsAllEnvs = ({
  projectId,
  environments,
  path = "/"
}: TGetSecretImportsAllEnvs) => {
  const secretImports = useQueries({
    queries: environments.map((env) => ({
      queryKey: secretImportKeys.getImportedFoldersAllEnvs({
        environment: env,
        projectId,
        path
      }),
      queryFn: () => fetchImportedSecrets(projectId, env, path).catch(() => []),
      enabled: Boolean(projectId) && Boolean(env),
      // eslint-disable-next-line react-hooks/rules-of-hooks
      select: useCallback(
        (data: Awaited<ReturnType<typeof fetchImportedSecrets>>) =>
          data.map((el) => ({
            environment: el.environment,
            secretPath: el.secretPath,
            environmentInfo: el.environmentInfo,
            folderId: el.folderId,
            secrets: el.secrets.map((encSecret) => {
              return {
                id: encSecret.id,
                env: encSecret.environment,
                key: encSecret.secretKey,
                isEmpty: encSecret.isEmpty,
                secretValueHidden: encSecret.secretValueHidden,
                tags: encSecret.tags,
                comment: encSecret.secretComment,
                createdAt: encSecret.createdAt,
                updatedAt: encSecret.updatedAt,
                version: encSecret.version,
                sourceEnv: env
              };
            })
          })),
        []
      )
    }))
  });

  const getEnvImportedSecretKeyCount = useCallback(
    (env: string) => {
      const selectedEnvIndex = environments.indexOf(env);
      let totalSecrets = 0;

      if (selectedEnvIndex !== -1) {
        secretImports?.[selectedEnvIndex]?.data?.forEach((secret) => {
          totalSecrets += secret.secrets.length;
        });
      }

      return totalSecrets;
    },
    [(secretImports || []).map((response) => response.data)]
  );

  const isImportedSecretPresentInEnv = useCallback(
    (envSlug: string, secretName: string) => {
      const selectedEnvIndex = environments.indexOf(envSlug);

      if (selectedEnvIndex !== -1) {
        const isPresent = secretImports?.[selectedEnvIndex]?.data?.find(({ secrets }) =>
          secrets.some((s) => s.key === secretName)
        );

        return Boolean(isPresent);
      }
      return false;
    },
    [(secretImports || []).map((response) => response.data)]
  );

  const getImportedSecretByKey = useCallback(
    (envSlug: string, secretName: string) => {
      const selectedEnvIndex = environments.indexOf(envSlug);

      if (selectedEnvIndex !== -1) {
        const secret = secretImports?.[selectedEnvIndex]?.data?.find(({ secrets }) =>
          secrets.find((s) => s.key === secretName)
        );

        if (!secret) return undefined;

        return {
          secret: secret?.secrets.find((s) => s.key === secretName),
          environmentInfo: secret?.environmentInfo,
          secretPath: secret?.secretPath,
          environment: secret?.environment
        };
      }
      return undefined;
    },
    [(secretImports || []).map((response) => response.data)]
  );

  return {
    secretImports,
    isImportedSecretPresentInEnv,
    getImportedSecretByKey,
    getEnvImportedSecretKeyCount
  };
};

export const useGetImportedFoldersByEnv = ({
  projectId,
  environments,
  path = "/"
}: TuseGetImportedFoldersByEnv) => {
  const queryParams = new URLSearchParams(window.location.search);

  const currentPath = path;

  const importedFolders = useQueries({
    queries: environments.map((env) => ({
      queryKey: secretImportKeys.getImportedFoldersByEnv({
        projectId,
        environment: env,
        path: currentPath
      }),
      queryFn: async () => fetchImportedFolders({ projectId, environment: env, path: currentPath }),
      enabled: Boolean(projectId) && Boolean(env)
    }))
  });

  const isImportedFolderPresentInEnv = useCallback(
    (name: string, env: string) => {
      const selectedEnvIndex = environments.indexOf(env);

      if (selectedEnvIndex !== -1) {
        const currentlyBrowsingPath = queryParams.get("secretPath") || "";

        const isPresent = importedFolders?.[selectedEnvIndex]?.data?.find(
          ({ importPath }) => importPath === `${currentlyBrowsingPath}/${name}`
        );

        return Boolean(isPresent);
      }
      return false;
    },
    [(importedFolders || []).map((response) => response.data)]
  );

  return { importedFolders, isImportedFolderPresentInEnv };
};
