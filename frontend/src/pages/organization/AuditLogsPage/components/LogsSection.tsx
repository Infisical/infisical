import { useEffect, useMemo, useState } from "react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Alert,
  AlertDescription,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DateRangeFilter,
  type DateRangeFilterResult,
  DateRangeFilterType,
  DateRangeQuickPresets,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
import { Timezone } from "@app/helpers/datetime";
import { isInfisicalCloud } from "@app/helpers/platform";
import { withPermission, withProjectPermission } from "@app/hoc";
import { useGetAuditLogPostgresStorageStatus } from "@app/hooks/api/auditLogs";
import { Project } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import {
  AppliedFilter,
  appliedFiltersToLogFilter,
  AuditSearchFilter,
  logFilterToAppliedFilters
} from "./AuditSearchFilter";
import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { Presets, TAuditLogFilterFormData } from "./types";

type Props = {
  presets?: Presets;
  refetchInterval?: number;
  showFilters?: boolean;
  pageView?: boolean;
  project?: Project;
};

const LogsSectionComponent = ({
  presets,
  refetchInterval,
  showFilters = true,
  pageView = false,
  project
}: Props) => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const { data: postgresStorageStatus } = useGetAuditLogPostgresStorageStatus();

  const AUDIT_LOG_ROW_WARNING_THRESHOLD = 350_000_000;
  const showClickHouseWarning =
    !isInfisicalCloud() &&
    postgresStorageStatus &&
    !postgresStorageStatus.clickHouseConfigured &&
    !postgresStorageStatus.auditLogStorageDisabled &&
    !postgresStorageStatus.auditLogGenerationDisabled &&
    postgresStorageStatus.auditLogRowCount >= AUDIT_LOG_ROW_WARNING_THRESHOLD;

  const [logFilter, setLogFilter] = useState<TAuditLogFilterFormData>({
    eventType: presets?.eventType || [],
    actor: presets?.actorId,
    eventMetadata: presets?.eventMetadata
  });
  const [searchFilters, setSearchFilters] = useState<AppliedFilter[]>(() =>
    logFilterToAppliedFilters({
      eventType: presets?.eventType,
      actorType: presets?.actorType
    })
  );

  const searchDerived = useMemo(() => appliedFiltersToLogFilter(searchFilters), [searchFilters]);

  const hasPresetDates = Boolean(presets?.startDate || presets?.endDate);
  const defaultCustomValue = hasPresetDates
    ? {
        type: DateRangeFilterType.Fixed as const,
        startDate: presets?.startDate ?? new Date(Date.now() - 60 * 60 * 1000),
        endDate: presets?.endDate ?? new Date()
      }
    : undefined;
  const [activePreset, setActivePreset] = useState<string>(hasPresetDates ? "" : "1h");
  const [dateRange, setDateRange] = useState<DateRangeFilterResult>({
    startDate: presets?.startDate ?? new Date(Date.now() - 60 * 60 * 1000),
    endDate: presets?.endDate ?? new Date(),
    isUtc: false
  });

  const timezone = dateRange.isUtc ? Timezone.UTC : Timezone.Local;
  const dateRangeAccent = project ? "primary" : "secondary";

  useEffect(() => {
    if (subscription && !subscription.auditLogs) {
      handlePopUpOpen("upgradePlan");
    }
  }, [subscription]);

  if (pageView)
    return (
      <Card>
        {showClickHouseWarning && (
          <Alert variant="warning">
            <AlertDescription>
              <p>
                Your audit log volume is growing. To keep searches fast and reduce database load, we
                recommend streaming logs to an{" "}
                <a
                  href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  external destination
                </a>{" "}
                like Splunk or using the built-in{" "}
                <a
                  href="https://infisical.com/docs/documentation/platform/audit-logs-clickhouse-setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  ClickHouse integration
                </a>
                .
              </p>
            </AlertDescription>
          </Alert>
        )}
        <CardHeader>
          <CardTitle>
            Audit History
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
          </CardTitle>
          <CardDescription>
            Search and review a detailed history of events{" "}
            {project ? "in this project" : "across your organization"}.
          </CardDescription>
          {showFilters && (
            <CardAction>
              <ButtonGroup>
                <DateRangeQuickPresets
                  value={activePreset}
                  onChange={(preset, result) => {
                    setActivePreset(preset);
                    setDateRange(result);
                  }}
                  accent={dateRangeAccent}
                />
                <DateRangeFilter
                  defaultValue={defaultCustomValue}
                  isActive={!activePreset}
                  onChange={(result) => {
                    setActivePreset("");
                    setDateRange(result);
                  }}
                  accent={dateRangeAccent}
                />
              </ButtonGroup>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showFilters && (
            <div>
              <AuditSearchFilter
                filters={searchFilters}
                onFiltersChange={setSearchFilters}
                hasProjectContext={Boolean(project)}
                projectId={project?.id}
              />
              {searchFilters.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {searchFilters.length} active filter{searchFilters.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          )}
          <LogsTable
            refetchInterval={refetchInterval}
            filter={{
              eventMetadata: logFilter?.eventMetadata,
              actor: searchDerived.actor || logFilter?.actor,
              projectId: project?.id || searchDerived.projectId || logFilter?.project?.id,
              actorType: searchDerived.actorType || presets?.actorType,
              eventType:
                searchDerived.eventType.length > 0 ? searchDerived.eventType : logFilter?.eventType,
              userAgentType: searchDerived.userAgentType || logFilter?.userAgentType,
              environment: searchDerived.environment || logFilter?.environment?.slug,
              secretPath: searchDerived.secretPath,
              secretKey: searchDerived.secretKey,
              startDate: dateRange.startDate,
              endDate: dateRange.endDate,
              limit: 15
            }}
            timezone={timezone}
          />
        </CardContent>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("upgradePlan", isOpen);
          }}
          text="Your current plan does not include access to audit logs. To unlock this feature, please upgrade to Infisical Pro plan."
        />
      </Card>
    );

  return (
    <div className="space-y-2">
      {showClickHouseWarning && (
        <Alert variant="warning">
          <AlertDescription>
            <p>
              Your audit log volume is growing. To keep searches fast and reduce database load, we
              recommend streaming logs to an{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:opacity-80"
              >
                external destination
              </a>{" "}
              like Splunk or using the built-in{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/audit-logs-clickhouse-setup"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:opacity-80"
              >
                ClickHouse integration
              </a>
              .
            </p>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {showFilters && (
          <ButtonGroup>
            <DateRangeQuickPresets
              value={activePreset}
              onChange={(preset, result) => {
                setActivePreset(preset);
                setDateRange(result);
              }}
              accent={dateRangeAccent}
            />
            <DateRangeFilter
              defaultValue={defaultCustomValue}
              isActive={!activePreset}
              onChange={(result) => {
                setActivePreset("");
                setDateRange(result);
              }}
              accent={dateRangeAccent}
            />
          </ButtonGroup>
        )}
        {showFilters && (
          <LogsFilter presets={presets} setFilter={setLogFilter} filter={logFilter} />
        )}
      </div>
      <LogsTable
        refetchInterval={refetchInterval}
        filter={{
          secretPath: logFilter.secretPath || undefined,
          secretKey: logFilter.secretKey || undefined,
          eventMetadata: logFilter?.eventMetadata,
          projectId: project?.id || logFilter?.project?.id,
          actorType: presets?.actorType,
          limit: 15,
          eventType: logFilter?.eventType,
          userAgentType: logFilter?.userAgentType,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          environment: logFilter?.environment?.slug,
          actor: logFilter?.actor
        }}
        timezone={timezone}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("upgradePlan", isOpen);
        }}
        text="Your current plan does not include access to audit logs. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </div>
  );
};

export const LogsSection = (props: Props) => {
  const { project } = props;

  if (project) {
    const ProjectLogsSectionWithPermission = withProjectPermission(LogsSectionComponent, {
      action: ProjectPermissionAuditLogsActions.Read,
      subject: ProjectPermissionSub.AuditLogs
    });
    return <ProjectLogsSectionWithPermission {...props} />;
  }

  const OrgLogsSectionWithPermission = withPermission(LogsSectionComponent, {
    action: OrgPermissionAuditLogsActions.Read,
    subject: OrgPermissionSubjects.AuditLogs
  });
  return <OrgLogsSectionWithPermission {...props} />;
};
