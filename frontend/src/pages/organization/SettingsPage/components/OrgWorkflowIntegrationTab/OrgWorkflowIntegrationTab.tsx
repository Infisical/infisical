import { BsMicrosoftTeams, BsSlack } from "react-icons/bs";
import { faEllipsis, faGear, faInfoCircle, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
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
    return <Badge variant="primary">Pending</Badge>;
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

    const { currentOrg } = useOrganization();
    const { data: workflowIntegrations, isPending: isWorkflowIntegrationsLoading } =
      useGetWorkflowIntegrations(currentOrg?.id);

    const { mutateAsync: deleteSlackIntegration } = useDeleteSlackIntegration();
    const { mutateAsync: deleteMicrosoftTeamsIntegration } = useDeleteMicrosoftTeamsIntegration();
    const { mutateAsync: checkMicrosoftTeamsInstallationStatus } =
      useCheckMicrosoftTeamsIntegrationInstallationStatus();

    const handleRemoveIntegration = async () => {
      if (!currentOrg) {
        return;
      }

      const { platform, id } = popUp.removeIntegration.data;
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
        text: "Successfully deleted integration",
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
          <Table>
            <THead>
              <Tr>
                <Td>Provider</Td>
                <Td>Alias</Td>
                <Td>Status</Td>
              </Tr>
            </THead>
            <TBody>
              {isWorkflowIntegrationsLoading && (
                <TableSkeleton columns={2} innerKey="integrations-loading" />
              )}
              {!isWorkflowIntegrationsLoading &&
                workflowIntegrations &&
                workflowIntegrations.length === 0 && (
                  <Tr>
                    <Td colSpan={5}>
                      <EmptyState title="No workflow integrations found" icon={faGear} />
                    </Td>
                  </Tr>
                )}
              {workflowIntegrations?.map((workflowIntegration) => (
                <Tr key={workflowIntegration.id}>
                  <Td className="flex max-w-xs items-center gap-2 overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
                    {workflowIntegration.integration === WorkflowIntegrationPlatform.SLACK ? (
                      <BsSlack />
                    ) : (
                      <BsMicrosoftTeams />
                    )}
                    <div className="capitalize">
                      {workflowIntegration.integration.replaceAll("-", " ")}
                    </div>
                    {workflowIntegration.description && (
                      <Tooltip content={workflowIntegration.description}>
                        <FontAwesomeIcon icon={faInfoCircle} className="text-gray-400" size="sm" />
                      </Tooltip>
                    )}
                  </Td>
                  <Td>{workflowIntegration.slug}</Td>
                  <Td>{renderStatus(workflowIntegration.status)}</Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="rounded-lg">
                        <div className="flex justify-end hover:text-primary-400 data-[state=open]:text-primary-400">
                          <FontAwesomeIcon size="sm" icon={faEllipsis} />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();

                            handlePopUpOpen("integrationDetails", {
                              id: workflowIntegration.id,
                              platform: workflowIntegration.integration
                            });
                          }}
                        >
                          More details
                        </DropdownMenuItem>

                        {workflowIntegration.integration === WorkflowIntegrationPlatform.SLACK && (
                          <OrgPermissionCan
                            I={OrgPermissionActions.Create}
                            an={OrgPermissionSubjects.Settings}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                disabled={!isAllowed}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async (e) => {
                                  e.stopPropagation();

                                  await triggerSlackReinstall(workflowIntegration.id);
                                }}
                              >
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
                                disabled={!isAllowed}
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async (e) => {
                                  e.stopPropagation();

                                  await triggerMicrosoftTeamsInstallationStatusCheck(
                                    workflowIntegration.id
                                  );
                                }}
                              >
                                Check Installation Status
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
                              disabled={!isAllowed}
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();

                                handlePopUpOpen("removeIntegration", {
                                  id: workflowIntegration.id,
                                  slug: workflowIntegration.slug,
                                  platform: workflowIntegration.integration
                                });
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
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
        <DeleteActionModal
          isOpen={popUp.removeIntegration.isOpen}
          title={`Are you sure you want to remove ${popUp?.removeIntegration?.data?.slug}?`}
          onChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleRemoveIntegration}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
