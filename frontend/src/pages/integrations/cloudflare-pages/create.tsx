import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import queryString from "query-string";

import { createNotification } from "@app/components/notifications";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useCreateIntegration, useGetWorkspaceById } from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Select,
  SelectItem,
  Switch
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById
} from "../../../hooks/api/integrationAuth";

const cloudflareEnvironments = [
  { name: "Production", slug: "production" },
  { name: "Preview", slug: "preview" }
];

export default function CloudflarePagesIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const [secretPath, setSecretPath] = useState("/");
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [targetApp, setTargetApp] = useState("");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironment, setTargetEnvironment] = useState("");
  const [shouldAutoRedeploy, setShouldAutoRedeploy] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetApp(integrationAuthApps[0].name);
        setTargetAppId(String(integrationAuthApps[0].appId));
        setTargetEnvironment(cloudflareEnvironments[0].slug);
      } else {
        setTargetApp("none");
        setTargetEnvironment(cloudflareEnvironments[0].slug);
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
        targetEnvironment,
        secretPath,
        metadata: {
          shouldAutoRedeploy
        }
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
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

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetEnvironment &&
    targetApp ? (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-mineshaft-900 to-bunker-900">
      <Card className="max-w-lg rounded-md border border-mineshaft-600 p-0">
        <CardTitle
          className="px-6 text-left"
          subTitle="Choose which environment in Infisical you want to sync with your Cloudflare Pages project."
        >
          Cloudflare Pages Integration
        </CardTitle>
        <FormControl label="Infisical Project Environment" className="mt-2 px-6">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {workspace?.environments.map((sourceEnvironment) => (
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
        <FormControl label="Cloudflare Pages Project" className="mt-4 px-6">
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
        <FormControl label="Cloudflare Pages Environment" className="mt-4 px-6">
          <Select
            value={targetEnvironment}
            onValueChange={(val) => setTargetEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {cloudflareEnvironments.map((cloudflareEnvironment) => (
              <SelectItem
                value={cloudflareEnvironment.slug}
                key={`target-environment-${cloudflareEnvironment.slug}`}
              >
                {cloudflareEnvironment.name}
              </SelectItem>
            ))}
          </Select>
        </FormControl>
        <div className="mb-[2.36rem] ml-1 px-6">
          <Switch
            id="redeploy-cloudflare-pages"
            onCheckedChange={(isChecked: boolean) => setShouldAutoRedeploy(isChecked)}
            isChecked={shouldAutoRedeploy}
          >
            Auto-redeploy service upon secret change
          </Switch>
        </div>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          variant="outline_bg"
          className="mt-2 mb-6 ml-auto mr-6"
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
}

CloudflarePagesIntegrationPage.requireAuth = true;
