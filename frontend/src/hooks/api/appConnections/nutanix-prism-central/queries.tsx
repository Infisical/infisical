import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

export type TNutanixCluster = {
  id: string;
  name: string;
};

const nutanixPrismCentralConnectionKeys = {
  all: [...appConnectionKeys.all, "nutanix-prism-central"] as const,
  listClusters: (connectionId: string) =>
    [...nutanixPrismCentralConnectionKeys.all, "clusters", connectionId] as const
};

export const useNutanixPrismCentralConnectionListClusters = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TNutanixCluster[],
      unknown,
      TNutanixCluster[],
      ReturnType<typeof nutanixPrismCentralConnectionKeys.listClusters>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: nutanixPrismCentralConnectionKeys.listClusters(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clusters: TNutanixCluster[] }>(
        `/api/v1/app-connections/nutanix-prism-central/${connectionId}/clusters`
      );

      return data.clusters;
    },
    enabled: Boolean(connectionId),
    ...options
  });
};
