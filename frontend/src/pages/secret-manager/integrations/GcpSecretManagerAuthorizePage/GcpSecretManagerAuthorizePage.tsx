import crypto from "crypto";

import { useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { Button, Card, CardTitle, FormControl, TextArea } from "@app/components/v2";
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
      <Helmet>
        <title>Authorize GCP Secret Manager Integration</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Connect Infisical to GCP Secret Manager to sync secrets."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img
                src="/images/integrations/Google Cloud Platform.png"
                height={30}
                width={30}
                alt="GCP logo"
              />
            </div>
            <span className="ml-1.5">GCP Secret Manager Integration </span>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://infisical.com/docs/integrations/cloud/gcp-secret-manager"
            >
              <div className="mb-1 ml-2 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pt-[0.04rem] pb-[0.03rem] text-sm text-yellow opacity-80 hover:opacity-100">
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
        <div className="px-6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={handleIntegrateWithOAuth}
            leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
            className="mx-0 mt-4 h-11 w-full"
          >
            Continue with OAuth
          </Button>
          <div className="my-4 flex w-full flex-row items-center py-2">
            <div className="w-full border-t border-mineshaft-400/40" />
            <span className="mx-2 text-xs text-mineshaft-400">or</span>
            <div className="w-full border-t border-mineshaft-400/40" />
          </div>
        </div>
        <form onSubmit={handleSubmit(onFormSubmit)} className="px-6 pb-8 text-right">
          <Controller
            control={control}
            name="accessToken"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="GCP Service Account JSON"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <TextArea
                  {...field}
                  className="h-48 border border-mineshaft-600 bg-bunker-900/80"
                />
              </FormControl>
            )}
          />
          <Button
            colorSchema="primary"
            variant="outline_bg"
            className="mt-2 w-min"
            size="sm"
            type="submit"
            isLoading={isLoading}
          >
            Connect to GCP Secret Manager
          </Button>
        </form>
      </Card>
    </div>
  );
};
