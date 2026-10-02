import { useEffect } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";

import {
  CertificateManagementUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { useProjectPermission, useSubscription } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";
import { CertManagerInstanceBanner } from "./components/CertManagerInstanceBanner";

export const PkiManagerLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { subscription } = useSubscription();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDashboard = /\/cert-manager\/[^/]+\/overview\/?$/.test(pathname);

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
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      {isDashboard && <CertManagerInstanceBanner />}
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10">
        <Outlet />
      </div>
      {upgradeGate}
    </div>
  );
};
