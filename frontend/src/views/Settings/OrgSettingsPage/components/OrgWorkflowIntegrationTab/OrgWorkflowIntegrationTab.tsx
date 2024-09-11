import { useRouter } from "next/router";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { faEllipsis, faGear, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
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
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  fetchSlackReinstallUrl,
  useDeleteSlackIntegration,
  useGetWorkflowIntegrations
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { AddWorkflowIntegrationForm } from "./AddWorkflowIntegrationForm";
import { IntegrationFormDetails } from "./IntegrationFormDetails";

export const OrgWorkflowIntegrationTab = withPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWorkflowIntegration",
      "integrationDetails",
      "removeIntegration"
    ] as const);

    const { currentOrg } = useOrganization();
    const router = useRouter();
    const { data: workflowIntegrations, isLoading: isWorkflowIntegrationsLoading } =
      useGetWorkflowIntegrations(currentOrg?.id);

    const { mutateAsync: deleteSlackIntegration } = useDeleteSlackIntegration();

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

      handlePopUpClose("removeIntegration");
      createNotification({
        text: "Successfully deleted integration",
        type: "success"
      });
    };

    const triggerReinstall = async (platform: WorkflowIntegrationPlatform, id: string) => {
      if (platform === WorkflowIntegrationPlatform.SLACK) {
        try {
          const slackReinstallUrl = await fetchSlackReinstallUrl({
            id
          });

          if (slackReinstallUrl) {
            router.push(slackReinstallUrl);
          }
        } catch (err) {
          if (axios.isAxiosError(err)) {
            createNotification({
              text: (err.response?.data as { message: string })?.message,
              type: "error"
            });
          }
        }
      }
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
                  <Td className="flex max-w-xs items-center overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
                    <FontAwesomeIcon icon={faSlack} />
                    <div className="ml-2">{workflowIntegration.integration.toUpperCase()}</div>
                  </Td>
                  <Td>{workflowIntegration.slug}</Td>
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
                              onClick={(e) => {
                                e.stopPropagation();

                                triggerReinstall(
                                  workflowIntegration.integration,
                                  workflowIntegration.id
                                );
                              }}
                            >
                              Reinstall
                            </DropdownMenuItem>
                          )}
                        </OrgPermissionCan>
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
          title={`Are you sure want to remove ${popUp?.removeIntegration?.data?.slug}?`}
          onChange={(isOpen) => handlePopUpToggle("removeIntegration", isOpen)}
          deleteKey="confirm"
          onDeleteApproved={handleRemoveIntegration}
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Settings }
);
