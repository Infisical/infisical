import { useSubscription } from "@app/context";

import { BillingV2Page } from "../BillingV2Page";
import { OfflineBillingPage } from "./OfflineBillingPage";

export const BillingPage = () => {
  const { subscription } = useSubscription();

  // Offline (air-gapped) licenses can't reach the license server, so the billing surface can't load;
  // short-circuit to the offline page (no API calls) before mounting it.
  if (subscription?.isOffline) {
    return <OfflineBillingPage />;
  }

  return <BillingV2Page />;
};
