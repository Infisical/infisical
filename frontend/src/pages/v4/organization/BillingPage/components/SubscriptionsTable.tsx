import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { Inline } from "@infisical/cipher/ui/layout";

import type {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim
} from "@app/hooks/api/billing/types";

import {
  dimDisplayNoun,
  dimMonthlyRate,
  fmtMoney,
  fmtMoneyCents,
  isIdentityDim,
  pluralizeUnit,
  productAnnualCommitted,
  tierLabel
} from "../billing-format";
import { ProductDetailsSheet } from "./ProductDetailsSheet";
import { ProductIcon } from "./shared";
import {
  type Breakdown,
  collapsedOrder,
  committedSeatRate,
  dimAllowance,
  IdentityBar,
  IdentitySplitTooltip,
  Stacked,
  trialPlanName,
  UsageBar,
  useIdentitySplit,
  visibleDims
} from "./subscription-shared";

import styles from "./billing.module.css";

const USAGE_SLOTS = 3;

const MeterLabel = ({ dim }: { dim: BillingEntitlementDim }) => {
  const allowance = dimAllowance(dim);
  const rawNoun = dimDisplayNoun(dim);
  const noun = rawNoun.includes("_") ? dim.label : pluralizeUnit(rawNoun);
  const unit = isIdentityDim(dim)
    ? "billed identities"
    : `/ ${allowance === null ? "Unlimited" : allowance.toLocaleString()} ${noun}`;
  return (
    <span className={styles.meterLabel}>
      <span>
        {dim.used.toLocaleString()}
        {isIdentityDim(dim) && "x"}
      </span>
      <span className={styles.secondary}>{unit}</span>
    </span>
  );
};

const IdentityMeter = ({
  dim,
  breakdown
}: {
  dim: BillingEntitlementDim;
  breakdown: Breakdown;
}) => {
  const split = useIdentitySplit(dim, breakdown);
  return (
    <IdentitySplitTooltip dim={dim} split={split}>
      <span className={styles.meterCell}>
        <MeterLabel dim={dim} />
        <IdentityBar users={split?.users ?? dim.used} machines={split?.machines ?? 0} />
      </span>
    </IdentitySplitTooltip>
  );
};

const Meter = ({ dim, breakdown }: { dim: BillingEntitlementDim; breakdown: Breakdown }) => {
  if (isIdentityDim(dim)) return <IdentityMeter dim={dim} breakdown={breakdown} />;
  return (
    <span className={styles.meterCell}>
      <MeterLabel dim={dim} />
      <UsageBar dim={dim} />
    </span>
  );
};

const priceCell = (ent: BillingEntitlement, dims: BillingEntitlementDim[], isManaged: boolean) => {
  if (isManaged) return <Stacked primary="Licensed" secondary="Set by your license" />;
  const annual = productAnnualCommitted(ent);
  const monthly = ent.cadence === "annual" ? 0 : (ent.amount ?? 0);
  const isUsageBased = dims.some((dim) => dim.metered);
  const parts = [
    ...(annual > 0 ? [`${fmtMoney(annual)} / yr`] : []),
    ...(monthly > 0 ? [`${isUsageBased ? "Est. " : ""}${fmtMoney(monthly)} / mo`] : [])
  ];
  const onDemand = ent.onDemandAmount ?? 0;
  if (onDemand > 0) {
    return (
      <Stacked
        primary={parts.join(" + ")}
        secondary={`+${fmtMoneyCents(onDemand)} on-demand`}
        tone="warn"
      />
    );
  }
  const identity = dims.find(isIdentityDim);
  if (parts.length > 0) {
    const committedRate = identity ? committedSeatRate(identity) : null;
    const monthlyRate = identity ? dimMonthlyRate(identity) : 0;
    let secondary: string | undefined;
    if (committedRate !== null) secondary = `${fmtMoneyCents(committedRate)} per identity / yr`;
    else if (monthlyRate > 0) secondary = `${fmtMoneyCents(monthlyRate)} per identity`;
    return <Stacked primary={parts.join(" + ")} secondary={secondary} />;
  }
  const meteredEstimate = dims.reduce(
    (sum, dim) =>
      dim.metered && dim.usage && !dim.usage.trial ? sum + (dim.usage.estimatedAmount ?? 0) : sum,
    0
  );
  if (meteredEstimate > 0) {
    return (
      <Stacked primary={`Est. ${fmtMoneyCents(meteredEstimate)}`} secondary="This billing period" />
    );
  }
  if (ent.isTrialing) return <Stacked primary="Free" secondary="During trial" />;
  if (ent.planTier === "enterprise") {
    return <Stacked primary="Contract" secondary="Enterprise agreement" />;
  }
  if (isUsageBased) return <Stacked primary="Usage-based" secondary="Nothing billed yet" />;
  return <Stacked primary="Included" />;
};

const cadenceCycle = (ent: BillingEntitlement) =>
  ent.cadence === "annual" ? "Annual cycle" : "Monthly cycle";

