import { useQuery } from "@tanstack/react-query";

import { approvalPolicyQuery } from "@app/hooks/api/approvalPolicies";
import {
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
    })
};
