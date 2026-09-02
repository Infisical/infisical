import { Outlet } from "@tanstack/react-router";

import { useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const AgentVaultLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();

  return (
    <>
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <Outlet />
    </>
  );
};
