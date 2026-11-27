import { createContext, useContext } from "react";

import type { ProjectType } from "@app/hooks/api/projects/types";

export type V4OrganizationGroup =
  | "Current organization"
  | "Sub-organizations"
  | "Other organizations";

export type V4Session = {
  user: { id: string; name: string; email: string; superAdmin: boolean };
  organization: { id: string; name: string; isSubOrganization: boolean };
  organizations: readonly { id: string; name: string; group: V4OrganizationGroup }[];
  projects: readonly { id: string; name: string; type: ProjectType }[];
};

export const V4SessionContext = createContext<V4Session | null>(null);

export const useV4Session = () => {
  const session = useContext(V4SessionContext);
  if (!session) throw new Error("useV4Session must be used inside the v4 organization layout");
  return session;
};
