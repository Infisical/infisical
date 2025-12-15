import { useEffect, useState } from "react";
import ms from "ms";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  OrgPermissionAuditLogsActions,
  OrgPermissionSubjects,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
import { Timezone } from "@app/helpers/datetime";
import { withPermission, withProjectPermission } from "@app/hoc";
import { Project } from "@app/hooks/api/projects/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { LogsDateFilter } from "./LogsDateFilter";
import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import {
  AuditLogDateFilterType,
  Presets,
  TAuditLogDateFilterFormData,
  TAuditLogFilterFormData
} from "./types";

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
  const [logFilter, setLogFilter] = useState<TAuditLogFilterFormData>({
    eventType: presets?.eventType || [],
    actor: presets?.actorId,
    eventMetadata: presets?.eventMetadata
  });
  const [timezone, setTimezone] = useState<Timezone>(Timezone.Local);

  const [dateFilter, setDateFilter] = useState<TAuditLogDateFilterFormData>(
    presets?.endDate || presets?.startDate
      ? {
          type: AuditLogDateFilterType.Absolute,
          startDate: presets?.startDate || new Date(Number(new Date()) - ms("1h")),
          endDate: presets?.endDate || new Date()
        }
      : {
          startDate: new Date(Number(new Date()) - ms("1h")),
          endDate: new Date(),
          type: AuditLogDateFilterType.Relative,
          relativeModeValue: "1h"
        }
  );

  useEffect(() => {
    if (subscription && !subscription.get(SubscriptionProductCategory.Platform, "auditLogs")) {
      handlePopUpOpen("upgradePlan");
    }
  }, [subscription]);

  if (pageView)
    return (
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
          <div>
            <div className="flex items-center gap-x-2 whitespace-nowrap">
              <p className="text-xl font-medium text-mineshaft-100">Audit History</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/audit-logs" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {showFilters && (
              <LogsDateFilter
                filter={dateFilter}
                setFilter={setDateFilter}
                timezone={timezone}
                setTimezone={setTimezone}
              />
            )}
            {showFilters && (
              <LogsFilter
                project={project}
                presets={presets}
                setFilter={setLogFilter}
                filter={logFilter}
              />
            )}
          </div>
        </div>
        <div className="space-y-2">
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
              startDate: dateFilter?.startDate,
              endDate: dateFilter?.endDate,
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
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {showFilters && (
          <LogsDateFilter
            filter={dateFilter}
            setFilter={setDateFilter}
            timezone={timezone}
            setTimezone={setTimezone}
          />
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
          startDate: dateFilter?.startDate,
          endDate: dateFilter?.endDate,
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
