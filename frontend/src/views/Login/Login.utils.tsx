import { NextRouter } from "next/router";

import { fetchOrganizations } from "@app/hooks/api/organization/queries";

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
