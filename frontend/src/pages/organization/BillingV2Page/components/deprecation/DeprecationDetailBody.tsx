import { Clock, TriangleAlert } from "lucide-react";

import {
  Alert,
  AlertTitle,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { tierLabel } from "../../billing-v2-format";
import { daysLeftLabel, DeprecatedEntry } from "./deprecation-data";

// "See what changes" dialog body: sunset-date alert with countdown, full reason and next steps.
export const DeprecationDetailBody = ({ entry }: { entry: DeprecatedEntry }) => {
  const { deprecation, name, planTier } = entry;
  const isProduct = deprecation.kind === "product";
  const urgent = deprecation.daysLeft !== null && deprecation.daysLeft <= 14;
  const variant = isProduct || urgent ? "danger" : "warning";
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
          <div className="flex size-7 shrink-0 items-center justify-center">
            <TriangleAlert className="size-6 text-muted" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {deprecation.date && (
          <Alert variant={variant}>
            <Clock />
            <AlertTitle className="flex flex-wrap items-center gap-2">
              <span>
                {isProduct ? "Access ends" : "Retires"}{" "}
                <span className="font-medium">{deprecation.date}</span>
              </span>
              {label && (
                <span
                  className={cn(
                    "ml-auto text-xs",
                    variant === "danger" ? "text-danger" : "text-warning"
                  )}
                >
                  {label}
                </span>
              )}
            </AlertTitle>
          </Alert>
        )}
        {deprecation.reason && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-label">Why</span>
            <p className="text-sm text-foreground">{deprecation.reason}</p>
          </div>
        )}
        {deprecation.nextSteps && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-label">What to do</span>
            <p className="text-sm text-foreground">{deprecation.nextSteps}</p>
          </div>
        )}
      </div>
    </>
  );
};
