import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Badge, Button, SheetFooter, SheetHeader, SheetTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2Dim,
  BillingV2Plan,
  useAddBillingV2Product,
  useCreateBillingV2CheckoutSession,
  usePreviewBillingV2Change
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-format";
import { CostSummary, CostSummaryRow, ProductIcon, Stepper } from "./shared";

type Props = {
  orgId: string;
  prod: BillingV2CatalogProduct;
  plan: BillingV2Plan;
  hasActiveSubscription: boolean;
  billingEmail?: string;
  returnPath: string;
  renewsOn: string | null;
  onBack: () => void;
  onDone: () => void;
};

// A per_resource dimension that can be committed annually. Commitment mode is prepaid annual units
// with monthly on-demand overage, so it requires BOTH cadences priced: the annual per-unit rate for
// the commitment and a monthly rate for the overage. A single-cadence dimension is not committable.
const isCommittable = (dim: BillingV2Dim): boolean =>
  dim.annual > 0 && dim.monthly > 0 && !dim.meteredAnnual;

// The plan's monthly headline price (base fee, else the first priced dimension's monthly rate).
const monthlyHeadline = (plan: BillingV2Plan): number => {
  if (plan.base) {
    return plan.base.monthly;
  }
  const dim = plan.dims.find((d) => d.monthly > 0);
  return dim ? dim.monthly : 0;
};

type CadenceOptionProps = {
  active: boolean;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
};

const CadenceOption = ({ active, title, subtitle, badge, onClick }: CadenceOptionProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-1 flex-col gap-1 rounded-lg border p-4 text-left transition-colors",
      active ? "border-org bg-org/5" : "border-border hover:border-foreground/20"
    )}
  >
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-foreground">{title}</span>
      {badge && <Badge variant="success">{badge}</Badge>}
    </div>
    <span className="text-xs text-muted">{subtitle}</span>
  </button>
);

