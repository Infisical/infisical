import { CSSProperties, Fragment, ReactNode, useState } from "react";
import { Box, ChevronDownIcon } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  BillingV2BreakdownScopeKind,
  BillingV2CatalogProduct,
  BillingV2Entitlement,
  BillingV2EntitlementDim,
  useGetBillingV2UsageBreakdown
} from "@app/hooks/api";

import {
  byDisplayOrder,
  commitSavingsNudge,
  dimBarSegments,
  dimCommitManageable,
  dimCommitted,
  dimDisplayLabel,
  dimDisplayNoun,
  dimHasCeiling,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  fmtMoneyCents,
  isIdentityDim,
  meteredUsageCaption,
  pluralizeUnit,
  productAnnualCommitted,
  tierLabel
} from "../billing-v2-format";
import { ProductMenu } from "./ProductMenu";
import { breakdownableDimensions } from "./UsageBreakdownSheet";

const COLLAPSED_METERS = 3;
const NEAR_LIMIT_PCT = 80;
const COLUMN_COUNT = 6;

const productTint = "color-mix(in srgb, var(--product-color-resolved) 85%, transparent)";

const ProductIconFallback = () => <Box className="size-full" />;

type Breakdown = { orgId: string; scope: BillingV2BreakdownScopeKind };

const visibleDims = (ent: BillingV2Entitlement) => {
  const dims = ent.dimensions ?? [];
  return dims.filter(
    (dim) => dim.key !== "user_identities" || !dims.some((other) => other.key === "identities")
  );
};

const dimAllowance = (dim: BillingV2EntitlementDim) =>
  dimCommitted(dim) ? dim.committed : dim.limit;

const dimFillPct = (dim: BillingV2EntitlementDim) => {
  const allowance = dimAllowance(dim);
  if (!dimHasCeiling(dim) || !allowance) return null;
  return (dim.used / allowance) * 100;
};

const isNearLimit = (dim: BillingV2EntitlementDim) =>
  !dimCommitted(dim) && (dimFillPct(dim) ?? 0) >= NEAR_LIMIT_PCT;

const collapsedOrder = (dims: BillingV2EntitlementDim[]) =>
  [...dims].sort((a, b) => {
    if (isIdentityDim(a) !== isIdentityDim(b)) return isIdentityDim(a) ? -1 : 1;
    return (dimFillPct(b) ?? -1) - (dimFillPct(a) ?? -1);
  });

