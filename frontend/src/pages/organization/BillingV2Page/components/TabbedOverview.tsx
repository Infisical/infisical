import { ReactNode, useEffect, useState } from "react";
import { ChevronRightIcon, InfoIcon, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardContent,
  IconButton,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  BillingV2BreakdownScopeKind,
  BillingV2CatalogProduct,
  BillingV2Overview,
  useRefreshBillingV2Entitlements
} from "@app/hooks/api";

import {
  byDisplayOrder,
  cadenceLabel,
  fmtMoneyCents,
  nextChargeProductLabel
} from "../billing-v2-format";
import { DetailsCard } from "./cards/DetailsCard";
import { InvoicesCard } from "./cards/InvoicesCard";
import { PaymentCard } from "./cards/PaymentCard";
import { InactiveProductCard, ProductOverviewCard } from "./ProductOverviewCard";
import { CardEmpty } from "./shared";

type TabbedOverviewProps = {
  tab: string;
  onTabChange: (tab: string) => void;
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly: boolean;
  canManageBilling: boolean;
  orgFilter?: ReactNode;
  breakdownOrgId: string;
  breakdownScope: BillingV2BreakdownScopeKind;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ACCOUNT_STATUS = {
  trialing: { label: "Trial", variant: "info" },
  "past-due": { label: "Past Due", variant: "warning" },
  suspended: { label: "Suspended", variant: "danger" }
} as const;

const SKELETON_PRODUCTS = ["product-a", "product-b", "product-c", "product-d"];

export const TabbedOverviewSkeleton = ({ orgFilter }: { orgFilter?: ReactNode }) => (
  <div className="flex flex-col gap-6">
    {orgFilter && <div className="flex justify-end">{orgFilter}</div>}
    <div className="flex h-9 items-end gap-6 border-b border-border">
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-2 h-4 w-14" />
      <Skeleton className="mb-2 h-4 w-14" />
    </div>
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SKELETON_PRODUCTS.map((key) => (
          <Card key={key}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  </div>
);

export const TabbedOverview = ({
  tab,
  onTabChange,
  overview,
  catalog,
  readOnly,
  canManageBilling,
  orgFilter,
  breakdownOrgId,
  breakdownScope,
  onManage,
  onSetCommitment,
  onViewBreakdown,
  onUpdatePayment,
  onEditDetails,
  onContact
}: TabbedOverviewProps) => {
  const { currentOrg } = useOrganization();
  const refreshEntitlements = useRefreshBillingV2Entitlements();
  const [expanded, setExpanded] = useState<{ productId: string; dimensionKey?: string } | null>(
    null
  );
  const { billing, entitlements } = overview;
  const isManaged = overview.mode === "managed";
  const isSubscribed = overview.subState !== "no-subscription";
  const hasBillingHistory =
    Boolean(overview.payment) || Boolean(overview.billingDetails) || overview.invoices.length > 0;
  const showPayment = overview.isCloud && !isManaged;
  const showInvoicesTab = showPayment && (isSubscribed || overview.invoices.length > 0);
  const showPaymentTab = !isManaged && (isSubscribed || hasBillingHistory);
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const isActiveProduct = (productId: string) =>
    Boolean(entitlements[productId]?.entitled) && entitlements[productId]?.status !== "churned";
  const expandedProduct =
    expanded &&
    visible.some((prod) => prod.id === expanded.productId) &&
    isActiveProduct(expanded.productId)
      ? expanded
      : null;
  const hasTabs = showInvoicesTab || showPaymentTab;
  const activeTab =
    (tab === "invoices" && !showInvoicesTab) || (tab === "payment" && !showPaymentTab)
      ? "overview"
      : tab;
  const accountStatus =
    overview.subState in ACCOUNT_STATUS
      ? ACCOUNT_STATUS[overview.subState as keyof typeof ACCOUNT_STATUS]
      : null;
  const { nextCharge } = billing;
  let accountTeamNote: { label: string; detail: string } | null = null;
  if (isManaged) {
    accountTeamNote = {
      label: "Managed by your account team",
      detail:
        "Products and limits on this organization are set by contract. Contact your account manager to make changes."
    };
  } else if (!overview.selfServe) {
    accountTeamNote = {
      label: "Managed Billing",
      detail:
        "Contact your Infisical account manager to adjust products, commitments, or your subscription."
    };
  }

  useEffect(() => {
    onTabChange(activeTab);
  }, [activeTab, onTabChange]);

  const handleRefresh = () => {
    refreshEntitlements.mutate(
      { orgId: currentOrg.id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: "Entitlements refreshed." });
        }
      }
    );
  };

  let summaryLeft: ReactNode;
  if (isManaged) {
    summaryLeft = (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-accent">Billing Method</span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg leading-6 font-medium">Contract</span>
          <span className="text-xs text-muted">Set by your license</span>
        </span>
      </div>
    );
  } else if (!isSubscribed) {
    summaryLeft = (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-accent">Subscription</span>
        <span className="flex items-baseline gap-2">
          <span className="text-lg leading-6 font-medium">None</span>
          <span className="text-xs text-muted">
            {visible.some(
              (prod) =>
                !entitlements[prod.id]?.entitled || entitlements[prod.id]?.status === "churned"
            )
              ? "Activate a product to start one"
              : "No products to activate"}
          </span>
        </span>
      </div>
    );
  } else {
    const chargeDetail = nextCharge
      ? [nextChargeProductLabel(catalog, nextCharge.productKeys), cadenceLabel(nextCharge.cadence)]
          .filter(Boolean)
          .join(" · ")
      : "";
    summaryLeft = (
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs text-accent">
          Next Charge
          {accountStatus && <Badge variant={accountStatus.variant}>{accountStatus.label}</Badge>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-lg leading-6 font-medium tabular-nums">
            {nextCharge ? fmtMoneyCents(nextCharge.amount) : "Nothing due"}
          </span>
          {nextCharge && <span className="text-xs text-muted">· {nextCharge.at}</span>}
          {nextCharge && (chargeDetail || overview.onDemandAmount > 0) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton size="2xs" variant="ghost-muted" aria-label="Next charge details">
                  <InfoIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>
                <span className="flex flex-col gap-0.5">
                  {chargeDetail && <span>{chargeDetail}</span>}
                  {nextCharge.hasUsage && <span>Estimate includes usage to date</span>}
                  {overview.onDemandAmount > 0 && (
                    <span className="text-warning">
                      +{fmtMoneyCents(overview.onDemandAmount)} on-demand this period
                    </span>
                  )}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
    );
  }

  let summaryRight: ReactNode = null;
  if (isManaged) {
    summaryRight = (
      <span className="text-xs text-muted">
        {billing.activeProductCount.toLocaleString()} active{" "}
        {billing.activeProductCount === 1 ? "product" : "products"}
      </span>
    );
  } else if (showPayment && overview.payment) {
    summaryRight = (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className="text-xs text-accent">Card on File</span>
        <Button
          variant="text"
          size="xs"
          onClick={() => (showPaymentTab ? onTabChange("payment") : onUpdatePayment())}
        >
          {`${overview.payment.brand.toUpperCase()} ···· ${overview.payment.last4}`}
          <ChevronRightIcon />
        </Button>
      </div>
    );
  } else if (showPayment && isSubscribed && canManageBilling) {
    summaryRight = (
      <Button variant="outline" size="xs" onClick={onUpdatePayment}>
        Add Payment Method
      </Button>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col gap-6">
      {orgFilter && <div className="flex justify-end">{orgFilter}</div>}
      {hasTabs && (
        <TabsList variant="org">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showInvoicesTab && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
          {showPaymentTab && <TabsTrigger value="payment">Payment</TabsTrigger>}
        </TabsList>
      )}

      <TabsContent
        value="overview"
        tabIndex={visible.length > 0 ? -1 : 0}
        className="flex flex-col gap-4"
      >
        <Card aria-label="Billing summary">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {summaryLeft}
            <div className="flex flex-wrap items-center gap-3">
              {accountTeamNote && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  {accountTeamNote.label}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        size="2xs"
                        variant="ghost-muted"
                        aria-label={`About ${accountTeamNote.label.toLowerCase()}`}
                      >
                        <InfoIcon />
                      </IconButton>
                    </TooltipTrigger>
                    <TooltipContent>{accountTeamNote.detail}</TooltipContent>
                  </Tooltip>
                </span>
              )}
              {summaryRight}
              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="Refresh entitlements"
                      variant="ghost-muted"
                      size="xs"
                      isDisabled={refreshEntitlements.isPending}
                      onClick={handleRefresh}
                    >
                      <RefreshCw />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    Plan changes may take a few minutes to take effect.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </Card>

        {visible.length === 0 ? (
          <Card>
            <CardContent>
              <CardEmpty
                title="No products available"
                description="Products will appear here once they're available."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            {visible.map((prod) => {
              const ent = entitlements[prod.id];
              if (ent && isActiveProduct(prod.id)) {
                const isExpanded = expandedProduct?.productId === prod.id;
                return (
                  <ProductOverviewCard
                    key={prod.id}
                    prod={prod}
                    ent={ent}
                    readOnly={readOnly}
                    selfServe={overview.selfServe}
                    isManaged={isManaged}
                    breakdownOrgId={breakdownOrgId}
                    breakdownScope={breakdownScope}
                    isExpanded={isExpanded}
                    isDimmed={Boolean(expandedProduct) && !isExpanded}
                    selectedDimensionKey={isExpanded ? expandedProduct?.dimensionKey : undefined}
                    onExpand={(dimensionKey) =>
                      setExpanded({
                        productId: prod.id,
                        dimensionKey:
                          dimensionKey ?? (isExpanded ? expandedProduct?.dimensionKey : undefined)
                      })
                    }
                    onCollapse={() => setExpanded(null)}
                    onManage={onManage}
                    onSetCommitment={onSetCommitment}
                    onViewBreakdown={onViewBreakdown}
                  />
                );
              }
              return (
                <InactiveProductCard
                  key={prod.id}
                  isDimmed={Boolean(expandedProduct)}
                  prod={prod}
                  readOnly={readOnly}
                  isManaged={isManaged}
                  selfServe={overview.selfServe}
                  onManage={onManage}
                  onContact={onContact}
                />
              );
            })}
          </div>
        )}
      </TabsContent>

      {showInvoicesTab && (
        <TabsContent
          value="invoices"
          tabIndex={overview.invoices.some((invoice) => invoice.pdfUrl) ? -1 : 0}
        >
          <InvoicesCard invoices={overview.invoices} />
        </TabsContent>
      )}

      {showPaymentTab && (
        <TabsContent
          value="payment"
          tabIndex={canManageBilling ? -1 : 0}
          className="grid items-start gap-6 xl:grid-cols-2"
        >
          {showPayment && (
            <PaymentCard
              overview={overview}
              canManage={canManageBilling}
              onUpdate={onUpdatePayment}
            />
          )}
          <DetailsCard overview={overview} canManage={canManageBilling} onEdit={onEditDetails} />
        </TabsContent>
      )}
    </Tabs>
  );
};
