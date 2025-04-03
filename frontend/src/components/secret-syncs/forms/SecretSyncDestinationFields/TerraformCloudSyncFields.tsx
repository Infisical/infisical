import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import {
  TERRAFORM_CLOUD_SYNC_SCOPES,
  TerraformCloudSyncScope,
  TTerraformCloudConnectionOrganization,
  TTerraformCloudConnectionProject,
  TTerraformCloudConnectionWorkspace,
  useTerraformCloudConnectionListOrganizations
} from "@app/hooks/api/appConnections/terraform-cloud";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const TerraformCloudSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.TerraformCloud }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentOrg = watch("destinationConfig.org");
  const currentScope = watch("destinationConfig.scope");

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useTerraformCloudConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });

  const selectedOrg = organizations?.find((org) => org.id === currentOrg);
  const projects = selectedOrg?.projects || [];
  const workspaces = selectedOrg?.workspaces || [];

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.project", "");
          setValue("destinationConfig.workspace", "");
        }}
      />
      <Controller
        name="destinationConfig.org"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Organization"
          >
            <FilterableSelect
              isLoading={isOrganizationsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={organizations ? (organizations.find((org) => org.id === value) ?? null) : null}
              onChange={(option) => {
                onChange(
                  (option as SingleValue<TTerraformCloudConnectionOrganization>)?.id ?? null
                );
                setValue("destinationConfig.project", "");
                setValue("destinationConfig.workspace", "");
              }}
              options={organizations}
              placeholder="Select an organization..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={TerraformCloudSyncScope.Project}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Scope"
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should manage secrets from Terraform Cloud. The following
                  options are available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(TERRAFORM_CLOUD_SYNC_SCOPES).map(({ name, description }) => {
                    return (
                      <li key={name}>
                        <p className="text-mineshaft-300">
                          <span className="font-medium text-bunker-200">{name}</span>: {description}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            }
          >
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
                // Reset either project or workspace based on which scope was selected
                if (val === TerraformCloudSyncScope.Project) {
                  setValue("destinationConfig.workspace", "");
                } else {
                  setValue("destinationConfig.project", "");
                }
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(TerraformCloudSyncScope).map((scope) => (
                <SelectItem className="capitalize" value={scope} key={scope}>
                  {scope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {currentScope === TerraformCloudSyncScope.Project && (
        <Controller
          name="destinationConfig.project"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Project"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Ensure that the project exists in the selected organization and the service account used on this connection has write permissions for the specified project."
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
                isLoading={isOrganizationsPending && Boolean(connectionId) && Boolean(currentOrg)}
                isDisabled={!connectionId || !currentOrg}
                value={projects.find((project) => project.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<TTerraformCloudConnectionProject>)?.id ?? null);
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
              />
            </FormControl>
          )}
        />
      )}
      {currentScope === TerraformCloudSyncScope.Workspace && (
        <Controller
          name="destinationConfig.workspace"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Workspace"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Ensure that the workspace exists in the selected organization and the service account used on this connection has write permissions for the specified workspace."
                >
                  <div>
                    <span>Don&#39;t see the workspace you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={isOrganizationsPending && Boolean(connectionId) && Boolean(currentOrg)}
                isDisabled={!connectionId || !currentOrg}
                value={workspaces.find((workspace) => workspace.id === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<TTerraformCloudConnectionWorkspace>)?.id ?? null);
                }}
                options={workspaces}
                placeholder="Select a workspace..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
