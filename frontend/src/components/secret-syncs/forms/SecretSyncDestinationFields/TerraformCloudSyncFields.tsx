import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import {
  TERRAFORM_CLOUD_SYNC_SCOPES,
  TerraformCloudSyncCategory,
  TerraformCloudSyncScope,
  TTerraformCloudConnectionOrganization,
  TTerraformCloudConnectionVariableSet,
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
  const variableSets = selectedOrg?.variableSets || [];
  const workspaces = selectedOrg?.workspaces || [];

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.destinationId", "");
          setValue("destinationConfig.destinationName", "");
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
                setValue("destinationConfig.destinationId", "");
                setValue("destinationConfig.destinationName", "");
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
        name="destinationConfig.category"
        control={control}
        defaultValue={TerraformCloudSyncCategory.Environment}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Category"
          >
            <Select
              value={value}
              onValueChange={onChange}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              defaultValue={TerraformCloudSyncCategory.Environment}
              placeholder="Select category..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(TerraformCloudSyncCategory).map((category) => (
                <SelectItem className="capitalize" value={category} key={category}>
                  {category.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={TerraformCloudSyncScope.VariableSet}
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
                setValue("destinationConfig.destinationId", "");
                setValue("destinationConfig.destinationName", "");
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
      {currentScope === TerraformCloudSyncScope.VariableSet && (
        <Controller
          name="destinationConfig.destinationId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Variable Set"
              helperText={
                <Tooltip
                  className="max-w-md"
                  content="Ensure that the variable set exists in the selected organization and the service account used on this connection has write permissions for the specified variable set."
                >
                  <div>
                    <span>Don&#39;t see the variable set you&#39;re looking for?</span>{" "}
                    <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                  </div>
                </Tooltip>
              }
            >
              <FilterableSelect
                menuPlacement="top"
                isLoading={isOrganizationsPending && Boolean(connectionId) && Boolean(currentOrg)}
                isDisabled={!connectionId || !currentOrg}
                value={variableSets.find((variableSet) => variableSet.id === value) ?? null}
                onChange={(option) => {
                  const selectedOption =
                    option as SingleValue<TTerraformCloudConnectionVariableSet>;
                  onChange(selectedOption?.id ?? null);

                  if (selectedOption) {
                    setValue("destinationConfig.destinationName", selectedOption.name);
                  } else {
                    setValue("destinationConfig.destinationName", "");
                  }
                }}
                options={variableSets}
                placeholder="Select a variable set..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
              />
            </FormControl>
          )}
        />
      )}
      {currentScope === TerraformCloudSyncScope.Workspace && (
        <Controller
          name="destinationConfig.destinationId"
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
                  const selectedOption = option as SingleValue<TTerraformCloudConnectionWorkspace>;
                  onChange(selectedOption?.id ?? null);

                  if (selectedOption) {
                    setValue("destinationConfig.destinationName", selectedOption.name);
                  } else {
                    setValue("destinationConfig.destinationName", "");
                  }
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
