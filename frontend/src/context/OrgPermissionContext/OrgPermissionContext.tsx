import { createContext, ReactNode, useContext } from "react";

import { useGetUserOrgPermissions } from "@app/hooks/api";
import { OrgUser } from "@app/hooks/api/types";

import { useOrganization } from "../OrganizationContext";
import { TOrgPermission } from "./types";

type Props = {
  children: ReactNode;
};

const OrgPermissionContext = createContext<null | {
  permission: TOrgPermission;
  membership: OrgUser | null;
}>(null);

export const OrgPermissionProvider = ({ children }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: permission, isLoading } = useGetUserOrgPermissions({ orgId });

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          decoding="async"
          loading="lazy"
          alt="infisical loading indicator"
        />
      </div>
    );
  }

  if (!permission) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        Failed to load user permissions
      </div>
    );
  }

  return (
    <OrgPermissionContext.Provider value={permission}>{children}</OrgPermissionContext.Provider>
  );
};

export const useOrgPermission = () => {
  const ctx = useContext(OrgPermissionContext);
  if (!ctx) {
    throw new Error("useOrgPermission to be used within <OrgPermissionProvider>");
  }

  return ctx;
};
