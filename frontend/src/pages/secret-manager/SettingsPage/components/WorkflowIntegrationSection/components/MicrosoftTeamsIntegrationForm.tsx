import { RefObject, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetClose,
  SheetFooter,
  Switch
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useGetMicrosoftTeamsIntegrations,
  useGetMicrosoftTeamsIntegrationTeams,
  useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api";
import {
  MicrosoftTeamsIntegrationTeam,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

const channelsSchema = z.object({
  teamId: z.string(),
  channelIds: z.string().array()
});

const formSchema = z
  .object({
    microsoftTeamsIntegrationId: z.string().min(1, "Select a Microsoft Teams integration"),
    isSecretRequestNotificationEnabled: z.boolean(),
    isAccessRequestNotificationEnabled: z.boolean(),
    secretRequestChannels: channelsSchema.optional(),
    accessRequestChannels: channelsSchema.optional()
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

type TChannelOption = {
  channelId: string;
  channelName: string;
};

type Props = {
  onClose: () => void;
  onBack?: () => void;
  menuContainer: RefObject<HTMLDivElement | null>;
};

export const MicrosoftTeamsIntegrationForm = ({ onClose, onBack, menuContainer }: Props) => {
  const { currentProject } = useProject();
  const { data: microsoftTeamsConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });
  const { data: microsoftTeamsIntegrations, isPending: isMicrosoftTeamsIntegrationsLoading } =
    useGetMicrosoftTeamsIntegrations(currentProject?.orgId);

  const { mutateAsync: updateProjectMicrosoftTeamsConfig } =
    useUpdateProjectWorkflowIntegrationConfig();

  const hasMicrosoftTeamsIntegrations = !!microsoftTeamsIntegrations?.length;

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TMicrosoftTeamsConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      microsoftTeamsIntegrationId: "",
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
    if (!currentProject) {
      return;
    }

    await updateProjectMicrosoftTeamsConfig({
      projectId: currentProject.id,
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
      text: "Saved Microsoft Teams integration settings"
    });

    onClose();
  };

  const selectedAccessRequestTeamId = watch("accessRequestChannels.teamId");
  const selectedSecretRequestTeamId = watch("secretRequestChannels.teamId");

  const selectedMicrosoftTeamsIntegrationId = watch("microsoftTeamsIntegrationId");

  const accessRequestNotificationsEnabled = watch("isAccessRequestNotificationEnabled");
  const secretRequestNotificationsEnabled = watch("isSecretRequestNotificationEnabled");

  const {
    data: microsoftTeamsIntegrationTeams,
    isPending: isLoadingMicrosoftTeamsIntegrationTeams
  } = useGetMicrosoftTeamsIntegrationTeams(selectedMicrosoftTeamsIntegrationId || undefined);

  const sortedTeams = microsoftTeamsIntegrationTeams
    ?.slice()
    .sort((a, b) => a.teamName.toLowerCase().localeCompare(b.teamName.toLowerCase()));

  const getTeamChannels = (teamId?: string): TChannelOption[] =>
    sortedTeams?.find((team) => team.teamId === teamId)?.channels ?? [];

  useEffect(() => {
    if (
      microsoftTeamsConfig &&
      microsoftTeamsConfig.integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS
    ) {
      setValue("microsoftTeamsIntegrationId", microsoftTeamsConfig.integrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        microsoftTeamsConfig.isSecretRequestNotificationEnabled
      );
      setValue(
        "isAccessRequestNotificationEnabled",
        microsoftTeamsConfig.isAccessRequestNotificationEnabled
      );

      if (
        microsoftTeamsConfig.accessRequestChannels &&
        Object.entries(microsoftTeamsConfig.accessRequestChannels).length
      ) {
        setValue("accessRequestChannels", microsoftTeamsConfig.accessRequestChannels);
      }
      if (
        microsoftTeamsConfig.secretRequestChannels &&
        Object.entries(microsoftTeamsConfig.secretRequestChannels).length
      ) {
        setValue("secretRequestChannels", microsoftTeamsConfig.secretRequestChannels);
      }
    }
  }, [microsoftTeamsConfig]);

  const renderEventChannelFields = (
    fieldPrefix: "secretRequestChannels" | "accessRequestChannels"
  ) => {
    const selectedTeamId =
      fieldPrefix === "secretRequestChannels"
        ? selectedSecretRequestTeamId
        : selectedAccessRequestTeamId;
    const teamChannels = getTeamChannels(selectedTeamId);

    return (
      <>
        <Controller
          control={control}
          name={`${fieldPrefix}.teamId`}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor={`${fieldPrefix}-team`}>Microsoft Teams team</FieldLabel>
              <FilterableSelect<MicrosoftTeamsIntegrationTeam>
                inputId={`${fieldPrefix}-team`}
                options={sortedTeams}
                value={sortedTeams?.find((team) => team.teamId === value) ?? null}
                onChange={(selected) => {
                  onChange((selected as MicrosoftTeamsIntegrationTeam | null)?.teamId ?? "");
                  // Channels belong to a team; clear stale selections when the team changes.
                  setValue(`${fieldPrefix}.channelIds`, [], { shouldDirty: true });
                }}
                getOptionValue={(option) => option.teamId}
                getOptionLabel={(option) => option.teamName}
                placeholder={
                  isLoadingMicrosoftTeamsIntegrationTeams ? "Loading..." : "Select a team..."
                }
                isLoading={isLoadingMicrosoftTeamsIntegrationTeams}
                isError={Boolean(error)}
                menuPortalTarget={menuContainer.current}
                menuPosition="fixed"
                menuPlacement="bottom"
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name={`${fieldPrefix}.channelIds`}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor={`${fieldPrefix}-channels`}>Microsoft Teams channels</FieldLabel>
              <FilterableSelect
                isMulti
                inputId={`${fieldPrefix}-channels`}
                options={teamChannels}
                value={teamChannels.filter((channel) => value?.includes(channel.channelId))}
                onChange={(selected) =>
                  onChange(
                    (selected as readonly TChannelOption[]).map((channel) => channel.channelId)
                  )
                }
                getOptionValue={(option) => option.channelId}
                getOptionLabel={(option) => option.channelName}
                placeholder={selectedTeamId ? "Select channels..." : "Select a team first"}
                isDisabled={!selectedTeamId}
                isLoading={isLoadingMicrosoftTeamsIntegrationTeams}
                isError={Boolean(error)}
                menuPortalTarget={menuContainer.current}
                menuPosition="fixed"
                menuPlacement="bottom"
                closeMenuOnSelect={false}
                hideSelectedOptions={false}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      </>
    );
  };

  return (
    <form
      onSubmit={handleSubmit(handleIntegrationSave)}
      className="flex min-h-0 flex-1 flex-col"
      autoComplete="off"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
        {!isMicrosoftTeamsIntegrationsLoading && !hasMicrosoftTeamsIntegrations ? (
          <Alert>
            <Info />
            <AlertTitle>No Microsoft Teams integrations connected</AlertTitle>
            <AlertDescription>
              <p>
                Connect a Microsoft Teams tenant to your organization before configuring project
                notifications.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link
                  to="/organizations/$orgId/integrations"
                  params={{ orgId: currentProject.orgId }}
                  search={{ selectedTab: "workflow-integrations" }}
                >
                  Go to organization integrations
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Controller
            control={control}
            name="microsoftTeamsIntegrationId"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="microsoft-teams-integration">
                  Microsoft Teams integration
                </FieldLabel>
                <Select
                  value={value}
                  onValueChange={(newValue) => {
                    onChange(newValue);

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
                >
                  <SelectTrigger
                    id="microsoft-teams-integration"
                    className="w-full"
                    aria-invalid={Boolean(error)}
                  >
                    <SelectValue
                      placeholder={
                        isMicrosoftTeamsIntegrationsLoading ? "Loading..." : "Select an integration"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {microsoftTeamsIntegrations?.map((microsoftTeamsIntegration) => (
                      <SelectItem
                        value={microsoftTeamsIntegration.id}
                        key={microsoftTeamsIntegration.id}
                      >
                        {microsoftTeamsIntegration.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        )}
        {!!selectedMicrosoftTeamsIntegrationId && (
          <>
            <Controller
              control={control}
              name="isSecretRequestNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>Secret approval requests</FieldTitle>
                    <FieldDescription>
                      Send a notification when a secret approval request is opened.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Secret approval request notifications"
                  />
                </Field>
              )}
            />
            {secretRequestNotificationsEnabled && renderEventChannelFields("secretRequestChannels")}
            <Controller
              control={control}
              name="isAccessRequestNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>Access requests</FieldTitle>
                    <FieldDescription>
                      Send a notification when an access request is opened.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Access request notifications"
                  />
                </Field>
              )}
            />
            {accessRequestNotificationsEnabled && renderEventChannelFields("accessRequestChannels")}
          </>
        )}
      </div>
      <SheetFooter className="justify-end border-t">
        {onBack && (
          <Button type="button" variant="ghost" className="mr-auto" onClick={onBack}>
            <ChevronLeft />
            Back
          </Button>
        )}
        <SheetClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </SheetClose>
        <Button
          type="submit"
          variant="project"
          isPending={isSubmitting}
          isDisabled={!isDirty || isSubmitting || !hasMicrosoftTeamsIntegrations}
        >
          Save
        </Button>
      </SheetFooter>
    </form>
  );
};
