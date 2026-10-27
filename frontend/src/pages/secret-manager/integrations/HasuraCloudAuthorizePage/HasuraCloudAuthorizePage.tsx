import { useState } from "react";
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
import { useSaveIntegrationAccessToken } from "@app/hooks/api";

const schema = z.object({
  accessToken: z.string().trim()
});

type FormData = z.infer<typeof schema>;

const APP_NAME = "Hasura Cloud";
export const HasuraCloudAuthorizePage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const { mutateAsync } = useSaveIntegrationAccessToken();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessToken: ""
    }
  });

  const onFormSubmit = async ({ accessToken }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "hasura-cloud",
        accessToken
      });

      setIsLoading(false);
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/hasura-cloud/create",
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
      <PageTitle title={`Authorize ${APP_NAME} Integration`} />
      <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>
              <img
                src="/images/integrations/Hasura.svg"
                height={30}
                width={30}
                alt={`${APP_NAME} logo`}
              />
              {APP_NAME} Integration
              <DocumentationLinkBadge href="https://infisical.com/docs/integrations/cloud/hasura-cloud" />
            </CardTitle>
            <CardDescription>
              After adding your access token, you will be prompted to set up an integration for a
              particular Infisical project and environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="accessToken"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="HasuraCloudAuthorizePage-field-1">{`${APP_NAME} Access Token`}</FieldLabel>
                  <Input
                    id="HasuraCloudAuthorizePage-field-1"
                    aria-describedby="HasuraCloudAuthorizePage-field-1-feedback"
                    isError={Boolean(error)}
                    {...field}
                    placeholder=""
                  />
                  {Boolean(error) && (
                    <FieldError id="HasuraCloudAuthorizePage-field-1-feedback">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button size="sm" type="submit" isPending={isLoading} variant="project">
              Connect to {APP_NAME}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};
