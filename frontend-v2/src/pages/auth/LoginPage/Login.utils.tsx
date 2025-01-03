import { NavigateFn, useNavigate } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";
import { ProjectType } from "@app/hooks/api/workspace/types";

export const navigateUserToOrg = async (navigate: NavigateFn, organizationId?: string) => {
  const userOrgs = await fetchOrganizations();

  const nonAuthEnforcedOrgs = userOrgs.filter((org) => !org.authEnforced);

  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    navigate({ to: "/organization/secret-manager/overview" });
    return;
  }

  if (nonAuthEnforcedOrgs.length > 0) {
    // user is part of at least 1 non-auth enforced org
    const userOrg = nonAuthEnforcedOrgs[0] && nonAuthEnforcedOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    navigate({ to: `/organization/${ProjectType.SecretManager}/overview` as const });
  } else {
    // user is not part of any non-auth enforced orgs
    localStorage.removeItem("orgData.id");
    navigate({ to: "/organization/none" });
  }
};

export const useNavigateToSelectOrganization = () => {
  const { config } = useServerConfig();
  const navigate = useNavigate();

  const navigateToSelectOrganization = async (cliCallbackPort?: string) => {
    if (!config.defaultAuthOrgId) {
      queryClient.invalidateQueries({ queryKey: userKeys.getUser });
    }

    navigate({
      to: "/login/select-organization",
      search: { callback_port: cliCallbackPort, org_id: config.defaultAuthOrgId }
    });
  };

  return { navigateToSelectOrganization };
};
