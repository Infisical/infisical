import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Tab, TabList, Tabs } from "@app/components/v2";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import {
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiSubscribers
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PkiManagerLayout = () => {
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
    <div className="dark flex h-full w-full flex-col overflow-x-hidden">
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
                  to="/projects/cert-management/$projectId/policies"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Certificates</Tab>}
                </Link>
                <Link
                  to="/projects/cert-management/$projectId/certificate-authorities"
                  params={{
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
                  to="/projects/cert-management/$projectId/alerting"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Alerting</Tab>}
                </Link>
                <Link
                  to="/projects/cert-management/$projectId/integrations"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Integrations</Tab>}
                </Link>
                <Link
                  to="/projects/cert-management/$projectId/app-connections"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>App Connections</Tab>}
                </Link>
                {showLegacySection && (
                  <>
                    {(subscription.pkiLegacyTemplates || hasExistingSubscribers) && (
                      <Link
                        to="/projects/cert-management/$projectId/subscribers"
                        params={{
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
                        to="/projects/cert-management/$projectId/certificate-templates"
                        params={{
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
                  to="/projects/cert-management/$projectId/access-management"
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
                  to="/projects/cert-management/$projectId/audit-logs"
                  params={{
                    projectId: currentProject.id
                  }}
                >
                  {({ isActive }) => <Tab value={isActive ? "selected" : ""}>Audit Logs</Tab>}
                </Link>
                <Link
                  to="/projects/cert-management/$projectId/settings"
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
  );
};
