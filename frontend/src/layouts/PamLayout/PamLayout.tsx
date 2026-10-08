import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";

import { PamUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { useSubscription } from "@app/context";

export const PamLayout = () => {
  const { subscription } = useSubscription();

  const isPamGated = subscription?.pam === false;
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  useEffect(() => {
    if (!isPamGated) return;

    openUpgradeGate({
      intent: PamUpgradeIntent,
      paywallKey: "pam.product-access"
    });
  }, [isPamGated, openUpgradeGate]);

  return (
    <>
      <Outlet />
      {upgradeGate}
    </>
  );
};
