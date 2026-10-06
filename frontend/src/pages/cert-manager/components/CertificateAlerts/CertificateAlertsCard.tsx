import { useState } from "react";
import {
  AlertTriangleIcon,
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
  Alert,
  AlertDescription,
  AlertTitle,
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
  CertificateAlertResourceType,
  TAlert,
  TCertificateAlertEventType,
  useDeleteAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { PkiDocsUrls } from "../../pki-docs-urls";
import { CertificateAlertSheet } from "./CertificateAlertSheet";
import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CERTIFICATE_FILTER_DEFINITIONS,
  CertificateAlertScopeKind,
  CertificateFilterKind,
  formatAlertBefore,
  fromApiEventType,
  getAlertResourceId,
  getFilterName,
  getScopeEventTypes,
  isFilterableEventType,
  pluralize,
  TCertificateAlertScope,
  toConditionNames
} from "./types";

const SCOPE_CARD_CONFIG: Record<
  CertificateAlertScopeKind,
  { emptyDescription: string; docsUrl: string; hasFiltersColumn: boolean }
> = {
  [CertificateAlertScopeKind.Application]: {
    emptyDescription:
      "No alerts configured. Create one to get notified about certificate events for this application.",
    docsUrl: PkiDocsUrls.applications.alerting.overview,
    hasFiltersColumn: false
  },
  [CertificateAlertScopeKind.CertificateManager]: {
    emptyDescription:
      "No alerts configured. Create one to get notified about certificate events across Certificate Manager.",
    docsUrl: PkiDocsUrls.settings.alerts,
    hasFiltersColumn: true
  }
};

