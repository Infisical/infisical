import { useState } from "react";
import {
  ArrowRight,
  CalendarX2Icon,
  Check,
  EditIcon,
  Info,
  PlusIcon,
  Sparkles
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2CompareRow,
  BillingV2Dim,
  BillingV2Entitlement,
  BillingV2Plan,
  useCancelBillingV2Trial,
  useStartBillingV2Trial
} from "@app/hooks/api";

import {
  byDisplayOrder,
  cadencePeriod,
  cadenceWord,
  cadenceWordShort,
  dimCommitManageable,
  dimCommitted,
  fmtMoney,
  isMeteredCadence,
  pluralizeUnit,
  unitPrice
} from "../billing-v2-format";
import { ActivateView } from "./ActivateView";
import { CommitmentView } from "./CommitmentView";
import { ActiveBadge, DimensionMeter, ProductIcon } from "./shared";

// prefix/metered carry the usage-based framing for metered dims; absent for per_unit and base prices.
type PriceLine = { amount: string; unit: string; prefix?: string; metered?: boolean };

// The plan's headline price for a cadence: a base fee, else the first priced dimension's rate.
const planHeadlinePrice = (plan: BillingV2Plan, cadence: BillingV2Cadence): number => {
  if (plan.base) {
    return unitPrice(plan.base, cadence);
  }
  const dim = plan.dims.find((d) => unitPrice(d, cadence) > 0);
  return dim ? unitPrice(dim, cadence) : 0;
};

// How much cheaper the annual rate is than paying monthly for a year (0 when either is missing).
const annualSavingsPct = (plan: BillingV2Plan): number => {
  const monthly = planHeadlinePrice(plan, "monthly");
  const annual = planHeadlinePrice(plan, "annual");
  if (monthly <= 0 || annual <= 0) {
    return 0;
  }
  const pct = Math.round((1 - annual / (monthly * 12)) * 100);
  return pct > 0 ? pct : 0;
};

const dimPriceLine = (
  dim: BillingV2Dim,
  cadence: BillingV2Cadence,
  variant: "headline" | "usage"
): PriceLine => {
  const metered = isMeteredCadence(dim, cadence);
  // A yearly commitment is always divisible by 12, so a per_resource annual price is shown as its
  // per-month equivalent (÷12); metered rates are usage-based consumption prices, shown as-is. The
  // card's cadence toggle is what tells the customer this is billed annually.
  const perMonth = cadence === "annual" && !metered;
  const amount = perMonth ? unitPrice(dim, cadence) / 12 : unitPrice(dim, cadence);
  const unit =
    variant === "headline"
      ? `/ ${dim.noun} / ${perMonth ? "month" : cadenceWord(cadence)}`
      : `per ${dim.noun} / ${perMonth ? "mo" : cadenceWordShort(cadence)}`;
  const line: PriceLine = { amount: fmtMoney(amount, 2), unit, metered };
  if (metered && dim.included > 0) {
    line.prefix = `First ${dim.included.toLocaleString()} ${pluralizeUnit(dim.noun)} included, then`;
  }
  return line;
};

const PriceLineView = ({ line, headline }: { line: PriceLine; headline?: boolean }) => (
  <div className="flex flex-col gap-0.5">
    {line.prefix && <span className="text-xs text-muted">{line.prefix}</span>}
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className={`font-medium text-foreground ${headline ? "text-2xl" : "text-sm"}`}>
        {line.amount}
      </span>
      <span className="text-xs text-muted">{line.unit}</span>
      {line.metered && <Badge variant="neutral">Usage-based</Badge>}
    </div>
  </div>
);

