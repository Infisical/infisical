import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";

import { PamUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { useProjectPermission, useSubscription } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PamLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
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
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <Outlet />
      {upgradeGate}
    </>
  );
};
