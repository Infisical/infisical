import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  ToggleLeft,
  ToggleRight,
  Trash2
} from "lucide-react";

import { createNotification, dismissNotification } from "@app/components/notifications";
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
      // eventsFilter is the allowlist of events to trigger on
      const eventsFilter = WEBHOOK_EVENTS.filter((event) => data.enabledEvents[event]).map(
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
      // eventsFilter is the allowlist; every checked event goes in.
      const eventsFilter = WEBHOOK_EVENTS.filter((event) => settings[event]).map((event) => ({
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
      const toastId = createNotification({
        type: "loading",
        text: "Triggering webhook..."
      });
      try {
        await testWebhook({
          webhookId,
          projectId
        });
        createNotification({
          type: "success",
          text: "Successfully triggered webhook"
        });
      } finally {
        dismissNotification(toastId);
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.webhooks.title")}</CardTitle>
          <CardDescription>{t("settings.webhooks.description")}</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Create}
              a={ProjectPermissionSub.Webhooks}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  size="sm"
                  onClick={() => handlePopUpOpen("addWebhook")}
                  isDisabled={!isAllowed}
                >
                  <Plus />
                  Add Webhook
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isWebhooksLoading && webhooks && webhooks.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No webhooks found</EmptyTitle>
                <EmptyDescription>Add a webhook to get started.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">URL</TableHead>
                  <TableHead className="w-1/5">Environment</TableHead>
                  <TableHead className="w-1/5">Secret Path</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <span>Events</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Info className="size-3.5 text-muted" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Events that are configured to trigger this webhook.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-px text-right" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isWebhooksLoading &&
                  Array.from({ length: 3 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`webhook-skeleton-${idx}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
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

                    // eventsFilter is the allowlist; empty means every event is enabled.
                    const filteredSet = new Set(webhook.eventsFilter.map((e) => e.eventName));
                    const enabledEvents =
                      webhook.eventsFilter.length === 0
                        ? [...WEBHOOK_EVENTS]
                        : WEBHOOK_EVENTS.filter((event) => filteredSet.has(event));
                    const enabledEventsCount = enabledEvents.length;
                    const hasEnabledEvents = enabledEventsCount > 0;
                    const allEventsEnabled = enabledEventsCount === WEBHOOK_EVENTS.length;

                    return (
                      <TableRow key={id} className="h-12">
                        <TableCell className="max-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="min-w-0">
                                <p className="truncate">{url}</p>
                                <p className="truncate text-xs text-muted">{id}</p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-2xl">
                              <span className="break-all">{url}</span>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <p className="truncate">{environment.slug}</p>
                        </TableCell>
                        <TableCell className="max-w-0">
                          <p className="truncate">{secretPath}</p>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Badge variant="neutral">
                                  {allEventsEnabled && "All Events"}
                                  {!hasEnabledEvents && "No Events"}
                                  {hasEnabledEvents &&
                                    !allEventsEnabled &&
                                    `${enabledEventsCount} Event${enabledEventsCount === 1 ? "" : "s"}`}
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {hasEnabledEvents ? (
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
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {isDisabled ? (
                            <Badge variant="neutral">Disabled</Badge>
                          ) : !lastStatus ? (
                            <span className="text-muted">-</span>
                          ) : (
                            <Badge
                              variant={lastStatus === "failed" ? "danger" : "success"}
                              className="capitalize"
                            >
                              {lastStatus}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Info />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    <div>
                                      Updated At:{" "}
                                      {format(new Date(updatedAt), "yyyy-MM-dd, hh:mm aaa")}
                                    </div>
                                    {lastRunErrorMessage && (
                                      <div className="mt-2 text-danger">
                                        Error: {lastRunErrorMessage}
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  variant="ghost"
                                  size="xs"
                                  aria-label={`Actions for webhook ${url}`}
                                >
                                  <MoreHorizontal />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Webhooks}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={() => handleWebhookTest(id)}
                                      isDisabled={
                                        (isTestWebhookSubmitting &&
                                          testWebhookVars?.webhookId === id) ||
                                        !isAllowed
                                      }
                                    >
                                      <Send />
                                      Test
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Webhooks}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={() => handlePopUpOpen("editWebhook", webhook)}
                                      isDisabled={!isAllowed}
                                    >
                                      <Pencil />
                                      Edit
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Webhooks}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      onClick={() => handleWebhookDisable(id, !isDisabled)}
                                      isDisabled={
                                        (isUpdateWebhookSubmitting &&
                                          updateWebhookVars?.webhookId === id) ||
                                        !isAllowed
                                      }
                                    >
                                      {isDisabled ? <ToggleRight /> : <ToggleLeft />}
                                      {isDisabled ? "Enable" : "Disable"}
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Delete}
                                  a={ProjectPermissionSub.Webhooks}
                                >
                                  {(isAllowed) => (
                                    <DropdownMenuItem
                                      variant="danger"
                                      onClick={() => handlePopUpOpen("deleteWebhook", id)}
                                      isDisabled={!isAllowed}
                                    >
                                      <Trash2 />
                                      Delete
                                    </DropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <AddWebhookForm
          environments={currentProject?.environments}
          isOpen={popUp?.addWebhook?.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("addWebhook", isOpen)}
          onCreateWebhook={handleWebhookCreate}
        />
        <AlertDialog
          open={popUp.deleteWebhook.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("deleteWebhook", isOpen)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
              <AlertDialogDescription>
                This webhook will stop receiving events. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={handleWebhookDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
      </Card>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Webhooks }
);
