import { NextRouter } from "next/router";

import { fetchOrganizations } from "@app/hooks/api/organization/queries";

export const navigateUserToOrg = async (router: NextRouter, organizationId?: string) => {
  const userOrgs = await fetchOrganizations();

  if (organizationId) {
    localStorage.setItem("orgData.id", organizationId);
    router.push(`/org/${organizationId}/overview`);
    return;
  }

  if (userOrgs.length > 0) {
    // user is part of at least 1 org
    const userOrg = userOrgs[0] && userOrgs[0].id;
    localStorage.setItem("orgData.id", userOrg);
    router.push(`/org/${userOrg}/overview`);
  } else {
    // user is not part of any org
    localStorage.removeItem("orgData.id");
    router.push("/org/none");
  }
};
