import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faCheck,
  faCopy,
  faEllipsisVertical,
  faPenToSquare,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageLoader,
  ResourceIcon
} from "@app/components/v3";
import { usePopUp, useToggle } from "@app/hooks";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useDeletePkiApplication,
  useGetPkiApplicationByName,
  useGetPkiApplicationPermissions,
  useListPkiApplicationMembers,
  useListPkiApplicationProfiles
} from "@app/hooks/api/pkiApplications";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PkiApplicationModal } from "../ApplicationsPage/components/PkiApplicationModal";
import { ApplicationCertificatesTab } from "./components/ApplicationCertificatesTab";
import { ApplicationMembersTab } from "./components/ApplicationMembersTab";
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
  const search = useSearch({ strict: false }) as { selectedTab?: string; search?: string };
  const navigate = useNavigate();

  const { data: application, isPending } = useGetPkiApplicationByName(applicationName ?? "");
  const { data: profiles = [] } = useListPkiApplicationProfiles(application?.id ?? "");
  const { data: members = [] } = useListPkiApplicationMembers(application?.id ?? "");
  const { data: permissionData, isPending: isPermissionsPending } = useGetPkiApplicationPermissions(
    application?.id ?? ""
  );
  const deleteApp = useDeletePkiApplication();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isIdCopied, setIsIdCopied] = useToggle(false);
  const {
    popUp: editPopUp,
    handlePopUpOpen: handleEditPopUpOpen,
    handlePopUpToggle: handleEditPopUpToggle
  } = usePopUp(["application"] as const);

  const ability = permissionData?.permission;
  const canViewCertificates = ability?.can(
    PkiApplicationResourceActions.Read,
    PkiApplicationResourceSub.Certificates
  );
  const canViewSyncs = ability?.can(
    PkiApplicationResourceActions.Read,
    PkiApplicationResourceSub.PkiSyncs
  );
  const canViewRequests = canViewCertificates;
  const canEditApplication = Boolean(
    ability?.can(PkiApplicationResourceActions.Edit, PkiApplicationResourceSub.Application)
  );
  const canDeleteApplication = Boolean(
    ability?.can(PkiApplicationResourceActions.Delete, PkiApplicationResourceSub.Application)
  );

  const requestedTab = search.selectedTab ?? "";
  const tabIsVisible: Record<string, boolean> = {
    certificates: Boolean(canViewCertificates),
    requests: Boolean(canViewRequests),
    syncs: Boolean(canViewSyncs),
    members: true,
    settings: true
  };
  const defaultTab = canViewCertificates ? "certificates" : "members";
  const selectedTab = tabIsVisible[requestedTab] ? requestedTab : defaultTab;

  const handleCopyId = () => {
    if (!application) return;
    navigator.clipboard.writeText(application.id);
    setIsIdCopied.on();
    createNotification({ type: "info", text: "Application ID copied to clipboard" });
    setTimeout(() => setIsIdCopied.off(), 2000);
  };

  const handleDelete = async () => {
    if (!application) return;
    try {
      await deleteApp.mutateAsync({ applicationId: application.id });
      createNotification({ type: "success", text: `Deleted ${application.name}` });
      setIsDeleteOpen(false);
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/applications",
        params: { orgId: orgId ?? "", projectId: projectId ?? "" }
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to delete Application.";
      createNotification({ type: "error", text: detail });
    }
  };

  if (isPending || isPermissionsPending) {
    return <PageLoader />;
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
            <div className="mb-4">
              <Link
                to="/organizations/$orgId/projects/cert-manager/$projectId/applications"
                params={{ orgId: orgId ?? "", projectId: projectId ?? "" }}
                className="flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
              >
                <ChevronLeftIcon size={16} />
                Back to Applications
              </Link>
            </div>
            <PageHeader
              scope={ProjectType.CertificateManager}
              icon={ResourceIcon}
              title={application.name}
              description={
                application.description ? (
                  <span className="break-all">{application.description}</span>
                ) : undefined
              }
              className="mb-4"
            >
              <Button variant="outline" size="xs" onClick={handleCopyId}>
                <FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />
                Copy ID
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="xs">
                    <FontAwesomeIcon icon={faEllipsisVertical} />
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={2}>
                  <DropdownMenuItem
                    isDisabled={!canEditApplication}
                    onClick={() => handleEditPopUpOpen("application", application)}
                  >
                    <FontAwesomeIcon icon={faPenToSquare} />
                    Edit Application
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!canDeleteApplication}
                    onClick={() => setIsDeleteOpen(true)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Delete Application
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageHeader>

            <Tabs
              value={selectedTab}
              onValueChange={(v) =>
                navigate({
                  to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
                  params: {
                    orgId: orgId ?? "",
                    projectId: projectId ?? "",
                    applicationName: application.name
                  },
                  search: {
                    selectedTab: v as "certificates" | "requests" | "syncs" | "members" | "settings"
                  }
                })
              }
            >
              <TabList>
                {canViewCertificates && (
                  <Tab variant="project" value="certificates">
                    Certificate Inventory
                  </Tab>
                )}
                {canViewRequests && (
                  <Tab variant="project" value="requests">
                    Certificate Requests
                  </Tab>
                )}
                {canViewSyncs && (
                  <Tab variant="project" value="syncs">
                    Certificate Syncs
                  </Tab>
                )}
                <Tab variant="project" value="members">
                  Members
                </Tab>
                <Tab variant="project" value="settings">
                  Settings
                </Tab>
              </TabList>
              {canViewCertificates && (
                <TabPanel value="certificates">
                  <ApplicationCertificatesTab
                    applicationId={application.id}
                    applicationName={application.name}
                    initialSearch={search.search}
                  />
                </TabPanel>
              )}
              {canViewRequests && (
                <TabPanel value="requests">
                  <ApplicationRequestsTab
                    applicationId={application.id}
                    applicationName={application.name}
                  />
                </TabPanel>
              )}
              {canViewSyncs && (
                <TabPanel value="syncs">
                  <ApplicationSyncsTab
                    applicationId={application.id}
                    applicationName={application.name}
                    projectId={projectId ?? ""}
                  />
                </TabPanel>
              )}
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

      <DeleteActionModal
        isOpen={isDeleteOpen}
        title={`Delete ${application.name}?`}
        subTitle="This unattaches all Profiles, app-scoped syncs/alerts, and revokes app-only memberships. Issued certificates remain in the project but lose their Application tag."
        onChange={(open) => setIsDeleteOpen(open)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />

      <PkiApplicationModal popUp={editPopUp} handlePopUpToggle={handleEditPopUpToggle} />
    </>
  );
};
