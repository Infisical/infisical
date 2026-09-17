import { CSSProperties, ReactNode } from "react";
import { ChevronRight, Clock, DollarSign, Package, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
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
  dimHasCeiling,
  fmtMoney,
  productAnnualCommitted,
  tierLabel
} from "../../billing-v2-format";
import { asPlanDeprecation, deprecationSubline } from "../deprecation/deprecation-data";
import { ActiveBadge, CardEmpty, DimensionMeter, ProductIcon } from "../shared";
import { breakdownableDimensions } from "../UsageBreakdownSheet";

type ActiveProductCardProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  selfServe: boolean;
  onManage: (id: string) => void;
  onSetCommitment: (id: string) => void;
  onViewBreakdown: (id: string) => void;
};

// Full-width card for an active product: identity and status, price, Manage action, usage meters.
const ActiveProductCard = ({
  prod,
  entitlement,
  readOnly,
  selfServe,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: ActiveProductCardProps) => {
  // "Commit annually and save" nudge: shown when the org holds this product monthly but hasn't set the
  // available commitment. Clicking opens the set-commitment flow. Hidden for enterprise-managed orgs.
  const commitNudge = readOnly || !selfServe ? null : commitSavingsNudge(entitlement);
  const deprecation = selfServe ? asPlanDeprecation(entitlement?.deprecation) : null;
  const isProductDeprecated = deprecation?.kind === "product";
  const isPlanDeprecated = deprecation?.kind === "plan";

  // Two independent price clocks (never summed): the recurring charge plus any on-demand overage.
  const dims = entitlement?.dimensions ?? [];
  const onDemand = entitlement?.onDemandAmount ?? 0;
  const annualCommitted = productAnnualCommitted(entitlement);
  // Monthly recurring applies to non-annual products (item.amount is their monthly charge); an annual
  // product carries no monthly recurring, only optional usage-driven on-demand overage.
  const monthlyRecurring = entitlement?.cadence === "annual" ? 0 : (entitlement?.amount ?? 0);
  const hasPrice = annualCommitted > 0 || monthlyRecurring > 0 || onDemand > 0;
  const isTrialing = Boolean(entitlement?.isTrialing);
  const trialedPlan = entitlement?.trialPlan
    ? prod.plans.find((plan) => plan.tier === entitlement.trialPlan)
    : undefined;
  const trialPlanName = entitlement?.trialPlan
    ? (entitlement.trialPlanName ?? trialedPlan?.name ?? tierLabel(entitlement.trialPlan))
    : null;
  const trialDaysLeft = entitlement?.trialPlanDaysLeft;

  // The headline figure steps down a size when a second amount line shares the block.
  const priceLines = [annualCommitted > 0, monthlyRecurring > 0, onDemand > 0].filter(
    Boolean
  ).length;
  const figureClass = cn(
    "font-semibold text-foreground tabular-nums",
    priceLines > 1 ? "text-base" : "text-lg"
  );

  // Bar-bearing dims first so the block reads bars, then bare cost lines, then the shared legend.
  const sortedDims = [...dims].sort((a, b) => Number(dimHasCeiling(b)) - Number(dimHasCeiling(a)));

  const hasBreakdown = breakdownableDimensions(entitlement).length > 0;

  // Cadence and renewal (or trial / deprecation) as one muted subline under the product name.
  let subline: ReactNode = null;
  if (deprecation) {
    subline = (
      <span className={isProductDeprecated ? "text-danger" : "text-warning"}>
        {deprecationSubline(deprecation, entitlement?.planTier)}
      </span>
    );
  } else if (isTrialing) {
    subline = entitlement?.trialEndsAt ? (
      <span>Trial ends {entitlement.trialEndsAt}</span>
    ) : (
      entitlement?.renewsOn && <span>Renews {entitlement.renewsOn}</span>
    );
  } else {
    subline = (
      <span>
        {entitlement?.cadence === "annual" ? "Yearly" : "Monthly"}
        {entitlement?.renewsOn ? ` · renews ${entitlement.renewsOn}` : ""}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-container p-4">
      <div className="flex items-center gap-3">
        {/* A discontinued product's icon is dimmed so a glance down the list reads it as winding down. */}
        <div className={isProductDeprecated ? "opacity-40 grayscale" : undefined}>
          <ProductIcon product={prod} size={40} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-foreground">{prod.name}</span>
            {entitlement?.planTier && (
              <Badge variant="info">{tierLabel(entitlement.planTier)}</Badge>
            )}
            {isProductDeprecated && <Badge variant="danger">Deprecated</Badge>}
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            {isTrialing ? <Badge variant="info">Trial</Badge> : <ActiveBadge />}
          </div>
          <div className="truncate text-xs text-muted">{subline}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {annualCommitted > 0 && (
            <div className="flex items-baseline gap-1">
              <span className={figureClass}>{fmtMoney(annualCommitted)}</span>
              <span className="text-xs text-accent">/ yr committed</span>
            </div>
          )}
          {monthlyRecurring > 0 && (
            <div className="flex items-baseline gap-1">
              <span className={figureClass}>{fmtMoney(monthlyRecurring)}</span>
              <span className="text-xs text-accent">/ mo</span>
            </div>
          )}
          {onDemand > 0 && (
            <span className="text-xs text-accent">
              <span className="font-medium text-warning/90">+{fmtMoney(onDemand)}</span> / mo
              on-demand
            </span>
          )}
          {!hasPrice && <span className="text-sm text-muted">Included</span>}
        </div>
        {!readOnly && selfServe && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onManage(prod.id)}
          >
            {isPlanDeprecated ? "Review plan" : "Manage"}
          </Button>
        )}
      </div>
      {trialPlanName && (
        <div className="-mx-4 flex flex-col gap-1.5 border-y border-border bg-warning/5 px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs text-foreground">
              <Clock className="size-3.5 shrink-0 text-warning" />
              Trialing {trialPlanName}
            </span>
            {trialDaysLeft !== null && trialDaysLeft !== undefined && (
              <span className="shrink-0 text-xs font-medium text-warning tabular-nums">
                {trialDaysLeft === 0
                  ? "Ends today"
                  : `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted">
            {entitlement?.trialPlanEndsAt ? `Trial ends ${entitlement.trialPlanEndsAt} · ` : ""}
            upgrades to {trialPlanName} automatically when it ends
          </span>
        </div>
      )}
      {sortedDims.length > 0 && (
        <div className="flex flex-col gap-3.5">
          {sortedDims.map((dim) => (
            <DimensionMeter key={dim.key} dim={dim} color={prod.color} />
          ))}
        </div>
      )}
      {hasBreakdown && (
        <button
          type="button"
          onClick={() => onViewBreakdown(prod.id)}
          className={cn(
            "group -mx-4 -mb-4 flex cursor-pointer items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-left transition-colors hover:bg-container-hover",
            commitNudge && "mb-0"
          )}
        >
          <span className="text-xs text-muted">Usage across your organizations</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-accent transition-colors group-hover:text-foreground">
            View breakdown
            <ChevronRight className="size-3.5" />
          </span>
        </button>
      )}
      {commitNudge && (
        // Full-bleed strip at the card's bottom edge nudging the monthly subscriber to commit annually.
        <div
          className={cn(
            "-mx-4 -mb-4 flex items-center justify-between gap-3 border-t border-border bg-warning/5 px-4 py-2.5",
            // Sitting under the breakdown strip, -mt-3 cancels the card's gap-3 so the two full-bleed
            // strips meet on one divider and read as a single footer instead of two floating bars.
            hasBreakdown ? "-mt-3" : "mt-1"
          )}
        >
          <span className="flex items-center gap-2.5 text-xs text-muted">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-warning/40 text-warning">
              <DollarSign className="size-3.5" />
            </span>
            <span>
              Commit annually and save{" "}
              <span className="font-medium text-foreground">~{commitNudge.savingsPct}%</span> —
              would be{" "}
              <span className="font-medium text-foreground">
                {fmtMoney(commitNudge.annualCommitted)} / yr
              </span>
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onSetCommitment(prod.id)}
          >
            Switch to annual
          </Button>
        </div>
      )}
    </div>
  );
};

type AvailableProductTileProps = {
  prod: BillingV2CatalogProduct;
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

// Compact tile for a product the org doesn't hold yet: tagline plus an activate / trial / contact action.
const AvailableProductTile = ({
  prod,
  readOnly,
  onManage,
  onContact
}: AvailableProductTileProps) => {
  const selfServe = prod.plans.some((plan) => plan.selfServe);
  const salesLed = prod.plans.some((plan) => plan.salesLed);
  const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);

  let action = null;
  if (!readOnly) {
    if (selfServe) {
      action = (
        <Button
          variant="product"
          size="sm"
          style={{ "--product-color": prod.color } as CSSProperties}
          onClick={() => onManage(prod.id)}
        >
          {trialPlan
            ? `Try free${trialPlan.trialDays > 0 ? ` for ${trialPlan.trialDays} days` : ""}`
            : "Activate"}
        </Button>
      );
    } else if (salesLed) {
      action = (
        <Button variant="outline" size="sm" onClick={() => onContact(prod)}>
          Contact sales
        </Button>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-container p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <ProductIcon product={prod} />
        <span className="text-sm font-semibold text-foreground">{prod.name}</span>
        {prod.addon && <Badge variant="neutral">Add-on</Badge>}
      </div>
      {prod.tagline && <p className="text-sm text-muted">{prod.tagline}</p>}
      {action && <div className="mt-auto pt-1">{action}</div>}
    </div>
  );
};

type ProductSkeletonRow = { key: string; hasBar: boolean };

const skeletonRows = (dims: BillingV2EntitlementDim[]): ProductSkeletonRow[] =>
  dims.map((dim) => ({ key: dim.key, hasBar: dimHasCeiling(dim) }));

const UNKNOWN_PRODUCT_ROWS: ProductSkeletonRow[] = [
  { key: "first", hasBar: true },
  { key: "second", hasBar: true }
];

type ActiveProductCardSkeletonProps = {
  rows: ProductSkeletonRow[];
  hasBreakdown: boolean;
  showAction: boolean;
  className?: string;
};

const ActiveProductCardSkeleton = ({
  rows,
  hasBreakdown,
  showAction,
  className
}: ActiveProductCardSkeletonProps) => (
  <div
    className={cn(
      "flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-container p-4",
      className
    )}
  >
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
      {showAction && <Skeleton className="h-8 w-20 shrink-0 rounded-md" />}
    </div>
    {rows.length > 0 && (
      <div className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-28" />
            </div>
            {row.hasBar && <Skeleton className="h-[5px] w-full rounded-xs" />}
          </div>
        ))}
      </div>
    )}
    {hasBreakdown && (
      <div className="-mx-4 mt-auto -mb-4 flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <Skeleton className="h-2.5 w-44" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    )}
  </div>
);

type ProductsCardProps = {
  overview?: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly?: boolean;
  orgFilter?: ReactNode;
  isReloading?: boolean;
  onManage: (id: string) => void;
  onSetCommitment: (id: string) => void;
  onViewBreakdown: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

export const ProductsCard = ({
  overview,
  catalog,
  readOnly,
  orgFilter,
  isReloading,
  onManage,
  onSetCommitment,
  onViewBreakdown,
  onContact
}: ProductsCardProps) => {
  const entitlements = overview?.entitlements ?? {};
  // A deprecated product stays visible to existing subscribers but is closed to new ones, so hide it
  // from anyone who isn't already entitled to it (plan-level deprecation still shows the product).
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const active = visible.filter((prod) => entitlements[prod.id]?.entitled);
  const available = visible.filter((prod) => !entitlements[prod.id]?.entitled);

  const { currentOrg } = useOrganization();
  const refreshEntitlements = useRefreshBillingV2Entitlements();

  // Pull the latest entitlements from the license server (busting the server cache) and refetch the
  // overview so the freshly-resolved products land in the UI.
  const handleRefresh = async () => {
    try {
      await refreshEntitlements.mutateAsync({ orgId: currentOrg.id });
      createNotification({ type: "success", text: "Entitlements refreshed." });
    } catch {
      createNotification({ type: "error", text: "Failed to refresh entitlements." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Package className="size-4 text-accent" />
          Products
        </CardTitle>
        <CardDescription>Active products</CardDescription>
        {(orgFilter || !readOnly) && (
          <CardAction>
            <div className="flex items-center gap-2">
              {orgFilter}
              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
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
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {!overview && (
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <ActiveProductCardSkeleton
                key={i}
                rows={UNKNOWN_PRODUCT_ROWS}
                hasBreakdown
                showAction={false}
              />
            ))}
          </div>
        )}
        {overview && visible.length === 0 && (
          <CardEmpty
            title="No products available"
            description="Products will appear here once they're available."
          />
        )}
        {overview && visible.length > 0 && (
          <>
            {active.length === 0 && (
              <CardEmpty
                title="No active products"
                description="Activate your first product to get started."
              />
            )}
            <div className="flex flex-col gap-4">
              {active.map((prod) => (
                <div key={prod.id} className="relative">
                  <div className={cn(isReloading && "invisible")} aria-hidden={isReloading}>
                    <ActiveProductCard
                      prod={prod}
                      entitlement={entitlements[prod.id]}
                      readOnly={readOnly}
                      selfServe={overview.selfServe}
                      onManage={onManage}
                      onSetCommitment={onSetCommitment}
                      onViewBreakdown={onViewBreakdown}
                    />
                  </div>
                  {isReloading && (
                    <ActiveProductCardSkeleton
                      className="absolute inset-0"
                      rows={skeletonRows(entitlements[prod.id]?.dimensions ?? [])}
                      hasBreakdown={breakdownableDimensions(entitlements[prod.id]).length > 0}
                      showAction={!readOnly && overview.selfServe}
                    />
                  )}
                </div>
              ))}
              {available.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-sm font-medium text-muted">Available products</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {/* Container-keyed columns: the collapsible sidebar changes the room, not the viewport. */}
                  <div className="@container">
                    <div className="grid gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
                      {available.map((prod) => (
                        <AvailableProductTile
                          key={prod.id}
                          prod={prod}
                          readOnly={readOnly}
                          onManage={onManage}
                          onContact={onContact}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
