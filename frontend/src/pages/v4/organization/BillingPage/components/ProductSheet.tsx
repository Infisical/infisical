import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
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
import { Card } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Separator } from "@app/components/v4/ui/separator";
import { Sheet, SheetBody, SheetContent, SheetFooter } from "@app/components/v4/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Heading, SmallText, Text } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import type {
  BillingBands,
  BillingCadence,
  BillingCatalogPlan,
  BillingCatalogProduct,
  BillingCompareRow,
  BillingDim,
  BillingEntitlement
} from "@app/hooks/api/billing/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import {
  bandIndexFor,
  bandRateLabel,
  byDisplayOrder,
  cadencePeriod,
  cadenceWord,
  cadenceWordShort,
  dimCommitManageable,
  dimCommitted,
  fmtMoney,
  fmtMoneyCents,
  isMeteredCadence,
  meteredUsageCaption,
  unitForCount,
  unitPrice
} from "../billing-format";
import { ActivateView } from "./ActivateView";
import { CancellationFeedbackDialog } from "./CancellationFeedbackDialog";
import { CommitmentView } from "./CommitmentView";
import { MeteredBandTable } from "./MeteredBandTable";
import {
  DimensionMeter,
  MANAGED_BILLING_REASON,
  ProductSheetHeader,
  SheetSections
} from "./sheet-shared";
import { UpgradeView } from "./UpgradeView";

// prefix and metered carry the usage-based framing for metered dims; absent for per_unit and base
// prices.
type PriceLine = {
  amount: string;
  unit: string;
  prefix?: string;
  metered?: boolean;
  bands?: BillingBands;
  noun?: string;
  // The band a free trial's usage has reached, marked on the band table.
  trialBand?: number;
};

// The plan's headline price for a cadence: a base fee, else the first priced dimension's rate.
const planHeadlinePrice = (plan: BillingCatalogPlan, cadence: BillingCadence): number => {
  if (plan.base) {
    return unitPrice(plan.base, cadence);
  }
  const dim = plan.dims.find((d) => unitPrice(d, cadence) > 0);
  return dim ? unitPrice(dim, cadence) : 0;
};

// How much cheaper the annual rate is than paying monthly for a year (0 when either is missing).
const annualSavingsPct = (plan: BillingCatalogPlan): number => {
  const monthly = planHeadlinePrice(plan, "monthly");
  const annual = planHeadlinePrice(plan, "annual");
  if (monthly <= 0 || annual <= 0) {
    return 0;
  }
  const pct = Math.round((1 - annual / (monthly * 12)) * 100);
  return pct > 0 ? pct : 0;
};

const dimPriceLine = (
  dim: BillingDim,
  cadence: BillingCadence,
  variant: "headline" | "usage"
): PriceLine => {
  // Usage stays billed monthly when the customer commits yearly, so a meter with no annual price keeps
  // its monthly price on the yearly card.
  const cad: BillingCadence =
    cadence === "annual" && dim.annual === 0 && !dim.meteredAnnual && dim.meteredMonthly
      ? "monthly"
      : cadence;
  const metered = isMeteredCadence(dim, cad);
  // A per_resource annual price is shown as its per-month equivalent; metered rates are consumption
  // prices, shown as-is. The card's cadence toggle says it is billed annually.
  const perMonth = cad === "annual" && !metered;
  const amount = perMonth ? unitPrice(dim, cad) / 12 : unitPrice(dim, cad);
  const unit =
    variant === "headline"
      ? `/ ${dim.noun} / ${perMonth ? "month" : cadenceWord(cad)}`
      : `per ${dim.noun} / ${perMonth ? "mo" : cadenceWordShort(cad)}`;
  const line: PriceLine = { amount: fmtMoneyCents(amount), unit, metered };
  if (metered && dim.bands && dim.bands.tiers.length === 1) {
    line.amount = bandRateLabel(dim.bands.tiers[0], dim.noun);
    line.unit = "/ month";
    return line;
  }
  if (metered && dim.bands && dim.bands.tiers.length > 1) {
    // Banded usage reads as its table, not one rate; the headline names the first paid band.
    const paidIndex = dim.bands.tiers.findIndex((band) => band.unitPrice > 0 || band.flatFee > 0);
    const paid = dim.bands.tiers[paidIndex >= 0 ? paidIndex : 0];
    line.amount = bandRateLabel(paid, dim.noun);
    line.unit = "/ month";
    line.prefix = dim.bands.mode === "volume" ? "Volume pricing, from" : "Usage in bands, from";
    line.bands = dim.bands;
    line.noun = dim.noun;
    return line;
  }
  if (metered && dim.included > 0) {
    line.prefix = `First ${dim.included.toLocaleString()} ${unitForCount(dim.noun, dim.included)} included, then`;
  }
  return line;
};

