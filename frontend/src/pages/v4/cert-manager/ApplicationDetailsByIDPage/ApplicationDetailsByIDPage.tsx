import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { isAxiosError } from "axios";

import { PageTitle } from "@app/components/PageTitle";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication
} from "@app/hooks/api/pkiApplications/types";

import { failed, saved } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { orgHref, v4Path } from "../../links";
import { ApplicationDialog } from "../ApplicationsPage/application-dialogs";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { CertificatesTab } from "./certificates-tab";
import { MembersTab } from "./members-tab";
import { RequestsTab } from "./requests-tab";
import { SettingsTab } from "./settings-tab";
import { APPLICATION_DOCS, type ApplicationTab, appCan, copyId } from "./shared";
import { SyncsTab } from "./syncs-tab";

const routeId = v4Path("/organizations/$orgId/cert-manager/applications/$applicationName");
const listPath = v4Path("/organizations/$orgId/cert-manager/applications");

const isForbidden = (error: unknown) => isAxiosError(error) && error.response?.status === 403;

const resolveTabs = ({
  requested,
  isNonMemberAdmin,
  canViewCertificates,
  canViewSyncs
}: {
  requested?: ApplicationTab;
  isNonMemberAdmin: boolean;
  canViewCertificates: boolean;
  canViewSyncs: boolean;
}) => {
  const defaultTab: ApplicationTab = isNonMemberAdmin ? "members" : "certificates";
  const tab: ApplicationTab =
    isNonMemberAdmin && requested !== "members" && requested !== "settings"
      ? defaultTab
      : (requested ?? defaultTab);
  const tabs = [
    ...(canViewCertificates || isNonMemberAdmin
      ? [
          { value: "certificates", label: "Certificate inventory", disabled: isNonMemberAdmin },
          { value: "requests", label: "Certificate requests", disabled: isNonMemberAdmin }
        ]
      : []),
    ...(canViewSyncs || isNonMemberAdmin
      ? [{ value: "syncs", label: "Certificate syncs", disabled: isNonMemberAdmin }]
      : []),
    { value: "members", label: "Members" },
    { value: "settings", label: "Settings" }
  ];
  return { tab, tabs };
};

const ApplicationDetail = ({
  orgId,
  projectId,
  application,
  access
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const navigate = useNavigate();
  const search = useSearch({ from: routeId });
  const remove = useV4Adapter("pkiApplications").useDeleteApplication();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  const can = (action: PkiApplicationResourceActions, subject: PkiApplicationResourceSub) =>
    appCan(access, action, subject);
  const canViewCertificates = can(
    PkiApplicationResourceActions.Read,
    PkiApplicationResourceSub.Certificates
  );
  const canViewSyncs = can(PkiApplicationResourceActions.Read, PkiApplicationResourceSub.PkiSyncs);
  const canEdit = can(PkiApplicationResourceActions.Edit, PkiApplicationResourceSub.Application);
  const canDelete = can(
    PkiApplicationResourceActions.Delete,
    PkiApplicationResourceSub.Application
  );
  const { tab, tabs } = resolveTabs({
    requested: search.selectedTab,
    isNonMemberAdmin: access.memberships.length === 0,
    canViewCertificates,
    canViewSyncs
  });

  const confirmDelete = async () => {
    setDeletePending(true);
    try {
      await remove.mutateAsync({ applicationId: application.id });
    } catch (error) {
      failed("Failed to delete application", error);
      return;
    } finally {
      setDeletePending(false);
    }
    saved(`Deleted ${application.name}`);
    navigate({ to: listPath, params: { orgId } });
  };

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[
            { label: "Applications", href: orgHref(orgId, "/cert-manager/applications") }
          ]}
          title={application.name}
          badges={<DocumentationLink href={APPLICATION_DOCS.overview} subject="Applications" />}
          description={application.description || undefined}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button layout="trigger" variant="outline" icon="more">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    copyId(application.id);
                    saved("Application ID copied");
                  }}
                >
                  <Icon name="copy" />
                  Copy application ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  description={canEdit ? undefined : RESTRICTED}
                  onSelect={() => setEditing(true)}
                >
                  <Icon name="pencil" />
                  Edit application
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete application
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          tabs={
            <Tabs
              label="Application sections"
              value={tab}
              tabs={tabs}
              onValueChange={(next) =>
                navigate({
                  to: routeId,
                  params: { orgId, applicationName: application.name },
                  search: { selectedTab: next as ApplicationTab }
                })
              }
            />
          }
        />
        {tab === "certificates" && canViewCertificates && (
          <CertificatesTab
            orgId={orgId}
            projectId={projectId}
            application={application}
            access={access}
            initialSearch={search.search}
          />
        )}
        {tab === "requests" && canViewCertificates && (
          <RequestsTab orgId={orgId} application={application} access={access} />
        )}
        {tab === "syncs" && canViewSyncs && (
          <SyncsTab orgId={orgId} projectId={projectId} application={application} access={access} />
        )}
        {tab === "members" && (
          <MembersTab projectId={projectId} application={application} access={access} />
        )}
        {tab === "settings" && (
          <SettingsTab
            orgId={orgId}
            projectId={projectId}
            application={application}
            access={access}
          />
        )}
      </Stack>
      <ApplicationDialog
        open={editing}
        application={application}
        onClose={() => setEditing(false)}
      />
      <AlertDialog open={deleting} onOpenChange={(open) => !open && setDeleting(false)}>
        <AlertDialogContent tone="danger" confirmText={application.name} pending={deletePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${application.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This detaches every profile, removes the application&apos;s syncs and alerts, and
              revokes memberships that only grant access here. Issued certificates stay in
              Certificate Manager without an application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              Delete application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

const Page = () => {
  const { orgId, applicationName } = useParams({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const adapter = useV4Adapter("pkiApplications");
  const { data: application, isPending, error } = adapter.useApplicationByName(applicationName);
  const permissions = adapter.useApplicationPermissions(application?.id ?? "");

  if (isResolving) return <Loader size="page" label="Loading application" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (isPending && !error) return <Loader size="page" label="Loading application" />;
  if (isForbidden(error) || isForbidden(permissions.error))
    return <AccessRestricted requirement={`access to ${applicationName}`} />;
  if (!application)
    return (
      <EmptyState
        icon="apps"
        title="Application not found"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/applications")}>Back to applications</a>
          </Button>
        }
      />
    );
  if (permissions.isPending || !permissions.data)
    return <Loader size="page" label="Loading application" />;
  return (
    <ApplicationDetail
      key={application.id}
      orgId={orgId}
      projectId={projectId}
      application={application}
      access={permissions.data}
    />
  );
};

export const ApplicationDetailsByIDPage = () => {
  const { applicationName } = useParams({ from: routeId });
  const { data: application } =
    useV4Adapter("pkiApplications").useApplicationByName(applicationName);
  return (
    <>
      <PageTitle title={application?.name ?? "Application"} />
      <Page />
    </>
  );
};
