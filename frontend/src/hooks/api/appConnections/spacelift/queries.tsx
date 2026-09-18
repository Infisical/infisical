import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TSpaceliftContext } from "./types";

const spaceliftConnectionKeys = {
  all: [...appConnectionKeys.all, "spacelift"] as const,
  listContexts: (connectionId: string) =>
    [...spaceliftConnectionKeys.all, "contexts", connectionId] as const
};

export const useSpaceliftConnectionListContexts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSpaceliftContext[],
      unknown,
      TSpaceliftContext[],
      ReturnType<typeof spaceliftConnectionKeys.listContexts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: spaceliftConnectionKeys.listContexts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSpaceliftContext[]>(
        `/api/v1/app-connections/spacelift/${connectionId}/contexts`
      );

      return data;
    },
    ...options
  });
};
