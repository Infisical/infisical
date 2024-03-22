import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDetailsDynamicSecretDTO, TDynamicSecret, TListDynamicSecretDTO } from "./types";

export const dynamicSecretKeys = {
  list: ({
    projectSlug,
    environment,
    path
  }: Pick<TListDynamicSecretDTO, "path" | "environment" | "projectSlug">) =>
    [{ projectSlug, environment, path }, "dynamic-secrets"] as const,
  details: ({ path, environment, projectSlug, slug }: TDetailsDynamicSecretDTO) =>
    [{ projectSlug, path, environment, slug }, "dynamic-secret-details"] as const
};

export const useGetDynamicSecrets = ({ projectSlug, environment, path }: TListDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.list({ path, environment, projectSlug }),
    enabled: Boolean(projectSlug && environment && path),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
        "/api/v1/dynamic-secrets",
        {
          params: {
            projectSlug,
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
  projectSlug,
  environment,
  path,
  slug
}: TDetailsDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.details({ path, environment, projectSlug, slug }),
    enabled: Boolean(projectSlug && environment && path && slug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        dynamicSecret: TDynamicSecret & { inputs: unknown };
      }>(`/api/v1/dynamic-secrets/${slug}`, {
        params: {
          projectSlug,
          environment,
          path
        }
      });

      return data.dynamicSecret;
    }
  });
};
