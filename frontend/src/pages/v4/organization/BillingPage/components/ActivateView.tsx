import { useEffect, useMemo, useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Item, Tile } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SheetBody, SheetFooter, SheetSections } from "@app/components/v4/ui/sheet";
import { SmallText } from "@app/components/v4/ui/text";
import {
  type BillingCadence,
  type BillingCatalogPlan,
  type BillingCatalogProduct,
  type BillingDim,
  BillingErrorCode
} from "@app/hooks/api/billing/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { bandRateLabel, billingErrorCode, fmtMoney, fmtMoneyCents } from "../billing-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import { CommitmentTerms } from "./CommitmentTerms";
import { MeteredBandTable } from "./MeteredBandTable";
import { productIconName } from "./shared";
import {
  CostSummary,
  MANAGED_BILLING_REASON,
  PaymentActionRequiredNotice,
  PaymentApprovalNotice,
  ProductSheetHeader,
  Stepper
} from "./sheet-shared";

type Props = {
  orgId: string;
  prod: BillingCatalogProduct;
  plan: BillingCatalogPlan;
  hasActiveSubscription: boolean;
  returnPath: string;
  renewsOn: string | null;
  // false for an enterprise-managed org: the activate button is disabled (a mutation would 403).
  selfServe: boolean;
  // This plan offers an unused self-serve trial. In the monthly cadence the primary action becomes
  // "Start a free trial" (which opens the confirmation dialog) instead of a paid activation.
  trialAvailable: boolean;
  onStartTrial: () => void;
  onBack: () => void;
  onDone: () => void;
};

const isCommittable = (dim: BillingDim): boolean =>
  dim.annual > 0 && dim.monthly > 0 && !dim.meteredAnnual;

// The plan's monthly headline price (base fee, else the first per-unit monthly rate). A metered rate
// is a price per unit of usage, never a monthly fee, so it is never the headline.
const monthlyHeadline = (plan: BillingCatalogPlan): number => {
  if (plan.base) {
    return plan.base.monthly;
  }
  const dim = plan.dims.find((d) => d.monthly > 0 && !d.meteredMonthly);
  return dim ? dim.monthly : 0;
};

const annualHeadline = (plan: BillingCatalogPlan): number => {
  if (plan.base) {
    return plan.base.annual;
  }
  const dim = plan.dims.find((d) => d.annual > 0 && !d.meteredAnnual);
  return dim ? dim.annual : 0;
};

const meteredDimNote = (dim: BillingDim): string => {
  const tiers = dim.bands?.tiers ?? [];
  if (tiers.length > 1) {
    return dim.bands?.mode === "volume"
      ? "Billed by usage each month. All usage is priced at the band the month's total reaches."
      : "Billed by usage each month. Each band's usage is priced at that band's rate.";
  }
  const rate =
    tiers.length === 1
      ? bandRateLabel(tiers[0], dim.noun)
      : `${fmtMoneyCents(dim.monthly)} per ${dim.noun}`;
  return `Billed by usage each month at ${rate}.`;
};

