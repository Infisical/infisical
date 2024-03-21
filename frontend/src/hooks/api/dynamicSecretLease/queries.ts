import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDynamicSecretLease, TListDynamicSecretLeaseDTO } from "./types";

export const dynamicSecretLeaseKeys = {
  list: ({ projectId, environment, path, slug }: TListDynamicSecretLeaseDTO) =>
    [{ projectId, environment, path, slug }, "dynamic-secret-leases"] as const
};

export const useGetDynamicSecretLeases = ({
  projectId,
  environment,
  path,
  slug,
  enabled = true
}: TListDynamicSecretLeaseDTO) => {
  return useQuery({
    queryKey: dynamicSecretLeaseKeys.list({ path, environment, projectId, slug }),
    enabled: Boolean(projectId && environment && path && slug && enabled),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ leases: TDynamicSecretLease[] }>(
        `/api/v1/dynamic-secrets/leases/${slug}`,
        {
          params: {
            projectId,
            environment,
            path
          }
        }
      );

      return data.leases;
    }
  });
};
