import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useUser
} from "@app/context";
import {
  useAddBillingV2PaymentMethod,
  useCreateBillingV2CheckoutSession,
  useCreateBillingV2PortalSession,
  useGetBillingV2Catalog,
  useGetBillingV2Overview
} from "@app/hooks/api";

import { BillingV2RenderState, Overview } from "./components/Overview";
import { ProductSheet } from "./components/ProductSheet";
import { catalogById, intervalToCadence } from "./billing-v2-data";

import "./billing-v2.css";

const CONTACT_SALES_URL = "https://infisical.com/talk-to-us";

type BillingV2Flow = { type: "sheet"; prodId: string };

// Overlays render through a portal so fixed positioning is viewport-relative regardless of layout
// ancestors, while keeping the `.billing-v2` scope that the ported stylesheet targets.
const Overlay = ({ children }: { children: ReactNode }) =>
  createPortal(<div className="billing-v2">{children}</div>, document.body);

export const BillingV2Page = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const orgId = currentOrg?.id ?? "";
  const billingEmail = user?.email ?? user?.username;

  const { data: overview, isPending, isError, refetch } = useGetBillingV2Overview(orgId);
  const { data: catalog = [] } = useGetBillingV2Catalog(orgId);
  const createPortalSession = useCreateBillingV2PortalSession();
  const createCheckoutSession = useCreateBillingV2CheckoutSession();
  const addPaymentMethod = useAddBillingV2PaymentMethod();

  const [flow, setFlow] = useState<BillingV2Flow | null>(null);

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
    try {
      const url = await createCheckoutSession.mutateAsync({
        orgId,
        productId,
        cadence,
        email: billingEmail,
        returnPath: window.location.pathname
      });
      window.location.href = url;
    } catch {
      createNotification({ type: "error", text: "Failed to start checkout." });
    }
  };

  const onManageSubscription = () => {
    redirectToPortal();
  };

  // No subscription yet: open the first purchasable product so the customer can review and check out.
  const onGetStarted = () => {
    const startable = catalog.find((product) =>
      (product.pro?.dims ?? []).some((dim) => dim.monthly > 0 || dim.annual > 0)
    );
    const target = startable ?? catalog[0];
    if (target) {
      setFlow({ type: "sheet", prodId: target.id });
    }
  };

  const onUpgrade = (productId: string) => {
    setFlow({ type: "sheet", prodId: productId });
  };

  // From the product sheet: a new customer checks out for that product, an existing one manages in Stripe.
  const onSheetManage = async (productId: string) => {
    if (overview?.subState === "no-subscription") {
      await redirectToCheckout(productId);
      return;
    }
    await redirectToPortal();
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
        <div className="w-full max-w-5xl">
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
            <div className="billing-v2">
              <Overview
                overview={overview}
                catalog={catalog}
                subState={subState}
                onManageSubscription={onManageSubscription}
                onUpgrade={onUpgrade}
                onUpdatePayment={onUpdatePayment}
                onEditDetails={onEditDetails}
                onContact={onContact}
                onGetStarted={onGetStarted}
                onRetry={onRetry}
                getStartedLoading={createCheckoutSession.isPending}
              />
            </div>
          </OrgPermissionCan>
        </div>
      </div>

      {flow?.type === "sheet" && (
        <Overlay>
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
        </Overlay>
      )}
    </div>
  );
};
