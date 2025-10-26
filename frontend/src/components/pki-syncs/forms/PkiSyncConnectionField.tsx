import { Controller, useFormContext } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { PKI_SYNC_CONNECTION_MAP } from "@app/helpers/pkiSyncs";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  onChange?: VoidFunction;
};

export const PkiSyncConnectionField = ({ onChange: callback }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const destination = watch("destination");
  const app = PKI_SYNC_CONNECTION_MAP[destination];

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appName = APP_CONNECTION_MAP[PKI_SYNC_CONNECTION_MAP[destination]].name;

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Specify the {appName} Connection to use to connect to {connectionName} and configure
        destination parameters.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label={`${connectionName} Connection`}
          >
            <FilterableSelect
              value={value}
              onChange={(newValue) => {
                onChange(newValue);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={availableConnections}
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
        control={control}
        name="connection"
      />
      {availableConnections?.length === 0 && (
        <p className="-mt-2.5 mb-2.5 text-xs text-yellow">
          <FontAwesomeIcon className="mr-1" size="xs" icon={faInfoCircle} />
          {canCreateConnection ? (
            <>
              You do not have access to any {appName} Connections. Create one from the{" "}
              <Link to="/organization/app-connections" className="underline">
                App Connections
              </Link>{" "}
              page.
            </>
          ) : (
            `You do not have access to any ${appName} Connections. Contact an admin to create one.`
          )}
        </p>
      )}
    </>
  );
};
