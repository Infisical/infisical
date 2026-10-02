import { useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { useSubscription } from "@app/context";

export const PamLayout = () => {
  const { subscription } = useSubscription();

  const isPamGated = subscription?.pam === false;
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(isPamGated);

  useEffect(() => {
    if (isPamGated) setIsUpgradeModalOpen(true);
  }, [isPamGated]);

  return (
    <>
      <Outlet />
      <UpgradePlanModal
        paywallKey="pam.product-access"
        isOpen={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        text="PAM is not available on your current plan. Upgrade to continue using it."
      />
    </>
  );
};
