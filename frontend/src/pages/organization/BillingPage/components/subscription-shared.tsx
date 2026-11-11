import { CSSProperties, ReactNode } from "react";
import { Box } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingBreakdownDimension,
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim,
  useGetBillingUsageBreakdown
} from "@app/hooks/api";

import {
  dimBarSegments,
  dimCommitted,
  dimHasCeiling,
  dimMonthlyRate,
  fmtMoneyCents,
  isIdentityDim,
  tierLabel
} from "../billing-format";

// user_identities is deliberately absent: it is already the user half of the identity split, and it
// carries no scope tree.
export const BREAKDOWN_DIMENSIONS = new Set<string>(
  Object.values(BillingBreakdownDimension).filter(
    (key) => key !== BillingBreakdownDimension.UserIdentities
  )
);

export const NEAR_LIMIT_PCT = 80;

export const productTint = "color-mix(in srgb, var(--product-color-resolved) 85%, transparent)";
export const productStripes = `repeating-linear-gradient(-45deg, ${productTint} 0 2px, color-mix(in srgb, var(--product-color-resolved) 25%, transparent) 2px 4px)`;

export const ProductIconFallback = () => <Box className="size-full" />;

export type Breakdown = { orgId: string; scope: BillingBreakdownScopeKind };

export const visibleDims = (ent: BillingEntitlement) => {
  const dims = ent.dimensions ?? [];
  return dims.filter(
    (dim) => dim.key !== "user_identities" || !dims.some((other) => other.key === "identities")
  );
};

export const dimAllowance = (dim: BillingEntitlementDim) =>
  dimCommitted(dim) ? dim.committed : dim.limit;

export const dimFillPct = (dim: BillingEntitlementDim) => {
  const allowance = dimAllowance(dim);
  if (!dimHasCeiling(dim) || !allowance) return null;
  return (dim.used / allowance) * 100;
};

export const isNearLimit = (dim: BillingEntitlementDim) =>
  !dimCommitted(dim) && (dimFillPct(dim) ?? 0) >= NEAR_LIMIT_PCT;

export const collapsedOrder = (dims: BillingEntitlementDim[]) =>
  [...dims].sort((a, b) => {
    if (isIdentityDim(a) !== isIdentityDim(b)) return isIdentityDim(a) ? -1 : 1;
    return (dimFillPct(b) ?? -1) - (dimFillPct(a) ?? -1);
  });

export const UsageBar = ({
  dim,
  className
}: {
  dim: BillingEntitlementDim;
  className?: string;
}) => {
  const { committedPct, onDemandPct } = dimBarSegments(dim);
  return (
    <span className={cn("flex w-full gap-0.5 overflow-hidden rounded-xs bg-border", className)}>
      {dimHasCeiling(dim) && (
        <span
          className={cn(
            "h-full rounded-xs",
            onDemandPct > 0 && "rounded-r-none",
            isNearLimit(dim) && "bg-warning/85"
          )}
          style={{
            width: `${committedPct}%`,
            background: isNearLimit(dim) ? undefined : productTint
          }}
        />
      )}
      {onDemandPct > 0 && (
        <span
          className="h-full rounded-xs rounded-l-none bg-warning/85"
          style={{ width: `${onDemandPct}%` }}
        />
      )}
    </span>
  );
};

export const IdentityBar = ({
  users,
  machines,
  className
}: {
  users: number;
  machines: number;
  className?: string;
}) => (
  <span className={cn("flex w-full gap-0.5 overflow-hidden rounded-xs bg-border", className)}>
    {users > 0 && (
      <span className="h-full rounded-xs" style={{ flexGrow: users, background: productTint }} />
    )}
    {machines > 0 && (
      <span
        className="h-full rounded-xs"
        style={{ flexGrow: machines, background: productStripes }}
      />
    )}
  </span>
);

export const useIdentitySplit = (dim: BillingEntitlementDim | null, breakdown: Breakdown) => {
  const dimensionKey = dim && BREAKDOWN_DIMENSIONS.has(dim.key) ? dim.key : null;
  const { data } = useGetBillingUsageBreakdown(breakdown.orgId, dimensionKey, breakdown.scope);
  if (!dim || !data || data.total === 0 || data.userCount + data.scopedCount !== dim.used) {
    return null;
  }
  return { users: data.userCount, machines: data.scopedCount };
};

export const committedSeatRate = (dim: BillingEntitlementDim) =>
  dimCommitted(dim) && dim.committedRate ? dim.committedRate : null;

export const seatRateLines = (dim: BillingEntitlementDim): string[] => {
  const committedRate = committedSeatRate(dim);
  const monthlyRate = dimMonthlyRate(dim);
  if (committedRate !== null) {
    return [
      `Committed seats billed at ${fmtMoneyCents(committedRate)} per seat / yr`,
      ...(monthlyRate > 0
        ? [`Seats past the commitment billed at ${fmtMoneyCents(monthlyRate)} per seat / mo`]
        : [])
    ];
  }
  return monthlyRate > 0 ? [`All identities billed at ${fmtMoneyCents(monthlyRate)} per seat`] : [];
};

export const IdentitySplitTooltip = ({
  color,
  dim,
  split,
  children
}: {
  color: string;
  dim: BillingEntitlementDim;
  split: { users: number; machines: number } | null;
  children: ReactNode;
}) => {
  const rateLines = seatRateLines(dim);
  if (!split && rateLines.length === 0) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        className="product-color flex min-w-48 flex-col gap-1.5 whitespace-nowrap"
        style={{ "--product-color": color } as CSSProperties}
      >
        {split && (
          <>
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-3 shrink-0 rounded-xs" style={{ background: productTint }} />
              <span className="flex-1">Users</span>
              <span className="tabular-nums">{split.users.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-1.5 w-3 shrink-0 rounded-xs"
                style={{ background: productStripes }}
              />
              <span className="flex-1">Machines</span>
              <span className="tabular-nums">{split.machines.toLocaleString()}</span>
            </span>
          </>
        )}
        {rateLines.length > 0 && (
          <span
            className={cn(
              "flex flex-col gap-0.5 text-muted",
              split && "border-t border-border pt-1.5"
            )}
          >
            {rateLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export const trialPlanName = (prod: BillingCatalogProduct, ent: BillingEntitlement) =>
  ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;
