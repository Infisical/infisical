import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCloud66Stack } from "./types";

const cloud66ConnectionKeys = {
  all: [...appConnectionKeys.all, "cloud-66"] as const,
  listStacks: (connectionId: string) =>
    [...cloud66ConnectionKeys.all, "stacks", connectionId] as const
};

export const useCloud66ConnectionListStacks = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCloud66Stack[],
      unknown,
      TCloud66Stack[],
      ReturnType<typeof cloud66ConnectionKeys.listStacks>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cloud66ConnectionKeys.listStacks(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCloud66Stack[]>(
        `/api/v1/app-connections/cloud-66/${connectionId}/stacks`
      );

      return data;
    },
    ...options
  });
};
