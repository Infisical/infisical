import { ArrowBigUpDashIcon, Package } from "lucide-react";

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
  fmtMoney,
  productAnnualCommitted,
  tierLabel
} from "../../billing-v2-format";
import { deprecationSubline } from "../deprecation/deprecation-data";
import { ActiveBadge, CadenceBadge, CardEmpty, DimensionMeter, ProductIcon } from "../shared";

type ProductRowProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  readOnly?: boolean;
  onManage: (id: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const ProductRow = ({ prod, entitlement, readOnly, onManage, onContact }: ProductRowProps) => {
  const entitled = Boolean(entitlement?.entitled);
  const selfServe = prod.plans.some((plan) => plan.selfServe);
  const salesLed = prod.plans.some((plan) => plan.salesLed);
  const deprecation = entitlement?.deprecation;
  const isProductDeprecated = deprecation?.kind === "product";
  const isPlanDeprecated = deprecation?.kind === "plan";

  let action = null;
  if (!readOnly) {
    if (entitled) {
      // A retiring plan nudges the customer toward the replacement; everything else opens Manage.
      action = (
        <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
          {isPlanDeprecated ? "Review plan" : "Manage"}
        </Button>
      );
    } else if (selfServe) {
      action = (
        <Button variant="org" size="sm" onClick={() => onManage(prod.id)}>
          <ArrowBigUpDashIcon />
          Activate
        </Button>
      );
    } else if (salesLed) {
      action = (
        <Button variant="org" size="sm" onClick={() => onContact(prod)}>
          Contact sales
        </Button>
      );
    }
  }

  // Inactive product: compact row with the tagline and an activate / contact action.
  if (!entitled) {
    return (
      <div className="flex items-center gap-4 border-t border-border py-4 first:border-t-0">
        <ProductIcon product={prod} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{prod.name}</span>
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            <Badge variant="neutral">Inactive</Badge>
          </div>
          <div className="text-xs text-muted">{prod.tagline}</div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
    );
  }

  // Active product: cadence badge, renewal (or trial) line, and the price as two independent clocks
  // (never summed) — the annual prepaid commitment and the monthly charge — plus one bar per dimension.
  const dims = entitlement?.dimensions ?? [];
  const onDemand = entitlement?.onDemandAmount ?? 0;
  const annualCommitted = productAnnualCommitted(entitlement);
  // Monthly recurring applies to non-annual products (item.amount is their monthly charge); an annual
  // product carries no monthly recurring, only optional usage-driven on-demand overage.
  const monthlyRecurring = entitlement?.cadence === "annual" ? 0 : (entitlement?.amount ?? 0);
  const hasPrice = annualCommitted > 0 || monthlyRecurring > 0 || onDemand > 0;
  const isTrialing = Boolean(entitlement?.isTrialing);

  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0">
      <div className="flex items-center gap-4">
        {/* A discontinued product's icon is dimmed so a glance down the list reads it as winding down. */}
        <div className={isProductDeprecated ? "opacity-40 grayscale" : undefined}>
          <ProductIcon product={prod} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{prod.name}</span>
            {/* Plan retiring: strikethrough tier chip in warning tone. Otherwise the plain tier chip. */}
            {entitlement?.planTier &&
              (isPlanDeprecated ? (
                <Badge variant="warning" className="line-through">
                  {tierLabel(entitlement.planTier)}
                </Badge>
              ) : (
                <Badge variant="neutral">{tierLabel(entitlement.planTier)}</Badge>
              ))}
            {isProductDeprecated && <Badge variant="danger">Deprecated</Badge>}
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            {isTrialing ? <Badge variant="info">Trial</Badge> : <ActiveBadge />}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
            {deprecation ? (
              <span
                className={cn("truncate", isProductDeprecated ? "text-danger" : "text-warning")}
              >
                {deprecationSubline(deprecation, entitlement?.planTier)}
              </span>
            ) : (
              <>
                {!isTrialing && <CadenceBadge cadence={entitlement?.cadence} />}
                {isTrialing && entitlement?.trialEndsAt ? (
                  <span>Trial ends {entitlement.trialEndsAt}</span>
                ) : (
                  entitlement?.renewsOn && <span>Renews {entitlement.renewsOn}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {annualCommitted > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {fmtMoney(annualCommitted)}
              </span>
              <span className="text-xs text-muted">/ yr </span>
            </div>
          )}
          {monthlyRecurring > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {fmtMoney(monthlyRecurring)}
              </span>
              <span className="text-xs text-muted">/ mo</span>
            </div>
          )}
          {onDemand > 0 && (
            <span className="text-xs font-medium text-warning">
              + {fmtMoney(onDemand)} / mo on-demand
            </span>
          )}
          {!hasPrice && <span className="text-sm text-muted">Included</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {dims.length > 0 && (
        <div className="flex flex-col gap-3 pl-[52px]">
          {dims.map((dim) => (
            <DimensionMeter key={dim.key} dim={dim} />
          ))}
        </div>
      )}
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
          <div className="flex flex-col">
            {visible.map((prod) => (
              <ProductRow
                key={prod.id}
                prod={prod}
                entitlement={overview.entitlements[prod.id]}
                readOnly={readOnly}
                onManage={onManage}
                onContact={onContact}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
