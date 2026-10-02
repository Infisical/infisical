import { CSSProperties, ReactNode, useState } from "react";
import { ChevronRight, EllipsisVerticalIcon, PlusIcon, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useOrganization } from "@app/context";
import {
  BillingV2BreakdownScopeKind,
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  BillingV2Overview,
  useGetBillingV2UsageBreakdown,
  useRefreshBillingV2Entitlements
} from "@app/hooks/api";

import {
  byDisplayOrder,
  commitSavingsNudge,
  dimCommitted,
  dimOnDemandQuantity,
  fmtMoney,
  productAnnualCommitted,
  tierLabel
} from "../billing-v2-format";
import { DetailsCard } from "./cards/DetailsCard";
import { InvoicesCard } from "./cards/InvoicesCard";
import { PaymentCard } from "./cards/PaymentCard";
import { CardEmpty, ProductIcon } from "./shared";
import { breakdownableDimensions } from "./UsageBreakdownSheet";

type BreakdownTarget = {
  orgId: string;
  scope: BillingV2BreakdownScopeKind;
};

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const priceLabel = (ent: BillingV2Entitlement) => {
  const annual = productAnnualCommitted(ent);
  if (annual > 0) {
    return `${fmtMoney(annual)} / yr`;
  }
  const monthly = ent.cadence === "annual" ? 0 : (ent.amount ?? 0);
  if (monthly > 0) {
    return `${fmtMoney(monthly)} / mo`;
  }
  return "Included";
};

const planLine = (ent: BillingV2Entitlement) => {
  if (ent.trialPaymentDueAt) {
    return `Payment needed · access until ${ent.trialPaymentDueAt}`;
  }
  if (ent.isTrialing) {
    return ent.trialEndsAt ? `Trial ends ${ent.trialEndsAt}` : "Trial";
  }
  return [
    ent.planTier ? tierLabel(ent.planTier) : null,
    ent.cadence === "annual" ? "Yearly" : "Monthly",
    ent.renewsOn ? `Renews ${ent.renewsOn}` : null
  ]
    .filter(Boolean)
    .join(" · ");
};

const SectionLabel = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
    <h2 className="text-sm font-medium text-accent">{children}</h2>
    {action}
  </div>
);

