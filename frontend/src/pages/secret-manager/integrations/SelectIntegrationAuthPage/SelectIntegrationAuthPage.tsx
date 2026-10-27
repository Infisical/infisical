import crypto from "crypto";

import { useCallback, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldSeparator,
  Loader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  useDuplicateIntegrationAuth,
  useGetCloudIntegrations,
  useGetOrgIntegrationAuths
} from "@app/hooks/api";
import { IntegrationAuth } from "@app/hooks/api/types";

import { createIntegrationMissingEnvVarsNotification } from "../../IntegrationsListPage/IntegrationsListPage.utils";

export const SelectIntegrationAuthPage = () => {
  const navigate = useNavigate();
  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const orgId = currentOrg?.id || "";

  const integrationSlug = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.SelectIntegrationAuth.id,
    select: (el) => el.integrationSlug
  });

  const currentIntegration = cloudIntegrations?.find(
    (integration) => integration.slug === integrationSlug
  );
  const { mutateAsync: duplicateIntegrationAuth, isPending: isIntegrationAuthSelectLoading } =
    useDuplicateIntegrationAuth();

  // for Github, we want to reuse the same connection across the Infisical organization
  // when we do need to reuse this page for other integrations, add handling to fetch workspace integration auths instead
  const {
    data: integrationAuths,
    isPending: isLoadingIntegrationAuths,
    isSuccess: isLoadingIntegrationAuthsSuccess
  } = useGetOrgIntegrationAuths(
    orgId,
    useCallback(
      (data: IntegrationAuth[]) => {
        const filteredIntegrationAuths = data.filter(
          (integrationAuth) => integrationAuth.integration === integrationSlug
        );

        if (integrationSlug === "github") {
          const sameProjectIntegrationAuths = filteredIntegrationAuths.filter(
            (auth) => auth.projectId === currentProject?.id
          );
          const differentProjectIntegrationAuths = filteredIntegrationAuths.filter(
            (auth) => auth.projectId !== currentProject?.id
          );

          const installationIds = new Set<string>();

          // for now, we only display the integration auths for Github apps
          return (
            // we concatenate it this way so that integration auths from the same project are prioritized for display
            sameProjectIntegrationAuths
              .concat(differentProjectIntegrationAuths)
              .filter((integrationAuth) => Boolean(integrationAuth.metadata?.installationId))
              // we filter it so that we only show unique installations because the same installation/connection
              // can be used in multiple integration auths
              .filter((integrationAuth) => {
                const isProcessedInstallationId = installationIds.has(
                  integrationAuth.metadata.installationId as string
                );

                if (!isProcessedInstallationId) {
                  installationIds.add(integrationAuth.metadata.installationId as string);
                }

                return !isProcessedInstallationId;
              })
          );
        }

        return [];
      },
      [integrationSlug]
    )
  );

  const handleNewConnection = () => {
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);

    if (integrationSlug === "github") {
      if (!currentIntegration?.clientSlug) {
        createIntegrationMissingEnvVarsNotification("githubactions", "cicd");
        return;
      }

      // for now we only handle Github apps
      window.location.assign(
        `https://github.com/apps/${currentIntegration?.clientSlug}/installations/new?state=${state}`
      );
    }
  };

  useEffect(() => {
    if (
      !isLoadingIntegrationAuths &&
      integrationAuths?.length === 0 &&
      isLoadingIntegrationAuthsSuccess
    ) {
      handleNewConnection();
    }
  }, [isLoadingIntegrationAuths, integrationAuths, isLoadingIntegrationAuthsSuccess]);

  const logo = integrationSlug === "github" ? "/images/integrations/GitHub.png" : "";

  const handleConnectionSelect = async (integrationAuth: IntegrationAuth) => {
    if (integrationSlug === "github") {
      if (integrationAuth.projectId === currentProject?.id) {
        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/create",
          params: {
            orgId: currentOrg.id,
            projectId: currentProject.id
          },
          search: {
            integrationAuthId: integrationAuth.id
          }
        });
      } else {
        // we create a copy of the existing integration auth from another project to the current project
        const newIntegrationAuth = await duplicateIntegrationAuth({
          projectId: currentProject?.id || "",
          integrationAuthId: integrationAuth.id
        });

        navigate({
          to: "/organizations/$orgId/projects/secret-management/$projectId/integrations/github/create",
          params: {
            orgId: currentOrg.id,
            projectId: currentProject.id
          },
          search: {
            integrationAuthId: newIntegrationAuth.id
          }
        });
      }
    }
  };

  if (
    isLoadingIntegrationAuths ||
    (integrationAuths?.length === 0 && isLoadingIntegrationAuthsSuccess)
  ) {
    return (
      <>
        <PageTitle title="Select Connection" />
        <div className="container mx-auto flex h-screen w-full items-center justify-center px-8">
          <Loader variant="brand" size="lg" className="h-32" />
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <PageTitle title="Select Connection" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <img src={logo} height={30} width={30} alt="Integration logo" />
            Select Connection
          </CardTitle>
          <CardDescription>
            Select an existing connection below or create a new one for your integration.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isLoadingIntegrationAuths && integrationAuths?.length ? (
            <div className="flex flex-col gap-2">
              {integrationAuths.map((integrationAuth) => {
                let connectionName = "";

                if (integrationAuth.integration === "github") {
                  connectionName = integrationAuth.metadata?.installationName || "";
                }

                return (
                  <Button
                    isFullWidth
                    isDisabled={isIntegrationAuthSelectLoading}
                    key={integrationAuth.id}
                    type="submit"
                    onClick={() => handleConnectionSelect(integrationAuth)}
                    variant="outline"
                  >
                    {connectionName}
                  </Button>
                );
              })}
            </div>
          ) : undefined}
          <FieldSeparator>OR</FieldSeparator>
          <Button isFullWidth type="submit" onClick={handleNewConnection} variant="project">
            Create New Connection
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
