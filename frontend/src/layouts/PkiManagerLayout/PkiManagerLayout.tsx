import { useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { useSubscription } from "@app/context";

export const PkiManagerLayout = () => {
  const { subscription } = useSubscription();

  const isCertManagerGated = subscription?.certManager === false;
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(isCertManagerGated);

  useEffect(() => {
    if (isCertManagerGated) setIsUpgradeModalOpen(true);
  }, [isCertManagerGated]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10">
        <Outlet />
      </div>
      <UpgradePlanModal
        paywallKey="cert-manager.product-access"
        isOpen={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        text="Certificate Manager is not available on your current plan. Upgrade to continue using it."
      />
    </div>
  );
};
