import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TConvexDeployment } from "./types";

const convexConnectionKeys = {
  all: [...appConnectionKeys.all, "convex"] as const,
  listDeployments: (connectionId: string) =>
    [...convexConnectionKeys.all, "deployments", connectionId] as const
};

export const useConvexConnectionListDeployments = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TConvexDeployment[],
      unknown,
      TConvexDeployment[],
      ReturnType<typeof convexConnectionKeys.listDeployments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: convexConnectionKeys.listDeployments(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TConvexDeployment[]>(
        `/api/v1/app-connections/convex/${connectionId}/deployments`
      );

      return data;
    },
    ...options
  });
};