// Usage above an annual commitment, which is billed monthly on-demand. This is the only state the
// overview raises as needing attention; it comes straight from the subscription, not a threshold.
const OverCommitmentItem = ({
  prod,
  ent,
  dim,
  canChangeCommitment,
  orgId,
  scope,
  onSetCommitment,
  onViewBreakdown
}: BreakdownTarget & {
  prod: BillingV2CatalogProduct;
  ent: BillingV2Entitlement;
  dim: BillingV2EntitlementDim;
  canChangeCommitment: boolean;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
}) => {
  const isBreakdownable = breakdownableDimensions(ent).some(({ key }) => key === dim.key);
  const { data, isPending } = useGetBillingV2UsageBreakdown(
    orgId,
    isBreakdownable ? dim.key : null,
    scope
  );
  const sources = data
    ? [...data.scopes]
        .filter((source) => source.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
    : [];

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-foreground">
            {dim.label} is{" "}
            <span className="font-medium text-warning">
              {dimOnDemandQuantity(dim).toLocaleString()} over
            </span>{" "}
            its {(dim.committed ?? 0).toLocaleString()} commitment
          </span>
          <span className="text-xs text-muted">
            {prod.name}
            {dim.onDemandAmount > 0
              ? ` · ${fmtMoney(dim.onDemandAmount, 2)} / mo billed on-demand`
              : ""}
          </span>
        </div>
        {canChangeCommitment && (
          <Button variant="outline" size="xs" onClick={() => onSetCommitment(prod.id)}>
            Change Commitment
          </Button>
        )}
      </div>
      {isBreakdownable && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {isPending && <Skeleton className="h-12 w-full" />}
          {data &&
            sources.map((source) => (
              <div key={source.orgId} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-accent">{source.name}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  <span className="text-foreground">{source.count.toLocaleString()}</span> ·{" "}
                  {share(source.count, data.scopedCount)}%
                </span>
              </div>
            ))}
          <button
            type="button"
            onClick={() => onViewBreakdown(prod.id, dim.key)}
            className="flex cursor-pointer items-center gap-0.5 self-start pt-1 text-xs text-accent hover:text-foreground"
          >
            See all sources
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </Card>
  );
};

const ProductRow = ({
  prod,
  ent,
  canChangePlan,
  isManaged,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: {
  prod: BillingV2CatalogProduct;
  ent: BillingV2Entitlement;
  canChangePlan: boolean;
  isManaged: boolean;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
}) => {
  const nudge = canChangePlan ? commitSavingsNudge(ent) : null;
  const hasBreakdown = breakdownableDimensions(ent).length > 0;
  const onDemand = ent.onDemandAmount ?? 0;
  const trialPlanName = ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductIcon product={prod} size={28} />
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              {prod.name}
              {ent.isTrialing && <Badge variant="info">Trial</Badge>}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </span>
            <span
              className={
                ent.trialPaymentDueAt ? "text-xs text-warning" : "truncate text-xs text-muted"
              }
            >
              {planLine(ent)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isManaged && (
            <div className="flex flex-col items-end">
              <span className="text-sm text-foreground tabular-nums">{priceLabel(ent)}</span>
              {onDemand > 0 && (
                <span className="text-xs text-warning tabular-nums">
                  +{fmtMoney(onDemand, 2)} / mo on-demand
                </span>
              )}
            </div>
          )}
          {(canChangePlan || hasBreakdown) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label={`${prod.name} options`} size="xs" variant="ghost-muted">
                  <EllipsisVerticalIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={2}>
                {canChangePlan && (
                  <DropdownMenuItem onClick={() => onManage(prod.id)}>Manage Plan</DropdownMenuItem>
                )}
                {nudge && (
                  <DropdownMenuItem onClick={() => onSetCommitment(prod.id)}>
                    Switch to Annual (save ~{nudge.savingsPct}%)
                  </DropdownMenuItem>
                )}
                {canChangePlan && hasBreakdown && <DropdownMenuSeparator />}
                {hasBreakdown && (
                  <DropdownMenuItem onClick={() => onViewBreakdown(prod.id)}>
                    View Usage Breakdown
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {trialPlanName && (
        <p className="pl-10 text-xs text-muted">
          Trialing {trialPlanName}
          {ent.trialPlanPaymentDueAt ? (
            <span className="text-warning">
              {` · access until ${ent.trialPlanPaymentDueAt}; confirm payment to upgrade.`}
            </span>
          ) : (
            <>
              {ent.trialPlanEndsAt ? ` until ${ent.trialPlanEndsAt}` : ""}; upgrades automatically
              when the trial ends.
            </>
          )}
        </p>
      )}
      {(ent.dimensions ?? []).length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 pl-10 text-sm text-accent">
          {(ent.dimensions ?? []).map((dim) => (
            <span key={dim.key} className="whitespace-nowrap">
              <span className="font-medium text-foreground tabular-nums">
                {dim.used.toLocaleString()}
              </span>
              {dim.limit !== null && dim.limit > 0 && (
                <span className="text-muted"> / {dim.limit.toLocaleString()}</span>
              )}{" "}
              {dim.label}
              {dimCommitted(dim) && (
                <span className="text-muted">
                  {" "}
                  ({(dim.committed ?? 0).toLocaleString()} committed)
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// Shown in place of the product list when the org holds none: every product it can start, with its
// activate / trial / contact action.
const AvailableProducts = ({
  products,
  readOnly,
  onManage,
  onContact
}: {
  products: BillingV2CatalogProduct[];
  readOnly: boolean;
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => (
  <Card className="gap-0 p-0">
    {products.map((prod, index) => {
      const selfServe = prod.plans.some((plan) => plan.selfServe);
      const salesLed = prod.plans.some((plan) => plan.salesLed);
      const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
      let action: ReactNode = null;
      if (!readOnly && selfServe) {
        action = (
          <Button
            variant="product"
            size="xs"
            style={{ "--product-color": prod.color } as CSSProperties}
            onClick={() => onManage(prod.id)}
          >
            {trialPlan && trialPlan.trialDays > 0
              ? `Try Free for ${trialPlan.trialDays} Days`
              : "Activate"}
          </Button>
        );
      } else if (!readOnly && salesLed) {
        action = (
          <Button variant="outline" size="xs" onClick={() => onContact(prod)}>
            Contact Sales
          </Button>
        );
      }
      return (
        <div
          key={prod.id}
          className={cn(
            "flex flex-wrap items-center gap-3 px-5 py-4",
            index > 0 && "border-t border-border"
          )}
        >
          <ProductIcon product={prod} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </span>
            {prod.tagline && <span className="text-xs text-muted">{prod.tagline}</span>}
          </div>
          {action}
        </div>
      );
    })}
  </Card>
);

const SKELETON_ROWS = ["product-a", "product-b", "product-c"];

// Loading shape for the attention-first overview. The org picker stays live so a slow organization is
// not a dead end.
export const AttentionOverviewSkeleton = ({ orgFilter }: { orgFilter?: ReactNode }) => (
  <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-10" />
      <Card className="flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-8 w-36" />
      </Card>
    </div>
    <div className="flex flex-col gap-3">
      <SectionLabel action={orgFilter}>Products</SectionLabel>
      <Card className="gap-0 p-0">
        {SKELETON_ROWS.map((key, index) => (
          <div
            key={key}
            className={cn("flex flex-col gap-3 px-5 py-4", index > 0 && "border-t border-border")}
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-md" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            <Skeleton className="ml-10 h-4 w-72" />
          </div>
        ))}
      </Card>
    </div>
  </div>
);

type AttentionOverviewProps = BreakdownTarget & {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly: boolean;
  canManageBilling: boolean;
  orgFilter?: ReactNode;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
  onUpdatePayment: () => void;
  onEditDetails: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

// Billing page as one quiet column: a plan line, an attention section only when usage runs over a
// commitment, the product list, and billing administration in a sheet. Every loaded mode renders
// here: subscribed or not, cloud or managed.
export const AttentionOverview = ({
  overview,
  catalog,
  readOnly,
  canManageBilling,
  orgFilter,
  orgId,
  scope,
  onManage,
  onSetCommitment,
  onViewBreakdown,
  onUpdatePayment,
  onEditDetails,
  onContact
}: AttentionOverviewProps) => {
  const { currentOrg } = useOrganization();
  const refreshEntitlements = useRefreshBillingV2Entitlements();
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const { billing, entitlements, payment } = overview;
  const isManaged = overview.mode === "managed";
  const isSubscribed = overview.subState !== "no-subscription";
  const hasBillingHistory =
    Boolean(payment) || Boolean(overview.billingDetails) || overview.invoices.length > 0;
  const showPayment = overview.isCloud && !isManaged;
  // Billing administration exists only for self-serve orgs, and without a subscription only once
  // there is something to look at.
  const showAdmin = !isManaged && (isSubscribed || hasBillingHistory);
  const canChangePlan = !readOnly && overview.selfServe;

  // A deprecated product stays visible to existing subscribers but is closed to new ones.
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const products = visible
    .filter((prod) => entitlements[prod.id]?.entitled)
    .map((prod) => ({ prod, ent: entitlements[prod.id] }));
  const available = visible.filter((prod) => !entitlements[prod.id]?.entitled);
  const overCommitted = products.flatMap(({ prod, ent }) =>
    (ent.dimensions ?? [])
      .filter((dim) => dimOnDemandQuantity(dim) > 0)
      .map((dim) => ({ prod, ent, dim }))
  );

  const recurring = [
    billing.monthlyRecurring > 0 ? `${fmtMoney(billing.monthlyRecurring)} / mo recurring` : null,
    billing.annualCommitted > 0 ? `${fmtMoney(billing.annualCommitted)} / yr committed` : null,
    showPayment && payment ? `${payment.brand.toUpperCase()} •••• ${payment.last4}` : null
  ].filter(Boolean);

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Plan</SectionLabel>
        <Card className="flex-row flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {isManaged && (
              <>
                <span className="text-sm text-foreground">
                  Managed by your account team · {billing.activeProductCount}{" "}
                  {billing.activeProductCount === 1 ? "product" : "products"}
                </span>
                <span className="text-xs text-muted">
                  Products and limits on this organization are set by contract. Contact your account
                  manager to make changes.
                </span>
              </>
            )}
            {!isManaged && !isSubscribed && (
              <>
                <span className="text-sm text-foreground">No active subscription</span>
                <span className="text-xs text-muted">
                  {available.length > 0
                    ? "Activate a product below to start one."
                    : "There are no products to activate yet."}
                </span>
              </>
            )}
            {!isManaged && isSubscribed && (
              <>
                <span className="text-sm text-foreground">
                  {billing.nextCharge ? (
                    <>
                      Next charge{" "}
                      <span className="font-medium tabular-nums">
                        {fmtMoney(billing.nextCharge.amount)}
                      </span>{" "}
                      on {billing.nextCharge.at}
                      {billing.nextCharge.hasUsage ? " (includes usage)" : ""}
                    </>
                  ) : (
                    "No upcoming charge"
                  )}
                </span>
                {recurring.length > 0 && (
                  <span className="text-xs text-muted">{recurring.join(" · ")}</span>
                )}
              </>
            )}
          </div>
          {showAdmin && (
            <Button variant="outline" size="sm" onClick={() => setIsAdminOpen(true)}>
              {showPayment ? "Invoices & Payment" : "Billing Details"}
            </Button>
          )}
        </Card>
      </div>

      {overCommitted.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Needs attention</SectionLabel>
          {overCommitted.map(({ prod, ent, dim }) => (
            <OverCommitmentItem
              key={`${prod.id}:${dim.key}`}
              prod={prod}
              ent={ent}
              dim={dim}
              canChangeCommitment={canChangePlan}
              orgId={orgId}
              scope={scope}
              onSetCommitment={onSetCommitment}
              onViewBreakdown={onViewBreakdown}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionLabel
          action={
            <div className="flex flex-wrap items-center gap-2">
              {orgFilter}
              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      isDisabled={refreshEntitlements.isPending}
                      onClick={handleRefresh}
                    >
                      <RefreshCw />
                      Refresh
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Plan changes may take a few minutes to take effect.
                  </TooltipContent>
                </Tooltip>
              )}
              {!readOnly && products.length > 0 && available.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="xs">
                      <PlusIcon />
                      Add Product
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={2} className="w-72">
                    {available.map((prod) => {
                      const selfServe = prod.plans.some((plan) => plan.selfServe);
                      const salesLed = prod.plans.some((plan) => plan.salesLed);
                      const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
                      if (!selfServe && !salesLed) {
                        return null;
                      }
                      let hint = "Contact sales";
                      if (selfServe) {
                        hint =
                          trialPlan && trialPlan.trialDays > 0
                            ? `${trialPlan.trialDays}-day free trial`
                            : "Activate";
                      }
                      return (
                        <DropdownMenuItem
                          key={prod.id}
                          onClick={() => (selfServe ? onManage(prod.id) : onContact(prod))}
                        >
                          <ProductIcon product={prod} size={24} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm">{prod.name}</span>
                            <span className="text-xs text-muted">{hint}</span>
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        >
          Products
        </SectionLabel>
        {products.length === 0 && available.length === 0 && (
          <CardEmpty
            title="No products available"
            description="Products will appear here once they're available."
          />
        )}
        {products.length === 0 && available.length > 0 && (
          <AvailableProducts
            products={available}
            readOnly={readOnly}
            onManage={onManage}
            onContact={onContact}
          />
        )}
        {products.length > 0 && (
          <Card className="gap-0 p-0">
            {products.map(({ prod, ent }, index) => (
              <div key={prod.id} className={cn(index > 0 && "border-t border-border")}>
                <ProductRow
                  prod={prod}
                  ent={ent}
                  canChangePlan={canChangePlan}
                  isManaged={isManaged}
                  onManage={onManage}
                  onSetCommitment={onSetCommitment}
                  onViewBreakdown={onViewBreakdown}
                />
              </div>
            ))}
          </Card>
        )}
      </div>

      {showAdmin && (
        <Sheet open={isAdminOpen} onOpenChange={setIsAdminOpen}>
          <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{showPayment ? "Invoices & Payment" : "Billing Details"}</SheetTitle>
              <SheetDescription>
                {showPayment
                  ? "Billing history, payment method, and billing contact."
                  : "Billing contact and address."}
              </SheetDescription>
            </SheetHeader>
            <Tabs
              defaultValue={showPayment ? "invoices" : "details"}
              className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4"
            >
              <TabsList variant="org">
                {showPayment && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
                {showPayment && <TabsTrigger value="payment">Payment Method</TabsTrigger>}
                <TabsTrigger value="details">Billing Details</TabsTrigger>
              </TabsList>
              {showPayment && (
                <TabsContent value="invoices">
                  <InvoicesCard invoices={overview.invoices} />
                </TabsContent>
              )}
              {showPayment && (
                <TabsContent value="payment">
                  <PaymentCard
                    overview={overview}
                    canManage={canManageBilling}
                    onUpdate={onUpdatePayment}
                  />
                </TabsContent>
              )}
              <TabsContent value="details">
                <DetailsCard
                  overview={overview}
                  canManage={canManageBilling}
                  onEdit={onEditDetails}
                />
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};
