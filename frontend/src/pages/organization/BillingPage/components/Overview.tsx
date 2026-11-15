import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingOrganization,
  BillingOverview
} from "@app/hooks/api";

import { BillingRenderState } from "../billing-view-types";
import { Banner } from "./Banner";
import { RootOrgFilter } from "./RootOrgFilter";
import { ErrorPanel } from "./states/ErrorPanel";
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

// Composes the billing overview by render state: loading → skeleton, error/no-overview → error panel,
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
      <div className="flex flex-col gap-4">
        {/* The picker stays reachable so a failing organization is not a dead end. */}
        {orgFilter && <div className="flex justify-end">{orgFilter}</div>}
        <ErrorPanel onRetry={onRetry} />
      </div>
    );
  }

  const { mode, checkoutFrozen } = overview;
  const isManaged = mode === "managed";
  // Managed plans and read-only billing roles cannot mutate the subscription. A frozen checkout
  // (server DISABLE_CHECKOUT) disables every mutation path too, so treat it as read-only for the
  // products area and show a notice — the customer never reaches a control that would 503.
  const productsReadOnly = isManaged || !canManageBilling || checkoutFrozen;

  return (
    <div className="flex flex-col gap-4">
      {checkoutFrozen && !isManaged && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Billing changes are temporarily paused</AlertTitle>
          <AlertDescription>
            Purchases and plan changes are unavailable right now. Your current subscription is
            unaffected; please check back shortly.
          </AlertDescription>
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
    </div>
  );
};
