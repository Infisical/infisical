import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { approvalPolicyQuery } from "@app/hooks/api/approvalPolicies";
import {
  pamKeys,
  useGetPamApprovalConfig,
  useListPamAccessRequests,
  useSetPamApprovalConfig
} from "@app/hooks/api/pam";

import type { PamAccessApprovalsAdapter } from "./contract";

export const pamAccessApprovalsLive: PamAccessApprovalsAdapter = {
  useApprovalConfig: useGetPamApprovalConfig,
  useSetApprovalConfig: useSetPamApprovalConfig,
  useFolderAccessRequests: useListPamAccessRequests,
  useAutoApprovalCatalog: (params) => {
    const query = useQuery(approvalPolicyQuery.autoApprovalCatalog(params));
    return {
      data: query.data,
      isPending: query.isPending,
      error: query.error,
      refetch: async () => (await query.refetch()).data
    };
  },
  useAutoApprovalOptions: (params, enabled) =>
    useQuery({
      ...approvalPolicyQuery.autoApprovalOptions(params),
      enabled,
      staleTime: 30_000,
      retry: false
    }),
  usePendingApprovalCount: (enabled) =>
    useQuery({
      queryKey: pamKeys.accessRequestCount(),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ pendingCount: number; isApprover: boolean }>(
          "/api/v1/pam/access-requests/pending-my-approval/count"
        );
        return data;
      },
      select: (data) => data.pendingCount,
      enabled,
      refetchInterval: 30_000
    })
};
