import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { SiOctopusdeploy } from "react-icons/si";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardTitle,
  FilterableSelect,
  FormControl,
  Spinner
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { useCreateIntegration, useGetIntegrationAuthApps } from "@app/hooks/api";
import {
  useGetIntegrationAuthOctopusDeployScopeValues,
  useGetIntegrationAuthOctopusDeploySpaces
} from "@app/hooks/api/integrationAuth/queries";
import { OctopusDeployScope } from "@app/hooks/api/integrationAuth/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const formSchema = z.object({
  scope: z.nativeEnum(OctopusDeployScope),
  secretPath: z.string().default("/"),
  sourceEnvironment: z.object({ name: z.string(), slug: z.string() }),
  targetSpace: z.object({ Name: z.string(), Id: z.string() }),
  targetResource: z.object({ appId: z.string().optional(), name: z.string() }),
  targetEnvironments: z.object({ Name: z.string(), Id: z.string() }).array().optional(),
  targetRoles: z.object({ Name: z.string(), Id: z.string() }).array().optional(),
  targetMachines: z.object({ Name: z.string(), Id: z.string() }).array().optional(),
  targetProcesses: z
    .object({ Name: z.string(), Id: z.string(), ProcessType: z.string() })
    .array()
    .optional(),
  targetActions: z.object({ Name: z.string(), Id: z.string() }).array().optional(),
  targetChannels: z.object({ Name: z.string(), Id: z.string() }).array().optional()
});

type TFormData = z.infer<typeof formSchema>;

