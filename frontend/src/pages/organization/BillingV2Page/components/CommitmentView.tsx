import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  BillingV2CommitmentChange,
  BillingV2Entitlement,
  useChangeBillingV2Commitment,
  usePreviewBillingV2Change
} from "@app/hooks/api";

import { dimCommitManageable, fmtMoney } from "../billing-v2-format";
import { ChargeBreakdown } from "./ChargeBreakdown";
import { CommitmentTerms } from "./CommitmentTerms";
import { CostSummary, CostSummaryRow, ProductIcon, Stepper } from "./shared";

type Props = {
  orgId: string;
  prod: BillingV2CatalogProduct;
  entitlement: BillingV2Entitlement;
  renewsOn: string | null;
  onBack: () => void;
  onDone: () => void;
};

// Change the prepaid annual commitment for a product's per_resource dimensions. Steppers set the new
// committed quantity per dimension; the preview endpoint (commitmentChanges) prices the change and the
// apply endpoint commits it. Usage above the commitment is billed monthly on-demand.
export const CommitmentView = ({ orgId, prod, entitlement, renewsOn, onBack, onDone }: Props) => {
  // Dimensions this sheet manages: commit-eligible per the subscription read's per-dimension
  // commitAvailable (this customer's pinned plan version, NOT the catalog, so a later catalog price
  // never lights up commit for a grandfathered customer), OR already carrying a commitment even if it
  // is no longer commit-eligible, so an existing commitment is always inspectable. This is the same
  // predicate that gates the "Change commitment" action, so the sheet is never empty when opened. An
  // eligible dimension with committed === null starts from zero (e.g. a monthly subscriber committing
  // annually); committed is normalized to a number so the stepper and cost math handle that case.
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
  // "Set up" a first commitment reads differently from "Change" an existing one.
  const hasExistingCommitment = committable.some((dim) => dim.committed > 0);

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(committable.map((dim) => [dim.key, dim.committed ?? 0]))
  );

  const preview = usePreviewBillingV2Change();
  const applyCommitment = useChangeBillingV2Commitment();

  // An increase (or a brand-new commitment) charges upfront and locks in the annual terms, so it
  // requires the customer to acknowledge the commitment terms before confirming. A pure decrease
  // (only possible inside the renewal window) does not.
  const [acknowledged, setAcknowledged] = useState(false);

  // Only the dimensions whose committed quantity actually changed are sent to preview/apply.
  const changes: BillingV2CommitmentChange[] = useMemo(
    () =>
      committable
        .filter((dim) => quantities[dim.key] !== (dim.committed ?? 0))
        .map((dim) => ({ dimensionKey: dim.key, quantity: quantities[dim.key] })),
    [committable, quantities]
  );
  const changesKey = JSON.stringify(changes);
  const hasChanges = changes.length > 0;

  // A preview is fresh only once priced for the current changes; stale ones render as skeletons.
  const previewFresh =
    !preview.isPending &&
    Boolean(preview.data) &&
    JSON.stringify(preview.variables?.commitmentChanges) === changesKey;
  const isCalculating = hasChanges && !previewFresh;

  // Debounced re-price on changes so a burst of stepper clicks makes one request. Skipped with
  // nothing changed or when the current set is already priced.
  useEffect(() => {
    if (changes.length === 0 || previewFresh) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      preview.mutate({ orgId, commitmentChanges: changes });
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, changesKey]);

  // Current annual commitment total (committed × annual rate) and the current monthly on-demand spend,
  // both computed client-side so the summary can show the before/after delta.
  const currentAnnual = committable.reduce(
    (sum, dim) => sum + (dim.committed ?? 0) * (dim.committedRate ?? 0),
    0
  );
  // The product's new annual commitment is deterministic from the version-pinned committed rates:
  // quantities × committedRate over this product's annual dims (mirrors currentAnnual with the stepped
  // values). Derive it client-side so the figure stays product-scoped and exact — the preview's
  // nextRecurringTotal is the whole subscription's recurring total and must not be shown here.
  const newAnnual = committable.reduce(
    (sum, dim) => sum + (quantities[dim.key] ?? 0) * (dim.committedRate ?? 0),
    0
  );
  const currentOnDemand =
    entitlement.onDemandAmount ??
    committable.reduce(
      (sum, dim) => sum + Math.max(0, dim.used - (dim.committed ?? 0)) * (dim.onDemandRate ?? 0),
      0
    );
  const newOnDemand = committable.reduce(
    (sum, dim) => sum + Math.max(0, dim.used - quantities[dim.key]) * (dim.onDemandRate ?? 0),
    0
  );
  // Applying is invoice-now, so the card is charged totalDueNow (this change + any earlier unbilled
  // mid-cycle changes), not just this change's proration. Disclose the split when there are extras.
  const chargedToday = hasChanges ? Math.max(preview.data?.totalDueNow ?? 0, 0) : 0;
  const additionalCharges = preview.data?.additionalCharges ?? 0;
  const showChargeBreakdown = hasChanges && previewFresh && additionalCharges !== 0;

  let chargedNote = "No change yet";
  if (hasChanges) {
    chargedNote = isCalculating ? "Calculating…" : "Prorated for the rest of your annual term";
  }

  // An increase raises the prepaid annual total; that (and starting a commitment from zero) is what
  // needs the upfront-commitment acknowledgment.
  const isIncreasing = newAnnual > currentAnnual;
  const canConfirm = hasChanges && previewFresh && (!isIncreasing || acknowledged);

  const handleConfirm = async () => {
    try {
      await applyCommitment.mutateAsync({
        orgId,
        changes
      });
      createNotification({
        type: "success",
        text: `${prod.name} commitment updated. It may take a moment to update here.`
      });
      onDone();
    } catch {
      // The backend's message is surfaced by the global mutation error handler (reactQuery.tsx).
    }
  };

  const onDemandDelta =
    // eslint-disable-next-line no-nested-ternary
    newOnDemand === currentOnDemand
      ? null
      : newOnDemand < currentOnDemand
        ? `Down from ${fmtMoney(currentOnDemand)} / mo`
        : `Up from ${fmtMoney(currentOnDemand)} / mo`;

  // When decreases are locked, name the date the window opens (first dimension that reports it).
  const lockedDim = committable.find(
    (dim) => dim.canDecreaseNow === false && dim.decreaseAllowedFrom
  );
  const decreaseLockNote = lockedDim?.decreaseAllowedFrom
    ? ` (from ${lockedDim.decreaseAllowedFrom})`
    : "";

  const annualNote = `For ${prod.name}${renewsOn ? `, billed on ${renewsOn}` : ""}`;
  const annualDelta =
    // eslint-disable-next-line no-nested-ternary
    newAnnual === currentAnnual
      ? null
      : newAnnual > currentAnnual
        ? `Up from ${fmtMoney(currentAnnual)} / year`
        : `Down from ${fmtMoney(currentAnnual)} / year`;

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
        <ProductIcon product={prod} size={40} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base">
            {hasExistingCommitment ? "Change" : "Set up"} {prod.name} commitment
          </SheetTitle>
          <p className="text-xs text-muted">
            {hasExistingCommitment ? "Adjust the" : "Pre-buy"} units you commit for the year. Usage
            above your commitment is billed monthly on-demand.
          </p>
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {committable.map((dim) => {
          const onDemandQty = Math.max(0, dim.used - quantities[dim.key]);
          // Increase-only: the stepper cannot go below the current committed quantity unless the
          // decrease window is open (canDecreaseNow). A decrease outside the window is rejected server
          // side (commitment_decrease_locked), so the floor is locked to committed until renewal.
          const committedFloor = dim.committed ?? 0;
          const stepperMin = dim.canDecreaseNow ? 0 : committedFloor;
          return (
            <div
              key={dim.key}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {dim.label} · committed for the year
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {fmtMoney(dim.committedRate ?? 0)} / {dim.noun} / yr committed · using{" "}
                  {dim.used.toLocaleString()} now
                  {onDemandQty > 0 && (
                    <>
                      <span className="text-warning/90">
                        {" "}
                        · {onDemandQty.toLocaleString()} on-demand
                      </span>{" "}
                      ·{" "}
                      <button
                        type="button"
                        className="cursor-pointer font-medium text-foreground hover:underline"
                        onClick={() => setQuantities((prev) => ({ ...prev, [dim.key]: dim.used }))}
                      >
                        Raise to cover
                      </button>
                    </>
                  )}
                </div>
              </div>
              <Stepper
                value={quantities[dim.key]}
                min={stepperMin}
                onChange={(value) => setQuantities((prev) => ({ ...prev, [dim.key]: value }))}
              />
            </div>
          );
        })}

        {isIncreasing ? (
          <CommitmentTerms acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
        ) : (
          <Alert variant="info">
            <InfoIcon />
            <AlertDescription className="text-foreground">
              Committed units are pre-bought for the year at the annual rate. Usage above your
              commitment is billed monthly at the on-demand rate until your renewal. You can raise a
              commitment any time (charged now); lowering it is only allowed in the final window
              before renewal{decreaseLockNote}.
            </AlertDescription>
          </Alert>
        )}

        <CostSummary>
          <CostSummaryRow
            label="Charged today"
            note={chargedNote}
            value={fmtMoney(chargedToday, chargedToday ? 2 : 0)}
            isCalculating={isCalculating}
            valueClassName="text-base"
          />
          <CostSummaryRow
            label="New annual commitment"
            note={annualDelta ?? annualNote}
            value={`${fmtMoney(newAnnual)} / year`}
          />
          <CostSummaryRow
            label="On-demand after change"
            note={onDemandDelta ?? "Billed monthly for usage above your commitment"}
            value={`${fmtMoney(newOnDemand)} / mo`}
            valueClassName={newOnDemand > 0 ? "text-warning/90" : "text-muted"}
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
        <Button variant="ghost" onClick={onBack} isDisabled={applyCommitment.isPending}>
          <ChevronLeftIcon />
          Back to plans
        </Button>
        <Button
          variant="org"
          onClick={handleConfirm}
          isDisabled={!canConfirm || applyCommitment.isPending}
          isPending={applyCommitment.isPending}
        >
          Confirm &amp; pay
        </Button>
      </SheetFooter>
    </>
  );
};
