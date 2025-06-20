import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { FaGithub } from "react-icons/fa";
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
  Input,
  TextArea
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useUpdateServerConfig } from "@app/hooks/api";
import { AdminIntegrationsConfig } from "@app/hooks/api/admin/types";

const gitHubAppFormSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  appSlug: z.string(),
  appId: z.string(),
  privateKey: z.string()
});

type TGitHubAppConnectionForm = z.infer<typeof gitHubAppFormSchema>;

type Props = {
  adminIntegrationsConfig?: AdminIntegrationsConfig;
};

export const GitHubAppConnectionForm = ({ adminIntegrationsConfig }: Props) => {
  const { mutateAsync: updateAdminServerConfig } = useUpdateServerConfig();
  const [isGitHubAppClientSecretFocused, setIsGitHubAppClientSecretFocused] = useToggle();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TGitHubAppConnectionForm>({
    resolver: zodResolver(gitHubAppFormSchema)
  });

  const onSubmit = async (data: TGitHubAppConnectionForm) => {
    await updateAdminServerConfig({
      gitHubAppConnectionClientId: data.clientId,
      gitHubAppConnectionClientSecret: data.clientSecret,
      gitHubAppConnectionSlug: data.appSlug,
      gitHubAppConnectionId: data.appId,
      gitHubAppConnectionPrivateKey: data.privateKey
    });

    createNotification({
      text: "Updated GitHub app connection configuration. It can take up to 5 minutes to take effect.",
      type: "success"
    });
  };

  useEffect(() => {
    if (adminIntegrationsConfig) {
      setValue("clientId", adminIntegrationsConfig.gitHubAppConnection.clientId);
      setValue("clientSecret", adminIntegrationsConfig.gitHubAppConnection.clientSecret);
      setValue("appSlug", adminIntegrationsConfig.gitHubAppConnection.appSlug);
      setValue("appId", adminIntegrationsConfig.gitHubAppConnection.appId);
      setValue("privateKey", adminIntegrationsConfig.gitHubAppConnection.privateKey);
    }
  }, [adminIntegrationsConfig]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="github-app-integration" className="data-[state=open]:border-none">
          <AccordionTrigger className="flex h-fit w-full justify-start rounded-md border border-mineshaft-500 bg-mineshaft-700 px-4 py-6 text-sm transition-colors data-[state=open]:rounded-b-none">
            <div className="text-md group order-1 ml-3 flex items-center gap-2">
              <FaGithub className="text-lg group-hover:text-primary-400" />
              <div className="text-[15px] font-semibold">GitHub App</div>
            </div>
          </AccordionTrigger>
          <AccordionContent childrenClassName="px-0 py-0">
            <div className="flex w-full flex-col justify-start rounded-md rounded-t-none border border-t-0 border-mineshaft-500 bg-mineshaft-700 px-4 py-4">
              <div className="mb-2 max-w-lg text-sm text-mineshaft-300">
                Step 1: Create and configure GitHub App. Please refer to the documentation below for
                more information.
              </div>
              <div className="mb-6">
                <a
                  href="https://infisical.com/docs/integrations/app-connections/github#self-hosted-instance"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button colorSchema="secondary">Documentation</Button>
                </a>
              </div>
              <div className="mb-4 max-w-lg text-sm text-mineshaft-300">
                Step 2: Configure your instance-wide settings to enable GitHub App connections. Copy
                the credentials from your GitHub App&apos;s settings page.
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
                      type="text"
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
                    tooltipText="You can find your Client Secret in the GitHub App's settings under 'Client secrets'."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type={isGitHubAppClientSecretFocused ? "text" : "password"}
                      onFocus={() => setIsGitHubAppClientSecretFocused.on()}
                      onBlur={() => setIsGitHubAppClientSecretFocused.off()}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="appSlug"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="App Slug"
                    tooltipText="The GitHub App slug from the app's URL (e.g., 'my-app' from github.com/apps/my-app)."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type="text"
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="appId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="App ID"
                    tooltipText="The numeric App ID found in your GitHub App's settings."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      value={field.value || ""}
                      type="text"
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="privateKey"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Private Key"
                    tooltipText="The private key generated for your GitHub App (PEM format)."
                    className="w-96"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <TextArea
                      {...field}
                      value={field.value || ""}
                      className="min-h-32"
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
