import crypto from "crypto";

import { useCallback, useEffect } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button, Card, CardTitle, ContentLoader } from "@app/components/v2";
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
    return <ContentLoader />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Helmet>
        <title>Select Connection</title>
      </Helmet>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select an existing connection below or create a new one for your integration."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <img src={logo} height={30} width={30} alt="Integration logo" />
            </div>
            <span className="ml-2.5">Select Connection</span>
          </div>
        </CardTitle>
        <div className="mb-7 flex flex-col items-center">
          {!isLoadingIntegrationAuths && integrationAuths?.length
            ? integrationAuths.map((integrationAuth) => {
                let connectionName = "";

                if (integrationAuth.integration === "github") {
                  connectionName = integrationAuth.metadata?.installationName || "";
                }

                return (
                  <Button
                    colorSchema="secondary"
                    className="mt-3 w-3/4"
                    isDisabled={isIntegrationAuthSelectLoading}
                    key={integrationAuth.id}
                    size="sm"
                    type="submit"
                    onClick={() => handleConnectionSelect(integrationAuth)}
                  >
                    {connectionName}
                  </Button>
                );
              })
            : undefined}
          <div className="mt-6 flex w-full flex-row items-center justify-center">
            <div className="w-1/5 border-t border-mineshaft-400" />
            <p className="mx-4 text-xs text-gray-400">OR</p>
            <div className="w-1/5 border-t border-mineshaft-400" />
          </div>
          <Button
            colorSchema="primary"
            className="mt-6 w-3/4"
            size="sm"
            type="submit"
            onClick={handleNewConnection}
          >
            Create New Connection
          </Button>
        </div>
      </Card>
    </div>
  );
};
