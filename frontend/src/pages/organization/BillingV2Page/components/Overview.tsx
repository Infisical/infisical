import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2CatalogProduct, BillingV2Overview } from "@app/hooks/api";

import { BillingV2RenderState } from "../billing-v2-view-types";
import { BillingHeaderCard } from "./cards/BillingHeaderCard";
import { DetailsCard } from "./cards/DetailsCard";
import { InvoicesCard } from "./cards/InvoicesCard";
import { PaymentCard } from "./cards/PaymentCard";
import { ProductsCard } from "./cards/ProductsCard";
import { ErrorPanel } from "./states/ErrorPanel";
import { OverviewSkeleton } from "./states/OverviewSkeleton";
import { Banner } from "./Banner";

export type OverviewProps = {
  overview?: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  subState: BillingV2RenderState;
  onManageSubscription: () => void;
  onUpgrade: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
  onRetry: () => void;
  canManageBilling: boolean;
};

// Composes the billing overview by render state: loading → skeleton, error/no-overview → error panel,
// no-subscription → banner + products, otherwise the full active layout. Each section is its own
// component under components/ (cards/, deprecation/, states/); this file only routes and lays them out.
export const Overview = ({
  overview,
  catalog,
  subState,
  onManageSubscription,
  onUpgrade,
  onSetCommitment,
  onUpdatePayment,
  onEditDetails,
  onContact,
  onRetry,
  canManageBilling
}: OverviewProps) => {
  if (subState === "loading") {
    return <OverviewSkeleton />;
  }

  if (subState === "error" || !overview) {
    return (
      <div className="flex flex-col gap-4">
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

  if (subState === "no-subscription") {
    return (
      <div className="flex flex-col gap-4">
        {frozenNotice}
        <Banner
          mode={mode}
          subState={subState}
          canManage={canManageBilling}
          onUpdatePayment={onUpdatePayment}
          onManageSubscription={onManageSubscription}
        />
        <ProductsCard
          overview={overview}
          catalog={catalog}
          readOnly={productsReadOnly}
          onManage={onUpgrade}
          onSetCommitment={onSetCommitment}
          onContact={onContact}
        />
      </div>
    );
  }

  const showPayment = overview.isCloud && !isManaged;

  return (
    <div className="flex flex-col gap-4">
      {frozenNotice}
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
      <BillingHeaderCard overview={overview} catalog={catalog} />
      <ProductsCard
        overview={overview}
        catalog={catalog}
        readOnly={productsReadOnly}
        onManage={onUpgrade}
        onSetCommitment={onSetCommitment}
        onContact={onContact}
      />
      {!isManaged && (
        // Payment (cloud-only) + details share a row, keyed off container width (sidebar resizes it).
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
      )}
      {showPayment && <InvoicesCard invoices={overview.invoices} />}
    </div>
  );
};
