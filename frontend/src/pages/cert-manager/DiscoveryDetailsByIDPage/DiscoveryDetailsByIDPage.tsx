import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstablePageLoader
} from "@app/components/v3";
import {
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import {
  PkiDiscoveryScanStatus,
  TPkiDiscovery,
  useDeletePkiDiscovery,
  useGetPkiDiscovery,
  useTriggerPkiDiscoveryScan
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { DiscoveryJobModal } from "../DiscoveryPage/components/DiscoveryJobModal";
import {
  DiscoveryDetailsSection,
  DiscoveryInstallationsSection,
  DiscoveryScanLogsSection,
  DiscoveryTargetSection
} from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { discoveryId, projectId, orgId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/$discoveryId"
  });

  const { data: discovery, isLoading } = useGetPkiDiscovery({ discoveryId });
  const triggerScan = useTriggerPkiDiscoveryScan();
  const deleteDiscovery = useDeletePkiDiscovery();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "editJob",
    "deleteJob"
  ] as const);

  if (isLoading) {
    return <UnstablePageLoader />;
  }

  if (!discovery) {
    return null;
  }

  const handleTriggerScan = async () => {
    try {
      await triggerScan.mutateAsync({ discoveryId, projectId });
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDiscovery.mutateAsync({ discoveryId });
      handlePopUpClose("deleteJob");
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery",
        params: { orgId, projectId }
      });
    } catch {
      // Error handled by mutation
    }
  };

  const isScanRunning =
    discovery.lastScanStatus === PkiDiscoveryScanStatus.Running ||
    discovery.lastScanStatus === PkiDiscoveryScanStatus.Pending;

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/discovery"
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
        >
          <ChevronLeftIcon size={16} />
          Jobs
        </Link>
        <PageHeader
          scope={ProjectType.CertificateManager}
          description="Certificate Discovery Job"
          title={
            <span className="inline-flex max-w-full items-center gap-x-3">
              <span className="truncate" title={discovery.name}>
                {discovery.name}
              </span>
              {discovery.isAutoScanEnabled && <Badge variant="info">Auto-Scan</Badge>}
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <UnstableDropdownMenu>
              <UnstableDropdownMenuTrigger asChild>
                <Button variant="outline">
                  Options
                  <EllipsisIcon />
                </Button>
              </UnstableDropdownMenuTrigger>
              <UnstableDropdownMenuContent align="end">
                <ProjectPermissionCan
                  I={ProjectPermissionPkiDiscoveryActions.Edit}
                  a={ProjectPermissionSub.PkiDiscovery}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("editJob", discovery)}
                    >
                      Edit
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionPkiDiscoveryActions.Delete}
                  a={ProjectPermissionSub.PkiDiscovery}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("deleteJob")}
                    >
                      Delete
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </UnstableDropdownMenuContent>
            </UnstableDropdownMenu>
          </div>
        </PageHeader>

        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex w-full flex-col gap-5 lg:max-w-[24rem]">
            <DiscoveryDetailsSection discovery={discovery} />
            <DiscoveryTargetSection discovery={discovery} />
          </div>
          <div className="flex flex-1 flex-col gap-y-5">
            <DiscoveryScanLogsSection
              discoveryId={discoveryId}
              onTriggerScan={handleTriggerScan}
              isTriggerDisabled={!discovery.isActive || isScanRunning}
              isTriggerPending={triggerScan.isPending}
            />
            <DiscoveryInstallationsSection discoveryId={discoveryId} projectId={projectId} />
          </div>
        </div>
      </div>

      <DiscoveryJobModal
        isOpen={popUp.editJob.isOpen}
        onClose={() => handlePopUpClose("editJob")}
        projectId={projectId}
        discovery={popUp.editJob.data as TPkiDiscovery | undefined}
      />

      <DeleteActionModal
        isOpen={popUp.deleteJob.isOpen}
        title="Are you sure you want to delete this discovery job?"
        subTitle="This action cannot be undone. The discovery configuration will be permanently deleted."
        onChange={(isOpen) => handlePopUpToggle("deleteJob", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
    </div>
  );
};

export const DiscoveryDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Discovery Job Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
