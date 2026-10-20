import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";

import { SecretScanningUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { useSubscription } from "@app/context";

export const SecretScanningLayout = () => {
  const { subscription } = useSubscription();

  const isSecretScanningGated = subscription?.secretScanning === false;
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

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
