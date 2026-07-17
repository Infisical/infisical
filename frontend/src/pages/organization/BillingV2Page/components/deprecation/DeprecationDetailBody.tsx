import { CircleAlert, Clock, TriangleAlert } from "lucide-react";

import { DialogHeader, DialogTitle } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { tierLabel } from "../../billing-v2-format";
import { daysLeftLabel, DeprecatedEntry, DEPRECATION_TONE } from "./deprecation-data";

// Rich "See what changes" dialog body: an icon + title/subtitle header, the sunset date as a pill with
// a day-countdown chip, then the full (untruncated) reason and next-steps sections.
export const DeprecationDetailBody = ({ entry }: { entry: DeprecatedEntry }) => {
  const { deprecation, name, planTier } = entry;
  const isProduct = deprecation.kind === "product";
  const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
  const tone = DEPRECATION_TONE[isProduct || urgent ? "danger" : "warning"];
  const label = daysLeftLabel(deprecation.daysLeft);
  const title = isProduct
    ? `${name} is being discontinued`
    : `The ${planTier ? tierLabel(planTier) : "current"} plan is being retired`;
  const subtitle = isProduct
    ? "This product is winding down"
    : `${planTier ? tierLabel(planTier) : "Current"} plan · ${name}`;

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg border [&>svg]:size-4",
              tone.iconBox
            )}
          >
            {isProduct ? <CircleAlert /> : <TriangleAlert />}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{title}</DialogTitle>
            <span className="truncate text-xs text-muted">{subtitle}</span>
          </div>
        </div>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {deprecation.date && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
              tone.pill
            )}
          >
            <Clock className="size-4 text-muted" />
            <span className="text-sm text-foreground">
              {isProduct ? "Access ends" : "Retires"}{" "}
              <span className="font-medium">{deprecation.date}</span>
            </span>
            {label && (
              <span
                className={cn("ml-auto rounded-md px-1.5 py-0.5 text-xs font-medium", tone.chip)}
              >
                {label}
              </span>
            )}
          </div>
        )}
        {deprecation.reason && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">Why</span>
            <p className="text-sm text-foreground">{deprecation.reason}</p>
          </div>
        )}
        {deprecation.nextSteps && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
              What to do
            </span>
            <p className="text-sm text-foreground">{deprecation.nextSteps}</p>
          </div>
        )}
      </div>
    </>
  );
};