// Activate a product on the chosen plan. Monthly is usage-based (rate only, no commitment); yearly
// asks for a committed quantity per per_resource dimension. The cost is previewed before confirming;
// an existing subscription is updated in place, a brand-new customer goes through Stripe Checkout.
export const ActivateView = ({
  orgId,
  prod,
  plan,
  hasActiveSubscription,
  billingEmail,
  returnPath,
  renewsOn,
  onBack,
  onDone
}: Props) => {
  const committable = useMemo(() => plan.dims.filter(isCommittable), [plan.dims]);
  const supportsAnnual = committable.length > 0 || Boolean(plan.base && plan.base.annual > 0);
  const supportsMonthly =
    plan.dims.some((d) => d.monthly > 0) || Boolean(plan.base && plan.base.monthly > 0);

  const [cadence, setCadence] = useState<BillingV2Cadence>(supportsMonthly ? "monthly" : "annual");
  const [commitments, setCommitments] = useState<Record<string, number>>(() =>
    Object.fromEntries(committable.map((dim) => [dim.key, Math.max(dim.included, 1)]))
  );

  const preview = usePreviewBillingV2Change();
  const addProduct = useAddBillingV2Product();
  const checkout = useCreateBillingV2CheckoutSession();

  const commitmentsForCadence = cadence === "annual" ? commitments : undefined;
  const commitmentsKey = JSON.stringify(commitmentsForCadence ?? {});

  // A brand-new customer has no subscription yet, so the preview endpoint (which prorates against a
  // live subscription) would fail. Compute the figures locally in that case and let Stripe Checkout
  // confirm the exact amount; an existing subscription re-prices via the debounced preview below.
  const localRecurring =
    cadence === "annual"
      ? (plan.base?.annual ?? 0) +
        committable.reduce((sum, dim) => sum + (commitments[dim.key] ?? 0) * dim.annual, 0)
      : monthlyHeadline(plan);

  // A preview is fresh only once priced for the current cadence + commitments; until then the cost
  // rows show skeletons. A new customer prices locally, so never calculates.
  const previewFresh =
    !preview.isPending &&
    Boolean(preview.data) &&
    preview.variables?.cadence === cadence &&
    JSON.stringify(preview.variables?.commitments ?? {}) === commitmentsKey;
  const isCalculating = hasActiveSubscription && !previewFresh;

  // Debounced re-price on cadence/commitment changes so a burst of stepper clicks makes one request.
  // Skipped without a live subscription or when the current combo is already priced.
  useEffect(() => {
    if (!hasActiveSubscription || previewFresh) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      preview.mutate({
        orgId,
        addProductId: prod.id,
        plan: plan.tier,
        cadence,
        commitments: commitmentsForCadence
      });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, prod.id, plan.tier, cadence, commitmentsKey, hasActiveSubscription]);

  // With a live subscription the change is prorated onto the shared billing date; a new customer pays
  // the first period in full at checkout.
  let dueToday = localRecurring;
  if (hasActiveSubscription) {
    dueToday = preview.data ? Math.max(preview.data.prorationAmount, 0) : 0;
  }
  const recurring = hasActiveSubscription
    ? (preview.data?.nextRecurringTotal ?? 0)
    : localRecurring;
  const period = cadence === "annual" ? "year" : "month";
  const pending = addProduct.isPending || checkout.isPending;

  let chargedNote = "Billed at checkout";
  if (hasActiveSubscription) {
    chargedNote = isCalculating ? "Calculating…" : "Prorated onto your shared billing date";
  }
  // Without a live subscription there is no preview to wait on, so the CTA is enabled immediately.
  const activateDisabled = pending || isCalculating;

  // Savings badge on the yearly option: how much cheaper the annual rate is vs paying monthly.
  const savingsPct = useMemo(() => {
    const monthly = monthlyHeadline(plan);
    const annual = plan.base
      ? plan.base.annual
      : (plan.dims.find((d) => d.annual > 0)?.annual ?? 0);
    if (monthly <= 0 || annual <= 0) {
      return null;
    }
    const pct = Math.round((1 - annual / (monthly * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [plan]);

  const handleActivate = async () => {
    try {
      if (hasActiveSubscription) {
        await addProduct.mutateAsync({
          orgId,
          productId: prod.id,
          plan: plan.tier,
          cadence,
          commitments: commitmentsForCadence
        });
        createNotification({
          type: "success",
          text: `${prod.name} activated. It may take a moment to update here.`
        });
        onDone();
        return;
      }
      const result = await checkout.mutateAsync({
        orgId,
        productId: prod.id,
        plan: plan.tier,
        cadence,
        commitments: commitmentsForCadence,
        email: billingEmail,
        returnPath
      });
      if (result.outcome === "subscription_updated") {
        createNotification({ type: "success", text: `${prod.name} activated.` });
        onDone();
        return;
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      createNotification({ type: "error", text: "Failed to start checkout." });
    } catch {
      createNotification({ type: "error", text: `Failed to activate ${prod.name}.` });
    }
  };

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
        <ProductIcon product={prod} size={40} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base">Activate {prod.name}</SheetTitle>
          <p className="mt-1 text-sm text-muted">
            Choose monthly or yearly billing, set your units, and see the cost before you confirm.
          </p>
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {supportsMonthly && supportsAnnual && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Billing cadence</span>
            <div className="flex gap-3">
              <CadenceOption
                active={cadence === "monthly"}
                title="Monthly"
                subtitle="Usage-based"
                onClick={() => setCadence("monthly")}
              />
              <CadenceOption
                active={cadence === "annual"}
                title="Yearly"
                subtitle="Commit & save"
                badge={savingsPct ? `SAVE ~${savingsPct}%` : undefined}
                onClick={() => setCadence("annual")}
              />
            </div>
            <span className="text-xs text-muted">
              {cadence === "monthly"
                ? "Pay for what you provision each month. No commitment, scale up or down freely."
                : "Pre-buy units for the year at the annual rate. Usage above your commitment is billed monthly on-demand."}
            </span>
          </div>
        )}

        {cadence === "annual" && committable.length > 0
          ? committable.map((dim) => (
              <div
                key={dim.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {dim.label} · committed for the year
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {fmtMoney(dim.annual)} / {dim.noun} / yr committed
                  </div>
                </div>
                <Stepper
                  value={commitments[dim.key] ?? 0}
                  min={0}
                  onChange={(value) => setCommitments((prev) => ({ ...prev, [dim.key]: value }))}
                />
              </div>
            ))
          : null}

        {cadence === "monthly" && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div className="flex min-w-0 items-center gap-3">
              <ProductIcon product={prod} size={36} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {prod.name} · {plan.name}
                </div>
                {plan.feature && <div className="mt-0.5 text-xs text-muted">{plan.feature}</div>}
              </div>
            </div>
            <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
              {fmtMoney(monthlyHeadline(plan))} / month
            </span>
          </div>
        )}

        <CostSummary>
          <CostSummaryRow
            label="Charged today"
            note={chargedNote}
            value={fmtMoney(dueToday, dueToday ? 2 : 0)}
            isCalculating={isCalculating}
            valueClassName="text-base"
          />
          <CostSummaryRow
            label={cadence === "annual" ? "Annual commitment" : "Monthly total"}
            note={renewsOn ? `Billed on ${renewsOn}` : undefined}
            value={`${fmtMoney(recurring)} / ${period}`}
            isCalculating={isCalculating}
          />
        </CostSummary>
      </div>

      <SheetFooter className="flex-row justify-between border-t">
        <Button variant="ghost" onClick={onBack} isDisabled={pending}>
          <ChevronLeftIcon />
          Back to plans
        </Button>
        <Button
          variant="org"
          onClick={handleActivate}
          isDisabled={activateDisabled}
          isPending={pending}
        >
          {isCalculating
            ? "Activate"
            : `Activate · pay ${fmtMoney(dueToday, dueToday ? 2 : 0)} today`}
        </Button>
      </SheetFooter>
    </>
  );
};
