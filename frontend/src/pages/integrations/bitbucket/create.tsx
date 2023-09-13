import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import queryString from "query-string";

import {
  useCreateIntegration
} from "@app/hooks/api";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "../../../components/v2";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthBitBucketWorkspaces,
  useGetIntegrationAuthById,
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function BitBucketCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: targetEnvironments } = useGetIntegrationAuthBitBucketWorkspaces((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? "",
    workspaceSlug: targetEnvironmentId
  });

  useEffect(() => {
    if (workspace) {
      setSelectedSourceEnvironment(workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setTargetAppId(integrationAuthApps[0].appId as string);
      } else {
        setTargetAppId("none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (targetEnvironments) {
      if (targetEnvironments.length > 0) {
        setTargetEnvironmentId(targetEnvironments[0].slug);
      } else {
        setTargetEnvironmentId("none");
      }
    }
  }, [targetEnvironments]);

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetEnvironment = targetEnvironments?.find(
        (environment) => environment.slug === targetEnvironmentId
      );

      if (!targetApp || !targetApp.appId || !targetEnvironment) return;

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment.name,
        targetEnvironmentId: targetEnvironment.slug,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetEnvironments ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">BitBucket Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
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
        <FormControl label="Secrets Path">
          <Input
            value={secretPath}
            onChange={(evt) => setSecretPath(evt.target.value)}
            placeholder="Provide a path, default is /"
          />
        </FormControl>
        <FormControl label="BitBucket Workspace">
          <Select
            value={targetEnvironmentId}
            onValueChange={(val) => setTargetEnvironmentId(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={targetEnvironments.length === 0}
          >
            {targetEnvironments.length > 0 ? (
              targetEnvironments.map((targetEnvironment) => (
                <SelectItem
                  value={targetEnvironment.slug as string}
                  key={`target-environment-${targetEnvironment.slug as string}`}
                >
                  {targetEnvironment.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-environment-none">
                No workspaces found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="BitBucket Repo">
          <Select
            value={targetAppId}
            onValueChange={(val) => setTargetAppId(val)}
            className="w-full border border-mineshaft-500"
          >
            {integrationAuthApps.length > 0 ? (
              integrationAuthApps.map((integrationAuthApp) => (
                <SelectItem
                  value={integrationAuthApp.appId as string}
                  key={`target-app-${integrationAuthApp.appId as string}`}
                >
                  {integrationAuthApp.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-app-none">
                No repositories found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <Button
          onClick={handleButtonClick}
          color="mineshaft"
          className="mt-4"
          isLoading={isLoading}
          isDisabled={integrationAuthApps.length === 0}
        >
          Create Integration
        </Button>
      </Card>
    </div>
  ) : (
    <div />
  );
}

BitBucketCreateIntegrationPage.requireAuth = true;
