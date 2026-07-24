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
  useGetSlackIntegrationChannels,
  useGetWorkflowIntegrations,
  useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api";
import {
  SlackIntegrationChannel,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

const formSchema = z.object({
  slackIntegrationId: z.string().min(1, "Select a Slack integration"),
  isSecretRequestNotificationEnabled: z.boolean(),
  secretRequestChannels: z.string().array(),
  isAccessRequestNotificationEnabled: z.boolean(),
  accessRequestChannels: z.string().array(),
  isSecretSyncErrorNotificationEnabled: z.boolean(),
  secretSyncErrorChannels: z.string().array()
});

type TSlackConfigForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  onBack?: () => void;
  menuContainer: RefObject<HTMLDivElement | null>;
};

type TChannelsFieldProps = {
  inputId: string;
  value: string[];
  onChange: (value: string[]) => void;
  error?: { message?: string };
  channels?: SlackIntegrationChannel[];
  isLoading: boolean;
  menuContainer: RefObject<HTMLDivElement | null>;
};

const ChannelsField = ({
  inputId,
  value,
  onChange,
  error,
  channels,
  isLoading,
  menuContainer
}: TChannelsFieldProps) => (
  <Field>
    <FieldLabel htmlFor={inputId}>Slack channels</FieldLabel>
    <FilterableSelect
      isMulti
      inputId={inputId}
      options={channels}
      value={(channels ?? []).filter((channel) => value?.includes(channel.id))}
      onChange={(selected) =>
        onChange((selected as readonly SlackIntegrationChannel[]).map((channel) => channel.id))
      }
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      placeholder="Select channels..."
      isLoading={isLoading}
      isError={Boolean(error)}
      menuPortalTarget={menuContainer.current}
      menuPosition="fixed"
      menuPlacement="bottom"
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
    />
    <FieldError>{error?.message}</FieldError>
  </Field>
);

export const SlackIntegrationForm = ({ onClose, onBack, menuContainer }: Props) => {
  const { currentProject } = useProject();
  const { data: slackConfig } = useGetWorkspaceWorkflowIntegrationConfig({
    projectId: currentProject?.id ?? "",
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const { data: workflowIntegrations, isPending: isWorkflowIntegrationsLoading } =
    useGetWorkflowIntegrations(currentProject?.orgId);
  const { mutateAsync: updateProjectSlackConfig } = useUpdateProjectWorkflowIntegrationConfig();

  const slackIntegrations = workflowIntegrations?.filter(
    (integration) => integration.integration === WorkflowIntegrationPlatform.SLACK
  );
  const hasSlackIntegrations = !!slackIntegrations?.length;

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TSlackConfigForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slackIntegrationId: "",
      isAccessRequestNotificationEnabled: false,
      accessRequestChannels: [],
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: [],
      isSecretSyncErrorNotificationEnabled: false,
      secretSyncErrorChannels: []
    }
  });

  const handleIntegrationSave = async (data: TSlackConfigForm) => {
    if (!currentProject) {
      return;
    }

    await updateProjectSlackConfig({
      ...data,
      projectId: currentProject.id,
      integration: WorkflowIntegrationPlatform.SLACK,
      integrationId: data.slackIntegrationId,
      accessRequestChannels: data.accessRequestChannels.filter(Boolean).join(", "),
      secretRequestChannels: data.secretRequestChannels.filter(Boolean).join(", "),
      secretSyncErrorChannels: data.secretSyncErrorChannels.filter(Boolean).join(", ")
    });

    createNotification({
      type: "success",
      text: "Saved Slack integration settings"
    });

    onClose();
  };

  const secretRequestNotifState = watch("isSecretRequestNotificationEnabled");
  const selectedSlackIntegrationId = watch("slackIntegrationId");
  const accessRequestNotifState = watch("isAccessRequestNotificationEnabled");
  const secretSyncErrorNotifState = watch("isSecretSyncErrorNotificationEnabled");

  const { data: slackChannels, isPending: isSlackChannelsLoading } = useGetSlackIntegrationChannels(
    selectedSlackIntegrationId || undefined
  );
  const slackChannelIdToName = Object.fromEntries(
    (slackChannels || []).map((channel) => [channel.id, channel.name])
  );
  const sortedSlackChannels = slackChannels
    ?.slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  useEffect(() => {
    if (slackConfig && slackConfig.integration === WorkflowIntegrationPlatform.SLACK) {
      setValue("slackIntegrationId", slackConfig.integrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        slackConfig.isSecretRequestNotificationEnabled
      );
      setValue(
        "isAccessRequestNotificationEnabled",
        slackConfig.isAccessRequestNotificationEnabled
      );
      setValue(
        "isSecretSyncErrorNotificationEnabled",
        slackConfig.isSecretSyncErrorNotificationEnabled
      );

      if (slackChannels) {
        setValue(
          "secretRequestChannels",
          (slackConfig.secretRequestChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
        setValue(
          "accessRequestChannels",
          (slackConfig.accessRequestChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
        setValue(
          "secretSyncErrorChannels",
          (slackConfig.secretSyncErrorChannels || "")
            .split(", ")
            .filter((channel) => channel in slackChannelIdToName)
        );
      }
    }
  }, [slackConfig, slackChannels]);

  return (
    <form
      onSubmit={handleSubmit(handleIntegrationSave)}
      className="flex min-h-0 flex-1 flex-col"
      autoComplete="off"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto px-4">
        {!isWorkflowIntegrationsLoading && !hasSlackIntegrations ? (
          <Alert>
            <Info />
            <AlertTitle>No Slack integrations connected</AlertTitle>
            <AlertDescription>
              <p>
                Connect a Slack workspace to your organization before configuring project
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
            name="slackIntegrationId"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="slack-integration">Slack integration</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                  <SelectTrigger
                    id="slack-integration"
                    className="w-full"
                    aria-invalid={Boolean(error)}
                  >
                    <SelectValue
                      placeholder={
                        isWorkflowIntegrationsLoading ? "Loading..." : "Select an integration"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {slackIntegrations?.map((slackIntegration) => (
                      <SelectItem value={slackIntegration.id} key={slackIntegration.id}>
                        {slackIntegration.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
        )}
        {!!selectedSlackIntegrationId && (
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
            {secretRequestNotifState && (
              <Controller
                control={control}
                name="secretRequestChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="secret-request-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                    menuContainer={menuContainer}
                  />
                )}
              />
            )}
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
            {accessRequestNotifState && (
              <Controller
                control={control}
                name="accessRequestChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="access-request-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                    menuContainer={menuContainer}
                  />
                )}
              />
            )}
            <Controller
              control={control}
              name="isSecretSyncErrorNotificationEnabled"
              render={({ field }) => (
                <Field orientation="horizontal" className="items-center!">
                  <FieldContent>
                    <FieldTitle>Secret sync errors</FieldTitle>
                    <FieldDescription>
                      Send a notification when a secret sync fails.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    variant="project"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Secret sync error notifications"
                  />
                </Field>
              )}
            />
            {secretSyncErrorNotifState && (
              <Controller
                control={control}
                name="secretSyncErrorChannels"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <ChannelsField
                    inputId="secret-sync-error-channels"
                    value={value}
                    onChange={onChange}
                    error={error}
                    channels={sortedSlackChannels}
                    isLoading={isSlackChannelsLoading}
                    menuContainer={menuContainer}
                  />
                )}
              />
            )}
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
          isDisabled={!isDirty || isSubmitting || !hasSlackIntegrations}
        >
          Save
        </Button>
      </SheetFooter>
    </form>
  );
};
