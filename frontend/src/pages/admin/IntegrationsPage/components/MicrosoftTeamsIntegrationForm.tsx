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
  FormControl,
  Input
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
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
  const [isMicrosoftTeamsAppIdFocused, setIsMicrosoftTeamsAppIdFocused] = useToggle();
  const [isMicrosoftTeamsClientSecretFocused, setIsMicrosoftTeamsClientSecretFocused] = useToggle();
  const [isMicrosoftTeamsBotIdFocused, setIsMicrosoftTeamsBotIdFocused] = useToggle();
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
          <AccordionTrigger className="flex h-fit w-full justify-start rounded-md border border-mineshaft-500 bg-mineshaft-700 px-4 py-6 text-sm transition-colors data-[state=open]:rounded-b-none">
            <div className="text-md group order-1 ml-3 flex items-center gap-2">
              <BsMicrosoftTeams className="text-lg group-hover:text-primary-400" />
              <div className="text-[15px] font-semibold">Microsoft Teams</div>
            </div>
          </AccordionTrigger>
          <AccordionContent childrenClassName="px-0 py-0">
            <div className="flex w-full flex-col justify-start rounded-md rounded-t-none border border-t-0 border-mineshaft-500 bg-mineshaft-700 px-4 py-4">
              <div className="mb-2 max-w-lg text-sm text-mineshaft-300">
                Step 1: Create and configure Microsoft Teams bot and Azure Resources. Please refer
                to the documentation below for more information.
              </div>
              <div className="mb-6">
                <a
                  href="https://infisical.com/docs/documentation/platform/workflow-integrations/microsoft-teams-integration"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button colorSchema="secondary">Documentation</Button>
                </a>
              </div>
              <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
                Step 2: Configure your instance-wide settings to enable integration with Microsoft
                Teams. Copy the App ID and Client Secret from your Microsoft Teams bot&apos;s App
                Registration page. The Client Secret is the password for the bot.
              </div>
              <Controller
                control={control}
                name="appId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Application (Client) ID"
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type={isMicrosoftTeamsAppIdFocused ? "text" : "password"}
                      onFocus={() => setIsMicrosoftTeamsAppIdFocused.on()}
                      onBlur={() => setIsMicrosoftTeamsAppIdFocused.off()}
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
                    tooltipText="You can find your Client Secret in the Certificates & Secrets section of your Microsoft Teams bot's App Registration."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type={isMicrosoftTeamsClientSecretFocused ? "text" : "password"}
                      onFocus={() => setIsMicrosoftTeamsClientSecretFocused.on()}
                      onBlur={() => setIsMicrosoftTeamsClientSecretFocused.off()}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="botId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Microsoft Teams App ID"
                    tooltipText="You can find the Microsoft Teams App ID in the overview of your Microsoft Teams App inside the Microsoft Teams Developer Portal."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type={isMicrosoftTeamsBotIdFocused ? "text" : "password"}
                      onFocus={() => setIsMicrosoftTeamsBotIdFocused.on()}
                      onBlur={() => setIsMicrosoftTeamsBotIdFocused.off()}
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
