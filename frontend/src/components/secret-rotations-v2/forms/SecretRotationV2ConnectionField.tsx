import { Controller, useFormContext } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { AppConnectionOption } from "@app/components/app-connections";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { OrgPermissionSubjects, useOrgPermission, useWorkspace } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_ROTATION_CONNECTION_MAP } from "@app/helpers/secretRotationsV2";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";

import { TSecretRotationV2Form } from "./schemas";

type Props = {
  onChange?: VoidFunction;
  isUpdate: boolean;
};

export const SecretRotationV2ConnectionField = ({ onChange: callback, isUpdate }: Props) => {
  const { permission } = useOrgPermission();
  const { control, watch } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");
  const app = SECRET_ROTATION_CONNECTION_MAP[rotationType];

  const { currentWorkspace } = useWorkspace();

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentWorkspace.id
  );

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    OrgPermissionAppConnectionActions.Create,
    OrgPermissionSubjects.AppConnections
  );

  const appName = APP_CONNECTION_MAP[app].name;

  return (
    <>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText="App Connections can be created from the Organization Settings page."
            isError={Boolean(error)}
            errorText={error?.message}
            label={`${connectionName} Connection`}
            helperText={
              isUpdate ? (
                "Cannot be updated"
              ) : (
                <p>
                  Check out{" "}
                  <a
                    href={`https://infisical.com/docs/integrations/app-connections/${app}`}
                    target="_blank"
                    className="underline"
                    rel="noopener noreferrer"
                  >
                    our docs
                  </a>{" "}
                  to ensure your connection has the required permissions for secret rotation.
                </p>
              )
            }
          >
            <FilterableSelect
              value={value}
              onChange={(newValue) => {
                onChange(newValue);
                if (callback) callback();
              }}
              isLoading={isPending}
              options={availableConnections}
              isDisabled={isUpdate}
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
      {!isUpdate && !isPending && !availableConnections?.length && (
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
