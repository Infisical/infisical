import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
  accessToken: z.string().trim()
});

type FormData = z.infer<typeof schema>;

export const FlyioAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessToken: ""
    }
  });

  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [isLoading, setIsLoading] = useState(false);

  const onFormSubmit = async ({ accessToken }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "flyio",
        accessToken
      });

      setIsLoading(false);
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/flyio/create",
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
      <PageTitle title="Authorize Fly.io Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src="/images/integrations/Flyio.svg" height={30} width={30} alt="Fly.io logo" />
            <span>Fly.io Integration</span>
          </CardTitle>
          <CardDescription>
            After adding your access token, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                href="https://infisical.com/docs/integrations/cloud/flyio"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-5">
          <CardContent>
            <Controller
              control={control}
              name="accessToken"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="flyio-accesstoken">Fly.io Access Token</FieldLabel>
                  <Input
                    {...field}
                    placeholder=""
                    type="password"
                    autoComplete="new-password"
                    id="flyio-accesstoken"
                    isError={Boolean(error)}
                    aria-describedby={error ? "flyio-accesstoken-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="flyio-accesstoken-error">{error?.message}</FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button size="sm" type="submit" isPending={isLoading} variant="project">
              Connect to Fly.io
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
