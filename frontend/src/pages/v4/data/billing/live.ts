import { useCallback } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";

import {
  billingSubmitMutationKey,
  useAddBillingPaymentMethod,
  useBuyBillingProduct,
  useCancelBillingTrial,
  useChangeBillingCommitment,
  useConfirmBillingTrialPayment,
  useCreateBillingPortalSession,
  usePreviewBillingChange,
  useRefreshBillingEntitlements,
  useRemoveBillingProduct,
  useStartBillingTrial,
  useUpgradeBillingProduct
} from "@app/hooks/api/billing/mutations";
import {
  useGetBillingCatalog,
  useGetBillingOrganizations,
  useGetBillingOverview,
  useGetBillingUsageBreakdown
} from "@app/hooks/api/billing/queries";
import {
  fetchOrgSubscription,
  subscriptionQueryKeys,
  useGetOrgSubscription
} from "@app/hooks/api/subscriptions/queries";

import type { BillingAdapter } from "./contract";

export const billingLive: BillingAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useRefreshSubscription: () => {
    const queryClient = useQueryClient();
    return useCallback(
      (orgId: string) =>
        queryClient.fetchQuery({
          queryKey: subscriptionQueryKeys.getOrgSubsription(orgId),
          queryFn: () => fetchOrgSubscription(orgId, true),
          staleTime: 0,
          retry: false
        }),
      [queryClient]
    );
  },
  useOverview: useGetBillingOverview,
  useCatalog: useGetBillingCatalog,
  useUsageBreakdown: useGetBillingUsageBreakdown,
  useOrganizations: useGetBillingOrganizations,
  useIsSubmitting: () => useIsMutating({ mutationKey: billingSubmitMutationKey }) > 0,
  useCreatePortalSession: useCreateBillingPortalSession,
  useBuyProduct: useBuyBillingProduct,
  useAddPaymentMethod: useAddBillingPaymentMethod,
  usePreviewChange: usePreviewBillingChange,
  useUpgradeProduct: useUpgradeBillingProduct,
  useChangeCommitment: useChangeBillingCommitment,
  useStartTrial: useStartBillingTrial,
  useConfirmTrialPayment: useConfirmBillingTrialPayment,
  useCancelTrial: useCancelBillingTrial,
  useRemoveProduct: useRemoveBillingProduct,
  useRefreshEntitlements: useRefreshBillingEntitlements
};
