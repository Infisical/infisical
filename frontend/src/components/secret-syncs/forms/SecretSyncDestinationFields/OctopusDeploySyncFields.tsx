import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useOctopusDeployConnectionGetScopeValues,
  useOctopusDeployConnectionListProjects,
  useOctopusDeployConnectionListSpaces
} from "@app/hooks/api/appConnections/octopus-deploy/queries";
import {
  TOctopusDeployProject,
  TOctopusDeploySpace,
  TScopeValueOption
} from "@app/hooks/api/appConnections/octopus-deploy/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { OctopusDeploySyncScope } from "@app/hooks/api/secretSyncs/types/octopus-deploy-sync";

import { TSecretSyncForm } from "../schemas";

const EMPTY_SCOPE_VALUES = {
  environments: [],
  roles: [],
  processes: [],
  actions: [],
  machines: [],
  channels: []
};

export const OctopusDeploySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.OctopusDeploy }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const spaceId = useWatch({ name: "destinationConfig.spaceId", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: spaces = [], isLoading: isSpacesLoading } = useOctopusDeployConnectionListSpaces(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: projects = [], isLoading: isProjectsLoading } =
    useOctopusDeployConnectionListProjects(connectionId, spaceId, {
      enabled: Boolean(connectionId && spaceId && scope)
    });

  const { data: scopeValuesData, isLoading: isScopeValuesLoading } =
    useOctopusDeployConnectionGetScopeValues(connectionId, spaceId, projectId, {
      enabled: Boolean(connectionId && spaceId && projectId && scope)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.spaceId", "");
          setValue("destinationConfig.spaceName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.scopeValues", EMPTY_SCOPE_VALUES);
        }}
      />

      <Tabs defaultValue="general">
        <TabsList className="mb-2">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <FieldGroup>
            <Controller
              name="destinationConfig.spaceId"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Space
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        Select the Octopus Deploy space where your project is located.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      isLoading={isSpacesLoading && Boolean(connectionId)}
                      isDisabled={!connectionId}
                      value={spaces?.find((space) => space.id === value) ?? null}
                      onChange={(option) => {
                        const selectedSpace = option as SingleValue<TOctopusDeploySpace>;
                        onChange(selectedSpace?.id ?? null);
                        setValue("destinationConfig.spaceName", selectedSpace?.name ?? "");
                        setValue("destinationConfig.projectId", "");
                        setValue("destinationConfig.projectName", "");
                        setValue("destinationConfig.scopeValues", EMPTY_SCOPE_VALUES);
                      }}
                      options={spaces}
                      placeholder={spaces?.length ? "Select a space..." : "No spaces found..."}
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            <Controller
              name="destinationConfig.scope"
              control={control}
              defaultValue={OctopusDeploySyncScope.Project}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Scope</FieldLabel>
                  <FieldContent>
                    <Select
                      value={value || OctopusDeploySyncScope.Project}
                      onValueChange={(val) => {
                        onChange(val);
                        setValue("destinationConfig.projectId", "");
                        setValue("destinationConfig.projectName", "");
                        setValue("destinationConfig.scopeValues", EMPTY_SCOPE_VALUES);
                      }}
                    >
                      <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                        <SelectValue placeholder="Select a scope..." />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {Object.values(OctopusDeploySyncScope).map((scopeValue) => (
                          <SelectItem className="capitalize" value={scopeValue} key={scopeValue}>
                            {scopeValue}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />

            {scope === OctopusDeploySyncScope.Project && (
              <Controller
                name="destinationConfig.projectId"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>
                      Project
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Ensure the project exists in the selected space.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isLoading={isProjectsLoading && Boolean(connectionId && spaceId)}
                        isDisabled={Boolean(!connectionId || !spaceId)}
                        value={projects?.find((project) => project.id === value) ?? null}
                        onChange={(option) => {
                          const selectedProject = option as SingleValue<TOctopusDeployProject>;
                          onChange(selectedProject?.id ?? null);
                          setValue("destinationConfig.projectName", selectedProject?.name ?? "");
                          setValue("destinationConfig.scopeValues", EMPTY_SCOPE_VALUES);
                        }}
                        options={projects}
                        placeholder={
                          spaceId && projects?.length
                            ? "Select a project..."
                            : "No projects found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            )}
          </FieldGroup>
        </TabsContent>

        <TabsContent value="advanced" className="grow">
          {scope === OctopusDeploySyncScope.Project && projectId ? (
            <FieldGroup>
              {/* Environments */}
              <Controller
                name="destinationConfig.scopeValues.environments"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Environments</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.environments?.filter((opt) =>
                            (value || []).includes(opt.id)
                          ) || []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.environments || []}
                        placeholder={
                          scopeValuesData?.environments?.length
                            ? "Select environments..."
                            : "No environments found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Target Tags */}
              <Controller
                name="destinationConfig.scopeValues.roles"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Target Tags</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.roles?.filter((opt) => (value || []).includes(opt.id)) ||
                          []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.roles || []}
                        placeholder={
                          scopeValuesData?.roles?.length
                            ? "Select target tags..."
                            : "No target tags found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Targets */}
              <Controller
                name="destinationConfig.scopeValues.machines"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Targets</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.machines?.filter((opt) =>
                            (value || []).includes(opt.id)
                          ) || []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.machines || []}
                        placeholder={
                          scopeValuesData?.machines?.length
                            ? "Select targets..."
                            : "No targets found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Processes */}
              <Controller
                name="destinationConfig.scopeValues.processes"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Processes</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.processes?.filter((opt) =>
                            (value || []).includes(opt.id)
                          ) || []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.processes || []}
                        placeholder={
                          scopeValuesData?.processes?.length
                            ? "Select processes..."
                            : "No processes found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Deployment Steps */}
              <Controller
                name="destinationConfig.scopeValues.actions"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Deployment Steps</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.actions?.filter((opt) =>
                            (value || []).includes(opt.id)
                          ) || []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.actions || []}
                        placeholder={
                          scopeValuesData?.actions?.length
                            ? "Select deployment steps..."
                            : "No deployment steps found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />

              {/* Channels */}
              <Controller
                name="destinationConfig.scopeValues.channels"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Channels</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.channels?.filter((opt) =>
                            (value || []).includes(opt.id)
                          ) || []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds);
                        }}
                        options={scopeValuesData?.channels || []}
                        placeholder={
                          scopeValuesData?.channels?.length
                            ? "Select channels..."
                            : "No channels found..."
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError errors={[error]} />
                    </FieldContent>
                  </Field>
                )}
              />
            </FieldGroup>
          ) : (
            <div className="py-8 text-center text-muted">
              Please select a project in the Config tab to configure scope values.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </FieldGroup>
  );
};
