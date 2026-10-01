import { CSSProperties, useEffect, useLayoutEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

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
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  Label,
  Loader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
import { analytics, AnalyticsEvent } from "@app/lib/analytics";
import { waitForMinimumDuration } from "@app/lib/fn/promise";
import { fmtMoney } from "@app/pages/organization/BillingV2Page/billing-v2-format";
import { ProductIcon } from "@app/pages/organization/BillingV2Page/components/shared";

import { CapabilityUpgradeGate } from "./CapabilityUpgradeGate";
import { CapabilityUpgradeIntent } from "./capability-upgrade-intents";
import { focusUpgradeContinuation, PlanFeature, ProductUpgradeDialog } from "./ProductUpgradeDialog";
import {
  BillingPlan,
  buildUpgradeReturnPath,
  UpgradeIntent,
  UpgradeReturnTarget
} from "./upgrade-intents";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";
const MINIMUM_PLAN_LOADING_DURATION_MS = 800;

type Props = {
  intent: UpgradeIntent;
  returnTarget?: UpgradeReturnTarget;
  paywallKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onGranted: () => void;
};

type CapabilityProps = Omit<Props, "intent" | "onGranted"> & {
  intent: CapabilityUpgradeIntent;
};

type PlanPrice = {
  amount: number;
  unit: string;
  compactUnit: string;
  isMonthlyEquivalent: boolean;
};

const PLAN_FEATURE_DESCRIPTIONS: Record<string, string> = {
  environments: "Organize secrets across development stages and deployment targets.",
  integrations: "Connect Infisical with infrastructure, cloud, and developer tools.",
  "audit log retention": "Keep organization activity history available for longer.",
  "honey tokens": "Detect unauthorized access with decoy secrets.",
  "secret versioning": "Track and restore previous versions of secrets.",
  "point-in-time recovery": "Restore secrets to an earlier state after unwanted changes.",
  rbac: "Control access with custom roles and granular permissions.",
  "dynamic secrets": "Issue short-lived credentials on demand.",
  "temporary access": "Grant time-bound access without permanent permissions.",
  gateways: "Connect Infisical securely to private infrastructure.",
  "sso/mfa enforcement": "Require centralized sign-in and stronger authentication.",
  scim: "Provision and deprovision users from your identity provider.",
  kmip: "Manage cryptographic keys through KMIP-compatible systems.",
  "audit log streaming": "Send audit activity to external monitoring systems.",
  "sub-organizations": "Separate teams or environments under one organization.",
  "certificate authorities": "Connect or operate certificate authorities from one control plane.",
  "internal certificate authorities": "Operate Infisical-managed root and intermediate authorities.",
  certificates: "Issue, renew, and centrally manage certificates.",
  "wildcard certificates": "Issue certificates that secure multiple subdomains.",
  "subject alternative names": "Secure additional hostnames and identities on one certificate.",
  "certificate enrollment": "Enroll workloads and devices through standard certificate protocols.",
  "certificate syncs": "Deliver certificates automatically to infrastructure and cloud providers.",
  "certificate discovery": "Find and inventory certificates across your infrastructure.",
  "code signing": "Protect software releases with centrally managed signing keys.",
  "approval policies": "Require review before sensitive certificate operations proceed.",
  "post-quantum cryptography": "Issue certificates with post-quantum key algorithms.",
  "pam accounts": "Manage privileged accounts and their credentials centrally.",
  "enterprise pam accounts": "Connect enterprise account types such as Windows and Active Directory.",
  "slack notifications": "Notify teams when privileged access is requested or changed."
};

const PAM_FEATURE_DESCRIPTIONS: Record<string, string> = {
  "privileged accounts": "Manage privileged accounts and their credentials centrally.",
  "access requests": "Request access to privileged accounts before starting a session.",
  "approval workflows": "Require approval before privileged access is granted.",
  "cli-based resource access": "Connect to privileged resources from the Infisical CLI.",
  "ssh certificate authentication": "Authenticate SSH sessions with short-lived certificates.",
  "privileged credential rotation": "Rotate privileged credentials without distributing them to users.",
  "command blocking": "Block restricted commands during privileged sessions.",
  "automated privileged account discovery": "Find privileged accounts across your infrastructure.",
  "enterprise resources (windows, rdp)": "Connect to Windows servers and other enterprise resources.",
  "audit logs": "Track privileged access requests and session activity.",
  "session recording": "Record privileged sessions for review and investigation.",
  "session-log masking": "Mask sensitive information in session logs.",
  "log & session recording retention": "Keep audit logs and session recordings available for review.",
  "siem audit-log streaming": "Send audit activity to your security monitoring systems.",
  ldap: "Connect your directory for centralized identity management."
};

const getPlanFeatureDescription = (label: string, productKey: string) => {
  const key = label.trim().toLowerCase();
  return (
    (productKey === "pam" ? PAM_FEATURE_DESCRIPTIONS[key] : undefined) ??
    PLAN_FEATURE_DESCRIPTIONS[key]
  );
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
  const noun = dimension.key === "pam_identities" ? "PAM identity" : dimension.noun;

  return {
    amount: cadence === "annual" && !isMetered ? dimension.annual / 12 : dimension[cadence],
    unit: `/ ${noun} / ${period}`,
    compactUnit: `/${noun}/${period === "month" ? "mo" : "yr"}`,
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
      return [{ label: row.label, description: getPlanFeatureDescription(row.label, product.id) }];
    }
    return [
      {
        label: row.label,
        value: typeof value === "number" ? value.toLocaleString("en-US") : String(value),
        description: getPlanFeatureDescription(row.label, product.id)
      }
    ];
  });

  if (comparedFeatures.length > 0) {
    return comparedFeatures;
  }

  return (product.includes ?? []).map((label) => ({
    label,
    description: getPlanFeatureDescription(label, product.id)
  }));
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

