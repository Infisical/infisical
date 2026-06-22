import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  BillingV2CheckoutResult,
  TAddBillingV2PaymentMethodDTO,
  TCreateBillingV2CheckoutSessionDTO,
  TCreateBillingV2PortalSessionDTO
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
