import { Controller, useFormContext, useWatch } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FilterableSelect,
  FormControl,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
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
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.spaceId", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.scopeValues", undefined);
        }}
      />

      <Controller
        name="destinationConfig.spaceId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Space"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Select the Octopus Deploy space where your project is located."
              >
                <div>
                  <span>Don&#39;t see the space you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isSpacesLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={spaces?.find((space) => space.id === value) ?? null}
              onChange={(option) => {
                const selectedSpace = option as SingleValue<TOctopusDeploySpace>;
                onChange(selectedSpace?.id ?? null);
                setValue("destinationConfig.spaceName", selectedSpace?.name ?? "");
                setValue("destinationConfig.projectId", "");
                setValue("destinationConfig.projectName", "");
                setValue("destinationConfig.scopeValues", undefined);
              }}
              options={spaces}
              placeholder={spaces?.length ? "Select a space..." : "No spaces found..."}
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={OctopusDeploySyncScope.Project}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Scope"
            helperText="Select the scope for this sync configuration."
          >
            <Select
              value={value || OctopusDeploySyncScope.Project}
              onValueChange={(val) => {
                onChange(val);
                setValue("destinationConfig.projectId", "");
                setValue("destinationConfig.projectName", "");
                setValue("destinationConfig.scopeValues", undefined);
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(OctopusDeploySyncScope).map((scopeValue) => (
                <SelectItem className="capitalize" value={scopeValue} key={scopeValue}>
                  {scopeValue}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {scope === OctopusDeploySyncScope.Project && (
        <Controller
          name="destinationConfig.projectId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Project"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Ensure the project exists in the selected space."
                >
                  <div>
                    <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={isProjectsLoading && Boolean(connectionId && spaceId)}
                isDisabled={Boolean(!connectionId || !spaceId)}
                value={projects?.find((project) => project.id === value) ?? null}
                onChange={(option) => {
                  const selectedProject = option as SingleValue<TOctopusDeployProject>;
                  onChange(selectedProject?.id ?? null);
                  setValue("destinationConfig.projectName", selectedProject?.name ?? "");
                  setValue("destinationConfig.scopeValues", undefined);
                }}
                options={projects}
                placeholder={
                  spaceId && projects?.length ? "Select a project..." : "No projects found..."
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
            </FormControl>
          )}
        />
      )}

      {scope === OctopusDeploySyncScope.Project && projectId && (
        <Accordion type="single" collapsible className="w-full bg-mineshaft-700">
          <AccordionItem value="scope-values" className="overflow-visible">
            <AccordionTrigger>Scope Values (Optional)</AccordionTrigger>
            <AccordionContent className="max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-4">
                {/* Environments */}
                <Controller
                  name="destinationConfig.scopeValues.environments"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Environments"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="bottom"
                        menuPosition="absolute"
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
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />

                {/* Target Tags */}
                <Controller
                  name="destinationConfig.scopeValues.roles"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Target Tags"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="bottom"
                        menuPosition="absolute"
                        isLoading={isScopeValuesLoading}
                        value={
                          scopeValuesData?.roles?.filter((opt) => (value || []).includes(opt.id)) ||
                          []
                        }
                        onChange={(options) => {
                          const selectedIds = (options as MultiValue<TScopeValueOption>).map(
                            (opt) => opt.id
                          );
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />

                {/* Targets */}
                <Controller
                  name="destinationConfig.scopeValues.machines"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Targets"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="top"
                        menuPosition="absolute"
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
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />
                {/* Processes */}
                <Controller
                  name="destinationConfig.scopeValues.processes"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Processes"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="top"
                        menuPosition="absolute"
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
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />

                {/* Deployment Steps */}
                <Controller
                  name="destinationConfig.scopeValues.actions"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Deployment Steps"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="top"
                        menuPosition="absolute"
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
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />

                {/* Channels */}
                <Controller
                  name="destinationConfig.scopeValues.channels"
                  control={control}
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      isError={Boolean(error)}
                      errorText={error?.message}
                      label="Channels"
                      isOptional
                    >
                      <FilterableSelect
                        isMulti
                        menuPlacement="top"
                        menuPosition="absolute"
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
                          onChange(selectedIds.length > 0 ? selectedIds : undefined);
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
                    </FormControl>
                  )}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );
};