export const OctopusDeployConfigurePage = () => {
  const navigate = useNavigate();
  const createIntegration = useCreateIntegration();
  const { currentOrg } = useOrganization();
  const { watch, control, reset, handleSubmit } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      secretPath: "/",
      scope: OctopusDeployScope.Project
    }
  });

  const { currentProject } = useProject();
  const integrationAuthId = useSearch({
    from: ROUTE_PATHS.SecretManager.Integratons.OctopusDeployCloudConfigurePage.id,
    select: (el) => el.integrationAuthId
  });

  const { data: octopusDeploySpaces, isPending: isLoadingOctopusDeploySpaces } =
    useGetIntegrationAuthOctopusDeploySpaces((integrationAuthId as string) ?? "");

  const currentSpace = watch("targetSpace", octopusDeploySpaces?.[0]);
  const currentScope = watch("scope");
  const sourceEnv = watch("sourceEnvironment");

  const { data: octopusDeployResources, isPending: isOctopusDeployResourcesLoading } =
    useGetIntegrationAuthApps(
      {
        integrationAuthId,
        workspaceSlug: currentSpace?.Name
        // scope once we support other resources than project
      },
      {
        enabled: Boolean(currentSpace ?? octopusDeploySpaces?.find((space) => space.IsDefault))
      }
    );

  const currentResource = watch("targetResource", octopusDeployResources?.[0]);

  const { data: octopusDeployScopeValues, isPending: isOctopusDeployScopeValuesLoading } =
    useGetIntegrationAuthOctopusDeployScopeValues(
      {
        integrationAuthId,
        spaceId: currentSpace?.Id,
        resourceId: currentResource?.appId || "",
        scope: currentScope
      },
      { enabled: Boolean(currentSpace && currentResource) }
    );

  const onSubmit = async ({
    sourceEnvironment,
    secretPath,
    targetEnvironments,
    targetResource,
    targetSpace,
    targetChannels,
    targetActions,
    targetMachines,
    targetProcesses,
    targetRoles,
    scope
  }: TFormData) => {
    await createIntegration.mutateAsync({
      integrationAuthId,
      isActive: true,
      scope,
      app: targetResource.name,
      appId: targetResource.appId,
      targetEnvironment: targetSpace.Name,
      targetEnvironmentId: targetSpace.Id,
      metadata: {
        octopusDeployScopeValues: {
          Environment: targetEnvironments?.map(({ Id }) => Id),
          Action: targetActions?.map(({ Id }) => Id),
          Channel: targetChannels?.map(({ Id }) => Id),
          ProcessOwner: targetProcesses?.map(({ Id }) => Id),
          Role: targetRoles?.map(({ Id }) => Id),
          Machine: targetMachines?.map(({ Id }) => Id)
        }
      },
      sourceEnvironment: sourceEnvironment.slug,
      secretPath
    });

    createNotification({
      type: "success",
      text: "Successfully created integration"
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
  };

  useEffect(() => {
    if (!octopusDeployResources || !octopusDeploySpaces || !currentProject) return;

    reset({
      targetResource: octopusDeployResources[0],
      targetSpace: octopusDeploySpaces.find((space) => space.IsDefault),
      sourceEnvironment: currentProject.environments[0],
      secretPath: "/",
      scope: OctopusDeployScope.Project
    });
  }, [octopusDeploySpaces, octopusDeployResources, currentProject]);

  if (isLoadingOctopusDeploySpaces || isOctopusDeployResourcesLoading)
    return (
      <div className="flex h-full w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <Card className="max-w-4xl rounded-md p-8 pt-4">
        <CardTitle className="text-center">
          <SiOctopusdeploy size="1.2rem" className="mr-2 mb-1 inline-block" />
          Octopus Deploy Integration
        </CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Project Environment"
              >
                <FilterableSelect
                  getOptionValue={(option) => option.slug}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onChange={onChange}
                  options={currentProject?.environments}
                  placeholder="Select a project environment"
                  isDisabled={!currentProject?.environments.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl isError={Boolean(error)} label="Secrets Path">
                <SecretPathInput
                  placeholder="/"
                  environment={sourceEnv?.slug}
                  value={value}
                  onChange={onChange}
                />
              </FormControl>
            )}
          />
          <div className="col-span-2 flex w-full flex-row items-center pb-2">
            <div className="w-full border-t border-mineshaft-500" />
            <span className="mx-2 text-xs whitespace-nowrap text-mineshaft-400">Sync To</span>
            <div className="w-full border-t border-mineshaft-500" />
          </div>
          <Controller
            control={control}
            name="targetSpace"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Space"
              >
                <FilterableSelect
                  getOptionValue={(option) => option.Id}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  options={octopusDeploySpaces}
                  placeholder={
                    octopusDeploySpaces?.length ? "Select a space..." : "No spaces found..."
                  }
                  isDisabled={!octopusDeploySpaces?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetResource"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                className="capitalize"
                label={`Octopus Deploy ${currentScope}`}
              >
                <FilterableSelect
                  getOptionValue={(option) => option.appId!}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onChange={onChange}
                  options={octopusDeployResources}
                  placeholder={
                    octopusDeployResources?.length ? "Select a project..." : "No projects found..."
                  }
                  isDisabled={!octopusDeployResources?.length}
                />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="targetEnvironments"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Environments"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Environments}
                  placeholder={
                    octopusDeployScopeValues?.Environments?.length
                      ? "Select environments..."
                      : "No environments found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Environments?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetRoles"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Target Tags"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Roles}
                  placeholder={
                    octopusDeployScopeValues?.Roles?.length
                      ? "Select target tags..."
                      : "No target tags found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Roles?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetMachines"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Targets"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Machines}
                  placeholder={
                    octopusDeployScopeValues?.Machines?.length
                      ? "Select targets..."
                      : "No targets found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Machines?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetProcesses"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Processes"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Processes}
                  placeholder={
                    octopusDeployScopeValues?.Processes?.length
                      ? "Select processes..."
                      : "No processes found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Processes?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetActions"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Deployment Steps"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Actions}
                  placeholder={
                    octopusDeployScopeValues?.Actions?.length
                      ? "Select deployment steps..."
                      : "No deployment steps found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Actions?.length}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="targetChannels"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error)}
                label="Octopus Deploy Channels"
                isOptional
              >
                <FilterableSelect
                  isMulti
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Channels}
                  placeholder={
                    octopusDeployScopeValues?.Channels?.length
                      ? "Select channels..."
                      : "No channels found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Channels?.length}
                />
              </FormControl>
            )}
          />
        </div>
        <Button
          type="submit"
          colorSchema="primary"
          className="mt-4"
          isLoading={createIntegration.isPending}
          isDisabled={createIntegration.isPending || !octopusDeployResources?.length}
        >
          Create Integration
        </Button>
      </Card>
    </form>
  );
};
