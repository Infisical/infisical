import { useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

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
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const schema = z.object({
  authToken: z.string().trim().min(1, { message: "Rundeck Auth Token is required" }),
  rundeckURL: z.string().trim().min(1, {
    message: "Rundeck URL is required"
  })
});

type FormData = z.infer<typeof schema>;

export const RundeckAuthorizePage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { mutateAsync } = useSaveIntegrationAccessToken();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      authToken: "",
      rundeckURL: ""
    }
  });

  const onFormSubmit = async ({ authToken, rundeckURL }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "rundeck",
        accessToken: authToken,
        url: rundeckURL.trim()
      });

      setIsLoading(false);
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/rundeck/create",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          integrationAuthId: integrationAuth.id
        }
      });
    } catch (err) {
      setIsLoading(false);
      console.error(err);
    }
  };
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Authorize Rundeck Integration</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/Rundeck.svg"
                  height={30}
                  width={30}
                  alt="Rundeck logo"
                />
              </div>
              <span className="ml-2.5">Rundeck Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cicd/rundeck"
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
            After adding your URL and auth token, you will be prompted to set up an integration for
            a particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6 pb-8 text-right">
          <Controller
            control={control}
            name="rundeckURL"
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RundeckAuthorizePage-field-1">URL</FieldLabel>
                <Input
                  id="RundeckAuthorizePage-field-1"
                  aria-describedby="RundeckAuthorizePage-field-1-feedback"
                  isError={Boolean(error)}
                  {...field}
                  placeholder="https://self-hosted-rundeck.com"
                />
                {Boolean(error) && (
                  <FieldError id="RundeckAuthorizePage-field-1-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="authToken"
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4" data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="RundeckAuthorizePage-field-2">Rundeck Auth Token</FieldLabel>
                <Input
                  id="RundeckAuthorizePage-field-2"
                  aria-describedby="RundeckAuthorizePage-field-2-feedback"
                  isError={Boolean(error)}
                  {...field}
                  placeholder=""
                />
                {Boolean(error) && (
                  <FieldError id="RundeckAuthorizePage-field-2-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Button
            className="mt-2 w-min"
            size="sm"
            type="submit"
            isPending={isLoading}
            variant="project"
          >
            Connect to Rundeck
          </Button>
        </form>
      </Card>
    </div>
  );
};
