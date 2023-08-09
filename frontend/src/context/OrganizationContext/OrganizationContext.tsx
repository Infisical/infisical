import { createContext, ReactNode, useContext, useMemo } from "react";

import { useGetOrganizations } from "@app/hooks/api";
import { Organization } from "@app/hooks/api/types";


type TOrgContext = {
  orgs?: Organization[];
  currentOrg?: Organization;
  isLoading: boolean;
};

const OrgContext = createContext<TOrgContext | null>(null);

type Props = {
  children: ReactNode;
};

export const OrgProvider = ({ children }: Props): JSX.Element => {
  const { data: userOrgs, isLoading } = useGetOrganizations();
  
  // const currentWsOrgID = currentWorkspace?.organization;
  const currentWsOrgID = localStorage.getItem("orgData.id");

  // memorize the workspace details for the context
  const value = useMemo<TOrgContext>(
    () => ({
      orgs: userOrgs,
      currentOrg: (userOrgs || []).find(({ _id }) => _id === currentWsOrgID) || (userOrgs || [])[0],
      isLoading
    }),
    [currentWsOrgID, userOrgs, isLoading]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};

export const useOrganization = () => {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrganization to be used within <OrgContext.Provider>");
  }

  return ctx;
};
