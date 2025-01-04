import { useCallback, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TDetailsDynamicSecretDTO,
  TDynamicSecret,
  TGetDynamicSecretsByEnvsDTO,
  TListDynamicSecretDTO
} from "./types";

export const dynamicSecretKeys = {
  list: ({
    projectSlug,
    environmentSlug,
    path
  }: Pick<TListDynamicSecretDTO, "path" | "environmentSlug" | "projectSlug">) =>
    [{ projectSlug, environmentSlug, path }, "dynamic-secrets"] as const,
  details: ({ path, environmentSlug, projectSlug, name }: TDetailsDynamicSecretDTO) =>
    [{ projectSlug, path, environmentSlug, name }, "dynamic-secret-details"] as const
};

export const useGetDynamicSecrets = ({
  projectSlug,
  environmentSlug,
  path
}: TListDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.list({ path, environmentSlug, projectSlug }),
    enabled: Boolean(projectSlug && environmentSlug && path),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
        "/api/v1/dynamic-secrets",
        {
          params: {
            projectSlug,
            environmentSlug,
            path
          }
        }
      );

      return data.dynamicSecrets;
    }
  });
};

export const useGetDynamicSecretDetails = ({
  projectSlug,
  environmentSlug,
  path,
  name
}: TDetailsDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.details({ path, environmentSlug, projectSlug, name }),
    enabled: Boolean(projectSlug && environmentSlug && path && name),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        dynamicSecret: TDynamicSecret & { inputs: unknown };
      }>(`/api/v1/dynamic-secrets/${name}`, {
        params: {
          projectSlug,
          environmentSlug,
          path
        }
      });

      return data.dynamicSecret;
    }
  });
};

export const useGetDynamicSecretProviderData = ({
  tenantId,
  applicationId,
  clientSecret,
  enabled
}: {
  tenantId: string;
  applicationId: string;
  clientSecret: string;
  enabled: boolean
}) => {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await apiRequest.post<{id:string, email: string, name:string}[]>(
        "/api/v1/dynamic-secrets/entra-id/users",
        {
          tenantId,
          applicationId,
          clientSecret
        }
      );
      return data;
    },
    enabled
  });
};

export const useGetDynamicSecretsOfAllEnv = ({
  path,
  projectSlug,
  environmentSlugs
}: TGetDynamicSecretsByEnvsDTO) => {
  const dynamicSecrets = useQueries({
    queries: environmentSlugs.map((environment) => ({
      queryKey: dynamicSecretKeys.list({ path, environmentSlug: environment, projectSlug }),
      enabled: Boolean(projectSlug && environment && path),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
          "/api/v1/dynamic-secrets",
          {
            params: {
              projectSlug,
              environmentSlug: environment,
              path
            }
          }
        );

        return data.dynamicSecrets;
      }
    }))
  });

  const dynamicSecretNames = useMemo(() => {
    const names = new Set<string>();
    dynamicSecrets?.forEach(({ data }) => {
      data?.forEach(({ name }) => {
        names.add(name);
      });
    });
    return [...names];
  }, [(dynamicSecrets || []).map((dynamicSecret) => dynamicSecret.data)]);

  const isDynamicSecretPresentInEnv = useCallback(
    (name: string, env: string) => {
      const selectedEnvIndex = environmentSlugs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return Boolean(
          dynamicSecrets?.[selectedEnvIndex]?.data?.find(
            ({ name: dynamicSecretName }) => dynamicSecretName === name
          )
        );
      }
      return false;
    },
    [(dynamicSecrets || []).map((el) => el.data)]
  );

  return { dynamicSecrets, isDynamicSecretPresentInEnv, dynamicSecretNames };
};
