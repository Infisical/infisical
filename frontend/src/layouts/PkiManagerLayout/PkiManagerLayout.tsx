import { useEffect, useState } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { useProjectPermission, useSubscription } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";
import { CertManagerInstanceBanner } from "./components/CertManagerInstanceBanner";

export const PkiManagerLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { subscription } = useSubscription();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDashboard = /\/cert-manager\/[^/]+\/overview\/?$/.test(pathname);

  const isCertManagerGated = subscription?.certManager === true;
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(isCertManagerGated);

  useEffect(() => {
    if (isCertManagerGated) setIsUpgradeModalOpen(true);
  }, [isCertManagerGated]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      {isDashboard && <CertManagerInstanceBanner />}
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4">
        <Outlet />
      </div>
      <UpgradePlanModal
        isOpen={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        text="Certificate Manager is not available on your current plan. Upgrade to continue using it."
      />
    </div>
  );
};