// A plan's price: a base fee leads as the headline, else the first priced dimension is promoted; the
// remaining priced dimensions list below. A metered dimension renders with its usage-based framing.
const PlanPricing = ({ plan, cadence }: { plan: BillingV2Plan; cadence: BillingV2Cadence }) => {
  const dims = plan.dims ?? [];

  // Render at a cadence the plan actually prices. A single-cadence plan (e.g. annual-only) shown at the
  // sheet's default "monthly" would read "$0 / mo", so fall back to the cadence that has real pricing.
  const pricesCadence = (cad: BillingV2Cadence): boolean =>
    cad === "annual"
      ? (plan.base?.annual ?? 0) > 0 || dims.some((dim) => dim.annual > 0)
      : (plan.base?.monthly ?? 0) > 0 || dims.some((dim) => dim.monthly > 0);
  const cad: BillingV2Cadence = pricesCadence(cadence)
    ? cadence
    : ((["monthly", "annual"] as const).find(pricesCadence) ?? cadence);

  // A yearly base fee is shown as its per-month equivalent (÷12), the same treatment the per_resource
  // dims get; the card's cadence toggle communicates that it is billed annually.
  const annual = cad === "annual";
  let headline: PriceLine | null = plan.base
    ? {
        amount: fmtMoney(annual ? unitPrice(plan.base, cad) / 12 : unitPrice(plan.base, cad)),
        unit: annual ? "/ month" : `/ ${cadenceWord(cad)}`
      }
    : null;
  let usageDims = dims;
  if (!headline && dims.length > 0) {
    headline = dimPriceLine(dims[0], cad, "headline");
    usageDims = dims.slice(1);
  }

  if (!headline) {
    return null;
  }

  const usageLines = usageDims.map((dim) => ({
    key: dim.key,
    line: dimPriceLine(dim, cad, "usage")
  }));

  return (
    <div className="flex flex-col gap-3">
      <PriceLineView line={headline} headline />
      {usageLines.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">
            Plus per-unit usage
          </span>
          {usageLines.map(({ key, line }) => (
            <PriceLineView key={key} line={line} />
          ))}
        </div>
      )}
    </div>
  );
};

const renderCompareCell = (value: string | boolean | number | undefined) => {
  if (value === true) {
    return <Check className="mx-auto size-3.5 text-success" />;
  }
  if (value === false || value === undefined) {
    return <span className="text-muted">—</span>;
  }
  return value;
};

type PlanCardProps = {
  plan: BillingV2Plan;
  cadence: BillingV2Cadence;
  isCurrent: boolean;
  entitled: boolean;
  // This product's one-per-product trial is already used up (any outcome), so no trial CTA.
  trialUsed: boolean;
  canChangeCommitment: boolean;
  // Whether a commitment already exists, so the CTA reads "Change" vs "Set" commitment.
  hasCommitment: boolean;
  // false for an enterprise-managed org: self-serve CTAs (activate/trial/commit) render disabled; the
  // sales-led "Contact sales" CTA stays enabled.
  selfServe: boolean;
  onActivate: (planTier: string) => void;
  onChangeCommitment: () => void;
  onContact: () => void;
};

