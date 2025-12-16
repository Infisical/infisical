import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { approvalGrantQuery } from "./queries";
import { TApprovalGrant, TRevokeApprovalGrantDTO } from "./types";

export const useRevokeApprovalGrant = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ policyType, grantId, revocationReason }: TRevokeApprovalGrantDTO) => {
      const { data } = await apiRequest.post<{ grant: TApprovalGrant }>(
        `/api/v1/approval-policies/${policyType}/grants/${grantId}/revoke`,
        { revocationReason }
      );
      return data.grant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalGrantQuery.allKey() });
    }
  });
};
