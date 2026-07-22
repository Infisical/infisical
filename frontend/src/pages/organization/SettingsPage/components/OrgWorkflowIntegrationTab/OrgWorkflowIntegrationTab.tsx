import { useState } from "react";
import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";
import axios from "axios";
import { Info, MoreHorizontal, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  fetchSlackReinstallUrl,
  useCheckMicrosoftTeamsIntegrationInstallationStatus,
  useDeleteMicrosoftTeamsIntegration,
  useDeleteSlackIntegration,
  useGetWorkflowIntegrations
} from "@app/hooks/api";
import {
  WorkflowIntegrationPlatform,
  WorkflowIntegrationStatus
} from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationForm } from "./AddWorkflowIntegrationForm";
import { IntegrationFormDetails } from "./IntegrationFormDetails";

const renderStatus = (status: WorkflowIntegrationStatus) => {
  if (status === WorkflowIntegrationStatus.Installed) {
    return <Badge variant="success">Installed</Badge>;
  }

  if (status === WorkflowIntegrationStatus.Pending) {
    return <Badge variant="warning">Pending</Badge>;
  }

  return <Badge variant="danger">Failed</Badge>;
};

export const OrgWorkflowIntegrationTab = withPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWorkflowIntegration",
      "integrationDetails",
      "removeIntegration"
    ] as const);
    const [deleteConfirmation, setDeleteConfirmation] = useState("");

    const { currentOrg } = useOrganization();
    const { data: workflowIntegrations, isPending: isWorkflowIntegrationsLoading } =
      useGetWorkflowIntegrations(currentOrg?.id);

    const { mutateAsync: deleteSlackIntegration, isPending: isDeletingSlackIntegration } =
      useDeleteSlackIntegration();
    const {
      mutateAsync: deleteMicrosoftTeamsIntegration,
      isPending: isDeletingMicrosoftTeamsIntegration
    } = useDeleteMicrosoftTeamsIntegration();
    const { mutateAsync: checkMicrosoftTeamsInstallationStatus } =
      useCheckMicrosoftTeamsIntegrationInstallationStatus();

    const isDeletingIntegration = isDeletingSlackIntegration || isDeletingMicrosoftTeamsIntegration;

    const removeIntegrationData = popUp.removeIntegration.data as
      | { id: string; slug: string; platform: WorkflowIntegrationPlatform }
      | undefined;

    const handleRemoveIntegration = async () => {
      if (!currentOrg || !removeIntegrationData) {
        return;
      }

      const { platform, id, slug } = removeIntegrationData;
      if (platform === WorkflowIntegrationPlatform.SLACK) {
        await deleteSlackIntegration({
          id,
          orgId: currentOrg?.id
        });
      }

      if (platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS) {
        await deleteMicrosoftTeamsIntegration({
          id,
          orgId: currentOrg?.id
        });
      }

      handlePopUpClose("removeIntegration");
      createNotification({
        text: `Deleted integration "${slug}"`,
        type: "success"
      });
    };

    const triggerSlackReinstall = async (id: string) => {
      try {
        const slackReinstallUrl = await fetchSlackReinstallUrl({
          id
        });

        if (slackReinstallUrl) {
          window.location.href = slackReinstallUrl;
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          createNotification({
            text: (err.response?.data as { message: string })?.message,
            type: "error"
          });
        }
      }
    };

    const triggerMicrosoftTeamsInstallationStatusCheck = async (id: string) => {
      await checkMicrosoftTeamsInstallationStatus({
        workflowIntegrationId: id,
        orgId: currentOrg?.id
      });

      createNotification({
        text: "The Microsoft Teams bot is successfully installed in your Microsoft Teams tenant",
        type: "success"
      });
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow Integrations</CardTitle>
          <CardDescription>
            Connect Infisical to other platforms for notification and workflow integrations.
          </CardDescription>
          <CardAction>
            <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Settings}>
              {(isAllowed) => (
                <Button
                  variant="org"
                  size="sm"
                  onClick={() => {
                    handlePopUpOpen("addWorkflowIntegration");
                  }}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  Add integration
                </Button>
              )}
            </OrgPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isWorkflowIntegrationsLoading && workflowIntegrations?.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No workflow integrations connected</EmptyTitle>
                <EmptyDescription>
                  Connect Slack or Microsoft Teams to enable notification and approval workflows.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Provider</TableHead>
                  <TableHead>Alias</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px text-right" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isWorkflowIntegrationsLoading &&
                  Array.from({ length: 2 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`workflow-integration-skeleton-${idx}`}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isWorkflowIntegrationsLoading &&
                  workflowIntegrations?.map((workflowIntegration) => (
                    <TableRow key={workflowIntegration.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {workflowIntegration.integration === WorkflowIntegrationPlatform.SLACK ? (
                            <BsSlack />
                          ) : (
                            <BsMicrosoftTeams />
                          )}
                          <span className="capitalize">
                            {workflowIntegration.integration.replaceAll("-", " ")}
                          </span>
                          {workflowIntegration.description && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Info className="size-3.5 text-muted" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{workflowIntegration.description}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-0">
                        <p className="truncate">{workflowIntegration.slug}</p>
                      </TableCell>
                      <TableCell>{renderStatus(workflowIntegration.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                aria-label={`Actions for integration ${workflowIntegration.slug}`}
                              >
                                <MoreHorizontal />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() =>
                                  handlePopUpOpen("integrationDetails", {
                                    id: workflowIntegration.id,
                                    platform: workflowIntegration.integration
                                  })
                                }
                              >
                                <Info />
                                View details
                              </DropdownMenuItem>
                              {workflowIntegration.integration ===
                                WorkflowIntegrationPlatform.SLACK && (
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Create}
                                  an={OrgPermissionSubjects.Settings}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() => triggerSlackReinstall(workflowIntegration.id)}
                                    >
                                      <RotateCcw />
                                      Reinstall
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              {workflowIntegration.integration ===
                                WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
                                <OrgPermissionCan
                                  I={OrgPermissionActions.Edit}
                                  an={OrgPermissionSubjects.Settings}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      onClick={() =>
                                        triggerMicrosoftTeamsInstallationStatusCheck(
                                          workflowIntegration.id
                                        )
                                      }
                                    >
                                      <ShieldCheck />
                                      Check installation status
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              )}
                              <OrgPermissionCan
                                I={OrgPermissionActions.Delete}
                                an={OrgPermissionSubjects.Settings}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    variant="danger"
                                    isDisabled={!isAllowed}
                                    onClick={() =>
                                      handlePopUpOpen("removeIntegration", {
                                        id: workflowIntegration.id,
                                        slug: workflowIntegration.slug,
                                        platform: workflowIntegration.integration
                                      })
                                    }
                                  >
                                    <Trash2 />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <AddWorkflowIntegrationForm
          isOpen={popUp.addWorkflowIntegration.isOpen}
          onToggle={(state) => handlePopUpToggle("addWorkflowIntegration", state)}
        />
        <IntegrationFormDetails
          isOpen={popUp.integrationDetails?.isOpen}
          workflowPlatform={popUp.integrationDetails?.data?.platform}
          id={popUp.integrationDetails?.data?.id}
          onOpenChange={(state) => handlePopUpToggle("integrationDetails", state)}
        />
        <AlertDialog
          open={popUp.removeIntegration.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("removeIntegration", isOpen);
            if (!isOpen) setDeleteConfirmation("");
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>
                Delete integration &quot;{removeIntegrationData?.slug}&quot;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Projects using this integration will stop sending notifications to it. This cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="w-full">
              <p className="mb-2 text-sm text-muted">
                Type {removeIntegrationData?.slug ?? ""} to confirm.
              </p>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={removeIntegrationData?.slug ?? ""}
                aria-label="Confirm integration alias"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="danger"
                size="sm"
                onClick={handleRemoveIntegration}
                isPending={isDeletingIntegration}
                isDisabled={
                  isDeletingIntegration ||
                  !removeIntegrationData?.slug ||
                  deleteConfirmation !== removeIntegrationData.slug
                }
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
