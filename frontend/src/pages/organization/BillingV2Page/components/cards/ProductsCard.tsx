import { ReactNode } from "react";
import { Package } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2CatalogProduct, BillingV2Entitlement, BillingV2Overview } from "@app/hooks/api";

import {
  byDisplayOrder,
  dimHasCeiling,
  fmtMoney,
  productAnnualCommitted,
  tierLabel
} from "../../billing-v2-format";
import { deprecationSubline } from "../deprecation/deprecation-data";
import {
  ActiveBadge,
  CardEmpty,
  DimensionMeter,
  DimensionRateLegend,
  ProductIcon
} from "../shared";

type ActiveProductCardProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  onManage: (id: string) => void;
};

// Full-width card for an active product: identity and status, price, Manage action, usage meters.
const ActiveProductCard = ({ prod, entitlement, readOnly, onManage }: ActiveProductCardProps) => {
  const deprecation = entitlement?.deprecation;
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
            {/* Plan retiring: strikethrough tier chip in warning tone. Otherwise the plain tier chip. */}
            {entitlement?.planTier &&
              (isPlanDeprecated ? (
                <Badge variant="warning" className="line-through">
                  {tierLabel(entitlement.planTier)}
                </Badge>
              ) : (
                <Badge variant="info">{tierLabel(entitlement.planTier)}</Badge>
              ))}
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
        {!readOnly && (
          // A retiring plan nudges the customer toward the replacement; everything else opens Manage.
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
      {sortedDims.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {sortedDims.map((dim) => (
            <DimensionMeter key={dim.key} dim={dim} hideLegend />
          ))}
          <DimensionRateLegend dims={sortedDims} />
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

// Compact tile for a product the org doesn't hold yet: tagline plus an activate / contact action.
const AvailableProductTile = ({
  prod,
  readOnly,
  onManage,
  onContact
}: AvailableProductTileProps) => {
  const selfServe = prod.plans.some((plan) => plan.selfServe);
  const salesLed = prod.plans.some((plan) => plan.salesLed);

  let action = null;
  if (!readOnly) {
    if (selfServe) {
      action = (
        <Button variant="org" size="sm" onClick={() => onManage(prod.id)}>
          Activate
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

type ProductsCardProps = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

export const ProductsCard = ({
  overview,
  catalog,
  readOnly,
  onManage,
  onContact
}: ProductsCardProps) => {
  // A deprecated product stays visible to existing subscribers but is closed to new ones, so hide it
  // from anyone who isn't already entitled to it (plan-level deprecation still shows the product).
  const visible = [...catalog]
    .filter((prod) => !prod.deprecated || overview.entitlements[prod.id]?.entitled)
    .sort(byDisplayOrder);
  const active = visible.filter((prod) => overview.entitlements[prod.id]?.entitled);
  const available = visible.filter((prod) => !overview.entitlements[prod.id]?.entitled);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Package className="size-4 text-accent" />
          Products
        </CardTitle>
        <CardDescription>Everything you can run on your subscription.</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <CardEmpty
            title="No products available"
            description="Products will appear here once they're available."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {active.map((prod) => (
              <ActiveProductCard
                key={prod.id}
                prod={prod}
                entitlement={overview.entitlements[prod.id]}
                readOnly={readOnly}
                onManage={onManage}
              />
            ))}
            {available.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-sm font-medium text-muted">Available to add</span>
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
        )}
      </CardContent>
    </Card>
  );
};
