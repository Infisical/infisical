import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Item } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SheetBody, SheetFooter } from "@app/components/v4/ui/sheet";
import {
  type BillingCatalogProduct,
  type BillingCommitmentChange,
  type BillingEntitlement,
  BillingErrorCode
} from "@app/hooks/api/billing/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { billingErrorCode, dimCommitManageable, fmtMoney } from "../billing-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import { CommitmentTerms } from "./CommitmentTerms";
import {
  CostSummary,
  MANAGED_BILLING_REASON,
  PaymentActionRequiredNotice,
  PaymentApprovalNotice,
  ProductSheetHeader,
  SheetSections,
  Stepper
} from "./sheet-shared";

type Props = {
  orgId: string;
  prod: BillingCatalogProduct;
  entitlement: BillingEntitlement;
  renewsOn: string | null;
  selfServe: boolean;
  onBack: () => void;
  onDone: () => void;
};

// Change the prepaid annual commitment for a product's per_resource dimensions. Steppers set the new
// committed quantity per dimension; the preview endpoint (commitmentChanges) prices the change and the
// apply endpoint commits it. Usage above the commitment is billed monthly on-demand.
export const CommitmentView = ({
  orgId,
  prod,
  entitlement,
  renewsOn,
  selfServe,
  onBack,
  onDone
}: Props) => {
  // The dimensions this sheet manages come from the subscription read's per-dimension commitAvailable
  // (this customer's pinned plan version, not the catalog), plus any dimension that already carries a
  // commitment, so an existing commitment is always inspectable. It is the same predicate that gates
  // the change-commitment action, so the sheet never opens empty.
  const committable = useMemo(
    () =>
      (entitlement.dimensions ?? []).filter(dimCommitManageable).map((dim) => ({
        key: dim.key,
        label: dim.label,
        noun: dim.noun,
        used: dim.used,
        committed: dim.committed ?? 0,
        committedRate: dim.committedRate ?? 0,
        onDemandRate: dim.onDemandRate ?? 0,
        canDecreaseNow: dim.canDecreaseNow ?? false,
        decreaseAllowedFrom: dim.decreaseAllowedFrom ?? null
      })),
    [entitlement.dimensions]
  );
  const hasExistingCommitment = committable.some((dim) => dim.committed > 0);

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(committable.map((dim) => [dim.key, dim.committed]))
  );

  const billing = useV4Adapter("billing");
  const preview = billing.usePreviewChange();
  const applyCommitment = billing.useChangeCommitment();

  // An increase (or a brand-new commitment) charges upfront and locks in the annual terms, so it needs
  // the commitment terms acknowledged. A pure decrease (only possible inside the renewal window) does
  // not.
  const [acknowledged, setAcknowledged] = useState(false);

  const changes: BillingCommitmentChange[] = useMemo(
    () =>
      committable
        .filter((dim) => quantities[dim.key] !== dim.committed)
        .map((dim) => ({ dimensionKey: dim.key, quantity: quantities[dim.key] })),
    [committable, quantities]
  );
  const changesKey = JSON.stringify(changes);
  const hasChanges = changes.length > 0;

  // Keyed to the changes that were declined, so editing the selection clears the notice.
  const [declinedChangesKey, setDeclinedChangesKey] = useState<string | null>(null);
  const showPaymentActionRequired = declinedChangesKey === changesKey;
  const [approval, setApproval] = useState<{ changesKey: string; paymentUrl: string } | null>(null);
  const approvalUrl = approval?.changesKey === changesKey ? approval.paymentUrl : null;

  const previewFresh =
    !preview.isPending &&
    Boolean(preview.data) &&
    JSON.stringify(preview.variables?.commitmentChanges) === changesKey;
  const isCalculating = hasChanges && !previewFresh;

  // Debounced re-price so a burst of stepper clicks makes one request.
  useEffect(() => {
    if (changes.length === 0 || previewFresh) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      preview.mutate({ orgId, commitmentChanges: changes });
    }, 500);
    return () => clearTimeout(timeout);
  }, [orgId, changesKey]);

  const currentAnnual = committable.reduce(
    (sum, dim) => sum + dim.committed * dim.committedRate,
    0
  );
  // Derived from the version-pinned committed rates so the figure stays product-scoped: the preview's
  // nextRecurringTotal is the whole subscription's recurring total and must not be shown here.
  const newAnnual = committable.reduce(
    (sum, dim) => sum + (quantities[dim.key] ?? 0) * dim.committedRate,
    0
  );
  const currentOnDemand =
    entitlement.onDemandAmount ??
    committable.reduce(
      (sum, dim) => sum + Math.max(0, dim.used - dim.committed) * dim.onDemandRate,
      0
    );
  const newOnDemand = committable.reduce(
    (sum, dim) => sum + Math.max(0, dim.used - quantities[dim.key]) * dim.onDemandRate,
    0
  );
  const chargedToday = hasChanges ? Math.max(preview.data?.totalDueNow ?? 0, 0) : 0;
  const additionalCharges = preview.data?.additionalCharges ?? 0;

  let chargedNote = "No change yet";
  if (hasChanges) {
    chargedNote = isCalculating ? "Calculating…" : "Prorated for the rest of your annual term";
  }

  const isIncreasing = newAnnual > currentAnnual;

  const handleConfirm = async () => {
    setDeclinedChangesKey(null);
    setApproval(null);
    try {
      const result = await applyCommitment.mutateAsync({ orgId, changes, productId: prod.id });
      if (result.outcome === "payment_action_required" && result.paymentUrl) {
        setApproval({ changesKey, paymentUrl: result.paymentUrl });
        return;
      }
      // checkout_created: no card on a trialing org, or the card needs the customer to approve it.
      if (result.outcome === "checkout_created" && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      saved(`${prod.name} commitment updated. It may take a moment to update here.`);
      onDone();
    } catch (error) {
      if (billingErrorCode(error) === BillingErrorCode.PaymentActionRequired) {
        setDeclinedChangesKey(changesKey);
      }
    }
  };

  let onDemandDelta: string | null = null;
  if (newOnDemand < currentOnDemand) {
    onDemandDelta = `Down from ${fmtMoney(currentOnDemand)} / mo`;
  } else if (newOnDemand > currentOnDemand) {
    onDemandDelta = `Up from ${fmtMoney(currentOnDemand)} / mo`;
  }

  let annualDelta: string | null = null;
  if (newAnnual > currentAnnual) {
    annualDelta = `Up from ${fmtMoney(currentAnnual)} / year`;
  } else if (newAnnual < currentAnnual) {
    annualDelta = `Down from ${fmtMoney(currentAnnual)} / year`;
  }

  // When decreases are locked, name the date the window opens (first dimension that reports it).
  const lockedDim = committable.find((dim) => !dim.canDecreaseNow && dim.decreaseAllowedFrom);
  const decreaseLockNote = lockedDim?.decreaseAllowedFrom
    ? ` (from ${lockedDim.decreaseAllowedFrom})`
    : "";

  const pending = applyCommitment.isPending;
  let confirmReason: string | undefined;
  if (!selfServe) {
    confirmReason = MANAGED_BILLING_REASON;
  } else if (!hasChanges) {
    confirmReason = "Change a committed quantity first.";
  } else if (previewFresh && isIncreasing && !acknowledged) {
    confirmReason = "Accept the commitment terms first.";
  }

  return (
    <SheetSections
      header={
        <ProductSheetHeader
          prod={prod}
          title={`${hasExistingCommitment ? "Change" : "Set up"} ${prod.name} commitment`}
          description={`${hasExistingCommitment ? "Adjust the" : "Pre-buy"} units you commit for the year. Usage above your commitment is billed monthly on-demand.`}
        />
      }
      body={
        <SheetBody>
          <Stack gap={16}>
            {committable.map((dim) => {
              const onDemandQty = Math.max(0, dim.used - quantities[dim.key]);
              // Increase-only until the decrease window opens: a decrease outside it is rejected
              // server side (commitment_decrease_locked), so the floor stays at the committed amount.
              const stepperMin = dim.canDecreaseNow ? 0 : dim.committed;
              return (
                <Item
                  key={dim.key}
                  variant="outline"
                  title={`${dim.label} committed for the year`}
                  truncate={false}
                  description={
                    <>
                      {fmtMoney(dim.committedRate)} / {dim.noun} / yr committed. Using{" "}
                      {dim.used.toLocaleString()} now
                      {onDemandQty > 0 && (
                        <>
                          , with{" "}
                          <span className="text-[color:var(--v4-warn)]">
                            {onDemandQty.toLocaleString()} on-demand
                          </span>
                          .{" "}
                          <Button
                            variant="link"
                            size="xs"
                            underline="hover"
                            onClick={() =>
                              setQuantities((prev) => ({ ...prev, [dim.key]: dim.used }))
                            }
                          >
                            Raise to cover
                          </Button>
                        </>
                      )}
                    </>
                  }
                  actions={
                    <Stepper
                      label={dim.label}
                      value={quantities[dim.key]}
                      min={stepperMin}
                      onChange={(value) => setQuantities((prev) => ({ ...prev, [dim.key]: value }))}
                    />
                  }
                />
              );
            })}

            {!isIncreasing && (
              <Alert tone="info">
                <Icon name="info" />
                <AlertDescription>
                  Committed units are pre-bought for the year at the annual rate. Usage above your
                  commitment is billed monthly at the on-demand rate until your renewal. You can
                  raise a commitment any time (charged now); lowering it is only allowed in the
                  final window before renewal{decreaseLockNote}.
                </AlertDescription>
              </Alert>
            )}

            <CostSummary
              rows={[
                {
                  label: "Charged today",
                  note: chargedNote,
                  value: fmtMoney(chargedToday, chargedToday ? 2 : 0),
                  isCalculating
                },
                {
                  label: "New annual commitment",
                  note:
                    annualDelta ?? `For ${prod.name}${renewsOn ? `, billed on ${renewsOn}` : ""}`,
                  value: `${fmtMoney(newAnnual)} / year`
                },
                {
                  label: "On-demand after change",
                  note: onDemandDelta ?? "Billed monthly for usage above your commitment",
                  value: `${fmtMoney(newOnDemand)} / mo`,
                  tone: newOnDemand > 0 ? "warn" : "muted"
                }
              ]}
            />

            {hasChanges && previewFresh && (
              <ChargeBreakdown
                prorationAmount={preview.data?.prorationAmount ?? 0}
                additionalCharges={additionalCharges}
                totalDueNow={preview.data?.totalDueNow ?? 0}
              />
            )}

            {isIncreasing && (
              <CommitmentTerms acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
            )}

            {showPaymentActionRequired && <PaymentActionRequiredNotice orgId={orgId} />}
            {approvalUrl && <PaymentApprovalNotice paymentUrl={approvalUrl} />}
          </Stack>
        </SheetBody>
      }
      footer={
        <SheetFooter>
          <Inline justify="between">
            <Button variant="ghost" icon="chev-left" onClick={onBack} disabled={pending}>
              Back to plans
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isCalculating}
              disabledReason={confirmReason}
              loading={pending}
            >
              Confirm &amp; pay
            </Button>
          </Inline>
        </SheetFooter>
      }
    />
  );
};