export const ActivateView = ({
  orgId,
  prod,
  plan,
  hasActiveSubscription,
  returnPath,
  renewsOn,
  selfServe,
  trialAvailable,
  onStartTrial,
  onBack,
  onDone
}: Props) => {
  const committable = useMemo(() => plan.dims.filter(isCommittable), [plan.dims]);
  // Usage-billed dimensions are charged monthly in arrears on either cadence, so neither the amount
  // due today nor the recurring total includes them.
  const meteredDims = useMemo(() => plan.dims.filter((d) => d.meteredMonthly), [plan.dims]);
  const hasUsage = meteredDims.length > 0;
  const supportsAnnual =
    plan.dims.some((d) => d.annual > 0) || Boolean(plan.base && plan.base.annual > 0);
  const supportsMonthly =
    plan.dims.some((d) => d.monthly > 0) || Boolean(plan.base && plan.base.monthly > 0);

  const [cadence, setCadence] = useState<BillingCadence>(() => {
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
  // A trial is monthly and usage-based, so it only applies to the monthly cadence. Yearly is a paid
  // annual purchase, so the action flips back to Pay.
  const trialFlow = trialAvailable && cadence === "monthly";

  const billing = useV4Adapter("billing");
  const preview = billing.usePreviewChange();
  const buyProduct = billing.useBuyProduct();

  // Yearly sends the buyer-chosen commitment quantities; monthly sends nothing (the server seeds the
  // recurring quantities from present usage).
  const quantitiesForCadence = cadence === "annual" ? commitments : undefined;
  const quantitiesKey = JSON.stringify(quantitiesForCadence ?? {});

  // Keyed to the selection that was declined, so changing cadence or quantities clears the notice.
  const selectionKey = `${cadence}:${quantitiesKey}`;
  const [declinedSelectionKey, setDeclinedSelectionKey] = useState<string | null>(null);
  const showPaymentActionRequired = declinedSelectionKey === selectionKey;
  const [approval, setApproval] = useState<{ selectionKey: string; paymentUrl: string } | null>(
    null
  );
  const approvalUrl = approval?.selectionKey === selectionKey ? approval.paymentUrl : null;

  const localRecurring = cadence === "annual" ? annualHeadline(plan) : monthlyHeadline(plan);

  // The preview prices a first purchase too, so every activation waits on it; until it is fresh for
  // the current selection the cost rows render as skeletons.
  const previewFresh =
    !preview.isPending &&
    Boolean(preview.data) &&
    preview.variables?.cadence === cadence &&
    JSON.stringify(preview.variables?.quantities ?? {}) === quantitiesKey;
  const isCalculating = !previewFresh;

  // Debounced re-price on cadence or quantity changes so a burst of stepper clicks makes one request.
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
  }, [orgId, prod.id, plan.tier, cadence, quantitiesKey]);

  // Adding to a live subscription is invoice-now, so the card is charged totalDueNow (this change plus
  // any earlier unbilled mid-cycle changes it settles); a first purchase goes through Stripe Checkout,
  // which collects the whole first invoice up front (nextInvoiceTotal). A trial collects nothing today.
  let dueToday = 0;
  if (!trialFlow && preview.data) {
    dueToday = hasActiveSubscription
      ? Math.max(preview.data.totalDueNow, 0)
      : preview.data.nextInvoiceTotal;
  }
  const recurring = preview.data?.nextRecurringTotal ?? 0;
  const additionalCharges = preview.data?.additionalCharges ?? 0;
  const period = cadence === "annual" ? "year" : "month";
  const pending = buyProduct.isPending;
  const dueLabel = fmtMoney(dueToday, dueToday ? 2 : 0);

  let chargedNote = "Calculating…";
  if (trialFlow) {
    chargedNote = "Free during your trial";
  } else if (!isCalculating && hasUsage && dueToday === 0) {
    chargedNote = "Nothing to pay today; usage is billed at the end of each month";
  } else if (!isCalculating) {
    chargedNote = hasActiveSubscription
      ? "Prorated onto your shared billing date"
      : "Due today at checkout";
  }

  let primaryReason: string | undefined;
  if (!selfServe) {
    primaryReason = MANAGED_BILLING_REASON;
  } else if (!trialFlow && !isCalculating && needsCommitmentAck && !acknowledged) {
    primaryReason = "Accept the commitment terms first.";
  }

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
    setDeclinedSelectionKey(null);
    setApproval(null);
    try {
      const result = await buyProduct.mutateAsync({
        orgId,
        productId: prod.id,
        plan: plan.tier,
        cadence,
        quantities: quantitiesForCadence,
        returnPath
      });
      if (result.outcome === "payment_action_required" && result.paymentUrl) {
        setApproval({ selectionKey, paymentUrl: result.paymentUrl });
        return;
      }
      if (result.outcome === "subscription_updated") {
        saved(`${prod.name} activated. It may take a moment to update here.`);
        onDone();
        return;
      }
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      failed("Failed to start checkout.");
    } catch (error) {
      if (billingErrorCode(error) === BillingErrorCode.PaymentActionRequired) {
        setDeclinedSelectionKey(selectionKey);
      }
    }
  };

  let primaryLabel = "Start a free trial";
  if (!trialFlow) {
    primaryLabel = isCalculating ? "Activate" : `Activate and pay ${dueLabel} today`;
  }

  let recurringNote: string | undefined;
  if (trialFlow) {
    recurringNote = "Billed monthly after your trial ends";
  } else if (renewsOn) {
    recurringNote = `Billed on ${renewsOn}`;
  }
  let recurringLabel = `${fmtMoney(recurring)} / ${period}`;
  if (hasUsage) {
    recurringLabel = recurring > 0 ? `${recurringLabel} + usage` : "Usage only";
  }
  if (hasUsage && recurring === 0 && !trialFlow) {
    recurringNote = "Billed at the end of each month for what you use";
  } else if (hasUsage) {
    recurringNote = recurringNote
      ? `${recurringNote}, plus usage at the end of each month`
      : "Plus usage, billed at the end of each month";
  }

  let planPrice = "Usage-based";
  if (localRecurring > 0 || !hasUsage) {
    planPrice = `${fmtMoney(cadence === "annual" ? localRecurring / 12 : localRecurring)} / mo`;
  }

  return (
    <SheetSections
      header={<ProductSheetHeader prod={prod} title={`Activate ${prod.name}`} />}
      footer={
        <SheetFooter>
          <Inline justify="between">
            <Button variant="ghost" icon="chev-left" onClick={onBack} disabled={pending}>
              Back to plans
            </Button>
            <Button
              onClick={trialFlow ? onStartTrial : handleActivate}
              disabled={!trialFlow && isCalculating}
              disabledReason={primaryReason}
              loading={!trialFlow && pending}
            >
              {primaryLabel}
            </Button>
          </Inline>
        </SheetFooter>
      }
    >
      <SheetBody>
        <Stack gap={16}>
          {supportsMonthly && supportsAnnual && (
            <Field
              group
              wide
              label="Billing cadence"
              description={
                cadence === "monthly"
                  ? "Pay for what you provision each month. No commitment, scale up or down freely."
                  : "Pre-buy units for the year at the annual rate. Usage above your commitment is billed monthly on-demand."
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <Tile
                  selected={cadence === "monthly"}
                  title="Monthly"
                  description="Usage-based"
                  onClick={() => setCadence("monthly")}
                />
                <Tile
                  selected={cadence === "annual"}
                  title={
                    <Inline gap={8}>
                      Yearly
                      {savingsPct && <Badge tone="ok">Save ~{savingsPct}%</Badge>}
                    </Inline>
                  }
                  description="Commit & save"
                  onClick={() => setCadence("annual")}
                />
              </div>
            </Field>
          )}

          {cadence === "annual" &&
            committable.map((dim) => (
              <Item
                key={dim.key}
                variant="outline"
                title={dim.label}
                description={`${fmtMoney(dim.annual / 12, 2)} / ${dim.noun} / month, billed annually`}
                actions={
                  <Stepper
                    label={dim.label}
                    value={commitments[dim.key] ?? 0}
                    min={0}
                    onChange={(value) => setCommitments((prev) => ({ ...prev, [dim.key]: value }))}
                  />
                }
              />
            ))}

          {(cadence === "monthly" || committable.length === 0) && (
            <Item
              variant="outline"
              icon={productIconName(prod)}
              title={prod.name}
              badge={<Badge tone="soft">{plan.name}</Badge>}
              description={plan.feature || undefined}
              truncate={false}
              actions={
                <div className="flex flex-col items-end">
                  <span className="font-medium tabular-nums">{planPrice}</span>
                  {cadence === "annual" && planPrice !== "Usage-based" && (
                    <SmallText muted>billed annually</SmallText>
                  )}
                </div>
              }
            />
          )}

          {meteredDims.map((dim) => (
            <Item
              key={dim.key}
              variant="outline"
              title={dim.label}
              description={meteredDimNote(dim)}
              truncate={false}
            >
              {dim.bands && dim.bands.tiers.length > 1 && (
                <div className="w-full">
                  <MeteredBandTable bands={dim.bands} noun={dim.noun} />
                </div>
              )}
            </Item>
          ))}

          <CostSummary
            rows={[
              {
                label: trialFlow ? "Due today" : "Charged today",
                note: chargedNote,
                value: dueLabel,
                isCalculating: !trialFlow && isCalculating
              },
              {
                label: cadence === "annual" ? "New yearly total" : "New monthly total",
                note: recurringNote,
                value: recurringLabel,
                isCalculating
              }
            ]}
          />

          {hasActiveSubscription && !isCalculating && (
            <ChargeBreakdown
              prorationAmount={preview.data?.prorationAmount ?? 0}
              additionalCharges={additionalCharges}
              totalDueNow={preview.data?.totalDueNow ?? 0}
            />
          )}

          {needsCommitmentAck && (
            <CommitmentTerms acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
          )}

          {showPaymentActionRequired && <PaymentActionRequiredNotice orgId={orgId} />}
          {approvalUrl && <PaymentApprovalNotice paymentUrl={approvalUrl} />}
        </Stack>
      </SheetBody>
    </SheetSections>
  );
};
