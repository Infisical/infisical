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
  useGetMicrosoftTeamsIntegrations,
  useGetMicrosoftTeamsIntegrationTeams,
  useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

const formSchema = z
  .object({
    microsoftTeamsIntegrationId: z.string(),
    isSecretRequestNotificationEnabled: z.boolean(),
    isAccessRequestNotificationEnabled: z.boolean(),
    secretRequestChannels: z
      .object({
        teamId: z.string(),
        channelIds: z.string().array()
      })
      .optional(),
    accessRequestChannels: z
      .object({
        teamId: z.string(),
        channelIds: z.string().array()
      })
      .optional()
  })
  .superRefine((data, ctx) => {
    if (data.isSecretRequestNotificationEnabled) {
      if (!data?.secretRequestChannels?.teamId) {
        ctx.addIssue({
          path: ["secretRequestChannels", "teamId"],
          code: z.ZodIssueCode.custom,
          message: "Team is required"
        });
      }

      if (!data?.secretRequestChannels?.channelIds?.length) {
        ctx.addIssue({
          path: ["secretRequestChannels", "channelIds"],
          code: z.ZodIssueCode.custom,
          message: "At least one channel is required"
        });
      }
    }

    if (data.isAccessRequestNotificationEnabled) {
      if (!data?.accessRequestChannels?.teamId) {
        ctx.addIssue({
          path: ["accessRequestChannels", "teamId"],
          code: z.ZodIssueCode.custom,
          message: "Team is required"
        });
      }

      if (!data?.accessRequestChannels?.channelIds?.length) {
        ctx.addIssue({
          path: ["accessRequestChannels", "channelIds"],
          code: z.ZodIssueCode.custom,
          message: "At least one channel is required"
        });
      }
    }
  });

type TMicrosoftTeamsConfigForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
};

