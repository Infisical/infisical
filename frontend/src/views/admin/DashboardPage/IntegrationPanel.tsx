import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useGetAdminSlackConfig, useUpdateServerConfig } from "@app/hooks/api";

const slackFormSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string()
});

type TSlackForm = z.infer<typeof slackFormSchema>;

const getCustomSlackAppCreationUrl = () =>
  `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(
    JSON.stringify({
      display_information: {
        name: "Infisical",
        description: "Get real-time Infisical updates in Slack",
        background_color: "#c2d62b",
        long_description: `This Slack application is designed specifically for use with your self-hosted Infisical instance, allowing seamless integration between your Infisical projects and your Slack workspace. With this integration, your team can stay up-to-date with the latest events, changes, and notifications directly inside Slack.
        - Notifications: Receive real-time updates and alerts about critical events in your Infisical projects. Whether it's a new project being created, updates to secrets, or changes to your team's configuration, you will be promptly notified within the designated Slack channels of your choice.
        - Customization: Tailor the notifications to your team's specific needs by configuring which types of events trigger alerts and in which channels they are sent.
        - Collaboration: Keep your entire team in the loop with notifications that help facilitate more efficient collaboration by ensuring that everyone is aware of important developments in your Infisical projects.
        
        By integrating Infisical with Slack, you can enhance your workflow by combining the power of secure secrets management with the communication capabilities of Slack.`
      },
      features: {
        app_home: {
          home_tab_enabled: false,
          messages_tab_enabled: false,
          messages_tab_read_only_enabled: true
        },
        bot_user: {
          display_name: "Infisical",
          always_online: true
        }
      },
      oauth_config: {
        redirect_urls: [`${window.origin}/api/v1/workflow-integrations/slack/oauth_redirect`],
        scopes: {
          bot: ["chat:write.public", "chat:write", "channels:read", "groups:read"]
        }
      },
      settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false
      }
    })
  )}`;

export const IntegrationPanel = () => {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TSlackForm>({
    resolver: zodResolver(slackFormSchema)
  });

  const { data: adminSlackConfig } = useGetAdminSlackConfig();
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const [isSlackClientIdFocused, setIsSlackClientIdFocused] = useToggle();
  const [isSlackClientSecretFocused, setIsSlackClientSecretFocused] = useToggle();

  useEffect(() => {
    if (adminSlackConfig) {
      setValue("clientId", adminSlackConfig.clientId);
      setValue("clientSecret", adminSlackConfig.clientSecret);
    }
  }, [adminSlackConfig]);

  const onSlackFormSubmit = async (data: TSlackForm) => {
    await updateAdminServerConfig({
      slackClientId: data.clientId,
      slackClientSecret: data.clientSecret
    });

    createNotification({
      text: "Updated admin slack configuration",
      type: "success"
    });
  };

  return (
    <form
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      onSubmit={handleSubmit(onSlackFormSubmit)}
    >
      <div className="flex flex-col justify-start">
        <div className="mb-2 text-xl font-semibold text-mineshaft-100">Slack Integration</div>
        <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
          Step 1: Create your Infisical Slack App
        </div>
        <div className="mb-6">
          <Button
            colorSchema="secondary"
            onClick={() => window.open(getCustomSlackAppCreationUrl())}
          >
            Create Slack App
          </Button>
        </div>
        <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
          Step 2: Configure your instance-wide settings to enable integration with Slack. Copy the
          values from the App Credentials page of your custom Slack App.
        </div>
        <Controller
          control={control}
          name="clientId"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Client ID"
              className="w-96"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                type={isSlackClientIdFocused ? "text" : "password"}
                onFocus={() => setIsSlackClientIdFocused.on()}
                onBlur={() => setIsSlackClientIdFocused.off()}
                onChange={(e) => field.onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="clientSecret"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Client Secret"
              className="w-96"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input
                {...field}
                value={field.value || ""}
                type={isSlackClientSecretFocused ? "text" : "password"}
                onFocus={() => setIsSlackClientSecretFocused.on()}
                onBlur={() => setIsSlackClientSecretFocused.off()}
                onChange={(e) => field.onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
      </div>
      <Button
        className="mt-2"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting || !isDirty}
      >
        Save
      </Button>
    </form>
  );
};
