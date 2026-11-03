import type { ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { userKeys } from "@app/hooks/api";
import {
  fetchOrganizationById,
  fetchOrganizations,
  organizationKeys
} from "@app/hooks/api/organization/queries";
import { useGetUserProjects } from "@app/hooks/api/projects/queries";
import { fetchUserDetails } from "@app/hooks/api/users/queries";

import { type V4Session, V4SessionContext } from "./contract";

export const LiveSessionProvider = ({
  organizationId,
  children
}: {
  organizationId: string;
  children: ReactNode;
}) => {
  const { data: user } = useSuspenseQuery({
    queryKey: userKeys.getUser,
    queryFn: fetchUserDetails
  });
  const { data: organization } = useSuspenseQuery({
    queryKey: organizationKeys.getOrgById(organizationId),
    queryFn: () => fetchOrganizationById(organizationId)
  });
  const { data: organizations = [] } = useSuspenseQuery({
    queryKey: organizationKeys.getUserOrganizations,
    queryFn: fetchOrganizations
  });
  const { data: projects = [] } = useGetUserProjects();
  const isSubOrganization =
    Boolean(organization.rootOrgId) && organization.id !== organization.rootOrgId;
  const session: V4Session = {
    user: {
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username,
      email: user.email ?? user.username
    },
    organization: { id: organization.id, name: organization.name, isSubOrganization },
    organizations: organizations.map((entry) => ({
      id: entry.id,
      name: entry.name,
      group: entry.id === organization.id ? "Current organization" : "Other organizations"
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      type: project.type
    }))
  };
  return <V4SessionContext value={session}>{children}</V4SessionContext>;
};
