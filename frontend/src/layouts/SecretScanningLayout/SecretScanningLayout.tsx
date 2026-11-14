import { useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";

import { SecretScanningUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { useOrganization, useSubscription } from "@app/context";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

export const SecretScanningLayout = () => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const openedOrgRef = useRef<string | undefined>(undefined);

  const isSecretScanningGated = subscription?.secretScanning === false;
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  // Once per visit to the product: navigating between its pages keeps this layout mounted.
  useEffect(() => {
    if (openedOrgRef.current === currentOrg.id) return;
    openedOrgRef.current = currentOrg.id;

    analytics.captureForOrganization(AnalyticsEvent.SecretScanningOpened, currentOrg.id, {
      hasSecretScanning: Boolean(subscription.secretScanning),
      plan: subscription.slug ?? "free"
    });
  }, [currentOrg.id, subscription.secretScanning, subscription.slug]);

  useEffect(() => {
    if (!isSecretScanningGated) return;

    openUpgradeGate({
      intent: SecretScanningUpgradeIntent,
      paywallKey: "secret-scanning.product-access"
    });
  }, [isSecretScanningGated, openUpgradeGate]);

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-x-hidden">
        <div className="flex-1 overflow-x-hidden overflow-y-auto px-12 pt-10 pb-4">
          <Outlet />
        </div>
      </div>
      {upgradeGate}
    </>
  );
};
