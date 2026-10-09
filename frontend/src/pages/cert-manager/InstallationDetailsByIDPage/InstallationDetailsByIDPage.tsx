import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  CircleAlertIcon,
  EllipsisIcon,
  LockIcon,
  TriangleAlertIcon
} from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  PageHeader,
  PageLoader
} from "@app/components/v3";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { PkiKeystoreStatus, useDeletePkiInstallation, useGetPkiInstallation } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import {
  canSetKeystorePassword,
  getEndpoint,
  useCanRescanPkiInstallations
} from "@app/pages/cert-manager/pki-discovery-utils";

import {
  RESCAN_POLL_INTERVAL_MS,
  RESCAN_POLL_TIMEOUT_MS,
  SetKeystorePasswordDialog
} from "../DiscoveryPage/components/SetKeystorePasswordDialog";
import { InstallationCertificatesSection, InstallationDetailsSection } from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const canRescanInstallation = useCanRescanPkiInstallations();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { installationId, projectId, orgId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/installations/$installationId"
  });

  const [pendingRescan, setPendingRescan] = useState<{
    previousCheckedAt?: string;
    startedAt: number;
  } | null>(null);
  const { data: installation, isLoading } = useGetPkiInstallation(
    { installationId },
    {
      refetchInterval: (current) =>
        pendingRescan &&
        current?.metadata?.lastCheckedAt === pendingRescan.previousCheckedAt &&
        Date.now() - pendingRescan.startedAt < RESCAN_POLL_TIMEOUT_MS
          ? RESCAN_POLL_INTERVAL_MS
          : false
    }
  );
  const deleteInstallation = useDeletePkiInstallation();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteInstallation",
    "setKeystorePassword"
  ] as const);

  if (isLoading) {
    return <PageLoader />;
  }

  if (!installation) {
    return null;
  }

  const handleDelete = async () => {
    try {
      await deleteInstallation.mutateAsync({
        installationId,
        projectId
      });
      handlePopUpClose("deleteInstallation");
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery",
        params: { orgId, projectId },
        search: { selectedTab: "installations" }
      });
    } catch {
      // Error handled by mutation
    }
  };

  const displayName = installation.name || getEndpoint(installation);
  const isPasswordSettable = canSetKeystorePassword(installation);
  const keystoreStatus = installation.metadata?.keystoreStatus;
  const passwordActionLabel = installation.hasKeystorePassword ? "Change Password" : "Set Password";

  const openPasswordDialog = () => handlePopUpOpen("setKeystorePassword");

  return (
    <div className="mx-auto flex flex-col justify-between text-foreground-inverse">
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
          backLink={
            <Link
              to="/organizations/$orgId/projects/cert-manager/$projectId/discovery"
              params={{ orgId: currentOrg.id, projectId: currentProject.id }}
              search={{ selectedTab: "installations" }}
            >
              <ChevronLeftIcon size={16} />
              Installations
            </Link>
          }
          scope={ProjectType.CertificateManager}
          description="Certificate Installation Details"
          title={displayName}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Options
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isPasswordSettable && (
                <DropdownMenuItem isDisabled={!canRescanInstallation} onClick={openPasswordDialog}>
                  {passwordActionLabel}
                </DropdownMenuItem>
              )}
              <ProjectPermissionCan
                I={ProjectPermissionPkiCertificateInstallationActions.Delete}
                a={ProjectPermissionSub.PkiCertificateInstallations}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("deleteInstallation")}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </PageHeader>

        {keystoreStatus === PkiKeystoreStatus.PasswordFailed && (
          <Alert variant="danger" className="mb-5">
            <CircleAlertIcon />
            <AlertTitle>The saved password did not open this keystore</AlertTitle>
            <AlertDescription>
              {installation.metadata?.lastError ||
                "Change the password and the file is scanned again."}
            </AlertDescription>
          </Alert>
        )}
        {keystoreStatus !== PkiKeystoreStatus.PasswordFailed &&
          installation.metadata?.lastError && (
            <Alert variant="warning" className="mb-5">
              <TriangleAlertIcon />
              <AlertTitle>The last read of this file failed</AlertTitle>
              <AlertDescription>{installation.metadata.lastError}</AlertDescription>
            </Alert>
          )}
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="w-full lg:max-w-[24rem]">
            <InstallationDetailsSection installation={installation} />
          </div>
          <div className="flex flex-1 flex-col gap-y-5">
            <InstallationCertificatesSection
              certificates={installation.certificates || []}
              emptyState={
                keystoreStatus === PkiKeystoreStatus.Locked ||
                keystoreStatus === PkiKeystoreStatus.PasswordFailed ? (
                  <Empty className="border">
                    <EmptyMedia variant="icon">
                      <LockIcon />
                    </EmptyMedia>
                    <EmptyDescription>
                      {keystoreStatus === PkiKeystoreStatus.Locked
                        ? "This keystore needs a password before its certificates can be read."
                        : "The certificates in this keystore can be read once the right password is saved."}
                    </EmptyDescription>
                    <EmptyContent>
                      <Button
                        variant="project"
                        isDisabled={!canRescanInstallation}
                        onClick={openPasswordDialog}
                      >
                        {passwordActionLabel}
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>

      <SetKeystorePasswordDialog
        isOpen={popUp.setKeystorePassword.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("setKeystorePassword", isOpen)}
        onSaved={() =>
          setPendingRescan({
            previousCheckedAt: installation.metadata?.lastCheckedAt,
            startedAt: Date.now()
          })
        }
        projectId={projectId}
        installation={installation}
      />

      <DeleteActionModal
        isOpen={popUp.deleteInstallation.isOpen}
        title="Are you sure you want to delete this installation?"
        subTitle="This action cannot be undone. The installation record will be permanently deleted."
        onChange={(isOpen) => handlePopUpToggle("deleteInstallation", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};

export const InstallationDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Installation Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
