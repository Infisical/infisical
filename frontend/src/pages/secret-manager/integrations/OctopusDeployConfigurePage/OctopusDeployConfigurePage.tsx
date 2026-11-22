import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { SiOctopusdeploy } from "react-icons/si";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  FieldSeparator,
  SecretPathInput,
  Spinner
} from "@app/components/v3";
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
        <PageTitle title="Set Up Octopus Deploy Integration" />
        <Spinner />
      </div>
    );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full w-full items-center justify-center"
    >
      <PageTitle title="Set Up Octopus Deploy Integration" />
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>
            <SiOctopusdeploy size="1.2rem" />
            Octopus Deploy Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Controller
            control={control}
            name="sourceEnvironment"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-1">
                  Project Environment
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-1"
                  aria-describedby="OctopusDeployConfigurePage-field-1-feedback"
                  isError={Boolean(error)}
                  getOptionValue={(option) => option.slug}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onValueChange={onChange}
                  options={currentProject?.environments}
                  isClearable={false}
                  includeMissingSelectedOptions={false}
                  placeholder="Select a project environment"
                  isDisabled={!currentProject?.environments.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-1-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-2">Secrets Path</FieldLabel>
                <SecretPathInput
                  id="OctopusDeployConfigurePage-field-2"
                  aria-describedby="OctopusDeployConfigurePage-field-2-feedback"
                  isError={Boolean(error)}
                  placeholder="/"
                  environment={sourceEnv?.slug}
                  value={value}
                  onChange={onChange}
                />
              </Field>
            )}
          />
          <FieldSeparator className="col-span-2">Sync To</FieldSeparator>
          <Controller
            control={control}
            name="targetSpace"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-3">
                  Octopus Deploy Space
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-3"
                  aria-describedby="OctopusDeployConfigurePage-field-3-feedback"
                  isError={Boolean(error)}
                  getOptionValue={(option) => option.Id}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  options={octopusDeploySpaces}
                  isClearable={false}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeploySpaces?.length ? "Select a space..." : "No spaces found..."
                  }
                  isDisabled={!octopusDeploySpaces?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-3-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetResource"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-4">{`Octopus Deploy ${currentScope}`}</FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-4"
                  aria-describedby="OctopusDeployConfigurePage-field-4-feedback"
                  isError={Boolean(error)}
                  getOptionValue={(option) => option.appId!}
                  value={value}
                  getOptionLabel={(option) => option.name}
                  onValueChange={onChange}
                  options={octopusDeployResources}
                  isClearable={false}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployResources?.length ? "Select a project..." : "No projects found..."
                  }
                  isDisabled={!octopusDeployResources?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-4-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />

          <Controller
            control={control}
            name="targetEnvironments"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-5">
                  Octopus Deploy Environments
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-5"
                  aria-describedby="OctopusDeployConfigurePage-field-5-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Environments}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Environments?.length
                      ? "Select environments..."
                      : "No environments found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Environments?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-5-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetRoles"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-6">
                  Octopus Deploy Target Tags
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-6"
                  aria-describedby="OctopusDeployConfigurePage-field-6-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Roles}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Roles?.length
                      ? "Select target tags..."
                      : "No target tags found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Roles?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-6-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetMachines"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-7">
                  Octopus Deploy Targets
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-7"
                  aria-describedby="OctopusDeployConfigurePage-field-7-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Machines}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Machines?.length
                      ? "Select targets..."
                      : "No targets found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Machines?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-7-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetProcesses"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-8">
                  Octopus Deploy Processes
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-8"
                  aria-describedby="OctopusDeployConfigurePage-field-8-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Processes}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Processes?.length
                      ? "Select processes..."
                      : "No processes found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Processes?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-8-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetActions"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-9">
                  Octopus Deploy Deployment Steps
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-9"
                  aria-describedby="OctopusDeployConfigurePage-field-9-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Actions}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Actions?.length
                      ? "Select deployment steps..."
                      : "No deployment steps found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Actions?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-9-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
          <Controller
            control={control}
            name="targetChannels"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="OctopusDeployConfigurePage-field-10">
                  Octopus Deploy Channels
                  <span className="text-xs text-accent italic">- Optional</span>
                </FieldLabel>
                <Combobox
                  id="OctopusDeployConfigurePage-field-10"
                  aria-describedby="OctopusDeployConfigurePage-field-10-feedback"
                  isError={Boolean(error)}
                  multiple
                  getOptionValue={(option) => option.Name}
                  value={value}
                  getOptionLabel={(option) => option.Name}
                  onValueChange={onChange}
                  isLoading={isOctopusDeployScopeValuesLoading}
                  options={octopusDeployScopeValues?.Channels}
                  includeMissingSelectedOptions={false}
                  placeholder={
                    octopusDeployScopeValues?.Channels?.length
                      ? "Select channels..."
                      : "No channels found..."
                  }
                  isDisabled={!octopusDeployScopeValues?.Channels?.length}
                />
                {Boolean(error) && (
                  <FieldError id="OctopusDeployConfigurePage-field-10-feedback">
                    {error?.message}
                  </FieldError>
                )}
              </Field>
            )}
          />
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button
            type="submit"
            isPending={createIntegration.isPending}
            isDisabled={createIntegration.isPending || !octopusDeployResources?.length}
            variant="project"
          >
            Create Integration
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
