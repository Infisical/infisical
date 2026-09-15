import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2CatalogProduct, BillingV2Organization, BillingV2Overview } from "@app/hooks/api";

import { BillingV2RenderState } from "../billing-v2-view-types";
import { BillingHeaderCard } from "./cards/BillingHeaderCard";
import { DetailsCard } from "./cards/DetailsCard";
import { InvoicesCard } from "./cards/InvoicesCard";
import { PaymentCard } from "./cards/PaymentCard";
import { ProductsCard } from "./cards/ProductsCard";
import { ErrorPanel } from "./states/ErrorPanel";
import { OverviewSkeleton } from "./states/OverviewSkeleton";
import { Banner } from "./Banner";
import { RootOrgFilter } from "./RootOrgFilter";
import { TrialBanners } from "./TrialBanners";

export type OverviewProps = {
  overview?: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  subState: BillingV2RenderState;
  onManageSubscription: () => void;
  onUpgrade: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string) => void;
  rootOrgs: BillingV2Organization[];
  rootOrgCount: number;
  isRootOrgsLoading: boolean;
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

  if (subState === "loading") {
    return (
      <div className="flex flex-col gap-4">
        {orgFilter}
        <OverviewSkeleton />
      </div>
    );
  }

  if (subState === "error" || !overview) {
    return (
      <div className="flex flex-col gap-4">
        {orgFilter}
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

  const frozenNotice =
    checkoutFrozen && !isManaged ? (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>Billing changes are temporarily paused</AlertTitle>
        <AlertDescription>
          Purchases and plan changes are unavailable right now. Your current subscription is
          unaffected; please check back shortly.
        </AlertDescription>
      </Alert>
    ) : null;

  // An enterprise-managed org (billing_method enterprise_*) sees the surface but self-serve is off; the
  // per-product controls render disabled and this points them to sales. Distinct from checkoutFrozen.
  const enterpriseNotice =
    !selfServe && !isManaged ? (
      <Alert variant="info">
        <TriangleAlert />
        <AlertTitle>Managed Billing</AlertTitle>
        <AlertDescription>
          Contact your Infisical account manager to adjust products, commitments, or your
          subscription.
        </AlertDescription>
      </Alert>
    ) : null;

  const showPayment = overview.isCloud && !isManaged;

  const hasBillingHistory =
    Boolean(overview.payment) || Boolean(overview.billingDetails) || overview.invoices.length > 0;

  const billingSection = !isManaged && (
    <>
      <div className="@container">
        <div className={cn("grid gap-4", showPayment && "@3xl:grid-cols-[2fr_3fr]")}>
          {showPayment && (
            <PaymentCard
              overview={overview}
              canManage={canManageBilling}
              onUpdate={onUpdatePayment}
            />
          )}
          <DetailsCard overview={overview} canManage={canManageBilling} onEdit={onEditDetails} />
        </div>
      </div>
      {showPayment && <InvoicesCard invoices={overview.invoices} />}
    </>
  );

  if (subState === "no-subscription") {
    return (
      <div className="flex flex-col gap-4">
        {frozenNotice}
        {enterpriseNotice}
        <Banner
          mode={mode}
          subState={subState}
          canManage={canManageBilling}
          onUpdatePayment={onUpdatePayment}
          onManageSubscription={onManageSubscription}
        />
        {orgFilter}
        <ProductsCard
          overview={overview}
          catalog={catalog}
          readOnly={productsReadOnly}
          onManage={onUpgrade}
          onSetCommitment={onSetCommitment}
          onViewBreakdown={onViewBreakdown}
          onContact={onContact}
        />
        {hasBillingHistory && billingSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {frozenNotice}
      {enterpriseNotice}
      <Banner
        mode={mode}
        subState={subState}
        canManage={canManageBilling}
        onUpdatePayment={onUpdatePayment}
        onManageSubscription={onManageSubscription}
      />
      {/* <DeprecationBanners
        overview={overview}
        catalog={catalog}
        onManage={onUpgrade}
        onContact={onContact}
      /> */}
      <TrialBanners
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        onManage={onUpgrade}
        onUpdatePayment={onUpdatePayment}
        onContact={onContact}
      />
      <BillingHeaderCard overview={overview} catalog={catalog} />
      {orgFilter}
      <ProductsCard
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        onManage={onUpgrade}
        onSetCommitment={onSetCommitment}
        onViewBreakdown={onViewBreakdown}
        onContact={onContact}
      />
      {billingSection}
    </div>
  );
};
