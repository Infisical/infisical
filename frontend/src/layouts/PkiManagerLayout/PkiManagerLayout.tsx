import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { useOrganization, useProject, useProjectPermission, useSubscription } from "@app/context";
import {
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiSubscribers
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PkiManagerLayout = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { subscription } = useSubscription();

  const { data: subscribers = [] } = useListWorkspacePkiSubscribers(currentProject?.id || "");
  const { data: templatesData } = useListWorkspaceCertificateTemplates({
    projectId: currentProject?.id || ""
  });
  const templates = templatesData?.certificateTemplates || [];

  const hasExistingSubscribers = subscribers.length > 0;
  const hasExistingTemplates = templates.length > 0;
  const showLegacySection =
    subscription.pkiLegacyTemplates || hasExistingSubscribers || hasExistingTemplates;

  const location = useLocation();
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
                  to="/organizations/$orgId/projects/cert-manager/$projectId/policies"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Certificates</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-authorities"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => (
                    <Tab value={isActive || location.pathname.match(/\/ca\//) ? "selected" : ""}>
                      Certificate Authorities
                    </Tab>
                  )}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/alerting"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Alerting</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/approvals"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Approvals</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/integrations"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Integrations</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/app-connections"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>App Connections</Tab>}
                </Link>
                {showLegacySection && (
                  <>
                    {(subscription.pkiLegacyTemplates || hasExistingSubscribers) && (
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/subscribers"
                        params={{
                          orgId: currentOrg.id,
                          projectId: currentProject.id
                        }}
                      >
                        {({ isActive }) => (
                          <Tab value={isActive ? "selected" : ""}>Subscribers (Legacy)</Tab>
                        )}
                      </Link>
                    )}
                    {(subscription.pkiLegacyTemplates || hasExistingTemplates) && (
                      <Link
                        to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-templates"
                        params={{
                          orgId: currentOrg.id,
                          projectId: currentProject.id
                        }}
                      >
                        {({ isActive }) => (
                          <Tab value={isActive ? "selected" : ""}>
                            Certificate Templates (Legacy)
                          </Tab>
                        )}
                      </Link>
                    )}
                  </>
                )}
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/access-management"
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
                  to="/organizations/$orgId/projects/cert-manager/$projectId/audit-logs"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                </Link>
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/settings"
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
