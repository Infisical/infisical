import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TCircleCIOrganization, TCircleCIOrganizationListResponse } from "./types";

const circleciConnectionKeys = {
  all: [...appConnectionKeys.all, "circleci"] as const,
  listOrganizations: (connectionId: string) =>
    [...circleciConnectionKeys.all, "organizations", connectionId] as const
};

export const useCircleCIConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCircleCIOrganization[],
      unknown,
      TCircleCIOrganization[],
      ReturnType<typeof circleciConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: circleciConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCircleCIOrganizationListResponse>(
        `/api/v1/app-connections/circleci/${connectionId}/projects`
      );

      return data.organizations;
    },
    ...options
  });
};
