import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  Button,
  Card,
  CardTitle,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration } from "@app/hooks/api";
import {
  useGetIntegrationAuthApps,
  useGetIntegrationAuthById,
  useGetIntegrationAuthRailwayEnvironments,
  useGetIntegrationAuthRailwayServices
} from "@app/hooks/api/integrationAuth";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const RailwayConfigurePage = () => {
  const navigate = useNavigate();
  const { mutateAsync } = useCreateIntegration();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");
  const [targetServiceId, setTargetServiceId] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");
  const [isLoading, setIsLoading] = useState(false);

  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.RailwayConfigurePage.id,
    select: (el) => el.integrationAuthId
  });
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
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

  const handleButtonClick = async () => {
    try {
      setIsLoading(true);

      if (!integrationAuth?.id) return;

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
        integrationAuthId: integrationAuth?.id,
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

      navigate({
        to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id
        },
        search: {
          selectedTab: IntegrationsListPageTabs.NativeIntegrations
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredTargetServices = targetServices
    ? [{ name: "", serviceId: "none" }, ...targetServices]
    : [{ name: "", serviceId: "none" }];

  return selectedSourceEnvironment &&
    integrationAuthApps &&
    targetEnvironments &&
    targetServices &&
    filteredTargetServices ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Railway Integration</CardTitle>
        <FormControl label="Project Environment" className="mt-4">
          <Select
            value={selectedSourceEnvironment}
            onValueChange={(val) => setSelectedSourceEnvironment(val)}
            className="w-full border border-mineshaft-500"
          >
            {currentProject?.environments.map((sourceEnvironment) => (
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
            isDisabled={targetEnvironments.length === 0}
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
            isDisabled={targetServices.length === 0}
          >
            {filteredTargetServices.map((targetService) => (
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
};
