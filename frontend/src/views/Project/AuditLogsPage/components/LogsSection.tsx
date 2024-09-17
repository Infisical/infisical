import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";

import { UpgradePlanModal } from "@app/components/v2";
import { useSubscription } from "@app/context";
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

export const LogsSection = ({
  presets,
  filterClassName,
  remappedHeaders,
  isOrgAuditLogs,
  showActorColumn,
  refetchInterval,
  showFilters
}: Props) => {
  const { subscription } = useSubscription();
  const router = useRouter();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { control, reset, watch } = useForm<AuditLogFilterFormData>({
    resolver: yupResolver(auditLogFilterFormSchema),
    defaultValues: {
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

  const startDate = watch("startDate");
  const endDate = watch("endDate");

  return (
    <div>
      {showFilters && (
        <LogsFilter
          className={filterClassName}
          presets={presets}
          control={control}
          watch={watch}
          reset={reset}
        />
      )}
      <LogsTable
        refetchInterval={refetchInterval}
        remappedHeaders={remappedHeaders}
        isOrgAuditLogs={isOrgAuditLogs}
        showActorColumn={!!showActorColumn && !isOrgAuditLogs}
        filter={{
          eventMetadata: presets?.eventMetadata,
          actorType: presets?.actorType,
          limit: 15,
          eventType,
          userAgentType,
          startDate,
          endDate,
          actorId: actor
        }}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            router.back();
            return;
          }

          handlePopUpToggle("upgradePlan", isOpen);
        }}
        text="You can use audit logs if you switch to a paid Infisical plan."
      />
    </div>
  );
};
