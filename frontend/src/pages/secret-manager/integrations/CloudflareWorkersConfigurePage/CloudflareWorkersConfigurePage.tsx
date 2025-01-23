import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { Button, Card, CardTitle, FormControl, Select, SelectItem } from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "@app/hooks/api/integrationAuth";

export const CloudflareWorkersConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();
  const { currentWorkspace } = useWorkspace();

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.CloudflareWorkersConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentWorkspace.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");

  const [targetApp, setTargetApp] = useState("");
  const [targetAppId, setTargetAppId] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
        setTargetAppId(String(integrationAuthApps[0].appId));
      } else {
        setTargetApp("none");
      }
    }
  }, [integrationAuthApps]);

  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?.id) return;

      setIsLoading(true);

      await mutateAsync({
        integrationAuthId: integrationAuth?.id,
        isActive: true,
        app: targetApp,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        secretPath
      });

      setIsLoading(false);

      navigate({
        to: "/secret-manager/$projectId/integrations",
        params: {
          projectId: currentWorkspace.id
        }
      });
    } catch (err) {
      console.error(err);

      let errorMessage: string = "Something went wrong!";
      if (axios.isAxiosError(err)) {
        const { message } = err?.response?.data as { message: string };
        errorMessage = message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
      setIsLoading(false);
    }
  };

  return integrationAuth && selectedSourceEnvironment && integrationAuthApps && targetApp ? (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left"
          subTitle="Choose which environment in Infisical you want to sync with your Cloudflare Workers project."
        >
          Cloudflare Workers Integration
        </CardTitle>
        <FormControl label="Infisical Project Environment" className="mt-2 px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {currentWorkspace?.environments.map((sourceEnvironment) => (
              <SelectItem
                value={sourceEnvironment.slug}
                key={`source-environment-${sourceEnvironment.slug}`}
              >
                {sourceEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <FormControl label="Infisical Secret Path" className="mt-2 px-6">
          <SecretPathInput
            value={secretPath}
            onChange={(value) => setSecretPath(value)}
            environment={selectedSourceEnvironment}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="Cloudflare Workers Project" className="mt-4 px-6">
          <Select
            value={targetApp}
            onValueChange={(val) => setTargetApp(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.name}
                  key={`target-app-${integrationAuthApp.name}`}
                >
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No apps found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mb-6 ml-auto mr-6 mt-2"
          isFullWidth={false}
          isLoading={isLoading}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
};
