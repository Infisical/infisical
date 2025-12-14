import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { BsSlack } from "react-icons/bs";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

const getCustomSlackAppCreationUrl = (govEnabled: boolean) => {
  const baseUrl = govEnabled ? "https://api.slack-gov.com" : "https://api.slack.com";
  return `${baseUrl}/apps?new_app=1&manifest_json=${encodeURIComponent(
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
};

const slackFormSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string()
});

type TSlackForm = z.infer<typeof slackFormSchema>;

type Props = {
  adminIntegrationsConfig?: AdminIntegrationsConfig;
};

export const SlackIntegrationForm = ({ adminIntegrationsConfig }: Props) => {
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const [isSlackClientIdFocused, setIsSlackClientIdFocused] = useToggle();
  const [isSlackClientSecretFocused, setIsSlackClientSecretFocused] = useToggle();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TSlackForm>({
    resolver: zodResolver(slackFormSchema)
  });

  const onSubmit = async (data: TSlackForm) => {
    await updateAdminServerConfig({
      slackClientId: data.clientId,
      slackClientSecret: data.clientSecret
    });

    createNotification({
      text: "Updated admin slack configuration",
      type: "success"
    });
  };

  useEffect(() => {
    if (adminIntegrationsConfig) {
      setValue("clientId", adminIntegrationsConfig.slack.clientId);
      setValue("clientSecret", adminIntegrationsConfig.slack.clientSecret);
    }
  }, [adminIntegrationsConfig]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="slack-integration" className="data-[state=open]:border-none">
          <AccordionTrigger className="flex h-fit w-full justify-start rounded-md border border-mineshaft-500 bg-mineshaft-700 px-4 py-6 text-sm transition-colors data-[state=open]:rounded-b-none">
            <div className="text-md group order-1 ml-3 flex items-center gap-2">
              <BsSlack className="text-lg group-hover:text-primary-400" />
              <div className="text-[15px] font-medium">Slack</div>
            </div>
          </AccordionTrigger>
          <AccordionContent childrenClassName="px-0 py-0">
            <div className="flex w-full flex-col justify-start rounded-md rounded-t-none border border-t-0 border-mineshaft-500 bg-mineshaft-700 px-4 py-4">
              <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
                Step 1: Create your Infisical Slack App
              </div>
              <div className="mb-6">
                <Button
                  colorSchema="secondary"
                  onClick={() =>
                    window.open(
                      getCustomSlackAppCreationUrl(
                        adminIntegrationsConfig?.slack.govEnabled ?? false
                      )
                    )
                  }
                >
                  Create Slack App
                </Button>
              </div>
              <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
                Step 2: Configure your instance-wide settings to enable integration with Slack. Copy
                the values from the App Credentials page of your custom Slack App.
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
              <div>
                <Button
                  className="mt-2"
                  type="submit"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting || !isDirty}
                >
                  Save
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  );
};
