import { useEffect, useMemo, useState } from "react";
import { ArrowUpIcon, ChevronLeftIcon, Info } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, SheetFooter, SheetHeader, SheetTitle } from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  BillingV2CommitmentChange,
  BillingV2Entitlement,
  useChangeBillingV2Commitment,
  usePreviewBillingV2Change
} from "@app/hooks/api";

import { dimAnnualCommitted, fmtMoney } from "../billing-v2-data";
import { ProductIcon, Stepper } from "./shared";

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

  // Re-price whenever the set of changes changes; with nothing changed, there is no charge to preview.
  useEffect(() => {
    if (changes.length > 0) {
      preview.mutate({ orgId, commitmentChanges: changes });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, changesKey]);

  const hasChanges = changes.length > 0;

  // Current annual commitment total (committed × annual rate) and the current monthly on-demand spend,
  // both computed client-side so the summary can show the before/after delta.
  const currentAnnual = committable.reduce(
    (sum, dim) => sum + (dim.committed ?? 0) * (dim.committedRate ?? 0),
    0
  );
  const newAnnual = hasChanges && preview.data ? preview.data.nextRecurringTotal : currentAnnual;
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
    chargedNote = preview.isPending ? "Calculating…" : "Prorated for the rest of your annual term";
  }

  const raiseToCoverUsage = () => {
    setQuantities((prev) => {
      const next = { ...prev };
      committable.forEach((dim) => {
        next[dim.key] = Math.max(dim.committed ?? 0, dim.used);
      });
      return next;
    });
  };
  const coversUsage = committable.every((dim) => quantities[dim.key] >= dim.used);

  const canConfirm = hasChanges && Boolean(preview.data) && !preview.isPending;

  const handleConfirm = async () => {
    try {
      await applyCommitment.mutateAsync({
        orgId,
        changes,
        prorationDate: preview.data?.prorationDate
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

  return (
    <>
      <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
        <ProductIcon product={prod} size={40} />
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base">Change {prod.name} commitment</SheetTitle>
          <p className="mt-1 text-sm text-muted">
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
                    <span className="text-warning">
                      {" "}
                      · {onDemandQty.toLocaleString()} on-demand
                    </span>
                  )}
                </div>
              </div>
              <Stepper
                value={quantities[dim.key]}
                min={0}
                onChange={(value) => setQuantities((prev) => ({ ...prev, [dim.key]: value }))}
              />
            </div>
          );
        })}

        {!coversUsage && (
          <Button variant="info" size="sm" className="self-start" onClick={raiseToCoverUsage}>
            <ArrowUpIcon />
            Raise commitment to cover current usage
          </Button>
        )}

        <div className="flex gap-3 rounded-lg border border-info/20 bg-info/5 p-4 text-xs text-accent">
          <Info className="mt-0.5 size-4 shrink-0 text-info" />
          <span>
            Committed units are pre-bought for the year at the annual rate. Usage above your
            commitment is billed monthly at the on-demand rate until your renewal. Raising your
            commitment is prorated for the rest of the term; lowering it takes effect at renewal.
          </span>
        </div>

        <div className="flex flex-col rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border bg-mineshaft-700/40 p-4">
            <div>
              <div className="text-sm text-foreground">Charged today</div>
              <div className="text-xs text-muted">{chargedNote}</div>
            </div>
            <span className="text-lg font-semibold text-info tabular-nums">
              {fmtMoney(chargedToday, chargedToday ? 2 : 0)}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <div className="text-sm text-foreground">New annual commitment</div>
              <div className="text-xs text-muted">
                For {prod.name}
                {renewsOn ? `, billed on ${renewsOn}` : ""}
              </div>
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {fmtMoney(newAnnual)} / year
            </span>
          </div>
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm text-foreground">On-demand after change</div>
              <div className="text-xs text-muted">
                {onDemandDelta ?? "Billed monthly for usage above your commitment"}
              </div>
            </div>
            <span className="text-sm font-semibold text-warning tabular-nums">
              {fmtMoney(newOnDemand)} / mo
            </span>
          </div>
        </div>
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
