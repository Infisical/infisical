import { NavigateFn, useNavigate } from "@tanstack/react-router";

import { useServerConfig } from "@app/context";
import { getLastProject } from "@app/helpers/lastProject";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { queryClient } from "@app/hooks/api/reactQuery";
import { userKeys } from "@app/hooks/api/users";
import { User, UserEnc } from "@app/hooks/api/users/types";

type NavigateUserToOrgParams = {
  navigate: NavigateFn;
  organizationId?: string;
  navigateTo?: string;
};

export enum LoginSection {
  Initial = "initial",
  SAML = "saml",
  OIDC = "oidc"
}

const getLastProjectId = (organizationId: string): string | null => {
  const user = queryClient.getQueryData<User & UserEnc>(userKeys.getUser);
  if (!user?.id) return null;
  return getLastProject(user.id, organizationId);
};

const navigateToOrg = (navigate: NavigateFn, organizationId: string, navigateTo?: string) => {
  const lastProjectId = !navigateTo ? getLastProjectId(organizationId) : null;

  navigate({
    to: navigateTo || ("/organizations/$orgId/projects" as const),
    params: { orgId: organizationId },
    search: lastProjectId ? { projectRedirect: lastProjectId } : undefined
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
