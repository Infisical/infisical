import { NavigateFn, ParsedLocation, useNavigate } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";
import { getOrganizationSwitchDestination } from "@app/helpers/organizationSwitch";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";

type NavigateUserToOrgParams = {
  navigate: NavigateFn;
  organizationId?: string;
  navigateTo?: string;
  switchFrom?: Pick<ParsedLocation<Record<string, unknown>>, "pathname" | "search">;
  isSubOrganization?: boolean;
};

const navigateToOrg = (
  navigate: NavigateFn,
  organizationId: string,
  { navigateTo, switchFrom, isSubOrganization }: NavigateUserToOrgParams
) => {
  if (switchFrom && !navigateTo) {
    return navigate(
      getOrganizationSwitchDestination(switchFrom, organizationId, isSubOrganization)
    );
  }

  return navigate({
    to: navigateTo || ("/organizations/$orgId/projects" as const),
    params: { orgId: organizationId },
    search: { subOrganization: undefined }
  });
};

export const navigateUserToOrg = async (options: NavigateUserToOrgParams) => {
  const { navigate, organizationId } = options;
  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    await navigateToOrg(navigate, organizationId, options);
    return;
  }

  const userOrgs = await fetchOrganizations();
  const nonAuthEnforcedOrgs = userOrgs.filter((org) => !org.authEnforced);
  if (nonAuthEnforcedOrgs.length > 0) {
    const userOrg = nonAuthEnforcedOrgs[0] && nonAuthEnforcedOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    await navigateToOrg(navigate, userOrg, options);
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
