import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
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
      <Helmet>
        <title>Authorize Octopus Deploy Integration</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="inline-flex items-center pb-0.5">
                <img
                  src="/images/integrations/Octopus Deploy.png"
                  height={30}
                  width={30}
                  alt="Octopus Deploy logo"
                />
              </div>
              <span className="ml-1.5">Octopus Deploy Integration</span>
              <a
                href="https://infisical.com/docs/integrations/cloud/octopus-deploy"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-warning/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-warning opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  Docs
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="text-xxs mb-[0.07rem] ml-1.5"
                  />
                </div>
              </a>
            </div>
          </CardTitle>
          <CardDescription>
            After adding your credentials, you will be prompted to set up an integration for a
            particular environment and secret path.
          </CardDescription>
        </CardHeader>
        <Controller
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4 px-6" data-invalid={Boolean(error)}>
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
            <Field className="mb-4 px-6" data-invalid={Boolean(error)}>
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
        <Button
          type="submit"
          className="mt-2 mr-6 mb-6 ml-auto w-min"
          isPending={isPending}
          disabled={isPending}
          variant="project"
        >
          Connect to Octopus Deploy
        </Button>
      </Card>
    </form>
  );
};
