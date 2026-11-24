import { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import {
  Badge,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import {
  doesDataSourceSupportDiscovery,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP,
} from "@app/helpers/secretScanningV2";
import { ALERT_EVENT_TYPE_LABELS } from "@app/hooks/api/alerts";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";
import { describeChannel } from "@app/views/Alerts";

import { TSecretScanningDataSourceForm } from "../schemas";
import {
  canManageDataSourceAlerts,
  DATA_SOURCE_ALERT_TOGGLES,
} from "../SecretScanningDataSourceAlertsFields";

const ReviewGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <DetailGroup>
    <DetailGroupHeader>{title}</DetailGroupHeader>
    <div className="flex flex-wrap gap-x-8 gap-y-4">{children}</div>
  </DetailGroup>
);

const ReviewDetail = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <Detail>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>{children || "None"}</DetailValue>
  </Detail>
);

const EnabledBadge = ({ isEnabled }: { isEnabled: boolean }) => (
  <Badge variant={isEnabled ? "success" : "neutral"}>
    {isEnabled ? "Enabled" : "Disabled"}
  </Badge>
);

const getConnectionDetails = (
  form: TSecretScanningDataSourceForm,
): { label: string; value?: string }[] => {
  switch (form.type) {
    case SecretScanningDataSource.GitHub:
      return [];
    case SecretScanningDataSource.Bitbucket:
      return [{ label: "Workspace", value: form.config.workspaceSlug }];
    case SecretScanningDataSource.GitLab:
      if (form.config?.scope === GitLabDataSourceScope.Project) {
        return [{ label: "Project", value: form.config.projectName }];
      }

      return [
        {
          label: "Group",
          value:
            form.config?.scope === GitLabDataSourceScope.Group
              ? form.config.groupName
              : "None (all accessible projects)",
        },
      ];
    default:
      throw new Error("Unhandled data source type");
  }
};

const AlertsReview = ({ form }: { form: TSecretScanningDataSourceForm }) => {
  const { permission } = useProjectPermission();

  if (!canManageDataSourceAlerts(permission)) {
    return (
      <span className="text-sm text-muted">
        Default alerts to project admins
      </span>
    );
  }

  const events = DATA_SOURCE_ALERT_TOGGLES.filter(({ field }) => form[field]);
  if (events.length === 0)
    return <span className="text-sm text-muted">No alerts</span>;

  return (
    <>
      <ReviewDetail label="Events">
        {events
          .map(({ eventType }) => ALERT_EVENT_TYPE_LABELS[eventType])
          .join(", ")}
      </ReviewDetail>
      {form.channels.map((channel) => (
        <ReviewDetail key={channel.id ?? channel.name} label={channel.name}>
          {describeChannel(channel)}
          {channel.enabled ? "" : " (disabled)"}
        </ReviewDetail>
      ))}
    </>
  );
};

type Props = {
  isEdit: boolean;
};

export const SecretScanningDataSourceReviewFields = ({ isEdit }: Props) => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();
  const form = useWatch({ control }) as TSecretScanningDataSourceForm;

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[form.type];
  const connection = getConnectionDetails(form);

  return (
    <div className="flex flex-col gap-8">
      <ReviewGroup title="Connection">
        <ReviewDetail label="Platform">{platform}</ReviewDetail>
        <ReviewDetail label="App Connection">
          {form.connection?.name}
        </ReviewDetail>
        {connection.map(({ label, value }) => (
          <ReviewDetail key={label} label={label}>
            {value}
          </ReviewDetail>
        ))}
      </ReviewGroup>
      <ReviewGroup title="Scan Options">
        <ReviewDetail label="Historical Scan">
          <EnabledBadge isEnabled={form.isHistoricalScanEnabled} />
        </ReviewDetail>
        <ReviewDetail label="Scan New Commits">
          <EnabledBadge isEnabled={form.isScanNewCommitsEnabled} />
        </ReviewDetail>
        <ReviewDetail
          label={`Discover New ${RESOURCE_DESCRIPTION_HELPER[form.type].pluralTitle}`}
        >
          {doesDataSourceSupportDiscovery(form) ? (
            <EnabledBadge isEnabled={form.isDiscoveryEnabled} />
          ) : (
            <Badge variant="neutral">Unavailable</Badge>
          )}
        </ReviewDetail>
      </ReviewGroup>
      <ReviewGroup title="Details">
        <ReviewDetail label="Name">{form.name}</ReviewDetail>
        <ReviewDetail label="Description">{form.description}</ReviewDetail>
      </ReviewGroup>
      {!isEdit && (
        <ReviewGroup title="Alerts">
          <AlertsReview form={form} />
        </ReviewGroup>
      )}
    </div>
  );
};
