import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { InfoIcon } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Alert,
  AlertDescription,
  Field,
  FieldFeedback,
  FilterableSelect
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSecretRotationActions
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_ROTATION_CONNECTION_MAP } from "@app/helpers/secretRotationsV2";
import { usePopUp } from "@app/hooks";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { TSecretRotationV2Form } from "./schemas";

type Props = {
  onChange?: VoidFunction;
  isUpdate: boolean;
};

export const SecretRotationV2ConnectionField = ({ onChange: callback, isUpdate }: Props) => {
  const { permission } = useProjectPermission();
  const { control, watch, setValue } = useFormContext<TSecretRotationV2Form>();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const rotationType = watch("type");
  const environment = watch("environment");
  const secretPath = watch("secretPath");
  const app = SECRET_ROTATION_CONNECTION_MAP[rotationType];

  const { currentProject } = useProject();

  const { data: availableConnections, isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );

  const allowedConnections = useMemo(() => {
    if (!availableConnections) return [];
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

  const connectionName = APP_CONNECTION_MAP[app].name;

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const appName = APP_CONNECTION_MAP[app].name;

  return (
    <>
      <Controller
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="secret-rotation-connection"
              tooltip="App Connections can be created from the Organization Settings page."
            >
              {connectionName} Connection
            </FieldLabelWithTooltip>
            <FilterableSelect
              inputId="secret-rotation-connection"
              value={value ?? null}
              onBlur={onBlur}
              onChange={(newValue) => {
                if ((newValue as SingleValue<{ id: string; name: string }>)?.id === "_create") {
                  handlePopUpOpen("addConnection");
                  onChange(null);
                  localStorage.setItem("secretRotationFormData", JSON.stringify(watch()));
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
              isDisabled={isUpdate}
              placeholder="Select connection..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              components={{ Option: AppConnectionOption }}
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
                      href={`https://infisical.com/docs/integrations/app-connections/${app}`}
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
            You do not have access to any {appName} Connections. Contact an admin to create one.
          </AlertDescription>
        </Alert>
      )}
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => {
          localStorage.removeItem("secretRotationFormData");
          handlePopUpToggle("addConnection", isOpen);
        }}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={app}
        onComplete={(connection) => {
          if (connection) {
            setValue("connection", connection, { shouldValidate: true, shouldDirty: true });
          }
        }}
      />
    </>
  );
};
