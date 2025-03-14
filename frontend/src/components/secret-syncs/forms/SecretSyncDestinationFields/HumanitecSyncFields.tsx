import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem, Tooltip } from "@app/components/v2";
import { HUMANITEC_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  THumanitecConnectionApp,
  THumanitecConnectionEnvironment,
  THumanitecConnectionOrganization,
  useHumanitecConnectionListOrganizations
} from "@app/hooks/api/appConnections/humanitec";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

import { TSecretSyncForm } from "../schemas";

export const HumanitecSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Humanitec }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentOrg = watch("destinationConfig.org");
  const currentApp = watch("destinationConfig.app");
  const currentScope = watch("destinationConfig.scope");

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useHumanitecConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });

  const selectedOrg = organizations?.find((org) => org.id === currentOrg);
  const selectedApp = selectedOrg?.apps?.find((app) => app.id === currentApp);
  const environments = selectedApp?.envs || [];

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.app", "");
          setValue("destinationConfig.env", "");
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
              value={organizations ? (organizations.find((org) => org.id === value) ?? []) : []}
              onChange={(option) => {
                onChange((option as SingleValue<THumanitecConnectionOrganization>)?.id ?? null);
                setValue("destinationConfig.app", "");
                setValue("destinationConfig.env", "");
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
        name="destinationConfig.app"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="App"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure that the app exists in the selected organization and the service account used on this connection has write permissions for the specified app."
              >
                <div>
                  <span>Don&#39;t see the app you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isOrganizationsPending && Boolean(connectionId) && Boolean(currentOrg)}
              isDisabled={!connectionId || !currentOrg}
              value={
                organizations
                  .find((org) => org.id === currentOrg)
                  ?.apps?.find((app) => app.id === value) ?? null
              }
              onChange={(option) => {
                onChange((option as SingleValue<THumanitecConnectionApp>)?.id ?? null);
                setValue("destinationConfig.env", "");
              }}
              options={
                currentOrg ? (organizations.find((org) => org.id === currentOrg)?.apps ?? []) : []
              }
              placeholder="Select an app..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={HumanitecSyncScope.Application}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Scope"
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should manage secrets from Humanitec. The following options
                  are available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(HUMANITEC_SYNC_SCOPES).map(({ name, description }) => {
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
                setValue("destinationConfig.env", "");
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(HumanitecSyncScope).map((scope) => (
                <SelectItem className="capitalize" value={scope} key={scope}>
                  {scope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {currentScope === HumanitecSyncScope.Environment && (
        <Controller
          name="destinationConfig.env"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} label="Environment">
              <FilterableSelect
                menuPlacement="top"
                isLoading={
                  isOrganizationsPending &&
                  Boolean(connectionId) &&
                  Boolean(currentOrg) &&
                  Boolean(currentApp)
                }
                isDisabled={!connectionId || !currentApp}
                value={environments.find((env) => env.id === value) ?? null}
                onChange={(option) =>
                  onChange((option as SingleValue<THumanitecConnectionEnvironment>)?.id ?? null)
                }
                options={environments}
                placeholder="Select an env..."
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
