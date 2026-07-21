import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { subscriptionQueryKeys } from "../subscriptions/queries";
import { billingV2Keys } from "./queries";
import {
  BillingV2CheckoutResult,
  BillingV2MutationResult,
  BillingV2Preview,
  BillingV2TrialCancelResult,
  BillingV2TrialResult,
  TAddBillingV2PaymentMethodDTO,
  TAddBillingV2ProductDTO,
  TBillingV2LifecycleDTO,
  TCancelBillingV2TrialDTO,
  TChangeBillingV2CommitmentDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO,
  TPreviewBillingV2ChangeDTO,
  TRemoveBillingV2ProductDTO,
  TStartBillingV2TrialDTO
} from "./types";

export const useCreateBillingV2PortalSession = () => {
  return useMutation({
    mutationFn: async ({ orgId, returnPath }: TCreateBillingV2PortalSessionDTO) => {
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

export const useCreateBillingV2CheckoutSession = () => {
  return useMutation({
    mutationFn: async ({
      orgId,
      productId,
      plan,
      cadence,
      commitments,
      email,
      returnPath
    }: TCreateBillingV2CheckoutSessionDTO) => {
      const { data } = await apiRequest.post<BillingV2CheckoutResult>(
        `/api/v1/organizations/${orgId}/billing/v2/checkout-session`,
        { productId, plan, cadence, commitments, email, returnPath }
      );

      return data;
    }
  });
};

export const useAddBillingV2PaymentMethod = () => {
  return useMutation({
    mutationFn: async ({ orgId, returnPath }: TAddBillingV2PaymentMethodDTO) => {
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
export const usePreviewBillingV2Change = () => {
  return useMutation({
    mutationFn: async ({
      orgId,
      addProductId,
      plan,
      cadence,
      commitments,
      removeProductId,
      commitmentChanges
    }: TPreviewBillingV2ChangeDTO) => {
      const {
        data: { preview }
      } = await apiRequest.post<{ preview: BillingV2Preview }>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/preview`,
        { addProductId, plan, cadence, commitments, removeProductId, commitmentChanges }
      );

      return preview;
    }
  });
};

export const useAddBillingV2Product = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orgId,
      productId,
      plan,
      cadence,
      commitments
    }: TAddBillingV2ProductDTO) => {
      const { data } = await apiRequest.post<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/items`,
        { productId, plan, cadence, commitments }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

// Apply one or more previewed per_resource commitment changes (the backend loops per dimension).
export const useChangeBillingV2Commitment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, changes }: TChangeBillingV2CommitmentDTO) => {
      const { data } = await apiRequest.post<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/commitments`,
        { changes }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

// Start a plan-scoped self-serve trial. The trial is granted immediately; cardSetupUrl (when present)
// is a best-effort Stripe setup checkout the caller redirects to for adding a card.
export const useStartBillingV2Trial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productId, plan }: TStartBillingV2TrialDTO) => {
      const { data } = await apiRequest.post<BillingV2TrialResult>(
        `/api/v1/organizations/${orgId}/billing/v2/trial`,
        { productId, plan }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

// Cancel an in-progress trial for a product (product drops to free; the trial never converts).
export const useCancelBillingV2Trial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productId }: TCancelBillingV2TrialDTO) => {
      const { data } = await apiRequest.post<BillingV2TrialCancelResult>(
        `/api/v1/organizations/${orgId}/billing/v2/trial/cancel`,
        { productId }
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

export const useRemoveBillingV2Product = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productId }: TRemoveBillingV2ProductDTO) => {
      const { data } = await apiRequest.delete<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/items/${encodeURIComponent(productId)}`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

export const useCancelBillingV2Subscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId }: TBillingV2LifecycleDTO) => {
      const { data } = await apiRequest.post<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/cancel`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

export const useResumeBillingV2Subscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId }: TBillingV2LifecycleDTO) => {
      const { data } = await apiRequest.post<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/resume`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
    }
  });
};

// Force the server to recompute entitlements from the license server and drop its cache, then refetch
// the overview so the freshly-pulled entitlements land in the query cache.
export const useRefreshBillingV2Entitlements = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId }: TBillingV2LifecycleDTO) => {
      const { data } = await apiRequest.post<{ success: boolean }>(
        `/api/v1/organizations/${orgId}/billing/v2/overview/refresh`
      );

      return data;
    },
    onSuccess: (_data, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: billingV2Keys.overview(orgId) });
      queryClient.invalidateQueries({ queryKey: subscriptionQueryKeys.getOrgSubsription(orgId) });
    }
  });
};
