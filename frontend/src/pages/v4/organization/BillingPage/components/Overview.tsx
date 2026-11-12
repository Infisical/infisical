import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Stack } from "@infisical/cipher/ui/layout";

import type {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingOrganization,
  BillingOverview
} from "@app/hooks/api/billing/types";

import type { BillingRenderState } from "../billing-view-types";
import { Banner } from "./Banner";
import { RootOrgFilter } from "./RootOrgFilter";
import { TabbedOverview, TabbedOverviewSkeleton } from "./TabbedOverview";
import { TrialBanners } from "./TrialBanners";

export type OverviewProps = {
  overview?: BillingOverview;
  catalog: BillingCatalogProduct[];
  subState: BillingRenderState;
  onManageSubscription: () => void;
  onUpgrade: (productId: string) => void;
  onRemove: (productId: string) => void;
  rootOrgs: BillingOrganization[];
  rootOrgCount: number;
  isRootOrgsLoading: boolean;
  isReloading: boolean;
  selectedOrgId: string;
  onSelectOrg: (orgId: string) => void;
  breakdownOrgId: string;
  breakdownScope: BillingBreakdownScopeKind;
  onSearchOrgs: (search: string) => void;
  showOrgFilter: boolean;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingCatalogProduct) => void;
  onCompleteTrialPayment: () => void;
  isCompletingTrialPayment: boolean;
  hasTrialApproval: boolean;
  onOpenTrialApproval: () => void;
  onRetry: () => void;
  canManageBilling: boolean;
};

export const Overview = ({
  overview,
  catalog,
  subState,
  onManageSubscription,
  onUpgrade,
  onRemove,
  rootOrgs,
  rootOrgCount,
  isRootOrgsLoading,
  isReloading,
  selectedOrgId,
  onSelectOrg,
  breakdownOrgId,
  breakdownScope,
  onSearchOrgs,
  showOrgFilter,
  onUpdatePayment,
  onEditDetails,
  onContact,
  onCompleteTrialPayment,
  isCompletingTrialPayment,
  hasTrialApproval,
  onOpenTrialApproval,
  onRetry,
  canManageBilling
}: OverviewProps) => {
  const orgFilter = showOrgFilter ? (
    <RootOrgFilter
      orgs={rootOrgs}
      totalCount={rootOrgCount}
      isLoading={isRootOrgsLoading}
      value={selectedOrgId}
      onChange={onSelectOrg}
      onSearchChange={onSearchOrgs}
    />
  ) : null;

  if (subState === "loading" || isReloading) {
    return <TabbedOverviewSkeleton orgFilter={orgFilter} />;
  }

  if (subState === "error" || !overview) {
    return (
      <Stack gap={24}>
        {orgFilter}
        <EmptyState
          icon="alert"
          title="Couldn't load your subscription"
          description="There was a problem reaching the billing service. Your products are unaffected."
          actions={
            <Button variant="outline" icon="sync" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      </Stack>
    );
  }

  const { mode, checkoutFrozen } = overview;
  const isManaged = mode === "managed";
  // A frozen checkout disables every mutation path, so treat the products area as read-only and
  // never offer a control that would 503.
  const productsReadOnly = isManaged || !canManageBilling || checkoutFrozen;

  return (
    <Stack gap={16}>
      {checkoutFrozen && !isManaged && (
        <Alert tone="warn" title="Billing changes are temporarily paused">
          Purchases and plan changes are unavailable right now. Your current subscription is
          unaffected; please check back shortly.
        </Alert>
      )}
      <Banner
        mode={mode}
        subState={subState}
        canManage={canManageBilling}
        paymentAlert={overview.paymentAlert}
        onUpdatePayment={onUpdatePayment}
        onManageSubscription={onManageSubscription}
      />
      <TrialBanners
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        onManage={onUpgrade}
        onUpdatePayment={onUpdatePayment}
        onContact={onContact}
        onCompleteTrialPayment={onCompleteTrialPayment}
        isCompletingTrialPayment={isCompletingTrialPayment}
        hasTrialApproval={hasTrialApproval}
        onOpenTrialApproval={onOpenTrialApproval}
      />
      <TabbedOverview
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        canManageBilling={canManageBilling}
        orgFilter={orgFilter}
        breakdownOrgId={breakdownOrgId}
        breakdownScope={breakdownScope}
        onManage={onUpgrade}
        onRemove={onRemove}
        onUpdatePayment={onUpdatePayment}
        onEditDetails={onEditDetails}
        onContact={onContact}
      />
    </Stack>
  );
};
