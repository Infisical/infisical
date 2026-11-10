import { type ReactNode, useState } from "react";

import {
  annualSavingsPercent,
  getPlanFeatures,
  getPlanPrice,
  planSupportsCadence
} from "@app/components/license/UpgradeGate/plan-catalog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs } from "@app/components/v4/ui/tabs";
import type {
  BillingCadence,
  BillingCatalogPlan,
  BillingCatalogProduct,
  BillingEntitlement,
  BillingEntitlementDim
} from "@app/hooks/api/billing/types";

import { toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { formatPlanFeatureTitle, type PlanFeature, PlanFeatureIcon } from "../../../license";
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
import { useBillingSubscription } from "./shared";
import { ProductSheetHeader, SheetSections } from "./sheet-shared";
import {
  type Breakdown,
  BREAKDOWN_DIMENSIONS,
  committedSeatRate,
  dimAllowance,
  IdentityBar,
  isNearLimit,
  Swatch,
  UsageBar,
  useIdentitySplit,
  visibleDims
} from "./subscription-shared";
import { UpgradeView } from "./UpgradeView";

import styles from "./billing.module.css";

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
  <span className={styles.numeric}>
    {value.toLocaleString()}
    {isIdentity && "x"}
  </span>
);

const ShareBar = ({ count, total, tone }: { count: number; total: number; tone?: "muted" }) => (
  <span className={styles.meter}>
    <span
      className={styles.segment}
      data-tone={tone}
      style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
    />
  </span>
);

const CountShare = ({
  count,
  total,
  isIdentity
}: {
  count: number;
  total: number;
  isIdentity: boolean;
}) => (
  <span className={styles.countShare}>
    <Count value={count} isIdentity={isIdentity} />
    <span className={styles.secondary}>{share(count, total)}</span>
  </span>
);

