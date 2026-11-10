import { CSSProperties, ReactNode, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import {
  CalendarX2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Sparkles
} from "lucide-react";

import {
  annualSavingsPercent,
  getPlanFeatures,
  getPlanPrice,
  planSupportsCadence
} from "@app/components/license/UpgradeGate/plan-catalog";
import {
  formatPlanFeatureTitle,
  PlanFeature,
  PlanFeatureIcon
} from "@app/components/license/UpgradeGate/ProductUpgradeDialog";
import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  IconButton,
  Item,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useSubscription } from "@app/context";
import {
  BillingCadence,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim,
  BillingCatalogPlan,
  billingSubmitMutationKey,
  useCancelBillingTrial,
  useGetBillingUsageBreakdown,
  useStartBillingTrial
} from "@app/hooks/api";

import {
  byDisplayOrder,
  commitSavingsNudge,
  dimCommitManageable,
  dimCommitted,
  dimDisplayLabel,
  dimMonthlyRate,
  dimOnDemandQuantity,
  fmtMoney,
  fmtMoneyCents,
  isIdentityDim,
  productAnnualCommitted,
  tierLabel
} from "../billing-format";
import { CancellationFeedbackDialog } from "./CancellationFeedbackDialog";
import { CommitmentView } from "./CommitmentView";
import { ProductIcon } from "./shared";
import {
  Breakdown,
  BREAKDOWN_DIMENSIONS,
  committedSeatRate,
  dimAllowance,
  IdentityBar,
  isNearLimit,
  productStripes,
  productTint,
  UsageBar,
  useIdentitySplit,
  visibleDims
} from "./subscription-shared";
import { UpgradeView } from "./UpgradeView";

type View = "details" | "plans" | "commitment" | "upgrade";

const share = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";

const entitlementsLabel = (prod: BillingCatalogProduct) =>
  `${prod.name.replace(/ Management$/, "")} entitlements`;

const planNameFor = (prod: BillingCatalogProduct, tier?: string) =>
  tier ? (prod.plans.find((plan) => plan.tier === tier)?.name ?? tierLabel(tier)) : "Included";

const priceSummary = (ent: BillingEntitlement, isManaged: boolean) => {
  if (isManaged || ent.planTier === "enterprise") return "billed under your agreement";
  const annual = productAnnualCommitted(ent);
  if (annual > 0) return `${fmtMoney(annual)} / yr`;
  if ((ent.amount ?? 0) > 0) return `${fmtMoney(ent.amount ?? 0)} / mo`;
  return null;
};

const Count = ({ value, isIdentity }: { value: number; isIdentity: boolean }) => (
  <span className="tabular-nums">
    {value.toLocaleString()}
    {isIdentity && "x"}
  </span>
);

