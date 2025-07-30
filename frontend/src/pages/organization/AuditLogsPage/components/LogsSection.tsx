import { useEffect, useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ms from "ms";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { Timezone } from "@app/helpers/datetime";
import { withPermission } from "@app/hoc";
import { Workspace } from "@app/hooks/api/workspace/types";
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
  project?: Workspace;
};

export const LogsSection = withPermission(
  ({ presets, refetchInterval, showFilters = true, pageView = false, project }: Props) => {
    const { subscription } = useSubscription();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
    const [logFilter, setLogFilter] = useState<TAuditLogFilterFormData>({
      eventType: presets?.eventType || [],
      actor: presets?.actorId
    });
    const [timezone, setTimezone] = useState<Timezone>(Timezone.Local);

    const [dateFilter, setDateFilter] = useState<TAuditLogDateFilterFormData>({
      startDate: new Date(Number(new Date()) - ms("1h")),
      endDate: new Date(),
      type: AuditLogDateFilterType.Relative,
      relativeModeValue: "1h"
    });

    useEffect(() => {
      if (subscription && !subscription.auditLogs) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    if (pageView)
      return (
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-y-2">
            <div>
              <div className="flex items-center gap-1 whitespace-nowrap">
                <p className="text-xl font-semibold text-mineshaft-100">Audit History</p>
                <a
                  href="https://infisical.com/docs/documentation/platform/audit-logs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="ml-1 mt-[0.1rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                    <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                    <span>Docs</span>
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.07rem] ml-1.5 text-[10px]"
                    />
                  </div>
                </a>
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
              text="You can use audit logs if you switch to a paid Infisical plan."
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
            projectId: logFilter?.project?.id,
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
          text="You can use audit logs if you switch to a paid Infisical plan."
        />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.AuditLogs }
);
