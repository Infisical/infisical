import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AppConnectionOption } from "@app/components/app-connections";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretSyncActions
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/helpers/secretSyncs";
import { usePopUp } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TSecretSyncForm } from "./schemas";

type Props = {
  onChange?: VoidFunction;
};

export const SecretSyncConnectionField = ({ onChange: callback }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TSecretSyncForm>();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const destination = watch("destination");
  const environment = watch("environment");
  const secretPath = watch("secretPath");
  const app = SECRET_SYNC_CONNECTION_MAP[destination];

  const { currentProject } = useProject();

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const allowedConnections = useMemo(() => {
    if (!availableConnections) return [];
    return availableConnections.filter((conn) =>
      permission.can(
        ProjectPermissionSecretSyncActions.Create,
        subject(ProjectPermissionSub.SecretSyncs, {
          connectionId: conn.id,
          ...(environment?.slug && { environment: environment.slug }),
          ...(secretPath && { secretPath })
        })
      )
    );
  }, [availableConnections, permission, environment?.slug, secretPath]);

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appName = APP_CONNECTION_MAP[SECRET_SYNC_CONNECTION_MAP[destination]].name;

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Specify the {appName} Connection to use to connect to {connectionName} and configure
        destination parameters.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText="App Connections can be created from the Organization Settings page."
            isError={Boolean(error)}
            errorText={error?.message}
            label={`${connectionName} Connection`}
          >
            <FilterableSelect
              value={value}
              onChange={(newValue) => {
                if ((newValue as SingleValue<{ id: string; name: string }>)?.id === "_create") {
                  handlePopUpOpen("addConnection");
                  onChange(null);
                  // store for oauth callback connections
                  localStorage.setItem("secretSyncFormData", JSON.stringify(watch()));
                  if (callback) callback();
                  return;
                }

                onChange(newValue);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={[
                ...(canCreateConnection ? [{ id: "_create", name: "Create Connection" }] : []),
                ...allowedConnections
              ]}
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: AppConnectionOption }}
            />
          </FormControl>
        )}
        control={control}
        name="connection"
      />
      {!isPending && !allowedConnections.length && !canCreateConnection && (
        <p className="-mt-2.5 mb-2.5 text-xs text-yellow">
          <FontAwesomeIcon className="mr-1" size="xs" icon={faInfoCircle} />
          You do not have access to any {appName} Connections. Contact an admin to create one.
        </p>
      )}
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => {
          // remove form storage, not oauth connection
          localStorage.removeItem("secretSyncFormData");
          handlePopUpToggle("addConnection", isOpen);
        }}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={app}
        onComplete={(connection) => {
          if (connection) {
            setValue("connection", connection);
          }
        }}
      />
    </>
  );
};
