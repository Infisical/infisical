import { useState } from "react";
import { ArrowRight, CalendarX2Icon, Check, EditIcon, PlusIcon, Sparkles } from "lucide-react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
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
  dimAnnualCommitted,
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

const dimPriceLine = (dim: BillingV2Dim, cadence: BillingV2Cadence, unit: string): PriceLine => {
  const metered = isMeteredCadence(dim, cadence);
  const line: PriceLine = { amount: fmtMoney(unitPrice(dim, cadence), 2), unit, metered };
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

  let headline: PriceLine | null = plan.base
    ? { amount: fmtMoney(unitPrice(plan.base, cad)), unit: `/ ${cadenceWord(cad)}` }
    : null;
  let usageDims = dims;
  if (!headline && dims.length > 0) {
    headline = dimPriceLine(dims[0], cad, `/ ${dims[0].noun} / ${cadenceWord(cad)}`);
    usageDims = dims.slice(1);
  }

  if (!headline) {
    return null;
  }

  const usageLines = usageDims.map((dim) => ({
    key: dim.key,
    line: dimPriceLine(dim, cad, `per ${dim.noun} / ${cadenceWordShort(cad)}`)
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <PriceLineView line={headline} headline />
      {usageLines.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3.5">
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

const PlanBadge = ({ plan, isCurrent }: { plan: BillingV2Plan; isCurrent: boolean }) => {
  if (isCurrent) {
    return (
      <Badge variant="success">
        <Check className="text-success" />
        Current plan
      </Badge>
    );
  }
  if (plan.salesLed) {
    return <Badge variant="info">Sales-led</Badge>;
  }
  return <Badge variant="info">Self-serve</Badge>;
};

type PlanCardProps = {
  plan: BillingV2Plan;
  cadence: BillingV2Cadence;
  isCurrent: boolean;
  entitled: boolean;
  // This product's one-per-product trial is already used up (any outcome), so no trial CTA.
  trialUsed: boolean;
  canChangeCommitment: boolean;
  onActivate: (planTier: string) => void;
  onStartTrial: (planTier: string) => void;
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
  onActivate,
  onStartTrial,
  onChangeCommitment,
  onContact
}: PlanCardProps) => {
  const isCustom = plan.salesLed && !plan.base && plan.dims.length === 0;
  // A trial is offered only when the plan supports it, the org isn't already on the product, and it
  // hasn't used its one-time trial for this product yet.
  const offersTrial = plan.selfServe && plan.trialable && !entitled && !trialUsed;

  let cta = null;
  if (plan.salesLed && !isCurrent) {
    cta = (
      <Button variant="org" size="sm" className="mt-auto self-start" onClick={onContact}>
        Contact sales
        <ArrowRight />
      </Button>
    );
  } else if (isCurrent && canChangeCommitment) {
    cta = (
      <Button
        variant="success"
        size="sm"
        className="mt-auto self-start"
        onClick={onChangeCommitment}
      >
        Change commitment
        <EditIcon />
      </Button>
    );
  } else if (plan.selfServe && !entitled) {
    cta = offersTrial ? (
      <Button
        variant="org"
        size="sm"
        className="mt-auto self-start"
        onClick={() => onStartTrial(plan.tier)}
      >
        Start free trial
      </Button>
    ) : (
      <Button
        variant="org"
        size="sm"
        className="mt-auto self-start"
        onClick={() => onActivate(plan.tier)}
      >
        <PlusIcon />
        Activate
      </Button>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3.5 rounded-xl border p-[18px] ${
        isCurrent ? "border-success/40 bg-success/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium text-foreground">{plan.name}</span>
        <PlanBadge plan={plan} isCurrent={isCurrent} />
      </div>
      {isCustom ? (
        <div className="flex items-baseline">
          <span className="text-2xl font-medium text-foreground">Custom</span>
        </div>
      ) : (
        <PlanPricing plan={plan} cadence={cadence} />
      )}
      {plan.feature && <div className="text-xs text-accent">{plan.feature}</div>}
      {offersTrial && (
        <div className="flex items-center gap-1.5 text-xs text-success">
          <Check className="size-3.5" />
          Free trial · no charge for your first cycle
        </div>
      )}
      {cta}
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
  billingEmail?: string;
  returnPath: string;
  renewsOn: string | null;
  // This product's one-per-product trial is already used up (backend-computed from trial history).
  trialUsed: boolean;
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
  billingEmail,
  returnPath,
  renewsOn,
  trialUsed,
  onClose,
  onRemove,
  onContact
}: ProductSheetProps) => {
  const [view, setView] = useState<SheetView>("plans");
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
  // The active product's plan-card price renders in its billing cadence; a new one defaults to monthly.
  const displayCadence: BillingV2Cadence = entitlement?.cadence === "annual" ? "annual" : "monthly";
  const canChangeCommitment = (entitlement?.dimensions ?? []).some(dimAnnualCommitted);

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
      // The trial is already active. Redirect to the card-setup checkout when the server returns one so
      // it can convert at trial end; otherwise nudge the user to add a card before then.
      if (result.cardSetupUrl) {
        window.location.href = result.cardSetupUrl;
        return;
      }
      createNotification({
        type: "success",
        text: `Your ${prod.name} trial has started. Add a card before it ends to keep the product.`
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
  const trialPlanObj = trialConfirmTier
    ? plans.find((plan) => plan.tier === trialConfirmTier)
    : undefined;

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
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-3xl">
          {view === "activate" && activatePlanObj && (
            <ActivateView
              orgId={orgId}
              prod={prod}
              plan={activatePlanObj}
              hasActiveSubscription={hasActiveSubscription}
              billingEmail={billingEmail}
              returnPath={returnPath}
              renewsOn={renewsOn}
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

                <div className={`grid gap-3.5 ${gridCols}`}>
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.tier}
                      plan={plan}
                      cadence={displayCadence}
                      entitled={entitled}
                      trialUsed={trialUsed}
                      isCurrent={entitled && plan.tier === currentTier}
                      canChangeCommitment={canChangeCommitment}
                      onActivate={openActivate}
                      onStartTrial={setTrialConfirmTier}
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
                      <Button variant="danger" onClick={() => setShowCancelTrial(true)}>
                        Cancel trial
                      </Button>
                    ) : (
                      <Button variant="danger" onClick={() => onRemove(prod.id)}>
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
            <AlertDialogTitle>Start your {prod.name} trial?</AlertDialogTitle>
            <AlertDialogDescription>
              Your free trial starts now with no charge. When it ends, {prod.name} continues on the
              monthly {trialPlanObj?.name ?? "Pro"} plan and you&apos;ll be billed for what you use.
              Cancel anytime before then to avoid charges.
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
            <AlertDialogTitle>Cancel your {prod.name} trial?</AlertDialogTitle>
            <AlertDialogDescription>
              {prod.name} drops back to the free tier right away and the trial won&apos;t convert to
              a paid plan. You can&apos;t restart this trial later.
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