const AlertFiltersSummary = ({ alert }: { alert: TAlert }) => {
  const conditionNames = toConditionNames(alert);
  const activeFilters = Object.values(CertificateFilterKind).flatMap((kind) => {
    const ids: string[] = alert.condition?.[kind] ?? [];
    return ids.length ? [{ kind, ids }] : [];
  });

  if (!isFilterableEventType(alert.eventType as TCertificateAlertEventType)) {
    return <span className="text-muted">All signers</span>;
  }

  if (!activeFilters.length) {
    return <span className="text-muted">All certificates</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-accent">
          {activeFilters
            .map(({ kind, ids }) =>
              pluralize(ids.length, CERTIFICATE_FILTER_DEFINITIONS[kind].noun)
            )
            .join(", ")}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex max-w-sm flex-col gap-1">
        {activeFilters.map(({ kind, ids }) => (
          <span key={kind}>
            <span className="text-muted">{CERTIFICATE_FILTER_DEFINITIONS[kind].label}: </span>
            {ids.map((id) => getFilterName(kind, id, conditionNames)).join(", ")}
          </span>
        ))}
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
  scope: TCertificateAlertScope;
};

const AlertRow = ({
  alert,
  onView,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  scope
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
        {CERTIFICATE_ALERT_EVENT_LABELS[alert.eventType as TCertificateAlertEventType] ??
          alert.eventType}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      {SCOPE_CARD_CONFIG[scope.kind].hasFiltersColumn && (
        <TableCell className="whitespace-nowrap">
          <AlertFiltersSummary alert={alert} />
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap text-accent">
        {alert.condition?.alertBefore ? (
          formatAlertBefore(alert.condition.alertBefore)
        ) : (
          <span className="text-surface-selected">-</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {alert.lastRun ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={LAST_RUN_BADGES[alert.lastRun.status].variant}>
                {LAST_RUN_BADGES[alert.lastRun.status].label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="text-xs text-label">
                {new Date(alert.lastRun.timestamp)
                  .toISOString()
                  .replace("T", " ")
                  .replace("Z", " UTC")}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-surface-selected">-</span>
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
  const config = SCOPE_CARD_CONFIG[scope.kind];
  const columns = [
    { label: "Name", className: "w-1/3" },
    { label: "Alert Type", className: "whitespace-nowrap" },
    { label: "Status", className: "whitespace-nowrap" },
    ...(config.hasFiltersColumn ? [{ label: "Filters", className: "whitespace-nowrap" }] : []),
    { label: "Alert Before", className: "whitespace-nowrap" },
    { label: "Last Run", className: "whitespace-nowrap" },
    { label: "Actions", className: "w-5 text-right" }
  ];
  const resourceId = getAlertResourceId(scope);
  const {
    data: certificateAlerts = [],
    isLoading: isCertificateAlertsLoading,
    isError: isCertificateAlertsError
  } = useListAlerts({
    resourceType:
      scope.kind === CertificateAlertScopeKind.CertificateManager
        ? CertificateAlertResourceType.CertificateManager
        : CertificateAlertResourceType.Application,
    projectId,
    ...(resourceId ? { resourceId } : {})
  });
  const {
    data: signerAlerts = [],
    isLoading: isSignerAlertsLoading,
    isError: isSignerAlertsError
  } = useListAlerts(
    { resourceType: CertificateAlertResourceType.Signer, projectId },
    { enabled: scope.kind === CertificateAlertScopeKind.CertificateManager }
  );
  const alerts = (
    scope.kind === CertificateAlertScopeKind.CertificateManager
      ? [...certificateAlerts, ...signerAlerts]
      : certificateAlerts
  ).map((alert) => ({ ...alert, eventType: fromApiEventType(alert.eventType) }));
  const isAlertsLoading =
    isCertificateAlertsLoading ||
    (scope.kind === CertificateAlertScopeKind.CertificateManager && isSignerAlertsLoading);
  const isAlertsError =
    isCertificateAlertsError ||
    (scope.kind === CertificateAlertScopeKind.CertificateManager && isSignerAlertsError);
  const usedEventTypes =
    scope.kind === CertificateAlertScopeKind.Application
      ? alerts.map((alert) => alert.eventType as TCertificateAlertEventType)
      : [];
  const creatableEventTypes = getScopeEventTypes(scope);
  const hasAllEventTypes = creatableEventTypes.every((eventType) =>
    usedEventTypes.includes(eventType)
  );
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
            Alerts
            <DocumentationLinkBadge href={config.docsUrl} />
          </CardTitle>
          <CardDescription>Get notified about certificate events.</CardDescription>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip surfaces on keyboard focus despite the inner button being disabled */}
                <span tabIndex={0}>
                  <Button
                    variant="outline"
                    onClick={() => setAlertModal({ isOpen: true })}
                    isDisabled={!canCreate || hasAllEventTypes}
                  >
                    <PlusIcon />
                    Create Alert
                  </Button>
                </span>
              </TooltipTrigger>
              {!canCreate && (
                <TooltipContent side="left">
                  {scope.kind === CertificateAlertScopeKind.CertificateManager
                    ? "Only Certificate Manager admins can create these alerts"
                    : "You don't have permission to create alerts"}
                </TooltipContent>
              )}
              {canCreate && hasAllEventTypes && (
                <TooltipContent side="left">
                  This application already has an alert for every alert type
                </TooltipContent>
              )}
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isAlertsError && (
            <Alert variant="warning" className="mb-4">
              <AlertTriangleIcon />
              <AlertTitle>Some alerts could not be loaded</AlertTitle>
              <AlertDescription>
                Reload the page to try again. Alerts that failed to load aren&apos;t listed below.
              </AlertDescription>
            </Alert>
          )}
          {!isAlertsLoading && alerts.length === 0 ? (
            !isAlertsError && (
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyDescription>{config.emptyDescription}</EmptyDescription>
              </Empty>
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.label} className={column.className}>
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAlertsLoading &&
                  Array.from({ length: 3 }, (_, idx) => (
                    <TableRow key={`alert-skeleton-${idx + 1}`}>
                      {columns.map((column) => (
                        <TableCell key={column.label}>
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
                      scope={scope}
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
        usedEventTypes={usedEventTypes}
      />
      <DeleteConfirmDialog
        isOpen={deleteAlertModal.isOpen}
        confirmKey="delete"
        title={`Delete Alert "${deleteAlertModal.name ?? ""}"?`}
        description="The alert and its notification channels are deleted, and it stops sending notifications."
        onOpenChange={(isOpen) =>
          setDeleteAlertModal({ isOpen, alertId: undefined, name: undefined })
        }
        onConfirm={handleDeleteAlert}
      />
    </>
  );
};
