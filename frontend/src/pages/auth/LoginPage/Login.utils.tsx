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

export const navigateUserToOrg = async ({
  navigate,
  organizationId,
  navigateTo
}: NavigateUserToOrgParams) => {
  const userOrgs = await fetchOrganizations();

  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    navigate({
      to: navigateTo || "/organizations/$orgId/projects",
      params: { orgId: organizationId }
    });
    return;
  }

  if (userOrgs.length > 0) {
    const userOrg = userOrgs[0] && userOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    navigate({
      to: navigateTo || "/organizations/$orgId/projects",
      params: { orgId: userOrg }
    });
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
