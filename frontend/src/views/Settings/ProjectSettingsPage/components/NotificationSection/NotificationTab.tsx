import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  DeleteActionModal,
  FormControl,
  Input,
  Switch
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  fetchSlackInstallUrl,
  useDeleteSlackIntegration,
  useGetSlackIntegrationByProject,
  useUpdateSlackIntegration
} from "@app/hooks/api";

const formSchema = z.object({
  isSecretRequestNotificationEnabled: z.boolean(),
  secretRequestChannels: z.string(),
  isAccessRequestNotificationEnabled: z.boolean(),
  accessRequestChannels: z.string()
});

type TSlackIntegrationForm = z.infer<typeof formSchema>;

export const NotificationTab = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: slackIntegration, isLoading: isSlackIntegrationLoading } =
    useGetSlackIntegrationByProject(currentWorkspace?.id);
  const { mutateAsync: updateSlackIntegration } = useUpdateSlackIntegration();
  const { mutateAsync: deleteSlackIntegration } = useDeleteSlackIntegration();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "deleteSlackIntegration"
  ] as const);

  const {
    control,
    watch,
    handleSubmit,
    setValue,
    formState: { isDirty, isSubmitting }
  } = useForm<TSlackIntegrationForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isSecretRequestNotificationEnabled: slackIntegration?.isSecretRequestNotificationEnabled,
      secretRequestChannels: slackIntegration?.secretRequestChannels || "",
      isAccessRequestNotificationEnabled: slackIntegration?.isAccessRequestNotificationEnabled,
      accessRequestChannels: slackIntegration?.accessRequestChannels || ""
    }
  });

  const router = useRouter();
  const [isConnectToSlackLoading, setIsConnectToSlackLoading] = useToggle(false);
  const secretRequestNotifState = watch("isSecretRequestNotificationEnabled");
  const accessRequestNotifState = watch("isAccessRequestNotificationEnabled");

  const handleIntegrationSave = async (data: TSlackIntegrationForm) => {
    if (!currentWorkspace || !slackIntegration) {
      return;
    }
    await updateSlackIntegration({
      workspaceId: currentWorkspace?.id,
      id: slackIntegration?.id,
      ...data
    });

    createNotification({
      type: "success",
      text: "Successfully updated slack integration"
    });
  };

  const handleIntegrationDelete = async () => {
    if (!currentWorkspace || !slackIntegration) {
      return;
    }
    await deleteSlackIntegration({
      workspaceId: currentWorkspace.id,
      id: slackIntegration.id
    });

    handlePopUpToggle("deleteSlackIntegration", false);

    createNotification({
      type: "success",
      text: "Successfully deleted slack integration"
    });
  };

  useEffect(() => {
    if (slackIntegration) {
      setValue(
        "isSecretRequestNotificationEnabled",
        slackIntegration.isSecretRequestNotificationEnabled
      );
      setValue("secretRequestChannels", slackIntegration.secretRequestChannels);
      setValue(
        "isAccessRequestNotificationEnabled",
        slackIntegration.isAccessRequestNotificationEnabled
      );
      setValue("accessRequestChannels", slackIntegration.accessRequestChannels);
    }
  }, [slackIntegration]);

  if (isSlackIntegrationLoading) {
    return <ContentLoader />;
  }

  return (
    <>
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-between">
          <h2 className="mb-2 flex-1 text-xl font-semibold text-mineshaft-100">
            Slack Integration
          </h2>
        </div>
        <p className="mb-4 text-gray-400">
          This integration allows you to send notifications to your Slack workspace in response to
          events in your project.
        </p>
        {!slackIntegration && (
          <Button
            isLoading={isConnectToSlackLoading}
            onClick={async () => {
              setIsConnectToSlackLoading.on();
              const slackInstallUrl = await fetchSlackInstallUrl(currentWorkspace?.id);
              if (slackInstallUrl) {
                router.push(slackInstallUrl);
              }
            }}
          >
            Connect to Slack
          </Button>
        )}
        {slackIntegration && (
          <form onSubmit={handleSubmit(handleIntegrationSave)}>
            <div>Connected Slack workspace: {slackIntegration.teamName}</div>
            <div className="mt-2 mb-6">
              <Button colorSchema="secondary" size="xs">
                Reinstall integration
              </Button>
              <Button
                colorSchema="secondary"
                size="xs"
                className="ml-2"
                onClick={() => handlePopUpOpen("deleteSlackIntegration")}
              >
                Delete
              </Button>
            </div>
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
          </form>
        )}
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteSlackIntegration.isOpen}
        title="Are you sure want to delete your Slack integration?"
        onChange={(isOpen) => handlePopUpToggle("deleteSlackIntegration", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleIntegrationDelete}
      />
    </>
  );
};
