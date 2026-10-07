import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, EllipsisIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Skeleton
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
  cadenceLabel,
  commitSavingsNudge,
  dimBarSegments,
  dimCommitted,
  dimHasCeiling,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  fmtMoneyCents,
  pluralizeUnit,
  productAnnualCommitted,
  tierLabel,
  unitForCount
} from "../billing-v2-format";
import { ProductIcon } from "./shared";
import { breakdownableDimensions } from "./UsageBreakdownSheet";

const productTint = "color-mix(in srgb, var(--product-color-resolved) 85%, transparent)";

const priceParts = (ent: BillingV2Entitlement): { amount: string; period: string }[] => {
  const annual = productAnnualCommitted(ent);
  const monthly = ent.cadence === "annual" ? 0 : (ent.amount ?? 0);
  return [
    ...(annual > 0 ? [{ amount: fmtMoney(annual), period: "/ yr" }] : []),
    ...(monthly > 0 ? [{ amount: fmtMoney(monthly), period: "/ mo" }] : [])
  ];
};

const trialLine = (ent: BillingV2Entitlement) => {
  if (ent.trialPaymentDueAt) {
    return `Payment needed · access until ${ent.trialPaymentDueAt}`;
  }
  if (ent.isTrialing) {
    return ent.trialEndsAt ? `Trial ends ${ent.trialEndsAt}` : "Trial";
  }
  return null;
};

const dimRates = (dim: BillingV2EntitlementDim) => {
  const rates: string[] = [];
  if (dimCommitted(dim) && dim.committedRate !== undefined) {
    rates.push(`${fmtMoneyCents(dim.committedRate)} / yr committed`);
  }
  const monthly = dimMonthlyRate(dim);
  if (monthly > 0) {
    rates.push(`${fmtMoneyCents(monthly)} / mo${dimCommitted(dim) ? " on-demand" : ""}`);
  }
  return rates.join(" · ");
};