export const UpgradeGate = (props: Props | CapabilityProps) => {
  if ("scope" in props.intent) {
    return <CapabilityUpgradeGate {...props} intent={props.intent} />;
  }

  return <ProductUpgradeGate {...(props as Props)} />;
};

const ProductUpgradeGate = ({
  intent,
  returnTarget,
  paywallKey,
  isOpen,
  onOpenChange,
  onGranted
}: Props) => {
  const [selectedTier, setSelectedTier] = useState(intent.planKey);
  const [cadence, setCadence] = useState<BillingV2Cadence>("annual");
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
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "unknown"
  });

  useEffect(() => {
    if (!isOpen) return;

    analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, currentOrg.id, {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: intent.planKey === BillingPlan.Enterprise
    });
    // A paywall view is one closed-to-open transition, not a new event when its data resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const trackUpgradeClick = () => {
    analytics.captureForOrganization(AnalyticsEvent.PaywallUpgradeClicked, currentOrg.id, {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: intent.planKey === BillingPlan.Enterprise
    });
  };

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
    }
  }, [intent.planKey, isOpen]);

  if (!isOpen) {
    return null;
  }

  const returnPath = buildUpgradeReturnPath(intent, window.location, returnTarget);
  const openRootBilling = () => {
    trackUpgradeClick();
    const search = new URLSearchParams({
      upgradeProduct: intent.productKey,
      upgradeReturnPath: returnPath
    });
    window.location.assign(`/organizations/${billingOrgId}/billing?${search.toString()}`);
  };

  if (isSubOrganization) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          onOpenAutoFocus={focusUpgradeContinuation}
          showCloseButton={false}
          className="sm:max-w-xl"
        >
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
            <Button data-upgrade-cta variant="org" onClick={openRootBilling}>
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
        <DialogContent
          onOpenAutoFocus={focusUpgradeContinuation}
          showCloseButton={false}
          className="sm:max-w-xl"
        >
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
            <Button data-upgrade-cta variant="org" onClick={openRootBilling}>
              Continue to Billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (isMinimumPlanLoading || overview.isPending || catalog.isPending) {
    return (
      <Dialog open>
        <DialogPortal>
          <DialogOverlay />
          <div className="pointer-events-none fixed inset-0 z-[var(--z-index-modal)] flex items-center justify-center">
            <Loader size="md" label={`Loading plan details for ${productName}`} />
          </div>
        </DialogPortal>
      </Dialog>
    );
  }

  if (overview.isError || catalog.isError || !overview.data || !product) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent
          onOpenAutoFocus={focusUpgradeContinuation}
          showCloseButton={false}
          className="sm:max-w-xl"
        >
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
              data-upgrade-cta
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

  const paidPlans = [...product.plans]
    .filter((candidate) => !candidate.deprecated)
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  const currentEntitlement = overview.data.entitlements[product.id];
  const currentPlanTier =
    currentEntitlement?.planTier ?? (currentEntitlement?.entitled === true ? undefined : "free");
  const baselinePlan =
    currentPlanTier === "free" && !product.baselinePlan?.deprecated
      ? product.baselinePlan
      : undefined;
  const plans = baselinePlan ? [baselinePlan, ...paidPlans] : paidPlans;
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
  const selfServe =
    overview.data.mode !== "managed" && overview.data.selfServe && !overview.data.checkoutFrozen;
  const trialAvailable =
    planMeetsRequirement && selfServe && plan.selfServe && !plan.salesLed && plan.trialable;
  const supportsAnnualCadence = plans.some((candidate) => planSupportsCadence(candidate, "annual"));
  const supportsMonthlyCadence = plans.some((candidate) =>
    planSupportsCadence(candidate, "monthly")
  );
  const visibleCadence =
    (cadence === "annual" && supportsAnnualCadence) ||
    (cadence === "monthly" && supportsMonthlyCadence)
      ? cadence
      : supportsAnnualCadence
        ? "annual"
        : "monthly";
  const effectiveCadence = trialAvailable ? "monthly" : getEffectiveCadence(plan, visibleCadence);
  const comparePrice = getPlanPrice(plan, effectiveCadence);
  const features = getPlanFeatures(product, plan);
  const savingsPercent = Math.max(...plans.map(annualSavingsPercent));
  const isUpgradeTrial =
    Boolean(currentEntitlement?.entitled && currentEntitlement.planTier) &&
    currentEntitlement?.planTier !== "free" &&
    currentEntitlement?.planTier !== plan.tier;
  const currentPlanName =
    plans.find((candidate) => candidate.tier === currentEntitlement?.planTier)?.name ??
    currentEntitlement?.planTier;
  const trialDurationLabel = plan.trialDays === 14 ? "2-Week" : `${plan.trialDays}-Day`;
  let trialPriceLabel =
    plan.trialDays === 14
      ? "FREE for 2 Weeks"
      : plan.trialDays > 0
        ? `FREE for ${plan.trialDays} Days`
        : "FREE during trial";
  if (isUpgradeTrial) trialPriceLabel = `Trial Upgrade: ${trialPriceLabel}`;
  const upgradeLabel = intent.upgradeLabel ?? `Unlock ${product.name}`;
  const productStyle = { "--product-color": product.color } as CSSProperties;

  const handleStartTrial = async () => {
    trackUpgradeClick();
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
      return;
    }
  };

  let productUpgradeAction = (
    <Button
      data-upgrade-cta
      variant="product"
      className="w-full justify-center"
      style={productStyle}
      onClick={openRootBilling}
    >
      View Billing Options
    </Button>
  );
  if (!planMeetsRequirement) {
    productUpgradeAction = (
      <Button
        data-upgrade-cta
        variant="product"
        className="w-full justify-center"
        style={productStyle}
        isDisabled
      >
        Select {requiredPlan?.name ?? intent.planKey} or higher
      </Button>
    );
  } else if (plan.salesLed || !selfServe) {
    productUpgradeAction = (
      <Button
        data-upgrade-cta
        variant="product"
        className="w-full justify-center"
        style={productStyle}
        onClick={() => {
          trackUpgradeClick();
          window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
        }}
      >
        Contact Sales
      </Button>
    );
  } else if (trialAvailable) {
    productUpgradeAction = (
      <Button
        data-upgrade-cta
        variant="product"
        className="w-full justify-center"
        style={productStyle}
        isPending={startTrial.isPending}
        isDisabled={startTrial.isPending}
        onClick={handleStartTrial}
      >
        Start Free {plan.name} Trial
      </Button>
    );
  }

  const hasUsedTrial = overview.data.trialedProductKeys.includes(product.id);
  const hasPeriodOption =
    !trialAvailable && planSupportsCadence(plan, "annual") && planSupportsCadence(plan, "monthly");
  const showUsedTrialNotice =
    selfServe &&
    plan.selfServe &&
    !plan.salesLed &&
    planMeetsRequirement &&
    !trialAvailable &&
    hasUsedTrial &&
    !currentEntitlement?.isTrialing;

  const trialBillingTerms = isUpgradeTrial
    ? `Your ${trialDurationLabel.toLowerCase()} trial upgrade is free. You'll keep paying for ${currentPlanName} during the trial. After it ends, you'll move to ${plan.name} and be charged the difference. End the trial before then to stay on ${currentPlanName}. The displayed monthly rate is a catalog reference, not your actual upgrade charge.`
    : `Your ${trialDurationLabel.toLowerCase()} trial is free. A payment method is required. If you do not have one on file, secure card setup must finish before the trial starts. After the trial, billing continues monthly based on usage unless you cancel.`;

  return (
    <ProductUpgradeDialog
      product={product}
      upgradeLabel={upgradeLabel}
      requiredPlanName={requiredPlan.name}
      plans={plans}
      selectedTier={plan.tier}
      currentPlanTier={currentPlanTier}
      onTierChange={setSelectedTier}
      onOpenChange={onOpenChange}
      features={features}
      notice={
        !selfServe ? (
          <Alert variant="info" appearance="borderless">
            <CircleAlert />
            <AlertDescription>
              Contact your Infisical account manager to update this subscription.
            </AlertDescription>
          </Alert>
        ) : showUsedTrialNotice ? (
          <Alert variant="info" appearance="borderless">
            <CircleAlert />
            <AlertDescription>
              Free trial for {product.name} has already been used.
            </AlertDescription>
          </Alert>
        ) : undefined
      }
      footer={
        <>
          {plan.tier === product.baselinePlan?.tier && (
            <div className="flex items-center justify-center gap-3 px-1 text-sm">
              <span className="text-muted">Current plan</span>
              <span className="text-foreground font-medium">FREE</span>
            </div>
          )}
          {!plan.salesLed &&
            plan.tier !== product.baselinePlan?.tier &&
            (trialAvailable ? (
              <Tooltip key={plan.tier}>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="flex w-full items-baseline justify-between gap-3 rounded-sm px-1 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-muted line-through">
                      {comparePrice.amount > 0
                        ? `${fmtMoney(comparePrice.amount, 6)}${comparePrice.compactUnit}`
                        : "Usage-based"}
                    </span>
                    <span className="text-foreground font-medium">{trialPriceLabel}*</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="w-96 max-w-(--radix-tooltip-content-available-width) leading-relaxed"
                >
                  {trialBillingTerms}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div
                className={`flex flex-wrap items-center gap-3 px-1 ${hasPeriodOption ? "justify-between" : "justify-center"}`}
              >
                {hasPeriodOption ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`upgrade-cadence-${product.id}`}
                      variant="org"
                      isChecked={visibleCadence === "annual"}
                      isDisabled={startTrial.isPending}
                      onCheckedChange={(checked) =>
                        setCadence(checked === true ? "annual" : "monthly")
                      }
                    />
                    <Label htmlFor={`upgrade-cadence-${product.id}`}>Annual Billing</Label>
                    {visibleCadence === "annual" && savingsPercent > 0 && (
                      <Badge variant="success" className="min-h-4 px-1 py-0 text-[10px]">
                        -{savingsPercent}%
                      </Badge>
                    )}
                  </div>
                ) : null}
                <div
                  className={`flex items-baseline gap-2 text-sm tabular-nums ${hasPeriodOption ? "ml-auto" : ""}`}
                >
                  {comparePrice.amount > 0 ? (
                    <span className="text-foreground font-medium">
                      {fmtMoney(comparePrice.amount, 6)}
                      {comparePrice.compactUnit}
                    </span>
                  ) : (
                    <span className="text-foreground font-medium">Usage-based</span>
                  )}
                </div>
              </div>
            ))}
          {productUpgradeAction}
        </>
      }
    />
  );
};
