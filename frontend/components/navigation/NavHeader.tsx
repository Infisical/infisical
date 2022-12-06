import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  faAngleRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import getOrganization from "~/pages/api/organization/GetOrg";
import getProjectInfo from "~/pages/api/workspace/getProjectInfo";

/**
 * This is the component at the top of almost every page.
 * It shows how to navigate to a certain page.
 * It future these links should also be clickable and hoverable
 * @param obj 
 * @param obj.pageName - Name of the page
 * @param obj.isProjectRelated - whether this page is related to project or now (determine if it's 2 or 3 navigation steps)
 * @returns 
 */
export default function NavHeader({ pageName, isProjectRelated } : { pageName: string; isProjectRelated: boolean; }): JSX.Element {
  const [orgName, setOrgName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const orgId = localStorage.getItem("orgData.id")
      const org = await getOrganization({
        orgId: orgId ? orgId : "",
      });
      setOrgName(org.name);

      const workspace = await getProjectInfo({
        projectId: String(router.query.id),
      });
      setWorkspaceName(workspace.name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pt-20 ml-6 flex flex-row items-center">
      <div className="bg-primary-900 h-6 w-6 rounded-md flex items-center justify-center text-mineshaft-100 mr-2">
        {orgName?.charAt(0)}
      </div>
      <div className="text-primary text-sm font-semibold">{orgName}</div>
      {isProjectRelated && (
        <>
          <FontAwesomeIcon
            icon={faAngleRight}
            className="ml-3 text-sm text-gray-400 mr-3"
          />
          <div className="font-semibold text-primary text-sm">
            {workspaceName}
          </div>
        </>
      )}
      <FontAwesomeIcon
        icon={faAngleRight}
        className="ml-3 text-sm text-gray-400 mr-3"
      />
      <div className="text-gray-400 text-sm">{pageName}</div>
    </div>
  );
}
