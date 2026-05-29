import { Outlet, useRouterState } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";
import { CertManagerInstanceBanner } from "./components/CertManagerInstanceBanner";

export const PkiManagerLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDashboard = /\/cert-manager\/[^/]+\/overview\/?$/.test(pathname);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      {isDashboard && <CertManagerInstanceBanner />}
      <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4">
        <Outlet />
      </div>
    </div>
  );
};