const dateCell = (prod: BillingCatalogProduct, ent: BillingEntitlement, isManaged: boolean) => {
  const upgradeTrial = trialPlanName(prod, ent);
  if (upgradeTrial && ent.trialPlanPaymentDueAt) {
    return (
      <Stacked
        primary={ent.trialPlanPaymentDueAt}
        secondary={`Confirm payment to upgrade to ${upgradeTrial}`}
        tone="warn"
      />
    );
  }
  if (upgradeTrial && ent.renewsOn) {
    return (
      <Stacked
        primary={ent.renewsOn}
        secondary={
          ent.trialPlanEndsAt
            ? `${upgradeTrial} trial ends ${ent.trialPlanEndsAt}`
            : `${upgradeTrial} trial running`
        }
      />
    );
  }
  if (upgradeTrial && ent.trialPlanEndsAt) {
    return <Stacked primary={ent.trialPlanEndsAt} secondary={`${upgradeTrial} starts billing`} />;
  }
  if (ent.trialPaymentDueAt) {
    return <Stacked primary={ent.trialPaymentDueAt} secondary="Payment needed" tone="warn" />;
  }
  if (ent.isTrialing && ent.trialEndsAt) {
    return <Stacked primary={ent.trialEndsAt} secondary="Trial ends" />;
  }
  if (ent.renewsOn) return <Stacked primary={ent.renewsOn} secondary={cadenceCycle(ent)} />;
  if (isManaged) return <Stacked primary="Per license" />;
  if (ent.planTier === "enterprise") {
    return <Stacked primary="Per agreement" secondary="Billed outside Stripe" />;
  }
  return <Stacked primary="None scheduled" />;
};

const statusBadge = (ent: BillingEntitlement) => {
  if (ent.status === "grace") return <Badge tone="warn">Grace</Badge>;
  if (ent.trialPaymentDueAt || ent.trialPlanPaymentDueAt) {
    return <Badge tone="warn">Payment needed</Badge>;
  }
  if (ent.isTrialing || ent.trialPlan) return <Badge tone="info">Trial</Badge>;
  return <Badge tone="ok">Active</Badge>;
};

type Row = { prod: BillingCatalogProduct; ent: BillingEntitlement };

type SubscriptionsTableProps = {
  products: BillingCatalogProduct[];
  entitlements: Record<string, BillingEntitlement>;
  readOnly: boolean;
  selfServe: boolean;
  isManaged: boolean;
  breakdownOrgId: string;
  breakdownScope: BillingBreakdownScopeKind;
  onRemove: (productId: string) => void;
  onContact: (prod: BillingCatalogProduct) => void;
};

export const SubscriptionsTable = ({
  products,
  entitlements,
  readOnly,
  selfServe,
  isManaged,
  breakdownOrgId,
  breakdownScope,
  onRemove,
  onContact
}: SubscriptionsTableProps) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const canChangePlan = !readOnly && selfServe;
  const breakdown = { orgId: breakdownOrgId, scope: breakdownScope };
  const rows: Row[] = products.flatMap((prod) =>
    entitlements[prod.id] ? [{ prod, ent: entitlements[prod.id] }] : []
  );
  const open = rows.find((row) => row.prod.id === openId);

  const columns: DataTableColumn<Row>[] = [
    {
      id: "product",
      header: "Product",
      primary: true,
      width: 240,
      text: (row) => row.prod.name,
      render: ({ prod, ent }) => {
        const planName = ent.planTier
          ? (prod.plans.find((plan) => plan.tier === ent.planTier)?.name ?? tierLabel(ent.planTier))
          : "Included";
        const trial = trialPlanName(prod, ent);
        return (
          <Inline gap={8} align="start" wrap={false}>
            <ProductIcon product={prod} />
            <Stacked
              primary={
                <Inline gap={8} wrap={false}>
                  <Button variant="link" underline="hover" onClick={() => setOpenId(prod.id)}>
                    {prod.name}
                  </Button>
                  {prod.addon && <Badge size="sm">Add-on</Badge>}
                </Inline>
              }
              secondary={trial ? `${planName}, trialing ${trial}` : planName}
            />
          </Inline>
        );
      }
    },
    {
      id: "usage",
      header: "Usage",
      grow: true,
      minWidth: 200,
      render: ({ ent }) => {
        const dims = visibleDims(ent);
        if (dims.length === 0) {
          return <span className={styles.secondary}>No usage-based limits</span>;
        }
        const ordered = collapsedOrder(dims);
        const shown = ordered.slice(0, USAGE_SLOTS);
        return (
          <span className={styles.meters}>
            {shown.map((dim) => (
              <Meter key={dim.key} dim={dim} breakdown={breakdown} />
            ))}
            {ordered.length > USAGE_SLOTS && (
              <Badge size="sm" tone="outline">
                +{ordered.length - USAGE_SLOTS}
              </Badge>
            )}
          </span>
        );
      }
    },
    {
      id: "price",
      header: "Price",
      width: 160,
      render: ({ ent }) => priceCell(ent, visibleDims(ent), isManaged)
    },
    {
      id: "next",
      header: "Next billing date",
      width: 200,
      render: ({ prod, ent }) => dateCell(prod, ent, isManaged)
    },
    { id: "status", header: "Status", width: 120, render: ({ ent }) => statusBadge(ent) }
  ];

  return (
    <>
      <DataTable
        label="Subscriptions"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.prod.id}
        rowLabel={(row) => row.prod.name}
        onRowActivate={(row) => setOpenId(row.prod.id)}
        rowHeight={56}
      />
      {open && (
        <ProductDetailsSheet
          orgId={breakdownOrgId}
          prod={open.prod}
          ent={open.ent}
          breakdown={breakdown}
          canChangePlan={canChangePlan}
          selfServe={selfServe}
          isManaged={isManaged}
          onClose={() => setOpenId(null)}
          onRemove={onRemove}
          onContact={onContact}
        />
      )}
    </>
  );
};
