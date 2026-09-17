import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useDebounce, useHeldLoading } from "@app/hooks";
import {
  BillingV2BreakdownScopeKind,
  useAddBillingV2PaymentMethod,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Organizations,
  useGetBillingV2Overview
} from "@app/hooks/api";

import { Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { ALL_ORGS_VALUE } from "./components/RootOrgFilter";
import { UsageBreakdownSheet } from "./components/UsageBreakdownSheet";
import { catalogById } from "./billing-v2-format";
// LOCAL PREVIEW ONLY — DO NOT COMMIT (see billing-v2-local-preview.ts).
import {
  asCloudOverview,
  asManagedCloudOverview,
  asTrialCloudOverview,
  PREVIEW_CATALOG,
  PREVIEW_MODE,
  previewEntitlements,
  TRIAL_CATALOG,
  trialEntitlements,
  usePreviewUsage
} from "./billing-v2-local-preview";
import { BillingV2RenderState } from "./billing-v2-view-types";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

// One popup's worth of organizations. The rest are reached by searching, which the picker's footer says.
const ORG_PAGE_SIZE = 10;

// `view` optionally opens the product sheet straight into a sub-view (e.g. the set-commitment flow
// from the "commit and save" nudge) instead of the default plans view.
type BillingV2Flow =
  | { type: "sheet"; prodId: string; view?: "commitment" }
  | { type: "breakdown"; prodId: string };

export const BillingV2Page = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const orgId = currentOrg?.id ?? "";
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

  const {
    data: serverOverview,
    isPending,
    isPlaceholderData,
    isError,
    refetch
  } = useGetBillingV2Overview(selectedOrgId);
  const { data: realCatalog = [] } = useGetBillingV2Catalog(selectedOrgId);
  const createPortalSession = useCreateBillingV2PortalSession();
  const addPaymentMethod = useAddBillingV2PaymentMethod();

  // ===== LAYOUT PREVIEW — REMOVE BEFORE MERGE (see billing-v2-local-preview.ts) =====
  // A dev stack has no licence server, so the catalog is empty and no product cards render. This
  // substitutes the licence server's half of the data so the layout is reviewable. Switch views with
  // PREVIEW_MODE in billing-v2-local-preview.ts.
  const usePreview = PREVIEW_MODE !== "off" && realCatalog.length === 0;
  const isTrialPreview = PREVIEW_MODE === "cloud-trial";
  const previewCatalog = isTrialPreview ? TRIAL_CATALOG : PREVIEW_CATALOG;
  const catalog = usePreview ? previewCatalog : realCatalog;
  // Real figures for the faked products, read off this instance's own database through the breakdown
  // endpoint, so picking an organization moves the meters the way it will in production.
  const previewUsage = usePreviewUsage(selectedOrgId, breakdownScope);
  const previewedEntitlements = isTrialPreview
    ? trialEntitlements(previewUsage)
    : previewEntitlements(previewUsage);
  // Shadows the real overview for the whole component, so every branch keyed off it (subState, the
  // managed/self-serve copy, the payment and invoice cards) sees the faked shape too. Restore to
  // `const { data: overview, ... } = useGetBillingV2Overview(selectedOrgId)` when removing the preview.
  let overview = serverOverview;
  if (usePreview && serverOverview) {
    if (PREVIEW_MODE === "cloud") {
      overview = asCloudOverview(serverOverview, previewedEntitlements);
    } else if (isTrialPreview) {
      overview = asTrialCloudOverview(serverOverview, previewedEntitlements);
    } else if (PREVIEW_MODE === "cloud-managed") {
      overview = asManagedCloudOverview(serverOverview, previewedEntitlements);
    } else {
      overview = { ...serverOverview, entitlements: previewedEntitlements };
    }
  }
  // The preview fakes the deployment, so it has to fake this endpoint's answer too. A dev stack is
  // self-hosted and the signed-in user is often an instance admin, so the server legitimately returns
  // every root org on the box; left alone, the picker would appear while the page pretends to be cloud.
  // Real cloud returns exactly one org, which is what makes the production rule (more than one entry
  // means you may switch) correct without testing isCloud anywhere.
  const pickerOrgs = usePreview && PREVIEW_MODE !== "self-hosted" ? rootOrgs.slice(0, 1) : rootOrgs;
  // ===== END LAYOUT PREVIEW =====

  // More than one organization means the server decided this caller may switch: an instance admin on
  // self-hosted, where one licence spans every org on the box. Cloud is bounded to the logged-in root
  // org and always counts one, so this needs no isCloud test, and not reading the overview keeps the
  // picker on screen while that request is loading or failing.
  // LOCAL PREVIEW: drop the preview branch and use `unsearchedOrgPage?.totalCount` directly.
  const rootOrgCount =
    usePreview && PREVIEW_MODE !== "self-hosted" ? 1 : (unsearchedOrgPage?.totalCount ?? 0);
  const showOrgFilter = rootOrgCount > 1;

  const [flow, setFlow] = useState<BillingV2Flow | null>(null);
  const [removeProdId, setRemoveProdId] = useState<string | null>(null);

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
      refetch();
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

  const isReloading = useHeldLoading(isPlaceholderData && !isError);

  let subState: BillingV2RenderState = "loading";
  if (isError) {
    subState = "error";
  } else if (isPending || isRootOrgCountPending) {
    subState = "loading";
  } else if (overview) {
    subState = overview.subState;
  }

  const removeProd = removeProdId ? catalogById(catalog, removeProdId) : undefined;

  const close = () => setFlow(null);

  const redirectToPortal = async () => {
    try {
      const url = await createPortalSession.mutateAsync({
        orgId: selectedOrgId,
        returnPath: window.location.pathname
      });
      window.location.href = url;
    } catch {
      createNotification({ type: "error", text: "Failed to open the billing portal." });
    }
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

  const onViewBreakdown = (productId: string) => {
    setFlow({ type: "breakdown", prodId: productId });
  };

  const hasActiveSubscription = overview?.subState === "active";

  const onUpdatePayment = async () => {
    try {
      const url = await addPaymentMethod.mutateAsync({
        orgId: selectedOrgId,
        returnPath: window.location.pathname
      });
      window.location.href = url;
    } catch {
      createNotification({ type: "error", text: "Failed to open the payment portal." });
    }
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

  // A managed (self-hosted licensed) org can't self-serve through Stripe; its plan is set by the license.
  const isManaged = overview ? overview.mode === "managed" : !isInfisicalCloud();
  const pageDescription = isManaged
    ? "View your subscription, products, and usage. Your plan is managed through your license."
    : "Manage your subscription, products, and payment. Payment is handled securely through Stripe.";

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="mb-8 flex w-full justify-center bg-bunker-800 text-white">
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
              rootOrgs={pickerOrgs}
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
              onSearchOrgs={setOrgSearch}
              showOrgFilter={showOrgFilter}
              onUpdatePayment={onUpdatePayment}
              onEditDetails={onEditDetails}
              onContact={onContact}
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
          returnPath={window.location.pathname}
          renewsOn={overview?.entitlements[flow.prodId]?.renewsOn ?? null}
          selfServe={overview?.selfServe ?? true}
          onClose={close}
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
