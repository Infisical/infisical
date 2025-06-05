import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCoolifyApplication } from "./types";

const coolifyConnectionKeys = {
  all: [...appConnectionKeys.all, "coolify"] as const,
  listApplications: (connectionId: string) =>
    [...coolifyConnectionKeys.all, "applications", connectionId] as const
};

export const useCoolifyConnectionListApplications = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyApplication[],
      unknown,
      TCoolifyApplication[],
      ReturnType<typeof coolifyConnectionKeys.listApplications>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listApplications(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCoolifyApplication[]>(
        `/api/v1/app-connections/coolify/${connectionId}/applications`
      );

      return data;
    },
    ...options
  });
};
