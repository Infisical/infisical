import { useEffect, useState } from "react";
import ms from "ms";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
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
};

export const LogsSection = withPermission(
  ({ presets, refetchInterval, showFilters = true }: Props) => {
    const { subscription } = useSubscription();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
    const [logFilter, setLogFilter] = useState<TAuditLogFilterFormData>({
      eventType: presets?.eventType || [],
      actor: presets?.actorId
    });
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
    return (
      <div className="space-y-2">
        <div className="flex w-full justify-end">
          {showFilters && <LogsDateFilter filter={dateFilter} setFilter={setDateFilter} />}
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
