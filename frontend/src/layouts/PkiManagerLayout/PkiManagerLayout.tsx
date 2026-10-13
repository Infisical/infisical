import { useEffect } from "react";
import { Outlet } from "@tanstack/react-router";

import {
  CertificateManagementUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { useSubscription } from "@app/context";

export const PkiManagerLayout = () => {
  const { subscription } = useSubscription();

  const isCertManagerGated = subscription?.certManager === false;
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  useEffect(() => {
    if (!isCertManagerGated) return;

    openUpgradeGate({
      intent: CertificateManagementUpgradeIntent,
      paywallKey: "cert-manager.product-access"
    });
  }, [isCertManagerGated, openUpgradeGate]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10">
        <Outlet />
      </div>
      {upgradeGate}
    </div>
  );
};
