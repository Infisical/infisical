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
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput
} from "@app/components/v3";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

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
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <BsSlack className="text-lg" />
              <div className="text-[15px] font-medium">Slack</div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex w-full flex-col gap-4">
              <div className="max-w-lg text-sm text-label">
                Step 1: Create your Infisical Slack App
              </div>
              <div>
                <Button
                  variant="neutral"
                  onClick={() => window.open(getCustomSlackAppCreationUrl())}
                >
                  Create Slack app
                </Button>
              </div>
              <div className="max-w-lg text-sm text-label">
                Step 2: Configure your instance-wide settings to enable integration with Slack. Copy
                the values from the App Credentials page of your custom Slack App.
              </div>
              <Controller
                control={control}
                name="clientId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="slack-client-id">Client ID</FieldLabel>
                    <Input
                      id="slack-client-id"
                      {...field}
                      value={field.value || ""}
                      isError={Boolean(error)}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="clientSecret"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="slack-client-secret">Client secret</FieldLabel>
                    <SecretInput
                      id="slack-client-secret"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <div>
                <Button
                  variant="neutral"
                  type="submit"
                  isPending={isSubmitting}
                  isDisabled={!isDirty}
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
