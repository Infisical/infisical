import { CSSProperties, ReactNode, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import { Badge, Card, CardHeader, CardTitle, rowLinkContainerClassName } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingBreakdownScopeKind,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim
} from "@app/hooks/api";

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
import {
  Breakdown,
  collapsedOrder,
  committedSeatRate,
  dimAllowance,
  IdentityBar,
  IdentitySplitTooltip,
  ProductIconFallback,
  productTint,
  trialPlanName,
  UsageBar,
  useIdentitySplit,
  visibleDims
} from "./subscription-shared";

const MeterLabel = ({ dim }: { dim: BillingEntitlementDim }) => {
  const allowance = dimAllowance(dim);
  const rawNoun = dimDisplayNoun(dim);
  const noun = rawNoun.includes("_") ? dim.label : pluralizeUnit(rawNoun);
  let unit = noun;
  if (isIdentityDim(dim)) unit = "billed identities";
  else unit = `/ ${allowance === null ? "Unlimited" : allowance.toLocaleString()} ${noun}`;
  return (
    <span className="flex h-[18px] items-baseline gap-1 whitespace-nowrap tabular-nums">
      <span className="text-[13px] leading-4 text-foreground">
        {dim.used.toLocaleString()}
        {isIdentityDim(dim) && "x"}
      </span>
      <span className="truncate text-[11px] leading-[14px] text-muted">{unit}</span>
    </span>
  );
};

const IdentityMeter = ({
  color,
  dim,
  breakdown
}: {
  color: string;
  dim: BillingEntitlementDim;
  breakdown: Breakdown;
}) => {
  const split = useIdentitySplit(dim, breakdown);
  return (
    <IdentitySplitTooltip color={color} dim={dim} split={split}>
      <span className="flex w-full min-w-0 flex-col gap-0.5">
        <MeterLabel dim={dim} />
        <span className="flex h-4 items-center">
          {split ? (
            <IdentityBar users={split.users} machines={split.machines} className="h-[3px]" />
          ) : (
            <span className="h-[3px] w-full rounded-xs" style={{ background: productTint }} />
          )}
        </span>
      </span>
    </IdentitySplitTooltip>
  );
};

const Meter = ({
  color,
  dim,
  breakdown
}: {
  color: string;
  dim: BillingEntitlementDim;
  breakdown: Breakdown;
}) => {
  if (isIdentityDim(dim)) return <IdentityMeter color={color} dim={dim} breakdown={breakdown} />;
  return (
    <span className="flex w-full min-w-0 flex-col gap-0.5">
      <MeterLabel dim={dim} />
      <span className="flex h-4 items-center">
        <UsageBar dim={dim} className="h-[3px]" />
      </span>
    </span>
  );
};

const Stacked = ({
  primary,
  secondary,
  secondaryClassName
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  secondaryClassName?: string;
}) => (
  <span className="flex flex-col gap-0.5 whitespace-nowrap">
    <span className="text-sm leading-[18px] text-foreground tabular-nums">{primary}</span>
    {secondary && (
      <span className={cn("text-xs text-muted tabular-nums", secondaryClassName)}>{secondary}</span>
    )}
  </span>
);

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
        secondaryClassName="text-warning"
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
        secondaryClassName="text-warning"
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
    return (
      <Stacked
        primary={ent.trialPaymentDueAt}
        secondary="Payment needed"
        secondaryClassName="text-warning"
      />
    );
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
  if (ent.status === "grace") return <Badge variant="warning">Grace</Badge>;
  if (ent.trialPaymentDueAt || ent.trialPlanPaymentDueAt) {
    return <Badge variant="warning">Payment Needed</Badge>;
  }
  if (ent.isTrialing || ent.trialPlan) return <Badge variant="info">Trial</Badge>;
  return <Badge variant="success">Active</Badge>;
};

const ROW_GRID =
  "grid grid-cols-[14rem_minmax(13.5rem,1fr)_9rem_9rem_6rem_1rem] items-center gap-x-6 px-5";

const USAGE_SLOTS = 3;

const slotRem = (count: number, hasBadge: boolean) =>
  count * 9 + (count - 1) * 1.5 + (hasBadge ? 4 : 0);

const SHOW_AT: Record<string, string> = {
  "19.5": "hidden @min-[19.5rem]:flex",
  "23.5": "hidden @min-[23.5rem]:flex",
  "30": "hidden @min-[30rem]:flex",
  "34": "hidden @min-[34rem]:flex"
};

const HIDE_AT: Record<string, string> = {
  "19.5": "@min-[19.5rem]:hidden",
  "23.5": "@min-[23.5rem]:hidden",
  "30": "@min-[30rem]:hidden",
  "34": "@min-[34rem]:hidden"
};

