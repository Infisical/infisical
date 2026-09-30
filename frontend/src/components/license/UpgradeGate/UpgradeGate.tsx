import { CSSProperties, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, Check, CircleAlert } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Loader,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import {
  BillingV2Cadence,
  BillingV2CatalogProduct,
  BillingV2Plan,
  useGetBillingV2Catalog,
  useGetBillingV2Overview,
  useStartBillingV2Trial
} from "@app/hooks/api";
import { waitForMinimumDuration } from "@app/lib/fn/promise";
import {
  cadenceWord,
  fmtMoney,
  isMeteredCadence,
  unitPrice
} from "@app/pages/organization/BillingV2Page/billing-v2-format";
import { ProductIcon } from "@app/pages/organization/BillingV2Page/components/shared";

import { buildUpgradeReturnPath, UpgradeIntent, UpgradeReturnTarget } from "./upgrade-intents";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";
const MINIMUM_PLAN_LOADING_DURATION_MS = 800;

type Props = {
  intent: UpgradeIntent;
  returnTarget?: UpgradeReturnTarget;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGranted: () => void;
};

type PlanFeature = {
  label: string;
  value?: string;
};

type PlanPrice = {
  amount: number;
  unit: string;
  compactUnit: string;
  isMonthlyEquivalent: boolean;
};

const planSupportsCadence = (plan: BillingV2Plan, cadence: BillingV2Cadence) => {
  const basePrice = plan.base?.[cadence] ?? 0;
  return basePrice > 0 || plan.dims.some((dimension) => dimension[cadence] > 0);
};

const getPlanPrice = (plan: BillingV2Plan, cadence: BillingV2Cadence): PlanPrice => {
  const basePrice = plan.base?.[cadence] ?? 0;
  if (basePrice > 0) {
    return {
      amount: cadence === "annual" ? basePrice / 12 : basePrice,
      unit: "/ month",
      compactUnit: "/mo",
      isMonthlyEquivalent: true
    };
  }

  const dimension = plan.dims.find((candidate) => candidate[cadence] > 0);
  if (!dimension) {
    return { amount: 0, unit: "", compactUnit: "", isMonthlyEquivalent: false };
  }

  const isMetered =
    cadence === "annual" ? dimension.meteredAnnual === true : dimension.meteredMonthly === true;
  const isMonthlyEquivalent = cadence === "monthly" || !isMetered;
  const period = isMonthlyEquivalent ? "month" : "year";

  return {
    amount: cadence === "annual" && !isMetered ? dimension.annual / 12 : dimension[cadence],
    unit: `/ ${dimension.noun} / ${period}`,
    compactUnit: `/${dimension.noun}/${period === "month" ? "mo" : "yr"}`,
    isMonthlyEquivalent
  };
};

const annualSavingsPercent = (plan: BillingV2Plan) => {
  const monthly = getPlanPrice(plan, "monthly");
  const annual = getPlanPrice(plan, "annual");
  if (
    monthly.amount <= 0 ||
    annual.amount <= 0 ||
    !monthly.isMonthlyEquivalent ||
    !annual.isMonthlyEquivalent
  ) {
    return 0;
  }

  return Math.max(Math.round((1 - annual.amount / monthly.amount) * 100), 0);
};

const getEffectiveCadence = (plan: BillingV2Plan, cadence: BillingV2Cadence): BillingV2Cadence => {
  if (planSupportsCadence(plan, cadence)) {
    return cadence;
  }
  if (planSupportsCadence(plan, "annual")) {
    return "annual";
  }
  return "monthly";
};

const getPlanFeatures = (product: BillingV2CatalogProduct, plan: BillingV2Plan): PlanFeature[] => {
  const comparedFeatures = (product.compare ?? []).flatMap<PlanFeature>((row) => {
    const value = row.cells[plan.tier];
    if (value === false || value === undefined || value === 0) {
      return [];
    }
    if (value === true) {
      return [{ label: row.label }];
    }
    return [
      {
        label: row.label,
        value: typeof value === "number" ? value.toLocaleString("en-US") : String(value)
      }
    ];
  });

  if (comparedFeatures.length > 0) {
    return comparedFeatures;
  }

  return (product.includes ?? []).map((label) => ({ label }));
};

const formatProductName = (productKey: string) =>
  productKey
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

type ProductUpgradeHeaderProps = {
  product?: BillingV2CatalogProduct;
  productName: string;
  description: string;
};

