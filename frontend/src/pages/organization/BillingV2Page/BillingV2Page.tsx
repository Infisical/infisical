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
import {
  useAddBillingV2PaymentMethod,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Organizations,
  useGetBillingV2Overview
} from "@app/hooks/api";

import { Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { UsageBreakdownSheet } from "./components/UsageBreakdownSheet";
import { catalogById } from "./billing-v2-format";
// LOCAL PREVIEW ONLY — DO NOT COMMIT (see billing-v2-local-preview.ts).
import {
  asCloudOverview,
  asManagedCloudOverview,
  PREVIEW_CATALOG,
  PREVIEW_ENTITLEMENTS,
  PREVIEW_MODE
} from "./billing-v2-local-preview";
import { BillingV2RenderState } from "./billing-v2-view-types";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

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
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );

  // Which organization the page is pointed at. Defaults to the signed-in one; an instance admin on
  // self-hosted can switch it, and the overview, catalog and breakdown all follow.
  const [selectedOrgId, setSelectedOrgId] = useState(orgId);
  // The org switcher changes currentOrg without unmounting this page, and useState only reads its
  // initial value, so the selection has to be reset explicitly or every query keeps asking about the
  // org the user just left. Adjusted during render rather than in an effect so no pass renders the
  // previous org's figures under the new org's name.
  const [lastOrgId, setLastOrgId] = useState(orgId);
  if (orgId !== lastOrgId) {
    setLastOrgId(orgId);
    setSelectedOrgId(orgId);
  }
  const { data: rootOrgs = [] } = useGetBillingV2Organizations(orgId);

  const {
    data: serverOverview,
    isPending,
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
  const catalog = usePreview ? PREVIEW_CATALOG : realCatalog;
  // Shadows the real overview for the whole component, so every branch keyed off it (subState, the
  // managed/self-serve copy, the payment and invoice cards) sees the faked shape too. Restore to
  // `const { data: overview, ... } = useGetBillingV2Overview(selectedOrgId)` when removing the preview.
  let overview = serverOverview;
  if (usePreview && serverOverview) {
    if (PREVIEW_MODE === "cloud") {
      overview = asCloudOverview(serverOverview);
    } else if (PREVIEW_MODE === "cloud-managed") {
      overview = asManagedCloudOverview(serverOverview);
    } else {
      overview = { ...serverOverview, entitlements: PREVIEW_ENTITLEMENTS };
    }
  }
  // The preview fakes the deployment, so it has to fake this endpoint's answer too. A dev stack is
  // self-hosted and the signed-in user is often an instance admin, so the server legitimately returns
  // every root org on the box; left alone, the picker would appear while the page pretends to be cloud.
  // Real cloud returns exactly one org, which is what makes the production rule (more than one entry
  // means you may switch) correct without testing isCloud anywhere.
  const pickerOrgs =
    usePreview && PREVIEW_MODE !== "self-hosted" ? rootOrgs.slice(0, 1) : rootOrgs;
  // ===== END LAYOUT PREVIEW =====

  // Root organizations the signed-in user belongs to. A self-hosted licence spans every org on the
  // instance, so the breakdown needs to say which one it is explaining; cloud bills per root org and
  // stays bounded to the logged-in one.
  // The server already decided what this caller may see: more than one entry means an instance admin
  // on self-hosted, so the picker is theirs alone without the client testing for that. Cloud is bounded
  // to the logged-in root org, so it never has one.
  // LOCAL PREVIEW: drop `pickerOrgs` and use `rootOrgs` directly when removing the preview block.
  // More than one entry means the server decided this caller may switch: an instance admin on
  // self-hosted. Cloud always returns a single org, so this needs no isCloud test, and not reading the
  // overview keeps the picker on screen while that request is loading or failing.
  const showOrgFilter = pickerOrgs.length > 1;

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

  let subState: BillingV2RenderState = "loading";
  if (isError) {
    subState = "error";
  } else if (overview) {
    subState = overview.subState;
  } else if (isPending) {
    subState = "loading";
  }

  const removeProd = removeProdId ? catalogById(catalog, removeProdId) : undefined;

  const close = () => setFlow(null);

  const redirectToPortal = async () => {
    try {
      const url = await createPortalSession.mutateAsync({
        orgId,
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

  // Explains where a product's metered usage was created, across the org tree.
  const onViewBreakdown = (productId: string) => {
    setFlow({ type: "breakdown", prodId: productId });
  };

  const hasActiveSubscription = overview?.subState === "active";

  const onUpdatePayment = async () => {
    try {
      const url = await addPaymentMethod.mutateAsync({
        orgId,
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
  const isManaged = overview?.mode === "managed";
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
              selectedOrgId={selectedOrgId}
              onSelectOrg={setSelectedOrgId}
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
          orgId={orgId}
          prod={catalogById(catalog, flow.prodId)}
          entitlement={overview?.entitlements[flow.prodId]}
          hasActiveSubscription={hasActiveSubscription}
          initialView={flow.view}
          returnPath={window.location.pathname}
          renewsOn={overview?.entitlements[flow.prodId]?.renewsOn ?? null}
          trialUsed={overview?.trialedProductKeys.includes(flow.prodId) ?? false}
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
          prod={catalogById(catalog, flow.prodId)!}
          entitlement={overview?.entitlements[flow.prodId]}
          onClose={close}
        />
      )}

      {removeProd && (
        <RemoveProductModal
          orgId={orgId}
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
