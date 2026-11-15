import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TAvailableAppConnection,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GatewayCapability } from "@app/hooks/api/gateways-v2/types";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";

import { THostDiscoveryJobForm } from "./discovery-job-form-schema";

type TConnectionOption = Pick<TAvailableAppConnection, "id" | "name"> &
  Partial<TAvailableAppConnection>;

type Props = {
  app: AppConnection.SSH | AppConnection.WinRM;
  connectionLabel: string;
  capability: GatewayCapability.CertificateScan | GatewayCapability.WindowsCertificateScan;
};

export const HostConnectionsFields = ({ app, connectionLabel, capability }: Props) => {
  const { currentProject } = useProject();
  const { control, getValues, setValue, setError } = useFormContext<THostDiscoveryJobForm>();

  const { connections, isPending } = useListAvailableAppConnectionsForApps(
    [app],
    currentProject.id
  );
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());

  const incapableGatewayIds = new Set(
    (gateways ?? [])
      .filter((gateway) => gateway.capabilities?.[capability] !== true)
      .map((gateway) => gateway.id)
  );

  const connectionsById = new Map<string, TConnectionOption>(
    connections.map((connection) => [connection.id, connection])
  );
  const resolveOption = (option: TConnectionOption) => connectionsById.get(option.id) ?? option;
  const hasNoGateway = (connection: Pick<TConnectionOption, "gatewayId" | "gatewayPoolId">) =>
    !connection.gatewayId && !connection.gatewayPoolId;
  const hasOutdatedGateway = (connection: Pick<TConnectionOption, "gatewayId">) =>
    Boolean(connection.gatewayId) && incapableGatewayIds.has(connection.gatewayId as string);
  const isMissingGateway = (option: TConnectionOption) => hasNoGateway(resolveOption(option));
  const isGatewayOutdated = (option: TConnectionOption) =>
    hasOutdatedGateway(resolveOption(option));
  const isUnusable = (option: TConnectionOption) =>
    isMissingGateway(option) || isGatewayOutdated(option);
  const connectionOptions: TConnectionOption[] = [
    ...connections.filter((connection) => !isUnusable(connection)),
    ...connections.filter(isUnusable)
  ];

  const creation = useConnectionCreation(app, (connection) => {
    if (hasNoGateway(connection)) {
      setError("connections", {
        message: `${connectionLabel} connection '${connection.name}' has no gateway. Add one to the connection to scan this server.`
      });
      return;
    }
    if (hasOutdatedGateway(connection)) {
      setError("connections", {
        message: `The gateway on ${connectionLabel} connection '${connection.name}' is too old for certificate scanning. Update it to the latest version.`
      });
      return;
    }
    const existing = getValues("connections") ?? [];
    if (existing.some((c) => c.id === connection.id)) return;
    setValue("connections", [...existing, { id: connection.id, name: connection.name }], {
      shouldDirty: true,
      shouldValidate: true
    });
  });

  return (
    <>
      <Controller
        control={control}
        name="connections"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>{connectionLabel} Connections</FieldLabel>
            <FieldContent>
              <Combobox
                multiple
                value={value}
                onValueChange={(next) => onChange(next.map(({ id, name }) => ({ id, name })))}
                isLoading={isPending}
                isError={Boolean(error)}
                options={connectionOptions}
                placeholder="Select connections..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                isOptionDisabled={isUnusable}
                creation={creation}
                renderOption={(option) => {
                  let unusableLabel: string | null = null;
                  let unusableHint: string | null = null;
                  if (isMissingGateway(option)) {
                    unusableLabel = "No gateway";
                    unusableHint = `This ${connectionLabel} connection has no gateway. Add one to the connection to scan this server.`;
                  } else if (isGatewayOutdated(option)) {
                    unusableLabel = "Update gateway";
                    unusableHint =
                      "This connection's gateway is too old for certificate scanning. Update it to the latest version.";
                  }
                  return (
                    <AppConnectionOptionContent
                      data={resolveOption(option)}
                      label={
                        unusableLabel && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="pointer-events-auto mr-2 shrink-0 cursor-help text-xs text-muted">
                                {unusableLabel}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{unusableHint}</TooltipContent>
                          </Tooltip>
                        )
                      }
                    />
                  );
                }}
                includeMissingSelectedOptions
                modal
              />
              {!error?.message && (
                <FieldDescription>
                  One connection per server. Only connections that use a gateway can be selected
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {!isPending && !connections.length && !creation && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <Info className="size-3.5" />
          You do not have access to any {connectionLabel} Connections. Contact an admin to create
          one.
        </p>
      )}
    </>
  );
};