const PriceLineView = ({ line, headline }: { line: PriceLine; headline?: boolean }) => (
  <Stack gap={4}>
    {line.prefix && <SmallText muted>{line.prefix}</SmallText>}
    <Inline gap={8}>
      {headline ? (
        <Heading level={4} size="section">
          <span className="tabular-nums">{line.amount}</span>
        </Heading>
      ) : (
        <Text>
          <span className="tabular-nums">{line.amount}</span>
        </Text>
      )}
      <SmallText muted>{line.unit}</SmallText>
      {line.metered && <Badge tone="soft">Usage-based</Badge>}
    </Inline>
    {line.bands && (
      <MeteredBandTable bands={line.bands} noun={line.noun ?? "unit"} highlight={line.trialBand} />
    )}
  </Stack>
);

// A plan's price: a base fee leads as the headline, else the first priced dimension is promoted; the
// remaining priced dimensions list below.
const PlanPricing = ({
  plan,
  cadence,
  trialUsage
}: {
  plan: BillingCatalogPlan;
  cadence: BillingCadence;
  trialUsage?: Record<string, number>;
}) => {
  const dims = plan.dims ?? [];
  const withTrialBand = (key: string, line: PriceLine): PriceLine =>
    line.bands && trialUsage?.[key] !== undefined
      ? { ...line, trialBand: bandIndexFor(line.bands, trialUsage[key]) }
      : line;

  // Render at a cadence the plan actually prices, so an annual-only plan never reads "$0 / mo".
  const pricesCadence = (cad: BillingCadence): boolean =>
    cad === "annual"
      ? (plan.base?.annual ?? 0) > 0 || dims.some((dim) => dim.annual > 0)
      : (plan.base?.monthly ?? 0) > 0 || dims.some((dim) => dim.monthly > 0);
  const cad: BillingCadence = pricesCadence(cadence)
    ? cadence
    : ((["monthly", "annual"] as const).find(pricesCadence) ?? cadence);

  const annual = cad === "annual";
  let headline: PriceLine | null = plan.base
    ? {
        amount: fmtMoneyCents(annual ? unitPrice(plan.base, cad) / 12 : unitPrice(plan.base, cad)),
        unit: annual ? "/ month" : `/ ${cadenceWord(cad)}`
      }
    : null;
  let usageDims = dims;
  if (!headline && dims.length > 0) {
    headline = withTrialBand(dims[0].key, dimPriceLine(dims[0], cad, "headline"));
    usageDims = dims.slice(1);
  }

  if (!headline) {
    return null;
  }

  return (
    <Stack gap={12}>
      <PriceLineView line={headline} headline />
      {usageDims.length > 0 && (
        <>
          <Separator />
          <Stack gap={8}>
            <SmallText muted>Plus per-unit usage</SmallText>
            {usageDims.map((dim) => (
              <PriceLineView
                key={dim.key}
                line={withTrialBand(dim.key, dimPriceLine(dim, cad, "usage"))}
              />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
};

type PlanCardProps = {
  plan: BillingCatalogPlan;
  cadence: BillingCadence;
  isCurrent: boolean;
  // Current plan in a free trial only: the band each metered dimension's usage has reached.
  trialUsage?: Record<string, number>;
  entitled: boolean;
  canChangeCommitment: boolean;
  hasCommitment: boolean;
  // false for an enterprise-managed org: self-serve actions render disabled; Contact sales stays
  // enabled.
  selfServe: boolean;
  onActivate: (planTier: string) => void;
  onStartTrial: (planTier: string) => void;
  onUpgrade: (planTier: string) => void;
  onChangeCommitment: () => void;
  onContact: () => void;
};

const PlanCard = ({
  plan,
  cadence,
  isCurrent,
  trialUsage,
  entitled,
  canChangeCommitment,
  hasCommitment,
  selfServe,
  onActivate,
  onStartTrial,
  onUpgrade,
  onChangeCommitment,
  onContact
}: PlanCardProps) => {
  const isCustom = plan.salesLed && !plan.base && plan.dims.length === 0;
  const offersTrial = plan.selfServe && plan.trialable;
  const trialLabel =
    plan.trialDays > 0 ? `Try free for ${plan.trialDays} days` : "Start a free trial";

  // Each card carries its own cadence toggle, defaulting to the passed cadence clamped to what the plan
  // actually prices.
  const supportsAnnual =
    plan.dims.some((d) => d.annual > 0) || Boolean(plan.base && plan.base.annual > 0);
  const supportsMonthly =
    plan.dims.some((d) => d.monthly > 0) || Boolean(plan.base && plan.base.monthly > 0);
  const [cardCadence, setCardCadence] = useState<BillingCadence>(() => {
    if (cadence === "annual" && supportsAnnual) return "annual";
    if (cadence === "monthly" && supportsMonthly) return "monthly";
    return supportsAnnual ? "annual" : "monthly";
  });
  const showCadenceToggle = supportsMonthly && supportsAnnual;
  const savingsPct = annualSavingsPct(plan);
  const managedReason = selfServe ? undefined : MANAGED_BILLING_REASON;

  let cta = null;
  if (plan.salesLed && !isCurrent) {
    cta = <Button onClick={onContact}>Contact sales</Button>;
  } else if (isCurrent && canChangeCommitment) {
    cta = (
      <Button disabledReason={managedReason} onClick={onChangeCommitment}>
        {hasCommitment ? "Change commitment" : "Set commitment"}
      </Button>
    );
  } else if (plan.selfServe && !entitled) {
    // Trial and paid activation both open the purchase view, which hosts the real action.
    cta = (
      <Button disabledReason={managedReason} onClick={() => onActivate(plan.tier)}>
        {offersTrial ? trialLabel : "Activate"}
      </Button>
    );
  } else if (entitled && !isCurrent && plan.selfServe && (offersTrial || plan.upgradeable)) {
    // A plan above the one held. Trial wins when offered: it charges nothing, and once it starts
    // trialable goes false while upgradeable stays true, so the card falls through to Upgrade.
    cta = offersTrial ? (
      <Button disabledReason={managedReason} onClick={() => onStartTrial(plan.tier)}>
        {trialLabel}
      </Button>
    ) : (
      <Button disabledReason={managedReason} onClick={() => onUpgrade(plan.tier)}>
        Upgrade now
      </Button>
    );
  }

  return (
    <Card
      variant="framed"
      title={plan.name}
      action={
        isCurrent ? (
          <Badge tone="ok" dot>
            Current plan
          </Badge>
        ) : undefined
      }
    >
      <Stack gap={16} className="h-full">
        {plan.feature && <SmallText muted>{plan.feature}</SmallText>}
        {cta && <div className="grid">{cta}</div>}
        <Stack gap={12} className="mt-auto">
          {!isCustom && showCadenceToggle && (
            <Inline gap={8}>
              <ToggleGroup
                type="single"
                size="sm"
                aria-label={`${plan.name} billing cadence`}
                value={cardCadence}
                onValueChange={(value) => {
                  if (value === "monthly" || value === "annual") setCardCadence(value);
                }}
              >
                <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
                <ToggleGroupItem value="annual">Annually</ToggleGroupItem>
              </ToggleGroup>
              {cardCadence === "annual" && savingsPct > 0 && (
                <Badge tone="ok">Save {savingsPct}%</Badge>
              )}
            </Inline>
          )}
          {!isCustom && !showCadenceToggle && cardCadence === "annual" && (
            <SmallText muted>Billed annually</SmallText>
          )}
          {isCustom ? (
            <Heading level={4} size="section">
              Custom
            </Heading>
          ) : (
            <PlanPricing plan={plan} cadence={cardCadence} trialUsage={trialUsage} />
          )}
        </Stack>
      </Stack>
    </Card>
  );
};

const CurrentUsageCard = ({ entitlement }: { entitlement: BillingEntitlement }) => {
  const dims = entitlement.dimensions ?? [];
  return (
    <Card
      variant="framed"
      title="Your current usage"
      action={
        <SmallText muted>
          <span className="tabular-nums">
            {fmtMoney(entitlement.amount ?? 0)} / {cadencePeriod(entitlement.cadence)}
          </span>
        </SmallText>
      }
    >
      {dims.length > 0 && (
        <Stack gap={12}>
          {dims.map((dim) => {
            const caption = meteredUsageCaption(dim);
            return (
              <Stack key={dim.key} gap={4}>
                <DimensionMeter dim={dim} />
                {dim.metered && dim.usage && (
                  <SmallText muted>
                    This period ({dim.usage.periodStart} to {dim.usage.periodEnd})
                    {caption ? `: ${caption}` : ""}
                  </SmallText>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Card>
  );
};

const renderCompareCell = (value: string | boolean | number | undefined) => {
  if (value === true) {
    return (
      <>
        <Icon name="check" size={14} />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false || value === undefined) {
    return (
      <>
        <Icon name="minus" size={14} />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return value;
};

const CompareTable = ({
  plans,
  compare
}: {
  plans: BillingCatalogPlan[];
  compare: BillingCompareRow[];
}) => (
  <Stack gap={8}>
    <Heading level={3} size="subsection">
      Compare plans
    </Heading>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <span className="sr-only">Feature</span>
          </TableHead>
          {plans.map((plan) => (
            <TableHead key={plan.tier}>{plan.name}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {compare.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            {plans.map((plan) => (
              <TableCell key={plan.tier}>{renderCompareCell(row.cells[plan.tier])}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Stack>
);

const IncludesList = ({ includes }: { includes: string[] }) => (
  <Stack gap={8}>
    <Heading level={3} size="subsection">
      What&apos;s included
    </Heading>
    <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {includes.map((feature) => (
        <li key={feature} className="flex items-start gap-2">
          <Icon name="check" size={14} />
          <SmallText>{feature}</SmallText>
        </li>
      ))}
    </ul>
  </Stack>
);

type SheetView = "plans" | "activate" | "commitment" | "upgrade";

type ProductSheetProps = {
  orgId: string;
  prod?: BillingCatalogProduct;
  entitlement?: BillingEntitlement;
  hasActiveSubscription: boolean;
  // Open straight into a sub-view (e.g. "commitment" from the commit-and-save nudge) instead of the
  // plans view.
  initialView?: SheetView;
  returnPath: string;
  renewsOn: string | null;
  // capabilities.selfServe: false for an enterprise-managed org. Self-serve actions render disabled
  // and a notice points to the account manager; Contact sales stays available.
  selfServe: boolean;
  onClose: () => void;
  onEntitlementChanged?: () => void;
  onRemove: (prodId: string) => void;
  onContact: (prod: BillingCatalogProduct) => void;
};

export const ProductSheet = ({
  orgId,
  prod,
  entitlement,
  hasActiveSubscription,
  initialView,
  returnPath,
  renewsOn,
  selfServe,
  onClose,
  onEntitlementChanged,
  onRemove,
  onContact
}: ProductSheetProps) => {
  const [view, setView] = useState<SheetView>(initialView ?? "plans");
  const [activatePlan, setActivatePlan] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  // The plan tier awaiting trial confirmation (drives the confirm dialog).
  const [trialConfirmTier, setTrialConfirmTier] = useState<string | null>(null);
  const [showCancelTrial, setShowCancelTrial] = useState(false);

  const billing = useV4Adapter("billing");
  const startTrial = billing.useStartTrial();
  const cancelTrial = billing.useCancelTrial();

  if (!prod) {
    return null;
  }

  const entitled = Boolean(entitlement?.entitled);
  // A trialing product is canceled (trial to free), not removed like a paid product line.
  const isTrialing = Boolean(entitlement?.isTrialing);
  // An upgrade trial sits on top of a paid plan: ending it reverts to that plan rather than to free.
  const upgradeTrialPlan = entitlement?.trialPlan
    ? (entitlement.trialPlanName ??
      prod.plans.find((plan) => plan.tier === entitlement.trialPlan)?.name ??
      entitlement.trialPlan)
    : null;
  const basePlanName = entitlement?.planTier
    ? (prod.plans.find((plan) => plan.tier === entitlement.planTier)?.name ?? entitlement.planTier)
    : "your current plan";
  const selfServePlan = prod.plans.find((plan) => plan.selfServe && !plan.salesLed);
  const trialAvailable = !entitled && prod.plans.some((plan) => plan.selfServe && plan.trialable);
  // Plan cards lead with the annual rate as a per-month figure; an entitled product shows its own
  // cadence. The trial's monthly-first default lives in ActivateView.
  const displayCadence: BillingCadence = entitlement?.cadence ?? "annual";
  // Offer the commitment flow when the org already has a commitment or its pinned plan version lets it
  // commit a dimension it hasn't set yet. Same predicate CommitmentView filters on, so it never opens
  // empty.
  const hasCommitment = (entitlement?.dimensions ?? []).some(dimCommitted);
  const showChangeCommitment = (entitlement?.dimensions ?? []).some(dimCommitManageable);

  // A deprecated plan is closed to new customers, so hide it unless the org is already entitled.
  const plans = [...(prod.plans ?? [])]
    .filter((plan) => !plan.deprecated || entitled)
    .sort(byDisplayOrder);
  const currentTier =
    entitlement?.planTier ?? (entitled ? plans.find((plan) => plan.selfServe)?.tier : undefined);
  const trialUsage = Object.fromEntries(
    (entitlement?.dimensions ?? [])
      .filter((dim) => dim.usage?.trial)
      .map((dim) => [dim.key, dim.used])
  );
  const showCompare = Boolean(prod.compare && prod.compare.length > 0 && plans.length > 1);
  const managedReason = selfServe ? undefined : MANAGED_BILLING_REASON;

  const openActivate = (planTier: string) => {
    setActivatePlan(planTier);
    setView("activate");
  };

  const openUpgrade = (planTier: string) => {
    setUpgradePlan(planTier);
    setView("upgrade");
  };

  const handleConfirmTrial = async () => {
    if (!trialConfirmTier) {
      return;
    }
    try {
      const result = await startTrial.mutateAsync({
        orgId,
        productId: prod.id,
        plan: trialConfirmTier,
        returnPath
      });
      // Card-first: awaiting_card means no card is on file and the trial is not granted yet. The
      // card-setup checkout grants it via webhook.
      if (result.outcome === "awaiting_card") {
        if (result.cardSetupUrl) {
          window.location.href = result.cardSetupUrl;
        } else {
          failed("Failed to complete trial setup. Missing payment details. Please try again!");
        }
        return;
      }
      saved(`Your ${prod.name} trial has started.`);
      onEntitlementChanged?.();
      onClose();
    } catch {
      setTrialConfirmTier(null);
    }
  };

  const handleCancelTrialConfirmed = () => {
    saved(
      upgradeTrialPlan
        ? `Your ${upgradeTrialPlan} trial has ended. You're still on ${basePlanName}.`
        : `Your ${prod.name} trial has been canceled.`
    );
    onClose();
  };

  const activatePlanObj = activatePlan
    ? plans.find((plan) => plan.tier === activatePlan)
    : (selfServePlan ?? undefined);
  const upgradePlanObj = upgradePlan ? plans.find((plan) => plan.tier === upgradePlan) : undefined;
  const trialConfirmPlan = trialConfirmTier
    ? plans.find((plan) => plan.tier === trialConfirmTier)
    : undefined;
  // Trialing a plan above one the org already pays for converts to that plan rather than starting a
  // paid subscription from free, so the confirmation promises something different.
  const trialIsUpgrade = entitled && Boolean(trialConfirmTier) && trialConfirmTier !== currentTier;
  const trialLengthLabel =
    trialConfirmPlan && trialConfirmPlan.trialDays > 0 ? `${trialConfirmPlan.trialDays}-day ` : "";

  const done = () => {
    onEntitlementChanged?.();
    onClose();
  };

  let footerStart = (
    <SmallText muted>Choose monthly or yearly at checkout and cancel any time.</SmallText>
  );
  if (entitled) {
    footerStart =
      isTrialing || upgradeTrialPlan ? (
        <Button
          variant="destructive"
          disabledReason={managedReason}
          onClick={() => setShowCancelTrial(true)}
        >
          {upgradeTrialPlan ? "End trial" : "Cancel trial"}
        </Button>
      ) : (
        <Button
          variant="destructive"
          disabledReason={managedReason}
          onClick={() => onRemove(prod.id)}
        >
          Remove product
        </Button>
      );
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <SheetContent size="lg">
          {view === "activate" && activatePlanObj && (
            <ActivateView
              orgId={orgId}
              prod={prod}
              plan={activatePlanObj}
              hasActiveSubscription={hasActiveSubscription}
              returnPath={returnPath}
              renewsOn={renewsOn}
              selfServe={selfServe}
              trialAvailable={
                trialAvailable && activatePlanObj.selfServe && activatePlanObj.trialable
              }
              onStartTrial={() => setTrialConfirmTier(activatePlanObj.tier)}
              onBack={() => setView("plans")}
              onDone={done}
            />
          )}

          {view === "upgrade" && upgradePlanObj && (
            <UpgradeView
              orgId={orgId}
              prod={prod}
              plan={upgradePlanObj}
              fromPlanName={basePlanName}
              renewsOn={renewsOn}
              selfServe={selfServe}
              isTrialConversion={entitlement?.trialPlan === upgradePlanObj.tier}
              onBack={() => setView("plans")}
              onDone={done}
            />
          )}

          {view === "commitment" && entitlement && (
            <CommitmentView
              orgId={orgId}
              prod={prod}
              entitlement={entitlement}
              renewsOn={renewsOn}
              selfServe={selfServe}
              onBack={() => setView("plans")}
              onDone={onClose}
            />
          )}

          {view === "plans" && (
            <SheetSections
              header={
                <ProductSheetHeader
                  prod={prod}
                  title={
                    <Inline gap={8}>
                      {prod.name}
                      {prod.addon && <Badge tone="soft">Add-on</Badge>}
                      {entitled && (
                        <Badge tone="ok" dot>
                          Active
                        </Badge>
                      )}
                    </Inline>
                  }
                />
              }
              body={
                <SheetBody>
                  <Stack gap={24}>
                    {entitled && entitlement && <CurrentUsageCard entitlement={entitlement} />}

                    {!selfServe && (
                      <Alert tone="info" title="Managed billing">
                        Contact your Infisical account manager to adjust products, commitments, or
                        your subscription.
                      </Alert>
                    )}

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
                      {plans.map((plan) => (
                        <PlanCard
                          key={plan.tier}
                          plan={plan}
                          cadence={displayCadence}
                          entitled={entitled}
                          isCurrent={entitled && plan.tier === currentTier}
                          trialUsage={
                            entitled && plan.tier === currentTier ? trialUsage : undefined
                          }
                          canChangeCommitment={showChangeCommitment}
                          hasCommitment={hasCommitment}
                          selfServe={selfServe}
                          onActivate={openActivate}
                          onStartTrial={setTrialConfirmTier}
                          onUpgrade={openUpgrade}
                          onChangeCommitment={() => setView("commitment")}
                          onContact={() => onContact(prod)}
                        />
                      ))}
                    </div>

                    {showCompare && prod.compare ? (
                      <CompareTable plans={plans} compare={prod.compare} />
                    ) : (
                      prod.includes &&
                      prod.includes.length > 0 && <IncludesList includes={prod.includes} />
                    )}
                  </Stack>
                </SheetBody>
              }
              footer={
                <SheetFooter>
                  <Inline justify="between">
                    {footerStart}
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                  </Inline>
                </SheetFooter>
              }
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(trialConfirmTier)}
        onOpenChange={(open) => {
          if (!open && !startTrial.isPending) {
            setTrialConfirmTier(null);
          }
        }}
      >
        <AlertDialogContent icon="calendar" pending={startTrial.isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Start your {trialConfirmPlan?.name ?? prod.name} trial
            </AlertDialogTitle>
            <AlertDialogDescription>
              {trialIsUpgrade
                ? `Your ${trialLengthLabel}trial is free and nothing changes about your bill. You'll keep paying for ${basePlanName} until it ends, then move to ${trialConfirmPlan?.name} and be charged the difference. End the trial before then to stay on ${basePlanName}.`
                : `Your ${trialLengthLabel}trial is free. After it ends, your subscription continues automatically and you'll be billed monthly based on usage. Cancel before the trial ends to avoid charges.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                loading={startTrial.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmTrial();
                }}
              >
                Start free trial
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showCancelTrial && (
        <CancellationFeedbackDialog
          orgId={orgId}
          productId={prod.id}
          action="cancel_trial"
          icon="calendar"
          title={
            upgradeTrialPlan
              ? `End your ${upgradeTrialPlan} trial`
              : `Cancel your ${prod.name} trial`
          }
          description={
            upgradeTrialPlan
              ? `You'll go back to ${basePlanName} right away and won't be charged anything. This trial can't be restarted later.`
              : "Canceling returns you to the free tier immediately and stops the trial from converting to a paid plan. This trial can't be restarted later."
          }
          reasonLabel={
            upgradeTrialPlan ? "Why are you ending your trial?" : "Why are you canceling?"
          }
          confirmLabel={upgradeTrialPlan ? "End trial" : "Cancel trial"}
          dismissLabel="Keep trial"
          onConfirm={() => cancelTrial.mutateAsync({ orgId, productId: prod.id })}
          onConfirmed={handleCancelTrialConfirmed}
          onDismiss={() => setShowCancelTrial(false)}
        />
      )}
    </>
  );
};
