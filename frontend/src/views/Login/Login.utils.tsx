import { NextRouter, useRouter } from "next/router";

import { useServerConfig } from "@app/context";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { userKeys } from "@app/hooks/api/users";
import { queryClient } from "@app/reactQuery";

export const navigateUserToOrg = async (router: NextRouter, organizationId?: string) => {
  const userOrgs = await fetchOrganizations();

  const nonAuthEnforcedOrgs = userOrgs.filter((org) => !org.authEnforced);

  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    router.push(`/org/${organizationId}/overview`);
    return;
  }

  if (nonAuthEnforcedOrgs.length > 0) {
    // user is part of at least 1 non-auth enforced org
    const userOrg = nonAuthEnforcedOrgs[0] && nonAuthEnforcedOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    router.push(`/org/${userOrg}/overview`);
  } else {
    // user is not part of any non-auth enforced orgs
    localStorage.removeItem("orgData.id");
    router.push("/org/none");
  }
};

export const useNavigateToSelectOrganization = () => {
  const { config } = useServerConfig();
  const router = useRouter();

  const navigate = async (cliCallbackPort?: string) => {
    let redirectTo = "/login/select-organization?";
    if (config.defaultAuthOrgId) {
      redirectTo += `org_id=${config.defaultAuthOrgId}&`;
    } else {
      queryClient.invalidateQueries(userKeys.getUser);
    }

    if (cliCallbackPort) {
      redirectTo += `callback_port=${cliCallbackPort}`;
    }

    router.push(redirectTo, undefined, { shallow: true });
  };

  return { navigateToSelectOrganization: navigate };
};
