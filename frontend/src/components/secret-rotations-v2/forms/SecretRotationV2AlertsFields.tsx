import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";
import { BellIcon } from "lucide-react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import { AlertResourceType } from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { TSecretRotationV2Form } from "./schemas";

type TProjectPermission = ReturnType<typeof useProjectPermission>["permission"];

type TRotationLocation = {
  environment?: string;
  secretPath?: string;
  connectionId?: string;
};

// Mirrors the backend, where adding, changing or removing a rotation's alert needs edit on the rotation.
export const canManageFailureAlert = (
  permission: TProjectPermission,
  { environment, secretPath, connectionId }: TRotationLocation
) => {
  if (!environment || !secretPath) return false;

  return permission.can(
    ProjectPermissionSecretRotationActions.Edit,
    subject(ProjectPermissionSub.SecretRotation, {
      environment,
      secretPath,
      ...(connectionId && { connectionId })
    })
  );
};

type Props = {
  projectId: string;
  rotationId?: string;
  isAlertUnavailable: boolean;
};

export const SecretRotationV2AlertsFields = ({
  projectId,
  rotationId,
  isAlertUnavailable
}: Props) => {
  const { control, clearErrors, setValue } = useFormContext<TSecretRotationV2Form>();
  const { permission } = useProjectPermission();
  const [isFailureAlertEnabled, environment, secretPath, connection] = useWatch({
    control,
    name: ["isFailureAlertEnabled", "environment", "secretPath", "connection"]
  });

  const canManage = canManageFailureAlert(permission, {
    environment: environment?.slug,
    secretPath,
    connectionId: connection?.id
  });

  useEffect(() => {
    if (canManage || !isFailureAlertEnabled) return;
    setValue("isFailureAlertEnabled", false, { shouldDirty: false });
    clearErrors("channels");
  }, [canManage, isFailureAlertEnabled, setValue, clearErrors]);

  if (isAlertUnavailable) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load this rotation&apos;s failure alert. Saving leaves it unchanged. Close and
        reopen the rotation to try again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="isFailureAlertEnabled"
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <Item variant="outline" className={canManage ? undefined : "opacity-60"}>
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id="secret-rotation-failure-alert-title">
                Alert on Rotation Failure
              </ItemTitle>
              <ItemDescription id="secret-rotation-failure-alert-description">
                Sends a notice when a scheduled rotation fails after all of its retries.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Toggle
                ref={ref}
                variant="project"
                checked={canManage && value}
                disabled={!canManage}
                onBlur={onBlur}
                onCheckedChange={(checked) => {
                  onChange(checked);
                  if (!checked) clearErrors("channels");
                }}
                aria-labelledby="secret-rotation-failure-alert-title"
                aria-describedby="secret-rotation-failure-alert-description"
              />
            </ItemActions>
          </Item>
        )}
      />
      {!canManage && (
        <p className="text-sm text-muted">
          You can&apos;t set up a failure alert for this rotation. That needs permission to edit
          secret rotations in this environment and path. Ask a project admin to add one.
        </p>
      )}
      {canManage && isFailureAlertEnabled && (
        <ChannelsField
          projectId={projectId}
          resourceType={AlertResourceType.SecretRotation}
          resourceId={rotationId}
        />
      )}
      {canManage && !isFailureAlertEnabled && (
        <p className="text-sm text-muted">
          No alert for this rotation. Admins still get an in-app notification when a scheduled
          rotation fails.
        </p>
      )}
    </div>
  );
};
