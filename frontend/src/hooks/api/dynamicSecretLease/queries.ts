import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDynamicSecretLease, TListDynamicSecretLeaseDTO } from "./types";

export const dynamicSecretLeaseKeys = {
  list: ({ projectSlug, environmentSlug, path, dynamicSecretName }: TListDynamicSecretLeaseDTO) =>
    [{ projectSlug, environmentSlug, path, dynamicSecretName }, "dynamic-secret-leases"] as const
};

export const useGetDynamicSecretLeases = ({
  projectSlug,
  environmentSlug,
  path,
  dynamicSecretName,
  namespaceId,
  enabled = true
}: TListDynamicSecretLeaseDTO) => {
  return useQuery({
    queryKey: dynamicSecretLeaseKeys.list({
      namespaceId,
      path,
      environmentSlug,
      projectSlug,
      dynamicSecretName
    }),
    enabled: Boolean(projectSlug && environmentSlug && path && dynamicSecretName && enabled),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ leases: TDynamicSecretLease[] }>(
        `/api/v1/dynamic-secrets/${dynamicSecretName}/leases`,
        {
          params: {
            projectSlug,
            namespaceId,
            environmentSlug,
            path
          }
        }
      );

      return data.leases;
    }
  });
};
