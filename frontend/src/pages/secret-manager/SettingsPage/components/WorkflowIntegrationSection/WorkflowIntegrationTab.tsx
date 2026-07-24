import { Plus, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectWorkflowIntegration,
  useGetWorkspaceWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationSheet } from "./components/AddWorkflowIntegrationSheet";
import { EditWorkflowIntegrationSheet } from "./components/EditWorkflowIntegrationSheet";
import { MicrosoftTeamsConfigRow } from "./components/MicrosoftTeamsConfigRow";
import { SlackConfigRow } from "./components/SlackConfigRow";
import { WORKFLOW_INTEGRATION_PLATFORM_LABELS } from "./constants";

export const WorkflowIntegrationTab = withProjectPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWorkflowIntegration",
      "removeIntegration",
      "editIntegration"
    ] as const);

    const { currentProject } = useProject();
    const { data: slackConfig, isPending: isSlackConfigLoading } =
      useGetWorkspaceWorkflowIntegrationConfig({
        projectId: currentProject?.id ?? "",
        integration: WorkflowIntegrationPlatform.SLACK
      });

    const { data: microsoftTeamsConfig, isPending: isMicrosoftTeamsConfigLoading } =
      useGetWorkspaceWorkflowIntegrationConfig({
        projectId: currentProject?.id ?? "",
        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
      });

    const { mutateAsync: deleteIntegration } = useDeleteProjectWorkflowIntegration();

    const isConfigLoading = isSlackConfigLoading || isMicrosoftTeamsConfigLoading;
    const hasConfiguredIntegration = !!slackConfig || !!microsoftTeamsConfig;

    const removeIntegrationData = popUp.removeIntegration.data as
      | { integration: WorkflowIntegrationPlatform; integrationId: string }
      | undefined;
    const removeIntegrationLabel = removeIntegrationData
      ? WORKFLOW_INTEGRATION_PLATFORM_LABELS[removeIntegrationData.integration]
      : "workflow";

    const handleRemoveIntegration = async () => {
      if (!currentProject.id || !removeIntegrationData) {
        return;
      }

      await deleteIntegration({
        projectId: currentProject.id,
        integration: removeIntegrationData.integration,
        integrationId: removeIntegrationData.integrationId
      });

      handlePopUpClose("removeIntegration");
      createNotification({
        type: "success",
        text: `Removed ${removeIntegrationLabel} integration from this project`
      });
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow Integrations</CardTitle>
          <CardDescription>
            Send notifications for access requests, secret approval requests, and secret sync errors
            to Slack or Microsoft Teams.
          </CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  size="sm"
                  onClick={() => handlePopUpOpen("addWorkflowIntegration")}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  Add integration
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isConfigLoading && !hasConfiguredIntegration ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No workflow integrations configured</EmptyTitle>
                <EmptyDescription>
                  Add a workflow integration to send this project&apos;s notifications to Slack or
                  Microsoft Teams.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/5">Provider</TableHead>
                  <TableHead>Access request notifications</TableHead>
                  <TableHead>Secret request notifications</TableHead>
                  <TableHead>Secret sync error notifications</TableHead>
                  <TableHead className="w-px text-right" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isConfigLoading &&
                  Array.from({ length: 2 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`workflow-integration-skeleton-${idx}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isConfigLoading && (
                  <>
                    <SlackConfigRow handlePopUpOpen={handlePopUpOpen} slackConfig={slackConfig} />
                    <MicrosoftTeamsConfigRow
                      handlePopUpOpen={handlePopUpOpen}
                      microsoftTeamsConfig={microsoftTeamsConfig}
                    />
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <AddWorkflowIntegrationSheet
          isOpen={popUp.addWorkflowIntegration.isOpen}
          onOpenChange={(state) => handlePopUpToggle("addWorkflowIntegration", state)}
        />
        <EditWorkflowIntegrationSheet
          isOpen={popUp.editIntegration.isOpen}
          onClose={() => handlePopUpClose("editIntegration")}
          integration={popUp.editIntegration.data?.integration}
        />
        <AlertDialog
          open={popUp.removeIntegration.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>
                Remove {removeIntegrationLabel} integration from this project?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This project will stop sending notifications to {removeIntegrationLabel}. You can
                add the integration again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={handleRemoveIntegration}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Settings }
);
