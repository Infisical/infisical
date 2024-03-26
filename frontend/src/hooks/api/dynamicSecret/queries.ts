import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDetailsDynamicSecretDTO, TDynamicSecret, TListDynamicSecretDTO } from "./types";

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

export const useGetDynamicSecrets = ({ projectSlug, environmentSlug, path }: TListDynamicSecretDTO) => {
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
