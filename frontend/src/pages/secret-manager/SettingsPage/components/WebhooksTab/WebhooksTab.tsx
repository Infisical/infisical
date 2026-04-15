import { useTranslation } from "react-i18next";
import { faInfoCircle, faPlug, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
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
import { Badge } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useGetWebhooks,
  useTestWebhook,
  useUpdateWebhook
} from "@app/hooks/api";
import {
  TWebhook,
  WEBHOOK_EVENT_METADATA,
  WEBHOOK_EVENTS,
  WebhookEvent
} from "@app/hooks/api/webhooks/types";

import { AddWebhookForm, TFormSchema } from "./AddWebhookForm";
import { EditWebhookEventsModal } from "./EditWebhookEventsModal";

export const WebhooksTab = withProjectPermission(
  () => {
    const { t } = useTranslation();

    const { currentProject } = useProject();
    const projectId = currentProject?.id || "";
    const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
      "addWebhook",
      "deleteWebhook",
      "editWebhook"
    ] as const);

    const { data: webhooks, isPending: isWebhooksLoading } = useGetWebhooks(projectId);

    // mutation
    const { mutateAsync: createWebhook } = useCreateWebhook();
    const {
      mutateAsync: testWebhook,
      variables: testWebhookVars,
      isPending: isTestWebhookSubmitting
    } = useTestWebhook();
    const {
      mutateAsync: updateWebhook,
      variables: updateWebhookVars,
      isPending: isUpdateWebhookSubmitting
    } = useUpdateWebhook();
    const { mutateAsync: deleteWebhook } = useDeleteWebhook();

    const handleWebhookCreate = async (data: TFormSchema) => {
      // eventsFilter is the blocklist of events to filter OUT
      const eventsFilter = WEBHOOK_EVENTS.filter((event) => !data.enabledEvents[event]).map(
        (event) => ({ eventName: event })
      );

      await createWebhook({
        ...data,
        eventsFilter,
        projectId
      });
      handlePopUpClose("addWebhook");
      createNotification({
        type: "success",
        text: "Successfully created webhook"
      });
    };

    const handleWebhookDisable = async (webhookId: string, isDisabled: boolean) => {
      await updateWebhook({
        webhookId,
        projectId,
        isDisabled
      });
      createNotification({
        type: "success",
        text: "Successfully updated webhook"
      });
    };

    const handleWebhookEventsUpdate = async (
      webhookId: string,
      settings: Record<WebhookEvent, boolean>
    ) => {
      // eventsFilter is the blocklist — every unchecked event goes in.
      const eventsFilter = WEBHOOK_EVENTS.filter((event) => !settings[event]).map((event) => ({
        eventName: event
      }));

      await updateWebhook({
        webhookId,
        projectId,
        eventsFilter
      });
      handlePopUpClose("editWebhook");
      createNotification({
        type: "success",
        text: "Successfully updated webhook events"
      });
    };

    const handleWebhookDelete = async () => {
      const webhookId = popUp?.deleteWebhook?.data as string;
      await deleteWebhook({
        webhookId,
        projectId
      });
      handlePopUpClose("deleteWebhook");
      createNotification({
        type: "success",
        text: "Successfully deleted webhook"
      });
    };

    const handleWebhookTest = async (webhookId: string) => {
      await testWebhook({
        webhookId,
        projectId
      });
      createNotification({
        type: "success",
        text: "Successfully triggered webhook"
      });
    };

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <p className="text-xl font-medium text-mineshaft-100">{t("settings.webhooks.title")}</p>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.Webhooks}
          >
            {(isAllowed) => (
              <Button
                onClick={() => handlePopUpOpen("addWebhook")}
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
              >
                Create
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <p className="mb-8 text-gray-400">{t("settings.webhooks.description")}</p>
        <div>
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Td>URL</Td>
                  <Td>Environment</Td>
                  <Td>Secret Path</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <span>Events</span>
                      <Tooltip content="Events that are configured to trigger this webhook.">
                        <FontAwesomeIcon
                          icon={faInfoCircle}
                          size="xs"
                          className="text-mineshaft-400"
                        />
                      </Tooltip>
                    </div>
                  </Td>
                  <Td>Status</Td>
                  <Td className="text-right">Action</Td>
                </Tr>
              </THead>
              <TBody>
                {isWebhooksLoading && <TableSkeleton columns={6} innerKey="webhooks-loading" />}
                {!isWebhooksLoading && webhooks && webhooks?.length === 0 && (
                  <Tr>
                    <Td colSpan={6}>
                      <EmptyState title="No webhooks found" icon={faPlug} />
                    </Td>
                  </Tr>
                )}
                {!isWebhooksLoading &&
                  webhooks?.map((webhook) => {
                    const {
                      id,
                      url,
                      environment,
                      secretPath,
                      lastStatus,
                      isDisabled,
                      updatedAt,
                      lastRunErrorMessage
                    } = webhook;

                    const filteredSet = new Set(webhook.eventsFilter.map((e) => e.eventName));
                    const enabledEvents = WEBHOOK_EVENTS.filter((event) => !filteredSet.has(event));
                    const enabledEventsCount = enabledEvents.length;
                    const hasEnabledEvents = enabledEventsCount > 0;

                    return (
                      <Tr key={id}>
                        <Td className="max-w-xs overflow-hidden text-ellipsis hover:overflow-auto hover:break-all">
                          {url}
                          <p className="text-xs text-mineshaft-400">{id}</p>
                        </Td>
                        <Td>{environment.slug}</Td>
                        <Td>{secretPath}</Td>
                        <Td>
                          <Tooltip
                            content={
                              hasEnabledEvents ? (
                                <div className="text-xs">
                                  <p className="mb-1 font-medium">Enabled Events:</p>
                                  <ul className="list-disc space-y-0.5 pl-4">
                                    {enabledEvents.map((event) => (
                                      <li key={event}>{WEBHOOK_EVENT_METADATA[event].label}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                "This webhook is not triggered by any events."
                              )
                            }
                          >
                            <Badge variant={hasEnabledEvents ? "success" : "danger"}>
                              {hasEnabledEvents
                                ? `${enabledEventsCount} Event${enabledEventsCount === 1 ? "" : "s"}`
                                : "No Events"}
                            </Badge>
                          </Tooltip>
                        </Td>
                        <Td>
                          {!lastStatus ? (
                            "-"
                          ) : (
                            <div className="inline-flex w-min items-center rounded-sm bg-mineshaft-600 px-2 py-0.5 text-sm">
                              {lastStatus}{" "}
                              <Tooltip
                                content={
                                  <div className="text-xs">
                                    <div>
                                      Updated At:{" "}
                                      {format(new Date(updatedAt), "yyyy-MM-dd, hh:mm aaa")}
                                    </div>
                                    {lastRunErrorMessage && (
                                      <div className="mt-2 text-red">
                                        Error: {lastRunErrorMessage}
                                      </div>
                                    )}
                                  </div>
                                }
                              >
                                <FontAwesomeIcon
                                  className={`ml-1 ${
                                    lastStatus === "failed" ? "text-red" : "text-green"
                                  }`}
                                  icon={faInfoCircle}
                                />
                              </Tooltip>
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div className="flex items-center justify-end space-x-2">
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.Webhooks}
                            >
                              {(isAllowed) => (
                                <Button
                                  variant="outline_bg"
                                  size="xs"
                                  isDisabled={!isAllowed}
                                  onClick={() => handlePopUpOpen("editWebhook", webhook)}
                                >
                                  Edit
                                </Button>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.Webhooks}
                            >
                              {(isAllowed) => (
                                <Button
                                  variant="star"
                                  size="xs"
                                  onClick={() => handleWebhookTest(id)}
                                  isDisabled={
                                    (isTestWebhookSubmitting &&
                                      testWebhookVars?.webhookId === id) ||
                                    !isAllowed
                                  }
                                  isLoading={
                                    isTestWebhookSubmitting && testWebhookVars?.webhookId === id
                                  }
                                >
                                  Test
                                </Button>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.Webhooks}
                            >
                              {(isAllowed) => (
                                <Button
                                  variant="outline_bg"
                                  size="xs"
                                  onClick={() => handleWebhookDisable(id, !isDisabled)}
                                  isDisabled={
                                    (isUpdateWebhookSubmitting &&
                                      updateWebhookVars?.webhookId === id) ||
                                    !isAllowed
                                  }
                                  isLoading={
                                    isUpdateWebhookSubmitting && updateWebhookVars?.webhookId === id
                                  }
                                >
                                  {isDisabled ? "Enable" : "Disable"}
                                </Button>
                              )}
                            </ProjectPermissionCan>
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Delete}
                              a={ProjectPermissionSub.Webhooks}
                            >
                              {(isAllowed) => (
                                <Button
                                  variant="outline_bg"
                                  className="border-red-800 bg-red-800 hover:border-red-700 hover:bg-red-700"
                                  colorSchema="danger"
                                  size="xs"
                                  isDisabled={!isAllowed}
                                  onClick={() => handlePopUpOpen("deleteWebhook", id)}
                                >
                                  Delete
                                </Button>
                              )}
                            </ProjectPermissionCan>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
              </TBody>
            </Table>
          </TableContainer>
        </div>
        <AddWebhookForm
          environments={currentProject?.environments}
          isOpen={popUp?.addWebhook?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addWebhook", isOpen)}
          onCreateWebhook={handleWebhookCreate}
        />
        <DeleteActionModal
          isOpen={popUp.deleteWebhook.isOpen}
          deleteKey="remove"
          title="Are you sure you want to delete this webhook?"
          onChange={(isOpen) => handlePopUpToggle("deleteWebhook", isOpen)}
          onClose={() => handlePopUpClose("deleteWebhook")}
          onDeleteApproved={handleWebhookDelete}
        />
        <EditWebhookEventsModal
          isOpen={popUp.editWebhook.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("editWebhook", isOpen)}
          webhook={popUp.editWebhook.data as TWebhook | undefined}
          isSubmitting={
            isUpdateWebhookSubmitting &&
            updateWebhookVars?.webhookId === (popUp.editWebhook.data as TWebhook | undefined)?.id
          }
          onSave={async (settings) => {
            const webhookId = (popUp.editWebhook.data as TWebhook | undefined)?.id;
            if (!webhookId) return;
            await handleWebhookEventsUpdate(webhookId, settings);
          }}
        />
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Webhooks }
);
