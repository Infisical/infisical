import type { ReactNode } from "react";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import type {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim
} from "@app/hooks/api/billing/types";
import { BillingBreakdownDimension } from "@app/hooks/api/billing/types";

import { useV4Adapter } from "../../../data/adapters";
import {
  dimBarSegments,
  dimCommitted,
  dimHasCeiling,
  dimMonthlyRate,
  fmtMoneyCents,
  isIdentityDim,
  tierLabel
} from "../billing-format";

import styles from "./billing.module.css";

// user_identities is already the user half of the identity split, and it carries no scope tree.
export const BREAKDOWN_DIMENSIONS = new Set<string>(
  Object.values(BillingBreakdownDimension).filter(
    (key) => key !== BillingBreakdownDimension.UserIdentities
  )
);

export const NEAR_LIMIT_PCT = 80;

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

export const UsageBar = ({ dim, size }: { dim: BillingEntitlementDim; size?: "lg" }) => {
  const { committedPct, onDemandPct } = dimBarSegments(dim);
  return (
    <span className={styles.meter} data-size={size}>
      {dimHasCeiling(dim) && (
        <span
          className={styles.segment}
          data-tone={isNearLimit(dim) ? "warn" : undefined}
          style={{ width: `${committedPct}%` }}
        />
      )}
      {onDemandPct > 0 && (
        <span className={styles.segment} data-tone="warn" style={{ width: `${onDemandPct}%` }} />
      )}
    </span>
  );
};

export const IdentityBar = ({
  users,
  machines,
  size
}: {
  users: number;
  machines: number;
  size?: "lg";
}) => (
  <span className={styles.meter} data-size={size}>
    {users > 0 && <span className={styles.segment} style={{ flexGrow: users }} />}
    {machines > 0 && (
      <span className={styles.segment} data-tone="muted" style={{ flexGrow: machines }} />
    )}
  </span>
);

export const useIdentitySplit = (dim: BillingEntitlementDim | null, breakdown: Breakdown) => {
  const dimensionKey = dim && BREAKDOWN_DIMENSIONS.has(dim.key) ? dim.key : null;
  const { data } = useV4Adapter("billing").useUsageBreakdown(
    breakdown.orgId,
    dimensionKey,
    breakdown.scope
  );
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

export const Swatch = ({ tone }: { tone?: "muted" }) => (
  <span className={styles.swatch} data-tone={tone} aria-hidden />
);

export const IdentitySplitTooltip = ({
  dim,
  split,
  children
}: {
  dim: BillingEntitlementDim;
  split: { users: number; machines: number } | null;
  children: ReactNode;
}) => {
  const rateLines = seatRateLines(dim);
  if (!split && rateLines.length === 0) return children;
  return (
    <Tooltip
      content={
        <span className={styles.rows}>
          {split && (
            <>
              <span className={styles.spread}>
                <span>Users</span>
                <span className={styles.numeric}>{split.users.toLocaleString()}</span>
              </span>
              <span className={styles.spread}>
                <span>Machines</span>
                <span className={styles.numeric}>{split.machines.toLocaleString()}</span>
              </span>
            </>
          )}
          {rateLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
};

export const trialPlanName = (prod: BillingCatalogProduct, ent: BillingEntitlement) =>
  ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;

export const Stacked = ({
  primary,
  secondary,
  tone
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  tone?: "warn";
}) => (
  <span className={styles.stacked}>
    <span className={styles.numeric}>{primary}</span>
    {secondary && (
      <span className={`${styles.secondary} ${styles.numeric}`} data-tone={tone}>
        {secondary}
      </span>
    )}
  </span>
);
