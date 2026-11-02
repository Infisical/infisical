import crypto from "crypto";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
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
  TextArea
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { localStorageService } from "@app/helpers/localStorage";
import { useGetCloudIntegrations, useSaveIntegrationAccessToken } from "@app/hooks/api";

import { createIntegrationMissingEnvVarsNotification } from "../../IntegrationsListPage/IntegrationsListPage.utils";

const schema = z.object({
  accessToken: z.string()
});

type FormData = z.infer<typeof schema>;

export const GcpSecretManagerAuthorizePage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { control, handleSubmit } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const { currentProject } = useProject();

  const { mutateAsync } = useSaveIntegrationAccessToken();

  const [isLoading, setIsLoading] = useState(false);

  const handleIntegrateWithOAuth = () => {
    if (!cloudIntegrations) return;
    const integrationOption = cloudIntegrations.find(
      (integration) => integration.slug === "gcp-secret-manager"
    );

    if (!integrationOption) return;

    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorageService.setIntegrationProjectId(currentProject.id);

    if (!integrationOption.clientId) {
      createIntegrationMissingEnvVarsNotification(integrationOption.slug);
      return;
    }

    const link = `https://accounts.google.com/o/oauth2/auth?scope=https://www.googleapis.com/auth/cloud-platform&response_type=code&access_type=offline&state=${state}&redirect_uri=${window.location.origin}/integrations/gcp-secret-manager/oauth2/callback&client_id=${integrationOption.clientId}`;
    window.location.assign(link);
  };

  const onFormSubmit = async ({ accessToken }: FormData) => {
    try {
      setIsLoading(true);

      const integrationAuth = await mutateAsync({
        workspaceId: currentProject.id,
        integration: "gcp-secret-manager",
        refreshToken: accessToken
      });

      setIsLoading(false);
      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/gcp-secret-manager/create",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          integrationAuthId: integrationAuth.id
        }
      });
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Authorize GCP Secret Manager Integration" />
      <Card className="mb-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img
              src="/images/integrations/Google Cloud Platform.png"
              height={30}
              width={30}
              alt="GCP logo"
            />
            <span>GCP Secret Manager Integration</span>
          </CardTitle>
          <CardDescription>
            Connect Infisical to GCP Secret Manager to sync secrets.
          </CardDescription>
          <CardAction>
            <Badge variant="info" asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/integrations/cloud/gcp-secret-manager"
              >
                <FontAwesomeIcon icon={faBookOpen} />
                Docs
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            </Badge>
          </CardAction>
        </CardHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-5">
          <CardContent className="flex flex-col gap-5">
            <div>
              <Button
                onClick={handleIntegrateWithOAuth}
                className="mx-0 mt-4 w-full"
                variant="project"
              >
                <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                Continue with OAuth
              </Button>
              <div className="my-4 flex w-full flex-row items-center py-2">
                <div className="w-full border-t border-border-emphasis/40" />
                <span className="mx-2 text-xs text-muted">or</span>
                <div className="w-full border-t border-border-emphasis/40" />
              </div>
            </div>
            <Controller
              control={control}
              name="accessToken"
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4" data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="gcpsecretmanager-accesstoken">
                    GCP Service Account JSON
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="gcpsecretmanager-accesstoken"
                    isError={Boolean(error)}
                    aria-describedby={error ? "gcpsecretmanager-accesstoken-error" : undefined}
                  />
                  {Boolean(error) && (
                    <FieldError id="gcpsecretmanager-accesstoken-error">
                      {error?.message}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button size="sm" type="submit" isPending={isLoading} variant="project">
              Connect to GCP Secret Manager
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
