import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ContentLoader,
  EmptyState,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import {
  useGetSlackIntegrations,
  useGetWorkspaceSlackConfig,
  useUpdateProjectSlackConfig
} from "@app/hooks/api";

const formSchema = z.object({
  slackIntegrationId: z.string(),
  isSecretRequestNotificationEnabled: z.boolean(),
  secretRequestChannels: z.string().default(""),
  isAccessRequestNotificationEnabled: z.boolean(),
  accessRequestChannels: z.string().default("")
});

type TSlackConfigForm = z.infer<typeof formSchema>;

export const WorkflowIntegrationTab = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: slackConfig, isLoading: isSlackConfigLoading } = useGetWorkspaceSlackConfig({
    workspaceId: currentWorkspace?.id ?? ""
  });
  const { data: slackIntegrations } = useGetSlackIntegrations(currentWorkspace?.orgId);
  const { mutateAsync: updateProjectSlackConfig } = useUpdateProjectSlackConfig();

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
      accessRequestChannels: "",
      isSecretRequestNotificationEnabled: false,
      secretRequestChannels: ""
    }
  });

  const secretRequestNotifState = watch("isSecretRequestNotificationEnabled");
  const selectedSlackIntegrationId = watch("slackIntegrationId");
  const accessRequestNotifState = watch("isAccessRequestNotificationEnabled");

  const handleIntegrationSave = async (data: TSlackConfigForm) => {
    if (!currentWorkspace) {
      return;
    }

    await updateProjectSlackConfig({
      workspaceId: currentWorkspace.id,
      ...data
    });

    createNotification({
      type: "success",
      text: "Successfully updated slack integration"
    });
  };

  useEffect(() => {
    if (slackConfig) {
      setValue("slackIntegrationId", slackConfig.slackIntegrationId);
      setValue(
        "isSecretRequestNotificationEnabled",
        slackConfig.isSecretRequestNotificationEnabled
      );
      setValue("secretRequestChannels", slackConfig.secretRequestChannels);
      setValue(
        "isAccessRequestNotificationEnabled",
        slackConfig.isAccessRequestNotificationEnabled
      );
      setValue("accessRequestChannels", slackConfig.accessRequestChannels);
    }
  }, [slackConfig]);

  if (isSlackConfigLoading) {
    return <ContentLoader />;
  }

  return !slackIntegrations?.length ? (
    <EmptyState title="You do not have any integrations configured.">
      <Link href={`/org/${currentWorkspace?.orgId}/settings?tab=workflowIntegrations`}>
        <div className="mt-2 underline decoration-primary-800 underline-offset-4 duration-200 hover:cursor-pointer hover:text-mineshaft-100 hover:decoration-primary-600">
          Create one now
        </div>
      </Link>
    </EmptyState>
  ) : (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex justify-between">
        <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">Slack Integration</h2>
      </div>
      <p className="mb-4 text-gray-400">
        This integration allows you to send notifications to your Slack workspace in response to
        events in your project.
      </p>
      <form onSubmit={handleSubmit(handleIntegrationSave)}>
        <div className="max-w-md">
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
            {(isAllowed) => (
              <Controller
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl errorText={error?.message} isError={Boolean(error)}>
                    <Select
                      {...field}
                      isDisabled={!isAllowed}
                      onValueChange={onChange}
                      defaultValue={slackConfig?.slackIntegrationId}
                      className="w-3/4 bg-mineshaft-600"
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
                control={control}
                name="slackIntegrationId"
              />
            )}
          </ProjectPermissionCan>
        </div>
        {selectedSlackIntegrationId && (
          <>
            <h2 className="mb-2 flex-1 text-lg font-semibold text-mineshaft-100">Events</h2>
            <Controller
              control={control}
              name="isSecretRequestNotificationEnabled"
              render={({ field, fieldState: { error } }) => {
                return (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    className="mt-3 mb-2"
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
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Slack channels"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired={false}
                  >
                    <Input
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="general, bot"
                      {...field}
                    />
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
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Slack channels"
                    className="mt-0"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired={false}
                  >
                    <Input
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="general, bot"
                      {...field}
                    />
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
    </div>
  );
};
