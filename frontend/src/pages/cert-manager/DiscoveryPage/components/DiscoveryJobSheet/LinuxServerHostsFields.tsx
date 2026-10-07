import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { AppConnectionOptionContent } from "@app/components/app-connections";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TAvailableAppConnection,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TLinuxServerDiscoveryJobForm } from "./discovery-job-form-schema";

type TConnectionOption = Pick<TAvailableAppConnection, "id" | "name"> &
  Partial<TAvailableAppConnection>;

const CREATE_OPTION_ID = "_create";

export const LinuxServerHostsFields = () => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const { control, getValues, setValue } = useFormContext<TLinuxServerDiscoveryJobForm>();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const { connections, isPending } = useListAvailableAppConnectionsForApps(
    [AppConnection.SSH],
    currentProject.id
  );

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const connectionsById = new Map<string, TConnectionOption>(
    connections.map((connection) => [connection.id, connection])
  );
  const resolveOption = (option: TConnectionOption) => connectionsById.get(option.id) ?? option;
  const isMissingGateway = (option: TConnectionOption) => {
    const connection = resolveOption(option);
    return connection.id !== CREATE_OPTION_ID && !connection.gatewayId && !connection.gatewayPoolId;
  };
  const connectionOptions: TConnectionOption[] = [
    ...(canCreateConnection ? [{ id: CREATE_OPTION_ID, name: "Create SSH Connection" }] : []),
    ...connections.filter((connection) => !isMissingGateway(connection)),
    ...connections.filter(isMissingGateway)
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
                isOptionDisabled={isMissingGateway}
                renderOption={(option) => (
                  <AppConnectionOptionContent
                    data={resolveOption(option)}
                    createLabel="Create SSH Connection"
                    isOnlyOption={option.id === CREATE_OPTION_ID && connectionOptions.length === 1}
                    label={
                      isMissingGateway(option) && (
                        <span className="mr-2 shrink-0 text-xs text-muted">No gateway</span>
                      )
                    }
                  />
                )}
                includeMissingSelectedOptions
                modal
              />
              {!error?.message && (
                <FieldDescription>
                  Each connection is one server. It must use a gateway, and the scan runs from that
                  gateway.
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
          setValue("connections", [...existing, { id: connection.id, name: connection.name }], {
            shouldDirty: true,
            shouldValidate: true
          });
        }}
      />
    </>
  );
};
