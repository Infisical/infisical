import { NavigateFn, useNavigate } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";

export const navigateUserToOrg = async (navigate: NavigateFn, organizationId?: string) => {
  const userOrgs = await fetchOrganizations();

  const nonAuthEnforcedOrgs = userOrgs.filter((org) => !org.authEnforced);

  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    navigate({ to: `/org/${organizationId}/overview` });
    return;
  }

  if (nonAuthEnforcedOrgs.length > 0) {
    // user is part of at least 1 non-auth enforced org
    const userOrg = nonAuthEnforcedOrgs[0] && nonAuthEnforcedOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    navigate({ to: `/org/${userOrg}/overview` });
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
    let redirectTo = "/login/select-organization?";
    if (config.defaultAuthOrgId) {
      redirectTo += `org_id=${config.defaultAuthOrgId}&`;
    } else {
      queryClient.invalidateQueries(userKeys.getUser);
    }

    if (cliCallbackPort) {
      redirectTo += `callback_port=${cliCallbackPort}`;
    }

    navigate({ to: redirectTo });
  };

  return { navigateToSelectOrganization };
};
