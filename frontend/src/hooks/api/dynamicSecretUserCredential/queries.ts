import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDynamicSecretUserCredential, TListDynamicSecretUserCredentialsDTO } from "./types";

export const dynamicSecretUserCredentialKeys = {
  all: ({
    projectSlug,
    environmentSlug,
    path,
    dynamicSecretName
  }: Omit<TListDynamicSecretUserCredentialsDTO, "offset" | "limit" | "enabled">) =>
    [
      { projectSlug, environmentSlug, path, dynamicSecretName },
      "dynamic-secret-user-credentials"
    ] as const,
  list: ({ offset, limit, ...location }: Omit<TListDynamicSecretUserCredentialsDTO, "enabled">) =>
    [...dynamicSecretUserCredentialKeys.all(location), { offset, limit }] as const
};

export const useListDynamicSecretUserCredentials = ({
  projectSlug,
  environmentSlug,
  path,
  dynamicSecretName,
  offset,
  limit,
  enabled = true
}: TListDynamicSecretUserCredentialsDTO) => {
  return useQuery({
    queryKey: dynamicSecretUserCredentialKeys.list({
      projectSlug,
      environmentSlug,
      path,
      dynamicSecretName,
      offset,
      limit
    }),
    enabled: Boolean(projectSlug && environmentSlug && path && dynamicSecretName && enabled),
    // token status changes on every refresh, so always show the current one
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        userCredentials: TDynamicSecretUserCredential[];
        totalCount: number;
      }>(`/api/v1/dynamic-secrets/${dynamicSecretName}/user-credentials`, {
        params: { projectSlug, environmentSlug, path, offset, limit }
      });
      return data;
    }
  });
};
