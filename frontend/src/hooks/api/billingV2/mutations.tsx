import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { billingV2Keys } from "./queries";
import {
  BillingV2CheckoutResult,
  BillingV2MutationResult,
  BillingV2Preview,
  TAddBillingV2PaymentMethodDTO,
  TAddBillingV2ProductDTO,
  TBillingV2LifecycleDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO,
  TPreviewBillingV2ChangeDTO,
  TRemoveBillingV2ProductDTO
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
      cadence,
      email,
      returnPath
    }: TCreateBillingV2CheckoutSessionDTO) => {
      const { data } = await apiRequest.post<BillingV2CheckoutResult>(
        `/api/v1/organizations/${orgId}/billing/v2/checkout-session`,
        { productId, cadence, email, returnPath }
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
      cadence,
      removeProductId
    }: TPreviewBillingV2ChangeDTO) => {
      const {
        data: { preview }
      } = await apiRequest.post<{ preview: BillingV2Preview }>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/preview`,
        { addProductId, cadence, removeProductId }
      );

      return preview;
    }
  });
};

export const useAddBillingV2Product = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, productId, cadence }: TAddBillingV2ProductDTO) => {
      const { data } = await apiRequest.post<BillingV2MutationResult>(
        `/api/v1/organizations/${orgId}/billing/v2/subscription/items`,
        { productId, cadence }
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
