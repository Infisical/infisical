import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
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
  const { mutateAsync, isPending: isLoading } = useCreateIntegration();

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [targetAppId, setTargetAppId] = useState("");
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");
  const [targetServiceId, setTargetServiceId] = useState("");

  const [selectedSourceEnvironment, setSelectedSourceEnvironment] = useState(
    currentProject.environments[0].slug
  );
  const [secretPath, setSecretPath] = useState("/");

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
      <PageTitle title="Set Up Railway Integration" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Railway Integration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="RailwayConfigurePage-field-1">Project Environment</FieldLabel>
            <Select
              value={selectedSourceEnvironment}
              onValueChange={(val) => setSelectedSourceEnvironment(val)}
            >
              <SelectTrigger
                id="RailwayConfigurePage-field-1"
                aria-describedby="RailwayConfigurePage-field-1-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentProject?.environments.map((sourceEnvironment) => (
                  <SelectItem
                    value={sourceEnvironment.slug}
                    key={`source-environment-${sourceEnvironment.slug}`}
                  >
                    {sourceEnvironment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="RailwayConfigurePage-field-2">Secrets Path</FieldLabel>
            <Input
              id="RailwayConfigurePage-field-2"
              aria-describedby="RailwayConfigurePage-field-2-feedback"
              value={secretPath}
              onChange={(evt) => setSecretPath(evt.target.value)}
              placeholder="Provide a path, default is /"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="RailwayConfigurePage-field-3">Railway Project</FieldLabel>
            <Select
              value={targetAppId}
              onValueChange={(val) => setTargetAppId(val)}
              disabled={integrationAuthApps.length === 0}
            >
              <SelectTrigger
                id="RailwayConfigurePage-field-3"
                aria-describedby="RailwayConfigurePage-field-3-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="RailwayConfigurePage-field-4">
              Railway Project Environment
            </FieldLabel>
            <Select
              value={targetEnvironmentId}
              onValueChange={(val) => setTargetEnvironmentId(val)}
              disabled={targetEnvironments.length === 0}
            >
              <SelectTrigger
                id="RailwayConfigurePage-field-4"
                aria-describedby="RailwayConfigurePage-field-4-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="RailwayConfigurePage-field-5">
              Railway Service (Optional)
            </FieldLabel>
            <Select
              value={targetServiceId}
              onValueChange={(val) => setTargetServiceId(val)}
              disabled={targetServices.length === 0}
            >
              <SelectTrigger
                id="RailwayConfigurePage-field-5"
                aria-describedby="RailwayConfigurePage-field-5-feedback"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredTargetServices.map((targetService) => (
                  <SelectItem
                    value={targetService.serviceId as string}
                    key={`target-service-${targetService.serviceId as string}`}
                  >
                    {targetService.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            onClick={handleButtonClick}
            isPending={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </div>
  ) : (
    <>
      <PageTitle title="Set Up Railway Integration" />
      <div />
    </>
  );
};