const ProductUpgradeHeader = ({ product, productName, description }: ProductUpgradeHeaderProps) => (
  <DialogHeader className="flex-row items-start gap-3 pr-6">
    {product && (
      <div aria-hidden="true">
        <ProductIcon product={product} size={36} />
      </div>
    )}
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <DialogTitle>Upgrade {productName}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </div>
  </DialogHeader>
);

export const UpgradeGate = ({ intent, returnTarget, isOpen, onOpenChange, onGranted }: Props) => {
  const [selectedTier, setSelectedTier] = useState(intent.planKey);
  const [cadence, setCadence] = useState<BillingV2Cadence>("annual");
  const [view, setView] = useState<"plan" | "confirm">("plan");
  const [isMinimumPlanLoading, setIsMinimumPlanLoading] = useState(isOpen);
  const { currentOrg, isSubOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const billingOrgId = currentOrg.rootOrgId ?? currentOrg.id;
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  const canLoadBilling = isOpen && canManageBilling && !isSubOrganization;
  const overview = useGetBillingV2Overview(billingOrgId, { enabled: canLoadBilling });
  const catalog = useGetBillingV2Catalog(billingOrgId, { enabled: canLoadBilling });
  const startTrial = useStartBillingV2Trial();
  const product = catalog.data?.find((candidate) => candidate.id === intent.productKey);
  const productName = product?.name ?? formatProductName(intent.productKey);

  useLayoutEffect(() => {
    let isCurrent = true;

    if (!isOpen) {
      setIsMinimumPlanLoading(false);
      return undefined;
    }

    const startedAt = Date.now();
    setIsMinimumPlanLoading(true);
    waitForMinimumDuration(startedAt, MINIMUM_PLAN_LOADING_DURATION_MS)
      .then(() => {
        if (isCurrent) {
          setIsMinimumPlanLoading(false);
        }
      })
      .catch(() => undefined);

    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTier(intent.planKey);
      setCadence("annual");
      setView("plan");
    }
  }, [intent.planKey, isOpen]);

  if (!isOpen) {
    return null;
  }

  const returnPath = buildUpgradeReturnPath(intent, window.location, returnTarget);
  const openRootBilling = () => {
    const search = new URLSearchParams({
      upgradeProduct: intent.productKey,
      upgradeReturnPath: returnPath
    });
    window.location.assign(`/organizations/${billingOrgId}/billing?${search.toString()}`);
  };

  if (isSubOrganization) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-xl">
          <ProductUpgradeHeader
            product={product}
            productName={productName}
            description="Review product plans and manage access for your team."
          />
          <Alert variant="info">
            <CircleAlert />
            <AlertDescription>
              Sub-organizations share the root organization&apos;s subscription. Continue to root
              billing to start the trial or update the subscription.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="org" onClick={openRootBilling}>
              Continue to Root Billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!canManageBilling) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-xl">
          <ProductUpgradeHeader
            product={product}
            productName={productName}
            description="Review product plans and manage access for your team."
          />
          <Alert variant="info">
            <CircleAlert />
            <AlertDescription>
              Ask an organization member with billing management permission to start the trial or
              update the subscription.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="org" onClick={openRootBilling}>
              Continue to Billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (isMinimumPlanLoading || overview.isPending || catalog.isPending) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-3xl">
          <ProductUpgradeHeader
            product={product}
            productName={productName}
            description={`Loading plan details for ${productName}.`}
          />

          <div className="flex min-h-72 items-center justify-center p-5">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Loader size="sm" label="Loading plan details" />
              <span aria-hidden="true">Loading plan details</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (overview.isError || catalog.isError || !overview.data || !product) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-xl">
          <ProductUpgradeHeader
            product={product}
            productName={productName}
            description="Review product plans and manage access for your team."
          />
          <Alert variant="danger">
            <CircleAlert />
            <AlertDescription>
              Plan details could not be loaded. Try again, or contact Infisical if the problem
              continues.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="org"
              onClick={() => {
                overview.refetch();
                catalog.refetch();
              }}
            >
              Try Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const plans = [...product.plans]
    .filter((candidate) => !candidate.deprecated)
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  const requiredPlan = plans.find((candidate) => candidate.tier === intent.planKey);
  const plan =
    plans.find((candidate) => candidate.tier === selectedTier) ?? requiredPlan ?? plans[0];
  if (!plan || !requiredPlan) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-xl">
          <ProductUpgradeHeader
            product={product}
            productName={productName}
            description="Review product plans and manage access for your team."
          />
          <Alert variant="danger">
            <CircleAlert />
            <AlertDescription>This plan is not available for your organization.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const requiredPlanIndex = plans.findIndex((candidate) => candidate.tier === intent.planKey);
  const planMeetsRequirement = plans.indexOf(plan) >= requiredPlanIndex;
  const trialAvailable = planMeetsRequirement && plan.selfServe && plan.trialable;
  const hasTrialAvailable = plans.some((candidate) => {
    const candidateMeetsRequirement = plans.indexOf(candidate) >= requiredPlanIndex;
    return candidateMeetsRequirement && candidate.selfServe && candidate.trialable;
  });
  const selfServe =
    overview.data.mode !== "managed" && overview.data.selfServe && !overview.data.checkoutFrozen;
  const supportsAnnualCadence = plans.some((candidate) => planSupportsCadence(candidate, "annual"));
  const supportsMonthlyCadence = plans.some((candidate) =>
    planSupportsCadence(candidate, "monthly")
  );
  let visibleCadence: BillingV2Cadence = cadence;
  if (trialAvailable) {
    visibleCadence = "monthly";
  } else if (!planSupportsCadence(plan, cadence)) {
    visibleCadence = supportsAnnualCadence ? "annual" : "monthly";
  }
  const effectiveCadence = trialAvailable ? "monthly" : getEffectiveCadence(plan, visibleCadence);
  const price = getPlanPrice(plan, "monthly").amount;
  const comparePrice = getPlanPrice(plan, effectiveCadence);
  const features = getPlanFeatures(product, plan);
  const savingsPercent = Math.max(...plans.map(annualSavingsPercent));
  const trialDurationLabel = plan.trialDays === 14 ? "2-Week" : `${plan.trialDays}-Day`;
  const trialBadgeLabel = plan.trialDays > 0 ? `${trialDurationLabel} Trial` : "Free Trial";
  const currentEntitlement = overview.data.entitlements[intent.productKey];
  const isUpgradeTrial =
    Boolean(currentEntitlement?.entitled && currentEntitlement.planTier) &&
    currentEntitlement?.planTier !== plan.tier;
  const currentPlanName =
    plans.find((candidate) => candidate.tier === currentEntitlement?.planTier)?.name ??
    currentEntitlement?.planTier;
  let cadenceLabel = "Annual Billing";
  if (trialAvailable) {
    cadenceLabel = isUpgradeTrial
      ? "Existing Billing Continues During Trial"
      : "Monthly Billing After Trial";
  }
  let postTrialCharge = "Usage-Based";
  if (isUpgradeTrial) {
    postTrialCharge = "Charged the Difference";
  } else if (plan.base?.monthly) {
    postTrialCharge = `${fmtMoney(plan.base.monthly)} / month`;
  }
  let trialPriceLabel = "0 during trial";
  if (plan.trialDays === 14) {
    trialPriceLabel = "0 for 2 Weeks";
  } else if (plan.trialDays > 0) {
    trialPriceLabel = `0 for ${plan.trialDays} Days`;
  }
  if (isUpgradeTrial) {
    trialPriceLabel = `Trial Upgrade: ${trialPriceLabel}`;
  }
  const upgradeLabel = intent.upgradeLabel ?? `Upgrade ${product.name}`;
  const productStyle = { "--product-color": product.color } as CSSProperties;

  const handleStartTrial = async () => {
    try {
      const result = await startTrial.mutateAsync({
        orgId: billingOrgId,
        productId: product.id,
        plan: plan.tier,
        returnPath
      });

      if (result.outcome === "awaiting_card") {
        if (result.cardSetupUrl) {
          window.location.assign(result.cardSetupUrl);
          return;
        }
        createNotification({
          type: "error",
          text: "Failed to open secure card setup. Please try again."
        });
        return;
      }

      createNotification({ type: "success", text: `Your ${plan.name} trial has started.` });
      onOpenChange(false);
      onGranted();
    } catch {
      setView("confirm");
    }
  };

  if (view === "confirm" && trialAvailable && selfServe) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-2xl">
          <ProductUpgradeHeader
            product={product}
            productName={product.name}
            description={`Confirm your ${plan.name} trial before continuing.`}
          />
          <p className="text-sm text-muted">
            {isUpgradeTrial
              ? `Your ${trialDurationLabel.toLowerCase()} trial is free. You'll keep paying for ${currentPlanName} during the trial. After it ends, you'll move to ${plan.name} and be charged the difference. End the trial before then to stay on ${currentPlanName}.`
              : `Your ${trialDurationLabel.toLowerCase()} trial is free. A payment method is required. If you do not have one on file, secure card setup must finish before the trial starts. After the trial, billing continues monthly based on usage unless you cancel.`}
          </p>
          <div className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            <div className="flex items-center justify-between p-4">
              <span>{isUpgradeTrial ? "Trial Upgrade Charge" : "Due Today"}</span>
              <span>$0</span>
            </div>
            <div className="flex items-center justify-between p-4">
              <span>
                {isUpgradeTrial
                  ? `After Your Trial · Upgrade to ${plan.name}`
                  : "After Your Trial · Monthly Usage-Based Billing"}
              </span>
              <span>{postTrialCharge}</span>
            </div>
          </div>
          {isUpgradeTrial && (
            <div className="space-y-2 text-sm text-muted">
              <p className="font-medium text-foreground">{plan.name} Catalog Reference Prices</p>
              <p>
                These rates are not your upgrade charge. Your actual charge depends on your
                subscription and the remaining billing period.
              </p>
              {(["monthly", "annual"] as const)
                .filter((referenceCadence) => planSupportsCadence(plan, referenceCadence))
                .map((referenceCadence) => (
                  <div key={referenceCadence}>
                    <p>{referenceCadence === "annual" ? "Billed Annually" : "Billed Monthly"}</p>
                    <ul className="mt-1 space-y-1">
                      {plan.base && unitPrice(plan.base, referenceCadence) > 0 && (
                        <li>
                          Base Fee:{" "}
                          {fmtMoney(
                            unitPrice(plan.base, referenceCadence) /
                              (referenceCadence === "annual" ? 12 : 1),
                            6
                          )}{" "}
                          / month
                        </li>
                      )}
                      {plan.dims
                        .filter((dimension) => unitPrice(dimension, referenceCadence) > 0)
                        .map((dimension) => {
                          const perMonth =
                            referenceCadence === "annual" &&
                            !isMeteredCadence(dimension, referenceCadence);
                          return (
                            <li key={dimension.key}>
                              {dimension.label}:{" "}
                              {fmtMoney(
                                unitPrice(dimension, referenceCadence) / (perMonth ? 12 : 1),
                                6
                              )}{" "}
                              / {dimension.noun} /{" "}
                              {perMonth ? "month" : cadenceWord(referenceCadence)}
                              {dimension.included > 0 ? ` · ${dimension.included} included` : ""}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ))}
              {!planSupportsCadence(plan, "annual") && !planSupportsCadence(plan, "monthly") && (
                <p>Catalog reference prices are unavailable.</p>
              )}
            </div>
          )}
          {!isUpgradeTrial && plan.dims.some((dimension) => dimension.monthly > 0) && (
            <div className="text-sm text-muted">
              <p className="font-medium text-foreground">Monthly Usage Rates</p>
              <ul className="mt-2 space-y-1">
                {plan.dims
                  .filter((dimension) => dimension.monthly > 0)
                  .map((dimension) => (
                    <li key={dimension.key}>
                      {dimension.label}: {fmtMoney(dimension.monthly, 6)} / {dimension.noun} / month
                      {dimension.included > 0 ? ` · ${dimension.included} included` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              isDisabled={startTrial.isPending}
              onClick={() => setView("plan")}
            >
              <ArrowLeft /> Back
            </Button>
            <Button
              variant="org"
              isPending={startTrial.isPending}
              isDisabled={startTrial.isPending}
              onClick={handleStartTrial}
            >
              Start Free Trial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  let primaryAction = (
    <Button variant="org" onClick={openRootBilling}>
      View Billing Options
    </Button>
  );
  if (!planMeetsRequirement) {
    primaryAction = (
      <Button variant="org" isDisabled>
        Requires {requiredPlan?.name ?? intent.planKey}
      </Button>
    );
  } else if (!selfServe || plan.salesLed) {
    primaryAction = (
      <Button
        variant="org"
        onClick={() => window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer")}
      >
        Contact Sales
      </Button>
    );
  }

  let productTrialAction = (
    <Button
      variant="product"
      className="w-full justify-center"
      style={productStyle}
      onClick={openRootBilling}
    >
      View Billing Options
    </Button>
  );
  if (!planMeetsRequirement) {
    productTrialAction = (
      <Button variant="product" className="w-full justify-center" style={productStyle} isDisabled>
        Select {requiredPlan?.name ?? intent.planKey} or higher
      </Button>
    );
  } else if (plan.salesLed || !selfServe) {
    productTrialAction = (
      <Button
        variant="product"
        className="w-full justify-center"
        style={productStyle}
        onClick={() => window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer")}
      >
        Contact Sales
      </Button>
    );
  } else if (trialAvailable) {
    productTrialAction = (
      <Button
        variant="product"
        className="w-full justify-center"
        style={productStyle}
        onClick={() => setView("confirm")}
      >
        Start Free {plan.name} Trial
      </Button>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={hasTrialAvailable ? "gap-0 overflow-x-hidden p-0 sm:max-w-4xl" : "sm:max-w-2xl"}
      >
        {hasTrialAvailable && (
          <div className="grid min-h-[34rem] md:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.25fr)]">
            <aside
              className="product-color flex min-h-52 flex-col border-b border-(--product-color-resolved)/20 bg-(--product-color-resolved)/10 md:min-h-0 md:border-r md:border-b-0"
              style={productStyle}
            >
              <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
                <ProductIcon product={product} size={64} />
                <DialogHeader className="mt-6 items-center text-center">
                  <p className="text-xs font-medium tracking-wide text-(--product-color-resolved)">
                    {product.name}
                  </p>
                  <DialogTitle className="max-w-xs text-2xl leading-tight">
                    {upgradeLabel}
                  </DialogTitle>
                  <DialogDescription className="max-w-xs leading-relaxed">
                    Available with the {requiredPlan.name} plan and higher.
                  </DialogDescription>
                </DialogHeader>
              </div>
            </aside>

            <div className="flex min-w-0 flex-col gap-5 p-6 pb-0">
              <Tabs
                value={plan.tier}
                onValueChange={(value) => setSelectedTier(value as UpgradeIntent["planKey"])}
              >
                <TabsList className="w-full" aria-label={`${product.name} plans`}>
                  {plans.map((candidate) => (
                    <TabsTrigger key={candidate.tier} value={candidate.tier}>
                      {candidate.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <section aria-labelledby="upgrade-plan-features">
                <div>
                  <p
                    id="upgrade-plan-features"
                    className="text-xs font-medium tracking-wide text-muted"
                  >
                    Included with {plan.name}
                  </p>
                  {plan.feature && <p className="mt-1 text-sm text-muted">{plan.feature}</p>}
                </div>

                {features.length > 0 && (
                  <ul className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                    {features.map((feature) => (
                      <li
                        key={feature.label}
                        className="flex min-w-0 items-start gap-2 text-sm text-accent"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        <span className="min-w-0">
                          <span>{feature.label}</span>
                          {feature.value && (
                            <span className="ml-1 text-muted">· {feature.value}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <DialogFooter className="mt-auto flex-col items-stretch">
                {!plan.salesLed && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`upgrade-cadence-${product.id}`}
                        variant="org"
                        isChecked={visibleCadence === "annual"}
                        isDisabled={
                          trialAvailable || !supportsAnnualCadence || !supportsMonthlyCadence
                        }
                        onCheckedChange={(checked) =>
                          setCadence(checked === true ? "annual" : "monthly")
                        }
                      />
                      <Label htmlFor={`upgrade-cadence-${product.id}`}>{cadenceLabel}</Label>
                      {savingsPercent > 0 && !trialAvailable && visibleCadence === "annual" && (
                        <Badge variant="success">-{savingsPercent}%</Badge>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 text-sm tabular-nums">
                      {!(isUpgradeTrial && trialAvailable) &&
                        (comparePrice.amount > 0 ? (
                          <span
                            className={
                              trialAvailable
                                ? "text-muted line-through"
                                : "font-medium text-foreground"
                            }
                          >
                            {fmtMoney(comparePrice.amount, 6)}
                            {comparePrice.compactUnit}
                          </span>
                        ) : (
                          <span className="font-medium text-foreground">Usage-based</span>
                        ))}
                      {trialAvailable && (
                        <span className="font-medium text-foreground">{trialPriceLabel}</span>
                      )}
                    </div>
                  </div>
                )}
                {productTrialAction}
              </DialogFooter>
            </div>
          </div>
        )}
        {!hasTrialAvailable && (
          <>
            <ProductUpgradeHeader
              product={product}
              productName={product.name}
              description={
                product.tagline ?? "Review product plans and manage access for your team."
              }
            />

            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-foreground">{plan.name}</span>
                      {trialAvailable && <Badge variant="success">{trialBadgeLabel}</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{plan.feature}</p>
                  </div>
                  {price > 0 && (
                    <div className="text-right">
                      <span className="text-2xl font-medium text-foreground">
                        {fmtMoney(price)}
                      </span>
                      <span className="text-sm text-muted"> / month</span>
                    </div>
                  )}
                </div>

                {product.includes && product.includes.length > 0 && (
                  <div className="grid gap-x-5 gap-y-2 border-t border-border pt-4 sm:grid-cols-2">
                    {product.includes.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm text-accent">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!selfServe && (
              <Alert variant="info">
                <CircleAlert />
                <AlertDescription>
                  Contact your Infisical account manager to update this subscription.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {primaryAction}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
