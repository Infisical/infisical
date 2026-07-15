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
  useOrgPermission,
  useUser
} from "@app/context";
import {
  useAddBillingV2PaymentMethod,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Overview
} from "@app/hooks/api";

import { BillingV2RenderState, Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { catalogById } from "./billing-v2-data";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

type BillingV2Flow = { type: "sheet"; prodId: string };

export const BillingV2Page = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const { permission } = useOrgPermission();
  const orgId = currentOrg?.id ?? "";
  const billingEmail = user?.email ?? user?.username;
  const canManageBilling = permission.can(
    OrgPermissionBillingActions.ManageBilling,
    OrgPermissionSubjects.Billing
  );

  const { data: overview, isPending, isError, refetch } = useGetBillingV2Overview(orgId);
  const { data: catalog = [] } = useGetBillingV2Catalog(orgId);
  const createPortalSession = useCreateBillingV2PortalSession();
  const addPaymentMethod = useAddBillingV2PaymentMethod();

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

  // A first-time customer checks out through Stripe; an org with a live subscription has products
  // added / changed in place. Trialing and past-due orgs still have a usable subscription.
  const hasActiveSubscription =
    overview?.subState === "active" ||
    overview?.subState === "trialing" ||
    overview?.subState === "past-due";

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
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
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
          billingEmail={billingEmail}
          returnPath={window.location.pathname}
          renewsOn={overview?.nextBillingDate ?? null}
          onClose={close}
          onRemove={setRemoveProdId}
          onContact={() => {
            close();
            onContact();
          }}
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
    </div>
  );
};