const slotThreshold = (count: number, total: number) => String(slotRem(count, total > count));

const meterSlotClass = (index: number, total: number) =>
  index === 0 ? "flex" : SHOW_AT[slotThreshold(index + 1, total)];

const badgeClass = (shown: number, total: number) => {
  const showFrom = shown === 1 ? "flex" : SHOW_AT[slotThreshold(shown, total)];
  const hideFrom = shown < USAGE_SLOTS ? HIDE_AT[slotThreshold(shown + 1, total)] : "";
  return cn(showFrom, hideFrom);
};

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
      </CardHeader>
      <div className="-mx-5 -mb-5 thin-scrollbar overflow-x-auto rounded-b-card">
        <div role="table" aria-label="Subscriptions" className="min-w-[62.5rem]">
          <div
            role="row"
            className={cn(
              ROW_GRID,
              "h-[30px] border-y border-border bg-container-hover text-xs text-accent"
            )}
          >
            <span role="columnheader">Product</span>
            <span role="columnheader">Usage</span>
            <span role="columnheader">Price</span>
            <span role="columnheader">Next Billing Date</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-label="Actions" />
          </div>
          {products.map((prod) => {
            const ent = entitlements[prod.id];
            if (!ent) return null;
            const dims = visibleDims(ent);
            const ordered = collapsedOrder(dims);
            const visible = ordered.slice(0, USAGE_SLOTS);
            const planName = ent.planTier
              ? (prod.plans.find((plan) => plan.tier === ent.planTier)?.name ??
                tierLabel(ent.planTier))
              : "Included";
            const productIcon = (
              <DynamicIcon
                name={prod.icon.replace(/_/g, "-") as IconName}
                color="var(--product-color-resolved)"
                size={15}
                fallback={ProductIconFallback}
              />
            );

            return (
              <div
                key={prod.id}
                className="product-color border-b border-border last:border-b-0"
                style={{ "--product-color": prod.color } as CSSProperties}
              >
                <div
                  role="row"
                  className={cn(
                    ROW_GRID,
                    "min-h-16 py-3 transition-colors duration-75",
                    rowLinkContainerClassName,
                    "hover:bg-container-hover",
                    openId === prod.id && "bg-container-hover"
                  )}
                >
                  <button
                    type="button"
                    aria-label={`View ${prod.name} usage and limits`}
                    className="absolute inset-0 z-[1] cursor-pointer outline-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => setOpenId(prod.id)}
                  />
                  <span role="cell" className="flex min-w-0 items-start gap-2">
                    <span className="flex h-[18px] w-4 shrink-0 items-center justify-center">
                      {productIcon}
                    </span>
                    <Stacked
                      primary={
                        <span className="flex items-center gap-1.5">
                          {prod.name}
                          {prod.addon && <Badge variant="neutral">Add-on</Badge>}
                        </span>
                      }
                      secondary={
                        trialPlanName(prod, ent)
                          ? `${planName} · trialing ${trialPlanName(prod, ent)}`
                          : planName
                      }
                    />
                  </span>
                  <span role="cell" className="@container min-w-0 overflow-hidden">
                    {dims.length === 0 ? (
                      <span className="text-xs text-muted">No usage-based limits</span>
                    ) : (
                      <span className="grid auto-cols-[9rem] grid-flow-col items-center justify-start gap-x-6">
                        {visible.map((dim, index) => (
                          <span key={dim.key} className={meterSlotClass(index, ordered.length)}>
                            <Meter color={prod.color} dim={dim} breakdown={breakdown} />
                          </span>
                        ))}
                        {visible.map((dim, index) =>
                          ordered.length > index + 1 ? (
                            <span
                              key={`more-${dim.key}`}
                              className={cn(
                                "w-fit rounded-full border border-border px-2 py-0.5 text-[11px] leading-[14px] text-accent tabular-nums",
                                badgeClass(index + 1, ordered.length)
                              )}
                            >
                              +{ordered.length - index - 1}
                            </span>
                          ) : null
                        )}
                      </span>
                    )}
                  </span>
                  <span role="cell">{priceCell(ent, dims, isManaged)}</span>
                  <span role="cell">{dateCell(prod, ent, isManaged)}</span>
                  <span role="cell">{statusBadge(ent)}</span>
                  <span role="cell" className="flex justify-end">
                    <ChevronRightIcon className="size-4 text-muted" />
                  </span>
                </div>
                {openId === prod.id && (
                  <ProductDetailsSheet
                    orgId={breakdownOrgId}
                    prod={prod}
                    ent={ent}
                    breakdown={breakdown}
                    canChangePlan={canChangePlan}
                    selfServe={selfServe}
                    isManaged={isManaged}
                    onClose={() => setOpenId(null)}
                    onRemove={onRemove}
                    onContact={onContact}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
