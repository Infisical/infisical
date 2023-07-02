import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/router";
import queryString from "query-string";

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
import createIntegration from "../../api/integrations/createIntegration";

interface RailwayCreateIntegrationFormValues {
  selectedSourceEnvironment: string;
  secretPath: string;
  targetAppId: string;
  targetEnvironmentId: string;
  targetServiceId: string;
}

export default function RailwayCreateIntegrationPage() {
  const router = useRouter();
  const { handleSubmit, setValue, getValues, control, watch } =
    useForm<RailwayCreateIntegrationFormValues>({
      defaultValues: {
        selectedSourceEnvironment: "",
        secretPath: "",
        targetAppId: "",
        targetEnvironmentId: "",
        targetServiceId: ""
      }
    });

  const [isLoading, setIsLoading] = useState(false);

  const { integrationAuthId } = queryString.parse(router.asPath.split("?")[1]);
  const { data: integrationAuth } = useGetIntegrationAuthById((integrationAuthId as string) ?? "");
  const { data: workspace } = useGetWorkspaceById(localStorage.getItem("projectData.id") ?? "");
  const { data: integrationAuthApps } = useGetIntegrationAuthApps({
    integrationAuthId: (integrationAuthId as string) ?? ""
  });

  const { data: targetEnvironments } = useGetIntegrationAuthRailwayEnvironments({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: watch("targetAppId")
  });

  const { data: targetServices } = useGetIntegrationAuthRailwayServices({
    integrationAuthId: (integrationAuthId as string) ?? "",
    appId: watch("targetAppId")
  });

  useEffect(() => {
    if (workspace) {
      setValue("selectedSourceEnvironment", workspace.environments[0].slug);
    }
  }, [workspace]);

  useEffect(() => {
    if (integrationAuthApps) {
      if (integrationAuthApps.length > 0) {
        setValue("targetAppId", integrationAuthApps[0].appId as string);
      } else {
        setValue("targetAppId", "none");
      }
    }
  }, [integrationAuthApps]);

  useEffect(() => {
    if (targetEnvironments) {
      if (targetEnvironments.length > 0) {
        setValue("targetEnvironmentId", targetEnvironments[0].environmentId);
      } else {
        setValue("targetEnvironmentId", "none");
      }
    }
  }, [targetEnvironments]);

  const filteredServices = targetServices?.concat({
    name: "",
    serviceId: ""
  });

  const handleButtonClick = async (data: RailwayCreateIntegrationFormValues) => {
    const {
      targetAppId,
      targetEnvironmentId,
      targetServiceId,
      selectedSourceEnvironment,
      secretPath
    } = data;

    try {
      setIsLoading(true);

      if (!integrationAuth?._id) return;

      const targetApp = integrationAuthApps?.find(
        (integrationAuthApp) => integrationAuthApp.appId === targetAppId
      );
      const targetEnvironment = targetEnvironments?.find(
        (environment) => environment.environmentId === targetEnvironmentId
      );

      if (!targetApp?.appId || !targetEnvironment) return;

      const targetService = targetServices?.find(
        (service) => service.serviceId === targetServiceId
      );

      await createIntegration({
        integrationAuthId: integrationAuth?._id,
        isActive: true,
        app: targetApp.name,
        appId: targetApp.appId,
        sourceEnvironment: selectedSourceEnvironment,
        targetEnvironment: targetEnvironment.name,
        targetEnvironmentId: targetEnvironment.environmentId,
        targetService: targetService ? targetService.name : null,
        targetServiceId: targetService ? targetService.serviceId : null,
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

  return workspace &&
    getValues("selectedSourceEnvironment") &&
    integrationAuthApps &&
    targetEnvironments &&
    filteredServices ? (
    <div className="flex h-full w-full items-center justify-center">
      <Card className="max-w-md rounded-md p-8">
        <CardTitle className="text-center">Railway Integration</CardTitle>
        <form onSubmit={handleSubmit(handleButtonClick)}>
          <Controller
            name="selectedSourceEnvironment"
            control={control}
            render={({ field }) => {
              return (
                <FormControl label="Project Environment" className="mt-4">
                  <Select
                    {...field}
                    className="w-full border border-mineshaft-500"
                    onValueChange={field.onChange}
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
              );
            }}
          />

          <Controller
            name="secretPath"
            control={control}
            render={({ field }) => (
              <FormControl label="Secrets Path">
                <Input {...field} placeholder="Provide a path, default is /" />
              </FormControl>
            )}
          />
          <Controller
            name="targetAppId"
            control={control}
            render={({ field }) => (
              <FormControl label="Railway Project">
                <Select
                  {...field}
                  className="w-full border border-mineshaft-500"
                  isDisabled={integrationAuthApps.length === 0}
                  onValueChange={field.onChange}
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
            )}
          />
          <Controller
            name="targetEnvironmentId"
            control={control}
            render={({ field }) => (
              <FormControl label="Railway Project Environment">
                <Select
                  {...field}
                  className="w-full border border-mineshaft-500"
                  onValueChange={field.onChange}
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
            )}
          />
          <Controller
            name="targetServiceId"
            control={control}
            render={({ field }) => (
              <FormControl label="Railway Service (Optional)">
                <Select
                  {...field}
                  className="w-full border border-mineshaft-500"
                  onValueChange={field.onChange}
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
            )}
          />

          <Button
            color="mineshaft"
            className="mt-4"
            isLoading={isLoading}
            isDisabled={integrationAuthApps.length === 0}
            type="submit"
          >
            Create Integration
          </Button>
        </form>
      </Card>
    </div>
  ) : (
    <div />
  );
}

RailwayCreateIntegrationPage.requireAuth = true;
