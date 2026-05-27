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
import { RENDER_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  TRenderEnvironmentGroup,
  TRenderService,
  useRenderConnectionListEnvironmentGroups,
  useRenderConnectionListServices
} from "@app/hooks/api/appConnections/render";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RenderSyncScope, RenderSyncType } from "@app/hooks/api/secretSyncs/types/render-sync";

import { TSecretSyncForm } from "../schemas";

export const RenderSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Render }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const selectedScope = useWatch({ name: "destinationConfig.scope", control });

  const { data: services = [], isPending: isServicesPending } = useRenderConnectionListServices(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: groups = [], isPending: isGroupsPending } =
    useRenderConnectionListEnvironmentGroups(connectionId, {
      enabled: Boolean(connectionId) && selectedScope === RenderSyncScope.EnvironmentGroup
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.serviceId", "");
          setValue("destinationConfig.environmentGroupId", "");
          setValue("destinationConfig.type", RenderSyncType.Env);
          setValue("destinationConfig.scope", RenderSyncScope.Service);
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={RenderSyncScope.Service}
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
                      Specify how Infisical should manage secrets from Render. The following options
                      are available:
                    </p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      {Object.values(RENDER_SYNC_SCOPES).map(({ name, description }) => (
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
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(RenderSyncScope).map((scope) => (
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
      {selectedScope === RenderSyncScope.Service && (
        <Controller
          name="destinationConfig.serviceId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Service</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isServicesPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={services ? (services.find((service) => service.id === value) ?? []) : []}
                  onChange={(option) => {
                    onChange((option as SingleValue<TRenderService>)?.id ?? null);
                    setValue(
                      "destinationConfig.serviceName",
                      (option as SingleValue<TRenderService>)?.name ?? ""
                    );
                  }}
                  options={services}
                  placeholder="Select a service..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id.toString()}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}

      {selectedScope === RenderSyncScope.EnvironmentGroup && (
        <Controller
          name="destinationConfig.environmentGroupId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Environment Group</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isGroupsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={groups ? (groups.find((g) => g.id === value) ?? []) : []}
                  onChange={(option) => {
                    onChange((option as SingleValue<TRenderEnvironmentGroup>)?.id ?? null);
                    setValue(
                      "destinationConfig.environmentGroupName",
                      (option as SingleValue<TRenderEnvironmentGroup>)?.name ?? ""
                    );
                  }}
                  options={groups}
                  placeholder="Select an environment group..."
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
