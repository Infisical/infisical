import { useState } from "react";
import { PencilIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Select } from "@app/components/v4/ui/select";
import { Sheet } from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { StatusText } from "@app/components/v4/ui/text";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { WorkflowIntegrationPlatform } from "@app/hooks/api/workflowIntegrations/types";

import { useProjectPermission } from "../../../access/permissions";
import { useProjectScope } from "../../../access/project/scope";
import { saved } from "../../../access/toast";
import { AccessRestricted, Muted, RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { PLATFORM_LABELS, SheetForm } from "./shared";
import { SlackIntegrationForm } from "./slack-form";
import { MicrosoftTeamsIntegrationForm } from "./teams-form";

type Notification = { enabled: boolean; channelNames: string[] } | "unsupported";

type Row = {
  platform: WorkflowIntegrationPlatform;
  integrationId: string;
  loading: boolean;
  accessRequest: Notification;
  secretRequest: Notification;
  secretSyncError: Notification;
};

const IntegrationSheet = ({
  open,
  platform: fixedPlatform,
  configured,
  onClose
}: {
  open: boolean;
  platform?: WorkflowIntegrationPlatform;
  configured: Record<WorkflowIntegrationPlatform, boolean>;
  onClose: () => void;
}) => {
  const { orgId, projectId } = useProjectScope();
  const [chosen, setChosen] = useState<WorkflowIntegrationPlatform>();
  const platform = fixedPlatform ?? chosen;
  const close = () => {
    setChosen(undefined);
    onClose();
  };
  const title = fixedPlatform
    ? `Edit ${PLATFORM_LABELS[fixedPlatform]} integration`
    : "Add workflow integration";
  const lead = fixedPlatform ? undefined : (
    <Field wide label="Platform">
      <Select
        label="Platform"
        placeholder="Select a platform"
        value={chosen ?? ""}
        options={Object.values(WorkflowIntegrationPlatform).map((value) => ({
          value,
          label: PLATFORM_LABELS[value],
          description: configured[value] ? "Already configured" : undefined
        }))}
        onChange={(value) => setChosen(value as WorkflowIntegrationPlatform)}
      />
    </Field>
  );
  const props = { projectId, orgId, title, lead, onClose: close };
  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      {platform === WorkflowIntegrationPlatform.SLACK && <SlackIntegrationForm {...props} />}
      {platform === WorkflowIntegrationPlatform.MICROSOFT_TEAMS && (
        <MicrosoftTeamsIntegrationForm {...props} />
      )}
      {!platform && <SheetForm title={title} lead={lead} saveDisabled />}
    </Sheet>
  );
};

const NotificationCell = ({ value, loading }: { value: Notification; loading: boolean }) => {
  if (value === "unsupported") return <Muted>Not supported</Muted>;
  if (loading) return <Skeleton width={96} height={16} />;
  if (!value.enabled)
    return (
      <StatusText tone="neutral" icon="minus">
        Disabled
      </StatusText>
    );
  if (!value.channelNames.length) return <Muted>No channels selected</Muted>;
  return <span>{value.channelNames.join(", ")}</span>;
};

const namesOf = (ids: string[], names: Record<string, string>) =>
  ids.map((id) => names[id]).filter(Boolean);

