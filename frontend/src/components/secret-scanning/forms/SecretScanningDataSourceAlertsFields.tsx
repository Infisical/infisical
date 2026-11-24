import { Controller, useFormContext, useWatch } from "react-hook-form";
import { BellIcon } from "lucide-react";

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Toggle,
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  ALERT_EVENT_TYPE_DESCRIPTIONS,
  AlertEventType,
  AlertResourceType,
} from "@app/hooks/api/alerts";
import { ChannelsField } from "@app/views/Alerts";

import { TSecretScanningDataSourceForm } from "./schemas";

type TProjectPermission = ReturnType<typeof useProjectPermission>["permission"];

// Mirrors the backend, where choosing a data source's alerts needs edit on data sources.
export const canManageDataSourceAlerts = (permission: TProjectPermission) =>
  permission.can(
    ProjectPermissionSecretScanningDataSourceActions.Edit,
    ProjectPermissionSub.SecretScanningDataSources,
  );

export const DATA_SOURCE_ALERT_TOGGLES: {
  eventType: AlertEventType;
  field: "isSecretsDetectedAlertEnabled" | "isScanFailedAlertEnabled";
  title: string;
}[] = [
  {
    eventType: AlertEventType.SecretScanningSecretsDetected,
    field: "isSecretsDetectedAlertEnabled",
    title: "Alert When Secrets Are Detected",
  },
  {
    eventType: AlertEventType.SecretScanningScanFailed,
    field: "isScanFailedAlertEnabled",
    title: "Alert When a Scan Fails",
  },
];

type Props = {
  projectId: string;
};

export const SecretScanningDataSourceAlertsFields = ({ projectId }: Props) => {
  const { control, clearErrors } =
    useFormContext<TSecretScanningDataSourceForm>();
  const { permission } = useProjectPermission();
  const canManage = canManageDataSourceAlerts(permission);
  const [isSecretsDetectedAlertEnabled, isScanFailedAlertEnabled] = useWatch({
    control,
    name: ["isSecretsDetectedAlertEnabled", "isScanFailedAlertEnabled"],
  });
  const isAnyAlertEnabled =
    isSecretsDetectedAlertEnabled || isScanFailedAlertEnabled;

  if (!canManage) {
    return (
      <p className="text-sm text-muted">
        You can&apos;t choose this data source&apos;s alerts. That needs
        permission to edit data sources. It will get the default alerts, which
        email project admins when secrets are detected and when a scan fails.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {DATA_SOURCE_ALERT_TOGGLES.map(
        ({ eventType, field: fieldName, title }) => (
          <Controller
            key={eventType}
            control={control}
            name={fieldName}
            render={({ field: { value, onChange, onBlur, ref } }) => (
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <BellIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle id={`${fieldName}-title`}>{title}</ItemTitle>
                  <ItemDescription id={`${fieldName}-description`}>
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
                      if (!checked) clearErrors("channels");
                    }}
                    aria-labelledby={`${fieldName}-title`}
                    aria-describedby={`${fieldName}-description`}
                  />
                </ItemActions>
              </Item>
            )}
          />
        ),
      )}
      {isAnyAlertEnabled ? (
        <ChannelsField
          projectId={projectId}
          resourceType={AlertResourceType.SecretScanning}
        />
      ) : (
        <p className="text-sm text-muted">
          No alerts for this data source. You can add them later from its
          settings.
        </p>
      )}
    </div>
  );
};
