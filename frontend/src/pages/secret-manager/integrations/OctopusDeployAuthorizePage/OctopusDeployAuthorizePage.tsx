import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { removeTrailingSlash } from "@app/helpers/string";
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const formSchema = z.object({
  instanceUrl: z.string().min(1, { message: "Instance URL required" }),
  apiKey: z.string().min(1, { message: "API Key required" })
});

type TForm = z.infer<typeof formSchema>;

export const OctopusDeployAuthorizePage = () => {
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useSaveIntegrationAccessToken();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { control, handleSubmit } = useForm<TForm>({
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async ({ instanceUrl, apiKey }: TForm) => {
    const integrationAuth = await mutateAsync({
      workspaceId: currentProject.id,
      integration: "octopus-deploy",
      url: removeTrailingSlash(instanceUrl),
      accessToken: apiKey
    });

    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/octopus-deploy/create",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      },
      search: {
        integrationAuthId: integrationAuth.id
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <PageTitle title="Authorize Octopus Deploy Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Octopus Deploy.png"
              height={30}
              width={30}
              alt="Octopus Deploy logo"
            />
            Octopus Deploy Integration
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/octopus-deploy" />
          </CardTitle>
          <CardDescription>
            After adding your credentials, you will be prompted to set up an integration for a
            particular environment and secret path.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployAuthorizePage-field-1">
                  Octopus Deploy Instance URL
                </FieldLabel>
                <Input
                  id="OctopusDeployAuthorizePage-field-1"
                  aria-describedby="OctopusDeployAuthorizePage-field-1-feedback"
                  isError={Boolean(error)}
                  value={value}
                  onChange={onChange}
                  placeholder="https://xxxx.octopus.app"
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployAuthorizePage-field-1-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
            name="instanceUrl"
            control={control}
          />
          <Controller
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployAuthorizePage-field-2">
                  Octopus Deploy API Key
                </FieldLabel>
                <Input
                  id="OctopusDeployAuthorizePage-field-2"
                  aria-describedby="OctopusDeployAuthorizePage-field-2-feedback"
                  isError={Boolean(error)}
                  value={value}
                  onChange={onChange}
                  placeholder="API-XXXXXXXXXXXXXXXXXXXXXXXX"
                  type="password"
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployAuthorizePage-field-2-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
            name="apiKey"
            control={control}
          />
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button type="submit" isPending={isPending} isDisabled={isPending} variant="project">
            Connect to Octopus Deploy
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
