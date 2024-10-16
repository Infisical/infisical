import crypto from "crypto";

import { useCallback, useEffect } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";

import { Button, Card, CardTitle, ContentLoader } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useDuplicateIntegrationAuth,
  useGetCloudIntegrations,
  useGetOrgIntegrationAuths
} from "@app/hooks/api";
import { IntegrationAuth } from "@app/hooks/api/types";

export default function SelectIntegrationAuthPage() {
  const router = useRouter();
  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const orgId = currentOrg?.id || "";

  const integrationSlug = router.query.integrationSlug as string;

  const currentIntegration = cloudIntegrations?.find(
    (integration) => integration.slug === integrationSlug
  );
  const { mutateAsync: duplicateIntegrationAuth, isLoading: isIntegrationAuthSelectLoading } =
    useDuplicateIntegrationAuth();

  // for Github, we want to reuse the same connection across the Infisical organization
  // when we do need to reuse this page for other integrations, add handling to fetch workspace integration auths instead
  const {
    data: integrationAuths,
    isLoading: isLoadingIntegrationAuths,
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
            (auth) => auth.projectId === currentWorkspace?.id
          );
          const differentProjectIntegrationAuths = filteredIntegrationAuths.filter(
            (auth) => auth.projectId !== currentWorkspace?.id
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
      if (integrationAuth.projectId === currentWorkspace?.id) {
        router.push(`/integrations/github/create?integrationAuthId=${integrationAuth.id}`);
      } else {
        // we create a copy of the existing integration auth from another project to the current project
        const newIntegrationAuth = await duplicateIntegrationAuth({
          projectId: currentWorkspace?.id || "",
          integrationAuthId: integrationAuth.id
        });

        router.push(`/integrations/github/create?integrationAuthId=${newIntegrationAuth.id}`);
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
      <Head>
        <title>Select Connection</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select an existing connection below or create a new one for your integration."
        >
          <div className="flex flex-row items-center">
            <div className="flex items-center pb-0.5">
              <Image src={logo} height={30} width={30} alt="Integration logo" />
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
}

SelectIntegrationAuthPage.requireAuth = true;