const ScopeRow = ({
  name,
  tag,
  count,
  total,
  isSubOrg,
  isIdentity,
  projects,
  orgLevelCount
}: {
  name: string;
  tag?: string;
  count: number;
  total: number;
  isSubOrg: boolean;
  isIdentity: boolean;
  projects?: { id: string; name: string; count: number }[];
  orgLevelCount?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const canExpand = Boolean(projects && (projects.length > 0 || (orgLevelCount ?? 0) > 0));
  return (
    <div>
      <div className={styles.scopeRow}>
        <span>
          {canExpand && (
            <Button
              variant="ghost"
              size="icon-xs"
              iconOnly
              icon={isOpen ? "chev-down" : "chev-right"}
              aria-expanded={isOpen}
              onClick={() => setIsOpen(!isOpen)}
            >
              {`${isOpen ? "Hide" : "Show"} projects in ${name}`}
            </Button>
          )}
        </span>
        <span className={styles.scopeName}>
          <span className={styles.truncate}>{name}</span>
          {tag && <span className={styles.secondary}>{tag}</span>}
        </span>
        <ShareBar count={count} total={total} tone={isSubOrg ? "muted" : undefined} />
        <CountShare count={count} total={total} isIdentity={isIdentity} />
      </div>
      {isOpen && (
        <div className={styles.scopeChildren}>
          {projects?.map((project) => (
            <span key={project.id} className={styles.spread}>
              <span className={styles.truncate}>{project.name}</span>
              <Count value={project.count} isIdentity={isIdentity} />
            </span>
          ))}
          {(orgLevelCount ?? 0) > 0 && (
            <span className={`${styles.spread} ${styles.secondary}`}>
              <span>Organization level, not in a project</span>
              <Count value={orgLevelCount ?? 0} isIdentity={isIdentity} />
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const PanelHeading = ({ title, meta }: { title: string; meta?: ReactNode }) => (
  <span className={styles.spread}>
    <span className={styles.strong}>{title}</span>
    {meta && <span className={styles.secondary}>{meta}</span>}
  </span>
);

const BreakdownPanel = ({
  dim,
  breakdown,
  isEnterprise
}: {
  dim: BillingEntitlementDim;
  breakdown: Breakdown;
  isEnterprise: boolean;
}) => {
  const { data, isPending, isError } = useV4Adapter("billing").useUsageBreakdown(
    breakdown.orgId,
    dim.key,
    breakdown.scope
  );
  const isIdentity = isIdentityDim(dim);
  const subject = isIdentity ? "Machine identities" : dimDisplayLabel(dim);

  if (isPending) {
    return (
      <Stack gap={8}>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </Stack>
    );
  }
  if (isError || !data) {
    return <span className={styles.secondary}>Usage by location is unavailable.</span>;
  }

  const total = data.scopedCount;
  if (isIdentity && total === 0) return null;
  if (total === 0) return <span className={styles.secondary}>No {subject} yet.</span>;

  const rootScopes = data.scopes.filter((scope) => scope.isRoot);
  const subOrgScopes = data.scopes.filter((scope) => !scope.isRoot);

  if (isEnterprise || subOrgScopes.some((scope) => scope.count > 0)) {
    const rootCount = rootScopes.reduce((sum, scope) => sum + scope.count, 0);
    const subOrgCount = subOrgScopes.reduce((sum, scope) => sum + scope.count, 0);
    const orgCount = data.scopes.length;
    return (
      <Stack gap={8}>
        <PanelHeading
          title={`${subject} by organization`}
          meta={`${total.toLocaleString()} across ${orgCount} ${
            orgCount === 1 ? "organization" : "organizations"
          }`}
        />
        {subOrgCount > 0 && <IdentityBar users={rootCount} machines={subOrgCount} size="lg" />}
        <div className={styles.rows}>
          {[...rootScopes, ...[...subOrgScopes].sort((a, b) => b.count - a.count)].map((scope) => (
            <ScopeRow
              key={scope.orgId}
              name={scope.name}
              tag={scope.isRoot ? undefined : "sub-org"}
              count={scope.count}
              total={total}
              isSubOrg={!scope.isRoot}
              isIdentity={isIdentity}
              projects={data.hasProjectDetail ? scope.projects : undefined}
              orgLevelCount={data.hasProjectDetail ? scope.orgLevelCount : undefined}
            />
          ))}
          {subOrgScopes.length === 0 && (
            <span className={`${styles.scopeRow} ${styles.secondary}`}>
              <span />
              <span>No active sub-orgs</span>
            </span>
          )}
        </div>
      </Stack>
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
    <Stack gap={8}>
      <PanelHeading
        title={`${subject} by project`}
        meta={`${total.toLocaleString()} across ${projects.length} ${
          projects.length === 1 ? "project" : "projects"
        }`}
      />
      {rows.length === 0 ? (
        <span className={styles.secondary}>No {subject.toLowerCase()} yet.</span>
      ) : (
        <div className={styles.rows}>
          {rows.map((row) => (
            <div key={row.key} className={styles.projectRow}>
              <span
                className={`${styles.truncate} ${row.key === "org-level" ? styles.secondary : ""}`}
              >
                {row.name}
              </span>
              <ShareBar count={row.count} total={total} />
              <CountShare count={row.count} total={total} isIdentity={isIdentity} />
            </div>
          ))}
        </div>
      )}
    </Stack>
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

  const linkAction = (label: string) => (
    <Button variant="link" underline="hover" size="xs" onClick={onSetCommitment}>
      {label}
    </Button>
  );
  let action: ReactNode = null;
  if (overage > 0) {
    action = (
      <Inline gap={8}>
        <span className={styles.secondary} data-tone="warn">
          +{overage.toLocaleString()} over commitment
        </span>
        {canChangePlan && linkAction("Adjust commitment")}
      </Inline>
    );
  } else if (nudge && nudge.label === dim.label) {
    action = (
      <Inline gap={8}>
        <span className={styles.secondary}>
          Save {fmtMoney(nudge.monthlyAnnualized - nudge.annualCommitted)}/year
        </span>
        {linkAction("Switch to annual")}
      </Inline>
    );
  } else if (committedRate !== null) {
    action = (
      <Inline gap={8}>
        <span className={styles.secondary}>{fmtMoneyCents(committedRate)} per identity / yr</span>
        {canChangePlan && dimCommitManageable(dim) && linkAction("Adjust commitment")}
      </Inline>
    );
  } else if (monthlyRate > 0) {
    action = (
      <span className={styles.secondary}>{fmtMoneyCents(monthlyRate)} per identity / mo</span>
    );
  }

  return (
    <section className={styles.sheetSection} aria-label="Billed identities">
      <Stack gap={8}>
        <span className={styles.spread}>
          <span className={styles.strong}>Billed identities</span>
          <span className={styles.meterLabel}>
            <span className={styles.toneText} data-tone={overage > 0 ? "warn" : undefined}>
              {dim.used.toLocaleString()}x
            </span>
            <span className={styles.secondary}>
              / {allowance === null ? "Unlimited" : allowance.toLocaleString()}
            </span>
          </span>
        </span>
        <IdentityBar
          users={split ? split.users : 1}
          machines={split ? split.machines : 0}
          size="lg"
        />
        <span className={styles.spread}>
          <Inline gap={16}>
            {split && (
              <>
                <span className={styles.legend}>
                  <Swatch />
                  {split.users.toLocaleString()} {split.users === 1 ? "user" : "users"}
                </span>
                {split.machines > 0 && (
                  <span className={styles.legend}>
                    <Swatch tone="muted" />
                    {split.machines.toLocaleString()}{" "}
                    {split.machines === 1 ? "machine" : "machines"}
                  </span>
                )}
              </>
            )}
          </Inline>
          {action}
        </span>
      </Stack>
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
      <span className={`${styles.truncate} ${styles.secondary}`} title={dimDisplayLabel(dim)}>
        {dimDisplayLabel(dim)}
      </span>
      <span className={styles.meterLabel}>
        <span>{dim.used.toLocaleString()}</span>
        <span className={styles.secondary}>
          / {allowance === null ? "Unlimited" : allowance.toLocaleString()}
        </span>
      </span>
      <UsageBar dim={dim} />
      {isNearLimit(dim) && (
        <span className={styles.secondary} data-tone="warn">
          Approaching limit
        </span>
      )}
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
  const isPicker = selectable.length > 1;

  return (
    <section className={styles.sheetSection} aria-label={entitlementsLabel(prod)}>
      <Stack gap={8}>
        <PanelHeading
          title={entitlementsLabel(prod)}
          meta={isPicker ? "Select one to see where it's used" : undefined}
        />
        <div
          className={styles.tiles}
          role={isPicker ? "radiogroup" : undefined}
          aria-label={isPicker ? entitlementsLabel(prod) : undefined}
        >
          {dims.map((dim) =>
            isPicker ? (
              <button
                key={dim.key}
                type="button"
                role="radio"
                aria-checked={dim.key === selected?.key}
                disabled={!canBreakDown(dim)}
                className={styles.tile}
                data-selected={dim.key === selected?.key || undefined}
                onClick={() => setSelectedKey(dim.key)}
              >
                <EntitlementTileContent dim={dim} />
              </button>
            ) : (
              <div key={dim.key} className={styles.tile}>
                <EntitlementTileContent dim={dim} />
              </div>
            )
          )}
        </div>
      </Stack>
      {selected && (
        <BreakdownPanel
          key={selected.key}
          dim={selected}
          breakdown={breakdown}
          isEnterprise={isEnterprise}
        />
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
  const subscription = useBillingSubscription();
  const dims = visibleDims(ent);
  const identity = dims.find(isIdentityDim);
  const others = dims.filter((dim) => !isIdentityDim(dim));
  const isEnterprise = ent.planTier === "enterprise" && Boolean(subscription?.subOrganization);
  const subtitle = [
    planNameFor(prod, ent.planTier),
    priceSummary(ent, isManaged),
    ent.renewsOn && !isManaged ? `renews ${ent.renewsOn}` : null
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <SheetSections
      header={<ProductSheetHeader prod={prod} title={prod.name} description={subtitle} />}
      body={
        <SheetBody>
          <div className={styles.sheetSections}>
            {dims.length === 0 && (
              <span className={styles.secondary}>This plan has no usage-based limits.</span>
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
        </SheetBody>
      }
      footer={
        <SheetFooter>
          {canChangePlan ? (
            <Button onClick={onManage}>Manage plan</Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          )}
        </SheetFooter>
      }
    />
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

  let summary: ReactNode = null;
  let actions: ReactNode = null;
  if (plan && isCurrent) {
    summary = (
      <span className={styles.stacked}>
        {currentAnnual > 0 || currentMonthly > 0 ? (
          <span className={styles.meterLabel}>
            <span>{fmtMoney(currentAnnual > 0 ? currentAnnual : currentMonthly)}</span>
            <span className={styles.secondary}>
              {currentAnnual > 0 ? "/ yr, billed yearly" : "/ mo, billed monthly"}
            </span>
          </span>
        ) : (
          <span>{plan.salesLed ? "Custom pricing" : "No charge"}</span>
        )}
        {ent.renewsOn && <span className={styles.secondary}>Renews {ent.renewsOn}</span>}
      </span>
    );
    if (canChangePlan && (ent.isTrialing || ent.trialPlan)) {
      actions = (
        <Button variant="destructive" onClick={onEndTrial}>
          {ent.trialPlan ? "End trial" : "Cancel trial"}
        </Button>
      );
    } else if (canChangePlan && !plan.salesLed) {
      actions = (
        <Button variant="destructive" onClick={onCancel}>
          Cancel subscription
        </Button>
      );
    }
  } else if (plan?.salesLed) {
    summary = <span>Custom pricing</span>;
    actions = (
      <Button variant="outline" onClick={onContact}>
        Contact sales
      </Button>
    );
  } else if (plan && price && price.amount > 0) {
    summary = (
      <Stack gap={8}>
        <span className={styles.meterLabel}>
          <span>{fmtMoneyCents(price.amount)}</span>
          <span className={styles.secondary}>
            {price.unit.replace(/^\/ /, "per ")}, billed{" "}
            {visibleCadence === "annual" ? "annually" : "monthly"}
          </span>
        </span>
        {supportsAnnual && supportsMonthly && (
          <Inline gap={8}>
            <Switch
              label="Annual"
              checked={visibleCadence === "annual"}
              onChange={(checked) => setCadence(checked ? "annual" : "monthly")}
            />
            {savings > 0 && <Badge tone="ok">-{savings}%</Badge>}
          </Inline>
        )}
      </Stack>
    );
    actions =
      canChangePlan && plan.upgradeable && selectedIndex > currentIndex ? (
        <Inline gap={8}>
          {plan.selfServe && plan.trialable && plan.trialDays > 0 && !ent.trialPlan && (
            <Button variant="outline" onClick={() => onStartTrial(plan)}>
              Try free for {plan.trialDays} days
            </Button>
          )}
          <Button onClick={() => onUpgrade(plan, visibleCadence)}>Upgrade to {plan.name}</Button>
        </Inline>
      ) : (
        <span className={styles.secondary}>Contact support to move to this plan</span>
      );
  }

  return (
    <SheetSections
      header={
        <SheetHeader>
          <Inline gap={8} wrap={false}>
            <Button variant="ghost" size="icon-sm" iconOnly icon="chev-left" onClick={onBack}>
              Back to product details
            </Button>
            <SheetTitle>Manage {prod.name} plan</SheetTitle>
          </Inline>
        </SheetHeader>
      }
      body={
        <SheetBody>
          <Stack gap={24}>
            <Tabs
              variant="segmented"
              label={`${prod.name} plans`}
              value={selectedTier}
              onValueChange={setSelectedTier}
              tabs={plans.map((candidate) => ({
                value: candidate.tier,
                label:
                  candidate.tier === ent.planTier ? `${candidate.name} (current)` : candidate.name
              }))}
            />
            {features.length === 0 && plan?.feature && <span>{plan.feature}</span>}
            {features.length > 0 && (
              <section aria-label={`${plan?.name} features`} className={styles.sheetSection}>
                <span className={styles.secondary}>{lede}</span>
                <ul className={styles.featureList}>
                  {features.map((feature) => (
                    <li key={featureKey(feature)} className={styles.feature}>
                      <PlanFeatureIcon value={feature.value} />
                      <span className={styles.stacked}>
                        <span className={styles.strong}>{formatPlanFeatureTitle(feature)}</span>
                        {feature.description && (
                          <span className={styles.secondary}>{feature.description}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </Stack>
        </SheetBody>
      }
      footer={
        summary || actions ? (
          <SheetFooter>
            <div className={styles.planFooter}>
              {summary}
              {actions}
            </div>
          </SheetFooter>
        ) : undefined
      }
    />
  );
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
  <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
    <AlertDialogContent icon="calendar" pending={isPending}>
      <AlertDialogHeader>
        <AlertDialogTitle>Start your {plan.name} trial</AlertDialogTitle>
        <AlertDialogDescription>
          Your {plan.trialDays > 0 ? `${plan.trialDays}-day ` : ""}trial is free and nothing changes
          about your bill. You&apos;ll keep paying for {basePlanName} until it ends, then move to{" "}
          {plan.name} and be charged the difference. End the trial before then to stay on{" "}
          {basePlanName}.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={isPending}
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
}: {
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
}) => {
  const billing = useV4Adapter("billing");
  const [view, setView] = useState<View>("details");
  const [upgradePlan, setUpgradePlan] = useState<BillingCatalogPlan | null>(null);
  const [commitAfterUpgrade, setCommitAfterUpgrade] = useState(false);
  const [trialPlan, setTrialPlan] = useState<BillingCatalogPlan | null>(null);
  const [showEndTrial, setShowEndTrial] = useState(false);
  const startTrial = billing.useStartTrial();
  const cancelTrial = billing.useCancelTrial();
  const isMutating = billing.useIsSubmitting();
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
          toast({
            tone: "bad",
            title: "Failed to complete trial setup. Missing payment details. Please try again!"
          });
        }
        return;
      }
      toast({ tone: "ok", title: `Your ${trialPlan.name} trial has started.` });
      onClose();
    } catch {
      setTrialPlan(null);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && !isMutating && onClose()}>
        <SheetContent size="lg" pending={isMutating}>
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
          icon="calendar"
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
            toast({
              tone: "ok",
              title: upgradeTrialName
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