const MeterTile = ({
  dim,
  isDimmed,
  isSelected,
  onSelect
}: {
  dim: BillingV2EntitlementDim;
  isDimmed?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}) => {
  const allowance = dimCommitted(dim) ? dim.committed : dim.limit;
  const overage = dimOnDemandQuantity(dim);
  const hasBar = dimHasCeiling(dim);
  const monthlyRate = dimMonthlyRate(dim);
  const { committedPct, onDemandPct } = dimBarSegments(dim);

  let subtext: ReactNode = null;
  if (overage > 0) {
    subtext = <span className="text-warning">+{overage.toLocaleString()} on-demand</span>;
  } else if (allowance === null && monthlyRate > 0) {
    subtext = `${fmtMoneyCents(monthlyRate)} each / mo`;
  } else if (allowance === null) {
    subtext = "no limit";
  }

  const content = (
    <>
      <span className="truncate text-xs text-accent">{dim.label}</span>
      <span className="flex min-w-0 items-baseline gap-1 tabular-nums">
        <span className={cn("text-base leading-5 font-medium", overage > 0 && "text-warning")}>
          {dim.used.toLocaleString()}
        </span>
        {allowance !== null && (
          <span className="text-xs text-muted">/ {allowance.toLocaleString()}</span>
        )}
        {subtext && <span className="ml-1.5 truncate text-xs text-muted">{subtext}</span>}
      </span>
      {hasBar && (
        <span className="flex h-1 w-full gap-0.5 overflow-hidden rounded-xs bg-border">
          <span
            className={cn("h-full rounded-xs", onDemandPct > 0 && "rounded-r-none")}
            style={{ width: `${committedPct}%`, background: productTint }}
          />
          {onDemandPct > 0 && (
            <span
              className="h-full rounded-xs rounded-l-none bg-warning/85"
              style={{ width: `${onDemandPct}%` }}
            />
          )}
        </span>
      )}
    </>
  );

  const tileClass = cn(
    "flex h-20 min-w-0 flex-col justify-center gap-1.5 rounded-md bg-container px-3 text-left transition-opacity",
    isDimmed && "opacity-40 hover:opacity-100 focus-visible:opacity-100"
  );

  if (!onSelect) {
    return <div className={tileClass}>{content}</div>;
  }
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={`Show ${dim.label} usage`}
      className={cn(
        tileClass,
        "cursor-pointer outline-0 hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={onSelect}
    >
      {content}
    </button>
  );
};

const tileColumns = (count: number) => {
  if (count >= 3) return "@sm:grid-cols-2 @lg:grid-cols-3";
  if (count === 2) return "@sm:grid-cols-2";
  return "";
};

const UsageDistribution = ({
  orgId,
  scope,
  dim,
  onViewBreakdown
}: {
  orgId: string;
  scope: BillingV2BreakdownScopeKind;
  dim: BillingV2EntitlementDim;
  onViewBreakdown: () => void;
}) => {
  const {
    data: breakdown,
    isPending,
    isError
  } = useGetBillingV2UsageBreakdown(orgId, dim.key, scope);

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{dim.label} by organization</span>
        {breakdown && breakdown.scopedCount > 0 && (
          <span className="text-xs text-muted">
            {breakdown.scopedCount.toLocaleString()}{" "}
            {unitForCount(breakdown.unit, breakdown.scopedCount)} across {breakdown.scopes.length}{" "}
            {breakdown.scopes.length === 1 ? "organization" : "organizations"}
          </span>
        )}
      </div>
      <Button variant="link" size="xs" onClick={onViewBreakdown}>
        Full Breakdown
        <ChevronRightIcon />
      </Button>
    </div>
  );

  let body: ReactNode;
  if (isPending) {
    body = (
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-2 w-full rounded-xs" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (isError || !breakdown) {
    body = <span className="text-xs text-muted">Usage by organization is unavailable.</span>;
  } else if (breakdown.scopedCount === 0) {
    body = (
      <span className="text-xs text-muted">
        No {pluralizeUnit(breakdown.unit)} have been created yet.
      </span>
    );
  } else {
    const total = breakdown.scopedCount;
    const topScopes = [...breakdown.scopes].sort((a, b) => b.count - a.count).slice(0, 5);
    const subOrgShades = ["bg-sub-org/85", "bg-sub-org/60", "bg-sub-org/40", "bg-sub-org/25"];
    let subOrgIndex = 0;
    const shaded = topScopes.map((entry) => {
      const shade = entry.isRoot
        ? "bg-org/85"
        : subOrgShades[Math.min(subOrgIndex, subOrgShades.length - 1)];
      if (!entry.isRoot) subOrgIndex += 1;
      return { entry, shade };
    });
    const projects = breakdown.hasProjectDetail
      ? breakdown.scopes
          .flatMap((entry) => entry.projects.map((project) => ({ ...project, org: entry.name })))
          .sort((a, b) => b.count - a.count)
      : [];

    body = (
      <>
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-xs bg-border">
          {shaded.map(({ entry, shade }) => (
            <span
              key={entry.orgId}
              className={cn("h-full", shade)}
              style={{ width: `${(entry.count / total) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          {shaded.map(({ entry, shade }) => (
            <div key={entry.orgId} className="flex items-center gap-4 text-xs">
              <span className="flex min-w-0 flex-1 items-center gap-2 @2xl:w-56 @2xl:flex-none">
                <span className={cn("size-2 shrink-0 rounded-xs", shade)} />
                <span className="truncate font-medium">{entry.name}</span>
                {!entry.isRoot && <span className="shrink-0 text-muted">sub-org</span>}
              </span>
              <span className="hidden h-1 flex-1 overflow-hidden rounded-xs bg-border @2xl:block">
                <span
                  className={cn("block h-full", shade)}
                  style={{ width: `${(entry.count / total) * 100}%` }}
                />
              </span>
              <span className="flex w-20 shrink-0 justify-end gap-2 tabular-nums">
                <span className="font-medium">{entry.count.toLocaleString()}</span>
                <span className="w-8 text-right text-muted">
                  {Math.round((entry.count / total) * 100)}%
                </span>
              </span>
            </div>
          ))}
        </div>
        {projects.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md bg-card p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-accent">Top projects</span>
              <Button variant="text" size="xs" onClick={onViewBreakdown}>
                All {projects.length} {projects.length === 1 ? "Project" : "Projects"}
              </Button>
            </div>
            {projects.slice(0, 5).map((project) => (
              <div key={project.id} className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{project.name}</span>
                  <span className="shrink-0 text-muted">{project.org}</span>
                </span>
                <span className="font-medium tabular-nums">{project.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-md bg-container p-4">
      {header}
      {body}
    </div>
  );
};

const PlanDetails = ({
  prod,
  ent,
  planName,
  isManaged,
  canChangePlan,
  onManage,
  onSetCommitment
}: {
  prod: BillingV2CatalogProduct;
  ent: BillingV2Entitlement;
  planName: string;
  isManaged: boolean;
  canChangePlan: boolean;
  onManage: () => void;
  onSetCommitment: () => void;
}) => {
  const dims = ent.dimensions ?? [];
  const committedDims = dims.filter(dimCommitted);
  const onDemandDims = dims.filter((dim) => dimOnDemandQuantity(dim) > 0);
  const pricedDims = isManaged ? [] : dims.filter((dim) => dimRates(dim));
  const nudge = canChangePlan ? commitSavingsNudge(ent) : null;
  const cadence = cadenceLabel(ent.cadence ?? null);
  const trial = trialLine(ent);
  const trialPlanName = ent.trialPlan
    ? (ent.trialPlanName ??
      prod.plans.find((plan) => plan.tier === ent.trialPlan)?.name ??
      tierLabel(ent.trialPlan))
    : null;

  const rows: { key: string; label: string; value: ReactNode; action?: ReactNode }[] = [
    {
      key: "plan",
      label: "Plan",
      value: [planName, cadence].filter(Boolean).join(" · "),
      action: canChangePlan && (
        <Button variant="link" size="xs" onClick={onManage}>
          Compare Plans
        </Button>
      )
    }
  ];
  if (trial) {
    rows.push({
      key: "trial",
      label: "Trial",
      value: <span className={ent.trialPaymentDueAt ? "text-warning" : undefined}>{trial}</span>
    });
  }
  if (ent.renewsOn) {
    rows.push({ key: "renews", label: "Renews", value: ent.renewsOn });
  }
  committedDims.forEach((dim, index) => {
    rows.push({
      key: `commitment-${dim.key}`,
      label: index === 0 ? "Commitment" : "",
      value: `${(dim.committed ?? 0).toLocaleString()} ${unitForCount(dim.noun, dim.committed ?? 0)}${
        !isManaged && dim.committedRate
          ? ` · ${fmtMoney((dim.committed ?? 0) * dim.committedRate)} / yr`
          : ""
      }`,
      action: index === 0 && canChangePlan && (
        <Button variant="link" size="xs" onClick={onSetCommitment}>
          Adjust
        </Button>
      )
    });
  });
  if (!isManaged && onDemandDims.length > 0) {
    onDemandDims.forEach((dim, index) => {
      const quantity = dimOnDemandQuantity(dim);
      const rate = dimMonthlyRate(dim);
      rows.push({
        key: `on-demand-${dim.key}`,
        label: index === 0 ? "On-demand" : "",
        value: (
          <span className="text-warning">
            {rate > 0
              ? `${quantity.toLocaleString()} × ${fmtMoneyCents(rate)} = ${fmtMoneyCents(quantity * rate)} / mo`
              : `${quantity.toLocaleString()} ${unitForCount(dim.noun, quantity)}`}
          </span>
        )
      });
    });
  }
  pricedDims.forEach((dim) => {
    rows.push({
      key: `rate-${dim.key}`,
      label: dim.label,
      value: <span className="text-muted">{dimRates(dim)}</span>
    });
  });
  if (prod.includes && prod.includes.length > 0) {
    rows.push({ key: "includes", label: "Includes", value: prod.includes.join(" · ") });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-md bg-container p-4">
      <span className="text-sm font-medium">Plan and billing</span>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 text-xs @xl:grid-cols-[7.5rem_minmax(0,1fr)_auto] @xl:gap-y-2.5">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <span className="col-span-2 truncate text-accent @xl:col-span-1">{row.label}</span>
            <span className="min-w-0">{row.value}</span>
            <span className="justify-self-end">{row.action}</span>
          </div>
        ))}
      </div>
      {trialPlanName && (
        <div className="flex flex-col gap-0.5 rounded-md bg-info/5 px-3 py-2.5 text-xs">
          <span className="font-medium text-info">Trialing {trialPlanName}</span>
          <span className={ent.trialPlanPaymentDueAt ? "text-warning" : "text-muted"}>
            {ent.trialPlanPaymentDueAt
              ? `Access until ${ent.trialPlanPaymentDueAt} · confirm payment to upgrade.`
              : `${ent.trialPlanEndsAt ? `Ends ${ent.trialPlanEndsAt} · ` : ""}Upgrades automatically when the trial ends.`}
          </span>
        </div>
      )}
      {nudge && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning/5 px-3 py-2.5 text-xs">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium text-warning">
              Save ~{nudge.savingsPct}% with annual billing
            </span>
            <span className="text-muted">
              {nudge.qty.toLocaleString()} {nudge.label} for {fmtMoney(nudge.annualCommitted)} / yr
              instead of ~{fmtMoney(nudge.monthlyAnnualized)} / yr billed monthly.
            </span>
          </div>
          <Button variant="outline" size="xs" onClick={onSetCommitment}>
            Annual Options
          </Button>
        </div>
      )}
    </div>
  );
};

const ProductMenu = ({
  prod,
  currentTier,
  canChangePlan,
  hasBreakdown,
  hasNudge,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: {
  prod: BillingV2CatalogProduct;
  currentTier?: string;
  canChangePlan: boolean;
  hasBreakdown: boolean;
  hasNudge: boolean;
  onManage: (productId: string) => void;
  onSetCommitment?: () => void;
  onViewBreakdown?: () => void;
}) => {
  const [showPlans, setShowPlans] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openPlansOnCloseRef = useRef(false);
  const plans = prod.plans
    .filter((plan) => !plan.deprecated || plan.tier === currentTier)
    .sort(byDisplayOrder);
  const showViewPlans = !canChangePlan && plans.length > 0;
  if (!canChangePlan && !hasBreakdown && !showViewPlans) return null;

  return (
    <Popover open={showPlans} onOpenChange={setShowPlans}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              ref={triggerRef}
              aria-label={`${prod.name} actions`}
              size="xs"
              variant="ghost-muted"
            >
              <EllipsisIcon />
            </IconButton>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent
          align="end"
          sideOffset={2}
          onCloseAutoFocus={(event) => {
            if (openPlansOnCloseRef.current) {
              event.preventDefault();
              openPlansOnCloseRef.current = false;
              setShowPlans(true);
            }
          }}
        >
          {canChangePlan && (
            <DropdownMenuItem onClick={() => onManage(prod.id)}>Manage Plan</DropdownMenuItem>
          )}
          {canChangePlan && hasNudge && onSetCommitment && (
            <DropdownMenuItem onClick={onSetCommitment}>Switch to Annual</DropdownMenuItem>
          )}
          {canChangePlan && hasBreakdown && <DropdownMenuSeparator />}
          {hasBreakdown && onViewBreakdown && (
            <DropdownMenuItem onClick={onViewBreakdown}>View Usage Breakdown</DropdownMenuItem>
          )}
          {showViewPlans && (
            <DropdownMenuItem
              onSelect={() => {
                openPlansOnCloseRef.current = true;
              }}
            >
              View Plans
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent
        align="end"
        aria-label={`${prod.name} plans`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (document.activeElement === document.body) triggerRef.current?.focus();
        }}
      >
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{prod.name} plans</span>
          {plans.map((plan) => (
            <div key={plan.tier} className="flex items-center justify-between gap-3">
              <span className="text-sm">{plan.name}</span>
              {plan.tier === currentTier && <Badge variant="neutral">Current</Badge>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

type ProductOverviewCardProps = {
  prod: BillingV2CatalogProduct;
  ent: BillingV2Entitlement;
  readOnly: boolean;
  selfServe: boolean;
  isManaged: boolean;
  breakdownOrgId: string;
  breakdownScope: BillingV2BreakdownScopeKind;
  isExpanded: boolean;
  isDimmed: boolean;
  selectedDimensionKey?: string;
  onExpand: (dimensionKey?: string) => void;
  onCollapse: () => void;
  onManage: (productId: string) => void;
  onSetCommitment: (productId: string) => void;
  onViewBreakdown: (productId: string, dimensionKey?: string) => void;
};

export const ProductOverviewCard = ({
  prod,
  ent,
  readOnly,
  selfServe,
  isManaged,
  breakdownOrgId,
  breakdownScope,
  isExpanded,
  isDimmed,
  selectedDimensionKey,
  onExpand,
  onCollapse,
  onManage,
  onSetCommitment,
  onViewBreakdown
}: ProductOverviewCardProps) => {
  const canChangePlan = !readOnly && selfServe;
  const dims = ent.dimensions ?? [];
  const breakdownDims = breakdownableDimensions(ent);
  const breakdownKeys = new Set(breakdownDims.map((dim) => dim.key));
  const selectedDim =
    breakdownDims.find((dim) => dim.key === selectedDimensionKey) ?? breakdownDims[0];
  const hasNudge = canChangePlan && Boolean(commitSavingsNudge(ent));
  const onDemand = ent.onDemandAmount ?? 0;
  const planName = ent.planTier
    ? (prod.plans.find((plan) => plan.tier === ent.planTier)?.name ?? tierLabel(ent.planTier))
    : "Included";
  const prices = priceParts(ent);
  const trial = trialLine(ent);
  const detailsId = `billing-product-details-${prod.id}`;
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    headerRef.current
      ?.closest("[data-slot=card]")
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }, [isExpanded]);

  return (
    <Card
      className={cn(
        "product-color @container scroll-mt-6 transition-opacity",
        isExpanded && "lg:col-span-2",
        isDimmed && "opacity-50 focus-within:opacity-100 hover:opacity-100"
      )}
      style={{ "--product-color": prod.color } as CSSProperties}
    >
      <div ref={headerRef} className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductIcon product={prod} size={36} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>
              {prod.name}
              {ent.planTier && <Badge variant="neutral">{planName}</Badge>}
              {ent.status === "grace" && <Badge variant="warning">Grace</Badge>}
              {ent.status !== "grace" && ent.isTrialing && <Badge variant="info">Trial</Badge>}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs tabular-nums">
              {!isManaged && (
                <>
                  {prices.length === 0 && <span className="text-muted">Included</span>}
                  {prices.map((price, index) => (
                    <span key={price.period} className="flex items-baseline gap-x-1.5">
                      {index > 0 && <span className="text-muted">+</span>}
                      <span className="font-medium text-foreground">{price.amount}</span>
                      <span className="text-muted">{price.period}</span>
                    </span>
                  ))}
                  {onDemand > 0 && (
                    <span className="text-warning">+{fmtMoneyCents(onDemand)} on-demand</span>
                  )}
                </>
              )}
              {isManaged && <span className="text-muted">Set by your license</span>}
              {trial && (
                <span className={ent.trialPaymentDueAt ? "text-warning" : "text-muted"}>
                  {!isManaged && "· "}
                  {trial}
                </span>
              )}
            </div>
          </div>
        </div>
        <ProductMenu
          prod={prod}
          currentTier={ent.planTier}
          canChangePlan={canChangePlan}
          hasBreakdown={breakdownDims.length > 0}
          hasNudge={hasNudge}
          onManage={onManage}
          onSetCommitment={() => onSetCommitment(prod.id)}
          onViewBreakdown={() => onViewBreakdown(prod.id, selectedDim?.key)}
        />
      </div>

      {dims.length > 0 ? (
        <div className={cn("grid grid-cols-1 gap-2", tileColumns(dims.length))}>
          {dims.map((dim) => (
            <MeterTile
              key={dim.key}
              dim={dim}
              isSelected={isExpanded && selectedDim?.key === dim.key}
              isDimmed={isExpanded && Boolean(selectedDim) && selectedDim?.key !== dim.key}
              onSelect={breakdownKeys.has(dim.key) ? () => onExpand(dim.key) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-md bg-container px-3 text-center text-xs text-muted">
          No usage-based limits on this plan
        </div>
      )}

      {isExpanded && (
        <div
          id={detailsId}
          className={cn(
            "grid grid-cols-1 gap-2",
            selectedDim && "@3xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]"
          )}
        >
          {selectedDim && (
            <UsageDistribution
              orgId={breakdownOrgId}
              scope={breakdownScope}
              dim={selectedDim}
              onViewBreakdown={() => onViewBreakdown(prod.id, selectedDim.key)}
            />
          )}
          <PlanDetails
            prod={prod}
            ent={ent}
            planName={planName}
            isManaged={isManaged}
            canChangePlan={canChangePlan}
            onManage={() => onManage(prod.id)}
            onSetCommitment={() => onSetCommitment(prod.id)}
          />
        </div>
      )}

      <div className="mt-auto flex justify-center">
        <Button
          variant="ghost"
          size="xs"
          aria-expanded={isExpanded}
          aria-controls={isExpanded ? detailsId : undefined}
          onClick={() => (isExpanded ? onCollapse() : onExpand())}
        >
          {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          {isExpanded ? "Hide Details" : "Details"}
        </Button>
      </div>
    </Card>
  );
};

export const InactiveProductCard = ({
  prod,
  isDimmed,
  readOnly,
  isManaged,
  selfServe,
  onManage,
  onContact
}: {
  prod: BillingV2CatalogProduct;
  isDimmed: boolean;
  readOnly: boolean;
  isManaged: boolean;
  selfServe: boolean;
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => {
  const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
  const hasSelfServePlan = prod.plans.some((plan) => plan.selfServe);
  const hasSalesLedPlan = prod.plans.some((plan) => plan.salesLed);
  const canActivate = !readOnly && selfServe && !prod.deprecated && hasSelfServePlan;
  const canContactSales =
    !readOnly &&
    !isManaged &&
    !prod.deprecated &&
    hasSalesLedPlan &&
    (!selfServe || !hasSelfServePlan);

  let note = "This product hasn't been activated for your organization.";
  if (isManaged) {
    note = "Not included in your license. Contact your account manager to enable it.";
  } else if (!selfServe && !canContactSales) {
    note = "Contact your account manager to enable this product.";
  }

  return (
    <Card
      className={cn(
        "product-color @container transition-opacity",
        isDimmed && "opacity-50 focus-within:opacity-100 hover:opacity-100"
      )}
      style={{ "--product-color": prod.color } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ProductIcon product={prod} size={36} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>
              {prod.name}
              {prod.addon && <Badge variant="neutral">Add-on</Badge>}
            </CardTitle>
            <span className="text-xs text-muted">{isManaged ? "Not included" : "Inactive"}</span>
          </div>
        </div>
        {!canActivate && (
          <ProductMenu
            prod={prod}
            canChangePlan={false}
            hasBreakdown={false}
            hasNudge={false}
            onManage={onManage}
          />
        )}
      </div>
      <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 rounded-md bg-container px-3 py-3">
        <span className="min-w-0 text-xs text-muted">
          {canActivate || canContactSales ? (prod.tagline ?? note) : note}
        </span>
        {canActivate && (
          <Button
            variant="product"
            size="xs"
            style={{ "--product-color": prod.color } as CSSProperties}
            onClick={() => onManage(prod.id)}
          >
            {trialPlan && trialPlan.trialDays > 0
              ? `Try Free for ${trialPlan.trialDays} Days`
              : "View Plans"}
          </Button>
        )}
        {canContactSales && (
          <Button variant="outline" size="xs" onClick={() => onContact(prod)}>
            Contact Sales
          </Button>
        )}
      </div>
    </Card>
  );
};