const PlanCard = ({
  plan,
  cadence,
  isCurrent,
  entitled,
  trialUsed,
  canChangeCommitment,
  hasCommitment,
  selfServe,
  onActivate,
  onChangeCommitment,
  onContact
}: PlanCardProps) => {
  const isCustom = plan.salesLed && !plan.base && plan.dims.length === 0;
  // A trial is offered only when the plan supports it, the org isn't already on the product, and it
  // hasn't used its one-time trial for this product yet.
  const offersTrial = plan.selfServe && plan.trialable && !entitled && !trialUsed;

  // Each card carries its own billing-cadence toggle. It defaults to the passed cadence (annual for a
  // new product, so the discounted per-month rate leads), clamped to what the plan actually prices.
  const supportsAnnual =
    plan.dims.some((d) => d.annual > 0) || Boolean(plan.base && plan.base.annual > 0);
  const supportsMonthly =
    plan.dims.some((d) => d.monthly > 0) || Boolean(plan.base && plan.base.monthly > 0);
  const [cardCadence, setCardCadence] = useState<BillingV2Cadence>(() => {
    if (cadence === "annual" && supportsAnnual) return "annual";
    if (cadence === "monthly" && supportsMonthly) return "monthly";
    return supportsAnnual ? "annual" : "monthly";
  });
  const showCadenceToggle = supportsMonthly && supportsAnnual;
  const savingsPct = annualSavingsPct(plan);

  let cta = null;
  if (plan.salesLed && !isCurrent) {
    cta = (
      <Button variant="org" size="sm" className="w-full justify-center" onClick={onContact}>
        Contact sales
        <ArrowRight />
      </Button>
    );
  } else if (isCurrent && canChangeCommitment) {
    cta = (
      <Button
        variant="success"
        size="sm"
        className="w-full justify-center"
        isDisabled={!selfServe}
        onClick={onChangeCommitment}
      >
        {hasCommitment ? "Change commitment" : "Set commitment"}
        <EditIcon />
      </Button>
    );
  } else if (plan.selfServe && !entitled) {
    // Both trial and paid activation open the purchase sheet; it hosts the actual Start-trial / Pay
    // action (and, for a trial, the confirmation dialog). The label just sets expectations here.
    cta = offersTrial ? (
      <Button
        variant="org"
        size="sm"
        className="w-full justify-center"
        isDisabled={!selfServe}
        onClick={() => onActivate(plan.tier)}
      >
        <Sparkles />
        Start a free trial
      </Button>
    ) : (
      <Button
        variant="org"
        size="sm"
        className="w-full justify-center"
        isDisabled={!selfServe}
        onClick={() => onActivate(plan.tier)}
      >
        <PlusIcon />
        Activate
      </Button>
    );
  }

  return (
    <div
      className={`flex flex-col gap-5 rounded-xl border p-5 ${
        isCurrent ? "border-success/40 bg-success/5" : "border-border bg-card"
      }`}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-foreground">{plan.name}</span>
          {isCurrent && (
            <Badge variant="success">
              <Check className="text-success" />
              Current plan
            </Badge>
          )}
        </div>
        {/* Reserve two lines so the CTA (and everything below it) lines up across the card row. */}
        <p className="min-h-10 text-sm leading-5 text-muted">{plan.feature}</p>
      </div>

      {cta}

      {/* Cadence + price sit at the bottom so they align across cards of unequal description length. */}
      <div className="mt-auto flex flex-col gap-2.5">
        {!isCustom && (showCadenceToggle || cardCadence === "annual") && (
          <div className="flex items-center gap-2">
            {showCadenceToggle && (
              <Switch
                variant="org"
                size="sm"
                className="shrink-0"
                checked={cardCadence === "annual"}
                onCheckedChange={(value) => setCardCadence(value ? "annual" : "monthly")}
              />
            )}
            <span className="text-xs font-medium whitespace-nowrap text-foreground">
              {cardCadence === "annual" ? "Billed annually" : "Billed monthly"}
            </span>
            {cardCadence === "annual" && savingsPct > 0 && (
              <Badge variant="success" className="shrink-0">
                Save {savingsPct}%
              </Badge>
            )}
          </div>
        )}
        {isCustom ? (
          <span className="text-2xl font-medium text-foreground">Custom</span>
        ) : (
          <PlanPricing plan={plan} cadence={cardCadence} />
        )}
      </div>
    </div>
  );
};

// "Your current usage" panel for an active product: the recurring headline plus a bar per dimension.
const CurrentUsageCard = ({
  entitlement,
  color
}: {
  entitlement: BillingV2Entitlement;
  // The product's catalog color, threaded through to the dimension meters.
  color: string;
}) => {
  const dims = entitlement.dimensions ?? [];
  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Your current usage</span>
        <span className="text-sm text-muted">
          <span className="font-semibold text-foreground">{fmtMoney(entitlement.amount ?? 0)}</span>{" "}
          / {cadencePeriod(entitlement.cadence)}
        </span>
      </div>
      {dims.length > 0 && (
        <div className="flex flex-col gap-3">
          {dims.map((dim) => (
            <DimensionMeter key={dim.key} dim={dim} color={color} />
          ))}
        </div>
      )}
    </div>
  );
};

