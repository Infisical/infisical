import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
import { RENDER_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  TRenderService,
  useRenderConnectionListServices
} from "@app/hooks/api/appConnections/render";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { RenderSyncScope, RenderSyncType } from "@app/hooks/api/secretSyncs/render-sync";

import { TSecretSyncForm } from "../schemas";

export const RenderSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Render }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: services = [], isPending: isServicesPending } = useRenderConnectionListServices(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.serviceId", "");
          setValue("destinationConfig.type", RenderSyncType.Env);
          setValue("destinationConfig.scope", RenderSyncScope.Service);
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={RenderSyncScope.Service}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Scope"
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should manage secrets from Render. The following options are
                  available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(RENDER_SYNC_SCOPES).map(({ name, description }) => {
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
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(RenderSyncScope).map((scope) => (
                <SelectItem className="capitalize" value={scope} key={scope}>
                  {scope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.serviceId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl errorText={error?.message} isError={Boolean(error?.message)} label="Service">
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
          </FormControl>
        )}
      />
    </>
  );
};
