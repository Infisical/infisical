import { Controller, useFormContext } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/helpers/secretSyncs";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";

import { TSecretSyncForm } from "./schemas";

type Props = {
  onChange?: VoidFunction;
};

export const SecretSyncConnectionField = ({ onChange: callback }: Props) => {
  const { permission } = useOrgPermission();
  const { control, watch } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");
  const app = SECRET_SYNC_CONNECTION_MAP[destination];

  const { data: availableConnections, isPending } = useListAvailableAppConnections(app);

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    OrgPermissionAppConnectionActions.Create,
    OrgPermissionSubjects.AppConnections
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