export const MicrosoftTeamsIntegrationForm = ({ onClose }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    workspaceId: currentWorkspace?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });
  const { data: microsoftTeamsIntegrations } = useGetMicrosoftTeamsIntegrations(
    currentWorkspace?.orgId
  );

  const { mutateAsync: updateProjectMicrosoftTeamsConfig } =
    useUpdateProjectWorkflowIntegrationConfig();

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TMicrosoftTeamsConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isAccessRequestNotificationEnabled: false,
      isSecretRequestNotificationEnabled: false,
      accessRequestChannels: {
        teamId: "",
        channelIds: []
      },
      secretRequestChannels: {
        teamId: "",
        channelIds: []
      }
    }
  });

  const handleIntegrationSave = async (data: TMicrosoftTeamsConfigForm) => {
    try {
      if (!currentWorkspace) {
        return;
      }

      await updateProjectMicrosoftTeamsConfig({
        workspaceId: currentWorkspace.id,
        isAccessRequestNotificationEnabled: data.isAccessRequestNotificationEnabled,
        isSecretRequestNotificationEnabled: data.isSecretRequestNotificationEnabled,
        ...(data.isAccessRequestNotificationEnabled && {
          accessRequestChannels: data.accessRequestChannels
        }),
        ...(data.isSecretRequestNotificationEnabled && {
          secretRequestChannels: data.secretRequestChannels
        }),
        integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
        integrationId: data.microsoftTeamsIntegrationId
      });

      createNotification({
        type: "success",
        text: "Successfully created microsoft teams integration"
      });

      onClose();
    } catch {
      createNotification({
        type: "error",
        text: "Failed to create microsoft teams integration"
      });
    }
  };

  const selectedAccessRequestTeamId = watch("accessRequestChannels.teamId");
  const selectedSecretRequestTeamId = watch("secretRequestChannels.teamId");

  const selectedMicrosoftTeamsIntegrationId = watch("microsoftTeamsIntegrationId");

  const accessRequestNotificationsEnabled = watch("isAccessRequestNotificationEnabled");
  const secretRequestNotificationsEnabled = watch("isSecretRequestNotificationEnabled");

  const {
    data: microsoftTeamsIntegrationTeams,
    isPending: isLoadingMicrosoftTeamsIntegrationTeams
  } = useGetMicrosoftTeamsIntegrationTeams(selectedMicrosoftTeamsIntegrationId);

  const sortedMicrosoftTeamsIntegrationTeams = microsoftTeamsIntegrationTeams?.sort((a, b) =>
    a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase())
  );

  const selectableAccessRequestChannelIds = sortedMicrosoftTeamsIntegrationTeams
    ?.filter((team) => team.teamId === selectedAccessRequestTeamId)
    .map((team) => team.channels)
    .flat();
  const selectableSecretRequestChannelIds = sortedMicrosoftTeamsIntegrationTeams
    ?.filter((team) => team.teamId === selectedSecretRequestTeamId)
    .map((team) => team.channels)
    .flat();

  const channelIdToName = [
    ...(selectableAccessRequestChannelIds || []),
    ...(selectableSecretRequestChannelIds || [])
  ].reduce(
    (acc, channel) => {
      acc[channel.channelId] = channel.channelName;
      return acc;
    },
    {} as Record<string, string>
  );

  useEffect(() => {
    if (microsoftTeamsConfig) {
      setValue("microsoftTeamsIntegrationId", microsoftTeamsConfig.integrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        microsoftTeamsConfig.isSecretRequestNotificationEnabled
      );
      setValue(
        "isAccessRequestNotificationEnabled",
        microsoftTeamsConfig.isAccessRequestNotificationEnabled
      );

      if (microsoftTeamsConfig.integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS) {
        if (microsoftTeamsConfig.secretRequestChannels) {
          if (Object.entries(microsoftTeamsConfig.accessRequestChannels).length) {
            setValue("accessRequestChannels", microsoftTeamsConfig.accessRequestChannels);
          }
          if (Object.entries(microsoftTeamsConfig.secretRequestChannels).length) {
            setValue("secretRequestChannels", microsoftTeamsConfig.secretRequestChannels);
          }
        }
      }
    }
  }, [microsoftTeamsConfig]);

  return (
    <form onSubmit={handleSubmit(handleIntegrationSave)}>
      <div className="flex w-full flex-col justify-start">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Controller
              control={control}
              name="microsoftTeamsIntegrationId"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Microsoft Teams Integration"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    {...field}
                    isDisabled={!isAllowed}
                    placeholder="None"
                    onValueChange={(v) => {
                      onChange(v);

                      setValue("isAccessRequestNotificationEnabled", false);
                      setValue("isSecretRequestNotificationEnabled", false);
                      setValue("accessRequestChannels", {
                        teamId: "",
                        channelIds: []
                      });
                      setValue("secretRequestChannels", {
                        teamId: "",
                        channelIds: []
                      });
                    }}
                    className="w-full"
                    defaultValue={microsoftTeamsConfig?.integrationId}
                  >
                    {microsoftTeamsIntegrations?.map((microsoftTeamsIntegration) => (
                      <SelectItem
                        value={microsoftTeamsIntegration.id}
                        key={`microsoft-teams-integration-${microsoftTeamsIntegration.id}`}
                      >
                        {microsoftTeamsIntegration.slug}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          )}
        </ProjectPermissionCan>
      </div>
      {selectedMicrosoftTeamsIntegrationId && (
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
          {secretRequestNotificationsEnabled && (
            <>
              <Controller
                control={control}
                name="secretRequestChannels.teamId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Approval Requests Notifications Team"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Select
                      {...field}
                      placeholder={
                        isLoadingMicrosoftTeamsIntegrationTeams ? "Loading..." : "Select a team..."
                      }
                      className="w-full"
                      onValueChange={(value) => onChange(value)}
                      isLoading={isLoadingMicrosoftTeamsIntegrationTeams}
                    >
                      {!isLoadingMicrosoftTeamsIntegrationTeams &&
                        sortedMicrosoftTeamsIntegrationTeams?.map((team) => (
                          <SelectItem
                            key={`secret-requests-microsoft-teams-team-${team.teamId}`}
                            value={team.teamId}
                          >
                            {team.teamName}
                          </SelectItem>
                        ))}
                    </Select>
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="secretRequestChannels.channelIds"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Microsoft Teams channels"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={
                          isLoadingMicrosoftTeamsIntegrationTeams || !selectedSecretRequestTeamId
                            ? "opacity-50"
                            : ""
                        }
                        asChild
                        disabled={
                          isLoadingMicrosoftTeamsIntegrationTeams || !selectedSecretRequestTeamId
                        }
                      >
                        {selectedSecretRequestTeamId ? (
                          <Input
                            isReadOnly
                            value={
                              isLoadingMicrosoftTeamsIntegrationTeams
                                ? "Loading..."
                                : value
                                    ?.filter(Boolean)
                                    .map((entry) => channelIdToName[entry])
                                    .join(", ")
                            }
                            className="text-left"
                          />
                        ) : (
                          <Input
                            isReadOnly
                            value="Select a team..."
                            className="py-2 text-left text-sm"
                          />
                        )}
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
                        {selectableSecretRequestChannelIds?.map((channel) => {
                          const isChecked = value?.includes(channel.channelId);
                          return (
                            <DropdownMenuItem
                              onClick={(evt) => {
                                evt.preventDefault();
                                onChange(
                                  isChecked
                                    ? value?.filter((el: string) => el !== channel.channelId)
                                    : [...(value || []), channel.channelId]
                                );
                              }}
                              key={`secret-requests-microsoft-teams-channel-${channel.channelId}`}
                              iconPos="right"
                              icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                            >
                              {channel.channelName}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FormControl>
                )}
              />
            </>
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
          {accessRequestNotificationsEnabled && (
            <>
              <Controller
                control={control}
                name="accessRequestChannels.teamId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Access Requests Notifications Team"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Select
                      {...field}
                      placeholder={
                        isLoadingMicrosoftTeamsIntegrationTeams ? "Loading..." : "Select a team..."
                      }
                      className="w-full"
                      onValueChange={(value) => onChange(value)}
                      isLoading={isLoadingMicrosoftTeamsIntegrationTeams}
                    >
                      {!isLoadingMicrosoftTeamsIntegrationTeams &&
                        sortedMicrosoftTeamsIntegrationTeams?.map((team) => (
                          <SelectItem
                            key={`access-requests-microsoft-teams-team-${team.teamId}`}
                            value={team.teamId}
                          >
                            {team.teamName}
                          </SelectItem>
                        ))}
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="accessRequestChannels.channelIds"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Microsoft Teams channels"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={
                          isLoadingMicrosoftTeamsIntegrationTeams || !selectedAccessRequestTeamId
                            ? "opacity-50"
                            : ""
                        }
                        asChild
                        disabled={
                          isLoadingMicrosoftTeamsIntegrationTeams || !selectedAccessRequestTeamId
                        }
                      >
                        {selectedAccessRequestTeamId ? (
                          <Input
                            isReadOnly
                            value={
                              isLoadingMicrosoftTeamsIntegrationTeams
                                ? "Loading..."
                                : value
                                    ?.filter(Boolean)
                                    .map((entry) => channelIdToName[entry])
                                    .join(", ")
                            }
                            className="text-left"
                          />
                        ) : (
                          <Input
                            isReadOnly
                            value="Select a team..."
                            className="py-2 text-left text-sm"
                          />
                        )}
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
                        {selectableAccessRequestChannelIds?.map((channel) => {
                          const isChecked = value?.includes(channel.channelId);
                          return (
                            <DropdownMenuItem
                              onClick={(evt) => {
                                evt.preventDefault();
                                onChange(
                                  isChecked
                                    ? value?.filter((el: string) => el !== channel.channelId)
                                    : [...(value || []), channel.channelId]
                                );
                              }}
                              key={`access-requests-slack-channel-${channel.channelId}`}
                              iconPos="right"
                              icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                            >
                              {channel.channelName}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FormControl>
                )}
              />
            </>
          )}
          <Button
            colorSchema="secondary"
            className="mt-4"
            type="submit"
            disabled={!isDirty}
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
