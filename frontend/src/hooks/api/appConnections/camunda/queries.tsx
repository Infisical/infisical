import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCamundaCluster } from "./types";

const camundaConnectionKeys = {
  all: [...appConnectionKeys.all, "camunda"] as const,
  listClusters: (connectionId: string) =>
    [...camundaConnectionKeys.all, "clusters", connectionId] as const
};

export const useCamundaConnectionListClusters = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCamundaCluster[],
      unknown,
      TCamundaCluster[],
      ReturnType<typeof camundaConnectionKeys.listClusters>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: camundaConnectionKeys.listClusters(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ clusters: TCamundaCluster[] }>(
        `/api/v1/app-connections/camunda/${connectionId}/clusters`
      );

      return data.clusters;
    },
    ...options
  });
};
