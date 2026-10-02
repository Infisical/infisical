import { CSSProperties, ReactNode, useEffect } from "react";
import { CheckIcon, EllipsisVerticalIcon, InfoIcon, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
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
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  BillingV2Overview,
  useRefreshBillingV2Entitlements
} from "@app/hooks/api";

import {
  byDisplayOrder,
  commitSavingsNudge,
  dimCommitted,
  dimMonthlyRate,
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

type ActiveProduct = { prod: BillingV2CatalogProduct; ent: BillingV2Entitlement };

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
  if (ent.isTrialing) {
    return ent.trialEndsAt ? `Trial ends ${ent.trialEndsAt}` : "Trial";
  }
  return [
    ent.cadence && (ent.cadence === "annual" ? "Yearly" : "Monthly"),
    ent.renewsOn ? `Renews ${ent.renewsOn}` : null
  ]
    .filter(Boolean)
    .join(" · ");
};

const meterNote = (dim: BillingV2EntitlementDim, showPricing: boolean): ReactNode => {
  let usageNote: ReactNode;
  if (dimCommitted(dim)) {
    const overflow = dimOnDemandQuantity(dim);
    usageNote = (
      <>
        of {(dim.committed ?? 0).toLocaleString()} committed
        {overflow > 0 && (
          <span className="text-warning"> · {overflow.toLocaleString()} on-demand</span>
        )}
      </>
    );
  } else if (dim.limit !== null && dim.limit > 0) {
    usageNote = `of ${dim.limit.toLocaleString()}`;
  }
  const rate = dimMonthlyRate(dim);
  const prices: string[] = [];
  if (showPricing && dimCommitted(dim) && dim.committedRate !== undefined) {
    prices.push(`${fmtMoney(dim.committedRate, 2)} per ${dim.noun} / yr committed`);
  }
  if (showPricing && rate > 0) {
    prices.push(
      `${fmtMoney(rate, 2)} per ${dim.noun} / mo${dimCommitted(dim) ? " on-demand" : ""}`
    );
  }
  if (!usageNote && prices.length === 0) return undefined;
  return (
    <>
      {usageNote}
      {prices.map((price) => (
        <span key={price} className="block">
          {price}
        </span>
      ))}
    </>
  );
};

