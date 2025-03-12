import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  THumanitecConnectionApp,
  useHumanitecConnectionListOrganizations
} from "@app/hooks/api/appConnections/humanitec";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const HumanitecSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Humanitec }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentOrg = watch("destinationConfig.org");
  const currentApp = watch("destinationConfig.app");

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useHumanitecConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });
  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.org", "");
          setValue("destinationConfig.app", "");
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
              onChange={(option) =>
                onChange((option as SingleValue<THumanitecConnectionApp>)?.id ?? null)
              }
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
          <FormControl isError={Boolean(error)} errorText={error?.message} label="App">
            <FilterableSelect
              menuPlacement="top"
              isLoading={isOrganizationsPending && Boolean(connectionId) && Boolean(currentOrg)}
              isDisabled={!connectionId || !currentOrg}
              value={
                organizations
                  .find((org) => org.id === currentOrg)
                  ?.apps?.find((app) => app.id === value) ?? null
              }
              onChange={(option) =>
                onChange((option as SingleValue<THumanitecConnectionApp>)?.id ?? null)
              }
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
              value={
                organizations
                  .find((org) => org.id === currentOrg)
                  ?.apps?.find((app) => app.id === currentApp)
                  ?.envs?.find((env) => env.id === value) ?? null
              }
              onChange={(option) =>
                onChange((option as SingleValue<THumanitecConnectionApp>)?.id ?? null)
              }
              options={
                currentApp
                  ? ((organizations.find((org) => org.id === currentOrg)?.apps ?? [])?.find(
                      (app) => app.id === currentApp
                    )?.envs ?? [])
                  : []
              }
              placeholder="Select an env..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id.toString()}
            />
          </FormControl>
        )}
      />
    </>
  );
};
