import { useSubscription } from "@app/context";

import { BillingV2Page } from "../BillingV2Page";
import { PREVIEW_MODE } from "../BillingV2Page/billing-v2-local-preview";
import { OfflineBillingPage } from "./OfflineBillingPage";

export const BillingPage = () => {
  const { subscription } = useSubscription();

  // Offline (air-gapped) licenses can't reach the license server, so the billing surface can't load;
  // short-circuit to the offline page (no API calls) before mounting it.
  // LAYOUT PREVIEW — REMOVE BEFORE MERGE: lets the offline page be reviewed without an offline licence.
  if (PREVIEW_MODE === "offline" || subscription?.isOffline) {
    return <OfflineBillingPage />;
  }

  return <BillingV2Page />;
};
