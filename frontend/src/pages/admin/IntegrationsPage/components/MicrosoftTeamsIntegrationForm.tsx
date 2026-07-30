import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { BsMicrosoftTeams } from "react-icons/bs";
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
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SecretInput
} from "@app/components/v3";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

const microsoftTeamsFormSchema = z.object({
  appId: z.string(),
  clientSecret: z.string(),
  botId: z.string()
});

type TMicrosoftTeamsForm = z.infer<typeof microsoftTeamsFormSchema>;

type Props = {
  adminIntegrationsConfig?: AdminIntegrationsConfig;
};

export const MicrosoftTeamsIntegrationForm = ({ adminIntegrationsConfig }: Props) => {
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TMicrosoftTeamsForm>({
    resolver: zodResolver(microsoftTeamsFormSchema)
  });

  const onSubmit = async (data: TMicrosoftTeamsForm) => {
    await updateAdminServerConfig({
      microsoftTeamsAppId: data.appId,
      microsoftTeamsClientSecret: data.clientSecret,
      microsoftTeamsBotId: data.botId
    });

    createNotification({
      text: "Updated admin Microsoft Teams configuration. It can take up to 5 minutes to take effect.",
      type: "success"
    });
  };

  useEffect(() => {
    if (adminIntegrationsConfig) {
      setValue("appId", adminIntegrationsConfig.microsoftTeams.appId);
      setValue("clientSecret", adminIntegrationsConfig.microsoftTeams.clientSecret);
      setValue("botId", adminIntegrationsConfig.microsoftTeams.botId);
    }
  }, [adminIntegrationsConfig]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="microsoft-teams-integration"
          className="data-[state=open]:border-none"
        >
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <BsMicrosoftTeams className="text-lg" />
              <div className="text-[15px] font-medium">Microsoft Teams</div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex w-full flex-col gap-4">
              <div className="max-w-lg text-sm text-label">
                Step 1: Create and configure Microsoft Teams bot and Azure Resources. Please refer
                to the documentation below for more information.
              </div>
              <div>
                <Button variant="neutral" asChild>
                  <a
                    href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                  </a>
                </Button>
              </div>
              <div className="max-w-lg text-sm text-label">
                Step 2: Configure your instance-wide settings to enable integration with Microsoft
                Teams. Copy the App ID and Client Secret from your Microsoft Teams bot&apos;s App
                Registration page. The Client Secret is the password for the bot.
              </div>
              <Controller
                control={control}
                name="appId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="teams-app-client-id">Application (Client) ID</FieldLabel>
                    <Input
                      id="teams-app-client-id"
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
                    <FieldLabel htmlFor="teams-client-secret">Client secret</FieldLabel>
                    <SecretInput
                      id="teams-client-secret"
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldDescription>
                      Find this value under Certificates &amp; secrets in the bot&apos;s app
                      registration.
                    </FieldDescription>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="botId"
                render={({ field, fieldState: { error } }) => (
                  <Field className="max-w-96">
                    <FieldLabel htmlFor="teams-app-id">Microsoft Teams App ID</FieldLabel>
                    <Input
                      id="teams-app-id"
                      {...field}
                      value={field.value || ""}
                      isError={Boolean(error)}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <FieldDescription>
                      Find this value in the app overview in the Microsoft Teams Developer Portal.
                    </FieldDescription>
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
