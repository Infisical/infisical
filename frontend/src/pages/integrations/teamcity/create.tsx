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
  useGetIntegrationAuthById,
  useGetIntegrationAuthTeamCityBuildConfigs
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function TeamCityCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();
  
  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [targetAppId, setTargetAppId] = useState("");
  const [targetBuildConfigId, setTargetBuildConfigId] = useState<string>("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);

  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });
  
  const { data: targetBuildConfigs } = useGetIntegrationAuthTeamCityBuildConfigs({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: targetAppId
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
  
  const handleButtonClick = async () => {
    try {
      if (!integrationAuth?._id) return;

      setIsLoading(true);
      
      const targetEnvironment = targetBuildConfigs?.find(
        (buildConfig) => buildConfig.buildConfigId === targetBuildConfigId
      );
      
      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: integrationAuthApps?.find((integrationAuthApp) => integrationAuthApp.appId === targetAppId)?.name ?? null,
        appId: targetAppId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment ? targetEnvironment.name : null,
        targetEnvironmentId: targetEnvironment ? targetEnvironment.buildConfigId : null,
        targetService: null,
        targetServiceId: null,
        owner: null,
        path: null,
        region: null,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredBuildConfigs = targetBuildConfigs?.concat({
    name: "",
    buildConfigId: ""
  });

  return integrationAuth &&
    workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    filteredBuildConfigs &&
    targetAppId ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">TeamCity Integration</CardTitle>
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
        <FormControl label="TeamCity Project" className="mt-4">
          <Select
            value={targetAppId}
            onValueChange={(val) => setTargetAppId(val)}
            className="w-full border border-mineshaft-500"
            isDisabled={integrationAuthApps.length === 0}
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
                No project found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Team City Build Config (Optional)" className="mt-4">
          <Select
            value={targetBuildConfigId}
            onValueChange={(val) => setTargetBuildConfigId(val)}
            className="w-full border border-mineshaft-500"
          >
            {filteredBuildConfigs.map((buildConfig: any) => (
              <SelectItem
                value={buildConfig.buildConfigId}
                key={`target-build-config-${buildConfig.buildConfigId}`}
              >
                {buildConfig.name}
              </SelectItem>
            ))}
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

TeamCityCreateIntegrationPage.requireAuth = true;
