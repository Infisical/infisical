import { CSSProperties, ReactNode, useEffect } from "react";
import { ChevronRight, EllipsisVerticalIcon, PlusIcon, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
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
  BillingV2UsageBreakdown,
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
    ent.cadence === "annual" ? "Yearly" : "Monthly",
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

// Usage over an annual commitment is billed on-demand: the one state the overview calls out with a
// source preview. Other meters stay one click away in the Usage tab and the breakdown sheet.
const overCommitmentMeter = (ent: BillingV2Entitlement) =>
  breakdownableDimensions(ent).find((dim) => dimOnDemandQuantity(dim) > 0);

const topSource = (breakdown: BillingV2UsageBreakdown) =>
  [...breakdown.scopes].filter((scope) => scope.count > 0).sort((a, b) => b.count - a.count)[0];

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

const SourceLine = ({
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
  const { data, isPending } = useGetBillingV2UsageBreakdown(orgId, dim.key, scope);
  const top = data ? topSource(data) : undefined;
  return (
    <button
      type="button"
      onClick={() => onViewBreakdown(prod.id, dim.key)}
      className="group flex w-full cursor-pointer items-center justify-between gap-3 border-t border-border pt-3 text-left text-xs text-muted"
    >
      {isPending && <Skeleton className="h-3 w-64" />}
      {!isPending && (
        <span className="min-w-0 truncate">
          {data && top ? (
            <>
              Most {pluralizeUnit(data.unit)} come from{" "}
              <span className="text-foreground">{top.name}</span> (
              {share(top.count, data.scopedCount)}%)
            </>
          ) : (
            `See where ${dim.label.toLowerCase()} come from`
          )}
        </span>
      )}
      <span className="flex shrink-0 items-center gap-0.5 text-accent group-hover:text-foreground">
        Breakdown
        <ChevronRight className="size-3.5" />
      </span>
    </button>
  );
};

const ProductSummaryRow = ({
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
  const attention = overCommitmentMeter(ent);
  const onDemand = ent.onDemandAmount ?? 0;
  const trialPlanName = ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;

  return (
    <section className="flex flex-col gap-5 py-5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductIcon product={prod} size={32} />
          <div className="flex min-w-0 flex-col">
            <CardTitle>
              {prod.name}
              {ent.isTrialing && <Badge variant="info">Trial</Badge>}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            <span className="truncate text-xs text-muted">{planLine(ent)}</span>
          </div>
        </div>
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
      {trialPlanName && (
        <p className="text-xs text-muted">
          Trialing {trialPlanName}
          {ent.trialPlanEndsAt ? ` until ${ent.trialPlanEndsAt}` : ""}; upgrades automatically when
          the trial ends.
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">
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
      {attention && (
        <SourceLine
          prod={prod}
          dim={attention}
          orgId={orgId}
          scope={scope}
          onViewBreakdown={onViewBreakdown}
        />
      )}
    </section>
  );
};

const AddProductMenu = ({
  products,
  onManage,
  onContact
}: {
  products: BillingV2CatalogProduct[];
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="xs">
        <PlusIcon />
        Add Product
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={2} className="w-72">
      {products.map((prod) => {
        const selfServe = prod.plans.some((plan) => plan.selfServe);
        const salesLed = prod.plans.some((plan) => plan.salesLed);
        const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
        let hint = "Contact sales";
        if (selfServe) {
          hint =
            trialPlan && trialPlan.trialDays > 0
              ? `${trialPlan.trialDays}-day free trial`
              : "Activate";
        }
        if (!selfServe && !salesLed) {
          return null;
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
);

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

const UsageSources = ({
  products,
  showPricing,
  orgId,
  scope,
  onViewBreakdown
}: BreakdownTarget & {
  products: ActiveProduct[];
  showPricing: boolean;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
}) => {
  const meteredProducts = products.filter(({ ent }) => breakdownableDimensions(ent).length > 0);

  if (meteredProducts.length === 0) {
    return (
      <CardEmpty
        title="No usage to break down"
        description="Your products don't meter usage that can be traced to an organization."
      />
    );
  }

  return (
    <Card>
      <CardContent>
        <Accordion
          type="multiple"
          variant="ghost"
          defaultValue={[meteredProducts[0].prod.id]}
          className="flex flex-col gap-4"
        >
          {meteredProducts.map(({ prod, ent }) => (
            <AccordionItem key={prod.id} value={prod.id} className="border-b-0">
              <AccordionTrigger className="[&>[data-slot=accordion-chevron]]:order-last">
                <ProductIcon product={prod} size={32} />
                <CardTitle>{prod.name}</CardTitle>
                <div className="min-w-8 flex-1">
                  <Separator />
                </div>
              </AccordionTrigger>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 pb-5 xl:grid-cols-4">
                {(ent.dimensions ?? []).map((dim) => (
                  <Metric
                    key={dim.key}
                    label={dim.label}
                    value={dim.used.toLocaleString()}
                    note={meterNote(dim, showPricing)}
                  />
                ))}
              </div>
              <AccordionContent>
                <div className="flex flex-col gap-5 divide-y divide-border border-t border-border pt-5 [&>section:not(:first-child)]:pt-5">
                  {breakdownableDimensions(ent).map((dim) => (
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
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};

// Shown in place of the product cards when the org holds none: every product it can start, with its
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
  <div className="divide-y divide-border">
    {products.map((prod) => {
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
        <div key={prod.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
          <ProductIcon product={prod} size={32} />
          <div className="flex min-w-0 flex-1 flex-col">
            <CardTitle>
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            {prod.tagline && <span className="text-xs text-muted">{prod.tagline}</span>}
          </div>
          {action}
        </div>
      );
    })}
  </div>
);

const SKELETON_PRODUCTS = ["product-a", "product-b"];

// Loading shape for the tabbed overview. The org picker stays live so a slow organization is not a
// dead end.
export const TabbedOverviewSkeleton = ({ orgFilter }: { orgFilter?: ReactNode }) => (
  <div className="flex flex-col gap-6">
    {orgFilter && <div className="flex justify-end">{orgFilter}</div>}
    <div className="flex h-9 items-end gap-6 border-b border-border">
      <Skeleton className="mb-2 h-4 w-16" />
      <Skeleton className="mb-2 h-4 w-12" />
      <Skeleton className="mb-2 h-4 w-14" />
    </div>
    <Card>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {SKELETON_PRODUCTS.concat("product-c").map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </Card>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle>Products</CardTitle>
          <div className="flex-1">
            <Separator />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {SKELETON_PRODUCTS.map((key) => (
            <div key={key} className="flex flex-col gap-5 py-5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 xl:grid-cols-4">
                {SKELETON_PRODUCTS.concat("product-c").map((metric) => (
                  <div key={metric} className="flex flex-col gap-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
);

// Billing page as tabs: Overview (plan + products), Usage (where metered usage comes from), and the
// billing administration tabs. Every loaded mode renders here: subscribed or not, cloud or managed.
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

  // A deprecated product stays visible to existing subscribers but is closed to new ones.
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const products = visible
    .filter((prod) => entitlements[prod.id]?.entitled)
    .map((prod) => ({ prod, ent: entitlements[prod.id] }));
  const available = visible.filter((prod) => !entitlements[prod.id]?.entitled);
  const showUsageTab = products.some(({ ent }) => breakdownableDimensions(ent).length > 0);
  const hasTabs = showUsageTab || showInvoicesTab || showPaymentTab;
  const activeTab =
    (tab === "usage" && !showUsageTab) ||
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
          {showUsageTab && <TabsTrigger value="usage">Usage</TabsTrigger>}
          {showInvoicesTab && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
          {showPaymentTab && <TabsTrigger value="payment">Payment</TabsTrigger>}
        </TabsList>
      )}

      <TabsContent value="overview" className="flex flex-col gap-6">
        <Card>
          {isManaged && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                <Metric label="Billing" value="By contract" note="Set by your license" />
                <Metric
                  label="Active Products"
                  value={billing.activeProductCount.toLocaleString()}
                />
              </div>
              <p className="border-t border-border pt-3 text-xs text-muted">
                Your plan is managed by your account team. Products and limits on this organization
                are set by contract; contact your account manager to make changes.
              </p>
            </div>
          )}
          {!isManaged && !isSubscribed && (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
              <Metric
                label="Subscription"
                value="None"
                note={
                  available.length > 0
                    ? "Activate a product to start one"
                    : "No products to activate"
                }
              />
            </div>
          )}
          {!isManaged && isSubscribed && (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
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
            </div>
          )}
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>Products</CardTitle>
              <div className="min-w-8 flex-1">
                <Separator />
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  <AddProductMenu products={available} onManage={onManage} onContact={onContact} />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
            <div className="divide-y divide-border">
              {products.map(({ prod, ent }) => (
                <ProductSummaryRow
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
              ))}
            </div>
            {products.length > 0 && readOnly && available.length > 0 && (
              <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
                <h3 className="text-sm text-foreground">Available Products</h3>
                <AvailableProducts
                  products={available}
                  readOnly
                  onManage={onManage}
                  onContact={onContact}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {showUsageTab && (
        <TabsContent value="usage">
          <UsageSources
            products={products}
            showPricing={!isManaged}
            orgId={orgId}
            scope={scope}
            onViewBreakdown={onViewBreakdown}
          />
        </TabsContent>
      )}

      {showInvoicesTab && (
        <TabsContent value="invoices">
          <InvoicesCard invoices={overview.invoices} />
        </TabsContent>
      )}

      {showPaymentTab && (
        <TabsContent value="payment" className="flex flex-col gap-4">
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
