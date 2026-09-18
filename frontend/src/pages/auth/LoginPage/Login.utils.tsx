import { NavigateFn, useNavigate } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";

type NavigateUserToOrgParams = {
  navigate: NavigateFn;
  organizationId?: string;
  navigateTo?: string;
};

const navigateToOrg = (navigate: NavigateFn, organizationId: string, navigateTo?: string) => {
  navigate({
    to: navigateTo || ("/organizations/$orgId/projects" as const),
    params: { orgId: organizationId }
  });
};

export const navigateUserToOrg = async ({
  navigate,
  organizationId,
  navigateTo
}: NavigateUserToOrgParams) => {
  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    navigateToOrg(navigate, organizationId, navigateTo);
    return;
  }

  const userOrgs = await fetchOrganizations();
  const nonAuthEnforcedOrgs = userOrgs.filter((org) => !org.authEnforced);
  if (nonAuthEnforcedOrgs.length > 0) {
    const userOrg = nonAuthEnforcedOrgs[0] && nonAuthEnforcedOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    navigateToOrg(navigate, userOrg, navigateTo);
  } else {
    localStorage.removeItem("orgData.id");
    navigate({ to: "/organizations/none" });
  }
};

export const useNavigateToSelectOrganization = () => {
  const { config } = useServerConfig();
  const navigate = useNavigate();

  const navigateToSelectOrganization = async (
    cliCallbackPort?: string,
    isFromAdminLogin?: boolean
  ) => {
    if (!config.defaultAuthOrgId) {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }

    navigate({
      to: "/login/select-organization",
      search: {
        callback_port: cliCallbackPort,
        org_id: config.defaultAuthOrgId,
        is_admin_login: isFromAdminLogin
      }
    });
  };

  return { navigateToSelectOrganization };
};