const Metric = ({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <span className="text-xs text-accent">{label}</span>
    <span className="text-lg leading-tight font-medium text-foreground tabular-nums">{value}</span>
    {note && <span className="text-xs text-muted">{note}</span>}
  </div>
);

type TabbedOverviewProps = {
  tab: string;
  onTabChange: (tab: string) => void;
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

const ProductPlansPopover = ({
  prod,
  currentTier
}: {
  prod: BillingV2CatalogProduct;
  currentTier?: string;
}) => {
  const plans = prod.plans
    .filter((plan) => !plan.deprecated || plan.tier === currentTier)
    .sort(byDisplayOrder);
  if (plans.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`View plans for ${prod.name}`}>
          View Plans
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={`${prod.name} plans`}>
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{prod.name} plans</span>
          {plans.map((plan) => (
            <div key={plan.tier} className="flex items-center justify-between gap-3">
              <span className="text-sm">{plan.name}</span>
              {plan.tier === currentTier && <Badge variant="neutral">Current</Badge>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ProductOverviewCard = ({
  prod,
  ent,
  readOnly,
  selfServe,
  isManaged,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: ActiveProduct & {
  readOnly: boolean;
  selfServe: boolean;
  isManaged: boolean;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
}) => {
  const canChangePlan = !readOnly && selfServe;
  const nudge = canChangePlan ? commitSavingsNudge(ent) : null;
  const hasBreakdown = breakdownableDimensions(ent).length > 0;
  const onDemand = ent.onDemandAmount ?? 0;
  const planName = ent.planTier
    ? (prod.plans.find((plan) => plan.tier === ent.planTier)?.name ?? tierLabel(ent.planTier))
    : "Included";
  const price = priceLabel(ent);
  const planDetail = planLine(ent);
  const trialPlanName = ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="row-span-2 flex min-w-0 items-center gap-3">
          <ProductIcon product={prod} size={32} />
          <CardTitle>
            {prod.name}
            {ent.isTrialing && <Badge variant="info">Trial</Badge>}
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
          </CardTitle>
        </div>
        {(canChangePlan || hasBreakdown) && (
          <CardAction>
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
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="@container flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md bg-container p-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-accent">Current plan</span>
            <span className="font-alliance text-xl">{planName}</span>
            {planDetail && <span className="text-xs text-muted">{planDetail}</span>}
            {!isManaged && (ent.planTier || price !== "Included" || onDemand > 0) && (
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span>{price}</span>
                {onDemand > 0 && (
                  <span className="text-xs text-muted">
                    +{fmtMoney(onDemand, 2)} / mo on-demand
                  </span>
                )}
              </div>
            )}
          </div>
          <ProductPlansPopover prod={prod} currentTier={ent.planTier} />
        </div>
        {trialPlanName && (
          <p className="text-xs text-muted">
            Trialing {trialPlanName}
            {ent.trialPlanEndsAt ? ` until ${ent.trialPlanEndsAt}` : ""}; upgrades automatically
            when the trial ends.
          </p>
        )}
        {prod.includes && prod.includes.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm @lg:grid-cols-2">
            {prod.includes.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <CheckIcon className="size-3.5 shrink-0 text-success" />
                {feature}
              </li>
            ))}
          </ul>
        )}
        {(ent.dimensions ?? []).length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 @3xl:grid-cols-3">
              {ent.dimensions?.map((dim) => {
                const allowance = dimCommitted(dim) ? dim.committed : dim.limit;
                const overage = dimOnDemandQuantity(dim);
                const detail = meterNote(dim, !isManaged);
                return (
                  <div key={dim.key} className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-accent">
                      {dim.label}
                      {detail && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              size="xs"
                              variant="ghost-muted"
                              aria-label={`Limits and pricing for ${dim.label}`}
                            >
                              <InfoIcon />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent>{detail}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-1.5 text-xl font-medium tabular-nums">
                      {dim.used.toLocaleString()}
                      {allowance !== null && (
                        <span className="text-sm font-normal text-muted">
                          / {allowance.toLocaleString()}
                          {dimCommitted(dim) ? " committed" : ""}
                        </span>
                      )}
                    </div>
                    {overage > 0 && (
                      <span className="text-xs text-warning">
                        {overage.toLocaleString()} on-demand
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const InactiveProductCard = ({
  prod,
  readOnly,
  isManaged,
  selfServe,
  onManage,
  onContact
}: {
  prod: BillingV2CatalogProduct;
  readOnly: boolean;
  isManaged: boolean;
  selfServe: boolean;
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => {
  const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
  const hasSelfServePlan = prod.plans.some((plan) => plan.selfServe);
  const hasSalesLedPlan = prod.plans.some((plan) => plan.salesLed);
  const canActivate = !readOnly && selfServe && !prod.deprecated;
  const canContactSales =
    !readOnly &&
    !isManaged &&
    !prod.deprecated &&
    hasSalesLedPlan &&
    (!selfServe || !hasSelfServePlan);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ProductIcon product={prod} size={32} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <CardTitle>
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            {prod.tagline && <CardDescription>{prod.tagline}</CardDescription>}
          </div>
          <Badge variant="neutral">{isManaged ? "Not Included" : "Inactive"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-md bg-container p-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs text-accent">Subscription</span>
            <span className="font-alliance text-xl">No active plan</span>
          </div>
          {(!canActivate || !hasSelfServePlan) && <ProductPlansPopover prod={prod} />}
          {canActivate && hasSelfServePlan && (
            <Button
              variant="product"
              size="sm"
              style={{ "--product-color": prod.color } as CSSProperties}
              onClick={() => onManage(prod.id)}
            >
              {trialPlan && trialPlan.trialDays > 0
                ? `Try Free for ${trialPlan.trialDays} Days`
                : "View Plans"}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted">
          {isManaged
            ? "This product isn't included in your current license. Contact your account manager to enable it."
            : "This product hasn't been activated for your organization."}
        </p>
        {canContactSales && (
          <div>
            <Button variant="outline" size="sm" onClick={() => onContact(prod)}>
              Contact Sales
            </Button>
          </div>
        )}
        {!isManaged && !selfServe && !canContactSales && (
          <p className="text-xs text-muted">Contact your account manager to enable this product.</p>
        )}
      </CardContent>
    </Card>
  );
};

const SKELETON_PRODUCTS = ["product-a", "product-b", "product-c"];

export const TabbedOverviewSkeleton = ({ orgFilter }: { orgFilter?: ReactNode }) => (
  <div className="flex flex-col gap-6">
    {orgFilter && <div className="flex justify-end">{orgFilter}</div>}
    <div className="flex h-9 items-end gap-6 border-b border-border">
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-2 h-4 w-14" />
      <Skeleton className="mb-2 h-4 w-14" />
    </div>
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="row-start-2 flex min-w-0 flex-col gap-5 xl:row-start-1">
        {SKELETON_PRODUCTS.map((key) => (
          <Card key={key}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="@container flex flex-col gap-5">
              <Skeleton className="h-28 w-full rounded-md" />
              <Separator />
              <div className="grid grid-cols-2 gap-6 @3xl:grid-cols-3">
                {SKELETON_PRODUCTS.map((metric) => (
                  <div key={metric} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="col-start-1 row-start-1 xl:sticky xl:top-6 xl:col-start-2">
        <Card>
          <CardContent className="flex flex-col gap-5">
            {SKELETON_PRODUCTS.map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
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
  onManage,
  onSetCommitment,
  onViewBreakdown,
  onUpdatePayment,
  onEditDetails,
  onContact
}: TabbedOverviewProps) => {
  const { currentOrg } = useOrganization();
  const refreshEntitlements = useRefreshBillingV2Entitlements();
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
  const hasOverviewControls =
    !readOnly ||
    visible.some((prod) => {
      const ent = entitlements[prod.id];
      const active = ent?.entitled && ent.status !== "churned";
      return (
        prod.plans.some((plan) => !plan.deprecated || (active && plan.tier === ent.planTier)) ||
        (active &&
          (breakdownableDimensions(ent).length > 0 ||
            (ent.dimensions ?? []).some((dim) => Boolean(meterNote(dim, !isManaged)))))
      );
    });
  const hasTabs = showInvoicesTab || showPaymentTab;
  const activeTab =
    tab === "usage" ||
    (tab === "invoices" && !showInvoicesTab) ||
    (tab === "payment" && !showPaymentTab)
      ? "overview"
      : tab;

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

      <TabsContent value="overview" tabIndex={hasOverviewControls ? -1 : 0}>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="row-start-2 flex min-w-0 flex-col gap-5 xl:row-start-1">
            {visible.length === 0 && (
              <Card>
                <CardContent>
                  <CardEmpty
                    title="No products available"
                    description="Products will appear here once they're available."
                  />
                </CardContent>
              </Card>
            )}
            {visible.map((prod) => {
              const ent = entitlements[prod.id];
              if (ent?.entitled && ent.status !== "churned") {
                return (
                  <ProductOverviewCard
                    key={prod.id}
                    prod={prod}
                    ent={ent}
                    readOnly={readOnly}
                    selfServe={overview.selfServe}
                    isManaged={isManaged}
                    onManage={onManage}
                    onSetCommitment={onSetCommitment}
                    onViewBreakdown={onViewBreakdown}
                  />
                );
              }
              return (
                <InactiveProductCard
                  key={prod.id}
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
          <aside
            className="col-start-1 row-start-1 flex flex-col gap-4 xl:sticky xl:top-6 xl:col-start-2"
            aria-label="Billing summary"
          >
            <Card>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-5">
                  {isManaged && (
                    <>
                      <Metric label="Billing Method" value="Contract" note="Set by your license" />
                      <Metric
                        label="Active Products"
                        value={billing.activeProductCount.toLocaleString()}
                      />
                    </>
                  )}
                  {!isManaged && !isSubscribed && (
                    <Metric
                      label="Subscription"
                      value="None"
                      note={
                        visible.some(
                          (prod) =>
                            !entitlements[prod.id]?.entitled ||
                            entitlements[prod.id]?.status === "churned"
                        )
                          ? "Activate a product to start one"
                          : "No products to activate"
                      }
                    />
                  )}
                  {!isManaged && isSubscribed && (
                    <>
                      <Metric
                        label="Next Charge"
                        value={billing.nextCharge ? fmtMoney(billing.nextCharge.amount) : "—"}
                        note={
                          billing.nextCharge
                            ? `${billing.nextCharge.at}${billing.nextCharge.hasUsage ? " · includes usage" : ""}`
                            : "Nothing due"
                        }
                      />
                      <Metric
                        label="Monthly Recurring"
                        value={fmtMoney(billing.monthlyRecurring)}
                        note="per month"
                      />
                      <Metric
                        label="Annual Committed"
                        value={fmtMoney(billing.annualCommitted)}
                        note="per year"
                      />
                    </>
                  )}
                </div>
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
              </CardContent>
            </Card>
            {isManaged && (
              <Alert variant="info">
                <InfoIcon />
                <AlertDescription>
                  Your plan is managed by your account team. Products and limits on this
                  organization are set by contract; contact your account manager to make changes.
                </AlertDescription>
              </Alert>
            )}
          </aside>
        </div>
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
