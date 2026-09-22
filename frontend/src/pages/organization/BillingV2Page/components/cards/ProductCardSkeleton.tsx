import { Skeleton } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { BillingV2Entitlement } from "@app/hooks/api";

import { commitSavingsNudge, dimHasCeiling, productAnnualCommitted } from "../../billing-v2-format";
import { breakdownableDimensions } from "../UsageBreakdownSheet";

type MeterRow = { key: string; hasBar: boolean };

export type ProductCardShape = {
  meters: MeterRow[];
  figures: number;
  hasOnDemandNote: boolean;
  hasAction: boolean;
  hasTrialStrip: boolean;
  hasBreakdownStrip: boolean;
  hasCommitStrip: boolean;
};

type ShapeContext = { readOnly?: boolean; selfServe: boolean };

export const productCardShape = (
  entitlement: BillingV2Entitlement | undefined,
  { readOnly, selfServe }: ShapeContext
): ProductCardShape => {
  const annualCommitted = productAnnualCommitted(entitlement);
  const monthlyRecurring = entitlement?.cadence === "annual" ? 0 : (entitlement?.amount ?? 0);

  return {
    meters: (entitlement?.dimensions ?? []).map((dim) => ({
      key: dim.key,
      hasBar: dimHasCeiling(dim)
    })),
    figures: [annualCommitted > 0, monthlyRecurring > 0].filter(Boolean).length,
    hasOnDemandNote: (entitlement?.onDemandAmount ?? 0) > 0,
    hasAction: !readOnly && selfServe,
    hasTrialStrip: Boolean(entitlement?.trialPlan),
    hasBreakdownStrip: breakdownableDimensions(entitlement).length > 0,
    hasCommitStrip: Boolean(!readOnly && selfServe && commitSavingsNudge(entitlement))
  };
};

export const UNKNOWN_PRODUCT_SHAPE: ProductCardShape = {
  meters: [
    { key: "first", hasBar: true },
    { key: "second", hasBar: true }
  ],
  figures: 0,
  hasOnDemandNote: false,
  hasAction: false,
  hasTrialStrip: false,
  hasBreakdownStrip: true,
  hasCommitStrip: false
};

const FIGURES = ["figure-a", "figure-b"];

export const ActiveProductCardSkeleton = ({ shape }: { shape: ProductCardShape }) => {
  const priceLines = shape.figures + (shape.hasOnDemandNote ? 1 : 0);
  const figureBox = priceLines > 1 ? "h-6" : "h-7";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-container p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex h-5.5 items-center">
            <Skeleton className="h-3.5 w-44" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {priceLines === 0 ? (
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-14" />
            </div>
          ) : (
            <>
              {FIGURES.slice(0, shape.figures).map((figure) => (
                <div key={figure} className={cn("flex items-center", figureBox)}>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
              {shape.hasOnDemandNote && (
                <div className="flex h-4 items-center">
                  <Skeleton className="h-3 w-28" />
                </div>
              )}
            </>
          )}
        </div>
        {shape.hasAction && <Skeleton className="h-8 w-20 shrink-0 rounded-md" />}
      </div>

      {shape.hasTrialStrip && (
        <div className="-mx-4 flex flex-col gap-1.5 border-y border-border bg-warning/5 px-4 py-2.5">
          <div className="flex h-4 items-center justify-between gap-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-2.5 w-56" />
          </div>
        </div>
      )}

      {shape.meters.length > 0 && (
        <div className="flex flex-col gap-3.5">
          {shape.meters.map((meter) => (
            <div key={meter.key} className="flex flex-col gap-1.5">
              <div className="flex h-4 items-center justify-between gap-2.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
              {meter.hasBar && <Skeleton className="h-[5px] w-full rounded-xs" />}
            </div>
          ))}
        </div>
      )}

      {shape.hasBreakdownStrip && (
        <div
          className={cn(
            "-mx-4 -mb-4 flex items-center justify-between gap-3 border-t border-border px-4 py-2.5",
            shape.hasCommitStrip && "mb-0"
          )}
        >
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-44" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )}

      {shape.hasCommitStrip && (
        <div
          className={cn(
            "-mx-4 -mb-4 flex items-center justify-between gap-3 border-t border-border bg-warning/5 px-4 py-2.5",
            shape.hasBreakdownStrip ? "-mt-3" : "mt-1"
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="size-6 shrink-0 rounded-md" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-28 shrink-0 rounded-md" />
        </div>
      )}
    </div>
  );
};
