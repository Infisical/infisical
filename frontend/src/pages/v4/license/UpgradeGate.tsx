import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Icon } from "@infisical/cipher/ui/icon";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";
import { TooltipText } from "@infisical/cipher/ui/tooltip";
import { useRouterState } from "@tanstack/react-router";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import type {
  CapabilityUpgradeAlternative,
  CapabilityUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  annualSavingsPercent,
  getEffectiveCadence,
  getPlanFeatures,
  getPlanPrice,
  planSupportsCadence
} from "@app/components/license/UpgradeGate/plan-catalog";
import {
  BillingPlan,
  buildUpgradeReturnPath,
  UpgradeFeature,
  type UpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { isInfisicalCloud } from "@app/helpers/platform";
import type {
  BillingCadence,
  BillingCatalogPlan,
  BillingCatalogProduct
} from "@app/hooks/api/billing/types";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { useOrgId, useOrgPermission } from "../access/permissions";
import { toast } from "../access/toast";
import { useV4Adapter, useV4Mode } from "../data/adapters";
import { orgHref } from "../links";
import { useResolveV4Href } from "../resolveV4Href";
import { CapabilityUpgradeGate } from "./CapabilityUpgradeGate";
import { ProductIcon } from "./product-icon";
import { ProductUpgradeDialog } from "./ProductUpgradeDialog";
import { ProductUpgradeSuccessDialog } from "./ProductUpgradeSuccessDialog";
import { focusUpgradeDialog } from "./UpgradeDialogLayout";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

type Props = {
  intent: UpgradeIntent;
  paywallKey: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialTier?: string;
  initialCadence?: BillingCadence;
};

type CapabilityProps = Omit<Props, "intent" | "initialTier" | "initialCadence"> & {
  intent: CapabilityUpgradeIntent;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  alternative?: CapabilityUpgradeAlternative;
};

const formatProductName = (productKey: string) =>
  productKey
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

const toSentenceCase = (title: string) => `${title.charAt(0)}${title.slice(1).toLowerCase()}`;

type NoticeDialogProps = {
  product?: BillingCatalogProduct;
  productName: string;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
  footer: ReactNode;
};

const ProductNoticeDialog = ({
  product,
  productName,
  onOpenChange,
  children,
  footer
}: NoticeDialogProps) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} onOpenAutoFocus={focusUpgradeDialog}>
      <DialogHeader>
        <div className="flex items-center gap-3">
          {product && (
            <span aria-hidden="true" className="flex shrink-0">
              <ProductIcon product={product} size={24} />
            </span>
          )}
          <DialogTitle>Upgrade {productName}</DialogTitle>
        </div>
      </DialogHeader>
      {children}
      <DialogFooter>{footer}</DialogFooter>
    </DialogContent>
  </Dialog>
);

