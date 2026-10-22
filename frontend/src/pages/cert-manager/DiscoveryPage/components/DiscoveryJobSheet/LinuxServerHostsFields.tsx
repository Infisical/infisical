import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
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
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TAvailableAppConnection,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TLinuxServerDiscoveryJobForm } from "./discovery-job-form-schema";

type TConnectionOption = Pick<TAvailableAppConnection, "id" | "name"> &
  Partial<TAvailableAppConnection>;

const CREATE_OPTION_ID = "_create";

export const LinuxServerHostsFields = () => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const { control, getValues, setValue, setError } = useFormContext<TLinuxServerDiscoveryJobForm>();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const { connections, isPending } = useListAvailableAppConnectionsForApps(
    [AppConnection.SSH],
    currentProject.id
  );
  const { data: gateways } = useQuery(gatewaysQueryKeys.list());

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const incapableGatewayIds = new Set(
    (gateways ?? [])
      .filter((gateway) => gateway.capabilities?.certificateScan !== true)
      .map((gateway) => gateway.id)
  );

  const connectionsById = new Map<string, TConnectionOption>(
    connections.map((connection) => [connection.id, connection])
  );
  const resolveOption = (option: TConnectionOption) => connectionsById.get(option.id) ?? option;
  const isMissingGateway = (option: TConnectionOption) => {
    const connection = resolveOption(option);
    return connection.id !== CREATE_OPTION_ID && !connection.gatewayId && !connection.gatewayPoolId;
  };
  const isGatewayOutdated = (option: TConnectionOption) => {
    const connection = resolveOption(option);
    return Boolean(connection.gatewayId) && incapableGatewayIds.has(connection.gatewayId as string);
  };
  const isUnusable = (option: TConnectionOption) =>
    isMissingGateway(option) || isGatewayOutdated(option);
  const connectionOptions: TConnectionOption[] = [
    ...(canCreateConnection ? [{ id: CREATE_OPTION_ID, name: "Create SSH Connection" }] : []),
    ...connections.filter((connection) => !isUnusable(connection)),
    ...connections.filter(isUnusable)
  ];

  return (
    <>
      <Controller
        control={control}
        name="connections"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>SSH Connections</FieldLabel>
            <FieldContent>
              <Combobox
                multiple
                value={value}
                onValueChange={(next) => {
                  if (next.some((option) => option.id === CREATE_OPTION_ID)) {
                    handlePopUpOpen("addConnection");
                    return;
                  }
                  onChange(next.map(({ id, name }) => ({ id, name })));
                }}
                isLoading={isPending}
                isError={Boolean(error)}
                options={connectionOptions}
                placeholder="Select connections..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                isOptionDisabled={isUnusable}
                renderOption={(option) => {
                  let unusableLabel: string | null = null;
                  let unusableHint: string | null = null;
                  if (isMissingGateway(option)) {
                    unusableLabel = "No gateway";
                    unusableHint =
                      "This SSH connection has no gateway. Add one to the connection to scan this server.";
                  } else if (isGatewayOutdated(option)) {
                    unusableLabel = "Update gateway";
                    unusableHint =
                      "This connection's gateway is too old for certificate scanning. Update it to the latest version.";
                  }
                  return (
                    <AppConnectionOptionContent
                      data={resolveOption(option)}
                      createLabel="Create SSH Connection"
                      isOnlyOption={
                        option.id === CREATE_OPTION_ID && connectionOptions.length === 1
                      }
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
      {!isPending && !connections.length && !canCreateConnection && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <Info className="size-3.5" />
          You do not have access to any SSH Connections. Contact an admin to create one.
        </p>
      )}
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={AppConnection.SSH}
        onComplete={(connection) => {
          const existing = getValues("connections") ?? [];
          if (existing.some((c) => c.id === connection.id)) return;
          if (!connection.gatewayId && !connection.gatewayPoolId) {
            setError("connections", {
              message: `SSH connection '${connection.name}' has no gateway. Add one to the connection to scan this server.`
            });
            return;
          }
          setValue("connections", [...existing, { id: connection.id, name: connection.name }], {
            shouldDirty: true,
            shouldValidate: true
          });
        }}
      />
    </>
  );
};