const ScopeRow = ({
  name,
  tag,
  count,
  total,
  barClassName,
  isIdentity,
  projects,
  orgLevelCount
}: {
  name: string;
  tag?: string;
  count: number;
  total: number;
  barClassName: string;
  isIdentity: boolean;
  projects?: { id: string; name: string; count: number }[];
  orgLevelCount?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const canExpand = Boolean(projects && (projects.length > 0 || (orgLevelCount ?? 0) > 0));
  return (
    <div className={cn("flex flex-col", isOpen && "bg-container-hover")}>
      <div className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
        <span className="flex w-4 shrink-0 justify-center">
          {canExpand && (
            <IconButton
              size="2xs"
              variant="ghost-muted"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Hide" : "Show"} projects in ${name}`}
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            </IconButton>
          )}
        </span>
        <span className={cn("size-2 shrink-0 rounded-xs", barClassName)} />
        <span className="flex w-44 min-w-0 items-baseline gap-1.5">
          <span className="truncate">{name}</span>
          {tag && <span className="shrink-0 text-xs text-muted">{tag}</span>}
        </span>
        <span className="flex h-[3px] flex-1 overflow-hidden rounded-xs bg-border">
          <span
            className={cn("h-full rounded-xs", barClassName)}
            style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
          />
        </span>
        <span className="flex w-16 shrink-0 items-baseline justify-end gap-2">
          <Count value={count} isIdentity={isIdentity} />
          <span className="text-xs text-muted tabular-nums">{share(count, total)}</span>
        </span>
      </div>
      {isOpen && (
        <div className="flex flex-col gap-1 pb-2 pl-[3.25rem] text-xs">
          {projects?.map((project) => (
            <span key={project.id} className="flex items-baseline justify-between gap-3 pr-2.5">
              <span className="truncate text-accent">{project.name}</span>
              <Count value={project.count} isIdentity={isIdentity} />
            </span>
          ))}
          {(orgLevelCount ?? 0) > 0 && (
            <span className="flex items-baseline justify-between gap-3 pr-2.5 text-muted">
              <span>Organization level · not in a project</span>
              <Count value={orgLevelCount ?? 0} isIdentity={isIdentity} />
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const BreakdownPanel = ({
  dim,
  breakdown,
  isEnterprise
}: {
  dim: BillingEntitlementDim;
  breakdown: Breakdown;
  isEnterprise: boolean;
}) => {
  const { data, isPending, isError } = useGetBillingUsageBreakdown(
    breakdown.orgId,
    dim.key,
    breakdown.scope
  );
  const isIdentity = isIdentityDim(dim);
  const subject = isIdentity ? "Machine identities" : dimDisplayLabel(dim);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return <span className="text-xs text-muted">Usage by location is unavailable.</span>;
  }

  const total = data.scopedCount;
  if (isIdentity && total === 0) return null;
  if (total === 0) {
    return <span className="text-xs text-muted">No {subject} yet.</span>;
  }

  const rootScopes = data.scopes.filter((scope) => scope.isRoot);
  const subOrgScopes = data.scopes.filter((scope) => !scope.isRoot);

  if (isEnterprise || subOrgScopes.some((scope) => scope.count > 0)) {
    const rootCount = rootScopes.reduce((sum, scope) => sum + scope.count, 0);
    const subOrgCount = subOrgScopes.reduce((sum, scope) => sum + scope.count, 0);
    const orgCount = data.scopes.length;
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm">{subject} by organization</span>
          <span className="text-xs text-muted">
            {total.toLocaleString()} across {orgCount}{" "}
            {orgCount === 1 ? "organization" : "organizations"}
          </span>
        </div>
        {total > 0 && subOrgCount > 0 && (
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-xs">
            <span className="h-full rounded-xs bg-org/85" style={{ flexGrow: rootCount }} />
            <span className="h-full rounded-xs bg-sub-org/85" style={{ flexGrow: subOrgCount }} />
          </div>
        )}
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-container">
          {[...rootScopes, ...[...subOrgScopes].sort((a, b) => b.count - a.count)].map((scope) => (
            <ScopeRow
              key={scope.orgId}
              name={scope.name}
              tag={scope.isRoot ? undefined : "sub-org"}
              count={scope.count}
              total={total}
              barClassName={scope.isRoot ? "bg-org/85" : "bg-sub-org/85"}
              isIdentity={isIdentity}
              projects={data.hasProjectDetail ? scope.projects : undefined}
              orgLevelCount={data.hasProjectDetail ? scope.orgLevelCount : undefined}
            />
          ))}
          {subOrgScopes.length === 0 && (
            <span className="px-2.5 py-2 pl-9 text-xs text-muted">No active sub-orgs</span>
          )}
        </div>
      </div>
    );
  }

  const projects = rootScopes.flatMap((scope) => scope.projects).sort((a, b) => b.count - a.count);
  const notInProject = rootScopes.reduce((sum, scope) => sum + scope.orgLevelCount, 0);
  const rows = [
    ...projects.map((project) => ({ key: project.id, name: project.name, count: project.count })),
    ...(notInProject > 0
      ? [{ key: "org-level", name: "Not in a project", count: notInProject }]
      : [])
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{subject} by project</span>
        {total > 0 && (
          <span className="text-xs text-muted">
            {total.toLocaleString()} across {projects.length}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <span className="text-xs text-muted">No {subject.toLowerCase()} yet.</span>
      ) : (
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-container">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
              <span
                className={cn("w-52 min-w-0 truncate", row.key === "org-level" && "text-muted")}
              >
                {row.name}
              </span>
              <span className="flex h-[3px] flex-1 overflow-hidden rounded-xs bg-border">
                <span
                  className="h-full rounded-xs"
                  style={{
                    width: total > 0 ? `${(row.count / total) * 100}%` : "0%",
                    background: productTint
                  }}
                />
              </span>
              <span className="flex w-16 shrink-0 items-baseline justify-end gap-2">
                <Count value={row.count} isIdentity={isIdentity} />
                <span className="text-xs text-muted tabular-nums">{share(row.count, total)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const IdentitySection = ({
  dim,
  ent,
  breakdown,
  canChangePlan,
  isEnterprise,
  onSetCommitment
}: {
  dim: BillingEntitlementDim;
  ent: BillingEntitlement;
  breakdown: Breakdown;
  canChangePlan: boolean;
  isEnterprise: boolean;
  onSetCommitment: () => void;
}) => {
  const split = useIdentitySplit(dim, breakdown);
  const allowance = dimAllowance(dim);
  const overage = dimOnDemandQuantity(dim);
  const nudge = canChangePlan ? commitSavingsNudge(ent) : null;
  const committedRate = committedSeatRate(dim);
  const monthlyRate = dimMonthlyRate(dim);

  let action: ReactNode = null;
  if (overage > 0) {
    action = (
      <span className="flex items-baseline gap-2 text-xs">
        <span className="text-warning">+{overage.toLocaleString()} over commitment</span>
        {canChangePlan && (
          <Button variant="link" size="xs" onClick={onSetCommitment}>
            Adjust Commitment
          </Button>
        )}
      </span>
    );
  } else if (nudge && nudge.label === dim.label) {
    action = (
      <span className="flex items-baseline gap-2 text-xs">
        <span className="text-muted">
          Save {fmtMoney(nudge.monthlyAnnualized - nudge.annualCommitted)}/year
        </span>
        <Button variant="link" size="xs" onClick={onSetCommitment}>
          Switch to Annual
        </Button>
      </span>
    );
  } else if (committedRate !== null) {
    action = (
      <span className="flex items-baseline gap-2 text-xs">
        <span className="text-muted">{fmtMoneyCents(committedRate)} per identity / yr</span>
        {canChangePlan && dimCommitManageable(dim) && (
          <Button variant="link" size="xs" onClick={onSetCommitment}>
            Adjust Commitment
          </Button>
        )}
      </span>
    );
  } else if (monthlyRate > 0) {
    action = (
      <span className="text-xs text-muted">{fmtMoneyCents(monthlyRate)} per identity / mo</span>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Billed identities">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Billed identities</span>
          <span className="flex items-baseline gap-1 tabular-nums">
            <span className={cn("text-sm", overage > 0 && "text-warning")}>
              {dim.used.toLocaleString()}x
            </span>
            <span className="text-xs text-muted">
              / {allowance === null ? "Unlimited" : allowance.toLocaleString()}
            </span>
          </span>
        </div>
        {split ? (
          <IdentityBar users={split.users} machines={split.machines} className="h-1" />
        ) : (
          <span className="h-1 w-full rounded-xs" style={{ background: productTint }} />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {split && (
            <>
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <span className="h-1.5 w-3 rounded-xs" style={{ background: productTint }} />
                {split.users.toLocaleString()} {split.users === 1 ? "user" : "users"}
              </span>
              {split.machines > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-accent">
                  <span className="h-1.5 w-3 rounded-xs" style={{ background: productStripes }} />
                  {split.machines.toLocaleString()} {split.machines === 1 ? "machine" : "machines"}
                </span>
              )}
            </>
          )}
          <span className="ml-auto">{action}</span>
        </div>
      </div>
      {BREAKDOWN_DIMENSIONS.has(dim.key) && (
        <BreakdownPanel dim={dim} breakdown={breakdown} isEnterprise={isEnterprise} />
      )}
    </section>
  );
};

const EntitlementTileContent = ({ dim }: { dim: BillingEntitlementDim }) => {
  const allowance = dimAllowance(dim);
  return (
    <>
      <span className="truncate text-xs leading-4 text-accent" title={dimDisplayLabel(dim)}>
        {dimDisplayLabel(dim)}
      </span>
      <span className="flex items-baseline gap-1 text-sm text-foreground tabular-nums">
        {dim.used.toLocaleString()}
        <span className="text-xs text-muted">
          / {allowance === null ? "Unlimited" : allowance.toLocaleString()}
        </span>
      </span>
      {allowance !== null && <UsageBar dim={dim} className="h-[3px]" />}
      {isNearLimit(dim) && <span className="text-xs text-warning">Approaching limit</span>}
    </>
  );
};

const EntitlementsSection = ({
  prod,
  dims,
  breakdown,
  isEnterprise
}: {
  prod: BillingCatalogProduct;
  dims: BillingEntitlementDim[];
  breakdown: Breakdown;
  isEnterprise: boolean;
}) => {
  const canBreakDown = (dim: BillingEntitlementDim) =>
    BREAKDOWN_DIMENSIONS.has(dim.key) && isEnterprise;
  const selectable = dims.filter(canBreakDown);
  const [selectedKey, setSelectedKey] = useState(selectable[0]?.key);
  const selected = selectable.find((dim) => dim.key === selectedKey);

  return (
    <section className="flex flex-col gap-4" aria-label={entitlementsLabel(prod)}>
      {selectable.length > 1 ? (
        <Tabs value={selected?.key} onValueChange={setSelectedKey}>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-accent">{entitlementsLabel(prod)}</span>
              <span className="text-xs text-muted">Select one to see where it&apos;s used</span>
            </div>
            <TabsList
              aria-label={entitlementsLabel(prod)}
              className="grid w-full grid-cols-1 gap-1 data-[orientation=horizontal]:h-auto sm:grid-cols-3"
            >
              {dims.map((dim) => (
                <TabsTrigger
                  key={dim.key}
                  value={dim.key}
                  disabled={!canBreakDown(dim)}
                  className="min-w-0 flex-col items-stretch justify-start gap-1.5 px-2.5 py-2 text-left"
                >
                  <EntitlementTileContent dim={dim} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {selectable.map((dim) => (
            <TabsContent key={dim.key} value={dim.key}>
              <BreakdownPanel dim={dim} breakdown={breakdown} isEnterprise={isEnterprise} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-accent">{entitlementsLabel(prod)}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {dims.map((dim) => (
                <Item key={dim.key} size="xs">
                  <span className="flex w-full min-w-0 flex-col gap-1.5">
                    <EntitlementTileContent dim={dim} />
                  </span>
                </Item>
              ))}
            </div>
          </div>
          {selected && (
            <BreakdownPanel dim={selected} breakdown={breakdown} isEnterprise={isEnterprise} />
          )}
        </>
      )}
    </section>
  );
};

const DetailsView = ({
  prod,
  ent,
  breakdown,
  canChangePlan,
  isManaged,
  onClose,
  onManage,
  onSetCommitment
}: {
  prod: BillingCatalogProduct;
  ent: BillingEntitlement;
  breakdown: Breakdown;
  canChangePlan: boolean;
  isManaged: boolean;
  onClose: () => void;
  onManage: () => void;
  onSetCommitment: () => void;
}) => {
  const { subscription } = useSubscription();
  const dims = visibleDims(ent);
  const identity = dims.find(isIdentityDim);
  const others = dims.filter((dim) => !isIdentityDim(dim));
  const isEnterprise = ent.planTier === "enterprise" && Boolean(subscription.subOrganization);
  const price = priceSummary(ent, isManaged);
  const subtitle = [
    planNameFor(prod, ent.planTier),
    price,
    ent.renewsOn && !isManaged ? `renews ${ent.renewsOn}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-3 pr-8">
          <ProductIcon product={prod} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle>{prod.name}</SheetTitle>
            <SheetDescription>{subtitle}</SheetDescription>
          </div>
        </div>
      </SheetHeader>
      <div className="flex thin-scrollbar flex-1 flex-col divide-y divide-border overflow-y-auto px-4 [&>section]:py-4">
        {dims.length === 0 && (
          <span className="py-4 text-sm text-muted">This plan has no usage-based limits.</span>
        )}
        {identity && (
          <IdentitySection
            dim={identity}
            ent={ent}
            breakdown={breakdown}
            canChangePlan={canChangePlan}
            isEnterprise={isEnterprise}
            onSetCommitment={onSetCommitment}
          />
        )}
        {others.length > 0 && (
          <EntitlementsSection
            prod={prod}
            dims={others}
            breakdown={breakdown}
            isEnterprise={isEnterprise}
          />
        )}
      </div>
      <SheetFooter>
        <div className="flex w-full justify-end gap-2">
          {canChangePlan ? (
            <Button variant="org" size="sm" onClick={onManage}>
              Manage Plan
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </SheetFooter>
    </>
  );
};

const featureKey = (feature: PlanFeature) => `${feature.label}|${feature.value ?? ""}`;

const PlansView = ({
  prod,
  ent,
  canChangePlan,
  onBack,
  onUpgrade,
  onStartTrial,
  onEndTrial,
  onCancel,
  onContact
}: {
  prod: BillingCatalogProduct;
  ent: BillingEntitlement;
  canChangePlan: boolean;
  onBack: () => void;
  onUpgrade: (plan: BillingCatalogPlan, cadence: BillingCadence) => void;
  onStartTrial: (plan: BillingCatalogPlan) => void;
  onEndTrial: () => void;
  onCancel: () => void;
  onContact: () => void;
}) => {
  const plans = prod.plans
    .filter((plan) => !plan.deprecated || plan.tier === ent.planTier)
    .sort(byDisplayOrder);
  const [selectedTier, setSelectedTier] = useState(ent.planTier ?? plans[0]?.tier);
  const [cadence, setCadence] = useState<BillingCadence>("annual");
  const selectedIndex = plans.findIndex((plan) => plan.tier === selectedTier);
  const plan = plans[selectedIndex];
  const currentIndex = plans.findIndex((candidate) => candidate.tier === ent.planTier);
  const isCurrent = plan?.tier === ent.planTier;
  const previous = selectedIndex > 0 ? plans[selectedIndex - 1] : undefined;
  const allFeatures = plan ? getPlanFeatures(prod, plan) : [];
  const isStepUp = !isCurrent && previous && selectedIndex > currentIndex;
  const previousKeys = new Set(previous ? getPlanFeatures(prod, previous).map(featureKey) : []);
  const features = isStepUp
    ? allFeatures.filter((feature) => !previousKeys.has(featureKey(feature)))
    : allFeatures;
  let lede = "Includes:";
  if (isCurrent) lede = "Your plan includes:";
  else if (isStepUp && previous) lede = `Everything in ${previous.name}, plus:`;

  const supportsAnnual = plan ? planSupportsCadence(plan, "annual") : false;
  const supportsMonthly = plan ? planSupportsCadence(plan, "monthly") : false;
  let visibleCadence: BillingCadence = cadence;
  if (cadence === "annual" && !supportsAnnual) visibleCadence = "monthly";
  if (cadence === "monthly" && !supportsMonthly) visibleCadence = "annual";
  const price = plan ? getPlanPrice(plan, visibleCadence) : null;
  const savings = plan ? annualSavingsPercent(plan) : 0;
  const currentAnnual = productAnnualCommitted(ent);
  const currentMonthly = ent.cadence === "annual" ? 0 : (ent.amount ?? 0);

  let footer: ReactNode = null;
  if (plan && isCurrent) {
    footer = (
      <>
        <span className="flex flex-col gap-0.5">
          {currentAnnual > 0 || currentMonthly > 0 ? (
            <span className="flex items-baseline gap-1 tabular-nums">
              <span className="text-sm">
                {fmtMoney(currentAnnual > 0 ? currentAnnual : currentMonthly)}
              </span>
              <span className="text-xs text-muted">
                {currentAnnual > 0 ? "/ yr · billed yearly" : "/ mo · billed monthly"}
              </span>
            </span>
          ) : (
            <span className="text-sm">{plan.salesLed ? "Custom pricing" : "No charge"}</span>
          )}
          {ent.renewsOn && <span className="text-xs text-muted">Renews {ent.renewsOn}</span>}
        </span>
        {canChangePlan && (ent.isTrialing || ent.trialPlan) && (
          <Button variant="danger" size="sm" onClick={onEndTrial}>
            {ent.trialPlan ? "End Trial" : "Cancel Trial"}
          </Button>
        )}
        {canChangePlan && !plan.salesLed && !ent.isTrialing && !ent.trialPlan && (
          <Button variant="danger" size="sm" onClick={onCancel}>
            Cancel Subscription
          </Button>
        )}
      </>
    );
  } else if (plan?.salesLed) {
    footer = (
      <>
        <span className="text-sm">Custom pricing</span>
        <Button variant="outline" size="sm" onClick={onContact}>
          Contact Sales
        </Button>
      </>
    );
  } else if (plan && price && price.amount > 0) {
    footer = (
      <>
        <span className="flex flex-col gap-1.5">
          <span className="flex items-baseline gap-1 tabular-nums">
            <span className="text-sm">{fmtMoneyCents(price.amount)}</span>
            <span className="text-xs text-muted">
              {price.unit.replace(/^\/ /, "per ")}, billed{" "}
              {visibleCadence === "annual" ? "annually" : "monthly"}
            </span>
          </span>
          {supportsAnnual && supportsMonthly && (
            <span className="flex items-center gap-2">
              <Toggle
                id={`manage-plan-annual-${prod.id}`}
                size="sm"
                variant="org"
                checked={visibleCadence === "annual"}
                onCheckedChange={(checked) => setCadence(checked ? "annual" : "monthly")}
              />
              <Label htmlFor={`manage-plan-annual-${prod.id}`}>Annual</Label>
              {savings > 0 && <Badge variant="success">-{savings}%</Badge>}
            </span>
          )}
        </span>
        {canChangePlan && plan.upgradeable && selectedIndex > currentIndex ? (
          <span className="flex flex-wrap items-center justify-end gap-2">
            {plan.selfServe && plan.trialable && plan.trialDays > 0 && !ent.trialPlan && (
              <Button variant="outline" size="sm" onClick={() => onStartTrial(plan)}>
                Try Free for {plan.trialDays} Days
              </Button>
            )}
            <Button variant="org" size="sm" onClick={() => onUpgrade(plan, visibleCadence)}>
              Upgrade to {plan.name}
            </Button>
          </span>
        ) : (
          <span className="text-xs text-muted">Contact support to move to this plan</span>
        )}
      </>
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          <Button variant="text" aria-label="Back to product details" onClick={onBack}>
            <ChevronLeftIcon />
            Manage Plan
          </Button>
        </SheetTitle>
        <SheetDescription>{prod.name}</SheetDescription>
      </SheetHeader>
      <div className="flex thin-scrollbar flex-1 flex-col gap-5 overflow-y-auto p-4">
        <Tabs value={selectedTier} onValueChange={setSelectedTier}>
          <TabsList className="w-full" aria-label={`${prod.name} plans`}>
            {plans.map((candidate) => (
              <TabsTrigger key={candidate.tier} value={candidate.tier}>
                {candidate.name}
                {candidate.tier === ent.planTier && <span className="text-muted">· Current</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {features.length === 0 && plan?.feature && (
          <span className="text-sm text-accent">{plan.feature}</span>
        )}
        {features.length > 0 && (
          <section aria-label={`${plan?.name} features`} className="flex flex-col gap-4">
            <span className="text-xs text-accent">{lede}</span>
            <ul className="flex flex-col gap-4">
              {features.map((feature) => (
                <li key={featureKey(feature)} className="flex min-w-0 items-start gap-3">
                  <PlanFeatureIcon value={feature.value} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatPlanFeatureTitle(feature)}</p>
                    {feature.description && (
                      <p className="mt-0.5 text-xs text-muted">{feature.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <SheetFooter className="m-2 mt-auto rounded-md border border-border bg-card">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">{footer}</div>
      </SheetFooter>
    </>
  );
};

type ProductDetailsSheetProps = {
  orgId: string;
  prod: BillingCatalogProduct;
  ent: BillingEntitlement;
  breakdown: Breakdown;
  canChangePlan: boolean;
  selfServe: boolean;
  isManaged: boolean;
  onClose: () => void;
  onRemove: (productId: string) => void;
  onContact: (prod: BillingCatalogProduct) => void;
};

const TrialConfirmDialog = ({
  plan,
  basePlanName,
  isPending,
  onConfirm,
  onCancel
}: {
  plan: BillingCatalogPlan;
  basePlanName: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <AlertDialog open isPending={isPending} onOpenChange={(open) => !open && onCancel()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogMedia>
          <Sparkles />
        </AlertDialogMedia>
        <AlertDialogTitle>Start your {plan.name} trial</AlertDialogTitle>
        <AlertDialogDescription>
          Your {plan.trialDays > 0 ? `${plan.trialDays}-day ` : ""}trial is free and nothing changes
          about your bill. You&apos;ll keep paying for {basePlanName} until it ends, then move to{" "}
          {plan.name} and be charged the difference. End the trial before then to stay on{" "}
          {basePlanName}.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="org"
          isDisabled={isPending}
          isPending={isPending}
          onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          Start free trial
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const ProductDetailsSheet = ({
  orgId,
  prod,
  ent,
  breakdown,
  canChangePlan,
  selfServe,
  isManaged,
  onClose,
  onRemove,
  onContact
}: ProductDetailsSheetProps) => {
  const [view, setView] = useState<View>("details");
  const [upgradePlan, setUpgradePlan] = useState<BillingCatalogPlan | null>(null);
  const [commitAfterUpgrade, setCommitAfterUpgrade] = useState(false);
  const [trialPlan, setTrialPlan] = useState<BillingCatalogPlan | null>(null);
  const [showEndTrial, setShowEndTrial] = useState(false);
  const startTrial = useStartBillingTrial();
  const cancelTrial = useCancelBillingTrial();
  const isMutating = useIsMutating({ mutationKey: billingSubmitMutationKey }) > 0;
  const hasCommitment = (ent.dimensions ?? []).some(
    (dim) => dimCommitted(dim) || dim.commitAvailable
  );
  const basePlanName = planNameFor(prod, ent.planTier);
  const upgradeTrialName = ent.trialPlan ? planNameFor(prod, ent.trialPlan) : null;

  const confirmTrial = async () => {
    if (!trialPlan) return;
    try {
      const result = await startTrial.mutateAsync({
        orgId,
        productId: prod.id,
        plan: trialPlan.tier,
        returnPath: window.location.pathname
      });
      if (result.outcome === "awaiting_card") {
        if (result.cardSetupUrl) {
          window.location.href = result.cardSetupUrl;
        } else {
          createNotification({
            type: "error",
            text: "Failed to complete trial setup. Missing payment details. Please try again!"
          });
        }
        return;
      }
      createNotification({ type: "success", text: `Your ${trialPlan.name} trial has started.` });
      onClose();
    } catch {
      setTrialPlan(null);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && !isMutating && onClose()}>
        <SheetContent
          side="right"
          size="form"
          isPending={isMutating}
          className="product-color"
          style={{ "--product-color": prod.color } as CSSProperties}
        >
          {view === "details" && (
            <DetailsView
              prod={prod}
              ent={ent}
              breakdown={breakdown}
              canChangePlan={canChangePlan}
              isManaged={isManaged}
              onClose={onClose}
              onManage={() => setView("plans")}
              onSetCommitment={() => setView("commitment")}
            />
          )}
          {view === "plans" && (
            <PlansView
              prod={prod}
              ent={ent}
              canChangePlan={canChangePlan}
              onBack={() => setView("details")}
              onUpgrade={(plan, cadence) => {
                setUpgradePlan(plan);
                setCommitAfterUpgrade(
                  cadence === "annual" && ent.cadence !== "annual" && hasCommitment
                );
                setView("upgrade");
              }}
              onStartTrial={setTrialPlan}
              onEndTrial={() => setShowEndTrial(true)}
              onCancel={() => onRemove(prod.id)}
              onContact={() => onContact(prod)}
            />
          )}
          {view === "upgrade" && upgradePlan && (
            <UpgradeView
              orgId={orgId}
              prod={prod}
              plan={upgradePlan}
              fromPlanName={planNameFor(prod, ent.planTier)}
              renewsOn={ent.renewsOn ?? null}
              selfServe={selfServe}
              isTrialConversion={ent.trialPlan === upgradePlan.tier}
              onBack={() => setView("plans")}
              onDone={() => {
                if (!commitAfterUpgrade) {
                  onClose();
                  return;
                }
                setView("commitment");
              }}
            />
          )}
          {view === "commitment" && (
            <CommitmentView
              orgId={orgId}
              prod={prod}
              entitlement={ent}
              renewsOn={ent.renewsOn ?? null}
              selfServe={selfServe}
              onBack={() => setView("details")}
              onDone={onClose}
            />
          )}
        </SheetContent>
      </Sheet>
      {trialPlan && (
        <TrialConfirmDialog
          plan={trialPlan}
          basePlanName={basePlanName}
          isPending={startTrial.isPending}
          onConfirm={confirmTrial}
          onCancel={() => setTrialPlan(null)}
        />
      )}
      {showEndTrial && (
        <CancellationFeedbackDialog
          orgId={orgId}
          productId={prod.id}
          action="cancel_trial"
          icon={<CalendarX2Icon />}
          title={
            upgradeTrialName
              ? `End your ${upgradeTrialName} trial`
              : `Cancel your ${prod.name} trial`
          }
          description={
            upgradeTrialName
              ? `You'll go back to ${basePlanName} right away and won't be charged anything. This trial can't be restarted later.`
              : "Canceling returns you to the free tier immediately and stops the trial from converting to a paid plan. This trial can't be restarted later."
          }
          reasonLabel={
            upgradeTrialName ? "Why are you ending your trial?" : "Why are you canceling?"
          }
          confirmLabel={upgradeTrialName ? "End trial" : "Cancel trial"}
          dismissLabel="Keep trial"
          onConfirm={() => cancelTrial.mutateAsync({ orgId, productId: prod.id })}
          onConfirmed={() => {
            createNotification({
              type: "success",
              text: upgradeTrialName
                ? `Your ${upgradeTrialName} trial has ended. You're still on ${basePlanName}.`
                : `Your ${prod.name} trial has been canceled.`
            });
            onClose();
          }}
          onDismiss={() => setShowEndTrial(false)}
        />
      )}
    </>
  );
};
