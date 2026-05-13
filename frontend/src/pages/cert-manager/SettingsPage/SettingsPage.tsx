import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionCertificateProfileActions
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CaSection, ExternalCaSection } from "../CertificateAuthoritiesPage/components";
import { CertificatePoliciesTab, CertificateProfilesTab } from "../PoliciesPage/components";
import { AppConnectionsTab } from "./components/AppConnectionsTab";
import { CertificateCleanupTab } from "./components/CertificateCleanupTab";

export const SettingsPage = () => {
  const { orgId, projectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const activeTab = search.selectedTab ?? "certificate-profiles";

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>Settings</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Settings"
          description="Configure certificate authorities, profiles, policies, app connections, and cleanup rules."
        />

        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
              params: { orgId: orgId ?? "", projectId: projectId ?? "" },
              search: { selectedTab: v }
            })
          }
        >
          <TabList>
            <Tab variant="project" value="certificate-profiles">
              Certificate Profiles
            </Tab>
            <Tab variant="project" value="certificate-policies">
              Certificate Policies
            </Tab>
            <Tab variant="project" value="certificate-authorities">
              Certificate Authorities
            </Tab>
            <Tab variant="project" value="app-connections">
              App Connections
            </Tab>
            <Tab variant="project" value="cleanup">
              Cleanup
            </Tab>
          </TabList>

          <TabPanel value="certificate-authorities">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionActions.Read}
              a={ProjectPermissionSub.CertificateAuthorities}
            >
              <CaSection />
              <ExternalCaSection />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="certificate-profiles">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionCertificateProfileActions.Read}
              a={ProjectPermissionSub.CertificateProfiles}
            >
              <CertificateProfilesTab />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="certificate-policies">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionCertificatePolicyActions.Read}
              a={ProjectPermissionSub.CertificatePolicies}
            >
              <CertificatePoliciesTab />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="app-connections">
            <ProjectPermissionCan
              renderGuardBanner
              I={ProjectPermissionAppConnectionActions.Read}
              a={ProjectPermissionSub.AppConnections}
            >
              <AppConnectionsTab />
            </ProjectPermissionCan>
          </TabPanel>

          <TabPanel value="cleanup">
            <CertificateCleanupTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
