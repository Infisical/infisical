import type {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingCheckoutResult,
  BillingConfirmTrialPaymentResult,
  BillingMutationResult,
  BillingOrganizationsPage,
  BillingOverview,
  BillingPreview,
  BillingTrialCancelResult,
  BillingTrialResult,
  BillingUpgradeResult,
  BillingUsageBreakdown,
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
} from "@app/hooks/api/billing/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { V4QueryResult } from "../contract";

export type BillingQuery<TData> = V4QueryResult<TData> & {
  isError: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  isPlaceholderData: boolean;
  refetch: () => Promise<unknown>;
};

export type BillingMutation<TVariables, TData> = () => {
  mutate: (
    variables: TVariables,
    options?: { onSuccess?: (data: TData) => void; onError?: (error: unknown) => void }
  ) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  isError: boolean;
  data: TData | undefined;
  variables: TVariables | undefined;
  reset: () => void;
};

export type BillingAdapter = {
  useSubscription: (orgId: string) => BillingQuery<SubscriptionPlan>;
  useRefreshSubscription: () => (orgId: string) => Promise<unknown>;
  useOverview: (
    orgId: string,
    options?: { enabled?: boolean; staleTime?: number }
  ) => BillingQuery<BillingOverview>;
  useCatalog: (
    orgId: string,
    options?: { enabled?: boolean }
  ) => BillingQuery<BillingCatalogProduct[]>;
  useUsageBreakdown: (
    orgId: string,
    dimensionKey: string | null,
    scope?: BillingBreakdownScopeKind
  ) => BillingQuery<BillingUsageBreakdown>;
  useOrganizations: (
    orgId: string,
    params?: { search?: string; limit?: number; offset?: number }
  ) => BillingQuery<BillingOrganizationsPage>;
  useIsSubmitting: () => boolean;
  useCreatePortalSession: BillingMutation<TCreateBillingPortalSessionDTO, string>;
  useBuyProduct: BillingMutation<TBuyBillingProductDTO, BillingCheckoutResult>;
  useAddPaymentMethod: BillingMutation<TAddBillingPaymentMethodDTO, string>;
  usePreviewChange: BillingMutation<TPreviewBillingChangeDTO, BillingPreview>;
  useUpgradeProduct: BillingMutation<TUpgradeBillingProductDTO, BillingUpgradeResult>;
  useChangeCommitment: BillingMutation<TChangeBillingCommitmentDTO, BillingMutationResult>;
  useStartTrial: BillingMutation<TStartBillingTrialDTO, BillingTrialResult>;
  useConfirmTrialPayment: BillingMutation<
    TConfirmBillingTrialPaymentDTO,
    BillingConfirmTrialPaymentResult
  >;
  useCancelTrial: BillingMutation<TCancelBillingTrialDTO, BillingTrialCancelResult>;
  useRemoveProduct: BillingMutation<TRemoveBillingProductDTO, BillingMutationResult>;
  useRefreshEntitlements: BillingMutation<TBillingLifecycleDTO, { success: boolean }>;
};
