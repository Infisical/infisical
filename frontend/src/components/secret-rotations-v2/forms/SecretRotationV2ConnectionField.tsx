import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { subject } from "@casl/ability";
import { InfoIcon } from "lucide-react";

import {
  AppConnectionOptionContent,
  useAppConnectionCreation
} from "@app/components/app-connections";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Alert, AlertDescription, Combobox, Field, FieldFeedback } from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  getSecretRotationConnectionApps,
  SECRET_ROTATION_CONNECTION_MAP
} from "@app/helpers/secretRotationsV2";
import {
  TAvailableAppConnection,
  useListAvailableAppConnectionsForApps
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { TSecretRotationV2Form } from "./schemas";

type Props = {
  onChange?: VoidFunction;
  isUpdate: boolean;
};

type TConnectionOption = Partial<TAvailableAppConnection> &
  Pick<TAvailableAppConnection, "id" | "name"> & { app?: AppConnection };

export const SecretRotationV2ConnectionField = ({ onChange: callback, isUpdate }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");
  const environment = watch("environment");
  const secretPath = watch("secretPath");
  const app = SECRET_ROTATION_CONNECTION_MAP[rotationType];
  const apps = getSecretRotationConnectionApps(rotationType);

  const { currentProject } = useProject();

  const { connections: availableConnections, isPending } = useListAvailableAppConnectionsForApps(
    apps,
    currentProject.id
  );

  const allowedConnections = useMemo(() => {
    const envSlug = environment?.slug;
    if (!envSlug || !secretPath) return availableConnections;
    return availableConnections.filter((conn) =>
      permission.can(
        ProjectPermissionSecretRotationActions.Create,
        subject(ProjectPermissionSub.SecretRotation, {
          connectionId: conn.id,
          environment: envSlug,
          secretPath
        })
      )
    );
  }, [availableConnections, permission, environment?.slug, secretPath]);

  const connectionLabel =
    apps.length > 1 ? "Connection" : `${APP_CONNECTION_MAP[app].name} Connection`;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appNames = apps.map((accepted) => APP_CONNECTION_MAP[accepted].name).join(" or ");

  const creation = useAppConnectionCreation<TConnectionOption>({
    apps,
    onCreated: (connection) => {
      setValue("connection", connection, { shouldValidate: true, shouldDirty: true });
      if (callback) callback();
    },
    onOpen: () =>
      localStorage.setItem(
        "secretRotationFormData",
        JSON.stringify(watch(), (key, serializedValue) =>
          key === "temporaryParameters" ? undefined : serializedValue
        )
      ),
    onClose: () => localStorage.removeItem("secretRotationFormData")
  });

  return (
    <>
      <Controller
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="secret-rotation-connection"
              tooltip="App Connections can be created from the Organization Settings page."
            >
              {connectionLabel}
            </FieldLabelWithTooltip>
            <Combobox<TConnectionOption>
              id="secret-rotation-connection"
              ref={ref}
              value={allowedConnections.find((option) => option.id === value?.id) ?? value ?? null}
              onBlur={onBlur}
              onValueChange={(newValue) => {
                onChange(newValue);
                if (callback) callback();
              }}
              isClearable={false}
              isLoading={isPending}
              options={allowedConnections}
              getOptionGroup={
                apps.length > 1 ? (option) => APP_CONNECTION_MAP[option.app ?? app].name : undefined
              }
              getOptionKeywords={(option) => [option.id]}
              isDisabled={isUpdate}
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              renderOption={(option) => <AppConnectionOptionContent data={option} />}
              creation={creation}
              isError={Boolean(error)}
              aria-describedby="secret-rotation-connection-feedback"
            />
            <FieldFeedback
              id="secret-rotation-connection-feedback"
              description={
                isUpdate ? (
                  "Cannot be updated"
                ) : (
                  <>
                    Check out{" "}
                    <a
                      href={`https://infisical.com/docs/integrations/app-connections/${value?.app ?? app}`}
                      target="_blank"
                      className="underline"
                      rel="noopener noreferrer"
                    >
                      our docs
                    </a>{" "}
                    to ensure your connection has the required permissions for secret rotation.
                  </>
                )
              }
              error={error?.message}
            />
          </Field>
        )}
        control={control}
        name="connection"
      />
      {!isUpdate && !isPending && !allowedConnections.length && !canCreateConnection && (
        <Alert variant="warning">
          <InfoIcon />
          <AlertDescription>
            You do not have access to any {appNames} Connections. Contact an admin to create one.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};
