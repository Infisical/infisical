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
  useGetIntegrationAuthRailwayEnvironments,
  useGetIntegrationAuthRailwayServices
} from "../../../hooks/api/integrationAuth";
import { useGetWorkspaceById } from "../../../hooks/api/workspace";

export default function RailwayCreateIntegrationPage() {
  const router = useRouter();
  const { mutateAsync } = useCreateIntegration();

  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");
  const [targetServiceId, setTargetServiceId] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState("");
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });
  const { data: targetEnvironments } = useGetIntegrationAuthRailwayEnvironments({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: targetAppId
  });
  const { data: targetServices } = useGetIntegrationAuthRailwayServices({
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

  useEffect(() => {
    if (targetEnvironments) {
      if (targetEnvironments.length > 0) {
        setTargetEnvironmentId(targetEnvironments[0].environmentId);
      } else {
        setTargetEnvironmentId("none");
      }
    }
  }, [targetEnvironments]);

  const filteredServices = targetServices?.concat({
    name: "",
    serviceId: ""
  });

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetEnvironment = targetEnvironments?.find(
        (environment) => environment.environmentId === targetEnvironmentId
      );

      if (!targetApp || !targetApp.appId || !targetEnvironment) return;

      const targetService = targetServices?.find(
        (service) => service.serviceId === targetServiceId
      );

      await mutateAsync({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment.name,
        targetEnvironmentId: targetEnvironment.environmentId,
        targetService: targetService?.name,
        targetServiceId: targetService?.serviceId,
        secretPath
      });

      setIsLoading(false);

      router.push(`/integrations/${localStorage.getItem("projectData.id")}`);
    } catch (err) {
      console.error(err);
    }
  };

  return workspace &&
    selectedSourceEnvironment &&
    integrationAuthApps &&
    targetEnvironments &&
    filteredServices ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Railway Integration</CardTitle>
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
        <FormControl label="Railway Project">
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
                No projects found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Railway Project Environment">
          <Select
            value={targetEnvironmentId}
            onValueChange={(val) => setTargetEnvironmentId(val)}
            className="w-full border border-mineshaft-500"
          >
            {targetEnvironments.length > 0 ? (
              targetEnvironments.map((targetEnvironment) => (
                <SelectItem
                  value={targetEnvironment.environmentId as string}
                  key={`target-environment-${targetEnvironment.environmentId as string}`}
                >
                  {targetEnvironment.name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="none" key="target-environment-none">
                No environments found
              </SelectItem>
            )}
          </Select>
        </FormControl>
        <FormControl label="Railway Service (Optional)">
          <Select
            value={targetServiceId}
            onValueChange={(val) => setTargetServiceId(val)}
            className="w-full border border-mineshaft-500"
          >
            {filteredServices.map((targetService) => (
              <SelectItem
                value={targetService.serviceId as string}
                key={`target-service-${targetService.serviceId as string}`}
              >
                {targetService.name}
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

RailwayCreateIntegrationPage.requireAuth = true;
