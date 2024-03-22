import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDynamicSecretLease, TListDynamicSecretLeaseDTO } from "./types";

export const dynamicSecretLeaseKeys = {
  list: ({ projectSlug, environment, path, slug }: TListDynamicSecretLeaseDTO) =>
    [{ projectSlug, environment, path, slug }, "dynamic-secret-leases"] as const
};

export const useGetDynamicSecretLeases = ({
  projectSlug,
  environment,
  path,
  slug,
  enabled = true
}: TListDynamicSecretLeaseDTO) => {
  return useQuery({
    queryKey: dynamicSecretLeaseKeys.list({ path, environment, projectSlug, slug }),
    enabled: Boolean(projectSlug && environment && path && slug && enabled),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ leases: TDynamicSecretLease[] }>(
        `/api/v1/dynamic-secrets/${slug}/leases`,
        {
          params: {
            projectSlug,
            environment,
            path
          }
        }
      );

      return data.leases;
    }
  });
};
