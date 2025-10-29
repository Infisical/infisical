import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretManagerLayout = () => {
  const { currentProject, projectId } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const location = useLocation();

  const { t } = useTranslation();
  const projectSlug = currentProject?.slug || "";

  const { data: secretApprovalReqCount } = useGetSecretApprovalRequestCount({
    projectId
  });
  const { data: accessApprovalRequestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  // we only show the secret rotations v1 tab if they have existing rotations
  const { data: secretRotations } = useGetSecretRotations({
    workspaceId: projectId,
    options: {
      refetchOnMount: false
    }
  });

  const pendingRequestsCount =
    (secretApprovalReqCount?.open || 0) + (accessApprovalRequestCount?.pendingCount || 0);

  return (
    <>
      <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
        <div className="border-b border-mineshaft-600 bg-mineshaft-900">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="px-4"
          >
            <nav className="w-full">
              <Tabs value="selected">
                <TabList className="border-b-0">
                  <Link
                    to="/projects/secret-management/$projectId/overview"
                    params={{
                      projectId: currentProject.id,
                      ...(currentProject.environments.length
                        ? { envSlug: currentProject.environments[0]?.slug }
                        : {})
                    }}
                  >
                    {({ isActive }) => (
                      <Tab
                        value={
                          isActive || location.pathname.match(/\/secrets\/|\/commits\//)
                            ? "selected"
                            : ""
                        }
                      >
                        Overview
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/projects/secret-management/$projectId/approval"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <Tab value={isActive ? "selected" : ""}>
                        Approvals
                        {Boolean(
                          secretApprovalReqCount?.open || accessApprovalRequestCount?.pendingCount
                        ) && (
                          <Badge variant="warning" isSquare className="ml-1.5">
                            {pendingRequestsCount}
                          </Badge>
                        )}
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/projects/secret-management/$projectId/integrations"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Integrations</Tab>}
                  </Link>
                  {Boolean(secretRotations?.length) && (
                    <Link
                      to="/projects/secret-management/$projectId/secret-rotation"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <Tab value={isActive ? "selected" : ""}>Secret Rotations</Tab>
                      )}
                    </Link>
                  )}
                  <Link
                    to="/projects/secret-management/$projectId/app-connections"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <Tab value={isActive ? "selected" : ""}>App Connections</Tab>
                    )}
                  </Link>
                  <Link
                    to="/projects/secret-management/$projectId/access-management"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <Tab
                        value={
                          isActive ||
                          location.pathname.match(/\/groups\/|\/identities\/|\/members\/|\/roles\//)
                            ? "selected"
                            : ""
                        }
                      >
                        Access Control
                      </Tab>
                    )}
                  </Link>
                  <Link
                    to="/projects/secret-management/$projectId/audit-logs"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                  </Link>
                  <Link
                    to="/projects/secret-management/$projectId/settings"
                    params={{
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Settings</Tab>}
                  </Link>
                </TabList>
              </Tabs>
            </nav>
          </motion.div>
        </div>
        {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
        <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4">
          <Outlet />
        </div>
      </div>
      <div className="z-200 flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
