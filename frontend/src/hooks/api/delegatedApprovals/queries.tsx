import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TDelegatedApprovalOption, TListDelegatedApprovalOptions } from "./types";

export const delegatedApprovalKeys = {
  all: ["delegated-approval"] as const,
  options: () => [...delegatedApprovalKeys.all, "options"] as const
};

export const useDelegatedApprovalOptions = (
  options?: Omit<
    UseQueryOptions<
      TDelegatedApprovalOption[],
      unknown,
      TDelegatedApprovalOption[],
      ReturnType<typeof delegatedApprovalKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: delegatedApprovalKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListDelegatedApprovalOptions>(
        "/api/v1/delegated-approvals/options"
      );

      return data.delegatedApprovalOptions;
    },
    staleTime: Infinity,
    ...options
  });
};
