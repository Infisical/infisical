import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { apiRequest } from "@app/config/request";

import { fetchOrgSubscription, subscriptionQueryKeys } from "../subscriptions/queries";
import { billingKeys } from "./queries";
import {
  BillingCheckoutResult,
  BillingConfirmTrialPaymentResult,
  BillingErrorCode,
  BillingMutationResult,
  BillingPreview,
  BillingTrialCancelResult,
  BillingTrialResult,
  BillingUpgradeResult,
  TAddBillingPaymentMethodDTO,
  TBillingLifecycleDTO,
  TBuyBillingProductDTO,
  TCancelBillingTrialDTO,
  TChangeBillingCommitmentDTO,
  TConfirmBillingTrialPaymentDTO,
  TCreateBillingPortalSessionDTO,
  TPreviewBillingChangeDTO,
  TRemoveBillingProductDTO,
  TStartBillingTrialDTO,
  TUpgradeBillingProductDTO
} from "./types";

// The catalog's trialable/upgradeable flags are org-aware, so any mutation that changes what the org
// holds invalidates it alongside the overview; otherwise both CTAs stay stale after the action that
// changed them.
const invalidateBilling = (queryClient: QueryClient, orgId: string) => {
  queryClient.invalidateQueries({ queryKey: billingKeys.overview(orgId) });
  queryClient.invalidateQueries({ queryKey: billingKeys.catalog(orgId) });
  const queryKey = subscriptionQueryKeys.getOrgSubsription(orgId);
  return queryClient
    .fetchQuery({
      queryKey,
      queryFn: () => fetchOrgSubscription(orgId, true),
      staleTime: 0
    })
    .catch(() => queryClient.invalidateQueries({ queryKey }));
};

// Shared by mutations that submit a billing change, so an overlay can lock while one is in flight
// without also locking on price previews.
export const billingSubmitMutationKey = ["billing", "submit"] as const;

export const useCreateBillingPortalSession = () => {
  return useMutation({
    mutationFn: async ({ orgId, returnPath }: TCreateBillingPortalSessionDTO) => {
      const {
        data: { url }
      } = await apiRequest.post<{ url: string }>(
        `/api/v1/organizations/${orgId}/billing/v2/portal-session`,
        { returnPath }
      );

      return url;
    }
  });
};

// Buy/add one product. The server self-selects appending to a live subscription vs opening a hosted
// Checkout, so the caller never branches on subscription state. Commitment is a separate step.
export const useBuyBillingProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      productId,
      plan,
      cadence,
      quantities,
      returnPath
    }: TBuyBillingProductDTO) => {
      const { data } = await apiRequest.post<BillingCheckoutResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/products`,
        { productId, plan, cadence, quantities, returnPath }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

export const useAddBillingPaymentMethod = () => {
  return useMutation({
    mutationFn: async ({ orgId, returnPath }: TAddBillingPaymentMethodDTO) => {
      const {
        data: { url }
      } = await apiRequest.post<{ url: string }>(
        `/api/v1/organizations/${orgId}/billing/v2/payment-method`,
        { returnPath }
      );

      return url;
    }
  });
};

// Preview-only: never mutates, so it does not invalidate the overview. The caller shows the result
// in a confirmation dialog before committing the add/remove.
export const usePreviewBillingChange = () => {
  return useMutation({
    mutationFn: async ({
      orgId,
      addProductId,
      plan,
      cadence,
      quantities,
      removeProductId,
      commitmentChanges,
      upgradeProductId,
      upgradePlan
    }: TPreviewBillingChangeDTO) => {
      const {
        data: { preview }
      } = await apiRequest.post<{ preview: BillingPreview }>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/preview`,
        {
          addProductId,
          plan,
          cadence,
          quantities,
          removeProductId,
          commitmentChanges,
          upgradeProductId,
          upgradePlan
        }
      );

      return preview;
    }
  });
};

// Move a held product onto a higher plan. expectedPlanVersionId comes from the preview and is what
// turns a price published in between into a clean conflict instead of an unexpected charge.
export const useUpgradeBillingProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: billingSubmitMutationKey,
    mutationFn: async ({
      orgId,
      productId,
      plan,
      expectedPlanVersionId,
      prorationDate
    }: TUpgradeBillingProductDTO) => {
      const { data } = await apiRequest.post<BillingUpgradeResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/upgrade`,
        { productId, plan, expectedPlanVersionId, prorationDate }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

// Start / change annual commitments across dimensions in one atomic call.
export const useChangeBillingCommitment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: billingSubmitMutationKey,
    mutationFn: async ({ orgId, changes, productId }: TChangeBillingCommitmentDTO) => {
      const { data } = await apiRequest.put<BillingMutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/commitments`,
        { changes, productId }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

// Start a plan-scoped self-serve trial. The trial is granted immediately; cardSetupUrl (when present)
// is a best-effort Stripe setup checkout the caller redirects to for adding a card.
export const useStartBillingTrial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: billingSubmitMutationKey,
    mutationFn: async ({ orgId, productId, plan, returnPath }: TStartBillingTrialDTO) => {
      const { data } = await apiRequest.post<BillingTrialResult>(
        `/api/v1/organizations/${orgId}/billing/v2/trial`,
        { productId, plan, returnPath }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

// Opens a Stripe Checkout where the customer approves a trial conversion charge their bank is holding.
// A no_trial_awaiting_payment error means the payment already went through, so refetch to drop the
// stale banner; the global handler still shows the message.
export const useConfirmBillingTrialPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, returnPath }: TConfirmBillingTrialPaymentDTO) => {
      const { data } = await apiRequest.post<BillingConfirmTrialPaymentResult>(
        `/api/v1/organizations/${orgId}/billing/v2/trial/confirm-payment`,
        { returnPath }
      );

      return data;
    },
    onSuccess: (data, { orgId }) => {
      if (data.outcome === "upgraded") {
        invalidateBilling(queryClient, orgId);
      }
    },
    onError: (error, { orgId }) => {
      if (
        axios.isAxiosError<{ details?: { code?: string } }>(error) &&
        error.response?.data?.details?.code === BillingErrorCode.NoTrialAwaitingPayment
      ) {
        invalidateBilling(queryClient, orgId);
      }
    }
  });
};

// Cancel an in-progress trial for a product (product drops to free; the trial never converts).
export const useCancelBillingTrial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: billingSubmitMutationKey,
    mutationFn: async ({ orgId, productId }: TCancelBillingTrialDTO) => {
      const { data } = await apiRequest.post<BillingTrialCancelResult>(
        `/api/v1/organizations/${orgId}/billing/v2/trial/cancel`,
        { productId }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

export const useRemoveBillingProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productId }: TRemoveBillingProductDTO) => {
      const { data } = await apiRequest.delete<BillingMutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/products/${encodeURIComponent(productId)}`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      invalidateBilling(queryClient, orgId);
    }
  });
};

// Force the server to recompute entitlements from the license server and drop its cache, then refetch
// the overview so the freshly-pulled entitlements land in the query cache.
export const useRefreshBillingEntitlements = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId }: TBillingLifecycleDTO) => {
      const { data } = await apiRequest.post<{ success: boolean }>(
        `/api/v1/organizations/${orgId}/billing/v2/overview/refresh`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.overview(orgId) });
      queryClient.invalidateQueries({ queryKey: subscriptionQueryKeys.getOrgSubsription(orgId) });
    }
  });
};
