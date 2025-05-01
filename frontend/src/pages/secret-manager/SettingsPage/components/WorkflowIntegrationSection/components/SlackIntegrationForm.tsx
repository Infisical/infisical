import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import {
  useGetSlackIntegrationChannels,
  useGetWorkflowIntegrations,
  useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

const formSchema = z.object({
  slackIntegrationId: z.string(),
  isSecretRequestNotificationEnabled: z.boolean(),
  secretRequestChannels: z.string().array(),
  isAccessRequestNotificationEnabled: z.boolean(),
  accessRequestChannels: z.string().array()
});

type TSlackConfigForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
};

export const SlackIntegrationForm = ({ onClose }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const { data: workflowIntegrations } = useGetWorkflowIntegrations(currentWorkspace?.orgId);
  const { mutateAsync: updateProjectSlackConfig } = useUpdateProjectWorkflowIntegrationConfig();

  const slackIntegrations = workflowIntegrations?.filter(
    (integration) => integration.integration === WorkflowIntegrationPlatform.SLACK
  );

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TSlackConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: [],
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: []
    }
  });

  const handleIntegrationSave = async (data: TSlackConfigForm) => {
    try {
      if (!currentWorkspace) {
        return;
      }

      await updateProjectSlackConfig({
        ...data,
        workspaceId: currentWorkspace.id,
        integration: WorkflowIntegrationPlatform.SLACK,
        integrationId: data.slackIntegrationId,
        accessRequestChannels: data.accessRequestChannels.filter(Boolean).join(", "),
        secretRequestChannels: data.secretRequestChannels.filter(Boolean).join(", ")
      });

      createNotification({
        type: "success",
        text: "Successfully created slack integration"
      });

      onClose();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create slack integration"
      });
    }
  };

  const secretRequestNotifState = watch("isSecretRequestNotificationEnabled");
  const selectedSlackIntegrationId = watch("slackIntegrationId");
  const accessRequestNotifState = watch("isAccessRequestNotificationEnabled");

  const { data: slackChannels } = useGetSlackIntegrationChannels(selectedSlackIntegrationId);
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );
  const sortedSlackChannels = slackChannels?.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  useEffect(() => {
    if (slackConfig) {
      setValue("slackIntegrationId", slackConfig.integrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        slackConfig.isSecretRequestNotificationEnabled
      );
      setValue(
        "isAccessRequestNotificationEnabled",
        slackConfig.isAccessRequestNotificationEnabled
      );

      if (slackConfig.integration === WorkflowIntegrationPlatform.SLACK) {
        if (slackChannels) {
          setValue(
            "secretRequestChannels",
            slackConfig.secretRequestChannels
              .split(", ")
              .filter((channel) => channel in slackChannelIdToName)
          );
          setValue(
            "accessRequestChannels",
            slackConfig.accessRequestChannels
              .split(", ")
              .filter((channel) => channel in slackChannelIdToName)
          );
        }
      }
    }
  }, [slackConfig, slackChannels]);

  return (
    <form onSubmit={handleSubmit(handleIntegrationSave)}>
      <div className="flex w-full flex-col justify-start">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Controller
              control={control}
              name="slackIntegrationId"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Slack Integration"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    {...field}
                    isDisabled={!isAllowed}
                    placeholder="None"
                    onValueChange={(val) => {
                      onChange(val);
                    }}
                    className="w-full"
                    defaultValue={slackConfig?.integrationId}
                  >
                    {slackIntegrations?.map((slackIntegration) => (
                      <SelectItem
                        value={slackIntegration.id}
                        key={`slack-integration-${slackIntegration.id}`}
                      >
                        {slackIntegration.slug}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
        </ProjectPermissionCan>
      </div>
      {selectedSlackIntegrationId && (
        <>
          <h2 className="mb-2 flex-1 text-sm text-mineshaft-400">Configure Events</h2>
          <Controller
            control={control}
            name="isSecretRequestNotificationEnabled"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="mb-2 mt-3"
                >
                  <Switch
                    id="secret-approval-notification"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="w-full">Secret Approval Requests</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          {secretRequestNotifState && (
            <Controller
              control={control}
              name="secretRequestChannels"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Slack channels"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Input
                        isReadOnly
                        value={value
                          ?.filter(Boolean)
                          .map((entry) => slackChannelIdToName[entry])
                          .join(", ")}
                        className="text-left"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      style={{
                        width: "var(--radix-dropdown-menu-trigger-width)",
                        maxHeight: "350px",
                        overflowY: "auto"
                      }}
                      side="bottom"
                      align="start"
                    >
                      {sortedSlackChannels?.map((slackChannel) => {
                        const isChecked = value?.includes(slackChannel.id);
                        return (
                          <DropdownMenuItem
                            onClick={(evt) => {
                              evt.preventDefault();
                              onChange(
                                isChecked
                                  ? value?.filter((el: string) => el !== slackChannel.id)
                                  : [...(value || []), slackChannel.id]
                              );
                            }}
                            key={`secret-requests-slack-channel-${slackChannel.id}`}
                            iconPos="right"
                            icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                          >
                            {slackChannel.name}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            name="isAccessRequestNotificationEnabled"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message} className="mb-2">
                  <Switch
                    id="access-request-notification"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="w-full">Access Requests</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          {accessRequestNotifState && (
            <Controller
              control={control}
              name="accessRequestChannels"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Slack channels"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Input
                        isReadOnly
                        value={value
                          ?.filter(Boolean)
                          .map((entry) => slackChannelIdToName[entry])
                          .join(", ")}
                        className="text-left"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      style={{
                        width: "var(--radix-dropdown-menu-trigger-width)",
                        maxHeight: "350px",
                        overflowY: "auto"
                      }}
                      side="bottom"
                      align="start"
                    >
                      {sortedSlackChannels?.map((slackChannel) => {
                        const isChecked = value?.includes(slackChannel.id);
                        return (
                          <DropdownMenuItem
                            onClick={(evt) => {
                              evt.preventDefault();
                              onChange(
                                isChecked
                                  ? value?.filter((el: string) => el !== slackChannel.id)
                                  : [...(value || []), slackChannel.id]
                              );
                            }}
                            key={`access-requests-slack-channel-${slackChannel.id}`}
                            iconPos="right"
                            icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                          >
                            {slackChannel.name}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </FormControl>
              )}
            />
          )}
          <Button
            colorSchema="secondary"
            className="mt-4"
            type="submit"
            isDisabled={!isDirty}
            isLoading={isSubmitting}
          >
            Save
          </Button>
        </>
      )}
    </form>
  );
};
