import { CSSProperties, ReactNode, useEffect } from "react";
import { EllipsisVerticalIcon, InfoIcon, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
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
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  pluralizeUnit,
  productAnnualCommitted,
  tierLabel,
  unitForCount
} from "../billing-v2-format";
import { DetailsCard } from "./cards/DetailsCard";
import { InvoicesCard } from "./cards/InvoicesCard";
import { PaymentCard } from "./cards/PaymentCard";
import { CardEmpty, ProductIcon } from "./shared";
import { breakdownableDimensions } from "./UsageBreakdownSheet";

type ActiveProduct = { prod: BillingV2CatalogProduct; ent: BillingV2Entitlement };

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
  if (ent.isTrialing) {
    return [
      ent.planTier ? tierLabel(ent.planTier) : null,
      ent.trialEndsAt ? `Trial ends ${ent.trialEndsAt}` : "Trial"
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return [
    ent.planTier ? tierLabel(ent.planTier) : null,
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

type BreakdownTarget = {
  orgId: string;
  scope: BillingV2BreakdownScopeKind;
};

type TabbedOverviewProps = BreakdownTarget & {
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

const UsageMeterSources = ({
  prod,
  dim,
  orgId,
  scope,
  onViewBreakdown
}: BreakdownTarget & {
  prod: BillingV2CatalogProduct;
  dim: BillingV2EntitlementDim;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
}) => {
  const { data, isPending, isError, refetch } = useGetBillingV2UsageBreakdown(
    orgId,
    dim.key,
    scope
  );

  const ranked = data
    ? [...data.scopes].filter((scope_) => scope_.count > 0).sort((a, b) => b.count - a.count)
    : [];
  const shown = ranked.slice(0, 5);
  const rest = ranked.length - shown.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm text-foreground">{dim.label}</h3>
        <Button
          variant="outline"
          size="xs"
          aria-label={`Full breakdown for ${prod.name} ${dim.label}`}
          onClick={() => onViewBreakdown(prod.id, dim.key)}
        >
          Full Breakdown
        </Button>
      </div>
      {isPending && <Skeleton className="h-32 w-full" />}
      {isError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">Unable to load usage sources.</span>
          <Button variant="ghost" size="xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {data && !isError && (
        <div className="flex flex-col gap-3">
          {data.userCount > 0 && (
            <span className="text-xs text-accent">
              <span className="font-medium text-foreground">{data.userCount.toLocaleString()}</span>{" "}
              {unitForCount("user identity", data.userCount)} ·{" "}
              <span className="font-medium text-foreground">
                {data.scopedCount.toLocaleString()}
              </span>{" "}
              {unitForCount(data.unit, data.scopedCount)}
            </span>
          )}
          {shown.length === 0 && (
            <span className="text-sm text-muted">
              No {pluralizeUnit(data.unit)} have been created yet.
            </span>
          )}
          {shown.map((source) => (
            <div key={source.orgId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground">{source.name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  <span className="font-medium text-foreground">
                    {source.count.toLocaleString()}
                  </span>{" "}
                  · {share(source.count, data.scopedCount)}%
                </span>
              </div>
              <div className="h-[3px] w-full overflow-hidden rounded-xs bg-background">
                <div
                  className={source.isRoot ? "h-full bg-org/85" : "h-full bg-sub-org/85"}
                  style={{ width: `${share(source.count, data.scopedCount)}%` }}
                />
              </div>
            </div>
          ))}
          {rest > 0 && (
            <span className="text-xs text-muted">
              {rest} more {rest === 1 ? "organization" : "organizations"} in the full breakdown
            </span>
          )}
        </div>
      )}
    </section>
  );
};

const ProductOverviewCard = ({
  prod,
  ent,
  readOnly,
  selfServe,
  isManaged,
  orgId,
  scope,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: ActiveProduct &
  BreakdownTarget & {
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
  const sourceDimensions = breakdownableDimensions(ent).filter((dim) => dim.used > 0);
  const onDemand = ent.onDemandAmount ?? 0;
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
          <div className="flex min-w-0 flex-col">
            <CardTitle>
              {prod.name}
              {ent.isTrialing && <Badge variant="info">Trial</Badge>}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            <span className="text-xs text-muted">
              {planLine(ent) || (isManaged ? "Included in your license" : "Included")}
            </span>
          </div>
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
        {trialPlanName && (
          <p className="text-xs text-muted">
            Trialing {trialPlanName}
            {ent.trialPlanEndsAt ? ` until ${ent.trialPlanEndsAt}` : ""}; upgrades automatically
            when the trial ends.
          </p>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 @3xl:grid-cols-4">
          {!isManaged && (
            <Metric
              label="Charge"
              value={priceLabel(ent)}
              note={onDemand > 0 ? `+${fmtMoney(onDemand, 2)} / mo on-demand` : undefined}
            />
          )}
          {(ent.dimensions ?? []).map((dim) => (
            <Metric
              key={dim.key}
              label={dim.label}
              value={dim.used.toLocaleString()}
              note={meterNote(dim, !isManaged)}
            />
          ))}
        </div>
        {prod.includes && prod.includes.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-accent">Product features</span>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground">
              {prod.includes.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        )}
        {sourceDimensions.length > 0 && (
          <Accordion type="single" collapsible variant="ghost">
            <AccordionItem value={prod.id}>
              <AccordionTrigger
                className="[&>[data-slot=accordion-chevron]]:order-last"
                aria-label={`Usage sources for ${prod.name}`}
              >
                <span>Usage Sources</span>
                <div className="min-w-8 flex-1">
                  <Separator />
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-5 divide-y divide-border [&>section:not(:first-child)]:pt-5">
                  {sourceDimensions.map((dim) => (
                    <UsageMeterSources
                      key={dim.key}
                      prod={prod}
                      dim={dim}
                      orgId={orgId}
                      scope={scope}
                      onViewBreakdown={onViewBreakdown}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
        <p className="text-sm text-muted">
          {isManaged
            ? "This product isn't included in your current license. Contact your account manager to enable it."
            : "This product hasn't been activated for your organization."}
        </p>
        {canActivate && hasSelfServePlan && (
          <div>
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
          </div>
        )}
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
            <CardContent className="@container">
              <div className="grid grid-cols-2 gap-6 @3xl:grid-cols-4">
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
  orgId,
  scope,
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

      <TabsContent value="overview" tabIndex={-1}>
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
                    orgId={orgId}
                    scope={scope}
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
        <TabsContent value="invoices" tabIndex={-1}>
          <InvoicesCard invoices={overview.invoices} />
        </TabsContent>
      )}

      {showPaymentTab && (
        <TabsContent
          value="payment"
          tabIndex={-1}
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
