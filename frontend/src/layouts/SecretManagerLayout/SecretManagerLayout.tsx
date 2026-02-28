import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import {
  useGetAccessRequestsCount,
  useGetSecretApprovalRequestCount,
  useGetSecretRotations
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const SecretManagerLayout = () => {
  const { currentProject, projectId } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { currentOrg } = useOrganization();
  const location = useLocation();

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
    <div className="dark flex h-full w-full flex-col overflow-x-hidden bg-mineshaft-900">
      <div className="border-y border-t-project/10 border-b-project/5 bg-gradient-to-b from-project/[0.075] to-project/[0.025] px-4 pt-0.5">
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
                  to="/organizations/$orgId/projects/secret-management/$projectId/overview"
                  params={{
                    orgId: currentOrg.id,
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
                  to="/organizations/$orgId/projects/secret-management/$projectId/approval"
                  params={{
                    orgId: currentOrg.id,
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
                  to="/organizations/$orgId/projects/secret-management/$projectId/integrations"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Integrations</Tab>}
                </Link>
                {Boolean(secretRotations?.length) && (
                  <Link
                    to="/organizations/$orgId/projects/secret-management/$projectId/secret-rotation"
                    params={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id
                    }}
                  >
                    {({ isActive }) => (
                      <Tab value={isActive ? "selected" : ""}>Secret Rotations</Tab>
                    )}
                  </Link>
                )}
                <Link
                  to="/organizations/$orgId/projects/secret-management/$projectId/access-management"
                  params={{
                    orgId: currentOrg.id,
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
                  to="/organizations/$orgId/projects/secret-management/$projectId/audit-logs"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/secret-management/$projectId/settings"
                  params={{
                    orgId: currentOrg.id,
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
  );
};
