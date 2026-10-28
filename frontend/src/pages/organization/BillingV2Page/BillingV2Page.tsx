import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import { getSafeUpgradeReturnPath } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useDebounce } from "@app/hooks";
import {
  BillingV2BreakdownScopeKind,
  useAddBillingV2PaymentMethod,
  useConfirmBillingV2TrialPayment,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Organizations,
  useGetBillingV2Overview,
  useRefreshBillingV2Entitlements
} from "@app/hooks/api";

import { Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { ALL_ORGS_VALUE } from "./components/RootOrgFilter";
import { UsageBreakdownSheet } from "./components/UsageBreakdownSheet";
import { catalogById } from "./billing-v2-format";
import { BillingV2RenderState } from "./billing-v2-view-types";
import { useOfflineBilling } from "./useOfflineBilling";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

// One popup's worth of organizations. The rest are reached by searching, which the picker's footer says.
const ORG_PAGE_SIZE = 10;

// `view` optionally opens the product sheet straight into a sub-view (e.g. the set-commitment flow
// from the "commit and save" nudge) instead of the default plans view.
type BillingV2Flow =
  | { type: "sheet"; prodId: string; view?: "commitment"; trialTier?: string }
  | { type: "breakdown"; prodId: string; dimensionKey?: string };

export const BillingV2Page = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { subscription } = useSubscription();
  const orgId = currentOrg?.id ?? "";
  const isOfflineLicense = getSelfHostedLicenseState(subscription) === "offline";
  const hasManageBillingPermission = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );

  const [breakdownScope, setBreakdownScope] = useState<BillingV2BreakdownScopeKind>("instance");
  const [selectedOrgId, setSelectedOrgId] = useState(orgId);
  const [lastOrgId, setLastOrgId] = useState(orgId);
  if (orgId !== lastOrgId) {
    setLastOrgId(orgId);
    setSelectedOrgId(orgId);
    setBreakdownScope("instance");
  }
  // The picker searches server-side: the instance's root organizations are listed a page at a time,
  // so an organization past the page is reachable only by name. Short enough that the popup does not
  // scroll, since the answer to a long list here is to search it, not to wade through it.
  const [orgSearch, setOrgSearch] = useState("");
  const [debouncedOrgSearch] = useDebounce(orgSearch);
  const { data: orgPage, isFetching: isRootOrgsFetching } = useGetBillingV2Organizations(orgId, {
    search: debouncedOrgSearch,
    limit: ORG_PAGE_SIZE
  });
  const isOrgSearchPending = isRootOrgsFetching || orgSearch !== debouncedOrgSearch;
  const rootOrgs = orgPage?.organizations ?? [];
  const { data: unsearchedOrgPage, isPending: isRootOrgCountPending } =
    useGetBillingV2Organizations(orgId, { limit: ORG_PAGE_SIZE });

  const onlineOverview = useGetBillingV2Overview(selectedOrgId, { enabled: !isOfflineLicense });
  const { data: onlineCatalog = [], isPending: isOnlineCatalogPending } = useGetBillingV2Catalog(
    selectedOrgId,
    { enabled: !isOfflineLicense }
  );
  const createPortalSession = useCreateBillingV2PortalSession();
  const addPaymentMethod = useAddBillingV2PaymentMethod();
  const confirmTrialPayment = useConfirmBillingV2TrialPayment();
  const refreshEntitlements = useRefreshBillingV2Entitlements();

  // More than one organization means the server decided this caller may switch: an instance admin on
  // self-hosted, where one licence spans every org on the box. Cloud is bounded to the logged-in root
  // org and always counts one, so this needs no isCloud test, and not reading the overview keeps the
  // picker on screen while that request is loading or failing.
  const rootOrgCount = unsearchedOrgPage?.totalCount ?? 0;
  const showOrgFilter = rootOrgCount > 1;

  const offlineBilling = useOfflineBilling({
    orgId: selectedOrgId,
    scope: showOrgFilter ? breakdownScope : "organization",
    enabled:
      isOfflineLicense &&
      !isRootOrgCountPending &&
      permission.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing)
  });
  const overview = isOfflineLicense ? offlineBilling.overview : onlineOverview.data;
  const isPending = isOfflineLicense ? offlineBilling.isPending : onlineOverview.isPending;
  const isPlaceholderData = !isOfflineLicense && onlineOverview.isPlaceholderData;
  const isError = isOfflineLicense ? offlineBilling.isError : onlineOverview.isError;
  const refetch = isOfflineLicense ? offlineBilling.refetch : onlineOverview.refetch;
  const catalog = isOfflineLicense ? offlineBilling.catalog : onlineCatalog;
  const isCatalogPending = !isOfflineLicense && isOnlineCatalogPending;

  const [flow, setFlow] = useState<BillingV2Flow | null>(null);
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

  useEffect(() => {
    if (flow || openedUpgradeProduct.current || !upgradeProduct) {
      return;
    }
    const product = catalog.find((candidate) => candidate.id === upgradeProduct);
    const hasProduct = Boolean(product);
    if (upgradePlan) {
      if (isCatalogPending || (hasProduct && !overview && !isError)) return;
      const trialPlan = product?.plans.find((plan) => plan.tier === upgradePlan);
      const canTrial =
        !isError &&
        hasManageBillingPermission &&
        Boolean(overview?.selfServe) &&
        Boolean(trialPlan?.selfServe && trialPlan.trialable);
      if (!canTrial) {
        if (upgradeReturnPath) window.location.replace(upgradeReturnPath);
        return;
      }
    } else if (!hasProduct) {
      return;
    }
    openedUpgradeProduct.current = true;
    setFlow({ type: "sheet", prodId: upgradeProduct, trialTier: upgradePlan ?? undefined });
  }, [
    catalog,
    flow,
    upgradeProduct,
    upgradePlan,
    isCatalogPending,
    overview,
    isError,
    hasManageBillingPermission
  ]);

  // Stripe redirects back with ?checkout=success|canceled; surface the outcome and refresh state.
  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (!checkout) {
      return;
    }
    if (checkout === "success") {
      createNotification({
        type: "success",
        text: "Subscription started. It may take a moment to appear here."
      });
      refreshEntitlements.mutate({ orgId: selectedOrgId });
    } else if (checkout === "canceled") {
      createNotification({ type: "info", text: "Checkout was canceled." });
    }
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An instance admin can point the page at an organization they are not a member of, which the
  // permission above says nothing about; ensureManageBilling grants them no bypass, so every mutation
  // would 403.
  const isViewingOtherOrg = selectedOrgId !== orgId;
  const canManageBilling = hasManageBillingPermission && !isViewingOtherOrg;

  const isReloading = isPlaceholderData && !isError;

  let subState: BillingV2RenderState = "loading";
  if (isError) {
    subState = "error";
  } else if (isPending || isRootOrgCountPending) {
    subState = "loading";
  } else if (overview) {
    subState = overview.subState;
  }

  const removeProd = removeProdId ? catalogById(catalog, removeProdId) : undefined;

  const close = () => {
    setFlow(null);
    if (flow?.type === "sheet" && flow.trialTier && upgradeReturnPath) {
      window.location.assign(upgradeReturnPath);
      return;
    }
    if (openedUpgradeProduct.current) {
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
      openedUpgradeProduct.current = false;
    }
  };

  const redirectToPortal = () => {
    createPortalSession.mutate(
      {
        orgId: selectedOrgId,
        returnPath: window.location.pathname
      },
      {
        onSuccess: (url) => {
          window.location.href = url;
        }
      }
    );
  };

  const onManageSubscription = () => {
    redirectToPortal();
  };

  // Opening a product (Manage or Activate) shows its sheet; activation, commitment changes, and trials
  // are all handled inside the sheet against its own mutations.
  const onUpgrade = (productId: string) => {
    setFlow({ type: "sheet", prodId: productId });
  };

  // Open the sheet directly into the set-commitment flow (from the "commit and save" nudge).
  const onSetCommitment = (productId: string) => {
    setFlow({ type: "sheet", prodId: productId, view: "commitment" });
  };

  const onViewBreakdown = (productId: string, dimensionKey?: string) => {
    setFlow({ type: "breakdown", prodId: productId, dimensionKey });
  };

  const hasActiveSubscription = overview?.subState === "active";

  const onUpdatePayment = () => {
    addPaymentMethod.mutate(
      {
        orgId: selectedOrgId,
        returnPath: window.location.pathname
      },
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
      {
        orgId: orgIdAtRequest,
        returnPath: window.location.pathname
      },
      {
        onSuccess: (result) => {
          if (result.outcome === "upgraded") {
            createNotification({
              type: "success",
              text: "Payment confirmed. It may take a moment for your plan to update here."
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

  // Billing name/email and address are edited in the Stripe billing portal.
  const onEditDetails = () => {
    redirectToPortal();
  };

  const onContact = () => {
    window.open(CONTACT_SALES_URL, "_blank", "noopener,noreferrer");
  };

  const onRetry = () => {
    refetch();
  };

  // A managed (self-hosted) org can't self-serve through Stripe; its plan is set by its license state.
  const isManaged = overview ? overview.mode === "managed" : !isInfisicalCloud();
  const pageDescription = isManaged
    ? SELF_HOSTED_LICENSE_COPY[getSelfHostedLicenseState(subscription)].pageDescription
    : "Manage your subscription, products, and payment. Payment is handled securely through Stripe.";

  return (
    <>
      <PageTitle title={t("billing.title")} />
      <link rel="icon" href="/infisical.ico" />
      <meta property="og:image" content="/images/message.png" />
      <div className="mb-8 flex w-full justify-center bg-page text-foreground-inverse">
        <div className="w-full max-w-8xl">
          <PageHeader scope="org" title={t("billing.title")} description={pageDescription} />
          <OrgPermissionCan
            passThrough={false}
            I={OrgPermissionBillingActions.Read}
            a={OrgPermissionSubjects.Billing}
          >
            <Overview
              overview={overview}
              catalog={catalog}
              subState={subState}
              onManageSubscription={onManageSubscription}
              onUpgrade={onUpgrade}
              onSetCommitment={onSetCommitment}
              onViewBreakdown={onViewBreakdown}
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
              onEditDetails={onEditDetails}
              onContact={onContact}
              onCompleteTrialPayment={onCompleteTrialPayment}
              isCompletingTrialPayment={confirmTrialPayment.isPending}
              hasTrialApproval={Boolean(trialApprovalUrl)}
              onOpenTrialApproval={onOpenTrialApproval}
              onRetry={onRetry}
              canManageBilling={canManageBilling}
            />
          </OrgPermissionCan>
        </div>
      </div>

      {flow?.type === "sheet" && (
        <ProductSheet
          orgId={selectedOrgId}
          prod={catalogById(catalog, flow.prodId)}
          entitlement={overview?.entitlements[flow.prodId]}
          hasActiveSubscription={hasActiveSubscription}
          initialView={flow.view}
          initialTrialTier={flow.trialTier}
          showAnnualTrialNote={Boolean(flow.trialTier) && upgradeCycle === "annual"}
          trialOrgName={flow.trialTier ? currentOrg?.name : undefined}
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

      {flow?.type === "breakdown" && catalogById(catalog, flow.prodId) && (
        <UsageBreakdownSheet
          orgId={selectedOrgId}
          scope={showOrgFilter ? breakdownScope : "organization"}
          prod={catalogById(catalog, flow.prodId)!}
          entitlement={overview?.entitlements[flow.prodId]}
          initialDimensionKey={flow.dimensionKey}
          onClose={close}
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
    </>
  );
};
