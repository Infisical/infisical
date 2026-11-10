import { useEffect, useRef, useState } from "react";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import {
  BillingProduct,
  getSafeUpgradeReturnPath,
  PamUpgradeIntent,
  SecretsManagementUpgradeIntent,
  type UpgradeIntent
} from "@app/components/license/UpgradeGate/upgrade-intents";
import { PageTitle } from "@app/components/PageTitle";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useDebounce } from "@app/hooks";
import type { BillingBreakdownScopeKind } from "@app/hooks/api/billing/types";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { toast } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { UpgradeGate } from "../../license";
import { catalogById } from "./billing-format";
import type { BillingRenderState } from "./billing-view-types";
import { Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { ALL_ORGS_VALUE } from "./components/RootOrgFilter";
import { useOfflineBilling } from "./useOfflineBilling";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

const ORG_PAGE_SIZE = 10;

const PRICING_TRIAL_INTENTS: Record<string, UpgradeIntent> = {
  [BillingProduct.SecretsManagement]: SecretsManagementUpgradeIntent,
  [BillingProduct.Pam]: PamUpgradeIntent
};

type BillingFlow = { type: "sheet"; prodId: string };

export const BillingPage = () => {
  const orgId = useOrgId();
  const billing = useV4Adapter("billing");
  const { permission, isPending: isPermissionPending } = useOrgPermission();
  const { data: subscription, isPending: isSubscriptionPending } = billing.useSubscription(orgId);
  const isOfflineLicense = getSelfHostedLicenseState(subscription) === "offline";
  const canReadBilling = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );
  const hasManageBillingPermission = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );

  const [breakdownScope, setBreakdownScope] = useState<BillingBreakdownScopeKind>("instance");
  const [selectedOrgId, setSelectedOrgId] = useState(orgId);
  const [lastOrgId, setLastOrgId] = useState(orgId);
  if (orgId !== lastOrgId) {
    setLastOrgId(orgId);
    setSelectedOrgId(orgId);
    setBreakdownScope("instance");
  }
  const [orgSearch, setOrgSearch] = useState("");
  const [debouncedOrgSearch] = useDebounce(orgSearch);
  const { data: orgPage, isFetching: isRootOrgsFetching } = billing.useOrganizations(orgId, {
    search: debouncedOrgSearch,
    limit: ORG_PAGE_SIZE
  });
  const isOrgSearchPending = isRootOrgsFetching || orgSearch !== debouncedOrgSearch;
  const rootOrgs = orgPage?.organizations ?? [];
  const { data: unsearchedOrgPage, isPending: isRootOrgCountPending } = billing.useOrganizations(
    orgId,
    { limit: ORG_PAGE_SIZE }
  );

  const onlineOverview = billing.useOverview(selectedOrgId, {
    enabled: !isSubscriptionPending && !isOfflineLicense
  });
  const { data: onlineCatalog = [] } = billing.useCatalog(selectedOrgId, {
    enabled: !isSubscriptionPending && !isOfflineLicense
  });
  const createPortalSession = billing.useCreatePortalSession();
  const addPaymentMethod = billing.useAddPaymentMethod();
  const confirmTrialPayment = billing.useConfirmTrialPayment();
  const refreshEntitlements = billing.useRefreshEntitlements();

  const rootOrgCount = unsearchedOrgPage?.totalCount ?? 0;
  const showOrgFilter = rootOrgCount > 1;

  const offlineBilling = useOfflineBilling({
    orgId: selectedOrgId,
    scope: showOrgFilter ? breakdownScope : "organization",
    enabled: isOfflineLicense && !isRootOrgCountPending && canReadBilling
  });
  const overview = isOfflineLicense ? offlineBilling.overview : onlineOverview.data;
  const isPending = isOfflineLicense ? offlineBilling.isPending : onlineOverview.isPending;
  const isPlaceholderData = !isOfflineLicense && onlineOverview.isPlaceholderData;
  const isError = isOfflineLicense ? offlineBilling.isError : onlineOverview.isError;
  const refetch = isOfflineLicense ? offlineBilling.refetch : onlineOverview.refetch;
  const catalog = isOfflineLicense ? offlineBilling.catalog : onlineCatalog;

  const [flow, setFlow] = useState<BillingFlow | null>(null);
  const openedUpgradeProduct = useRef(false);
  const [removeProdId, setRemoveProdId] = useState<string | null>(null);
  const [trialApproval, setTrialApproval] = useState<{ orgId: string; url: string } | null>(null);
  const trialApprovalUrl = trialApproval?.orgId === selectedOrgId ? trialApproval.url : null;
  const deepLinkSearch = new URLSearchParams(window.location.search);
  const upgradeProduct = deepLinkSearch.get("upgradeProduct");
  const upgradePlan = deepLinkSearch.get("upgradePlan");
  const upgradeCycle = deepLinkSearch.get("upgradeCycle");
  const upgradeReturnPath = getSafeUpgradeReturnPath(
    deepLinkSearch.get("upgradeReturnPath"),
    window.location.origin
  );

  const [pricingTrialIntent, setPricingTrialIntent] = useState(() =>
    upgradeProduct && upgradePlan ? (PRICING_TRIAL_INTENTS[upgradeProduct] ?? null) : null
  );

  useEffect(() => {
    if (flow || openedUpgradeProduct.current || !upgradeProduct || upgradePlan) {
      return;
    }
    if (!catalog.some((candidate) => candidate.id === upgradeProduct)) {
      return;
    }
    openedUpgradeProduct.current = true;
    setFlow({ type: "sheet", prodId: upgradeProduct });
  }, [catalog, flow, upgradeProduct, upgradePlan]);

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (!checkout) {
      return;
    }
    if (checkout === "success") {
      toast({ tone: "ok", title: "Subscription started. It may take a moment to appear here." });
      refreshEntitlements.mutate({ orgId: selectedOrgId });
    } else if (checkout === "canceled") {
      toast({ title: "Checkout was canceled." });
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // An instance admin can point the page at an organization they are not a member of; the server
  // grants them no billing bypass there, so every mutation would 403.
  const isViewingOtherOrg = selectedOrgId !== orgId;
  const canManageBilling = hasManageBillingPermission && !isViewingOtherOrg;

  const isReloading = isPlaceholderData && !isError;

  let subState: BillingRenderState = "loading";
  if (isError) {
    subState = "error";
  } else if (isPending || isRootOrgCountPending || isSubscriptionPending) {
    subState = "loading";
  } else if (overview) {
    subState = overview.subState;
  }

  const removeProd = removeProdId ? catalogById(catalog, removeProdId) : undefined;

  const clearUpgradeSearch = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("upgradeProduct");
    url.searchParams.delete("upgradeReturnPath");
    url.searchParams.delete("upgradePlan");
    url.searchParams.delete("upgradeCycle");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  };

  const close = () => {
    setFlow(null);
    if (openedUpgradeProduct.current) {
      clearUpgradeSearch();
      openedUpgradeProduct.current = false;
    }
  };

  const redirectToPortal = () => {
    createPortalSession.mutate(
      { orgId: selectedOrgId, returnPath: window.location.pathname },
      {
        onSuccess: (url) => {
          window.location.href = url;
        }
      }
    );
  };

  const onUpdatePayment = () => {
    addPaymentMethod.mutate(
      { orgId: selectedOrgId, returnPath: window.location.pathname },
      {
        onSuccess: (url) => {
          window.location.href = url;
        }
      }
    );
  };

  const onCompleteTrialPayment = () => {
    const orgIdAtRequest = selectedOrgId;
    confirmTrialPayment.mutate(
      { orgId: orgIdAtRequest, returnPath: window.location.pathname },
      {
        onSuccess: (result) => {
          if (result.outcome === "upgraded") {
            toast({
              tone: "ok",
              title: "Payment confirmed. It may take a moment for your plan to update here."
            });
            return;
          }
          if (result.outcome === "payment_action_required") {
            setTrialApproval({ orgId: orgIdAtRequest, url: result.redirectUrl });
            return;
          }
          window.location.href = result.redirectUrl;
        }
      }
    );
  };

  // One use per link, so another trial still awaiting payment gets a fresh one on the next click.
  const onOpenTrialApproval = () => {
    if (!trialApprovalUrl) {
      return;
    }
    window.open(trialApprovalUrl, "_blank", "noopener,noreferrer");
    setTrialApproval(null);
    const orgIdAtApproval = selectedOrgId;
    window.addEventListener("focus", () => refreshEntitlements.mutate({ orgId: orgIdAtApproval }), {
      once: true
    });
  };

  const onContact = () => {
    window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
  };

  const isCloud = billing.useIsCloud();
  const isManaged = overview ? overview.mode === "managed" : !isCloud;
  const pageDescription = isManaged
    ? SELF_HOSTED_LICENSE_COPY[getSelfHostedLicenseState(subscription)].pageDescription
    : "Manage your subscription, products and payment. Payment is handled securely through Stripe.";

  let body = (
    <Overview
      overview={overview}
      catalog={catalog}
      subState={subState}
      onManageSubscription={redirectToPortal}
      onUpgrade={(productId) => setFlow({ type: "sheet", prodId: productId })}
      onRemove={setRemoveProdId}
      rootOrgs={rootOrgs}
      rootOrgCount={orgPage?.totalCount ?? rootOrgCount}
      isRootOrgsLoading={isOrgSearchPending}
      isReloading={isReloading}
      selectedOrgId={breakdownScope === "instance" ? ALL_ORGS_VALUE : selectedOrgId}
      onSelectOrg={(nextId) => {
        if (nextId === ALL_ORGS_VALUE) {
          setBreakdownScope("instance");
          setSelectedOrgId(orgId);
          return;
        }
        setBreakdownScope("organization");
        setSelectedOrgId(nextId);
      }}
      breakdownOrgId={selectedOrgId}
      breakdownScope={showOrgFilter ? breakdownScope : "organization"}
      onSearchOrgs={setOrgSearch}
      showOrgFilter={showOrgFilter}
      onUpdatePayment={onUpdatePayment}
      onEditDetails={redirectToPortal}
      onContact={onContact}
      onCompleteTrialPayment={onCompleteTrialPayment}
      isCompletingTrialPayment={confirmTrialPayment.isPending}
      hasTrialApproval={Boolean(trialApprovalUrl)}
      onOpenTrialApproval={onOpenTrialApproval}
      onRetry={() => refetch()}
      canManageBilling={canManageBilling}
    />
  );
  if (isPermissionPending) body = <Loader size="page" label="Loading usage and billing" />;
  else if (!canReadBilling) body = <AccessRestricted requirement="read Billing" />;

  return (
    <TooltipProvider>
      <PageTitle title="Usage & Billing" />
      <Stack gap={24}>
        <PageHeader title="Usage & billing" description={pageDescription} />
        {body}
      </Stack>

      {flow && (
        <ProductSheet
          orgId={selectedOrgId}
          prod={catalogById(catalog, flow.prodId)}
          entitlement={overview?.entitlements[flow.prodId]}
          hasActiveSubscription={overview?.subState === "active"}
          returnPath={upgradeReturnPath ?? window.location.pathname}
          renewsOn={overview?.entitlements[flow.prodId]?.renewsOn ?? null}
          selfServe={overview?.selfServe ?? true}
          onClose={close}
          onEntitlementChanged={() => {
            if (upgradeReturnPath) {
              window.location.assign(upgradeReturnPath);
            }
          }}
          onRemove={setRemoveProdId}
          onContact={() => {
            close();
            onContact();
          }}
        />
      )}

      {removeProd && (
        <RemoveProductModal
          orgId={selectedOrgId}
          product={removeProd}
          onClose={() => setRemoveProdId(null)}
          onRemoved={() => {
            setRemoveProdId(null);
            close();
          }}
        />
      )}

      {pricingTrialIntent && (
        <UpgradeGate
          intent={pricingTrialIntent}
          paywallKey="pricing-page-trial"
          initialTier={upgradePlan ?? undefined}
          initialCadence={upgradeCycle === "monthly" ? "monthly" : "annual"}
          isOpen
          onOpenChange={(isOpen) => {
            if (isOpen) return;
            setPricingTrialIntent(null);
            clearUpgradeSearch();
          }}
        />
      )}
    </TooltipProvider>
  );
};
