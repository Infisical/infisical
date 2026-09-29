import { useMemo, useState } from "react";
import {
  BellIcon,
  CircleStopIcon,
  EyeIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyMedia,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  AlertRunStatus,
  TAlert,
  useDeleteAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { PkiDocsUrls } from "../../pki-docs-urls";
import { CertificateAlertSheet } from "./CertificateAlertSheet";
import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CertificateAlertScopeKind,
  getAlertResourceId,
  getAlertResourceType,
  TCertificateAlertScope,
  toAlertEventKind
} from "./types";
import { useCertificateScopeNames } from "./useCertificateScopeNames";

type TScopeNames = ReturnType<typeof useCertificateScopeNames>;

const MAX_SCOPE_NAME_LOOKUPS = 100;

const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const AlertFiltersSummary = ({ alert, scopeNames }: { alert: TAlert; scopeNames: TScopeNames }) => {
  const applicationIds = alert.condition?.applicationIds ?? [];
  const profileIds = alert.condition?.profileIds ?? [];

  if (!applicationIds.length && !profileIds.length) {
    return <span className="text-muted">All certificates</span>;
  }

  const summary = [
    applicationIds.length ? pluralize(applicationIds.length, "application") : null,
    profileIds.length ? pluralize(profileIds.length, "profile") : null
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-accent">{summary}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex max-w-sm flex-col gap-1">
        {applicationIds.length > 0 && (
          <span>
            <span className="text-muted">Applications: </span>
            {applicationIds.map(scopeNames.getApplicationName).join(", ")}
          </span>
        )}
        {profileIds.length > 0 && (
          <span>
            <span className="text-muted">Profiles: </span>
            {profileIds.map(scopeNames.getProfileName).join(", ")}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

const LAST_RUN_BADGES: Record<
  AlertRunStatus,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  [AlertRunStatus.Success]: { label: "Success", variant: "success" },
  [AlertRunStatus.Partial]: { label: "Partial", variant: "warning" },
  [AlertRunStatus.Failed]: { label: "Failed", variant: "danger" }
};

type AlertRowProps = {
  alert: TAlert;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  scopeNames?: TScopeNames;
};

const AlertRow = ({
  alert,
  onView,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  scopeNames
}: AlertRowProps) => {
  const { mutate: updateAlert } = useUpdateAlert();

  const handleToggleAlert = () =>
    updateAlert(
      { alertId: alert.id, enabled: !alert.enabled },
      {
        onSuccess: () =>
          createNotification({
            text: `Alert "${alert.name}" ${alert.enabled ? "disabled" : "enabled"}`,
            type: "success"
          })
      }
    );

  return (
    <TableRow>
      <TableCell isTruncatable>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{alert.name}</span>
          {alert.description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3.5 shrink-0 text-accent" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {alert.description}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        {CERTIFICATE_ALERT_EVENT_LABELS[toAlertEventKind(alert.eventType)] ?? alert.eventType}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      {scopeNames && (
        <TableCell className="whitespace-nowrap">
          <AlertFiltersSummary alert={alert} scopeNames={scopeNames} />
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap text-accent">
        {alert.condition?.alertBefore ? (
          alert.condition.alertBefore
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {alert.lastRun ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={LAST_RUN_BADGES[alert.lastRun.status]?.variant ?? "danger"}>
                {LAST_RUN_BADGES[alert.lastRun.status]?.label ?? "Failed"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="text-xs text-label">
                {new Date(alert.lastRun.timestamp)
                  .toISOString()
                  .replace("T", " ")
                  .replace("Z", " UTC")}
              </div>
              {alert.lastRun.error ? (
                <div className="mt-1 max-h-32 thin-scrollbar overflow-y-auto text-xs break-words text-danger">
                  {alert.lastRun.error}
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Alert actions">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44" align="end" sideOffset={2}>
            {!canEdit && (
              <DropdownMenuItem onClick={onView}>
                <EyeIcon />
                View details
              </DropdownMenuItem>
            )}
            <DropdownMenuItem isDisabled={!canEdit} onClick={onEdit}>
              <PencilIcon />
              Edit alert
            </DropdownMenuItem>
            <DropdownMenuItem isDisabled={!canEdit} onClick={handleToggleAlert}>
              {alert.enabled ? <CircleStopIcon /> : <PlayIcon />}
              {alert.enabled ? "Disable" : "Enable"} alert
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
              <Trash2Icon />
              Delete alert
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

type Props = {
  projectId: string;
  scope: TCertificateAlertScope;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export const CertificateAlertsCard = ({
  projectId,
  scope,
  canCreate,
  canEdit,
  canDelete
}: Props) => {
  const isApplicationScope = scope.kind === CertificateAlertScopeKind.Application;
  const resourceId = getAlertResourceId(scope);
  const { data: alerts = [], isLoading: isAlertsLoading } = useListAlerts({
    resourceType: getAlertResourceType(scope),
    projectId,
    ...(resourceId ? { resourceId } : {})
  });
  const scopeIds = useMemo(() => {
    const applicationIds = new Set<string>();
    const profileIds = new Set<string>();
    if (!isApplicationScope) {
      alerts.forEach((alert) => {
        alert.condition?.applicationIds?.forEach((id) => applicationIds.add(id));
        alert.condition?.profileIds?.forEach((id) => profileIds.add(id));
      });
    }
    return {
      applicationIds: [...applicationIds].slice(0, MAX_SCOPE_NAME_LOOKUPS),
      profileIds: [...profileIds].slice(0, MAX_SCOPE_NAME_LOOKUPS)
    };
  }, [alerts, isApplicationScope]);
  const scopeNames = useCertificateScopeNames(scopeIds);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    alertId?: string;
    isReadOnly?: boolean;
  }>({
    isOpen: false
  });
  const [deleteAlertModal, setDeleteAlertModal] = useState<{
    isOpen: boolean;
    alertId?: string;
    name?: string;
  }>({ isOpen: false });
  const { mutateAsync: deleteAlert } = useDeleteAlert();

  const handleDeleteAlert = async () => {
    if (!deleteAlertModal.alertId) return;
    await deleteAlert({ alertId: deleteAlertModal.alertId });
    setDeleteAlertModal({ isOpen: false });
    createNotification({ type: "success", text: `Alert "${deleteAlertModal.name}" deleted` });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {isApplicationScope ? "Alerting" : "Alerts"}
            <DocumentationLinkBadge
              href={
                isApplicationScope
                  ? PkiDocsUrls.applications.alerting.overview
                  : PkiDocsUrls.settings.alerts
              }
            />
          </CardTitle>
          <CardDescription>
            {isApplicationScope
              ? "Get notified about certificate events."
              : "Get notified about certificate events anywhere in Certificate Manager, inside or outside an application."}
          </CardDescription>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip surfaces on keyboard focus despite the inner button being disabled */}
                <span tabIndex={0}>
                  <Button
                    variant="outline"
                    onClick={() => setAlertModal({ isOpen: true })}
                    isDisabled={!canCreate}
                  >
                    <PlusIcon />
                    Create Alert
                  </Button>
                </span>
              </TooltipTrigger>
              {!canCreate && (
                <TooltipContent side="left">
                  You don&apos;t have permission to create alerts
                </TooltipContent>
              )}
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isAlertsLoading && alerts.length === 0 ? (
            <Empty className="border">
              <EmptyMedia variant="icon">
                <BellIcon />
              </EmptyMedia>
              <EmptyDescription>
                {isApplicationScope
                  ? "No alerts configured. Create one to get notified about certificate events for this application."
                  : "No alerts configured. Create one to get notified about certificate events across Certificate Manager."}
              </EmptyDescription>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Alert Type</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  {!isApplicationScope && (
                    <TableHead className="whitespace-nowrap">Filters</TableHead>
                  )}
                  <TableHead className="whitespace-nowrap">Alert Before</TableHead>
                  <TableHead className="whitespace-nowrap">Last Run</TableHead>
                  <TableHead className="w-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAlertsLoading &&
                  Array.from({ length: 3 }, (_, idx) => (
                    <TableRow key={`alert-skeleton-${idx + 1}`}>
                      {Array.from({ length: isApplicationScope ? 6 : 7 }, (__, cellIdx) => (
                        <TableCell key={`alert-skeleton-cell-${cellIdx + 1}`}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isAlertsLoading &&
                  alerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      onView={() =>
                        setAlertModal({ isOpen: true, alertId: a.id, isReadOnly: true })
                      }
                      onEdit={() => setAlertModal({ isOpen: true, alertId: a.id })}
                      onDelete={() =>
                        setDeleteAlertModal({ isOpen: true, alertId: a.id, name: a.name })
                      }
                      canEdit={canEdit}
                      canDelete={canDelete}
                      scopeNames={isApplicationScope ? undefined : scopeNames}
                    />
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <CertificateAlertSheet
        isOpen={alertModal.isOpen}
        onOpenChange={(isOpen) => setAlertModal({ isOpen, alertId: undefined })}
        projectId={projectId}
        scope={scope}
        alert={alerts.find((a) => a.id === alertModal.alertId)}
        isReadOnly={alertModal.isReadOnly}
      />
      <DeleteConfirmDialog
        isOpen={deleteAlertModal.isOpen}
        confirmKey="delete"
        title={`Delete Alert "${deleteAlertModal.name ?? ""}"?`}
        onOpenChange={(isOpen) =>
          setDeleteAlertModal({ isOpen, alertId: undefined, name: undefined })
        }
        onConfirm={handleDeleteAlert}
      />
    </>
  );
};