const CompareTable = ({
  plans,
  compare
}: {
  plans: BillingV2Plan[];
  compare: BillingV2CompareRow[];
}) => (
  <div>
    <div className="mb-3 text-xs font-medium text-label">Compare Plans</div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead aria-label="Feature" />
          {plans.map((plan) => (
            <TableHead key={plan.tier} className="text-center">
              {plan.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {compare.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="text-accent">{row.label}</TableCell>
            {plans.map((plan) => (
              <TableCell key={plan.tier} className="text-center">
                {renderCompareCell(row.cells[plan.tier])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const IncludesList = ({ includes }: { includes: string[] }) => (
  <div>
    <div className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
      What&apos;s included
    </div>
    <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
      {includes.map((feature) => (
        <div className="flex items-start gap-2 text-xs text-accent" key={feature}>
          <Check className="mt-0.5 size-3 shrink-0 text-success" />
          {feature}
        </div>
      ))}
    </div>
  </div>
);

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3"
};

type ProductSheetProps = {
  orgId: string;
  prod?: BillingV2CatalogProduct;
  entitlement?: BillingV2Entitlement;
  hasActiveSubscription: boolean;
  // Optionally open the sheet straight into a sub-view (e.g. "commitment" from the commit-and-save
  // nudge) instead of the default plans view.
  initialView?: SheetView;
  returnPath: string;
  renewsOn: string | null;
  // This product's one-per-product trial is already used up (backend-computed from trial history).
  trialUsed: boolean;
  // capabilities.selfServe: false for an enterprise-managed org. Self-serve CTAs render disabled and a
  // notice points to sales; the sales-led "Contact sales" path stays available.
  selfServe: boolean;
  onClose: () => void;
  onRemove: (prodId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

type SheetView = "plans" | "activate" | "commitment";

export const ProductSheet = ({
  orgId,
  prod,
  entitlement,
  hasActiveSubscription,
  initialView,
  returnPath,
  renewsOn,
  trialUsed,
  selfServe,
  onClose,
  onRemove,
  onContact
}: ProductSheetProps) => {
  const [view, setView] = useState<SheetView>(initialView ?? "plans");
  // The plan tier chosen for the activate view.
  const [activatePlan, setActivatePlan] = useState<string | null>(null);
  // The plan tier awaiting trial confirmation (drives the confirm dialog).
  const [trialConfirmTier, setTrialConfirmTier] = useState<string | null>(null);
  // Whether the cancel-trial confirm dialog is open.
  const [showCancelTrial, setShowCancelTrial] = useState(false);

  const startTrial = useStartBillingV2Trial();
  const cancelTrial = useCancelBillingV2Trial();

  if (!prod) {
    return null;
  }

  const entitled = Boolean(entitlement?.entitled);
  // A trialing product is canceled (trial → free), not removed like a paid product line.
  const isTrialing = Boolean(entitlement?.isTrialing);
  const selfServePlan = prod.plans.find((plan) => plan.selfServe && !plan.salesLed);
  const trialAvailable =
    !entitled && !trialUsed && prod.plans.some((plan) => plan.selfServe && plan.trialable);
  // The plan-card price always leads with the best (annual) rate shown as a per-month figure (÷12, see
  // PlanPricing) with a "billed annually" note, even for a trialable plan. An entitled product shows
  // its own cadence. PlanPricing falls back to monthly for a monthly-only plan. The trial's
  // monthly-first default lives in the purchase sheet (ActivateView), not on this card.
  const displayCadence: BillingV2Cadence = entitlement?.cadence ?? "annual";
  // Offer the commitment flow when the org already has a commitment (to change it) OR its pinned plan
  // version lets it commit a dimension it hasn't set yet (start from zero, e.g. a monthly subscriber
  // committing annually). Uses the SAME predicate the commitment view filters on (dimCommitManageable),
  // so the action never opens onto an empty sheet. hasCommitment only drives the CTA label.
  const hasCommitment = (entitlement?.dimensions ?? []).some(dimCommitted);
  const showChangeCommitment = (entitlement?.dimensions ?? []).some(dimCommitManageable);

  // Render plan cards in the catalog's displayOrder (already sorted server-side). A deprecated plan is
  // closed to new customers, so hide it unless the org is already entitled (e.g. currently on it).
  const plans = [...(prod.plans ?? [])]
    .filter((plan) => !plan.deprecated || entitled)
    .sort(byDisplayOrder);
  const currentTier =
    entitlement?.planTier ?? (entitled ? plans.find((plan) => plan.selfServe)?.tier : undefined);
  const gridCols = GRID_COLS[Math.min(plans.length, 3)] ?? GRID_COLS[3];
  const showCompare = Boolean(prod.compare && prod.compare.length > 0 && plans.length > 1);

  const openActivate = (planTier: string) => {
    setActivatePlan(planTier);
    setView("activate");
  };

  const handleConfirmTrial = async () => {
    if (!trialConfirmTier) {
      return;
    }
    try {
      const result = await startTrial.mutateAsync({
        orgId,
        productId: prod.id,
        plan: trialConfirmTier
      });
      // Card-first: awaiting_card means no card is on file and the trial is NOT granted yet. Send the
      // customer to the card-setup checkout; completing it grants the trial via webhook.
      if (result.outcome === "awaiting_card" && result.cardSetupUrl) {
        window.location.href = result.cardSetupUrl;
        return;
      }
      // trial_started: a card is on file and the trial is active now.
      createNotification({
        type: "success",
        text: `Your ${prod.name} trial has started.`
      });
      onClose();
    } catch {
      createNotification({ type: "error", text: `Failed to start the ${prod.name} trial.` });
      setTrialConfirmTier(null);
    }
  };

  const handleCancelTrial = async () => {
    try {
      await cancelTrial.mutateAsync({ orgId, productId: prod.id });
      createNotification({
        type: "success",
        text: `Your ${prod.name} trial has been canceled.`
      });
      onClose();
    } catch {
      createNotification({ type: "error", text: `Failed to cancel the ${prod.name} trial.` });
      setShowCancelTrial(false);
    }
  };

  const activatePlanObj = activatePlan
    ? plans.find((plan) => plan.tier === activatePlan)
    : (selfServePlan ?? undefined);

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
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-4xl">
          {view === "activate" && activatePlanObj && (
            <ActivateView
              orgId={orgId}
              prod={prod}
              plan={activatePlanObj}
              hasActiveSubscription={hasActiveSubscription}
              returnPath={returnPath}
              renewsOn={renewsOn}
              selfServe={selfServe}
              // A trial is offered for this plan when the product's trial is unused and the plan itself
              // is self-serve + trialable. ActivateView shows Start-trial vs Pay off this.
              trialAvailable={
                trialAvailable && activatePlanObj.selfServe && activatePlanObj.trialable
              }
              onStartTrial={() => setTrialConfirmTier(activatePlanObj.tier)}
              onBack={() => setView("plans")}
              onDone={onClose}
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
            <>
              <SheetHeader className="flex-row items-center gap-3.5 border-b pr-12">
                <ProductIcon product={prod} size={40} />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                    {prod.name}
                    {prod.addon && <Badge variant="neutral">Add-on</Badge>}
                    {entitled && <ActiveBadge />}
                  </SheetTitle>
                  <SheetDescription className="mt-1">{prod.tagline}</SheetDescription>
                </div>
              </SheetHeader>

              <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
                {entitled && entitlement && (
                  <CurrentUsageCard entitlement={entitlement} color={prod.color} />
                )}

                {!selfServe && (
                  <Alert variant="info">
                    <Info />
                    <AlertTitle>Billing is managed by our team</AlertTitle>
                    <AlertDescription>
                      Your plan is on a custom agreement, so self-serve changes are disabled.
                      Contact sales to adjust products, commitments, or your subscription.
                    </AlertDescription>
                  </Alert>
                )}

                <div className={`grid gap-3.5 ${gridCols}`}>
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.tier}
                      plan={plan}
                      cadence={displayCadence}
                      entitled={entitled}
                      trialUsed={trialUsed}
                      isCurrent={entitled && plan.tier === currentTier}
                      canChangeCommitment={showChangeCommitment}
                      hasCommitment={hasCommitment}
                      selfServe={selfServe}
                      onActivate={openActivate}
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
              </div>

              <SheetFooter className="flex-row items-center justify-between border-t">
                {entitled ? (
                  <>
                    {isTrialing ? (
                      <Button
                        variant="danger"
                        isDisabled={!selfServe}
                        onClick={() => setShowCancelTrial(true)}
                      >
                        Cancel trial
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        isDisabled={!selfServe}
                        onClick={() => onRemove(prod.id)}
                      >
                        Remove product
                      </Button>
                    )}
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-muted">
                      Choose monthly or yearly at checkout · cancel any time
                    </span>
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                  </>
                )}
              </SheetFooter>
            </>
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
        <AlertDialogContent className="sm:max-w-lg!">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Sparkles />
            </AlertDialogMedia>
            <AlertDialogTitle>Start your {prod.name} trial</AlertDialogTitle>
            <AlertDialogDescription>
              Your 14-day trial is free. After it ends, your subscription continues automatically
              and you&apos;ll be billed monthly based on usage. Cancel before the trial ends to
              avoid charges.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="org"
              isDisabled={startTrial.isPending}
              isPending={startTrial.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmTrial();
              }}
            >
              Start free trial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showCancelTrial}
        onOpenChange={(open) => {
          if (!open && !cancelTrial.isPending) {
            setShowCancelTrial(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg!">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <CalendarX2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Cancel your {prod.name} trial</AlertDialogTitle>
            <AlertDialogDescription>
              Canceling returns you to the free tier immediately and stops the trial from converting
              to a paid plan. This trial can&apos;t be restarted later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep trial</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isDisabled={cancelTrial.isPending}
              isPending={cancelTrial.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleCancelTrial();
              }}
            >
              Cancel trial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
