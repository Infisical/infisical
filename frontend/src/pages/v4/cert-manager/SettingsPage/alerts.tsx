import { useState } from "react";
import { format } from "date-fns";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
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
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Meta } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  CertificateAlertResourceType,
  type TAlert,
  type TCertificateAlertEventType
} from "@app/hooks/api/alerts/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useOrgPermission } from "../../access/permissions";
import { saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  ALERT_EVENT_LABELS,
  FILTER_DEFINITIONS,
  formatAlertBefore,
  formatRunTimestamp,
  fromApiEventType,
  getFilterKinds,
  getFilterName,
  isSignerEventType,
  LAST_RUN_BADGES,
  pluralize,
  toConditionNames,
  toMemberEmails
} from "./alert-model";
import { AlertDetailsSheet, AlertWizard } from "./alert-sheet";
import { RESTRICTED, useCertManagerSettingsScope, useSettingsPermission } from "./shared";

const CREATE_RESTRICTED = "Only Certificate Manager admins can create these alerts";

const FiltersSummary = ({ alert }: { alert: TAlert }) => {
  const eventType = alert.eventType as TCertificateAlertEventType;
  const conditionNames = toConditionNames(alert);
  const active = getFilterKinds(eventType).flatMap((kind) => {
    const ids: string[] = alert.condition?.[kind] ?? [];
    return ids.length ? [{ kind, ids }] : [];
  });
  if (!active.length)
    return (
      <Meta mono={false}>{isSignerEventType(eventType) ? "All signers" : "All certificates"}</Meta>
    );
  const detail = active
    .map(
      ({ kind, ids }) =>
        `${FILTER_DEFINITIONS[kind].label}: ${ids.map((id) => getFilterName(kind, id, conditionNames)).join(", ")}`
    )
    .join(". ");
  return (
    <Tooltip content={detail}>
      <span>
        {active
          .map(({ kind, ids }) => pluralize(ids.length, FILTER_DEFINITIONS[kind].noun))
          .join(", ")}
      </span>
    </Tooltip>
  );
};

type Opened = { alert?: TAlert; session: number; mode: "edit" | "view" };

