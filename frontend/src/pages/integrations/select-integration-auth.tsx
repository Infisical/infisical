import crypto from "crypto";

import { useCallback } from "react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";

import { Button, Card, CardTitle } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetCloudIntegrations, useGetWorkspaceAuthorizations } from "@app/hooks/api";
import { IntegrationAuth } from "@app/hooks/api/types";

export default function SelectIntegrationAuthPage() {
  const router = useRouter();
  const { data: cloudIntegrations } = useGetCloudIntegrations();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";

  const integrationSlug = router.query.integrationSlug as string;

  const currentIntegration = cloudIntegrations?.find(
    (integration) => integration.slug === integrationSlug
  );

  const { data: integrationAuths, isLoading: isLoadingIntegrationAuths } =
    useGetWorkspaceAuthorizations(
      workspaceId,
      useCallback((data: IntegrationAuth[]) => {
        const filteredIntegrationAuths = data.filter(
          (integrationAuth) => integrationAuth.integration === integrationSlug
        );

        if (integrationSlug === "github") {
          // for now, we only display the integration auths for Github apps
          return filteredIntegrationAuths.filter((integrationAuth) =>
            Boolean(integrationAuth.metadata?.installationName)
          );
        }

        return [];
      }, [])
    );

  const logo = integrationSlug === "github" ? "/images/integrations/GitHub.png" : "";

  const handleConnectionSelect = (integrationAuthId: string) => {
    if (integrationSlug === "github") {
      router.push(`/integrations/github/create?integrationAuthId=${integrationAuthId}`);
    }
  };

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

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Head>
        <title>Select Connection</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <Card className="mb-12 max-w-lg rounded-md border border-mineshaft-600">
        <CardTitle
          className="px-6 text-left text-xl"
          subTitle="Select a connection that you want to use for the new integration."
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
                    colorSchema="gray"
                    variant="outline"
                    className="mt-3 w-3/4"
                    key={integrationAuth.id}
                    size="sm"
                    type="submit"
                    onClick={() => handleConnectionSelect(integrationAuth.id)}
                  >
                    {connectionName}
                  </Button>
                );
              })
            : undefined}
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
