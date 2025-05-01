import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";
import { faGear, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  Table,
  TableContainer,
  TBody,
  Td,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectWorkflowIntegration,
  useGetWorkspaceWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationModal } from "./components/AddWorkflowIntegrationModal";
import { EditWorkflowIntegrationModal } from "./components/EditWorkflowIntegrationModal";
import { MicrosoftTeamsConfigRow } from "./components/MicrosoftTeamsConfigRow";
import { SlackConfigRow } from "./components/SlackConfigRow";

export const renderProvider = (integration: WorkflowIntegrationPlatform) => {
  if (integration === WorkflowIntegrationPlatform.SLACK) {
    return <BsSlack />;
  }

  if (integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS) {
    return <BsMicrosoftTeams />;
  }

  return null;
};

export const WorkflowIntegrationTab = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "addWorkflowIntegration",
    "removeIntegration",
    "editIntegration"
  ] as const);

  const { currentWorkspace } = useWorkspace();
  const { data: slackConfig, isPending: isSlackConfigLoading } =
    useGetWorkspaceWorkflowIntegrationConfig({
      workspaceId: currentWorkspace?.id ?? "",
      integration: WorkflowIntegrationPlatform.SLACK
    });

  const { data: microsoftTeamsConfig, isPending: isMicrosoftTeamsConfigLoading } =
    useGetWorkspaceWorkflowIntegrationConfig({
      workspaceId: currentWorkspace?.id ?? "",
      integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
    });

  const { mutateAsync: deleteIntegration } = useDeleteProjectWorkflowIntegration();

  const handleRemoveIntegration = async (
    integrationType: WorkflowIntegrationPlatform,
    integrationId: string
  ) => {
    if (!currentWorkspace.id) {
      return;
    }

    await deleteIntegration({
      projectId: currentWorkspace?.id ?? "",
      integration: integrationType,
      integrationId
    });

    createNotification({
      type: "success",
      text: `Successfully removed ${integrationType.replace("-", " ").replace(/\b\w/g, (char) => char.toUpperCase())} integration`
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Workflow Integrations</p>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Settings}>
          {(isAllowed) => (
            <Button
              onClick={() => {
                handlePopUpOpen("addWorkflowIntegration");
              }}
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
            >
              Add
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <p className="mb-4 text-gray-400">
        Connect Infisical to other platforms for notification and workflow integrations.
      </p>
      <TableContainer>
        {!!slackConfig || !!microsoftTeamsConfig ? (
          <Table>
            <THead>
              <Tr>
                <Td>Provider</Td>
                <Td>Access Request Notifications Destination</Td>
                <Td>Secret Request Notifications Destination</Td>
                <Td />
              </Tr>
            </THead>
            <TBody>
              <SlackConfigRow
                handlePopUpOpen={handlePopUpOpen}
                isSlackConfigLoading={isSlackConfigLoading}
                slackConfig={slackConfig}
              />
              <MicrosoftTeamsConfigRow
                handlePopUpOpen={handlePopUpOpen}
                isMicrosoftTeamsConfigLoading={isMicrosoftTeamsConfigLoading}
                microsoftTeamsConfig={microsoftTeamsConfig}
              />
            </TBody>
          </Table>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <EmptyState
              title="No project workflow integrations configured. Add a new workflow integration to get started"
              icon={faGear}
            />
          </div>
        )}
      </TableContainer>
      <AddWorkflowIntegrationModal
        isOpen={popUp.addWorkflowIntegration.isOpen}
        onToggle={(state) => handlePopUpToggle("addWorkflowIntegration", state)}
      />
      <DeleteActionModal
        isOpen={popUp.removeIntegration.isOpen}
        title="Are you sure want to remove this integration?"
        onChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          await handleRemoveIntegration(
            popUp.removeIntegration.data?.integration,
            popUp.removeIntegration.data?.integrationId
          );
          handlePopUpClose("removeIntegration");
        }}
      />
      <EditWorkflowIntegrationModal
        isOpen={popUp.editIntegration.isOpen}
        onClose={() => handlePopUpClose("editIntegration")}
        integration={popUp.editIntegration.data?.integration}
      />
    </div>
  );
};