const UsageBar = ({ dim, className }: { dim: BillingV2EntitlementDim; className?: string }) => {
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

const IdentityBar = ({
  users,
  machines,
  className
}: {
  users: number;
  machines: number;
  className?: string;
}) => (
  <span className={cn("flex w-full gap-0.5 overflow-hidden rounded-xs bg-border", className)}>
    {users > 0 && <span className="h-full rounded-xs bg-accent" style={{ flexGrow: users }} />}
    {machines > 0 && (
      <span className="h-full rounded-xs bg-foreground/25" style={{ flexGrow: machines }} />
    )}
  </span>
);

const useIdentitySplit = (dimensionKey: string | null, breakdown: Breakdown) => {
  const { data } = useGetBillingV2UsageBreakdown(breakdown.orgId, dimensionKey, breakdown.scope);
  if (!data || data.total === 0) return null;
  return { users: data.userCount, machines: data.scopedCount };
};

const IdentitySplitTooltip = ({
  dim,
  split,
  children
}: {
  dim: BillingV2EntitlementDim;
  split: { users: number; machines: number } | null;
  children: ReactNode;
}) => {
  const rate = dimMonthlyRate(dim);
  if (!split && rate <= 0) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="flex min-w-48 flex-col gap-1.5 whitespace-nowrap">
        {split && (
          <>
            <span className="flex items-center gap-2">
              <span className="h-[3px] w-2 shrink-0 rounded-xs bg-accent" />
              <span className="flex-1">Users</span>
              <span className="tabular-nums">{split.users.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-[3px] w-2 shrink-0 rounded-xs bg-foreground/25" />
              <span className="flex-1">Machines</span>
              <span className="tabular-nums">{split.machines.toLocaleString()}</span>
            </span>
          </>
        )}
        {rate > 0 && (
          <span className={cn("text-muted", split && "border-t border-border pt-1.5")}>
            All identities billed at {fmtMoneyCents(rate)} per seat
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

const MeterLabel = ({ dim }: { dim: BillingV2EntitlementDim }) => {
  const allowance = dimAllowance(dim);
  const noun = pluralizeUnit(dimDisplayNoun(dim));
  let unit = noun;
  if (isIdentityDim(dim)) unit = "billed identities";
  else if (allowance !== null) unit = `/ ${allowance.toLocaleString()} ${noun}`;
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
  dim,
  breakdown
}: {
  dim: BillingV2EntitlementDim;
  breakdown: Breakdown;
}) => {
  const split = useIdentitySplit(dim.key, breakdown);
  return (
    <IdentitySplitTooltip dim={dim} split={split}>
      <span className="flex w-32 shrink-0 flex-col gap-0.5">
        <MeterLabel dim={dim} />
        <span className="flex h-4 items-center">
          {split ? (
            <IdentityBar users={split.users} machines={split.machines} className="h-[3px]" />
          ) : (
            <span className="h-[3px] w-full rounded-xs bg-accent/40" />
          )}
        </span>
      </span>
    </IdentitySplitTooltip>
  );
};

const Meter = ({ dim, breakdown }: { dim: BillingV2EntitlementDim; breakdown: Breakdown }) => {
  if (isIdentityDim(dim)) return <IdentityMeter dim={dim} breakdown={breakdown} />;
  return (
    <span className="flex w-40 shrink-0 flex-col gap-0.5">
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

const priceCell = (
  ent: BillingV2Entitlement,
  dims: BillingV2EntitlementDim[],
  isManaged: boolean
) => {
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
  const identityRate = identity ? dimMonthlyRate(identity) : 0;
  if (parts.length > 0) {
    return (
      <Stacked
        primary={parts.join(" + ")}
        secondary={identityRate > 0 ? `${fmtMoneyCents(identityRate)} per identity` : undefined}
      />
    );
  }
  if (ent.isTrialing) return <Stacked primary="Free" secondary="During trial" />;
  if (ent.planTier === "enterprise") {
    return <Stacked primary="Contract" secondary="Enterprise agreement" />;
  }
  if (isUsageBased) return <Stacked primary="Usage-based" secondary="Nothing billed yet" />;
  return <Stacked primary="Included" />;
};

const cadenceCycle = (ent: BillingV2Entitlement) =>
  ent.cadence === "annual" ? "Annual cycle" : "Monthly cycle";

const dateCell = (ent: BillingV2Entitlement, isManaged: boolean) => {
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

const statusBadge = (ent: BillingV2Entitlement) => {
  if (ent.status === "grace") return <Badge variant="warning">Grace</Badge>;
  if (ent.trialPaymentDueAt) return <Badge variant="warning">Payment Needed</Badge>;
  if (ent.isTrialing) return <Badge variant="info">Trial</Badge>;
  return <Badge variant="success">Active</Badge>;
};

const LimitAction = ({
  title,
  titleClassName,
  action
}: {
  title: string;
  titleClassName?: string;
  action?: { label: string; onClick: () => void };
}) => (
  <span className="flex flex-col items-end gap-0.5 text-xs">
    <span className={cn("text-muted", titleClassName)}>{title}</span>
    {action && (
      <Button
        variant="link"
        size="xs"
        className={cn("h-auto p-0 text-xs underline", titleClassName)}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    )}
  </span>
);

const LimitRow = ({
  dim,
  prod,
  ent,
  canChangePlan,
  breakdown,
  onManage,
  onSetCommitment
}: {
  dim: BillingV2EntitlementDim;
  prod: BillingV2CatalogProduct;
  ent: BillingV2Entitlement;
  canChangePlan: boolean;
  breakdown: Breakdown;
  onManage: () => void;
  onSetCommitment: () => void;
}) => {
  const isIdentity = isIdentityDim(dim);
  const split = useIdentitySplit(isIdentity ? dim.key : null, breakdown);
  const allowance = dimAllowance(dim);
  const overage = dimOnDemandQuantity(dim);
  const rate = dimMonthlyRate(dim);
  const nudge = canChangePlan ? commitSavingsNudge(ent) : null;
  const plans = [...prod.plans].sort(byDisplayOrder);
  const currentIndex = plans.findIndex((plan) => plan.tier === ent.planTier);
  const nextPlan = plans.slice(currentIndex + 1).find((plan) => plan.upgradeable);

  let subtext: ReactNode = meteredUsageCaption(dim);
  if (isIdentity) {
    const noLimit = allowance === null ? ", no limit" : "";
    subtext = split
      ? `${split.users.toLocaleString()} ${split.users === 1 ? "user" : "users"} · ${split.machines.toLocaleString()} ${split.machines === 1 ? "machine" : "machines"}${noLimit}`
      : `Billed per identity${noLimit}`;
  } else if (dimCommitted(dim)) {
    subtext = `Committed annually${dim.renewalDate ? ` · renews ${dim.renewalDate}` : ""}`;
  } else if (!subtext && allowance !== null) {
    subtext = `${Math.max(0, allowance - dim.used).toLocaleString()} left on ${tierLabel(ent.planTier ?? "")}`;
  }

  let action: ReactNode = null;
  if (overage > 0) {
    action = (
      <LimitAction
        title={`+${overage.toLocaleString()} over commitment`}
        titleClassName="text-warning"
        action={
          canChangePlan ? { label: "Adjust Commitment", onClick: onSetCommitment } : undefined
        }
      />
    );
  } else if (isIdentity && nudge && nudge.label === dim.label) {
    action = (
      <LimitAction
        title={`Save ${fmtMoney(nudge.monthlyAnnualized - nudge.annualCommitted)}/year`}
        action={{ label: "Switch to Annual", onClick: onSetCommitment }}
      />
    );
  } else if (isIdentity && rate > 0) {
    action = <LimitAction title={`${fmtMoneyCents(rate)} each / mo`} />;
  } else if (isNearLimit(dim)) {
    action = (
      <LimitAction
        title={allowance !== null && dim.used > allowance ? "Over limit" : "Approaching limit"}
        titleClassName="text-warning"
        action={
          canChangePlan && nextPlan
            ? { label: `Upgrade to ${nextPlan.name}`, onClick: onManage }
            : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_5rem_minmax(0,12rem)] items-center gap-6 border-b border-border py-3 last:border-b-0">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm leading-[18px]">{dimDisplayLabel(dim)}</span>
        {subtext && <span className="truncate text-xs text-muted">{subtext}</span>}
      </span>
      {isIdentity ? (
        <IdentitySplitTooltip dim={dim} split={split}>
          <span className="flex h-4 items-center">
            {split ? (
              <IdentityBar users={split.users} machines={split.machines} className="h-1" />
            ) : (
              <span className="h-1 w-full rounded-xs bg-accent/40" />
            )}
          </span>
        </IdentitySplitTooltip>
      ) : (
        <UsageBar dim={dim} className="h-1" />
      )}
      <span className="flex items-baseline justify-end gap-1 text-sm whitespace-nowrap tabular-nums">
        <span className={cn(overage > 0 && "text-warning")}>
          {dim.used.toLocaleString()}
          {isIdentity && "x"}
        </span>
        {allowance !== null && (
          <span className="text-xs text-muted">/ {allowance.toLocaleString()}</span>
        )}
      </span>
      <span className="flex justify-end">{action}</span>
    </div>
  );
};

type SubscriptionsTableProps = {
  products: BillingV2CatalogProduct[];
  entitlements: Record<string, BillingV2Entitlement>;
  readOnly: boolean;
  selfServe: boolean;
  isManaged: boolean;
  breakdownOrgId: string;
  breakdownScope: BillingV2BreakdownScopeKind;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
};

export const SubscriptionsTable = ({
  products,
  entitlements,
  readOnly,
  selfServe,
  isManaged,
  breakdownOrgId,
  breakdownScope,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: SubscriptionsTableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const canChangePlan = !readOnly && selfServe;
  const breakdown = { orgId: breakdownOrgId, scope: breakdownScope };

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-base">Subscriptions</CardTitle>
      </CardHeader>
      <Table containerClassName="rounded-none border-x-0 border-b-0 bg-transparent">
        <TableHeader>
          <TableRow>
            <TableHead className="w-72 pl-5">Product</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead className="w-40">Price</TableHead>
            <TableHead className="w-44">Next Billing Date</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead variant="action" className="w-12 pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((prod) => {
            const ent = entitlements[prod.id];
            if (!ent) return null;
            const dims = visibleDims(ent);
            const ordered = collapsedOrder(dims);
            const hidden = ordered.length - COLLAPSED_METERS;
            const isExpanded = expandedId === prod.id;
            const canExpand = dims.length > 0;
            const planName = ent.planTier
              ? (prod.plans.find((plan) => plan.tier === ent.planTier)?.name ??
                tierLabel(ent.planTier))
              : "Included";
            const breakdownDims = breakdownableDimensions(ent);
            let commitmentLabel: string | null = null;
            if (commitSavingsNudge(ent)) commitmentLabel = "Switch to Annual";
            else if (dims.some(dimCommitted) && dims.some(dimCommitManageable)) {
              commitmentLabel = "Adjust Commitment";
            }
            const toggle = () => setExpandedId(isExpanded ? null : prod.id);
            const panelId = `billing-subscription-${prod.id}`;

            return (
              <Fragment key={prod.id}>
                <TableRow
                  className={cn("product-color hover:bg-transparent", isExpanded && "border-b-0")}
                  style={{ "--product-color": prod.color } as CSSProperties}
                  onClick={canExpand ? toggle : undefined}
                >
                  <TableCell className="py-3 pl-5">
                    <span className="flex items-start gap-2">
                      {canExpand ? (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={isExpanded ? panelId : undefined}
                          aria-label={`${isExpanded ? "Hide" : "Show"} ${prod.name} usage and limits`}
                          className="flex h-[18px] w-4 shrink-0 cursor-pointer items-center justify-center rounded-xs outline-0 focus-visible:ring-2 focus-visible:ring-ring"
                          style={{
                            color: isExpanded ? undefined : "var(--product-color-resolved)"
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle();
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDownIcon className="size-4" />
                          ) : (
                            <DynamicIcon
                              name={prod.icon.replace(/_/g, "-") as IconName}
                              size={15}
                              fallback={ProductIconFallback}
                            />
                          )}
                        </button>
                      ) : (
                        <span
                          className="flex h-[18px] w-4 shrink-0 items-center justify-center"
                          style={{ color: "var(--product-color-resolved)" }}
                        >
                          <DynamicIcon
                            name={prod.icon.replace(/_/g, "-") as IconName}
                            size={15}
                            fallback={ProductIconFallback}
                          />
                        </span>
                      )}
                      <Stacked
                        primary={
                          <span className="flex items-center gap-1.5">
                            {prod.name}
                            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
                          </span>
                        }
                        secondary={planName}
                      />
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    <span className="flex items-center gap-7">
                      {ordered.slice(0, COLLAPSED_METERS).map((dim) => (
                        <Meter key={dim.key} dim={dim} breakdown={breakdown} />
                      ))}
                      {hidden > 0 && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] leading-[14px] text-accent tabular-nums">
                          +{hidden}
                        </span>
                      )}
                      {dims.length === 0 && (
                        <span className="text-xs text-muted">No usage-based limits</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">{priceCell(ent, dims, isManaged)}</TableCell>
                  <TableCell className="py-3">{dateCell(ent, isManaged)}</TableCell>
                  <TableCell className="py-3">{statusBadge(ent)}</TableCell>
                  <TableCell
                    variant="action"
                    className="py-3 pr-5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ProductMenu
                      prod={prod}
                      currentTier={ent.planTier}
                      canChangePlan={canChangePlan}
                      hasBreakdown={breakdownDims.length > 0}
                      commitmentLabel={commitmentLabel}
                      onManage={onManage}
                      onSetCommitment={() => onSetCommitment(prod.id)}
                      onViewBreakdown={() => onViewBreakdown(prod.id, breakdownDims[0]?.key)}
                    />
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow
                    id={panelId}
                    className="product-color hover:bg-transparent"
                    style={{ "--product-color": prod.color } as CSSProperties}
                  >
                    <TableCell colSpan={COLUMN_COUNT} className="pt-0 pr-5 pb-3 pl-11">
                      <div className="flex flex-col">
                        {dims.map((dim) => (
                          <LimitRow
                            key={dim.key}
                            dim={dim}
                            prod={prod}
                            ent={ent}
                            canChangePlan={canChangePlan}
                            breakdown={breakdown}
                            onManage={() => onManage(prod.id)}
                            onSetCommitment={() => onSetCommitment(prod.id)}
                          />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
};
