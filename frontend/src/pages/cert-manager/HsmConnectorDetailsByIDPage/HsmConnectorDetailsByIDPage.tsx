import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { AccessRestrictedBanner, PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useGetHsmConnectorById, useTestHsmConnector } from "@app/hooks/api/hsmConnectors";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DeleteHsmConnectorDialog } from "../SettingsPage/components/HsmConnectorsTab/DeleteHsmConnectorDialog";
import { EditHsmConnectorSheet } from "../SettingsPage/components/HsmConnectorsTab/EditHsmConnectorSheet";
import { HsmConnectorLinkedResourcesSection, HsmConnectorOverviewSection } from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { connectorId } = useParams({
    from: ROUTE_PATHS.CertManager.HsmConnectorDetailsByIDPage.id
  });

  const { data: connector } = useGetHsmConnectorById(connectorId);
  const testMutation = useTestHsmConnector();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const projectId = currentProject?.id || "";

  const navigateBackToList = () => {
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
      params: { orgId: currentOrg.id, projectId },
      search: { selectedTab: "hsm-connectors" }
    });
  };

  const handleTest = async () => {
    if (!connector) return;
    try {
      const result = await testMutation.mutateAsync({ connectorId: connector.id });
      if (result.ok) {
        createNotification({
          type: "success",
          text: "HSM Connector verified. Gateway reached the HSM and the slot is online."
        });
      } else {
        const failed = result.members.find((m) => !m.ok);
        createNotification({
          type: "error",
          text:
            failed && !failed.ok
              ? `Verify failed (${failed.errorCode}): ${failed.errorMessage}`
              : "Verify against the HSM failed."
        });
      }
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to verify HSM Connector"
      });
    }
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {connector && (
        <ProjectPermissionCan
          I={ProjectPermissionHsmConnectorActions.Read}
          a={ProjectPermissionSub.HsmConnectors}
        >
          {(isAllowed) =>
            isAllowed ? (
              <div className="mx-auto mb-6 w-full max-w-8xl">
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/settings"
                  params={{ orgId: currentOrg.id, projectId }}
                  search={{ selectedTab: "hsm-connectors" }}
                  className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                >
                  <ChevronLeftIcon className="size-4" />
                  HSM Connectors
                </Link>
                <PageHeader
                  scope={ProjectType.CertificateManager}
                  description={connector.description || "Hardware security module connector"}
                  title={connector.name}
                />
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="w-full lg:max-w-[24rem]">
                    <HsmConnectorOverviewSection
                      connector={connector}
                      onTest={handleTest}
                      onEdit={() => setIsEditOpen(true)}
                      onDelete={() => setIsDeleteOpen(true)}
                      isTesting={testMutation.isPending}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-y-5">
                    <HsmConnectorLinkedResourcesSection connectorId={connector.id} />
                  </div>
                </div>

                <EditHsmConnectorSheet
                  connector={isEditOpen ? connector : null}
                  onClose={() => setIsEditOpen(false)}
                />

                <DeleteHsmConnectorDialog
                  connector={isDeleteOpen ? connector : null}
                  onClose={() => setIsDeleteOpen(false)}
                  onDeleted={navigateBackToList}
                />
              </div>
            ) : (
              <div className="container mx-auto flex h-full items-center justify-center">
                <AccessRestrictedBanner />
              </div>
            )
          }
        </ProjectPermissionCan>
      )}
    </div>
  );
};

export const HsmConnectorDetailsByIDPage = () => (
  <>
    <Helmet>
      <title>HSM Connectors</title>
      <link rel="icon" href="/infisical.ico" />
    </Helmet>
    <Page />
  </>
);
