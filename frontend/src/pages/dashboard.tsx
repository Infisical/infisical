import { useEffect } from "react";
import { useRouter } from "next/router";

import { useGetOrganizations } from "@app/hooks/api";

export default function DashboardRedirect() {
  const router = useRouter();
  const { data: userOrgs } = useGetOrganizations();

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
        } else if (userOrgs) {
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