export const WorkflowIntegrationsSettings = () => {
  const { projectId } = useProjectScope();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const adapter = useV4Adapter("projectIntegrations");
  const slack = adapter.useWorkflowIntegrationConfig({
    projectId,
    integration: WorkflowIntegrationPlatform.SLACK
  });
  const teams = adapter.useWorkflowIntegrationConfig({
    projectId,
    integration: WorkflowIntegrationPlatform.MICROSOFT_TEAMS
  });
  const slackConfig =
    slack.data?.integration === WorkflowIntegrationPlatform.SLACK ? slack.data : undefined;
  const teamsConfig =
    teams.data?.integration === WorkflowIntegrationPlatform.MICROSOFT_TEAMS
      ? teams.data
      : undefined;
  const slackChannels = adapter.useSlackChannels(slackConfig?.integrationId);
  const teamsTeams = adapter.useMicrosoftTeamsTeams(teamsConfig?.integrationId);
  const deleteIntegration = adapter.useDeleteWorkflowIntegration();
  const [sheet, setSheet] = useState<{ platform?: WorkflowIntegrationPlatform }>();
  const [removing, setRemoving] = useState<Row>();
  const [removePending, setRemovePending] = useState(false);

  if (permissionPending) return <Card title="Workflow integrations" />;
  if (!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings))
    return <AccessRestricted requirement="read Settings" />;

  const canEdit = permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Settings);
  const loading = slack.isPending || teams.isPending;

  const slackNames = Object.fromEntries(
    (slackChannels.data ?? []).map((channel) => [channel.id, channel.name])
  );
  const teamsNames = Object.fromEntries(
    (teamsTeams.data ?? []).flatMap((team) =>
      team.channels.map((channel) => [channel.channelId, channel.channelName])
    )
  );
  const rows: Row[] = [];
  if (slackConfig) {
    const split = (value: string) => namesOf((value || "").split(", "), slackNames);
    rows.push({
      platform: WorkflowIntegrationPlatform.SLACK,
      integrationId: slackConfig.integrationId,
      loading: slackChannels.isPending,
      accessRequest: {
        enabled: slackConfig.isAccessRequestNotificationEnabled,
        channelNames: split(slackConfig.accessRequestChannels)
      },
      secretRequest: {
        enabled: slackConfig.isSecretRequestNotificationEnabled,
        channelNames: split(slackConfig.secretRequestChannels)
      },
      secretSyncError: {
        enabled: slackConfig.isSecretSyncErrorNotificationEnabled,
        channelNames: split(slackConfig.secretSyncErrorChannels)
      }
    });
  }
  if (teamsConfig)
    rows.push({
      platform: WorkflowIntegrationPlatform.MICROSOFT_TEAMS,
      integrationId: teamsConfig.integrationId,
      loading: teamsTeams.isPending,
      accessRequest: {
        enabled: teamsConfig.isAccessRequestNotificationEnabled,
        channelNames: namesOf(teamsConfig.accessRequestChannels?.channelIds ?? [], teamsNames)
      },
      secretRequest: {
        enabled: teamsConfig.isSecretRequestNotificationEnabled,
        channelNames: namesOf(teamsConfig.secretRequestChannels?.channelIds ?? [], teamsNames)
      },
      secretSyncError: "unsupported"
    });

  const edit = (row: Row) => setSheet({ platform: row.platform });

  const columns: DataTableColumn<Row>[] = [
    {
      id: "provider",
      header: "Provider",
      width: 200,
      render: (row) =>
        canEdit ? (
          <Button variant="link" underline="hover" onClick={() => edit(row)}>
            {PLATFORM_LABELS[row.platform]}
          </Button>
        ) : (
          PLATFORM_LABELS[row.platform]
        )
    },
    {
      id: "accessRequest",
      header: "Access requests",
      grow: true,
      render: (row) => <NotificationCell value={row.accessRequest} loading={row.loading} />
    },
    {
      id: "secretRequest",
      header: "Secret approval requests",
      grow: true,
      render: (row) => <NotificationCell value={row.secretRequest} loading={row.loading} />
    },
    {
      id: "secretSyncError",
      header: "Secret sync errors",
      grow: true,
      render: (row) => <NotificationCell value={row.secretSyncError} loading={row.loading} />
    }
  ];

  const rowActions: DataTableRowActions<Row> = {
    inline: [
      {
        label: (row) => `Edit ${PLATFORM_LABELS[row.platform]} integration`,
        icon: PencilIcon,
        onSelect: edit,
        disabledReason: () => (canEdit ? undefined : RESTRICTED)
      }
    ],
    renderMenu: (row) => (
      <DropdownMenuItem
        variant="destructive"
        disabled={!canDelete}
        description={canDelete ? undefined : RESTRICTED}
        onSelect={() => setRemoving(row)}
      >
        <Icon name="trash" />
        Remove
      </DropdownMenuItem>
    )
  };

  const hasRows = loading || rows.length > 0;
  const removingLabel = removing ? PLATFORM_LABELS[removing.platform] : "";
  return (
    <>
      <Card
        variant="framed"
        title="Workflow integrations"
        flush={hasRows}
        action={
          <Button
            variant="outline"
            size="xs"
            icon="plus"
            disabledReason={canEdit ? undefined : RESTRICTED}
            onClick={() => setSheet({})}
          >
            Add integration
          </Button>
        }
      >
        {hasRows ? (
          <DataTable
            label="Workflow integrations"
            rows={rows}
            columns={columns}
            rowActions={rowActions}
            getRowId={(row) => row.platform}
            rowLabel={(row) => PLATFORM_LABELS[row.platform]}
            onRowActivate={canEdit ? edit : undefined}
            loading={loading}
            loadingRows={2}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="bell"
            title="No workflow integrations yet"
            description="Add one to send this project's notifications to Slack or Microsoft Teams."
          />
        )}
      </Card>
      <IntegrationSheet
        open={Boolean(sheet)}
        platform={sheet?.platform}
        configured={{
          [WorkflowIntegrationPlatform.SLACK]: Boolean(slackConfig),
          [WorkflowIntegrationPlatform.MICROSOFT_TEAMS]: Boolean(teamsConfig)
        }}
        onClose={() => setSheet(undefined)}
      />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removingLabel} from this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This project stops sending notifications to {removingLabel}. You can add the
              integration again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!removing) return;
                setRemovePending(true);
                try {
                  await deleteIntegration.mutateAsync({
                    projectId,
                    integration: removing.platform,
                    integrationId: removing.integrationId
                  });
                  saved(`Removed ${removingLabel} from this project`);
                  setRemoving(undefined);
                } finally {
                  setRemovePending(false);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
