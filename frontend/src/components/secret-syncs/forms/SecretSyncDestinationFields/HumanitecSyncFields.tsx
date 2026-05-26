import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
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
          <Field>
            <FieldLabel>Organization</FieldLabel>
            <FieldContent>
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.app"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              App
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure that the app exists in the selected organization and the service account
                  used on this connection has write permissions for the specified app.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
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
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={HumanitecSyncScope.Application}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Scope
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
                  <div className="flex flex-col gap-3">
                    <p>
                      Specify how Infisical should manage secrets from Humanitec. The following
                      options are available:
                    </p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      {Object.values(HUMANITEC_SYNC_SCOPES).map(({ name, description }) => (
                        <li key={name}>
                          <p className="text-mineshaft-300">
                            <span className="font-medium text-bunker-200">{name}</span>:{" "}
                            {description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  setValue("destinationConfig.env", "");
                }}
              >
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(HumanitecSyncScope).map((scope) => (
                    <SelectItem className="capitalize" value={scope} key={scope}>
                      {scope.replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {currentScope === HumanitecSyncScope.Environment && (
        <Controller
          name="destinationConfig.env"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Environment</FieldLabel>
              <FieldContent>
                <FilterableSelect
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
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
