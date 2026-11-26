import { Controller, useFormContext, useWatch } from "react-hook-form";
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
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  ALERT_EVENT_TYPE_DESCRIPTIONS,
  AlertEventType,
  AlertResourceType
} from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { TDataSourceAlertField, TSecretScanningDataSourceForm } from "./schemas";

type TProjectPermission = ReturnType<typeof useProjectPermission>["permission"];

// Mirrors the backend, where choosing a data source's alerts needs edit on data sources.
export const canManageDataSourceAlerts = (permission: TProjectPermission) =>
  permission.can(
    ProjectPermissionSecretScanningDataSourceActions.Edit,
    ProjectPermissionSub.SecretScanningDataSources
  );

export const DATA_SOURCE_ALERTS: {
  eventType: AlertEventType.SecretScanningSecretsDetected | AlertEventType.SecretScanningScanFailed;
  field: TDataSourceAlertField;
  title: string;
}[] = [
  {
    eventType: AlertEventType.SecretScanningSecretsDetected,
    field: "secretsDetectedAlert",
    title: "Alert When Secrets Are Detected"
  },
  {
    eventType: AlertEventType.SecretScanningScanFailed,
    field: "scanFailedAlert",
    title: "Alert When a Scan Fails"
  }
];

type AlertFieldProps = {
  projectId: string;
  dataSourceId?: string;
  alert: (typeof DATA_SOURCE_ALERTS)[number];
};

const AlertField = ({
  projectId,
  dataSourceId,
  alert: { eventType, field, title }
}: AlertFieldProps) => {
  const { control, clearErrors } = useFormContext<TSecretScanningDataSourceForm>();
  const enabled = useWatch({ control, name: `${field}.enabled` });

  return (
    <div className="flex flex-col gap-3">
      <Controller
        control={control}
        name={`${field}.enabled`}
        render={({ field: { value, onChange, onBlur, ref } }) => (
          <Item variant="outline">
            <ItemMedia variant="icon">
              <BellIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id={`${field}-title`}>{title}</ItemTitle>
              <ItemDescription id={`${field}-description`}>
                {ALERT_EVENT_TYPE_DESCRIPTIONS[eventType]}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Toggle
                ref={ref}
                variant="ss"
                checked={value}
                onBlur={onBlur}
                onCheckedChange={(checked) => {
                  onChange(checked);
                  if (!checked) clearErrors(`${field}.channels`);
                }}
                aria-labelledby={`${field}-title`}
                aria-describedby={`${field}-description`}
              />
            </ItemActions>
          </Item>
        )}
      />
      {enabled && (
        <ChannelsField
          name={`${field}.channels`}
          projectId={projectId}
          resourceType={AlertResourceType.SecretScanning}
          resourceId={dataSourceId}
        />
      )}
    </div>
  );
};

type Props = {
  projectId: string;
  // Set when editing an existing data source.
  dataSourceId?: string;
  isAlertsUnavailable?: boolean;
};

export const SecretScanningDataSourceAlertsFields = ({
  projectId,
  dataSourceId,
  isAlertsUnavailable = false
}: Props) => {
  const { permission } = useProjectPermission();

  if (isAlertsUnavailable) {
    return (
      <p className="text-sm text-danger">
        Couldn&apos;t load this data source&apos;s alerts. Saving leaves them unchanged. Close and
        reopen the data source to try again.
      </p>
    );
  }

  if (!canManageDataSourceAlerts(permission)) {
    return (
      <p className="text-sm text-muted">
        {dataSourceId
          ? "You can't change this data source's alerts. That needs permission to edit data sources."
          : "You can't choose this data source's alerts. That needs permission to edit data sources. It will get the default alerts, which email project admins when secrets are detected and when a scan fails."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {DATA_SOURCE_ALERTS.map((alert) => (
        <AlertField
          key={alert.field}
          projectId={projectId}
          dataSourceId={dataSourceId}
          alert={alert}
        />
      ))}
    </div>
  );
};
