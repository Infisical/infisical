import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDetailsDynamicSecretDTO, TDynamicSecret, TListDynamicSecretDTO } from "./types";

export const dynamicSecretKeys = {
  list: ({
    projectId,
    environment,
    path
  }: Pick<TListDynamicSecretDTO, "path" | "environment" | "projectId">) =>
    [{ projectId, environment, path }, "dynamic-secrets"] as const,
  details: ({ path, environment, projectId, slug }: TDetailsDynamicSecretDTO) =>
    [{ projectId, path, environment, slug }, "dynamic-secret-details"] as const
};

export const useGetDynamicSecrets = ({ projectId, environment, path }: TListDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.list({ path, environment, projectId }),
    enabled: Boolean(projectId && environment && path),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
        "/api/v1/dynamic-secrets",
        {
          params: {
            projectId,
            environment,
            path
          }
        }
      );

      return data.dynamicSecrets;
    }
  });
};

export const useGetDynamicSecretDetails = ({
  projectId,
  environment,
  path,
  slug
}: TDetailsDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.details({ path, environment, projectId, slug }),
    enabled: Boolean(projectId && environment && path && slug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        dynamicSecret: TDynamicSecret & { inputs: unknown };
      }>(`/api/v1/dynamic-secrets/${slug}`, {
        params: {
          projectId,
          environment,
          path
        }
      });

      return data.dynamicSecret;
    }
  });
};
