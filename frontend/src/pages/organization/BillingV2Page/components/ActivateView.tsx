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
  useBuyBillingV2Product,
  usePreviewBillingV2Change
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import { CommitmentTerms } from "./CommitmentTerms";
import { CostSummary, CostSummaryRow, ProductIcon, Stepper } from "./shared";

type Props = {
  orgId: string;
  prod: BillingV2CatalogProduct;
  plan: BillingV2Plan;
  hasActiveSubscription: boolean;
  returnPath: string;
  renewsOn: string | null;
  onBack: () => void;
  onDone: () => void;
};

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

// The plan's annual headline price (base fee, else the first priced dimension's annual rate).
const annualHeadline = (plan: BillingV2Plan): number => {
  if (plan.base) {
    return plan.base.annual;
  }
  const dim = plan.dims.find((d) => d.annual > 0);
  return dim ? dim.annual : 0;
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

export const ActivateView = ({
  orgId,
  prod,
  plan,
  hasActiveSubscription,
  returnPath,
  renewsOn,
  onBack,
  onDone
}: Props) => {
  const committable = useMemo(() => plan.dims.filter(isCommittable), [plan.dims]);
  const supportsAnnual =
    plan.dims.some((d) => d.annual > 0) || Boolean(plan.base && plan.base.annual > 0);
  const supportsMonthly =
    plan.dims.some((d) => d.monthly > 0) || Boolean(plan.base && plan.base.monthly > 0);

  const [cadence, setCadence] = useState<BillingV2Cadence>(() => {
    if (plan.trialable && supportsMonthly) {
      return "monthly";
    }
    return supportsAnnual ? "annual" : "monthly";
  });
  const [commitments, setCommitments] = useState<Record<string, number>>(() =>
    Object.fromEntries(committable.map((dim) => [dim.key, Math.max(dim.included, 1)]))
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const needsCommitmentAck = cadence === "annual" && committable.length > 0;

  const preview = usePreviewBillingV2Change();
  const buyProduct = useBuyBillingV2Product();

  // Yearly sends the buyer-chosen commitment quantities; monthly sends nothing (the server seeds the
  // recurring quantities from present usage).
  const quantitiesForCadence = cadence === "annual" ? commitments : undefined;
  const quantitiesKey = JSON.stringify(quantitiesForCadence ?? {});

  // The plan's headline price for the chosen cadence, shown on the static product row.
  const localRecurring = cadence === "annual" ? annualHeadline(plan) : monthlyHeadline(plan);

  // The preview prices the purchase for the current cadence + quantities whether or not a live
  // subscription exists (it prices a first purchase too), so every activation waits on it. Until it is
  // fresh for the current selection the cost rows render as skeletons.
  const previewFresh =
    !preview.isPending &&
    Boolean(preview.data) &&
    preview.variables?.cadence === cadence &&
    JSON.stringify(preview.variables?.quantities ?? {}) === quantitiesKey;
  const isCalculating = !previewFresh;

  // Debounced re-price on cadence/quantity changes so a burst of stepper clicks makes one request;
  // skipped when the current selection is already priced.
  useEffect(() => {
    if (previewFresh) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      preview.mutate({
        orgId,
        addProductId: prod.id,
        plan: plan.tier,
        cadence,
        quantities: quantitiesForCadence
      });
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, prod.id, plan.tier, cadence, quantitiesKey]);

  // Both figures come from the preview. "Charged today" differs by path: adding to a live subscription
  // is invoice-now, so the card is charged totalDueNow (this change plus any earlier unbilled mid-cycle
  // changes it settles); a first purchase goes through Stripe Checkout, which collects the whole first
  // invoice up front (nextInvoiceTotal) — for a yearly commitment that is the full annual amount, not
  // the $0 prorationAmount a first purchase reports.
  let dueToday = 0;
  if (preview.data) {
    dueToday = hasActiveSubscription
      ? Math.max(preview.data.totalDueNow, 0)
      : preview.data.nextInvoiceTotal;
  }
  const recurring = preview.data?.nextRecurringTotal ?? 0;
  // Only the invoice-now (existing-subscription) path settles earlier pending charges; disclose the
  // split when there are any. A first purchase via Checkout has none.
  const additionalCharges = preview.data?.additionalCharges ?? 0;
  const showChargeBreakdown = hasActiveSubscription && !isCalculating && additionalCharges !== 0;
  const period = cadence === "annual" ? "year" : "month";
  const pending = buyProduct.isPending;

  let chargedNote = "Calculating…";
  if (!isCalculating) {
    chargedNote = hasActiveSubscription
      ? "Prorated onto your shared billing date"
      : "Due today at checkout";
  }
  // The CTA waits until the preview has priced the current selection, and an annual commitment also
  // requires the customer to acknowledge the commitment terms.
  const activateDisabled = pending || isCalculating || (needsCommitmentAck && !acknowledged);

  // Savings badge on the yearly option: how much cheaper the annual rate is vs paying monthly.
  const savingsPct = useMemo(() => {
    const monthly = monthlyHeadline(plan);
    const annual = annualHeadline(plan);
    if (monthly <= 0 || annual <= 0) {
      return null;
    }
    const pct = Math.round((1 - annual / (monthly * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [plan]);

  const handleActivate = async () => {
    try {
      const result = await buyProduct.mutateAsync({
        orgId,
        productId: prod.id,
        plan: plan.tier,
        cadence,
        quantities: quantitiesForCadence,
        // The preview echoes the proration instant so the applied charge matches what was shown.
        prorationDate: preview.data?.prorationDate ?? undefined,
        returnPath
      });
      if (result.outcome === "subscription_updated") {
        createNotification({
          type: "success",
          text: `${prod.name} activated. It may take a moment to update here.`
        });
        onDone();
        return;
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      createNotification({ type: "error", text: "Failed to start checkout." });
    } catch {
      // The backend's message is surfaced by the global mutation error handler (reactQuery.tsx).
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

        {(cadence === "monthly" || committable.length === 0) && (
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
              {fmtMoney(localRecurring)} / {period}
            </span>
          </div>
        )}

        {needsCommitmentAck && (
          <CommitmentTerms acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
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

        {showChargeBreakdown && (
          <ChargeBreakdown
            prorationAmount={preview.data?.prorationAmount ?? 0}
            additionalCharges={additionalCharges}
            totalDueNow={preview.data?.totalDueNow ?? 0}
          />
        )}
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
