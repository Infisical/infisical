import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Organization, BillingV2Overview } from "@app/hooks/api";

import { BillingV2RenderState } from "../billing-v2-view-types";
import { ErrorPanel } from "./states/ErrorPanel";
import { Banner } from "./Banner";
import { RootOrgFilter } from "./RootOrgFilter";
import { TabbedOverview, TabbedOverviewSkeleton } from "./TabbedOverview";
import { TrialBanners } from "./TrialBanners";

export type OverviewProps = {
  overview?: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  subState: BillingV2RenderState;
  onManageSubscription: () => void;
  onUpgrade: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
  rootOrgs: BillingV2Organization[];
  rootOrgCount: number;
  isRootOrgsLoading: boolean;
  isReloading: boolean;
  selectedOrgId: string;
  onSelectOrg: (orgId: string) => void;
  onSearchOrgs: (search: string) => void;
  showOrgFilter: boolean;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
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
  onSetCommitment,
  onViewBreakdown,
  rootOrgs,
  rootOrgCount,
  isRootOrgsLoading,
  isReloading,
  selectedOrgId,
  onSelectOrg,
  onSearchOrgs,
  showOrgFilter,
  onUpdatePayment,
  onEditDetails,
  onContact,
  onRetry,
  canManageBilling
}: OverviewProps) => {
  const [tab, setTab] = useState("overview");
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

  const { mode, checkoutFrozen, selfServe } = overview;
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
      {/* An enterprise-managed org (billing_method enterprise_*) sees the surface but self-serve is
          off; the per-product controls are hidden and this points them to sales. */}
      {!selfServe && !isManaged && (
        <Alert variant="info">
          <TriangleAlert />
          <AlertTitle>Managed Billing</AlertTitle>
          <AlertDescription>
            Contact your Infisical account manager to adjust products, commitments, or your
            subscription.
          </AlertDescription>
        </Alert>
      )}
      <Banner
        mode={mode}
        subState={subState}
        canManage={canManageBilling}
        onUpdatePayment={onUpdatePayment}
        onManageSubscription={onManageSubscription}
      />
      {subState !== "no-subscription" && (
        <TrialBanners
          overview={overview}
          catalog={catalog}
          readOnly={productsReadOnly}
          onManage={onUpgrade}
          onUpdatePayment={onUpdatePayment}
          onContact={onContact}
        />
      )}
      <TabbedOverview
        tab={tab}
        onTabChange={setTab}
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        canManageBilling={canManageBilling}
        orgFilter={orgFilter}
        onManage={onUpgrade}
        onSetCommitment={onSetCommitment}
        onViewBreakdown={onViewBreakdown}
        onUpdatePayment={onUpdatePayment}
        onEditDetails={onEditDetails}
        onContact={onContact}
      />
    </div>
  );
};
