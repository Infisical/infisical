import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { yupResolver } from "@hookform/resolvers/yup";

import { UpgradePlanModal } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { usePopUp } from "@app/hooks/usePopUp";

import { LogsFilter } from "./LogsFilter";
import { LogsTable } from "./LogsTable";
import { AuditLogFilterFormData, auditLogFilterFormSchema } from "./types";

type Props = {
  presetActor?: string;
  showFilters?: boolean;
  filterClassName?: string;
  isOrgAuditLogs?: boolean;
};

export const LogsSection = ({
  presetActor,
  filterClassName,
  isOrgAuditLogs,
  showFilters
}: Props) => {
  const { subscription } = useSubscription();
  const router = useRouter();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const { control, reset, watch } = useForm<AuditLogFilterFormData>({
    resolver: yupResolver(auditLogFilterFormSchema),
    defaultValues: {
      actor: presetActor,
      page: 1,
      perPage: 10,
      startDate: new Date(new Date().setDate(new Date().getDate() - 1)), // day before today
      endDate: new Date(new Date(Date.now()).setHours(23, 59, 59, 999)) // end of today
    }
  });

  useEffect(() => {
    if (subscription && !subscription.auditLogs) {
      handlePopUpOpen("upgradePlan");
    }
  }, [subscription]);

  const eventType = watch("eventType") as EventType | undefined;
  const userAgentType = watch("userAgentType") as UserAgentType | undefined;
  const actor = watch("actor");

  const startDate = watch("startDate");
  const endDate = watch("endDate");

  return (
    <div>
      {showFilters && (
        <LogsFilter
          className={filterClassName}
          presetActor={presetActor}
          control={control}
          reset={reset}
        />
      )}
      <LogsTable
        isOrgAuditLogs={isOrgAuditLogs}
        eventType={eventType}
        userAgentType={userAgentType}
        showActorColumn={!presetActor}
        actor={actor}
        startDate={startDate}
        endDate={endDate}
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
