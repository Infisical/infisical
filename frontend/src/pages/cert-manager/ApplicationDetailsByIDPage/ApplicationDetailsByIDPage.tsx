import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageHeader, Spinner, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  useGetPkiApplicationByName,
  useListPkiApplicationMembers,
  useListPkiApplicationProfiles
} from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ApplicationCertificatesTab } from "./components/ApplicationCertificatesTab";
import { ApplicationMembersTab } from "./components/ApplicationMembersTab";
import { ApplicationOverviewTab } from "./components/ApplicationOverviewTab";
import { ApplicationRequestsTab } from "./components/ApplicationRequestsTab";
import { ApplicationSettingsTab } from "./components/ApplicationSettingsTab";
import { ApplicationSyncsTab } from "./components/ApplicationSyncsTab";

export const ApplicationDetailsByIDPage = () => {
  const params = useParams({ strict: false }) as {
    applicationName?: string;
    projectId?: string;
    orgId?: string;
  };
  const { applicationName, projectId, orgId } = params;
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();

  const { data: application, isPending } = useGetPkiApplicationByName(applicationName ?? "");
  const { data: profiles = [] } = useListPkiApplicationProfiles(application?.id ?? "");
  const { data: members = [] } = useListPkiApplicationMembers(application?.id ?? "");

  const selectedTab = search.selectedTab ?? "overview";

  if (isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-muted">
        <Spinner />
      </div>
    );
  }

  if (!application) {
    return <div className="p-12 text-muted">Application not found.</div>;
  }

  return (
    <>
      <Helmet>
        <title>{application.name}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title={application.name}
              description={application.description ?? undefined}
            />

            <Tabs
              value={selectedTab}
              onValueChange={(v) =>
                navigate({
                  to: `/organizations/${orgId ?? ""}/projects/cert-manager/${projectId ?? ""}/applications/${application.name}`,
                  search: { selectedTab: v } as never
                } as never)
              }
            >
              <TabList>
                <Tab variant="project" value="overview">
                  Overview
                </Tab>
                <Tab variant="project" value="certificates">
                  Certificates
                </Tab>
                <Tab variant="project" value="requests">
                  Requests
                </Tab>
                <Tab variant="project" value="syncs">
                  Certificate Syncs
                </Tab>
                <Tab variant="project" value="members">
                  Members
                </Tab>
                <Tab variant="project" value="settings">
                  Settings
                </Tab>
              </TabList>
              <TabPanel value="overview">
                <ApplicationOverviewTab
                  application={application}
                  members={members}
                  projectId={projectId ?? ""}
                />
              </TabPanel>
              <TabPanel value="certificates">
                <ApplicationCertificatesTab
                  applicationId={application.id}
                  projectId={projectId ?? ""}
                />
              </TabPanel>
              <TabPanel value="requests">
                <ApplicationRequestsTab
                  applicationId={application.id}
                  applicationName={application.name}
                />
              </TabPanel>
              <TabPanel value="syncs">
                <ApplicationSyncsTab
                  applicationId={application.id}
                  applicationName={application.name}
                  projectId={projectId ?? ""}
                />
              </TabPanel>
              <TabPanel value="members">
                <ApplicationMembersTab members={members} applicationId={application.id} />
              </TabPanel>
              <TabPanel value="settings">
                <ApplicationSettingsTab application={application} profiles={profiles} />
              </TabPanel>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};