const ProductUpgradeGate = ({
  intent,
  paywallKey,
  isOpen,
  onOpenChange,
  initialTier,
  initialCadence = "annual"
}: Props) => {
  const [selectedTier, setSelectedTier] = useState(initialTier);
  const [cadence, setCadence] = useState<BillingCadence>(initialCadence);
  const [startedTrial, setStartedTrial] = useState<BillingCatalogPlan | null>(null);
  const refreshedReturn = useRef<string>(undefined);
  const hasTrackedView = useRef(false);
  const orgId = useOrgId();
  const mode = useV4Mode();
  const resolve = useResolveV4Href();
  const billing = useV4Adapter("billing");
  const { data: currentOrg } = useV4Adapter("org").useOrganization(orgId);
  const { permission, isPending: isPermissionPending } = useOrgPermission();
  const { data: subscription } = billing.useSubscription(orgId);
  const refreshSubscription = billing.useRefreshSubscription();
  const licenseCopy = SELF_HOSTED_LICENSE_COPY[getSelfHostedLicenseState(subscription)];
  const rootOrgId = currentOrg?.rootOrgId;
  const isSubOrganization = Boolean(rootOrgId) && rootOrgId !== orgId;
  const billingOrgId = rootOrgId ?? orgId;
  const canReadBilling = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );
  const canLoadBilling = isOpen && Boolean(currentOrg) && canReadBilling && !isSubOrganization;
  const returnSearch = new URLSearchParams(window.location.search);
  const returnedFromBilling =
    returnSearch.get("card") === "setup_success" || returnSearch.get("checkout") === "success";
  const overview = billing.useOverview(billingOrgId, {
    enabled: canLoadBilling,
    ...(returnedFromBilling ? { staleTime: 0 } : {})
  });
  const catalog = billing.useCatalog(billingOrgId, { enabled: canLoadBilling });
  const startTrial = billing.useStartTrial();
  const product = catalog.data?.find((candidate) => candidate.id === intent.productKey);
  const productName = product?.name ?? formatProductName(intent.productKey);
  const checkingBillingReturn =
    returnedFromBilling &&
    ((overview.isFetching && !overview.isFetchedAfterMount) ||
      (catalog.isFetching && !catalog.isFetchedAfterMount));
  const paidPlans = [...(product?.plans ?? [])]
    .filter((candidate) => !candidate.deprecated)
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  const entitlement = overview.data?.entitlements[intent.productKey];
  const hasActiveTrial = Boolean(entitlement?.isTrialing || entitlement?.trialPlan);
  const activeTier =
    entitlement?.trialPlan ?? entitlement?.planTier ?? (entitlement?.entitled ? undefined : "free");
  const activePlanIndex = paidPlans.findIndex((candidate) => candidate.tier === activeTier);
  const honeyTokenQuota =
    intent.featureKey === UpgradeFeature.HoneyTokens ? intent.quota : undefined;
  const honeyTokenComparison = product?.compare?.find(
    (row) => row.label.trim().toLowerCase() === "honey tokens"
  );
  const higherQuotaPlans = honeyTokenQuota
    ? paidPlans.filter((candidate, index) => {
        if (activePlanIndex < 0 && activeTier !== "free") return false;
        if (index <= activePlanIndex) return false;
        if (!candidate.upgradeable && !candidate.trialable && !candidate.salesLed) return false;
        const allowance = honeyTokenComparison?.cells[candidate.tier];
        if (typeof allowance === "string" && allowance.trim().toLowerCase() === "unlimited") {
          return true;
        }
        const formattedAllowance =
          typeof allowance === "string"
            ? allowance.trim().match(/^(?:up to\s+)?(\d+|\d{1,3}(?:,\d{3})+)$/i)
            : undefined;
        const numericAllowance =
          typeof allowance === "number"
            ? allowance
            : Number(formattedAllowance?.[1].replaceAll(",", "") ?? NaN);
        return numericAllowance > Math.max(honeyTokenQuota.used, honeyTokenQuota.limit);
      })
    : [];
  const requiredTier = honeyTokenQuota ? higherQuotaPlans[0]?.tier : intent.planKey;
  const targetPlanIndex = paidPlans.findIndex((candidate) => candidate.tier === requiredTier);
  const returnedPlan =
    canLoadBilling &&
    returnedFromBilling &&
    (returnSearch.get("checkout") === "success" || hasActiveTrial) &&
    !checkingBillingReturn &&
    !overview.isError &&
    !catalog.isError &&
    !overview.isPlaceholderData &&
    !catalog.isPlaceholderData &&
    entitlement?.entitled &&
    (entitlement.status === "active" || entitlement.status === "trialing") &&
    targetPlanIndex >= 0 &&
    activePlanIndex >= targetPlanIndex
      ? paidPlans[activePlanIndex]
      : undefined;
  const returnedTier = returnedPlan?.tier;

  useEffect(() => {
    if (!returnedTier) return;
    const returnKey = `${orgId}:${returnedTier}`;
    if (refreshedReturn.current === returnKey) return;
    refreshedReturn.current = returnKey;

    // Sync the legacy product gate once after confirmed activation; do not poll or reopen actions.
    refreshSubscription(orgId).catch(() => undefined);
  }, [orgId, refreshSubscription, returnedTier]);
  const route = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "unknown"
  });

  const orgPlan = subscription?.slug ?? "free";

  const trackPaywallView = useCallback(() => {
    if (mode === "demo") return;
    analytics.captureForOrganization(AnalyticsEvent.PaywallViewed, orgId, {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: (requiredTier ?? intent.planKey) === BillingPlan.Enterprise,
      plan: orgPlan
    });
  }, [mode, orgId, paywallKey, intent.description, intent.planKey, route, requiredTier, orgPlan]);

  useEffect(() => {
    if (!isOpen) {
      hasTrackedView.current = false;
      return;
    }
    if (
      hasTrackedView.current ||
      (honeyTokenQuota && canLoadBilling && (overview.isPending || catalog.isPending))
    ) {
      return;
    }
    hasTrackedView.current = true;
    trackPaywallView();
  }, [
    isOpen,
    honeyTokenQuota,
    canLoadBilling,
    overview.isPending,
    catalog.isPending,
    trackPaywallView
  ]);

  const trackUpgradeClick = () => {
    if (mode === "demo") return;
    analytics.captureForOrganization(AnalyticsEvent.PaywallUpgradeClicked, orgId, {
      paywallKey,
      paywallText: intent.description,
      route,
      isEnterpriseFeature: (requiredTier ?? intent.planKey) === BillingPlan.Enterprise,
      plan: orgPlan
    });
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedTier(initialTier);
      setCadence(initialCadence);
      setStartedTrial(null);
    }
  }, [intent.planKey, isOpen, initialTier, initialCadence]);

  if (!isOpen) {
    return null;
  }

  const returnPath = buildUpgradeReturnPath(window.location);
  const openRootBilling = () => {
    trackUpgradeClick();
    const search = new URLSearchParams({
      upgradeProduct: intent.productKey,
      upgradeReturnPath: returnPath
    });
    window.location.assign(resolve(orgHref(billingOrgId, `/billing?${search.toString()}`)));
  };

  const isResolvingAccess = !currentOrg || isPermissionPending;

  if (!isResolvingAccess && isSubOrganization && canReadBilling) {
    return (
      <ProductNoticeDialog
        product={product}
        productName={productName}
        onOpenChange={onOpenChange}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={openRootBilling}>
              Continue to root billing
            </Button>
          </>
        }
      >
        <Alert tone="info" title="Root organization billing">
          Sub-organizations share the root organization&apos;s subscription. Continue to root
          billing to start the trial or update the subscription.
        </Alert>
      </ProductNoticeDialog>
    );
  }

  if (!isResolvingAccess && !canReadBilling) {
    return (
      <ProductNoticeDialog
        product={product}
        productName={productName}
        onOpenChange={onOpenChange}
        footer={
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        }
      >
        <Alert tone="info" title="Billing access required">
          Ask an organization member with billing access to review plans or update the subscription.
        </Alert>
      </ProductNoticeDialog>
    );
  }

  const successPlan = startedTrial ?? returnedPlan;
  if (product && successPlan) {
    return (
      <ProductUpgradeSuccessDialog
        product={product}
        plan={successPlan}
        isTrialing={Boolean(startedTrial || hasActiveTrial)}
        trialEndsAt={entitlement?.trialPlanEndsAt ?? entitlement?.trialEndsAt}
        onOpenChange={(open) => {
          if (!open && returnedFromBilling) {
            window.history.replaceState(
              window.history.state,
              "",
              buildUpgradeReturnPath(window.location)
            );
          }
          onOpenChange(open);
        }}
      />
    );
  }

  if (isResolvingAccess || overview.isPending || catalog.isPending || checkingBillingReturn) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !hasTrackedView.current) {
            hasTrackedView.current = true;
            trackPaywallView();
          }
          onOpenChange(open);
        }}
      >
        <DialogContent key="loading" aria-busy="true">
          <DialogHeader>
            <DialogTitle>Upgrade {productName}</DialogTitle>
          </DialogHeader>
          <div
            className="flex flex-col gap-6"
            aria-label={`Loading plan details for ${productName}`}
          >
            <Skeleton height={32} />
            <Skeleton lines={4} />
          </div>
          <DialogFooter>
            <Skeleton height={32} width="100%" />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (overview.isError || catalog.isError || !overview.data || !product) {
    const isSelfHosted = overview.data ? !overview.data.isCloud : !isInfisicalCloud();
    const retry = () => {
      overview.refetch();
      catalog.refetch();
    };
    return (
      <ProductNoticeDialog
        product={product}
        productName={productName}
        onOpenChange={onOpenChange}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {isSelfHosted ? (
              <>
                <Button variant="ghost" onClick={retry}>
                  Retry
                </Button>
                <Button variant="primary" asChild>
                  <a
                    href={CONTACT_SALES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={trackUpgradeClick}
                  >
                    Contact sales
                    <Icon name="external" />
                  </a>
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={retry}>
                Try again
              </Button>
            )}
          </>
        }
      >
        <Alert tone="bad" title="Plan details unavailable">
          Plan details could not be loaded.{" "}
          {isSelfHosted
            ? licenseCopy.detail
            : "Try again, or contact Infisical if the problem continues."}
        </Alert>
      </ProductNoticeDialog>
    );
  }

  if (returnedFromBilling) {
    const dismissBillingReturn = (open: boolean) => {
      if (!open) {
        window.history.replaceState(window.history.state, "", returnPath);
      }
      onOpenChange(open);
    };
    const isRefreshing = overview.isFetching || catalog.isFetching;

    return (
      <ProductNoticeDialog
        product={product}
        productName={productName}
        onOpenChange={dismissBillingReturn}
        footer={
          <>
            <Button variant="outline" onClick={() => dismissBillingReturn(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              loading={isRefreshing}
              onClick={() => {
                overview.refetch();
                catalog.refetch();
              }}
            >
              Refresh status
            </Button>
          </>
        }
      >
        <Alert tone="info" title="Check billing status">
          Your billing return has not confirmed access to {productName} yet. Refresh to check again,
          or close this dialog and return later.
        </Alert>
      </ProductNoticeDialog>
    );
  }

  const currentEntitlement = overview.data.entitlements[product.id];
  const currentPlanTier =
    currentEntitlement?.planTier ?? (currentEntitlement?.entitled === true ? undefined : "free");
  const baselinePlan =
    currentPlanTier === "free" && !product.baselinePlan?.deprecated
      ? product.baselinePlan
      : undefined;
  const plans = baselinePlan ? [baselinePlan, ...paidPlans] : paidPlans;
  const requiredPlan = plans.find((candidate) => candidate.tier === requiredTier);
  const plan =
    plans.find((candidate) => candidate.tier === selectedTier) ?? requiredPlan ?? plans[0];
  if (!plan || (honeyTokenQuota && !requiredPlan)) {
    return (
      <ProductNoticeDialog
        product={product}
        productName={productName}
        onOpenChange={onOpenChange}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={
                honeyTokenQuota
                  ? () => {
                      trackUpgradeClick();
                      window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
                    }
                  : openRootBilling
              }
            >
              {honeyTokenQuota ? "Contact sales" : "View billing options"}
            </Button>
          </>
        }
      >
        <Alert
          tone={honeyTokenQuota ? "info" : "bad"}
          title={honeyTokenQuota ? "Plan limit reached" : "Plan unavailable"}
        >
          {honeyTokenQuota
            ? `${intent.quotaNotice} Contact our team to discuss a higher honey token allowance.`
            : "This plan is not available for your organization."}
        </Alert>
      </ProductNoticeDialog>
    );
  }

  const requiredPlanIndex = plans.findIndex((candidate) => candidate.tier === requiredTier);
  const planMeetsRequirement =
    Boolean(requiredPlan) &&
    plans.indexOf(plan) >= requiredPlanIndex &&
    (!honeyTokenQuota || higherQuotaPlans.includes(plan));
  const selfServe = overview.data.mode !== "managed" && overview.data.selfServe;
  const { checkoutFrozen } = overview.data;
  const trialAvailable =
    canManageBilling &&
    !checkoutFrozen &&
    planMeetsRequirement &&
    selfServe &&
    plan.selfServe &&
    !plan.salesLed &&
    !overview.data.trialedProductKeys.includes(product.id) &&
    (!currentEntitlement?.entitled || plan.tier !== currentPlanTier) &&
    plan.trialable;
  const supportsAnnualCadence = plans.some((candidate) => planSupportsCadence(candidate, "annual"));
  const supportsMonthlyCadence = plans.some((candidate) =>
    planSupportsCadence(candidate, "monthly")
  );
  let visibleCadence = cadence;
  if (
    (cadence === "annual" && !supportsAnnualCadence) ||
    (cadence === "monthly" && !supportsMonthlyCadence)
  ) {
    visibleCadence = supportsAnnualCadence ? "annual" : "monthly";
  }
  const effectiveCadence = trialAvailable ? "monthly" : getEffectiveCadence(plan, visibleCadence);
  const comparePrice = getPlanPrice(plan, effectiveCadence);
  const formattedPrice = `$${comparePrice.amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: comparePrice.amount > 0 && comparePrice.amount < 0.01 ? 6 : 2
  })}`;
  const features = getPlanFeatures(product, plan);
  const savingsPercent = Math.max(...plans.map(annualSavingsPercent));
  const isUpgradeTrial =
    Boolean(currentEntitlement?.entitled && currentEntitlement.planTier) &&
    currentEntitlement?.planTier !== "free" &&
    currentEntitlement?.planTier !== plan.tier;
  const currentPlanName =
    plans.find((candidate) => candidate.tier === currentEntitlement?.planTier)?.name ??
    currentEntitlement?.planTier;
  const trialDurationLabel = plan.trialDays === 14 ? "2-week" : `${plan.trialDays}-day`;
  let trialPriceLabel = "Free during trial";
  if (plan.trialDays === 14) trialPriceLabel = "Free for 2 weeks";
  else if (plan.trialDays > 0) trialPriceLabel = `Free for ${plan.trialDays} days`;
  if (isUpgradeTrial) trialPriceLabel = `Trial upgrade: ${trialPriceLabel.toLowerCase()}`;
  const upgradeLabel = intent.upgradeLabel ?? `Unlock ${product.name}`;

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
        toast({ tone: "bad", title: "Failed to open secure card setup. Please try again." });
        return;
      }

      setStartedTrial(plan);
    } catch {
      // The trial mutation reports errors through the shared notification handler.
    }
  };

  let productUpgradeAction = (
    <Button variant="primary" className="w-full" onClick={openRootBilling}>
      View billing options
    </Button>
  );
  if (requiredPlan && !planMeetsRequirement) {
    productUpgradeAction = (
      <Button variant="primary" className="w-full" disabled>
        Select {requiredPlan?.name ?? intent.planKey} or higher
      </Button>
    );
  } else if (requiredPlan && canManageBilling && (plan.salesLed || !selfServe)) {
    productUpgradeAction = (
      <Button
        variant="primary"
        className="w-full"
        onClick={() => {
          trackUpgradeClick();
          window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
        }}
      >
        Contact sales
      </Button>
    );
  } else if (requiredPlan && canManageBilling && checkoutFrozen) {
    productUpgradeAction = (
      <Button variant="primary" className="w-full" disabled>
        Billing changes paused
      </Button>
    );
  } else if (trialAvailable) {
    productUpgradeAction = (
      <Button
        variant="primary"
        className="w-full"
        loading={startTrial.isPending}
        onClick={handleStartTrial}
      >
        Start free {plan.name} trial
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
    ? `Your ${trialDurationLabel} trial upgrade is free. You'll keep paying for ${currentPlanName} during the trial. After it ends, you'll move to ${plan.name} and be charged the difference. End the trial before then to stay on ${currentPlanName}. The displayed monthly rate is a catalog reference, not your actual upgrade charge.`
    : `Your ${trialDurationLabel} trial is free. A payment method is required. If you do not have one on file, secure card setup must finish before the trial starts. After the trial, billing continues monthly based on usage unless you cancel.`;

  let notice: ReactNode;
  if (!requiredPlan) {
    notice = (
      <Alert tone="info" title="Required plan unavailable">
        This feature&apos;s required plan is unavailable. Review available options in billing.
      </Alert>
    );
  } else if (!canManageBilling) {
    notice = (
      <Alert tone="info" title="Billing management required">
        You can compare plans. Ask a member with billing management permission to start a trial or
        update the subscription.
      </Alert>
    );
  } else if (checkoutFrozen && selfServe && !plan.salesLed) {
    notice = (
      <Alert tone="warn" title="Plan changes temporarily unavailable">
        Purchases and plan changes are unavailable right now. Your current subscription is
        unaffected; please check back shortly.
      </Alert>
    );
  } else if (overview.data.mode === "managed") {
    notice = (
      <Alert tone="info" title={toSentenceCase(licenseCopy.title)}>
        {licenseCopy.detail}
      </Alert>
    );
  } else if (!selfServe) {
    notice = (
      <Alert tone="info" title="Managed subscription">
        Contact your Infisical account manager to update this subscription.
      </Alert>
    );
  } else if (showUsedTrialNotice) {
    notice = (
      <Alert tone="info" title="Trial already used">
        Free trial for {product.name} has already been used.
      </Alert>
    );
  }

  const priceLabel =
    comparePrice.amount > 0 ? `${formattedPrice}${comparePrice.compactUnit}` : "Usage-based";

  return (
    <ProductUpgradeDialog
      product={product}
      upgradeLabel={upgradeLabel}
      requiredPlanName={requiredPlan?.name}
      plans={plans}
      selectedTier={plan.tier}
      currentPlanTier={currentPlanTier}
      onTierChange={setSelectedTier}
      onOpenChange={onOpenChange}
      features={features}
      notice={
        (intent.quotaNotice || notice) && (
          <div className="flex flex-col gap-3">
            {intent.quotaNotice && (
              <Alert tone="info" title="Plan limit reached">
                {intent.quotaNotice}
              </Alert>
            )}
            {notice}
          </div>
        )
      }
      footer={
        <>
          {plan.tier === product.baselinePlan?.tier && (
            <div className="flex items-center justify-between gap-3">
              <SmallText muted>Current plan</SmallText>
              <SmallText>Free</SmallText>
            </div>
          )}
          {!plan.salesLed &&
            plan.tier !== product.baselinePlan?.tier &&
            (trialAvailable ? (
              <div className="flex items-baseline justify-between gap-3 tabular-nums">
                <SmallText muted>
                  <s>{priceLabel}</s>
                </SmallText>
                <TooltipText key={plan.tier} content={trialBillingTerms}>
                  {trialPriceLabel}*
                </TooltipText>
              </div>
            ) : (
              <div
                className={`flex flex-wrap items-center gap-3 ${hasPeriodOption ? "justify-between" : "justify-center"}`}
              >
                {hasPeriodOption && (
                  <div className="flex items-center gap-2">
                    <Switch
                      label="Annual billing"
                      checked={visibleCadence === "annual"}
                      disabled={startTrial.isPending}
                      onChange={(checked) => setCadence(checked ? "annual" : "monthly")}
                    />
                    {visibleCadence === "annual" && savingsPercent > 0 && (
                      <Badge tone="ok" size="sm">
                        -{savingsPercent}%
                      </Badge>
                    )}
                  </div>
                )}
                <span className="tabular-nums">{priceLabel}</span>
              </div>
            ))}
          {productUpgradeAction}
        </>
      }
    />
  );
};

export const UpgradeGate = ({ intent, ...props }: Props | CapabilityProps) => {
  if ("scope" in intent) {
    return <CapabilityUpgradeGate {...props} intent={intent} />;
  }
  return <ProductUpgradeGate {...props} intent={intent} />;
};
