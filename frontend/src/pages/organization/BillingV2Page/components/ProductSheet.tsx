import { useState } from "react";
import { ArrowRight, Check, ExternalLink, ShoppingCart } from "lucide-react";

import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2CompareRow,
  BillingV2Entitlement,
  BillingV2Plan
} from "@app/hooks/api";

import { cadenceWord, cadenceWordShort, fmtMoney, unitPrice } from "../billing-v2-data";
import { ActiveBadge, ProductIcon } from "./shared";

type PriceLine = { amount: string; unit: string };

// A plan's price is a base fee plus any number of metered dimensions, and any combination is valid:
// base only, meter only, or both. The base fee leads as the headline; every priced dimension is then
// listed below (e.g. "$5 per MCP / mo", "$3 per Agent / mo"). When there's no base fee the first
// dimension is promoted to the headline so the card always opens with a price.
const PlanPricing = ({ plan, cadence }: { plan: BillingV2Plan; cadence: BillingV2Cadence }) => {
  const dims = plan.dims ?? [];
  const dimLines = dims.map((dim) => ({
    key: dim.key,
    amount: fmtMoney(unitPrice(dim, cadence), 2),
    unit: `per ${dim.noun} / ${cadenceWordShort(cadence)}`
  }));

  let headline: PriceLine | null = plan.base
    ? { amount: fmtMoney(unitPrice(plan.base, cadence)), unit: `/ ${cadenceWord(cadence)}` }
    : null;
  let usageLines = dimLines;
  if (!headline && dims.length > 0) {
    headline = {
      amount: fmtMoney(unitPrice(dims[0], cadence), 2),
      unit: `/ ${dims[0].noun} / ${cadenceWord(cadence)}`
    };
    usageLines = dimLines.slice(1);
  }

  if (!headline) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-2xl font-medium text-foreground">{headline.amount}</span>
        <span className="text-xs text-muted">{headline.unit}</span>
      </div>
      {usageLines.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3.5">
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
            Plus per-unit usage
          </span>
          {usageLines.map((line) => (
            <div key={line.key} className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-foreground">{line.amount}</span>
              <span className="text-xs text-muted">{line.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const renderCompareCell = (value: string | boolean | number | undefined) => {
  if (value === true) {
    return <Check className="mx-auto size-3.5 text-success" />;
  }
  if (value === false || value === undefined) {
    return <span className="text-muted">—</span>;
  }
  return value;
};

type PlanBadgeProps = { plan: BillingV2Plan; isCurrent: boolean };

const PlanBadge = ({ plan, isCurrent }: PlanBadgeProps) => {
  if (isCurrent) {
    return (
      <Badge variant="success">
        <Check className="text-success" />
        Current Plan
      </Badge>
    );
  }
  if (plan.salesLed) {
    return <Badge variant="neutral">Talk to Us</Badge>;
  }
  return <Badge variant="neutral">Self-Checkout</Badge>;
};

type PlanCardProps = {
  prodId: string;
  plan: BillingV2Plan;
  cadence: BillingV2Cadence;
  isCurrent: boolean;
  entitled: boolean;
  redirecting?: boolean;
  onSelect: (prodId: string, planTier: string) => void;
  onContact: () => void;
};

const PlanCard = ({
  prodId,
  plan,
  cadence,
  isCurrent,
  entitled,
  redirecting,
  onSelect,
  onContact
}: PlanCardProps) => {
  // A sales-led plan with no published price shows "Custom"; everything else renders its pricing.
  const isCustom = plan.salesLed && !plan.base && plan.dims.length === 0;

  let cta = null;
  if (plan.salesLed && !isCurrent) {
    cta = (
      <Button variant="org" size="sm" className="mt-auto self-start" onClick={onContact}>
        Contact sales
        <ArrowRight />
      </Button>
    );
  } else if (plan.selfServe && !entitled) {
    // Picking a self-serve plan starts checkout (or an in-place add for an existing subscription).
    cta = (
      <Button
        variant="org"
        size="sm"
        className="mt-auto self-start"
        isPending={redirecting}
        onClick={() => onSelect(prodId, plan.tier)}
      >
        <ShoppingCart />
        Continue to checkout
      </Button>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3.5 rounded-xl border p-[18px] ${
        isCurrent ? "border-success/40 bg-success/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-foreground">{plan.name}</span>
        <PlanBadge plan={plan} isCurrent={isCurrent} />
      </div>
      {isCustom ? (
        <div className="flex items-baseline">
          <span className="text-2xl font-medium text-foreground">Custom</span>
        </div>
      ) : (
        <PlanPricing plan={plan} cadence={cadence} />
      )}
      {plan.feature && <div className="text-xs text-accent">{plan.feature}</div>}
      {cta}
    </div>
  );
};

type EntitlementSummaryProps = {
  entitlement?: BillingV2Entitlement;
};

const EntitlementSummary = ({ entitlement }: EntitlementSummaryProps) => {
  const entitled = Boolean(entitlement?.entitled);
  let detail = "This product isn't part of your current plan.";
  if (entitled) {
    detail = "This product is active on your subscription.";
    if (entitlement && entitlement.limit !== null && entitlement.limit !== undefined) {
      const used = entitlement.used ?? 0;
      detail = `Active on your subscription. ${used.toLocaleString()} of ${entitlement.limit.toLocaleString()} in use.`;
    }
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">Your Plan</span>
        {entitled ? <ActiveBadge /> : <Badge variant="neutral">Inactive</Badge>}
      </div>
      <div className="text-xs text-accent">{detail}</div>
    </div>
  );
};

type CompareTableProps = {
  plans: BillingV2Plan[];
  compare: BillingV2CompareRow[];
};

const CompareTable = ({ plans, compare }: CompareTableProps) => (
  <div>
    <div className="mb-3 text-xs font-medium text-muted">Compare Plans</div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead aria-label="Feature" />
          {plans.map((plan) => (
            <TableHead key={plan.tier} className="text-center">
              {plan.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {compare.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="text-accent">{row.label}</TableCell>
            {plans.map((plan) => (
              <TableCell key={plan.tier} className="text-center">
                {renderCompareCell(row.cells[plan.tier])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const IncludesList = ({ includes }: { includes: string[] }) => (
  <div>
    <div className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
      What&apos;s included
    </div>
    <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
      {includes.map((feature) => (
        <div className="flex items-start gap-2 text-xs text-accent" key={feature}>
          <Check className="mt-0.5 size-3 shrink-0 text-success" />
          {feature}
        </div>
      ))}
    </div>
  </div>
);

// Static column classes (Tailwind can't see computed ones); cap at three before wrapping.
const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3"
};

type PlansViewProps = {
  prod: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
  redirecting?: boolean;
  pendingTier: string | null;
  onSelect: (prodId: string, planTier: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

const PlansView = ({
  prod,
  entitlement,
  cadence,
  redirecting,
  pendingTier,
  onSelect,
  onContact
}: PlansViewProps) => {
  // Sales-led ("Contact sales") plans sort last; alphabetical by name within each group breaks ties.
  const plans = [...(prod.plans ?? [])].sort((a, b) => {
    if (a.salesLed !== b.salesLed) {
      return a.salesLed ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
  const entitled = Boolean(entitlement?.entitled);
  // When entitled but the server didn't say which tier, fall back to the first self-serve plan so a
  // card is still marked active (mirrors the previous single-"pro" behaviour).
  const currentTier =
    entitlement?.planTier ?? (entitled ? plans.find((plan) => plan.selfServe)?.tier : undefined);

  const gridCols = GRID_COLS[Math.min(plans.length, 3)] ?? GRID_COLS[3];
  const showCompare = Boolean(prod.compare && prod.compare.length > 0 && plans.length > 1);

  return (
    <>
      <EntitlementSummary entitlement={entitlement} />

      <div className={`grid gap-3.5 ${gridCols}`}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            prodId={prod.id}
            plan={plan}
            cadence={cadence}
            entitled={entitled}
            isCurrent={entitled && plan.tier === currentTier}
            redirecting={Boolean(redirecting) && pendingTier === plan.tier}
            onSelect={onSelect}
            onContact={() => onContact(prod)}
          />
        ))}
      </div>

      {showCompare && prod.compare ? (
        <CompareTable plans={plans} compare={prod.compare} />
      ) : (
        prod.includes && prod.includes.length > 0 && <IncludesList includes={prod.includes} />
      )}
    </>
  );
};

type ProductSheetProps = {
  prodId: string;
  prod?: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  cadence: BillingV2Cadence;
  redirecting?: boolean;
  onClose: () => void;
  onManage: (prodId: string, planTier: string) => void;
  onRemove: (prodId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

export const ProductSheet = ({
  prodId,
  prod,
  entitlement,
  cadence,
  redirecting,
  onClose,
  onManage,
  onRemove,
  onContact
}: ProductSheetProps) => {
  // Track which plan's button was clicked so only that card spins while the request is in flight,
  // rather than every card sharing the single `redirecting` flag.
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  if (!prod) {
    return null;
  }

  const entitled = Boolean(entitlement?.entitled);
  const selfServe = prod.plans.some((plan) => plan.selfServe);

  const handleSelect = (id: string, planTier: string) => {
    setPendingTier(planTier);
    onManage(id, planTier);
  };

  // An entitled product is managed in the Stripe portal; selecting a plan is handled per-card.
  const primaryCta = entitled ? (
    <Button
      variant="org"
      onClick={() => onManage(prodId, entitlement?.planTier ?? "")}
      isPending={redirecting}
    >
      Manage in Stripe
      <ExternalLink />
    </Button>
  ) : null;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !redirecting) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className={`w-full p-0 sm:max-w-3xl ${redirecting ? "[&>button]:hidden" : ""}`}
        onEscapeKeyDown={(e) => {
          if (redirecting) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          if (redirecting) {
            e.preventDefault();
          }
        }}
      >
        <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
          <ProductIcon product={prod} size={40} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </SheetTitle>
            <SheetDescription className="mt-1">{prod.tagline || prod.desc}</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <PlansView
            prod={prod}
            entitlement={entitlement}
            cadence={cadence}
            redirecting={redirecting}
            pendingTier={pendingTier}
            onSelect={handleSelect}
            onContact={onContact}
          />
        </div>

        <SheetFooter className="flex-row justify-start border-t">
          {primaryCta}
          <Button variant="outline" onClick={onClose} isDisabled={redirecting}>
            Close
          </Button>
          {entitled && selfServe && (
            <Button
              variant="danger"
              className="ml-auto"
              onClick={() => onRemove(prodId)}
              isDisabled={redirecting}
            >
              Remove
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
