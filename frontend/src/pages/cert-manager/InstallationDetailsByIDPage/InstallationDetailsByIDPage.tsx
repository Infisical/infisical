import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstablePageLoader
} from "@app/components/v3";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useDeletePkiInstallation, useGetPkiInstallation } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { InstallationCertificatesSection, InstallationDetailsSection } from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { installationId, projectId, orgId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/installations/$installationId"
  });

  const { data: installation, isLoading } = useGetPkiInstallation({ installationId });
  const deleteInstallation = useDeletePkiInstallation();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteInstallation"
  ] as const);

  if (isLoading) {
    return <UnstablePageLoader />;
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
        params: { orgId, projectId }
      });
    } catch {
      // Error handled by mutation
    }
  };

  const displayName =
    installation.name ||
    installation.locationDetails.fqdn ||
    (installation.locationDetails.ipAddress
      ? `${installation.locationDetails.ipAddress}:${installation.locationDetails.port || 443}`
      : "Installation");

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/discovery"
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
        >
          <ChevronLeftIcon size={16} />
          Installations
        </Link>
        <PageHeader
          scope={ProjectType.CertificateManager}
          description="Certificate Installation Details"
          title={displayName}
        >
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <Button variant="outline">
                Options
                <EllipsisIcon />
              </Button>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end">
              <ProjectPermissionCan
                I={ProjectPermissionPkiCertificateInstallationActions.Delete}
                a={ProjectPermissionSub.PkiCertificateInstallations}
              >
                {(isAllowed) => (
                  <UnstableDropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("deleteInstallation")}
                  >
                    Delete
                  </UnstableDropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </PageHeader>

        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="w-full lg:max-w-[24rem]">
            <InstallationDetailsSection installation={installation} />
          </div>
          <div className="flex flex-1 flex-col gap-y-5">
            <InstallationCertificatesSection certificates={installation.certificates || []} />
          </div>
        </div>
      </div>

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
