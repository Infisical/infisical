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
  CertificateAlertEventType,
  MAX_CERTIFICATE_ALERT_FILTER_IDS,
  TAlert,
  useDeleteAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { PkiDocsUrls } from "../../pki-docs-urls";
import {
  fromAlertEventType,
  getAlertResourceId,
  getAlertResourceType
} from "./certificate-alert-fns";
import { formatAlertBefore } from "./certificate-alert-schema";
import { CertificateAlertSheet } from "./CertificateAlertSheet";
import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CERTIFICATE_FILTER_DEFINITIONS,
  CertificateAlertScopeKind,
  TCertificateAlertScope
} from "./types";
import { useCertificateFilterNames } from "./useCertificateFilterNames";

type TFilterNames = ReturnType<typeof useCertificateFilterNames>;

const SCOPE_CARD_CONFIG: Record<
  CertificateAlertScopeKind,
  { description: string; emptyDescription: string; docsUrl: string; hasFiltersColumn: boolean }
> = {
  [CertificateAlertScopeKind.Application]: {
    description: "Get notified about certificate events.",
    emptyDescription:
      "No alerts configured. Create one to get notified about certificate events for this application.",
    docsUrl: PkiDocsUrls.applications.alerting.overview,
    hasFiltersColumn: false
  },
  [CertificateAlertScopeKind.CertificateManager]: {
    description:
      "Get notified about certificate events anywhere in Certificate Manager, inside or outside an application.",
    emptyDescription:
      "No alerts configured. Create one to get notified about certificate events across Certificate Manager.",
    docsUrl: PkiDocsUrls.settings.alerts,
    hasFiltersColumn: true
  }
};

const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const AlertFiltersSummary = ({
  alert,
  filterNames
}: {
  alert: TAlert;
  filterNames: TFilterNames;
}) => {
  const applicationIds = alert.condition?.applicationIds ?? [];
  const profileIds = alert.condition?.profileIds ?? [];

  if (!applicationIds.length && !profileIds.length) {
    return <span className="text-muted">All certificates</span>;
  }

  const summary = [
    applicationIds.length ? pluralize(applicationIds.length, "application") : null,
    profileIds.length ? pluralize(profileIds.length, "certificate profile") : null
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
            <span className="text-muted">
              {CERTIFICATE_FILTER_DEFINITIONS.applicationIds.label}:{" "}
            </span>
            {applicationIds.map(filterNames.getApplicationName).join(", ")}
          </span>
        )}
        {profileIds.length > 0 && (
          <span>
            <span className="text-muted">{CERTIFICATE_FILTER_DEFINITIONS.profileIds.label}: </span>
            {profileIds.map(filterNames.getProfileName).join(", ")}
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
  scope: TCertificateAlertScope;
  filterNames: TFilterNames;
};

const AlertRow = ({
  alert,
  onView,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  scope,
  filterNames
}: AlertRowProps) => {
  const eventType = fromAlertEventType(scope, alert.eventType);
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
        {eventType ? CERTIFICATE_ALERT_EVENT_LABELS[eventType] : alert.eventType}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      {SCOPE_CARD_CONFIG[scope.kind].hasFiltersColumn && (
        <TableCell className="whitespace-nowrap">
          <AlertFiltersSummary alert={alert} filterNames={filterNames} />
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap text-accent">
        {alert.condition?.alertBefore ? (
          formatAlertBefore(alert.condition.alertBefore)
        ) : (
          <span className="text-surface-selected">—</span>
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
  const { data: alerts = [], isLoading: isAlertsLoading } = useListAlerts({
    resourceType: getAlertResourceType(scope),
    projectId,
    ...(resourceId ? { resourceId } : {})
  });
  const filterIds = useMemo(() => {
    const applicationIds = new Set<string>();
    const profileIds = new Set<string>();
    if (config.hasFiltersColumn) {
      alerts.forEach((alert) => {
        alert.condition?.applicationIds?.forEach((id) => applicationIds.add(id));
        alert.condition?.profileIds?.forEach((id) => profileIds.add(id));
      });
    }
    return {
      applicationIds: [...applicationIds].slice(0, MAX_CERTIFICATE_ALERT_FILTER_IDS),
      profileIds: [...profileIds].slice(0, MAX_CERTIFICATE_ALERT_FILTER_IDS)
    };
  }, [alerts, config.hasFiltersColumn]);
  const filterNames = useCertificateFilterNames(filterIds);
  const usedEventTypes =
    scope.kind === CertificateAlertScopeKind.Application
      ? alerts
          .map((alert) => fromAlertEventType(scope, alert.eventType))
          .filter((eventType): eventType is CertificateAlertEventType => Boolean(eventType))
      : [];
  const hasAllEventTypes = Object.values(CertificateAlertEventType).every((eventType) =>
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
          <CardDescription>{config.description}</CardDescription>
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
                  You don&apos;t have permission to create alerts
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
          {!isAlertsLoading && alerts.length === 0 ? (
            <Empty className="border">
              <EmptyMedia variant="icon">
                <BellIcon />
              </EmptyMedia>
              <EmptyDescription>{config.emptyDescription}</EmptyDescription>
            </Empty>
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
                      filterNames={filterNames}
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
        onOpenChange={(isOpen) =>
          setDeleteAlertModal({ isOpen, alertId: undefined, name: undefined })
        }
        onConfirm={handleDeleteAlert}
      />
    </>
  );
};
