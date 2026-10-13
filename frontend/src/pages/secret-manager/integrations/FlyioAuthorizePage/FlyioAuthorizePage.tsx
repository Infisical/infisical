import { useState } from "react";
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
  CardContent,
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
      <Helmet>
        <title>Authorize Fly.io Integration</title>
      </Helmet>
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <div className="flex flex-row items-center">
              <div className="flex items-center pb-0.5">
                <img
                  src="/images/integrations/Flyio.svg"
                  height={30}
                  width={30}
                  alt="Fly.io logo"
                />
              </div>
              <span className="ml-2.5">Fly.io Integration </span>
              <a
                href="https://infisical.com/docs/integrations/cloud/flyio"
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
            After adding your access token, you will be prompted to set up an integration for a
            particular Infisical project and environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form onSubmit={handleSubmit(onFormSubmit)} className="pb-8 text-right">
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
            <Button
              className="mt-2 w-min"
              size="sm"
              type="submit"
              isPending={isLoading}
              variant="project"
            >
              Connect to Fly.io
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
