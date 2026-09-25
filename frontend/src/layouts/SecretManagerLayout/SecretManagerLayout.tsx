import { Outlet } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretManagerLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-10">
        <Outlet />
      </div>
    </div>
  );
};
