import { useEffect } from "react";
import { useRouter } from "next/router";

import getOrganizations from "./api/organization/getOrgs";

export default function DashboardRedirect() {
  const router = useRouter();

  /**
   * Here we forward to the default workspace if a user opens this url
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      let userOrg;
      try {
        if (localStorage.getItem("orgData.id")) {
          router.push(`/org/${localStorage.getItem("orgData.id")}/overview`);
        } else {
          const userOrgs = await getOrganizations();
          userOrg = userOrgs[0]._id;
          router.push(`/org/${userOrg}/overview`);
        }
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div />;
}

DashboardRedirect.requireAuth = true;