export const AlertsTab = () => {
  const { orgId, projectId } = useCertManagerSettingsScope();
  const { permission } = useSettingsPermission();
  const { permission: orgPermission } = useOrgPermission();
  const { data: access } = useV4Adapter("certificates").useProjectPermission({ projectId });
  const settings = useV4Adapter("certManagerSettings");
  const certificateAlerts = settings.useAlerts({
    resourceType: CertificateAlertResourceType.CertificateManager,
    projectId
  });
  const signerAlerts = settings.useAlerts({
    resourceType: CertificateAlertResourceType.Signer,
    projectId
  });
  const updateAlert = settings.useUpdateAlert();
  const deleteAlert = settings.useDeleteAlert();
  const hasEnterprise = settings.useHasEnterpriseAlerting(orgId).data ?? false;
  const [opened, setOpened] = useState<Opened>({ session: 0, mode: "edit" });
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [viewing, setViewing] = useState<TAlert>();
  const [deleting, setDeleting] = useState<TAlert>();
  const [pending, setPending] = useState(false);

  const canReadMembers = orgPermission.can(
    OrgPermissionMemberActions.Read,
    OrgPermissionSubjects.Member
  );
  const orgUsers = settings.useAlertOrgUsers(orgId, {
    enabled: (isWizardOpen || Boolean(viewing)) && canReadMembers
  });
  const members = toMemberEmails(orgUsers.data);
  const isMembersPending = canReadMembers && orgUsers.isPending;

  const isAdmin = (access?.memberships ?? []).some((membership) =>
    membership.roles.some((role) => role.role === ProjectMembershipRole.Admin)
  );
  const canCreate =
    isAdmin && permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts);
  const canEdit =
    isAdmin && permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts);
  const canDelete = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts);

  const alerts = [...(certificateAlerts.data ?? []), ...(signerAlerts.data ?? [])].map((alert) => ({
    ...alert,
    eventType: fromApiEventType(alert.eventType)
  }));
  const isLoading = certificateAlerts.isPending || signerAlerts.isPending;
  const isError = Boolean(certificateAlerts.error || signerAlerts.error);

  const openWizard = (alert?: TAlert) => {
    setOpened((current) => ({ alert, session: current.session + 1, mode: "edit" }));
    setIsWizardOpen(true);
  };
  const activate = (alert: TAlert) => (canEdit ? openWizard(alert) : setViewing(alert));

  const toggle = async (alert: TAlert) => {
    await updateAlert.mutateAsync({ alertId: alert.id, enabled: !alert.enabled });
    saved(`Alert "${alert.name}" ${alert.enabled ? "disabled" : "enabled"}`);
  };

  const columns: DataTableColumn<TAlert>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      maxWidth: 280,
      text: (alert) => alert.name,
      render: (alert) => (
        <Stack gap={0} style={{ minWidth: 0 }}>
          <div>
            <Button variant="link" underline="hover" onClick={() => activate(alert)}>
              {alert.name}
            </Button>
          </div>
          {alert.description && (
            <Meta mono={false} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {alert.description}
            </Meta>
          )}
        </Stack>
      )
    },
    {
      id: "type",
      header: "Alert type",
      render: (alert) =>
        ALERT_EVENT_LABELS[alert.eventType as TCertificateAlertEventType] ?? alert.eventType
    },
    {
      id: "status",
      header: "Status",
      render: (alert) => (
        <Badge tone={alert.enabled ? "ok" : "outline"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      )
    },
    { id: "filters", header: "Filters", render: (alert) => <FiltersSummary alert={alert} /> },
    {
      id: "before",
      header: "Alert before",
      render: (alert) =>
        formatAlertBefore(alert.condition?.alertBefore) ?? <Meta mono={false}>None</Meta>
    },
    {
      id: "last-run",
      header: "Last run",
      render: (alert) =>
        alert.lastRun ? (
          <Inline gap={8} align="center" wrap={false}>
            <Badge tone={LAST_RUN_BADGES[alert.lastRun.status].tone}>
              {LAST_RUN_BADGES[alert.lastRun.status].label}
            </Badge>
            <Tooltip content={formatRunTimestamp(alert.lastRun.timestamp)}>
              <Meta mono={false}>{format(new Date(alert.lastRun.timestamp), "MMM d, HH:mm")}</Meta>
            </Tooltip>
          </Inline>
        ) : (
          <Meta mono={false}>Never</Meta>
        )
    }
  ];

  const rowActions: DataTableRowActions<TAlert> = {
    inline: [
      canEdit
        ? { label: "Edit", icon: "settings", onSelect: (alert) => openWizard(alert) }
        : { label: "View details", icon: "eye", onSelect: setViewing }
    ],
    renderMenu: (alert) => (
      <>
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(alert.id).catch(() => undefined);
            saved("Alert ID copied");
          }}
        >
          <Icon name="copy" />
          Copy ID
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canEdit}
          description={canEdit ? undefined : RESTRICTED}
          onSelect={() => toggle(alert).catch(() => undefined)}
        >
          <Icon name={alert.enabled ? "x" : "check"} />
          {alert.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          description={canDelete ? undefined : RESTRICTED}
          onSelect={() => setDeleting(alert)}
        >
          <Icon name="trash" />
          Delete
        </DropdownMenuItem>
      </>
    )
  };

  const hasRows = isLoading || alerts.length > 0;
  return (
    <Stack gap={16}>
      {isError && (
        <Alert tone="warn" title="Some alerts couldn't be loaded">
          <AlertDescription>
            Reload the page to try again. Alerts that failed to load aren&apos;t listed.
          </AlertDescription>
        </Alert>
      )}
      <Card
        variant="framed"
        title="Alerts"
        flush={hasRows}
        action={
          <Button
            variant="outline"
            size="sm"
            icon="plus"
            disabledReason={canCreate ? undefined : CREATE_RESTRICTED}
            onClick={() => openWizard()}
          >
            Create alert
          </Button>
        }
      >
        {hasRows ? (
          <DataTable
            label="Alerts"
            rows={alerts}
            columns={columns}
            rowActions={rowActions}
            getRowId={(alert) => alert.id}
            rowLabel={(alert) => alert.name}
            onRowActivate={activate}
            loading={isLoading}
            loadingRows={3}
          />
        ) : (
          !isError && (
            <EmptyState
              icon="bell"
              title="No alerts"
              description="Create one to get notified about certificate events across Certificate Manager."
            />
          )
        )}
      </Card>
      {!isMembersPending && opened.session > 0 && (
        <AlertWizard
          key={opened.session}
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          alert={opened.alert}
          projectId={projectId}
          members={members}
          hasEnterprise={hasEnterprise}
        />
      )}
      <AlertDetailsSheet alert={viewing} members={members} onClose={() => setViewing(undefined)} />
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText="delete" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The alert and its notification channels are deleted, and it stops sending
              notifications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleting) return;
                setPending(true);
                try {
                  await deleteAlert.mutateAsync({ alertId: deleting.id });
                  saved(`Alert "${deleting.name}" deleted`);
                  setDeleting(undefined);
                } finally {
                  setPending(false);
                }
              }}
            >
              Delete alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
