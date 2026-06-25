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
  useCreateBillingV2CheckoutSession,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Overview
} from "@app/hooks/api";

import { AddProductModal } from "./components/AddProductModal";
import { BillingV2RenderState, Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { RemoveProductModal } from "./components/RemoveProductModal";
import { catalogById, intervalToCadence } from "./billing-v2-data";

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
  const createCheckoutSession = useCreateBillingV2CheckoutSession();
  const addPaymentMethod = useAddBillingV2PaymentMethod();

  const [flow, setFlow] = useState<BillingV2Flow | null>(null);
  const [removeProdId, setRemoveProdId] = useState<string | null>(null);
  const [addProdId, setAddProdId] = useState<string | null>(null);

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

  const cadence = intervalToCadence(overview?.interval ?? null);
  const removeProd = removeProdId ? catalogById(catalog, removeProdId) : undefined;
  const addProd = addProdId ? catalogById(catalog, addProdId) : undefined;

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

  const redirectToCheckout = async (productId: string) => {
    const result = await createCheckoutSession.mutateAsync({
      orgId,
      productId,
      cadence,
      email: billingEmail,
      returnPath: window.location.pathname
    });

    // The product was added straight to the existing subscription; no Stripe redirect needed.
    if (result.outcome === "subscription_updated") {
      close();
      createNotification({
        type: "success",
        text: "Product added to your subscription. It may take a moment to appear here."
      });
      refetch();
      return;
    }

    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }

    createNotification({ type: "error", text: "Failed to start checkout." });
  };

  const onManageSubscription = () => {
    redirectToPortal();
  };

  const onUpgrade = (productId: string) => {
    setFlow({ type: "sheet", prodId: productId });
  };

  // Owned products are managed in the Stripe portal. A new product is added in place with a proration
  // confirmation when a subscription already exists; a first-time customer goes through Stripe Checkout.
  const hasActiveSubscription =
    overview?.subState === "active" ||
    overview?.subState === "trialing" ||
    overview?.subState === "past-due";

  const onSheetManage = async (productId: string) => {
    const isEntitled = Boolean(overview?.entitlements[productId]?.entitled);
    if (isEntitled) {
      await redirectToPortal();
      return;
    }
    if (hasActiveSubscription) {
      close();
      setAddProdId(productId);
      return;
    }
    await redirectToCheckout(productId);
  };

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

  const sheetRedirecting = createPortalSession.isPending || createCheckoutSession.isPending;

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope="org"
            title={t("billing.title")}
            description="Manage your subscription, products, and payment. Payment is handled securely through Stripe."
          />
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
              onRemove={setRemoveProdId}
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
          prodId={flow.prodId}
          prod={catalogById(catalog, flow.prodId)}
          entitlement={overview?.entitlements[flow.prodId]}
          cadence={cadence}
          redirecting={sheetRedirecting}
          onClose={close}
          onManage={onSheetManage}
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
        />
      )}

      {addProd && (
        <AddProductModal
          orgId={orgId}
          product={addProd}
          cadence={cadence}
          onClose={() => setAddProdId(null)}
        />
      )}
    </div>
  );
};
