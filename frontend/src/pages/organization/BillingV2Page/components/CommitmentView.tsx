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

import { dimAnnualCommitted, fmtMoney } from "../billing-v2-format";
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
  const committable = useMemo(
    () => (entitlement.dimensions ?? []).filter(dimAnnualCommitted),
    [entitlement.dimensions]
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(committable.map((dim) => [dim.key, dim.committed ?? 0]))
  );

  const preview = usePreviewBillingV2Change();
  const applyCommitment = useChangeBillingV2Commitment();

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
  const chargedToday = hasChanges ? Math.max(preview.data?.prorationAmount ?? 0, 0) : 0;

  let chargedNote = "No change yet";
  if (hasChanges) {
    chargedNote = isCalculating ? "Calculating…" : "Prorated for the rest of your annual term";
  }

  const canConfirm = hasChanges && previewFresh;

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
      createNotification({ type: "error", text: `Failed to update ${prod.name} commitment.` });
    }
  };

  const onDemandDelta =
    // eslint-disable-next-line no-nested-ternary
    newOnDemand === currentOnDemand
      ? null
      : newOnDemand < currentOnDemand
        ? `Down from ${fmtMoney(currentOnDemand)} / mo`
        : `Up from ${fmtMoney(currentOnDemand)} / mo`;

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
          <SheetTitle className="text-base">Change {prod.name} commitment</SheetTitle>
          <p className="text-xs text-muted">
            Adjust the units you pre-buy for the year. Usage above your commitment is billed monthly
            on-demand.
          </p>
        </div>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {committable.map((dim) => {
          const onDemandQty = Math.max(0, dim.used - quantities[dim.key]);
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
                min={1}
                onChange={(value) => setQuantities((prev) => ({ ...prev, [dim.key]: value }))}
              />
            </div>
          );
        })}

        <Alert variant="info">
          <InfoIcon />
          <AlertDescription className="text-foreground">
            Committed units are pre-bought for the year at the annual rate. Usage above your
            commitment is billed monthly at the on-demand rate until your renewal.Increasing your
            commitment takes effect immediately for the rest of the term and is invoiced right away.
          </AlertDescription>
        </Alert>

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
