import { createContext, ReactNode, useContext } from "react";

import { useGetUserOrgPermissions } from "@app/hooks/api";

import { useOrganization } from "../OrganizationContext";
import { TPermission } from "./types";

type Props = {
  children: ReactNode;
};

const PermissionContext = createContext<null | TPermission>(null);

export const OrgPermissionProvider = ({ children }: Props): JSX.Element => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?._id || "";
  const { data: permission, isLoading } = useGetUserOrgPermissions({ orgId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-bunker-800">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      </div>
    );
  }

  if (!permission) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-bunker-800">
        Failed to load user permissions
      </div>
    );
  }

  return <PermissionContext.Provider value={permission}>{children}</PermissionContext.Provider>;
};

export const useOrgPermission = () => {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("useOrgPermission to be used within <OrgPermissionProvider>");
  }

  return ctx;
};
