import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { THumanitecOrganization } from "./types";

const humanitecConnectionKeys = {
  all: [...appConnectionKeys.all, "humanitec"] as const,
  listOrganizations: (connectionId: string) =>
    [...humanitecConnectionKeys.all, "organizations", connectionId] as const
};

export const useHumanitecConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      THumanitecOrganization[],
      unknown,
      THumanitecOrganization[],
      ReturnType<typeof humanitecConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: humanitecConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<THumanitecOrganization[]>(
        `/api/v1/app-connections/humanitec/${connectionId}/organizations`,
        {}
      );

      return data;
    },
    ...options
  });
};
