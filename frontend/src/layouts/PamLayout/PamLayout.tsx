import { useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { useProjectPermission, useSubscription } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PamLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { subscription } = useSubscription();

  const isPamGated = subscription?.pam === true;
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(isPamGated);

  useEffect(() => {
    if (isPamGated) setIsUpgradeModalOpen(true);
  }, [isPamGated]);

  return (
    <>
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <Outlet />
      <UpgradePlanModal
        isOpen={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        text="PAM is not available on your current plan. Upgrade to continue using it."
      />
    </>
  );
};
