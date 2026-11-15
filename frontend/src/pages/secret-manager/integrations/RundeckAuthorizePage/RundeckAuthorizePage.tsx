import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import z from "zod";

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
      <PageTitle title="Authorize Rundeck Integration" />
      <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Rundeck.svg"
                height={30}
                width={30}
                alt="Rundeck logo"
              />
              Rundeck Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cicd/rundeck" />
            </CardTitle>
            <CardDescription>
              After adding your URL and auth token, you will be prompted to set up an integration
              for a particular Infisical project and environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="rundeckURL"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
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
                <Field data-invalid={Boolean(error)}>
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
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button type="submit" isPending={isLoading} variant="project">
              Connect to Rundeck
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
