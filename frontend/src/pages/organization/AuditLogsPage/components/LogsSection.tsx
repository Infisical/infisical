import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { withPermission } from "@app/hoc";
import { useDebounce } from "@app/hooks";
import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { usePopUp } from "@app/hooks/usePopUp";

import { LogsFilter } from "./LogsFilter";
import { LogsTable, TAuditLogTableHeader } from "./LogsTable";
import { AuditLogFilterFormData, auditLogFilterFormSchema } from "./types";

type Props = {
  presets?: {
    actorId?: string;
    eventType?: EventType[];
    actorType?: ActorType;
    startDate?: Date;
    endDate?: Date;
    eventMetadata?: Record<string, string>;
  };

  showFilters?: boolean;
  filterClassName?: string;
  isOrgAuditLogs?: boolean;
  showActorColumn?: boolean;
  remappedHeaders?: Partial<Record<TAuditLogTableHeader, string>>;
  refetchInterval?: number;
};

export const LogsSection = withPermission(
  ({
    presets,
    filterClassName,
    remappedHeaders,
    isOrgAuditLogs,
    showActorColumn,
    refetchInterval,
    showFilters
  }: Props) => {
    const { subscription } = useSubscription();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

    const { control, reset, watch, setValue } = useForm<AuditLogFilterFormData>({
      resolver: zodResolver(auditLogFilterFormSchema),
      defaultValues: {
        project: null,
        actor: presets?.actorId,
        eventType: presets?.eventType || [],
        page: 1,
        perPage: 10,
        startDate: presets?.startDate ?? new Date(new Date().setDate(new Date().getDate() - 1)), // day before today
        endDate: presets?.endDate ?? new Date(new Date(Date.now()).setHours(23, 59, 59, 999)) // end of today
      }
    });

    useEffect(() => {
      if (subscription && !subscription.auditLogs) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    const eventType = watch("eventType") as EventType[] | undefined;
    const userAgentType = watch("userAgentType") as UserAgentType | undefined;
    const actor = watch("actor");
    const projectId = watch("project")?.id;
    const secretPath = watch("secretPath");

    const startDate = watch("startDate");
    const endDate = watch("endDate");

    const [debouncedSecretPath] = useDebounce<string>(secretPath!, 500);

    return (
      <div>
        {showFilters && (
          <LogsFilter
            isOrgAuditLogs
            className={filterClassName}
            presets={presets}
            control={control}
            setValue={setValue}
            watch={watch}
            reset={reset}
          />
        )}
        <LogsTable
          refetchInterval={refetchInterval}
          remappedHeaders={remappedHeaders}
          isOrgAuditLogs={isOrgAuditLogs}
          showActorColumn={!!showActorColumn}
          filter={{
            secretPath: debouncedSecretPath || undefined,
            eventMetadata: presets?.eventMetadata,
            projectId,
            actorType: presets?.actorType,
            limit: 15,
            eventType,
            userAgentType,
            startDate,
            endDate,
            actor
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
